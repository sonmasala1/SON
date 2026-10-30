import { randomBytes, createHash } from 'node:crypto';
import { readCustomerSession } from '../services/customerSessionService.js';
import { httpError } from '../utils/httpError.js';

export const cookieOptions = (req, persistent = true) => ({ httpOnly: true, sameSite: req.app.locals.config.crossSiteCookies ? 'none' : 'lax', secure: req.app.locals.config.nodeEnv === 'production', path: '/', ...(persistent ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}) });
export async function identifyCustomer(req, res, next) {
  try {
    let guest = req.cookies.son_guest;
    if (!/^[A-Za-z0-9_-]{43}$/.test(guest || '')) {
      guest = randomBytes(32).toString('base64url');
      res.cookie('son_guest', guest, cookieOptions(req));
    }
    req.guestKey = `guest:${createHash('sha256').update(guest).digest('hex')}`;
    await readCustomerSession(req, res);
    req.ownerKey = req.user ? `user:${req.user.id}` : req.guestKey;
    next();
  } catch (error) { next(error); }
}
export function requireCustomer(req, _res, next) { next(req.user ? null : httpError(401, 'Please sign in to continue.')); }
export function demoAllowed(req) {
  const config = req.app.locals.config;
  const db = req.app.locals.databaseName?.() || '';
  return config.nodeEnv !== 'production' && config.demoEnabled && /(?:_demo(?:$|_)|_test_)/.test(db);
}
export function requireDemo(req, _res, next) {
  if (!demoAllowed(req)) return next(httpError(404, 'Demo checkout is unavailable.'));
  next();
}
