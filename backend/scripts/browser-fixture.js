// Isolated real Express/Mongoose browser fixture. Credentials are generated per test and sent only through parent IPC.
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { getEnv } from '../src/config/env.js';
import { initializeModels } from '../src/config/models.js';
import { createApp } from '../src/app.js';
import { seedDemo } from './seed-demo.js';
import { AdminAccount } from '../src/models/administration.js';
import { operationalPermissions } from '../src/config/permissions.js';
import { newAdminId, randomToken, digest, hashPassword, newMfaSecret, encryptSecret, totp } from '../src/services/staffCrypto.js';
import { beginOwnerBootstrap, completeOwnerBootstrap } from '../src/services/ownerBootstrap.js';
import { createGoogleTestProvider } from './fixtures/google-provider.js';

const uri = process.env.MONGODB_TEST_URI || getEnv().MONGODB_URI;
if (!process.env.MONGODB_TEST_URI && !/^mongodb:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(uri || '')) throw new Error('Provide MONGODB_TEST_URI for an isolated test replica set.');
const databaseName = `son_masala_test_browser_${Date.now()}_${process.pid}`;
let server;
async function cleanup() { if (server) await new Promise(resolve => server.close(resolve)); if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_browser_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
try {
  await mongoose.connect(uri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await initializeModels(); await seedDemo();
  let authClockOffset = 0;
  const config = { nodeEnv: 'test', demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), authDevPreview: true, smtpHost: null, smtpUser: null, smtpPassword: null, smtpFrom: null, twilioSid: null, twilioToken: null, clock: () => Date.now() + authClockOffset, ...createGoogleTestProvider() };
  const staff = { adminId: newAdminId(false), password: randomToken(), secret: newMfaSecret() };
  const staffId = new mongoose.Types.ObjectId();
  await AdminAccount.create({ _id: staffId, adminId: staff.adminId, fullName: 'Isolated Browser Staff', email: 'staff@example.com', role: 'ADMIN', permissions: operationalPermissions, passwordHash: await hashPassword(staff.password), status: 'ACTIVE', mfaEnabled: true, mfaSecretEncrypted: encryptSecret(staff.secret, config, String(staffId)), lastMfaStep: Math.floor(Date.now() / 30000) - 2, emailVerifiedAt: new Date(), verificationSource: 'TEST_TRANSPORT' });
  const proofSecret = randomToken(), ownerPassword = randomToken();
  const proof = { expectedOsUser: 'isolated-test-operator', actualOsUser: 'isolated-test-operator', secretHash: digest(proofSecret), suppliedSecret: proofSecret };
  const req = { ip: 'isolated-fixture', get: () => 'isolated-browser-test', app: { locals: { config } } };
  const created = await beginOwnerBootstrap(req, { fullName: 'Isolated Browser Owner', email: 'owner@example.com', phone: '+919876543210', password: ownerPassword }, proof);
  const owner = { adminId: created.account.adminId, password: ownerPassword, secret: new URL(created.enrollmentUri).searchParams.get('secret') };
  await completeOwnerBootstrap(req, created.account.id, totp(owner.secret).generate({ timestamp: Date.now() - 30000 }), proof);
  server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  process.send?.({ port: server.address().port, staff, owner });
  process.on('message', async message => { if (message === 'shutdown') { await cleanup(); process.exit(0); } else if (message?.type === 'advance-auth-clock') { authClockOffset += message.milliseconds; process.send?.({ type: 'auth-clock-advanced', id: message.id }); } });
  process.once('SIGTERM', async () => { await cleanup(); process.exit(0); });
} catch (error) { await cleanup(); console.error('Isolated browser-test initialization failed:',error.name); process.exit(1); }
