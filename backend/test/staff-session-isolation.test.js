import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticateStaff, requirePermission, staffCsrf } from '../src/middleware/staffAccess.js';
import { staffLogout } from '../src/controllers/staffAuthController.js';
import { logout as customerLogout } from '../src/controllers/authController.js';
import { AdminAccount, AdminSession, AdminAuditLog, AdminChallenge } from '../src/models/administration.js';
import { CustomerSession } from '../src/models/customerAuthentication.js';
import { verifyStaffMfa } from '../src/services/staffAuthService.js';
import { digest, encryptSecret, newMfaSecret, mfaStep } from '../src/services/staffCrypto.js';

function request(cookies = {}) {
  return { cookies, method: 'GET', path: '/dashboard', get: () => '', app: { locals: { config: { nodeEnv: 'test', mfaEncryptionKey: Buffer.alloc(32, 7).toString('base64') } } } };
}
function response() {
  const cleared = [];
  return { cleared, set() { return this; }, json() { return this; }, clearCookie(name, options) { cleared.push({ name, options }); return this; } };
}
const invoke = async (middleware, req, res = response()) => {
  let failure;
  await middleware(req, res, error => { failure = error; });
  return failure;
};

test('customer credentials cannot authorize staff APIs or query staff sessions', async t => {
  const lookup = t.mock.method(AdminSession, 'findOne', () => { throw new Error('Unexpected staff lookup'); });
  const req = request({ son_customer_session: 'c'.repeat(43) });
  const failure = await invoke(authenticateStaff(), req);
  assert.equal(failure.status, 403);
  assert.equal(req.staff, undefined);
  assert.equal(lookup.mock.callCount(), 0);
  assert.equal((await invoke(authenticateStaff(), request())).status, 401);
});

test('admin cookie takes precedence over owner and customer cookies; server validates session and MFA', async t => {
  const req = request({ son_customer_session: 'c'.repeat(43), son_admin_session: 'a'.repeat(43), son_owner_session: 'o'.repeat(43) });
  const record = { _id: 'admin-session', accountId: 'admin-account', sessionVersion: 2, lastSeenAt: new Date() };
  const lookup = t.mock.method(AdminSession, 'findOne', async query => {
    assert.equal(query.realm, 'admin'); assert.equal(query.tokenHash, digest('a'.repeat(43)));
    assert.equal(query.revokedAt, null); assert.ok(query.expiresAt.$gt instanceof Date);
    return record;
  });
  t.mock.method(AdminAccount, 'findOne', async query => {
    assert.deepEqual(query, { _id: 'admin-account', status: 'ACTIVE', mfaEnabled: true, sessionVersion: 2 });
    return { _id: 'admin-account', fullName: 'Only Admin', role: 'ADMIN', permissions: ['dashboard.view', 'owner.access'] };
  });
  assert.equal(await invoke(authenticateStaff(), req), undefined);
  assert.equal(req.staff.fullName, 'Only Admin'); assert.equal(req.staffRealm, 'admin');
  assert.deepEqual(req.staffPermissions, ['dashboard.view']);
  assert.equal(lookup.mock.callCount(), 1);
  assert.equal(await invoke(requirePermission('dashboard.view'), req), undefined);
  req.method = 'POST';
  assert.equal((await invoke(staffCsrf, req)).status, 403);
  req.get = () => req.csrfToken;
  assert.equal(await invoke(staffCsrf, req), null);
});

test('staff logout revokes only staff session and clears only staff cookie', async t => {
  const req = request(); req.staffSession = { _id: 'admin-session' }; req.staff = { id: 'admin-account' }; req.staffRealm = 'admin';
  const revoked = t.mock.method(AdminSession, 'updateOne', async filter => assert.deepEqual(filter, { _id: 'admin-session' }));
  const customers = t.mock.method(CustomerSession, 'updateOne', () => { throw new Error('Customer session changed'); });
  t.mock.method(AdminAuditLog, 'create', async () => [{}]);
  const res = response();
  assert.equal(await invoke(staffLogout, req, res), undefined);
  assert.equal(revoked.mock.callCount(), 1); assert.equal(customers.mock.callCount(), 0);
  assert.deepEqual(res.cleared.map(value => value.name), ['son_admin_session']);
  assert.equal(res.cleared[0].options.path, '/api/v1');
});

test('customer logout revokes only customer session and leaves staff cookies untouched', async t => {
  const req = request(); req.customerSession = { _id: 'customer-session' };
  t.mock.method(CustomerSession, 'updateOne', async filter => assert.deepEqual(filter, { _id: 'customer-session' }));
  const admins = t.mock.method(AdminSession, 'updateOne', () => { throw new Error('Admin session changed'); });
  const res = response();
  assert.equal(await invoke(customerLogout, req, res), undefined);
  assert.equal(admins.mock.callCount(), 0);
  assert.deepEqual(res.cleared.map(value => value.name), ['son_customer_session', 'son_session']);
});

test('configured fixed MFA codes cannot replace a valid authenticator code', async t => {
  const req = request(), now = Date.now(), secret = newMfaSecret();
  req.app.locals.config.clock = () => now;
  const code = ['123456', '234567', '345678', '456789'].find(value => mfaStep(secret, value, now) === null);
  assert.ok(code);
  const previous = process.env.ADMIN_MFA_CODE;
  process.env.ADMIN_MFA_CODE = code;
  t.after(() => { if (previous === undefined) delete process.env.ADMIN_MFA_CODE; else process.env.ADMIN_MFA_CODE = previous; });
  t.mock.method(AdminChallenge, 'findOne', () => ({ select: async () => ({ _id: 'challenge', accountId: 'admin-account' }) }));
  t.mock.method(AdminAccount, 'findById', () => ({ select: async () => ({ id: 'admin-account', status: 'ACTIVE', mfaSecretEncrypted: encryptSecret(secret, req.app.locals.config, 'admin-account'), lastMfaStep: -1 }) }));
  t.mock.method(AdminChallenge, 'updateOne', async () => ({}));
  t.mock.method(AdminAccount, 'findByIdAndUpdate', async () => ({ failedLoginAttempts: 1 }));
  t.mock.method(AdminAuditLog, 'create', async () => [{}]);
  await assert.rejects(verifyStaffMfa(req, 'admin', 'a'.repeat(43), code), { status: 401 });
});
