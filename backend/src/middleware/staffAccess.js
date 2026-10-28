import { AdminAccount, AdminSession } from '../models/administration.js';
import { digest, keyedDigest, equals } from '../services/staffCrypto.js';
import { securityNow, audit } from '../services/staffAudit.js';
import { httpError } from '../utils/httpError.js';
import { allPermissions } from '../config/permissions.js';

export function staffCookie(req, realm, clear = false) { return { httpOnly: true, secure: req.app.locals.config.nodeEnv === 'production', sameSite: 'strict', path: '/api/v1', ...(clear ? {} : { maxAge: realm === 'owner' ? 4 * 3600000 : 8 * 3600000 }) }; }
export function staffOrigin(req, _res, next) {
  const origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && (!origin || !req.app.locals.allowedOrigins.includes(origin))) return next(httpError(403, 'The request origin is not allowed.'));
  next();
}
export function authenticateStaff(ownerOnly = false) {
  return async (req, res, next) => {
    try {
      const candidates = [['owner', req.cookies.son_owner_session], ['admin', req.cookies.son_admin_session]];
      for (const [realm, token] of candidates) {
        if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) continue;
        const session = await AdminSession.findOne({ tokenHash: digest(token), realm, revokedAt: null, expiresAt: { $gt: new Date(securityNow(req)) } });
        if (!session) continue;
        const account = await AdminAccount.findOne({ _id: session.accountId, status: 'ACTIVE', mfaEnabled: true, sessionVersion: session.sessionVersion });
        if (!account || (realm === 'owner') !== (account.role === 'OWNER')) continue;
        if (securityNow(req) - new Date(session.lastSeenAt || session.createdAt).getTime() > (realm === 'owner' ? 30 : 60) * 60000) { await AdminSession.updateOne({ _id: session._id }, { revokedAt: new Date(securityNow(req)) }); continue; }
        if (req.app.locals.config.nodeEnv === 'production' && (!account.emailVerifiedAt || account.verificationSource === 'DEVELOPMENT_PREVIEW')) continue;
        req.staff = account; req.staffSession = session; req.staffRealm = realm;
        req.staffPermissions = account.role === 'OWNER' ? allPermissions : account.permissions.filter(value => !value.startsWith('owner.') && !value.startsWith('staff.'));
        req.csrfToken = keyedDigest(`csrf:${token}`, req.app.locals.config);
        if (securityNow(req) - new Date(session.lastSeenAt).getTime() > 60000) await AdminSession.updateOne({ _id: session._id, revokedAt: null }, { lastSeenAt: new Date(securityNow(req)) });
        res.set('Cache-Control', 'no-store');
        if (ownerOnly && account.role !== 'OWNER') { await audit(req, 'OWNER_ACCESS_DENIED', { targetId: req.path, result: 'FAILURE' }); return next(httpError(403, 'Only the owner may manage staff access.')); }
        return next();
      }
      next(httpError(req.user ? 403 : 401, req.user ? 'Customer accounts cannot access administration.' : 'Please sign in with an authorized staff account.'));
    } catch (error) { next(error); }
  };
}
export function staffCsrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  next(equals(req.get('x-csrf-token'), req.csrfToken) ? null : httpError(403, 'Security verification failed. Refresh this page and try again.'));
}
export function requirePermission(permission) { return async (req, _res, next) => { if (req.staff && req.staffPermissions.includes(permission)) return next(); try { await audit(req, 'STAFF_PERMISSION_DENIED', { targetId: permission, result: 'FAILURE' }); next(httpError(403, 'Your account does not have permission for this action.')); } catch (error) { next(error); } }; }
