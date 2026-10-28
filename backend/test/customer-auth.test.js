import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { initializeModels } from '../src/config/models.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../scripts/seed-demo.js';
import User from '../src/models/User.js';
import Order from '../src/models/Order.js';
import Product from '../src/models/Product.js';
import ProductVariant from '../src/models/ProductVariant.js';
import Cart from '../src/models/Cart.js';
import { createDemoOrder, publicOrder } from '../src/services/paymentService.js';
import { CustomerOtp, CustomerSession } from '../src/models/customerAuthentication.js';
import { CUSTOMER_IDLE_MS, CUSTOMER_MAX_MS, tokenHash } from '../src/services/customerSessionService.js';
import { deliver } from '../src/services/authDelivery.js';

test('passwordless customer identity, OTP delivery, persistence, and private shopping', async t => {
  const testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) {
    t.skip('Set MONGODB_TEST_URI to an isolated replica set; integration tests never use MONGODB_URI.');
    return;
  }
  const databaseName = `son_masala_test_customer_auth_${Date.now()}_${process.pid}`;
  await mongoose.connect(testUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => { if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_customer_auth_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels(); await seedDemo();
  let now = Date.now(); const messages = [];
  const config = { nodeEnv: 'test', demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => now, deliveryAdapter: async message => messages.push(message) };
  const application = createApp({ config }); const server = application.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function actor(saved = []) {
    const jar = new Map(saved);
    const request = async (path, body, method = body ? 'POST' : 'GET', headers = {}) => {
      const response = await fetch(base + path, { method, headers: { Origin: 'http://localhost:3000', Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), ...body ? { 'Content-Type': 'application/json' } : {}, ...headers }, ...body ? { body: JSON.stringify(body) } : {} });
      for (const cookie of response.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar.set(name, value); else jar.delete(name); }
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
    request.jar = jar; return request;
  }
  const start = (client, phone, fullName = 'आशा O’Connor', channel = 'sms') => client('/auth/send-otp', { fullName, phone, channel });
  const codeFor = phone => messages.filter(message => message.contact === phone).at(-1).text.match(/\b(\d{6})\b/)[1];
  async function signIn(client, phone, fullName) { const sent = await start(client, phone, fullName); assert.equal(sent.status, 200); const result = await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(phone) }); assert.equal(result.status, 200); return result; }
  const phone = '+919876543210', client = actor(); let userId, sessionCookie;
  await t.test('validates Indian mobiles, Unicode names, strict input, and retires password/email sign-in', async () => {
    for (const value of ['1234567890', '+441234567890', '98765abc10', '987654321', '98765432101']) assert.equal((await start(actor(), value)).status, 400);
    assert.equal((await start(actor(), phone, ' ')).status, 400);
    assert.equal((await client('/auth/send-otp', { phone, fullName: 'Test', channel: 'sms', role: 'OWNER' })).status, 400);
    assert.equal((await client('/auth/send-otp', { contact: 'legacy@example.com', channel: 'email' })).status, 400);
    for (const path of ['/auth/register', '/auth/login']) assert.equal((await client(path, { email: 'legacy@example.com', password: 'Not a sign-in method' })).status, 410);
    assert.equal(await User.countDocuments(), 0);
  });
  await t.test('new customer is created only after a valid, hashed OTP and receives a persistent secure session', async () => {
    const sent = await start(client, '9876543210', '  आशा   O’Connor  '); assert.equal(sent.status, 200); assert.equal(sent.body.phone, phone);
    assert.equal(sent.body.developmentCode, undefined); assert.equal(await User.countDocuments(), 0);
    const raw = await CustomerOtp.findOne({ phone }).select('+codeHash +tokenHash');
    assert.notEqual(raw.tokenHash, sent.body.challengeToken); assert.notEqual(raw.codeHash, codeFor(phone));
    const result = await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(phone) });
    assert.equal(result.status, 200); userId = result.body.user.id;
    assert.equal(result.body.user.name, 'आशा O’Connor'); assert.equal(result.body.user.phoneVerified, true); assert.equal(result.body.user.role, 'CUSTOMER');
    const user = await User.findById(userId); assert.ok(user.createdAt); assert.ok(user.phoneVerifiedAt); assert.equal(user.email, undefined);
    assert.ok(result.headers.getSetCookie().some(cookie => cookie.startsWith('son_customer_session=') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('Expires=')));
    sessionCookie = client.jar.get('son_customer_session'); assert.equal(sessionCookie.length, 43);
    assert.notEqual((await CustomerSession.findOne({ userId }).select('+tokenHash')).tokenHash, sessionCookie);
    assert.equal((await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(phone) })).status, 401);
  });
  await t.test('active sessions survive refresh and browser-cookie restoration without sending another OTP', async () => {
    const reopened = actor([...client.jar]); const before = messages.length;
    assert.equal((await reopened('/auth/me')).body.user.id, userId);
    assert.equal((await reopened('/cart')).body.user.id, userId);
    const sent = await start(reopened, phone, 'Another submitted name'); assert.equal(sent.body.authenticated, true); assert.equal(messages.length, before);
    assert.equal((await User.findById(userId)).name, 'आशा O’Connor');
  });
  await t.test('normal use renews inactivity expiration without exceeding the maximum lifetime', async () => {
    const original = await CustomerSession.findOne({ userId }); now += 6 * 60000;
    const renewed = await client('/auth/me'); assert.equal(renewed.body.user.id, userId); assert.ok(renewed.headers.getSetCookie().some(cookie => cookie.startsWith('son_customer_session=')));
    const current = await CustomerSession.findById(original._id); assert.equal(current.expiresAt.getTime(), now + CUSTOMER_IDLE_MS); assert.equal(current.absoluteExpiresAt.getTime(), original.absoluteExpiresAt.getTime());
    assert.ok(current.expiresAt <= current.absoluteExpiresAt);
  });
  await t.test('logout revokes the server session, including a copied old cookie', async () => {
    assert.equal((await client('/auth/logout', {})).status, 200);
    assert.equal((await actor([['son_customer_session', sessionCookie]])('/auth/me')).body.user, null);
    assert.equal((await client('/auth/me')).body.user, null);
  });
  await t.test('name and existing number never bypass OTP; verified returning customers retain their ID and saved name', async () => {
    now += 61000;
    const sent = await start(client, phone, 'Incorrect submitted name'); assert.equal(sent.status, 200);
    assert.equal((await client('/auth/me')).body.user, null);
    const result = await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(phone) });
    assert.equal(result.status, 200); assert.equal(result.body.user.id, userId); assert.equal(result.body.user.name, 'आशा O’Connor');
    assert.equal(await User.countDocuments({ phone }), 1); assert.equal((await User.findById(userId)).lastLoginAt.getTime(), now);
  });
  await t.test('resend cooldown is shared across channels; resend invalidates the previous challenge', async () => {
    const tester = actor(), mobile = '+919876543211'; const original = await start(tester, mobile);
    assert.equal((await start(actor(), mobile, 'Other Name', 'whatsapp')).status, 429);
    const cooldown = await tester('/auth/resend-otp', { challengeToken: original.body.challengeToken }); assert.equal(cooldown.status, 429); assert.equal(cooldown.headers.get('retry-after'), '60');
    now += 61000;
    const second = await tester('/auth/resend-otp', { challengeToken: original.body.challengeToken }); assert.equal(second.status, 200);
    assert.equal((await tester('/auth/verify-otp', { challengeToken: original.body.challengeToken, code: codeFor(mobile) })).status, 401);
    assert.equal((await tester('/auth/verify-otp', { challengeToken: second.body.challengeToken, code: codeFor(mobile) })).status, 200);
  });
  await t.test('incorrect codes are bounded; expired challenges cannot sign in but can request a new code', async () => {
    const tester = actor(), mobile = '+919876543212'; const sent = await start(tester, mobile), real = codeFor(mobile), wrong = String((Number(real) + 1) % 1000000).padStart(6, '0');
    for (let attempt = 0; attempt < 5; attempt++) assert.equal((await tester('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: wrong })).status, 401);
    assert.equal((await tester('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: real })).status, 429);
    now += 6 * 60000;
    const expired = await tester('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: real }); assert.equal(expired.status, 401); assert.match(expired.body.message, /expired/);
    assert.equal((await tester('/auth/resend-otp', { challengeToken: sent.body.challengeToken })).status, 200);
  });
  await t.test('parallel send requests and verification replays cannot create duplicate customers', async () => {
    const mobile = '+919876543213', first = actor(), second = actor();
    const sends = await Promise.all([start(first, mobile), start(second, mobile)]); assert.deepEqual(sends.map(result => result.status).sort(), [200, 429]);
    const sent = sends.find(result => result.status === 200);
    const verified = await Promise.all([first('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(mobile) }), second('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(mobile) })]);
    assert.deepEqual(verified.map(result => result.status).sort(), [200, 401]); assert.equal(await User.countDocuments({ phone: mobile }), 1);
  });
  await t.test('mobile send limits persist across new browsers and return rate-limit messages', async () => {
    const mobile = '+919876543214';
    for (let index = 0; index < 6; index++) { assert.equal((await start(actor(), mobile)).status, 200); now += 61000; }
    const result = await start(actor(), mobile); assert.equal(result.status, 429); assert.match(result.body.message, /Too many codes/);
  });
  await t.test('guest cart and guest-owned order history merge transactionally, without exposing another customer', async () => {
    const product = await Product.findOne({ slug: 'haldi-powder' }); const variant = await ProductVariant.findOne({ productId: product._id });
    const guest = actor(); await guest('/cart/items', { productId: product.id, variantId: variant.id, quantity: 2 });
    const delivery = { fullName: 'Test Guest', email: 'synthetic@example.com', phone: '9876543215', address: '123 Synthetic Street', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
    assert.equal((await guest('/demo-payments', { action: 'create', delivery, requestKey: crypto.randomUUID() })).status, 401);
    // Preserve transfer of historical guest orders; new public checkout now requires login.
    const guestCart = await Cart.findById((await guest('/cart')).body.cart.id);
    const legacy = await createDemoOrder({ ownerKey: guestCart.ownerKey, app: { locals: { config, databaseName: () => databaseName } } }, { delivery, requestKey: crypto.randomUUID() });
    const pending = { body: { order: publicOrder(legacy) } };
    const result = await signIn(guest, '+919876543215', 'Test Guest');
    assert.equal((await guest('/cart')).body.cart.count, 2);
    assert.equal((await guest('/orders/' + pending.body.order.id)).status, 200);
    const history = await guest('/auth/orders'); assert.equal(history.body.orders[0].id, pending.body.order.id);
    assert.equal((await client('/auth/orders')).body.orders.length, 0); assert.equal((await client('/orders/' + pending.body.order.id)).status, 404);
    assert.equal(String((await Order.findOne({ publicId: pending.body.order.id })).userId), result.body.user.id);
  });
  await t.test('customers cannot access staff/owner APIs or bypass account suspension', async () => {
    for (const path of ['/admin/dashboard', '/owner/admins', '/owner/audit-logs']) assert.equal((await client(path)).status, 403);
    await User.updateOne({ _id: userId }, { accountStatus: 'SUSPENDED' }); assert.equal((await client('/auth/me')).body.user, null);
    now += 61000; const sent = await start(client, phone); assert.equal((await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor(phone) })).status, 403);
    await User.updateOne({ _id: userId }, { accountStatus: 'ACTIVE' });
  });
  await t.test('other-device revocation and inactivity/maximum expiration are enforced on every request', async () => {
    const first = actor(), second = actor(); now += 61000; await signIn(first, phone); now += 61000; await signIn(second, phone);
    assert.equal((await first('/auth/revoke-other-sessions', {})).status, 200); assert.equal((await second('/auth/me')).body.user, null);
    const active = await CustomerSession.findOne({ tokenHash: tokenHash(first.jar.get('son_customer_session')) });
    await CustomerSession.updateOne({ _id: active._id }, { expiresAt: new Date(now - 1) }); assert.equal((await first('/auth/me')).body.user, null);
    now += 61000; await signIn(first, phone);
    await CustomerSession.updateOne({ tokenHash: tokenHash(first.jar.get('son_customer_session')) }, { absoluteExpiresAt: new Date(now - 1), expiresAt: new Date(now + CUSTOMER_IDLE_MS) }); assert.equal((await first('/auth/me')).body.user, null);
    assert.equal(CUSTOMER_MAX_MS, 90 * 86400000);
  });
  await t.test('SMS and WhatsApp provider failures fail closed, with no preview or account/session creation', async () => {
    const deliveryReq = { app: { locals: { config: { ...config, deliveryAdapter: null, authDevPreview: true, twilioSid: 'AC' + '1'.repeat(32), twilioToken: 'synthetic-test-secret', smsFrom: '+15550000001', whatsappFrom: 'whatsapp:+15550000002', whatsappOtpContentSid: 'HX' + '2'.repeat(32), providerFetch: async () => new Response('{}', { status: 503 }) }, databaseName: () => databaseName } } };
    for (const channel of ['sms', 'whatsapp']) await assert.rejects(deliver(deliveryReq, { channel, contact: phone, text: 'synthetic code', authenticationCode: '123456' }), { status: 503 });
    const before = await User.countDocuments(); const previous = application.locals.config.deliveryAdapter; application.locals.config.deliveryAdapter = async () => { throw Object.assign(new Error('Test provider unavailable'), { status: 503 }); };
    const failed = await start(actor(), '+919876543216'); assert.equal(failed.status, 503); assert.equal(failed.body.challengeToken, undefined); assert.equal(failed.body.developmentCode, undefined);
    assert.equal(await User.countDocuments(), before); assert.equal((await CustomerOtp.findOne({ phone: '+919876543216' })).status, 'FAILED'); application.locals.config.deliveryAdapter = previous;
  });
  await t.test('approved WhatsApp authentication templates and SMS sender settings reach the provider correctly', async () => {
    const calls = []; const deliveryReq = { app: { locals: { config: { ...config, deliveryAdapter: null, twilioSid: 'AC' + '1'.repeat(32), twilioToken: 'synthetic-test-secret', smsMessagingServiceSid: 'MG' + '3'.repeat(32), whatsappFrom: 'whatsapp:+15550000002', whatsappOtpContentSid: 'HX' + '2'.repeat(32), providerFetch: async (_url, options) => { calls.push(options.body); return Response.json({ sid: 'SM' + '4'.repeat(32), status: 'queued' }); } } } } };
    await deliver(deliveryReq, { channel: 'whatsapp', contact: phone, authenticationCode: '123456' });
    assert.equal(calls[0].get('ContentSid'), 'HX' + '2'.repeat(32)); assert.deepEqual(JSON.parse(calls[0].get('ContentVariables')), { 1: '123456' }); assert.equal(calls[0].has('Body'), false);
    await deliver(deliveryReq, { channel: 'sms', contact: phone, text: 'Synthetic OTP message', authenticationCode: '123456' }); assert.equal(calls[1].get('MessagingServiceSid'), 'MG' + '3'.repeat(32));
    delete deliveryReq.app.locals.config.whatsappOtpContentSid; await assert.rejects(deliver(deliveryReq, { channel: 'whatsapp', contact: phone, authenticationCode: '123456' }), { status: 503 });
  });
  await t.test('untrusted login/logout origins are denied and legacy JWT cookies are not trusted', async () => {
    assert.equal((await actor()('/auth/send-otp', { phone, fullName: 'Test', channel: 'sms' }, 'POST', { Origin: 'https://other.example' })).status, 403);
    assert.equal((await actor()('/auth/logout', {}, 'POST', { Origin: '' })).status, 403);
    assert.equal((await actor([['son_session', 'a.legacy.jwt']])('/auth/me')).body.user, null);
  });
  await t.test('legacy national phone records normalize without losing identity; conflicting records are not silently merged', async () => {
    const legacy = await User.create({ name: 'Saved Legacy Name', phone: '9876543217' });
    const result = await signIn(actor(), '+919876543217', 'A different submitted name');
    assert.equal(result.body.user.id, legacy.id); assert.equal(result.body.user.name, legacy.name); assert.equal((await User.findById(legacy._id)).phone, '+919876543217');
    await User.create([{ name: 'Legacy Duplicate', phone: '9876543218' }, { name: 'Normalized Duplicate', phone: '+919876543218' }]);
    const tester = actor(), sent = await start(tester, '+919876543218');
    assert.equal((await tester('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code: codeFor('+919876543218') })).status, 409);
    assert.equal((await tester('/auth/me')).body.user, null); assert.equal(await User.countDocuments({ phone: { $in: ['9876543218', '+919876543218'] } }), 2);
  });
  await t.test('renewal near the maximum lifetime caps both cookie and database expiration', async () => {
    const tester = actor(); now += 61000; await signIn(tester, '+919876543221');
    const hash = tokenHash(tester.jar.get('son_customer_session')), deadline = new Date(now + 60000);
    await CustomerSession.updateOne({ tokenHash: hash }, { absoluteExpiresAt: deadline, lastSeenAt: new Date(now - 6 * 60000) });
    const result = await tester('/auth/me'); assert.equal(result.status, 200); assert.ok(result.body.user);
    assert.equal((await CustomerSession.findOne({ tokenHash: hash })).expiresAt.getTime(), deadline.getTime());
    assert.ok(result.headers.getSetCookie().some(cookie => cookie.startsWith('son_customer_session=') && cookie.includes('Max-Age=60')));
  });
  await t.test('production cookies are Secure, preview credentials never authenticate, and per-IP limits apply', async () => {
    const productionApp = createApp({ config: { ...config, deliveryAdapter: async message => messages.push(message), twilioSid: null, twilioToken: null, smtpHost: null } });
    const productionServer = productionApp.listen(0, '127.0.0.1'); await new Promise(resolve => productionServer.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${productionServer.address().port}/api/v1`;
      const post = (path, body, cookie = '') => fetch(url + path, { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
      const sent = await (await post('/auth/send-otp', { fullName: 'Production Cookie Test', phone: '+919876543219', channel: 'sms' })).json();
      // Switch only cookie policy after an in-memory transport accepted the test OTP; no messages leave tests.
      productionApp.locals.config.nodeEnv = 'production';
      const verified = await post('/auth/verify-otp', { challengeToken: sent.challengeToken, code: codeFor('+919876543219') }); assert.equal(verified.status, 200);
      assert.ok(verified.headers.getSetCookie().some(cookie => cookie.startsWith('son_customer_session=') && cookie.includes('Secure') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax')));
      const savedUser = await User.findById(userId), raw = randomBytes(32).toString('base64url');
      await CustomerSession.create({ userId: savedUser._id, tokenHash: tokenHash(raw), verificationSource: 'DEVELOPMENT_PREVIEW', lastSeenAt: new Date(now), expiresAt: new Date(now + CUSTOMER_IDLE_MS), absoluteExpiresAt: new Date(now + CUSTOMER_MAX_MS) });
      const rejected = await fetch(url + '/auth/me', { headers: { Cookie: `son_customer_session=${raw}` } }); assert.equal((await rejected.json()).user, null);
      productionApp.locals.config.authDevPreview = true;
      const unavailable = await post('/auth/send-otp', { fullName: 'Production Delivery Test', phone: '+919876543220', channel: 'sms' }); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).developmentCode, undefined);
      let limited;
      for (let attempt = 0; attempt < 30; attempt++) limited = await post('/auth/send-otp', {});
      assert.equal(limited.status, 429);
    } finally { await new Promise(resolve => productionServer.close(resolve)); }
  });
});
