import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { sendOtpEmail } from '../src/services/emailService.js';
import { initializeModels } from '../src/config/models.js';
import User from '../src/models/User.js';
import { EmailOtp } from '../src/models/emailAuthentication.js';

test('email OTP registration, returning login, concurrency, expiry and delivery failures', async t => {
  if (!process.env.MONGODB_TEST_URI) return t.skip('Requires an isolated MongoDB replica set.');
  const databaseName = `son_masala_test_email_${Date.now()}_${process.pid}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: databaseName });
  t.after(async () => {
    if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_email_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await initializeModels();
  let now = Date.now();
  const messages = [];
  const logs = [];
  const config = { nodeEnv: 'test', testLogSink: record => logs.push(record), mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => now,
    emailDeliveryAdapter: async message => messages.push(message) };
  const app = createApp({ config });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function actor() {
    const jar = new Map();
    return async (path, body, origin = 'http://localhost:3000', headers = {}) => {
      const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
        Origin: origin, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      for (const cookie of response.headers.getSetCookie()) { const [k, v] = cookie.split(';')[0].split('='); if (v) jar.set(k, v); else jar.delete(k); }
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
  }
  const send = (client, email, profile = {}) => client('/auth/email/send-otp', { email, ...profile });
  const verify = (client, challenge, code = messages.at(-1).code, profile = {}) => client('/auth/email/verify-otp', { challengeToken: challenge.body.challengeToken, code, ...profile });
  const profile = { fullName: 'Email Shopper', phone: '+919876543210' };
  let userId;
  await t.test('concurrent dispatches and completed retries send exactly one email per action', async () => {
    const client = actor(), before = messages.length;
    const key = randomBytes(24).toString('hex');
    const headers = { 'Idempotency-Key': key };
    const payload = { email: 'idempotent@example.com', ...profile };
    const request = (body = payload) => client('/auth/email/send-otp', body, 'http://localhost:3000', headers);
    const results = await Promise.all(Array.from({ length: 8 }, () => request()));
    assert.equal(messages.length, before + 1);
    assert.ok(results.some(result => result.status === 200));
    assert.ok(results.every(result => [200, 409].includes(result.status)));
    const first = results.find(result => result.status === 200);
    // Retry after the throttle cooldown still replays the original action.
    now += 61000;
    const replay = await request();
    assert.equal(replay.status, 200);
    assert.equal(replay.body.challengeToken, first.body.challengeToken);
    assert.equal(messages.length, before + 1);
    assert.equal((await request({ ...payload, email: 'other@example.com' })).status, 409);
    const resendHeaders = { 'Idempotency-Key': randomBytes(24).toString('hex') };
    const resend = () => client('/auth/email/resend-otp', { challengeToken: first.body.challengeToken }, 'http://localhost:3000', resendHeaders);
    const fresh = await resend();
    assert.equal(fresh.status, 200);
    assert.equal((await resend()).body.challengeToken, fresh.body.challengeToken);
    assert.equal(messages.length, before + 2);
    const code = messages.at(-1).code;
    assert.equal((await verify(client, fresh, code)).status, 200);
    assert.equal((await request()).status, 200); // Authenticated requests never dispatch.
    assert.equal(messages.length, before + 2);
    assert.equal((await actor()('/auth/email/send-otp', payload, 'http://localhost:3000', headers)).status, 409);
  });
  await t.test('different action keys for the same email cannot dispatch concurrently', async () => {
    const before = messages.length;
    const results = await Promise.all(Array.from({ length: 6 }, () => actor()('/auth/email/send-otp', { email: 'different-keys@example.com', ...profile }, 'http://localhost:3000', { 'Idempotency-Key': randomBytes(24).toString('hex') })));
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.ok(results.every(result => [200, 429].includes(result.status)));
    assert.equal(messages.length, before + 1);
  });
  await t.test('creates only after verification, stores hashes and keeps mobile unverified', async () => {
    const client = actor(), sent = await send(client, 'shopper@example.com', profile);
    assert.equal(sent.status, 200); assert.equal(sent.body.developmentCode, undefined);
    assert.equal(await User.countDocuments({ email: 'shopper@example.com' }), 0);
    const challenge = await EmailOtp.findOne({ email: 'shopper@example.com' }).select('+codeHash +tokenHash');
    assert.notEqual(challenge.codeHash, messages.at(-1).code); assert.notEqual(challenge.tokenHash, sent.body.challengeToken);
    const result = await verify(client, sent);
    assert.equal(result.status, 200); userId = result.body.user.id;
    const user = await User.findById(userId);
    assert.equal(user.pendingPhone, profile.phone); assert.equal(user.phone, undefined); assert.equal(user.phoneVerified, false);
    assert.equal(user.emailVerified, true);
    assert.ok(result.headers.getSetCookie().some(cookie => cookie.startsWith('son_customer_session=') && cookie.includes('HttpOnly')));
    assert.equal((await client('/auth/me')).body.user.id, userId);
    assert.equal((await client('/auth/me')).headers.get('cache-control'), 'no-store');
    assert.equal((await verify(actor(), sent)).status, 401);
    assert.equal((await client('/auth/logout', {})).status, 200);
    assert.equal((await client('/auth/me')).body.user, null);
  });
  await t.test('returning customers need email only and retain profile', async () => {
    now += 61000;
    const client = actor(), sent = await send(client, 'shopper@example.com');
    assert.equal(sent.status, 200);
    const result = await verify(client, sent);
    assert.equal(result.status, 200); assert.equal(result.body.user.id, userId); assert.equal(result.body.user.name, profile.fullName);
  });
  await t.test('unknown email gets the same send response and profile prompt only after proof', async () => {
    const client = actor(), sent = await send(client, 'new@example.com');
    assert.equal(sent.status, 200); assert.equal(sent.body.requiresProfile, undefined);
    const required = await verify(client, sent);
    assert.equal(required.status, 422); assert.equal(required.body.requiresProfile, true);
    assert.equal((await verify(client, sent, messages.at(-1).code, profile)).status, 200);
    assert.equal(await User.countDocuments({ pendingPhone: profile.phone, email: { $in: ['shopper@example.com', 'new@example.com'] } }), 2);
  });
  await t.test('cooldown, resend invalidation and expiry are enforced', async () => {
    const client = actor(), sent = await send(client, 'resend@example.com', profile);
    assert.equal((await send(actor(), 'resend@example.com', profile)).status, 429);
    now += 61000;
    const fresh = await client('/auth/email/resend-otp', { challengeToken: sent.body.challengeToken });
    assert.equal(fresh.status, 200); assert.equal((await verify(client, sent)).status, 401);
    now += 300001;
    assert.equal((await verify(client, fresh)).status, 401);
  });
  await t.test('parallel wrong guesses are bounded and correct-code replays have one winner', async () => {
    const sent = await send(actor(), 'guesses@example.com', profile), real = messages.at(-1).code;
    const wrong = String((Number(real) + 1) % 1000000).padStart(6, '0');
    const guesses = await Promise.all(Array.from({ length: 12 }, () => verify(actor(), sent, wrong)));
    assert.equal(guesses.filter(result => result.status === 401).length, 5);
    assert.equal((await EmailOtp.findOne({ email: 'guesses@example.com' })).attempts, 5);
    assert.equal((await verify(actor(), sent, real)).status, 429);
    const concurrent = await send(actor(), 'parallel@example.com', profile), code = messages.at(-1).code;
    const results = await Promise.all([verify(actor(), concurrent, code), verify(actor(), concurrent, code)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
    assert.equal(await User.countDocuments({ email: 'parallel@example.com' }), 1);
  });
  await t.test('unverified legacy email cannot claim another identity', async () => {
    await User.create({ name: 'Legacy', email: 'legacy@example.com', phone: '+919876543299', phoneVerified: true });
    const sent = await send(actor(), 'legacy@example.com', profile);
    assert.equal((await verify(actor(), sent)).status, 409);
    assert.equal((await User.findOne({ email: 'legacy@example.com' })).emailVerified, false);
  });
  await t.test('missing Brevo configuration fails honestly, production ignores test delivery adapters, and CSRF stays enforced', async () => {
    app.locals.config.emailDeliveryAdapter = null;
    Object.assign(app.locals.config, { brevoApiKey: null, brevoSenderEmail: null });
    const unavailable = await send(actor(), 'missing@example.com', profile);
    assert.equal(unavailable.status, 503);
    assert.match(unavailable.body.message, /Email delivery is not configured/);
    assert.equal((await EmailOtp.findOne({ email: 'missing@example.com' })).status, 'FAILED');
    app.locals.config.nodeEnv = 'production';
    app.locals.config.emailDeliveryAdapter = async () => { throw new Error('must not run'); };
    await assert.rejects(sendOtpEmail({ app }, { to: 'production@example.com', code: '000000' }), error => error.status === 503);
    app.locals.config.nodeEnv = 'test';
    assert.equal((await actor()('/auth/email/send-otp', { email: 'csrf@example.com' }, '')).status, 403);
  });
  await t.test('an ambiguous delivery failure is never dispatched twice with the same key', async () => {
    let dispatches = 0;
    app.locals.config.emailDeliveryAdapter = async () => { dispatches++; throw Object.assign(new Error('Email delivery is unavailable.'), { status: 503 }); };
    const headers = { 'Idempotency-Key': randomBytes(24).toString('hex') };
    const request = () => actor()('/auth/email/send-otp', { email: 'failed-retry@example.com', ...profile }, 'http://localhost:3000', headers);
    assert.equal((await request()).status, 503);
    now += 61000;
    assert.equal((await request()).status, 503);
    assert.equal(dispatches, 1);
  });
  await t.test('authentication and dispatch logs correlate requests without exposing customer identities or OTPs', () => {
    for (const operation of ['email_otp.request', 'email_otp.resend', 'email_otp.verify', 'customer.logout']) assert.ok(logs.some(record => record.operation === operation && record.event === 'api.request'));
    for (const authAction of ['registration', 'login']) assert.ok(logs.some(record => record.event === 'customer.authentication.succeeded' && record.authAction === authAction));
    assert.ok(logs.some(record => record.event === 'otp.dispatch.succeeded'));
    assert.ok(logs.some(record => record.event === 'otp.dispatch.failed'));
    assert.ok(logs.some(record => record.event === 'otp.idempotency.replayed'));
    assert.ok(logs.some(record => record.reason === 'csrf_origin_rejected'));
    const summaries = logs.filter(record => record.event === 'api.request');
    assert.equal(new Set(summaries.map(record => record.requestId)).size, summaries.length);
    const serialized = JSON.stringify(logs);
    for (const secret of ['shopper@example.com', 'Email Shopper', profile.phone, 'challengeToken', 'tokenHash', 'codeHash', 'password', 'cookie']) assert.ok(!serialized.includes(secret), secret);
  });
});
