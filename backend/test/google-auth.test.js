import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { initializeModels } from '../src/config/models.js';
import { createApp, safeRequestUrl } from '../src/app.js';
import { seedDemo } from '../scripts/seed-demo.js';
import { createGoogleTestProvider } from '../scripts/fixtures/google-provider.js';
import GoogleLoginAttempt from '../src/models/GoogleLoginAttempt.js';
import User from '../src/models/User.js';
import Product from '../src/models/Product.js';
import ProductVariant from '../src/models/ProductVariant.js';
import { CustomerSession } from '../src/models/customerAuthentication.js';
import { googleFlowCookie, customerReturnTo, googleConfiguration } from '../src/services/googleAuthService.js';
import { tokenHash } from '../src/services/customerSessionService.js';

test('Google customer OAuth verifies identity, binds the browser, and preserves private customer sessions', async t => {
  const testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) {
    t.skip('Set MONGODB_TEST_URI to an isolated replica set; integration tests never use MONGODB_URI.');
    return;
  }
  const databaseName = `son_masala_test_google_${Date.now()}_${process.pid}`;
  await mongoose.connect(testUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => { if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_google_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels(); await seedDemo();
  let now = Date.now();
  const config = { nodeEnv: 'test', webAuthnOrigin: 'http://localhost:3000', demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => now, ...createGoogleTestProvider() };
  const app = createApp({ config }), server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function actor(saved = []) {
    const jar = new Map(saved);
    const request = async (path, body, headers = {}) => {
      const response = await fetch(base + path, { redirect: 'manual', method: body ? 'POST' : 'GET', headers: { Origin: 'http://localhost:3000', Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; '), ...body ? { 'Content-Type': 'application/json' } : {}, ...headers }, ...body ? { body: JSON.stringify(body) } : {} });
      for (const cookie of response.headers.getSetCookie()) { const [key, value] = cookie.split(';')[0].split('='); if (value) jar.set(key, value); else jar.delete(key); }
      return { status: response.status, headers: response.headers, body: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text(), location: response.headers.get('location') };
    };
    request.jar = jar; return request;
  }
  async function start(client, returnTo = '/account') {
    const result = await client('/auth/google/start', { returnTo }); assert.equal(result.status, 200);
    const url = new URL(result.body.authorizationUrl);
    return { result, url, state: url.searchParams.get('state'), nonce: url.searchParams.get('nonce'), challenge: url.searchParams.get('code_challenge') };
  }
  const code = (flow, extra = {}) => Buffer.from(JSON.stringify({ nonce: flow.nonce, challenge: flow.challenge, ...extra })).toString('base64url');
  const callback = (client, flow, extra = {}, state = flow.state) => client(`/auth/google/callback?${new URLSearchParams({ state, code: code(flow, extra) })}`, undefined, { Origin: '' });
  const reason = response => new URL(response.location).searchParams.get('google_error');
  const shopper = actor(); let userId;

  await t.test('missing configuration and untrusted starts fail closed; client-supplied identity is rejected', async () => {
    const id = app.locals.config.googleClientId; app.locals.config.googleClientId = '';
    const failed = await shopper('/auth/google/start', {}); assert.equal(failed.status, 503); assert.equal(shopper.jar.has('son_google_flow'), false); assert.equal(await GoogleLoginAttempt.countDocuments(), 0);
    app.locals.config.googleClientId = id;
    assert.equal((await shopper('/auth/google/start', {}, { Origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await shopper('/auth/google/start', {}, { Origin: '' })).status, 403);
    assert.equal((await shopper('/auth/google/start', { sub: 'forged-owner', role: 'OWNER', email: 'owner@example.com' })).status, 400);
    assert.equal(await User.countDocuments(), 0);
  });
  await t.test('authorization requests use minimal scopes, S256 PKCE, hashed browser/state/nonce and encrypted verifier', async () => {
    const client = actor(), flow = await start(client, 'https://untrusted.example');
    assert.equal(flow.url.origin, 'https://accounts.google.com');
    assert.deepEqual(flow.url.searchParams.get('scope').split(' ').sort(), ['email', 'openid', 'profile']);
    assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(flow.url.searchParams.get('access_type'), 'online');
    assert.equal(flow.url.searchParams.get('redirect_uri'), config.googleRedirectUri);
    assert.equal(flow.url.searchParams.has('client_secret'), false);
    const attempt = await GoogleLoginAttempt.findOne({ stateHash: tokenHash(flow.state) }).select('+stateHash +browserHash +nonceHash +verifierEncrypted');
    assert.equal(attempt.returnTo, '/account'); assert.notEqual(attempt.stateHash, flow.state); assert.notEqual(attempt.browserHash, client.jar.get('son_google_flow')); assert.notEqual(attempt.nonceHash, flow.nonce); assert.ok(attempt.verifierEncrypted);
    const cookie = flow.result.headers.getSetCookie().find(value => value.startsWith('son_google_flow='));
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\/api\/v1\/auth\/google/);
    assert.equal(reason(await callback(client, flow)), null);
  });
  await t.test('Google callback merges the guest bag into a verified customer account and issues a persistent cookie', async () => {
    const product = await Product.findOne({ slug: 'haldi-powder' }), variant = await ProductVariant.findOne({ productId: product._id });
    assert.equal((await shopper('/cart/items', { productId: product.id, variantId: variant.id, quantity: 2 })).status, 200);
    const flow = await start(shopper, '/checkout'); const result = await callback(shopper, flow);
    assert.equal(result.status, 303); assert.equal(result.location, 'http://localhost:3000/checkout'); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(result.headers.get('referrer-policy'), 'no-referrer');
    const cookie = result.headers.getSetCookie().find(value => value.startsWith('son_customer_session='));
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Expires=/);
    const me = (await shopper('/auth/me')).body.user; userId = me.id;
    assert.equal(me.name, 'Google Shopper'); assert.equal(me.role, 'CUSTOMER'); assert.equal(me.phoneVerified, false); assert.equal(me.email, 'google-shopper@example.com');
    assert.equal((await shopper('/cart')).body.cart.count, 2);
    const user = await User.findById(userId).select('+googleSubject'); assert.equal(user.googleSubject, 'isolated-customer'); assert.ok(user.emailVerifiedAt); assert.equal(user.phone, undefined);
    const record = await CustomerSession.findOne({ tokenHash: tokenHash(shopper.jar.get('son_customer_session')) }); assert.equal(record.verificationSource, 'GOOGLE');
    assert.equal(JSON.stringify(await User.findById(userId)).includes('id_token'), false);
  });
  await t.test('refresh/restored cookies skip OAuth and OTP; Google sessions cannot access staff APIs', async () => {
    const restored = actor([...shopper.jar]); assert.equal((await restored('/auth/me')).body.user.id, userId);
    const before = await GoogleLoginAttempt.countDocuments(); const active = await restored('/auth/google/start', { returnTo: '/cart' });
    assert.equal(active.body.authenticated, true); assert.equal(active.body.returnTo, '/cart'); assert.equal(await GoogleLoginAttempt.countDocuments(), before);
    for (const path of ['/admin/dashboard', '/owner/admins', '/owner/audit-logs']) assert.equal((await restored(path)).status, 403);
  });
  await t.test('logout revokes copied sessions; returning stable Google subject retains profile, customer ID and bag', async () => {
    const old = actor([...shopper.jar]); await shopper('/auth/logout', {}); assert.equal((await old('/auth/me')).body.user, null);
    const flow = await start(shopper); const signed = await callback(shopper, flow, { claims: { name: 'Unsolicited Profile Change', email: 'changed-provider-email@example.com' } });
    assert.equal(reason(signed), null); const me = (await shopper('/auth/me')).body.user;
    assert.equal(me.id, userId); assert.equal(me.name, 'Google Shopper'); assert.equal(me.email, 'google-shopper@example.com'); assert.equal((await shopper('/cart')).body.cart.count, 2);
    assert.equal(await User.countDocuments({ googleSubject: 'isolated-customer' }), 1);
  });
  await t.test('a matching email alone never links or exposes an existing mobile/legacy account', async () => {
    const existing = await User.create({ name: 'Existing Mobile Customer', email: 'existing@example.com', phone: '+919876543299', role: 'CUSTOMER', accountStatus: 'ACTIVE' });
    const stranger = actor(), flow = await start(stranger); const result = await callback(stranger, flow, { claims: { sub: 'unlinked-google-subject', email: 'existing@example.com' } });
    assert.equal(reason(result), 'account_link_required'); assert.equal((await stranger('/auth/me')).body.user, null);
    assert.equal(await User.countDocuments({ email: existing.email }), 1); assert.equal((await User.findById(existing.id).select('+googleSubject')).googleSubject, undefined);
  });
  await t.test('wrong browser, malformed state, expired state, cancellation and replay cannot establish sessions', async () => {
    const client = actor(), flow = await start(client);
    assert.equal(reason(await callback(actor(), flow)), 'state');
    assert.equal(reason(await client('/auth/google/callback?state[]=invalid&code=ignored')), 'state');
    assert.equal(reason(await client('/auth/google/callback?error=access_denied')), 'state');
    const expiredClient = actor(), expired = await start(expiredClient); now += 11 * 60000;
    assert.equal(reason(await callback(expiredClient, expired)), 'state');
    const cancelledClient = actor(), cancelled = await start(cancelledClient, '/checkout');
    const cancellation = await cancelledClient(`/auth/google/callback?state=${cancelled.state}&error=access_denied`);
    assert.equal(reason(cancellation), 'cancelled'); assert.equal(new URL(cancellation.location).searchParams.get('next'), '/checkout');
    assert.equal(reason(await callback(cancelledClient, cancelled)), 'state');
    assert.equal((await cancelledClient('/auth/me')).body.user, null);
  });
  await t.test('signed tokens still require valid signature, audience, issuer, expiry, nonce and verified email', async () => {
    const badCases = [{ badSignature: true }, { claims: { aud: 'wrong-audience' } }, { claims: { iss: 'https://forged.example' } }, { claims: { iat: 1, exp: 2 } }, { claims: { nonce: 'wrong-nonce' } }, { claims: { email_verified: false } }, { claims: { email: 'invalid-email' } }, { claims: { sub: '' } }, { missingToken: true }, { challenge: 'wrong-PKCE-challenge' }];
    const before = await User.countDocuments();
    for (const invalid of badCases) {
      const client = actor(), flow = await start(client); const response = await callback(client, flow, invalid);
      assert.equal(reason(response), 'failed', JSON.stringify(invalid)); assert.equal(client.jar.has('son_customer_session'), false); assert.equal((await client('/auth/me')).body.user, null); assert.equal(new URL(response.location).searchParams.has('code'), false);
    }
    assert.equal(await User.countDocuments(), before);
  });
  await t.test('parallel callback replay is consumed once; suspended customers are denied', async () => {
    const client = actor(), flow = await start(client), first = actor([...client.jar]), second = actor([...client.jar]);
    const responses = await Promise.all([callback(first, flow, { claims: { sub: 'parallel-customer', email: 'parallel@example.com' } }), callback(second, flow, { claims: { sub: 'parallel-customer', email: 'parallel@example.com' } })]);
    assert.deepEqual(responses.map(reason).sort(), [null, 'state'].sort()); assert.equal(await User.countDocuments({ googleSubject: 'parallel-customer' }), 1);
    await User.updateOne({ _id: userId }, { accountStatus: 'SUSPENDED' });
    assert.equal((await shopper('/auth/me')).body.user, null);
    const denied = actor(), attempt = await start(denied); assert.equal(reason(await callback(denied, attempt)), 'account_unavailable'); assert.equal((await denied('/auth/me')).body.user, null);
  });
  await t.test('production cookies require HTTPS and return paths cannot target external/staff/login pages', () => {
    const req = { app: { locals: { config: { ...config, nodeEnv: 'production' } } } };
    assert.equal(googleFlowCookie(req).secure, true); assert.equal(googleFlowCookie(req).httpOnly, true);
    assert.throws(() => googleConfiguration(req), { status: 503 });
    for (const value of ['//untrusted.example', '/\\untrusted.example', '/checkout\n', '/admin', '/owner/dashboard', '/login', '/shop/../../owner', undefined]) assert.equal(customerReturnTo(value), '/account');
    assert.equal(customerReturnTo('/shop?q=haldi#products'), '/shop?q=haldi#products');
    for (const pathname of ['/api/v1/auth/google/callback', '/api/v1/auth/google/callback/', '/API/v1/AUTH/google/CALLBACK']) assert.equal(safeRequestUrl({ originalUrl: `${pathname}?code=private&state=private`, path: '/callback' }), pathname);
    assert.equal(safeRequestUrl({ originalUrl: '/api/v1/products?q=haldi' }), '/api/v1/products');
  });
});
