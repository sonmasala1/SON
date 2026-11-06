import { AdminAccount, AdminSession } from '../models/administration.js';
import { digest, keyedDigest, equals } from '../services/staffCrypto.js';
import { securityNow, audit } from '../services/staffAudit.js';
import { httpError } from '../utils/httpError.js';
import { allPermissions } from '../config/permissions.js';
import { logEvent } from '../services/logger.js';

export function staffCookie(req, realm, clear = false) { return { httpOnly: true, secure: req.app.locals.config.nodeEnv === 'production', sameSite: req.app.locals.config.crossSiteCookies ? 'none' : 'strict', path: '/api/v1', ...(clear ? {} : { maxAge: realm === 'owner' ? 4 * 3600000 : 8 * 3600000 }) }; }
export function staffOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!origin || !req.app.locals.allowedOrigins.includes(origin))) return next(Object.assign(httpError(403, 'The request origin is not allowed.'), { logReason: 'csrf_origin_rejected' }));
  next();
}
export function authenticateStaff(ownerOnly = false) {
  return async (req, res, next) => {
    try {
      // Prefer the session belonging to this section when both staff cookies exist.
      const candidates = ownerOnly
        ? [['owner', req.cookies.son_owner_session], ['admin', req.cookies.son_admin_session]]
        : [['admin', req.cookies.son_admin_session], ['owner', req.cookies.son_owner_session]];
      let sawCookie = false, sawValidFormat = false;
      for (const [realm, token] of candidates) {
        if (!token) continue;
        sawCookie = true;
        if (!/^[A-Za-z0-9_-]{43}$/.test(token)) { logEvent('WARN', 'staff.auth.diagnostic', { stage: 'cookie_malformed', realm }, req); continue; }
        sawValidFormat = true;
        const session = await AdminSession.findOne({ tokenHash: digest(token), realm, revokedAt: null, expiresAt: { $gt: new Date(securityNow(req)) } });
        if (!session) { logEvent('WARN', 'staff.auth.diagnostic', { stage: 'session_lookup_miss', realm }, req); continue; }
        const account = await AdminAccount.findOne({ _id: session.accountId, status: 'ACTIVE', mfaEnabled: true, sessionVersion: session.sessionVersion });
        if (!account) { logEvent('WARN', 'staff.auth.diagnostic', { stage: 'account_unavailable', realm }, req); continue; }
        if ((realm === 'owner') !== (account.role === 'OWNER')) { logEvent('WARN', 'staff.auth.diagnostic', { stage: 'account_role_mismatch', realm }, req); continue; }
        if (securityNow(req) - new Date(session.lastSeenAt || session.createdAt).getTime() > (realm === 'owner' ? 30 : 60) * 60000) { await AdminSession.updateOne({ _id: session._id }, { revokedAt: new Date(securityNow(req)) }); logEvent('WARN', 'staff.auth.diagnostic', { stage: 'session_inactive', realm }, req); continue; }
        if (req.app.locals.config.nodeEnv === 'production' && (!account.emailVerifiedAt || account.verificationSource === 'DEVELOPMENT_PREVIEW')) { logEvent('WARN', 'staff.auth.diagnostic', { stage: 'account_not_production_verified', realm }, req); continue; }
        req.staff = account; req.staffSession = session; req.staffRealm = realm;
        req.staffPermissions = account.role === 'OWNER' ? allPermissions : account.permissions.filter(value => !value.startsWith('owner.') && !value.startsWith('staff.'));
        req.csrfToken = keyedDigest(`csrf:${token}`, req.app.locals.config);
        logEvent('INFO', 'staff.auth.diagnostic', { stage: 'session_authenticated', realm }, req);
        if (securityNow(req) - new Date(session.lastSeenAt).getTime() > 60000) await AdminSession.updateOne({ _id: session._id, revokedAt: null }, { lastSeenAt: new Date(securityNow(req)) });
        res.set('Cache-Control', 'no-store');
        if (ownerOnly && account.role !== 'OWNER') { await audit(req, 'OWNER_ACCESS_DENIED', { targetId: req.path, result: 'FAILURE' }); return next(httpError(403, 'Only the owner may manage staff access.')); }
        return next();
      }
      // Customer cookies never establish staff identity or trigger customer renewal here.
      const customerOnly = Boolean(req.cookies.son_customer_session);
      if (!sawCookie) logEvent('WARN', 'staff.auth.diagnostic', { stage: 'cookie_missing' }, req);
      else if (!sawValidFormat) logEvent('WARN', 'staff.auth.diagnostic', { stage: 'cookie_malformed' }, req);
      next(httpError(customerOnly ? 403 : 401, customerOnly ? 'Customer accounts cannot access administration. Please sign in with an authorized staff account.' : 'Please sign in with an authorized staff account.'));
    } catch (error) { next(error); }
  };
}
export function staffCsrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  next(equals(req.get('x-csrf-token'), req.csrfToken) ? null : Object.assign(httpError(403, 'Security verification failed. Refresh this page and try again.'), { logReason: 'csrf_token_rejected' }));
}
export function requirePermission(permission) { return async (req, _res, next) => { if (req.staff && req.staffPermissions.includes(permission)) return next(); try { await audit(req, 'STAFF_PERMISSION_DENIED', { targetId: permission, result: 'FAILURE' }); next(httpError(403, 'Your account does not have permission for this action.')); } catch (error) { next(error); } }; }
