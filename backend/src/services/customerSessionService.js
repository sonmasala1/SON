import { createHash, randomBytes } from 'node:crypto';
import User from '../models/User.js';
import { CustomerSession } from '../models/customerAuthentication.js';
import { httpError } from '../utils/httpError.js';
import { logEvent } from './logger.js';

export const CUSTOMER_COOKIE = 'son_customer_session';
export const CUSTOMER_IDLE_MS = 24 * 60 * 60 * 1000;
export const CUSTOMER_MAX_MS = 24 * 60 * 60 * 1000;
export const customerNow = req => req.app.locals.config.clock?.() ?? Date.now();
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const customerCookie = (req, maxAge) => ({ httpOnly: true, secure: req.app.locals.config.nodeEnv === 'production', sameSite: req.app.locals.config.crossSiteCookies ? 'none' : 'lax', path: '/', ...(maxAge === undefined ? {} : { maxAge }) });
export const publicCustomer = user => user ? { id: user.id, name: user.name, fullName: user.name, email: user.email, phone: user.phone, phoneVerified: Boolean(user.phoneVerified), emailVerified: Boolean(user.emailVerified), verificationSource: user.phoneVerificationSource, role: 'CUSTOMER', lastLoginAt: user.lastLoginAt } : null;

export async function createCustomerSession(req, user, verificationSource, session) {
  const now = customerNow(req), token = randomBytes(32).toString('base64url');
  if (req.customerSession) await CustomerSession.updateOne({ _id: req.customerSession._id }, { revokedAt: new Date(now) }, { session });
  const [record] = await CustomerSession.create([{ userId: user._id, tokenHash: tokenHash(token), verificationSource, lastSeenAt: new Date(now), expiresAt: new Date(now + CUSTOMER_IDLE_MS), absoluteExpiresAt: new Date(now + CUSTOMER_MAX_MS), userAgent: String(req.get('user-agent') || '').slice(0, 240) }], { session });
  return { record, token };
}
export function sendCustomerSession(req, res, result) {
  logEvent('INFO', 'customer.authentication.succeeded', { source: result.record.verificationSource, authAction: req.customerAuthAction || 'login' }, req);
  res.cookie(CUSTOMER_COOKIE, result.token, customerCookie(req, result.record.expiresAt.getTime() - customerNow(req)));
  res.clearCookie('son_session', customerCookie(req));
}
export async function readCustomerSession(req, res) {
  const token = req.cookies[CUSTOMER_COOKIE];
  // Legacy unrevocable JWT cookies do not establish a session after this migration.
  if (req.cookies.son_session) res.clearCookie('son_session', customerCookie(req));
  if (!token) return;
  const clear = (reason = 'session_expired_or_revoked') => { logEvent('WARN', 'customer.session.rejected', { reason }, req); return res.clearCookie(CUSTOMER_COOKIE, customerCookie(req)); };
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { clear('session_invalid'); return; }
  const now = customerNow(req);
  const record = await CustomerSession.findOne({ tokenHash: tokenHash(token), revokedAt: null, expiresAt: { $gt: new Date(now) }, absoluteExpiresAt: { $gt: new Date(now) } });
  if (!record || (req.app.locals.config.nodeEnv === 'production' && record.verificationSource === 'DEVELOPMENT_PREVIEW')) { clear(); return; }
  const user = await User.findOne({ _id: record.userId, accountStatus: { $nin: ['SUSPENDED', 'DELETED'] } });
  if (!user) { clear('account_unavailable'); return; }
  req.user = user; req.customerSession = record;
  if (now - record.lastSeenAt.getTime() >= 5 * 60000) {
    const expiresAt = new Date(Math.min(now + CUSTOMER_IDLE_MS, record.absoluteExpiresAt.getTime()));
    const renewed = await CustomerSession.updateOne({ _id: record._id, revokedAt: null, expiresAt: { $gt: new Date(now) }, absoluteExpiresAt: { $gt: new Date(now) } }, { $max: { lastSeenAt: new Date(now) }, $set: { expiresAt } });
    if (!renewed.matchedCount) { delete req.user; delete req.customerSession; clear('session_renewal_failed'); return; }
    res.cookie(CUSTOMER_COOKIE, token, customerCookie(req, expiresAt.getTime() - now));
  }
}
export function customerOrigin(req, _res, next) {
  if (!req.app.locals.allowedOrigins.includes(req.get('origin'))) return next(Object.assign(httpError(403, 'Please submit this request from the SON MASALA website.'), { logReason: 'csrf_origin_rejected' }));
  next();
}
