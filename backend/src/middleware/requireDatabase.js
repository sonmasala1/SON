import { getDatabaseStatus } from '../config/db.js';

export function requireDatabase(_req, _res, next) {
  const database = getDatabaseStatus();
  if (!database.connected) {
    const error = new Error('The secure store is temporarily unavailable. Please try again.');
    error.status = 503;
    error.code = database.state === 'connecting' ? 'DATABASE_CONNECTING' : 'DATABASE_UNAVAILABLE';
    error.logReason = 'database_unavailable';
    return next(error);
  }
  next();
}
