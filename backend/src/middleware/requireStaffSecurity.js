import { securityKey } from '../services/staffCrypto.js';

export function requireStaffSecurity(req, _res, next) {
  try {
    securityKey(req.app.locals.config);
    next();
  } catch (error) {
    next(error);
  }
}
