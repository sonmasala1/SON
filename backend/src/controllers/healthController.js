import { getDatabaseStatus } from '../config/db.js';

export function getHealth(_req, res) {
  res.set('Cache-Control', 'no-store').json({ success: true, message: 'SON MASALA API is running', status: 'healthy', timestamp: new Date().toISOString() });
}

export function getReadiness(_req, res) {
  const database = getDatabaseStatus();
  res.set('Cache-Control', 'no-store').status(database.connected ? 200 : 503).json({
    success: database.connected,
    status: database.connected ? 'ready' : 'not_ready',
    message: database.connected ? 'API and database are ready' : database.error || 'Database unavailable. Please try again shortly.',
    dependencies: { mongodb: database.state },
    timestamp: new Date().toISOString(),
  });
}
