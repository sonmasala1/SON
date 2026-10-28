import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { maintainDatabaseConnection, disconnectDatabase } from './config/db.js';
import { getDatabaseStatus } from './config/db.js';
import { releaseExpiredReservations } from './services/paymentService.js';

async function start() {
  const env = getEnv();
  const app = createApp({ allowedOrigins: env.allowedOrigins, config: { nodeEnv: env.NODE_ENV, demoEnabled: env.ENABLE_DEMO_CHECKOUT === 'true', deliveryChargePaise: env.DELIVERY_CHARGE_PAISE, freeDeliveryThresholdPaise: env.FREE_DELIVERY_THRESHOLD_PAISE } });
  const server = app.listen(env.PORT, () => {
    console.log(`SON MASALA API listening on http://localhost:${env.PORT}/api/v1`);
    if (env.MONGODB_DB_NAME) console.log(`Configured catalogue database: ${env.MONGODB_DB_NAME}`);
    if (env.ENABLE_DEMO_CHECKOUT === 'true') console.log('Demo checkout enabled. Sample products require an isolated demo/test database.');
    void maintainDatabaseConnection(env.MONGODB_URI, env.MONGODB_DB_NAME);
  });
  server.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${env.PORT} is already in use. An API process may already be running from npm start or npm run dev. Stop that process with Ctrl+C before starting another backend.` : 'API could not bind to its configured port.');
    process.exitCode = 1;
  });
  let cleaning = false;
  const cleanupTimer = setInterval(async () => {
    if (cleaning || env.NODE_ENV === 'production' || env.ENABLE_DEMO_CHECKOUT !== 'true' || !getDatabaseStatus().connected) return;
    cleaning = true;
    try { await releaseExpiredReservations(); } catch { console.error('Demo reservation cleanup failed; it will retry.'); }
    finally { cleaning = false; }
  }, 60000);
  cleanupTimer.unref();
  const shutdown = () => {
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

start().catch(() => {
  // Connection errors may contain credentials; keep startup output generic.
  console.error('Backend startup failed. Check database, origin, and authentication settings in backend/.env.');
  process.exitCode = 1;
});
