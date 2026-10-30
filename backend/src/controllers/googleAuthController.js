import { z } from 'zod';
import { parse } from '../validators/commerce.js';
import { GOOGLE_FLOW_COOKIE, googleFlowCookie, customerReturnTo, beginGoogleLogin, consumeGoogleFlow, verifyGoogleCode, signInGoogleCustomer } from '../services/googleAuthService.js';
import { sendCustomerSession } from '../services/customerSessionService.js';
import { logEvent } from '../services/logger.js';

export async function startGoogleLogin(req, res, next) {
  try {
    const input = parse(z.object({ returnTo: z.string().max(2048).optional() }).strict(), req.body);
    if (req.user) return res.json({ success: true, authenticated: true, returnTo: customerReturnTo(input.returnTo) });
    const result = await beginGoogleLogin(req, input.returnTo);
    res.cookie(GOOGLE_FLOW_COOKIE, result.browserToken, googleFlowCookie(req));
    res.json({ success: true, authorizationUrl: result.authorizationUrl });
  } catch (error) { next(error); }
}
export async function googleLoginCallback(req, res) {
  let flow;
  const frontend = req.app.locals.config.webAuthnOrigin;
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  try {
    flow = await consumeGoogleFlow(req, req.query.state);
    res.clearCookie(GOOGLE_FLOW_COOKIE, googleFlowCookie(req, true));
    if (req.query.error) throw Object.assign(new Error('Google authorization was cancelled.'), { googleReason: 'cancelled' });
    // Another tab may already have completed a customer sign-in. Preserve that session without linking identities.
    if (req.user) return res.redirect(303, new URL(flow.returnTo, frontend).toString());
    const code = z.string().min(1).max(8192).safeParse(req.query.code);
    if (!code.success) throw new Error('Missing authorization code.');
    const identity = await verifyGoogleCode(req, code.data, flow);
    const result = await signInGoogleCustomer(req, identity);
    sendCustomerSession(req, res, result);
    res.redirect(303, new URL(flow.returnTo, frontend).toString());
  } catch (error) {
    req.logFailure = ['state', 'cancelled', 'account_link_required', 'account_unavailable'].includes(error.googleReason) ? error.googleReason : 'failed';
    logEvent('WARN', 'google.callback.failed', { reason: req.logFailure }, req);
    res.clearCookie(GOOGLE_FLOW_COOKIE, googleFlowCookie(req, true));
    const target = new URL('/login', frontend); target.searchParams.set('google_error', ['state', 'cancelled', 'account_link_required', 'account_unavailable'].includes(error.googleReason) ? error.googleReason : 'failed');
    if (req.requestId) target.searchParams.set('request_id', req.requestId);
    if (flow?.returnTo && flow.returnTo !== '/account') target.searchParams.set('next', customerReturnTo(flow.returnTo));
    res.redirect(303, target.toString());
  }
}
