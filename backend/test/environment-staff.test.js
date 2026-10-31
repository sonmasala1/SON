import test from 'node:test';
import assert from 'node:assert/strict';
import { environmentStaff } from '../src/services/environmentStaff.js';
import { newMfaSecret, mfaStep, totp } from '../src/services/staffCrypto.js';
import { hashPassword } from '../src/services/staffCrypto.js';
import { AdminAccount, AdminChallenge } from '../src/models/administration.js';
import { beginStaffLogin, loginStaffWithSecurityCode } from '../src/services/staffAuthService.js';
import { getEnv } from '../src/config/env.js';
import { classifyStartupFailure } from '../src/config/startupDiagnostics.js';

test('production fixed-code startup does not require legacy MFA encryption', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const env = getEnv();
    assert.equal(env.NODE_ENV, 'production');
    assert.equal(env.mfaEncryptionKey, '');
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test('startup failures are classified without exposing exception details', () => {
  assert.equal(classifyStartupFailure(Object.assign(new Error('secret detail'), { code: 'MISSING_ENV_VARIABLE' })), 'MISSING_ENV_VARIABLE');
  assert.equal(classifyStartupFailure(new Error('Staff MFA encryption key is invalid')), 'INVALID_SECURITY_CONFIGURATION');
  assert.equal(classifyStartupFailure(Object.assign(new Error('MongoDB URI is invalid'), { code: 'MONGODB_URI_INVALID' })), 'DATABASE_CONNECTION_FAILED');
});

const configured = () => ({ NODE_ENV: 'development', ADMIN_ID: 'admin-local', ADMIN_PASSWORD: 'random-local-password', ADMIN_MFA_SECRET: newMfaSecret(), OWNER_USER_ID: 'owner-local', OWNER_PASSWORD: 'different-local-password', OWNER_MFA_SECRET: newMfaSecret() });
test('configured IDs are normalized and roles cannot be selected by the login client', () => {
  const entries = environmentStaff(configured());
  assert.deepEqual(entries.map(entry => entry.role), ['OWNER', 'ADMIN']);
  assert.deepEqual(entries.map(entry => entry.adminId), ['OWNER-LOCAL', 'ADMIN-LOCAL']);
});
test('numeric MFA values are refused without exposing secrets and shared IDs stay separate by realm', () => {
  const env = configured();
  env.ADMIN_MFA_SECRET = '1234567890';
  assert.throws(() => environmentStaff(env), error => /Base32/.test(error.message) && !error.message.includes(env.ADMIN_MFA_SECRET) && !error.message.includes(env.ADMIN_PASSWORD));
  const collision = configured(); collision.ADMIN_ID = collision.OWNER_USER_ID;
  const entries = environmentStaff(collision);
  assert.notEqual(entries[0].adminId, entries[1].adminId);
  assert.equal(entries[0].loginId, entries[1].loginId);
});
test('environment setup cannot provision production staff or substitute a secret for a changing MFA code', () => {
  assert.throws(() => environmentStaff({ ...configured(), NODE_ENV: 'production' }), /production/);
  const secret = newMfaSecret(), now = Date.now();
  assert.notEqual(mfaStep(secret, totp(secret).generate({ timestamp: now }), now), null);
  assert.equal(mfaStep(secret, secret, now), null);
});

test('shared configured login IDs resolve by realm and still require an MFA challenge', async t => {
  const password = 'a-test-password-only';
  const passwordHash = await hashPassword(password);
  const queries = [], challenges = [];
  t.mock.method(AdminAccount, 'findOne', filter => {
    queries.push(filter);
    const role = filter.role === 'OWNER' ? 'OWNER' : 'ADMIN';
    return { select: async () => ({ _id: role === 'OWNER' ? 'owner-record' : 'admin-record', role, passwordHash, status: 'ACTIVE', mfaEnabled: true }) };
  });
  t.mock.method(AdminChallenge, 'create', async fields => { challenges.push(fields); return fields; });
  const req = { app: { locals: { config: { nodeEnv: 'test' } } } };
  for (const realm of ['owner', 'admin']) {
    const result = await beginStaffLogin(req, realm, 'SHARED-ID', password);
    assert.equal(result.requiresMfa, true);
    assert.match(result.challengeToken, /^[A-Za-z0-9_-]{43}$/);
  }
  assert.equal(queries[0].role, 'OWNER');
  assert.deepEqual(queries[1].role, { $ne: 'OWNER' });
  assert.deepEqual(queries[0].$or[1], { loginId: 'SHARED-ID' });
  assert.deepEqual(challenges.map(challenge => [challenge.realm, challenge.accountId]), [['owner', 'owner-record'], ['admin', 'admin-record']]);
});
