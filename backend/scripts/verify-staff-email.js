// Verifies a staff account's email by sending a one-time code to that address.
// Run only from an interactive terminal controlled by the deployment administrator:
//   npm run staff:verify-email
// Production refuses staff sessions for accounts without a verified email; this is the
// supported way to verify accounts that were provisioned with `npm run staff:sync-env`.
import os from 'node:os';
import dns from 'node:dns';
import readline from 'node:readline';
import { getEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { initializeModels } from '../src/config/models.js';
import { beginStaffEmailVerification, completeStaffEmailVerification } from '../src/services/staffEmailVerification.js';

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Staff email verification requires an interactive terminal. Redirected input/output is refused.');
  process.exit(1);
}
dns.setServers(['1.1.1.1', '8.8.8.8']);
const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = label => new Promise(resolve => terminal.question(label, value => resolve(value.trim())));

try {
  const env = getEnv();
  const app = createApp({ allowedOrigins: env.allowedOrigins, config: { nodeEnv: env.NODE_ENV, staffAppOrigin: env.staffAppOrigin, mfaEncryptionKey: env.mfaEncryptionKey, customerAuthKey: env.customerAuthKey, adminSecurityCodeHash: env.ADMIN_SECURITY_CODE_HASH, ownerSecurityCodeHash: env.OWNER_SECURITY_CODE_HASH } });
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await initializeModels();
  const req = { ip: 'protected-cli', get: () => `protected-cli:${os.userInfo().username}`, app };
  console.log(`Connected to database "${app.locals.databaseName()}".`);
  const loginId = await ask('Staff login ID (Admin ID or Owner ID): ');
  const email = await ask('Real email address to verify for this account: ');
  const started = await beginStaffEmailVerification(req, { loginId, email });
  console.log(`${started.message} Account role: ${started.account.role}.`);
  const code = await ask('Six-digit code from the email: ');
  const account = await completeStaffEmailVerification(req, started.challengeToken, code);
  console.log(`Email verified for ${account.role} account. Existing sessions for this account were revoked; sign in again.`);
} catch (error) {
  console.error(error.status ? error.message : 'Staff email verification failed. No account was changed.');
  process.exitCode = 1;
} finally {
  terminal.close();
  await disconnectDatabase().catch(() => {});
}
