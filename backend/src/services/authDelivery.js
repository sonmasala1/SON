import { sendTransactionalEmail, otpEmailTemplate, escapeEmailHtml } from './emailService.js';
import { httpError } from '../utils/httpError.js';
import { logEvent } from './logger.js';
export function developmentPreview(req) { return req.app.locals.config.nodeEnv !== 'production' && req.app.locals.config.authDevPreview && /(?:_demo(?:$|_)|_test_)/.test(req.app.locals.databaseName() || ''); }
export async function deliver(req, payload) {
  try {
    const source = await deliverInternal(req, payload);
    logEvent('INFO', 'otp.dispatch.succeeded', { source: source === 'TEST_TRANSPORT' ? 'TEST' : source }, req);
    return source;
  } catch (error) {
    req.logFailure = 'delivery_failed';
    logEvent('ERROR', 'otp.dispatch.failed', { source: payload.channel === 'email' ? 'BREVO' : payload.channel === 'whatsapp' ? 'WHATSAPP' : 'SMS', reason: 'delivery_failed' }, req);
    throw error;
  }
}
async function deliverInternal(req, { channel, contact, subject, text, authenticationCode }) {
  const config = req.app.locals.config;
  // Tests inject an in-memory sink; no test messages leave the process.
  if (config.deliveryAdapter && config.nodeEnv === 'test') { await config.deliveryAdapter({ channel, contact, subject, text }); return 'TEST_TRANSPORT'; }
  if (channel === 'email' && (config.emailProvider === 'brevo' && config.brevoApiKey || !developmentPreview(req))) {
    return sendTransactionalEmail(req, { to: contact, ...(authenticationCode ? otpEmailTemplate(authenticationCode) : { subject, textContent: text, htmlContent: `<p>${escapeEmailHtml(text)}</p>` }) });
  }
  if (['sms', 'whatsapp'].includes(channel) && config.twilioSid && config.twilioToken && (channel === 'sms' ? config.smsFrom || config.smsMessagingServiceSid : config.whatsappFrom)) {
    const prefix = channel === 'whatsapp' ? 'whatsapp:' : '';
    const body = new URLSearchParams({ To: `${prefix}${contact}` });
    if (channel === 'whatsapp' && authenticationCode) {
      if (!/^HX[a-f\d]{32}$/i.test(config.whatsappOtpContentSid || '')) throw httpError(503, 'WhatsApp verification is unavailable. Please choose SMS or try again later.');
      body.set('From', config.whatsappFrom); body.set('ContentSid', config.whatsappOtpContentSid); body.set('ContentVariables', JSON.stringify({ 1: authenticationCode }));
    } else {
      if (channel === 'sms' && config.smsMessagingServiceSid) body.set('MessagingServiceSid', config.smsMessagingServiceSid);
      else body.set('From', channel === 'sms' ? config.smsFrom : config.whatsappFrom);
      if (channel === 'sms' && authenticationCode && config.smsOtpTemplate && !config.smsOtpTemplate.includes('{{code}}')) throw httpError(503, 'SMS verification is unavailable. Please try again later.');
      const message = channel === 'sms' && authenticationCode && config.smsOtpTemplate ? config.smsOtpTemplate.replaceAll('{{code}}', authenticationCode) : text;
      body.set('Body', message);
    }
    const providerFetch = config.nodeEnv === 'test' && config.providerFetch ? config.providerFetch : fetch;
    const response = await providerFetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioSid)}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${config.twilioSid}:${config.twilioToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(15000) }).catch(() => null);
    const accepted = response?.ok ? await response.json().catch(() => null) : null;
    if (!accepted?.sid || ['failed', 'undelivered', 'canceled'].includes(accepted.status) || accepted.error_code) throw httpError(503, `${channel === 'sms' ? 'SMS' : 'WhatsApp'} delivery is unavailable. Please try again later.`);
    return channel === 'sms' ? 'SMS' : 'WHATSAPP';
  }
  if (developmentPreview(req)) return 'DEVELOPMENT_PREVIEW';
  throw httpError(503, 'This verification channel has not been configured. Please contact support.');
}
