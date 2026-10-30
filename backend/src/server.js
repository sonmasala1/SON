import dns from 'node:dns';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { maintainDatabaseConnection, disconnectDatabase } from './config/db.js';
import { getDatabaseStatus } from './config/db.js';
import { releaseExpiredReservations } from './services/paymentService.js';
import { logEvent } from './services/logger.js';

// Ensure DNS resolvers (for Atlas SRV on Windows)
dns.setServers(['1.1.1.1', '8.8.8.8']);

// Never print raw exception messages/stacks: provider/database errors may contain secrets.
function fatalException() { logEvent('ERROR', 'server.exception', { reason: 'server_error' }); process.exit(1); }
process.once('uncaughtException', fatalException);
process.once('unhandledRejection', fatalException);

async function start() {
  const env = getEnv();
  // Connect to database before opening the port so initial requests do not hit 503 database_unavailable
  await maintainDatabaseConnection(env.MONGODB_URI, env.MONGODB_DB_NAME).catch(() => {});
  const app = createApp({ allowedOrigins: env.allowedOrigins, config: { nodeEnv: env.NODE_ENV, demoEnabled: env.ENABLE_DEMO_CHECKOUT === 'true', deliveryChargePaise: env.DELIVERY_CHARGE_PAISE, freeDeliveryThresholdPaise: env.FREE_DELIVERY_THRESHOLD_PAISE } });
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logEvent('INFO', 'server.started', { port: env.PORT, environment: env.NODE_ENV });
  });
  server.on('error', (error) => {
    logEvent('ERROR', 'server.bind_failed', { port: env.PORT, code: error.code });
    process.exitCode = 1;
  });
  let cleaning = false;
  const cleanupTimer = setInterval(async () => {
    if (cleaning || env.NODE_ENV === 'production' || env.ENABLE_DEMO_CHECKOUT !== 'true' || !getDatabaseStatus().connected) return;
    cleaning = true;
    try { await releaseExpiredReservations(); } catch { logEvent('ERROR', 'server.cleanup_failed'); }
    finally { cleaning = false; }
  }, 60000);
  cleanupTimer.unref();
  const shutdown = () => {
    logEvent('INFO', 'server.stopping');
    clearInterval(cleanupTimer);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

start().catch((err) => {
  logEvent('ERROR', 'server.start_failed', { reason: 'configuration_missing', code: err?.code });
  process.exitCode = 1;
});
