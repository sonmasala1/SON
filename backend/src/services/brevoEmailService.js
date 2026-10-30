import { randomUUID } from 'node:crypto';
import { httpError } from '../utils/httpError.js';
import { logEvent } from './logger.js';

export const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const emailAddress = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const escapeEmailHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

export const SAFE_BREVO_CODES = new Set([
  'unauthorized', 'permission_denied', 'invalid_parameter', 'missing_parameter',
  'account_under_validation', 'not_enough_credits', 'rate_limited', 'bad_request',
  'method_not_allowed', 'document_not_found', 'reseller_permission_denied',
  'smtp_key_detected', 'server_error', 'unknown'
]);

export function validateBrevoApiKey(key) {
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) {
    return { valid: false, reason: 'configuration_missing', providerCode: 'invalid_format' };
  }
  if (key.trim().startsWith('xsmtpsib-')) {
    return { valid: false, reason: 'brevo_authentication', providerCode: 'smtp_key_detected' };
  }
  if (!key.trim().startsWith('xkeysib-')) {
    return { valid: false, reason: 'brevo_authentication', providerCode: 'invalid_api_key_format' };
  }
  return { valid: true };
}

export function otpEmailTemplate(code) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw httpError(422, 'A six-digit verification code is required.');
  return {
    subject: 'Your SON MASALA verification code',
    textContent: `Your SON MASALA verification code is ${code}.\n\nThis code expires in 5 minutes. Do not share it with anyone.\n\nIf you did not request this email, you can safely ignore it.\n\nSON MASALA — Har swaad mein apnapan.`,
    htmlContent: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f7f2e8;font-family:Arial,Helvetica,sans-serif;color:#203a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fffaf1;border:1px solid #e5dccc;border-radius:20px;overflow:hidden">
<tr><td style="padding:30px;background:#102f28;text-align:center"><h1 style="margin:0;color:#e4ca92;font-family:Georgia,serif;font-size:28px;letter-spacing:2px">SON MASALA</h1><p style="margin:10px 0 0;color:#e4ca92;font-size:14px">हर स्वाद में अपनापन</p></td></tr>
<tr><td style="padding:32px"><h2 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:400;font-size:26px">A warm welcome to your kitchen.</h2>
<p style="margin:0 0 24px;line-height:1.7;color:#655d4c">Use this code to securely create your account or sign in. It expires in <strong>5 minutes</strong>.</p>
<div style="padding:24px 12px;border:1px solid #d6c59f;border-radius:12px;background:#f5efdf;text-align:center"><p style="margin:0 0 10px;font-size:12px;letter-spacing:2px">VERIFICATION CODE</p><p style="margin:0;font-size:38px;letter-spacing:8px;font-weight:bold;color:#183f32">${code}</p></div>
<p style="margin:24px 0 10px;font-size:14px;line-height:1.7"><strong>Keep this code private.</strong> SON MASALA will never ask you to share it.</p><p style="margin:0;font-size:14px;line-height:1.7;color:#756d5b">If you did not request this email, you can safely ignore it.</p></td></tr>
<tr><td style="padding:22px;border-top:1px solid #e5dccc;text-align:center;color:#756d5b;font-size:12px">&copy; ${new Date().getFullYear()} SON MASALA. Made with care.</td></tr>
</table></td></tr></table></body></html>`,
  };
}

function retrySeconds(response) {
  const header = response.headers.get('Retry-After');
  let delay = Number(header || response.headers.get('x-sib-ratelimit-reset'));
  if (header && !Number.isFinite(delay)) delay = (Date.parse(header) - Date.now()) / 1000;
  return Number.isFinite(delay) ? Math.max(60, Math.min(86400, Math.ceil(delay))) : 60;
}

/** One HTTPS dispatch. Never retry an uncertain send or fall back to SMTP. */
export async function sendTransactionalEmail(req, { to, subject, textContent, htmlContent, dispatchId = randomUUID() }) {
  const config = req.app.locals.config;
  if (config.emailProvider !== 'brevo' || !emailAddress(config.brevoSenderEmail) || typeof config.brevoSenderName !== 'string' || !config.brevoSenderName.trim() || config.brevoSenderName.length > 100 || /[\r\n]/.test(config.brevoSenderName)) {
    req.logFailure = 'configuration_missing';
    logEvent('ERROR', 'email.api.failed', { source: 'BREVO', reason: 'configuration_missing' }, req);
    throw httpError(503, 'Email delivery is not configured. Please contact support.');
  }

  const keyCheck = validateBrevoApiKey(config.brevoApiKey);
  if (!keyCheck.valid) {
    req.logFailure = keyCheck.reason;
    logEvent('ERROR', 'email.api.failed', { source: 'BREVO', reason: keyCheck.reason, providerCode: keyCheck.providerCode }, req);
    if (keyCheck.providerCode === 'smtp_key_detected') {
      throw Object.assign(
        httpError(503, 'Email delivery is not configured correctly. A Brevo v3 API key (xkeysib-...) is required, not an SMTP key.'),
        { logReason: 'brevo_authentication', providerCode: 'smtp_key_detected' }
      );
    }
    throw httpError(503, 'Email delivery is not configured. Please contact support.');
  }

  if (!emailAddress(to)) throw httpError(422, 'Enter a valid email address.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(dispatchId)) throw httpError(422, 'Invalid email dispatch identifier.');
  const request = config.nodeEnv === 'test' && config.brevoFetch ? config.brevoFetch : fetch;
  const started = performance.now();
  logEvent('INFO', 'email.api.request', { source: 'BREVO' }, req);
  let response;
  try {
    response = await request(BREVO_EMAIL_URL, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'api-key': config.brevoApiKey },
      body: JSON.stringify({ sender: { email: config.brevoSenderEmail, name: config.brevoSenderName }, to: [{ email: to }], subject, textContent, htmlContent, headers: { idempotencyKey: dispatchId } }),
    });

    if (response.status === 201) {
      const accepted = await response.json().catch(() => null);
      if (typeof accepted?.messageId !== 'string' || !accepted.messageId.length || accepted.messageId.length > 512) {
        throw Object.assign(httpError(503, 'Email delivery could not be confirmed. Please wait before requesting a new code.'), { logReason: 'brevo_response_invalid' });
      }
      logEvent('INFO', 'email.api.accepted', { source: 'BREVO', status: response.status, durationMs: Math.round(performance.now() - started) }, req);
      return 'BREVO';
    }

    // Inspect Brevo error response body safely (never log raw secrets or user emails)
    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      // Non-JSON response body
    }

    const rawCode = typeof errorData?.code === 'string' ? errorData.code.toLowerCase().trim() : '';
    const rawMessage = typeof errorData?.message === 'string' ? errorData.message : '';
    const providerCode = SAFE_BREVO_CODES.has(rawCode)
      ? rawCode
      : (response.status === 401 ? 'unauthorized' : response.status === 403 ? 'permission_denied' : response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'server_error' : 'unknown');

    if (response.status === 429) {
      throw Object.assign(
        httpError(429, 'Email service is busy. Please wait before requesting a new code.'),
        { retryAfter: retrySeconds(response), logReason: 'brevo_rate_limited', providerCode }
      );
    }

    if (response.status === 401) {
      throw Object.assign(
        httpError(503, 'Email delivery is not configured correctly. Please contact support.'),
        { logReason: 'brevo_authentication', providerCode }
      );
    }

    if (response.status === 403) {
      if (/ip|address|network|whitelist/i.test(rawMessage)) {
        throw Object.assign(
          httpError(503, 'Email delivery is blocked by the Brevo network allowlist. Please contact support.'),
          { logReason: 'brevo_ip_restricted', providerCode }
        );
      }
      throw Object.assign(
        httpError(503, 'Email delivery is not authorized. Please contact support.'),
        { logReason: 'brevo_permission', providerCode }
      );
    }

    if (response.status === 400) {
      const isSender = /sender/i.test(rawMessage);
      throw Object.assign(
        httpError(503, isSender ? 'Email sender is not verified. Please contact support.' : 'Email delivery is unavailable. Please try again later.'),
        { logReason: isSender ? 'brevo_sender_invalid' : 'brevo_rejected', providerCode }
      );
    }

    throw Object.assign(
      httpError(503, 'Email delivery is unavailable. Please try again later.'),
      { logReason: response.status >= 500 ? 'brevo_unavailable' : 'brevo_rejected', providerCode }
    );
  } catch (error) {
    req.logFailure = error.logReason || (['TimeoutError', 'AbortError'].includes(error.name) ? 'brevo_timeout' : 'brevo_unavailable');
    logEvent(
      error.status === 429 ? 'WARN' : 'ERROR',
      'email.api.failed',
      {
        source: 'BREVO',
        reason: req.logFailure,
        status: response?.status,
        providerCode: error.providerCode,
        durationMs: Math.round(performance.now() - started)
      },
      req
    );
    if (error.expose) throw error;
    throw Object.assign(httpError(503, 'Email delivery could not be confirmed. Please wait before requesting a new code.'), { logReason: req.logFailure });
  }
}

export async function sendOtpEmail(req, { to, code, dispatchId }) {
  const template = otpEmailTemplate(code);
  const config = req.app.locals.config;
  if (config.nodeEnv === 'test' && config.emailDeliveryAdapter) {
    try { await config.emailDeliveryAdapter({ to, code }); logEvent('INFO', 'otp.dispatch.succeeded', { source: 'TEST' }, req); return 'BREVO'; }
    catch (error) { logEvent('ERROR', 'otp.dispatch.failed', { source: 'TEST', reason: 'delivery_failed' }, req); throw error; }
  }
  return sendTransactionalEmail(req, { to, ...template, dispatchId });
}
