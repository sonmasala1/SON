import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { initializeModels } from '../src/config/models.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../scripts/seed-demo.js';
import { beginOwnerBootstrap, completeOwnerBootstrap, recoverOwner } from '../src/services/ownerBootstrap.js';
import { digest, randomToken, totp, newAdminId, newMfaSecret, decryptSecret } from '../src/services/staffCrypto.js';
import { AdminAccount, AdminBootstrap, AdminInvitation, AdminSession, AdminAuditLog, AdminChallenge } from '../src/models/administration.js';
import User from '../src/models/User.js';
import Review from '../src/models/Review.js';
import Order from '../src/models/Order.js';
import Payment from '../src/models/Payment.js';
import Product from '../src/models/Product.js';

test('owner/staff MFA, session separation, invitations, permissions, and recovery', async t => {
  const testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) {
    t.skip('Set MONGODB_TEST_URI to an isolated replica set; integration tests never use MONGODB_URI.');
    return;
  }
  const databaseName = `son_masala_test_security_${Date.now()}_${process.pid}`;
  await mongoose.connect(testUri, { dbName: databaseName });
  t.after(async () => { if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_security_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels(); await seedDemo();
  let now = Date.now(); const mails = [], logs = [];
  const config = { nodeEnv: 'test', testLogSink: record => logs.push(record), demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => now, deliveryAdapter: async message => mails.push(message) };
  const req = { ip: '127.0.0.1', get: () => 'isolated-security-test', app: { locals: { config } } };
  const setupSecret = randomToken();
  const proof = { expectedOsUser: 'verified-deployment-operator', actualOsUser: 'verified-deployment-operator', secretHash: digest(setupSecret), suppliedSecret: setupSecret };
  const password = randomToken(); let owner, ownerSecret, recovery;
  await t.test('bootstrap requires deployment identity and setup secret', async () => {
    await assert.rejects(beginOwnerBootstrap(req, { fullName: 'Test Owner', email: 'owner@example.com', password }, { ...proof, suppliedSecret: 'invalid' }), { status: 403 });
    assert.equal(await AdminAccount.countDocuments(), 0);
    const enrollment = await beginOwnerBootstrap(req, { fullName: 'Test Owner', email: 'owner@example.com', phone: '+919876543210', password }, proof);
    owner = enrollment.account; ownerSecret = new URL(enrollment.enrollmentUri).searchParams.get('secret');
    assert.equal(await AdminAccount.countDocuments({ role: 'OWNER', status: 'ACTIVE' }), 0);
    assert.equal((await AdminAccount.findById(owner._id).select('+passwordHash')).passwordHash.startsWith('$argon2id$'), true);
  });
  await t.test('owner activates only after MFA; duplicate bootstrap and second active owner fail', async () => {
    const validCode = totp(ownerSecret).generate({ timestamp: now });
    const invalidCode = String((Number(validCode) + 1) % 1000000).padStart(6, '0');
    await assert.rejects(completeOwnerBootstrap(req, owner._id, invalidCode, proof), { status: 401 });
    recovery = await completeOwnerBootstrap(req, owner._id, validCode, proof);
    assert.equal(recovery.length, 10); assert.equal(await AdminAccount.countDocuments({ role: 'OWNER', status: 'ACTIVE' }), 1);
    assert.equal((await AdminBootstrap.findById('owner')).state, 'COMPLETE');
    await assert.rejects(beginOwnerBootstrap(req, { fullName: 'Another Owner', email: 'another@example.com', password }, proof), { status: 409 });
    await assert.rejects(AdminAccount.create({ adminId: newAdminId(true), fullName: 'Forbidden second owner', email: 'second@example.com', role: 'OWNER', status: 'ACTIVE', mfaEnabled: true }), error => error.code === 11000);
  });
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function actor() {
    const jar = new Map(); let csrf = '';
    const request = async (path, body, method = body ? 'POST' : 'GET', headers = {}) => {
      const response = await fetch(base + path, { method, headers: { Origin: 'http://localhost:3000', Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), 'X-CSRF-Token': csrf, ...body ? { 'Content-Type': 'application/json' } : {}, ...headers }, ...body ? { body: JSON.stringify(body) } : {} });
      for (const cookie of response.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar.set(name, value); else jar.delete(name); }
      const result = await response.json(); if (result.csrfToken) csrf = result.csrfToken;
      return { status: response.status, body: result, headers: response.headers };
    };
    return request;
  }
  const ownerClient = actor(), staff = actor(), customer = actor();
  async function signIn(client, realm, account, secret, accountPassword = password) {
    now += 31000;
    const begin = await client(`/${realm}/auth/login`, { adminId: account.adminId, password: accountPassword });
    assert.equal(begin.status, 200);
    const result = await client(`/${realm}/auth/mfa/verify`, { challengeToken: begin.body.challengeToken, code: totp(secret).generate({ timestamp: now }) });
    assert.equal(result.status, 200); return result;
  }
  await t.test('public registration cannot assign roles and customer sessions cannot access internal APIs', async () => {
    assert.equal((await customer('/auth/register', { name: 'Customer', email: 'customer@example.com', password, role: 'admin' })).status, 410);
    assert.equal((await customer('/auth/send-otp', { fullName: 'Customer', phone: '+919876543210', channel: 'sms', role: 'ADMIN' })).status, 400);
    const sent = await customer('/auth/send-otp', { fullName: 'Customer', phone: '+919876543210', channel: 'sms' });
    const code = mails.filter(mail => mail.contact === '+919876543210').at(-1).text.match(/\b(\d{6})\b/)[1];
    assert.equal((await customer('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code })).status, 200);
    assert.equal((await actor()('/admin/dashboard')).status, 401);
    assert.equal((await customer('/admin/dashboard')).status, 403);
    assert.equal((await customer('/owner/admins')).status, 403);
    await User.updateOne({ phone: '+919876543210' }, { role: 'admin' });
    assert.equal((await customer('/admin/reviews')).status, 403);
    assert.equal((await customer('/cart')).body.user.role, 'CUSTOMER');
  });
  await t.test('owner password alone never creates a privileged session', async () => {
    const incomplete = actor();
    assert.equal((await incomplete('/owner/auth/login', { adminId: owner.adminId, password })).status, 200);
    assert.equal((await incomplete('/owner/admins')).status, 401);
    assert.equal((await incomplete('/admin/auth/login', { adminId: owner.adminId, password })).status, 401);
    const result = await signIn(ownerClient, 'owner', owner, ownerSecret);
    assert.ok(result.headers.getSetCookie().some(cookie => cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict')));
  });
  await t.test('development password fallbacks and configured fixed MFA codes never grant access', async () => {
    const client = actor();
    for (const fallback of ['123456', 'As@singh8']) {
      assert.equal((await client('/owner/auth/login', { adminId: owner.adminId, password: fallback })).status, 401);
    }
    now += 31000;
    const previous = process.env.ADMIN_MFA_CODE;
    // Select a fixed value that cannot be a legitimate TOTP within the acceptance window.
    const valid = new Set([-30000, 0, 30000].map(offset => totp(ownerSecret).generate({ timestamp: now + offset })));
    const fixed = ['123456', '234567', '345678', '456789'].find(code => !valid.has(code));
    process.env.ADMIN_MFA_CODE = fixed;
    try {
      const begin = await client('/owner/auth/login', { adminId: owner.adminId, password });
      assert.equal(begin.status, 200);
      assert.equal((await client('/owner/auth/mfa/verify', { challengeToken: begin.body.challengeToken, code: fixed })).status, 401);
    } finally {
      if (previous === undefined) delete process.env.ADMIN_MFA_CODE; else process.env.ADMIN_MFA_CODE = previous;
    }
    await AdminAccount.updateOne({ _id: owner._id }, { failedLoginAttempts: 0, $unset: { lockedUntil: '' } });
  });
  await t.test('MFA challenges and codes are single use and realm-bound', async () => {
    now += 31000;
    const client = actor(), begin = await client('/owner/auth/login', { adminId: owner.adminId, password });
    const body = { challengeToken: begin.body.challengeToken, code: totp(ownerSecret).generate({ timestamp: now }) };
    assert.equal((await client('/admin/auth/mfa/verify', body)).status, 401);
    assert.equal((await client('/owner/auth/mfa/verify', body)).status, 200);
    assert.equal((await client('/owner/auth/mfa/verify', body)).status, 401);
    const replay = await client('/owner/auth/login', { adminId: owner.adminId, password });
    assert.equal((await client('/owner/auth/mfa/verify', { ...body, challengeToken: replay.body.challengeToken })).status, 401);
  });
  let invited, staffSecret;
  await t.test('owner invitations require CSRF and cannot grant owner-only roles or permissions', async () => {
    const input = { fullName: 'Inventory Staff', email: 'staff@example.com', phone: '+919876543211', role: 'INVENTORY_MANAGER', permissions: ['dashboard.view', 'products.view', 'inventory.view', 'inventory.update'] };
    assert.equal((await ownerClient('/owner/admins/invite', input, 'POST', { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await ownerClient('/owner/admins/invite', { ...input, permissions: ['owner.staff.manage'] })).status, 400);
    assert.equal((await ownerClient('/owner/admins/invite', { ...input, role: 'OWNER' })).status, 400);
    const result = await ownerClient('/owner/admins/invite', input); assert.equal(result.status, 201);
    invited = result.body.admin; assert.equal(invited.status, 'INVITED'); assert.match(invited.adminId, /^ADM-/);
    const invitationMail = mails.find(mail => mail.subject.includes('staff invitation'));
    const token = invitationMail.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
    assert.equal(invitationMail.text.includes(password), false);
    assert.notEqual((await AdminInvitation.findOne({ accountId: invited.id })).tokenHash, token);
    const verify = await staff('/admin/invitations/request-code', { token }); assert.equal(verify.status, 200);
    const emailCode = mails.filter(mail => mail.contact === input.email && mail.subject.includes('verification')).at(-1).text.match(/\b(\d{6})\b/)[1];
    const verified = await staff('/admin/invitations/verify-email', { challengeToken: verify.body.challengeToken, code: emailCode }); assert.equal(verified.status, 200);
    const enrollment = await staff('/admin/invitations/enroll', { verificationToken: verified.body.verificationToken, password }); assert.equal(enrollment.status, 200); staffSecret = enrollment.body.secret;
    assert.equal((await staff('/admin/dashboard')).status, 401);
    const activated = await staff('/admin/invitations/activate', { enrollmentToken: enrollment.body.enrollmentToken, code: totp(staffSecret).generate({ timestamp: now }) }); assert.equal(activated.status, 200);
    assert.equal((await staff('/admin/invitations/request-code', { token })).status, 401);
    assert.ok((await AdminAccount.findById(invited.id)).emailVerifiedAt);
  });
  await t.test('staff permissions restrict every protected business route and all owner APIs', async () => {
    assert.equal((await staff('/admin/dashboard')).status, 200); assert.equal((await staff('/admin/inventory')).status, 200);
    for (const path of ['/admin/orders', '/admin/customers', '/admin/payments', '/admin/analytics', '/admin/shipping', '/admin/reviews']) assert.equal((await staff(path)).status, 403, path);
    for (const path of ['/owner/admins', '/owner/audit-logs', '/owner/security', '/owner/auth/me']) assert.equal((await staff(path)).status, 403, path);
    assert.equal((await staff('/owner/admins/invite', {})).status, 403);
    assert.equal((await staff(`/owner/admins/${invited.id}/permissions`, { role: 'ADMIN', permissions: ['owner.access'] }, 'PATCH')).status, 403);
    for (const [path, method] of [[`/owner/admins/${invited.id}/status`, 'PATCH'], [`/owner/admins/${invited.id}/revoke-sessions`, 'POST'], ['/owner/security/revoke-other-sessions', 'POST'], ['/owner/auth/passkeys/register/options', 'POST'], ['/owner/auth/passkeys/register/verify', 'POST']]) assert.equal((await staff(path, {}, method)).status, 403, path);
    for (const path of ['/admin/inventory/000000000000000000000000', '/admin/orders/000000000000000000000000', '/admin/reviews/000000000000000000000000']) {
      const result = await customer(path, {}, 'PATCH'); assert.equal(result.status, 403, path);
    }
    assert.equal((await staff('/admin/dashboard')).body.modules.orders, undefined);
  });
  await t.test('owner permission changes revoke sessions; permission inflation in the database is still not owner access', async () => {
    assert.equal((await ownerClient(`/owner/admins/${invited.id}/permissions`, { role: 'SUPPORT_MANAGER', permissions: ['dashboard.view', 'reviews.view', 'reviews.moderate'] }, 'PATCH')).status, 200);
    assert.equal((await staff('/admin/dashboard')).status, 401);
    await signIn(staff, 'admin', invited, staffSecret);
    assert.equal((await staff('/admin/reviews')).status, 200); assert.equal((await staff('/admin/inventory')).status, 403);
    await AdminAccount.updateOne({ _id: invited.id }, { $push: { permissions: 'owner.staff.manage' } });
    assert.equal((await staff('/owner/admins/invite', {})).status, 403);
    assert.equal((await staff('/admin/auth/me')).body.account.permissions.includes('owner.staff.manage'), false);
  });
  await t.test('suspension, reactivation and explicit session termination take effect immediately', async () => {
    assert.equal((await ownerClient(`/owner/admins/${invited.id}/status`, { status: 'SUSPENDED' }, 'PATCH')).status, 200);
    assert.equal((await staff('/admin/auth/me')).status, 401);
    assert.equal((await staff('/admin/auth/login', { adminId: invited.adminId, password })).status, 401);
    assert.equal((await ownerClient(`/owner/admins/${invited.id}/status`, { status: 'ACTIVE' }, 'PATCH')).status, 200);
    await signIn(staff, 'admin', invited, staffSecret);
    assert.equal((await ownerClient(`/owner/admins/${invited.id}/revoke-sessions`, {})).status, 200);
    assert.equal((await staff('/admin/auth/me')).status, 401);
  });
  await t.test('business reporting excludes all demo payments and orders', async () => {
    const product = await Product.findOne({ slug: 'haldi-powder' });
    await Order.collection.insertMany([{ ownerKey: 'isolated', requestKey: 'real-test', publicId: 'isolated-real-test', isDemo: false, paymentMode: 'TEST_REAL_RECORD', paymentStatus: 'PAID', items: [{ productId: product._id, name: product.name, quantity: 2, lineTotalPaise: 20000 }] }, { ownerKey: 'isolated', requestKey: 'demo-test', publicId: 'isolated-demo-test', isDemo: true, paymentMode: 'DEMO', paymentStatus: 'PAID_DEMO', items: [{ quantity: 999, lineTotalPaise: 99999999 }] }]);
    await Payment.collection.insertMany([{ orderId: new mongoose.Types.ObjectId(), isDemo: false, paymentMode: 'TEST_REAL_RECORD', status: 'PAID', amountPaise: 20000, refundedAmountPaise: 1000 }, { orderId: new mongoose.Types.ObjectId(), isDemo: true, paymentMode: 'DEMO', status: 'PAID_DEMO', amountPaise: 99999999 }]);
    const result = await ownerClient('/owner/dashboard');
    assert.equal(result.body.modules.orders.total, 1); assert.equal(result.body.modules.analytics.unitsSold, 2);
    assert.equal(result.body.modules.payments.collectedPaise, 20000); assert.equal(result.body.modules.payments.netCollectedPaise, 19000);
  });
  await t.test('review moderation is preserved for authorized separate staff sessions and audited', async () => {
    await signIn(staff, 'admin', invited, staffSecret);
    const product = await Product.findOne(); const user = await User.findOne();
    const review = await Review.create({ productId: product._id, userId: user._id, displayName: 'Isolated test reviewer', rating: 4, comment: 'A synthetic review in the isolated security test database.' });
    assert.equal((await staff(`/admin/reviews/${review.id}`, { approved: true }, 'PATCH')).status, 200);
    assert.equal((await Review.findById(review._id)).approved, true);
    assert.ok(await AdminAuditLog.exists({ action: 'REVIEW_MODERATED', actorId: invited.id }));
  });
  await t.test('failed logins are monitored and lock the staff account', async () => {
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await actor()('/admin/auth/login', { adminId: invited.adminId, password: 'incorrect-password' })).status, 401);
    assert.ok((await AdminAccount.findById(invited.id)).lockedUntil > new Date(now));
    assert.equal((await staff('/admin/auth/login', { adminId: invited.adminId, password })).status, 401);
  });
  await t.test('secrets, challenge codes, and session tokens are never stored in plaintext', async () => {
    const record = await AdminAccount.findById(owner._id).select('+mfaSecretEncrypted +passwordHash +recoveryCodes');
    assert.equal(decryptSecret(record.mfaSecretEncrypted, config, record.id), ownerSecret);
    const raw = JSON.stringify({ account: record.toObject(), sessions: await AdminSession.find().select('+tokenHash').lean(), challenges: await AdminChallenge.find().lean() });
    assert.equal(raw.includes(password), false); assert.equal(raw.includes(ownerSecret), false); assert.equal(raw.includes(recovery[0]), false);
  });
  await t.test('customer OTP is one-use, expires, and does not create privileged accounts', async () => {
    const otpClient = actor(); const challenge = await otpClient('/auth/send-otp', { channel: 'sms', phone: '+919876540101', fullName: 'OTP Customer' }); assert.equal(challenge.status, 200);
    const code = mails.filter(mail => mail.contact === '+919876540101').at(-1).text.match(/\b(\d{6})\b/)[1];
    assert.equal((await otpClient('/auth/otp/verify', { challengeToken: challenge.body.challengeToken, code })).status, 200);
    assert.equal((await otpClient('/auth/otp/verify', { challengeToken: challenge.body.challengeToken, code })).status, 401);
    assert.equal((await otpClient('/owner/admins')).status, 403);
    const expired = await actor()('/auth/send-otp', { channel: 'sms', phone: '+919876540102', fullName: 'Expired Code' }); now += 6 * 60000;
    assert.equal((await otpClient('/auth/otp/verify', { challengeToken: expired.body.challengeToken, code: '000000' })).status, 401);
  });
  await t.test('owner recovery requires identity proof and invalidates all previous sessions', async () => {
    const newSecret = newMfaSecret(), code = totp(newSecret).generate({ timestamp: now });
    await assert.rejects(recoverOwner(req, { adminId: owner.adminId, password, recoveryCode: recovery[0], newSecret, code }, { ...proof, actualOsUser: 'unauthorized' }), { status: 403 });
    const newCodes = await recoverOwner(req, { adminId: owner.adminId, password, recoveryCode: recovery[0], newSecret, code }, proof); assert.equal(newCodes.length, 10);
    assert.equal((await ownerClient('/owner/admins')).status, 401); assert.equal(await AdminAccount.countDocuments({ role: 'OWNER', status: 'ACTIVE' }), 1);
    await assert.rejects(recoverOwner(req, { adminId: owner.adminId, password, recoveryCode: recovery[0], newSecret, code }, proof), { status: 403 });
    ownerSecret = newSecret; await signIn(ownerClient, 'owner', owner, ownerSecret);
  });
  await t.test('revoked staff lose both login and existing session access', async () => {
    assert.equal((await ownerClient(`/owner/admins/${invited.id}/status`, { status: 'REVOKED' }, 'PATCH')).status, 200);
    assert.equal((await staff('/admin/auth/me')).status, 401);
    assert.equal((await staff('/admin/auth/login', { adminId: invited.adminId, password })).status, 401);
    assert.equal((await AdminAccount.findById(invited.id)).status, 'REVOKED');
  });
  await t.test('phone OTP customers need no fabricated email and challenge guessing is limited', async () => {
    for (const [channel, contact] of [['sms', '+919876540001'], ['whatsapp', '+919876540002']]) {
      const client = actor(); const challenge = await client('/auth/send-otp', { channel, phone: contact, fullName: 'Phone Customer' });
      const code = mails.filter(mail => mail.contact === contact).at(-1).text.match(/\b(\d{6})\b/)[1];
      assert.equal((await client('/auth/otp/verify', { challengeToken: challenge.body.challengeToken, code })).status, 200);
      const user = await User.findOne({ phone: contact }); assert.equal(user.email, undefined); assert.equal(user.role, 'CUSTOMER');
    }
    const client = actor(); const challenge = await client('/auth/send-otp', { channel: 'sms', phone: '+919876540103', fullName: 'Guessing Customer' });
    const code = mails.filter(mail => mail.contact === '+919876540103').at(-1).text.match(/\b(\d{6})\b/)[1];
    const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await client('/auth/otp/verify', { challengeToken: challenge.body.challengeToken, code: wrong })).status, 401);
    assert.equal((await client('/auth/otp/verify', { challengeToken: challenge.body.challengeToken, code })).status, 429);
  });
  await t.test('audit history is owner-only, append-only, and contains the access lifecycle', async () => {
    const result = await ownerClient('/owner/audit-logs'); assert.equal(result.status, 200);
    for (const action of ['OWNER_BOOTSTRAP_COMPLETED', 'ADMIN_INVITED', 'ADMIN_PERMISSIONS_CHANGED', 'ADMIN_SUSPENDED', 'ADMIN_REACTIVATED', 'STAFF_SESSIONS_REVOKED', 'STAFF_LOGIN_FAILED', 'OWNER_MFA_RECOVERED']) assert.ok(await AdminAuditLog.exists({ action }), action);
    await assert.rejects(AdminAuditLog.deleteMany({}), /append-only/);
    assert.equal((await ownerClient(`/owner/admins/${owner.id}/status`, { status: 'REVOKED' }, 'PATCH')).status, 404);
    assert.equal((await ownerClient('/owner/security/revoke-other-sessions', {})).status, 200);
  });
  await t.test('malformed passkey responses cannot bypass MFA or create sessions', async () => {
    const before = await AdminSession.countDocuments();
    assert.equal((await actor()('/owner/auth/passkeys/verify', { challengeToken: randomToken(), response: {} })).status, 401);
    assert.equal(await AdminSession.countDocuments(), before);
  });
  await t.test('production refuses development verification and uses secure separate session cookies', async () => {
    const production = createApp({ config: { ...config, nodeEnv: 'production', authDevPreview: true, deliveryAdapter: null, brevoApiKey: null, twilioSid: null } }).listen(0, '127.0.0.1');
    await new Promise(resolve => production.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${production.address().port}/api/v1`;
      const post = async (path, body, origin = 'http://localhost:3000') => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
      const unavailable = await post('/auth/send-otp', { channel: 'sms', phone: '+919876540104', fullName: 'No Preview Customer' });
      assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).developmentCode, undefined);
      assert.equal((await post('/owner/auth/login', { adminId: owner.adminId, password }, 'https://untrusted.example')).status, 403);
      now += 31000;
      const challenge = await (await post('/owner/auth/login', { adminId: owner.adminId, password })).json();
      const authenticated = await post('/owner/auth/mfa/verify', { challengeToken: challenge.challengeToken, code: totp(ownerSecret).generate({ timestamp: now }) });
      assert.equal(authenticated.status, 200);
      assert.ok(authenticated.headers.getSetCookie().some(cookie => cookie.startsWith('son_owner_session=') && cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict')));
      await AdminAccount.updateOne({ _id: invited.id }, { status: 'ACTIVE', verificationSource: 'DEVELOPMENT_PREVIEW', emailVerifiedAt: null, $unset: { lockedUntil: '' } });
      assert.equal((await post('/admin/auth/login', { adminId: invited.adminId, password })).status, 401);
      let limited;
      for (let attempt = 0; attempt < 9; attempt++) limited = await post('/owner/auth/login', { adminId: 'UNKNOWN-OWNER', password });
      assert.equal(limited.status, 429);
    } finally { await new Promise(resolve => production.close(resolve)); }
  });
  await t.test('staff authentication, MFA and CSRF failures are logged without credentials', () => {
    assert.ok(logs.some(record => record.reason === 'credentials_or_account_unavailable'));
    assert.ok(logs.some(record => record.reason === 'mfa_invalid_or_replayed'));
    assert.ok(logs.some(record => record.reason === 'csrf_token_rejected'));
    assert.ok(logs.some(record => record.operation === 'owner.mfa.verify' && record.status === 200));
    for (const secret of [password, ownerSecret, setupSecret, 'owner@example.com', 'challengeToken', 'csrfToken']) assert.ok(!JSON.stringify(logs).includes(secret));
  });
});
