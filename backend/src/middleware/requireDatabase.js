import { getDatabaseStatus } from '../config/db.js';

export function requireDatabase(_req, _res, next) {
  const database = getDatabaseStatus();
  if (!database.connected) return next(Object.assign(new Error(database.error || 'Database unavailable'), { status: 503, expose: true }));
  next();
}
