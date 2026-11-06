import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { initializeModels } from '../src/config/models.js';
import { AdminAccount, AdminSession } from '../src/models/administration.js';
import { operationalPermissions } from '../src/config/permissions.js';
import { hashPassword, encryptSecret, newMfaSecret } from '../src/services/staffCrypto.js';
import { beginStaffEmailVerification, completeStaffEmailVerification } from '../src/services/staffEmailVerification.js';

test('production admin login, session persistence, refresh and logout after operator email verification', async t => {
  const testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) { t.skip('Set MONGODB_TEST_URI to an isolated replica set; integration tests never use MONGODB_URI.'); return; }
  const databaseName = `son_masala_test_staffemail_${Date.now()}_${process.pid}`;
  await mongoose.connect(testUri, { dbName: databaseName });
  t.after(async () => { if (mongoose.connection.name === databaseName) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels();

  const password = 'synthetic-admin-password', securityCode = '730194', mails = [];
  const base = { mfaEncryptionKey: randomBytes(32).toString('base64'), adminSecurityCodeHash: await hashPassword(securityCode) };
  const testConfig = { ...base, nodeEnv: 'test', deliveryAdapter: async message => mails.push(message) };
  const id = new mongoose.Types.ObjectId();
  // Mirrors the accounts `npm run staff:sync-env` creates: active, MFA enrolled, non-deliverable email.
  await AdminAccount.create({ _id: id, adminId: 'ADM-ENVTEST', loginId: 'ADMINTEST', fullName: 'Env Admin', email: 'admin@staff.sonmasala.invalid', role: 'ADMIN', permissions: operationalPermissions, passwordHash: await hashPassword(password), status: 'ACTIVE', mfaEnabled: true, mfaSecretEncrypted: encryptSecret(newMfaSecret(), base, String(id)), verificationSource: 'ENVIRONMENT_CONFIG' });

  const server = createApp({ config: { ...base, nodeEnv: 'production' } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1`;
  const jar = new Map(); let csrf = '';
  const call = async (path, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(url + path, { method, headers: { Origin: 'http://localhost:3000', Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), 'X-CSRF-Token': csrf, ...body ? { 'Content-Type': 'application/json' } : {} }, ...body ? { body: JSON.stringify(body) } : {} });
    for (const cookie of response.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar.set(name, value); else jar.delete(name); }
    const data = await response.json(); if (data.csrfToken) csrf = data.csrfToken;
    return { status: response.status, body: data };
  };

  await t.test('unverified production account is refused at login without a session', async () => {
    const result = await call('/admin/auth/login', { adminId: 'ADMINTEST', password, securityCode });
    assert.equal(result.status, 403); assert.equal(result.body.code, 'STAFF_EMAIL_UNVERIFIED');
    assert.equal(jar.has('son_admin_session'), false);
    assert.equal(await AdminSession.countDocuments({ accountId: id }), 0);
  });

  await t.test('reserved domains, wrong codes and unknown IDs never verify', async () => {
    const req = { ip: 'cli', get: () => 'test-cli', app: { locals: { config: testConfig, databaseName: () => databaseName } } };
    await assert.rejects(beginStaffEmailVerification(req, { loginId: 'ADMINTEST', email: 'admin@staff.sonmasala.invalid' }), { status: 400 });
    await assert.rejects(beginStaffEmailVerification(req, { loginId: 'NOBODY', email: 'ops@sonmasala.in' }), { status: 404 });
    const started = await beginStaffEmailVerification(req, { loginId: 'ADMINTEST', email: 'Ops@SonMasala.in' });
    const code = mails.at(-1).text.match(/\b(\d{6})\b/)[1];
    const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
    await assert.rejects(completeStaffEmailVerification(req, started.challengeToken, wrong), { status: 401 });
    assert.equal((await AdminAccount.findById(id)).emailVerifiedAt, undefined);
    const account = await completeStaffEmailVerification(req, started.challengeToken, code);
    assert.equal(account.email, 'ops@sonmasala.in'); assert.ok(account.emailVerifiedAt); assert.equal(account.sessionVersion, 1);
    await assert.rejects(completeStaffEmailVerification(req, started.challengeToken, code), { status: 401 });
  });

  await t.test('verified account signs in, survives dashboard refreshes and logs out', async () => {
    const login = await call('/admin/auth/login', { adminId: 'ADMINTEST', password, securityCode });
    assert.equal(login.status, 200); assert.ok(jar.has('son_admin_session'));
    for (let refresh = 0; refresh < 3; refresh++) {
      const me = await call('/admin/auth/me');
      assert.equal(me.status, 200); assert.equal(me.body.account.role, 'ADMIN');
    }
    assert.equal((await call('/admin/dashboard')).status, 200);
    assert.equal((await call('/admin/auth/logout', {})).status, 200);
    assert.equal(jar.has('son_admin_session'), false);
    assert.equal((await call('/admin/auth/me')).status, 401);
  });
});
