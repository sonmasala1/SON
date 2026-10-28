import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { initializeModels } from '../src/config/models.js';
import { createApp } from '../src/app.js';
import { seedDemo } from '../scripts/seed-demo.js';
import Wishlist from '../src/models/Wishlist.js';
import User from '../src/models/User.js';
import ProductVariant from '../src/models/ProductVariant.js';
import Order from '../src/models/Order.js';

test('private MongoDB favourites and authenticated checkout preserve guest shopping', async t => {
  const testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) {
    t.skip('Set MONGODB_TEST_URI to an isolated replica set; integration tests never use MONGODB_URI.');
    return;
  }
  const dbName = `son_masala_test_wishlist_${Date.now()}_${process.pid}`;
  await mongoose.connect(testUri, { dbName });
  t.after(async () => { if (mongoose.connection.name === dbName && dbName.startsWith('son_masala_test_wishlist_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels(); await seedDemo();
  const messages = []; let now = Date.now();
  const config = { nodeEnv: 'test', demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => now, deliveryAdapter: async message => messages.push(message) };
  const server = createApp({ config }).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function actor(saved = []) {
    const jar = new Map(saved);
    const request = async (path, body, method = body ? 'POST' : 'GET', origin = 'http://localhost:3000') => {
      const response = await fetch(base + path, { method, headers: { Origin: origin, Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), ...body ? { 'Content-Type': 'application/json' } : {} }, ...body ? { body: JSON.stringify(body) } : {} });
      for (const cookie of response.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar.set(name, value); else jar.delete(name); }
      return { status: response.status, body: await response.json(), headers: response.headers };
    };
    request.jar = jar; return request;
  }
  async function login(client, phone) {
    now += 61000;
    const sent = await client('/auth/send-otp', { fullName: 'Private Shopper', phone, channel: 'sms' });
    const code = messages.filter(message => message.contact === phone).at(-1).text.match(/\b(\d{6})\b/)[1];
    const result = await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code }); assert.equal(result.status, 200); return result.body.user;
  }
  const guest = actor(), other = actor();
  const product = (await guest('/products')).body.products.find(product => product.slug === 'haldi-powder'), variant = product.variants[0];
  const delivery = { fullName: 'Private Shopper', email: 'private@example.com', phone: '9876543210', address: '123 Synthetic Street', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
  let before, user;
  await t.test('guests browse and persist quantities but cannot read/write wishlist or create/preview/settle orders', async () => {
    assert.equal((await guest('/products')).status, 200);
    const added = await guest('/cart/items', { productId: product._id, variantId: variant._id, quantity: 1 });
    const updated = await guest(`/cart/items/${added.body.cart.items[0]._id}`, { quantity: 2 }, 'PATCH'); before = updated.body.cart;
    assert.equal((await actor([...guest.jar])('/cart')).body.cart.count, 2);
    for (const [path, body, method] of [['/wishlist', undefined, 'GET'], ['/wishlist/haldi-powder', {}, 'PUT'], ['/wishlist/haldi-powder', {}, 'DELETE'], ['/checkout/preview', { delivery }], ['/demo-payments', { action: 'create', delivery, requestKey: crypto.randomUUID() }], ['/demo-payments', { action: 'simulate', orderId: 'DEMO-' + crypto.randomUUID().toUpperCase(), outcome: 'PAID_DEMO' }]]) assert.equal((await guest(path, body, method)).status, 401);
    assert.equal(await Order.countDocuments(), 0); assert.equal(await Wishlist.countDocuments(), 0);
  });
  await t.test('login keeps guest quantities/totals, and repeated wishlist adds are atomic and idempotent', async () => {
    user = await login(guest, '+919876543210');
    const after = (await guest('/cart')).body.cart; assert.equal(after.items.length, 1); assert.equal(after.count, 2); assert.deepEqual(after.totals, before.totals);
    const responses = await Promise.all(Array.from({ length: 8 }, () => guest('/wishlist/haldi-powder', {}, 'PUT')));
    assert.ok(responses.every(response => response.status === 200));
    assert.equal((await Wishlist.findById(user.id)).productIds.length, 1);
    assert.deepEqual((await guest('/wishlist')).body.wishlist.slugs, ['haldi-powder']);
  });
  await t.test('favourites restore with a session or later login and never leak to another customer', async () => {
    const restored = actor([...guest.jar]); assert.equal((await restored('/wishlist')).body.wishlist.products[0].slug, 'haldi-powder');
    await login(other, '+919876543211'); assert.deepEqual((await other(`/wishlist?userId=${user.id}`)).body.wishlist.slugs, []);
    assert.equal((await guest('/wishlist/haldi-powder', { userId: 'forged' }, 'PUT')).status, 400);
    assert.equal((await guest('/wishlist/haldi-powder', {}, 'DELETE', '')).status, 403);
    const copied = actor([...guest.jar]); await guest('/auth/logout', {}); assert.equal((await copied('/wishlist')).status, 401);
    await login(guest, '+919876543210'); assert.equal((await guest('/wishlist')).body.wishlist.slugs.length, 1);
    assert.equal((await guest('/cart')).body.cart.count, 2);
  });
  await t.test('checkout revalidates current price/stock and paid orders remain private to the customer', async () => {
    await ProductVariant.updateOne({ _id: variant._id }, { pricePaise: 10900 });
    const preview = await guest('/checkout/preview', { delivery }); assert.equal(preview.body.cart.totals.totalPaise, 26700);
    await ProductVariant.updateOne({ _id: variant._id }, { stock: 1 });
    const input = { action: 'create', delivery, requestKey: crypto.randomUUID() };
    assert.equal((await guest('/demo-payments', input)).status, 409); assert.equal(await Order.countDocuments(), 0);
    await ProductVariant.updateOne({ _id: variant._id }, { stock: 50 });
    const created = await guest('/demo-payments', input); assert.equal(created.status, 200); assert.equal(created.body.order.totals.totalPaise, 26700);
    assert.equal((await other(`/orders/${created.body.order.id}`)).status, 404);
    assert.equal((await guest('/demo-payments', { action: 'simulate', orderId: created.body.order.id, outcome: 'PAID_DEMO' })).body.order.paymentStatus, 'PAID_DEMO');
    assert.equal((await guest('/cart')).body.cart.count, 0);
  });
  await t.test('removal persists; suspension denies favourites and checkout; customer cookies never authorize staff', async () => {
    assert.equal((await guest('/wishlist/haldi-powder', {}, 'DELETE')).status, 200);
    assert.deepEqual((await actor([...guest.jar])('/wishlist')).body.wishlist.slugs, []);
    for (const path of ['/admin/dashboard', '/owner/admins']) assert.equal((await guest(path)).status, 403);
    await User.updateOne({ _id: user.id }, { accountStatus: 'SUSPENDED' });
    assert.equal((await guest('/wishlist')).status, 401); assert.equal((await guest('/checkout/preview', { delivery })).status, 401);
  });
});
