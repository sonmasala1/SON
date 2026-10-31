import dns from 'node:dns';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { maintainDatabaseConnection, disconnectDatabase } from './config/db.js';
import { logEvent } from './services/logger.js';
import { releaseExpiredPayLaterReservations } from './services/paymentService.js';

// Ensure DNS resolvers (for Atlas SRV on Windows)
dns.setServers(['1.1.1.1', '8.8.8.8']);

const backendRoot = fileURLToPath(new URL('..', import.meta.url));
const startupLock = path.join(backendRoot, '.server-start.lock');
let lockAcquired = false;

function processIsRunning(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

function processIsBackend(pid) {
  if (!processIsRunning(pid)) return false;
  if (process.platform === 'win32') {
    try {
      const output = execFileSync('wmic.exe', ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/value'], { encoding: 'utf8' });
      return /SON[\\/](?:backend)[\\/].*(?:server\.js)/i.test(output.replace(/[\r\n]+/g, ' '));
    } catch { return false; }
  }
  try {
    const command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    return command.includes(path.join(backendRoot, 'src', 'server.js').replace(/\\/g, '/'));
  } catch { return false; }
}

function acquireStartupLock() {
  fs.mkdirSync(startupLock, { recursive: false });
  fs.writeFileSync(path.join(startupLock, 'pid'), String(process.pid), { encoding: 'utf8', mode: 0o600 });
  lockAcquired = true;
}

function releaseStartupLock() {
  if (!lockAcquired) return;
  fs.rmSync(startupLock, { recursive: true, force: true });
  lockAcquired = false;
}

function acquireOrReportLock() {
  try { acquireStartupLock(); return; }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid = null;
    try { pid = Number(fs.readFileSync(path.join(startupLock, 'pid'), 'utf8').trim()); }
    catch {}
    if (Number.isInteger(pid) && pid > 0 && processIsBackend(pid)) {
      logEvent('ERROR', 'server.start_blocked', {
        reason: 'backend_already_starting',
        port: getEnv().PORT,
        pid,
      });
      process.exitCode = 1;
      return false;
    }
    fs.rmSync(startupLock, { recursive: true, force: true });
    acquireStartupLock();
    return true;
  }
}

// Never print raw exception messages/stacks: provider/database errors may contain secrets.
function fatalException() { logEvent('ERROR', 'server.exception', { reason: 'server_error' }); process.exit(1); }
process.once('uncaughtException', fatalException);
process.once('unhandledRejection', fatalException);

async function start() {
  const env = getEnv();
  const app = createApp({ allowedOrigins: env.allowedOrigins, config: { nodeEnv: env.NODE_ENV, staffAppOrigin: env.staffAppOrigin, mfaEncryptionKey: env.mfaEncryptionKey, adminSecurityCodeHash: env.ADMIN_SECURITY_CODE_HASH, ownerSecurityCodeHash: env.OWNER_SECURITY_CODE_HASH, deliveryChargePaise: env.DELIVERY_CHARGE_PAISE, freeDeliveryThresholdPaise: env.FREE_DELIVERY_THRESHOLD_PAISE } });
  logEvent('INFO', 'staff.security.configuration', {
    configured: Boolean(env.mfaEncryptionKey),
    keyBytes: env.mfaEncryptionKey ? Buffer.from(env.mfaEncryptionKey, 'base64').length : 0,
    keySource: process.env.STAFF_MFA_ENCRYPTION_KEY ? 'STAFF_MFA_ENCRYPTION_KEY' : process.env.ADMIN_MFA_ENCRYPTION_KEY ? 'ADMIN_MFA_ENCRYPTION_KEY' : 'none',
  });
  await maintainDatabaseConnection(env.MONGODB_URI, env.MONGODB_DB_NAME).catch(() => {});
  const server = app.listen(env.PORT, '0.0.0.0');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  logEvent('INFO', 'server.started', { port: env.PORT, environment: env.NODE_ENV });
  const reservationCleanup = setInterval(() => {
    releaseExpiredPayLaterReservations().catch(() => {});
  }, 5 * 60 * 1000);
  reservationCleanup.unref();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logEvent('INFO', 'server.stopping');
    await new Promise(resolve => server.close(resolve));
    try {
      await disconnectDatabase();
    } finally {
      releaseStartupLock();
      process.exit(0);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

process.once('exit', releaseStartupLock);

if (acquireOrReportLock() !== false) {
  start().catch(async error => {
    releaseStartupLock();
    if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES' || error?.code === 'ENOTFOUND' || error?.syscall?.includes('listen')) {
      const env = getEnv();
      const reason = error.code === 'EADDRINUSE' ? 'port_already_in_use' : error.code === 'EACCES' ? 'port_access_denied' : error.code === 'ENOTFOUND' ? 'host_not_found' : 'bind_error';
      logEvent('ERROR', 'server.bind_failed', { port: env.PORT, host: '0.0.0.0', code: error.code || 'UNKNOWN', reason, message: 'Server could not bind the configured port.' });
    } else {
      logEvent('ERROR', 'server.start_failed', { reason: error?.code === 'ENOENT' ? 'configuration_missing' : 'startup_error', code: error?.code || 'UNKNOWN' });
    }
    await disconnectDatabase().catch(() => {});
    process.exitCode = 1;
  });
}
