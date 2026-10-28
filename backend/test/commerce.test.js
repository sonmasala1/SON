import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { initializeModels } from '../src/config/models.js';
import { seedDemo } from '../scripts/seed-demo.js';
import Product from '../src/models/Product.js';
import ProductVariant from '../src/models/ProductVariant.js';
import Order from '../src/models/Order.js';
import Payment from '../src/models/Payment.js';
import InventoryReservation from '../src/models/InventoryReservation.js';
import User from '../src/models/User.js';
import Review from '../src/models/Review.js';
import { releaseExpiredReservations } from '../src/services/paymentService.js';

const delivery = { fullName: 'Demo Shopper', email: 'shopper@example.com', phone: '9876543210', address: '123 Sample Street', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
test('transactional shopping, demo payments, account carts, and moderated reviews', async t => {
  const testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) {
    t.skip('Set MONGODB_TEST_URI to an isolated replica set; integration tests never use MONGODB_URI.');
    return;
  }
  const databaseName = `son_masala_test_commerce_${Date.now()}_${process.pid}`;
  await mongoose.connect(testUri, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => { if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_commerce_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels(); await seedDemo();
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.ok(hello.setName, 'Use the isolated demo replica set or Atlas to run transaction tests');
  let authTime = Date.now(); const messages = [];
  const config = { nodeEnv: 'test', demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => authTime, deliveryAdapter: async message => messages.push(message) };
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function customer() {
    const jar = new Map();
    return async (path, data, method = data ? 'POST' : 'GET') => {
      const response = await fetch(base + path, { method, headers: { Origin: 'http://localhost:3000', ...(data ? { 'Content-Type': 'application/json' } : {}), Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join('; ') }, ...(data ? { body: JSON.stringify(data) } : {}) });
      for (const cookie of response.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar.set(name, value); else jar.delete(name); }
      return { status: response.status, body: await response.json() };
    };
  }
  const client = customer();
  let phoneSequence = 700;
  const signInShopper = client => mobileSignIn(client, `+919876543${phoneSequence++}`, 'Demo Customer');
  async function mobileSignIn(client, phone, fullName) {
    authTime += 61000;
    const sent = await client('/auth/send-otp', { phone, fullName, channel: 'sms' }); assert.equal(sent.status, 200);
    const code = messages.filter(message => message.contact === phone).at(-1).text.match(/\b(\d{6})\b/)[1];
    const verified = await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code }); assert.equal(verified.status, 200); return verified;
  }
  const products = (await client('/products')).body.products;
  const haldi = products.find(product => product.slug === 'haldi-powder');
  const variant = haldi.variants[0];
  const input = { productId: haldi._id, variantId: variant._id, quantity: 1 };
  let pending;
  await t.test('demo seeding is idempotent and never overwrites real prices', async () => {
    await seedDemo(); assert.equal(await Product.countDocuments(), 3); assert.equal(await ProductVariant.countDocuments(), 3);
    assert.equal(variant.unitPricePaise, 9900); assert.equal(haldi.isDemo, true);
    const real = await Product.create({ name: 'Real Test Product', slug: 'real-record', category: 'whole-spices', description: 'Real record must not be modified', status: 'published', variants: [{ label: '10 g', price: 500, stock: 2 }] });
    await seedDemo(); assert.equal((await Product.findById(real._id)).variants[0].price, 500);
  });
  await t.test('cart CRUD persists by guest cookie and computes integer paise', async () => {
    let result = await client('/cart/items', input); assert.equal(result.status, 200); assert.equal(result.body.cart.count, 1);
    assert.deepEqual(result.body.cart.totals, { subtotalPaise: 9900, discountPaise: 0, deliveryPaise: 4900, totalPaise: 14800 });
    const id = result.body.cart.items[0]._id;
    result = await client(`/cart/items/${id}`, { quantity: 2 }, 'PATCH'); assert.equal(result.body.cart.totals.totalPaise, 24700);
    assert.equal((await client('/cart')).body.cart.count, 2);
    assert.equal((await client('/cart/items', { ...input, quantity: 99 })).status, 409);
    assert.equal((await client('/cart/items', { ...input, pricePaise: 1 })).status, 400);
  });
  await t.test('checkout validates delivery and reserves stock atomically', async () => {
    await signInShopper(client);
    assert.equal((await client('/checkout/preview', { delivery: { ...delivery, pincode: 'bad' } })).status, 400);
    const requestKey = crypto.randomUUID();
    const result = await client('/demo-payments', { action: 'create', delivery, requestKey });
    assert.equal(result.status, 200); pending = result.body.order;
    assert.equal(pending.paymentStatus, 'PENDING'); assert.equal(pending.paymentMode, 'DEMO');
    assert.equal((await ProductVariant.findById(variant._id)).stock, 48);
    const duplicate = await client('/demo-payments', { action: 'create', delivery, requestKey });
    assert.equal(duplicate.body.order.id, pending.id); assert.equal(await Order.countDocuments(), 1);
    assert.equal(await InventoryReservation.countDocuments({ status: 'HELD' }), 1);
  });
  await t.test('successful demo payment is idempotent and private to its owner', async () => {
    let result = await client('/demo-payments', { action: 'simulate', orderId: pending.id, outcome: 'PAID_DEMO' });
    assert.equal(result.body.order.paymentStatus, 'PAID_DEMO');
    assert.equal((await client('/cart')).body.cart.count, 0);
    result = await client('/demo-payments', { action: 'simulate', orderId: pending.id, outcome: 'PAID_DEMO' }); assert.equal(result.status, 200);
    assert.equal((await ProductVariant.findById(variant._id)).stock, 48);
    assert.equal(await Payment.countDocuments({ status: 'PAID_DEMO', paymentMode: 'DEMO' }), 1);
    assert.equal((await customer()(`/orders/${pending.id}`)).status, 404);
    assert.equal((await client('/demo-payments', { action: 'simulate', orderId: pending.id, outcome: 'FAILED' })).status, 409);
  });
  for (const outcome of ['FAILED', 'CANCELLED']) {
    await t.test(`${outcome} releases stock once and keeps the cart`, async () => {
      const shopper = customer(); await signInShopper(shopper); await shopper('/cart/items', input);
      const order = (await shopper('/demo-payments', { action: 'create', delivery, requestKey: crypto.randomUUID() })).body.order;
      assert.equal((await ProductVariant.findById(variant._id)).stock, 47);
      assert.equal((await shopper('/demo-payments', { action: 'simulate', orderId: order.id, outcome })).body.order.paymentStatus, outcome);
      await shopper('/demo-payments', { action: 'simulate', orderId: order.id, outcome });
      assert.equal((await ProductVariant.findById(variant._id)).stock, 48);
      assert.equal((await shopper('/cart')).body.cart.count, 1);
    });
  }
  await t.test('expired reservations are released transactionally', async () => {
    const shopper = customer(); await signInShopper(shopper); await shopper('/cart/items', input);
    const order = (await shopper('/demo-payments', { action: 'create', delivery, requestKey: crypto.randomUUID() })).body.order;
    await Order.updateOne({ publicId: order.id }, { expiresAt: new Date(Date.now() - 1000) });
    await releaseExpiredReservations();
    assert.equal((await Order.findOne({ publicId: order.id })).paymentStatus, 'CANCELLED');
    assert.equal((await ProductVariant.findById(variant._id)).stock, 48);
  });
  const account = customer();
  await t.test('registration merges guest bag and authenticated bag survives logout', async () => {
    await account('/cart/items', input);
    await mobileSignIn(account, '+919876543210', 'Test Customer');
    assert.equal((await account('/cart')).body.cart.count, 1);
    await account('/auth/logout', {});
    assert.equal((await account('/cart')).body.cart.count, 0);
    await account('/cart/items', input);
    await mobileSignIn(account, '+919876543210', 'Test Customer');
    assert.equal((await account('/cart')).body.cart.count, 2);
  });
  await t.test('review creation requires auth and moderation; badge cannot be forged', async () => {
    const body = { productId: haldi._id, displayName: 'Integration Reviewer', rating: 4, comment: 'Isolated integration test review, not a real public testimonial.' };
    assert.equal((await customer()('/reviews', body)).status, 401);
    assert.equal((await account('/reviews', { ...body, verifiedPurchase: true })).status, 400);
    const created = await account('/reviews', body); assert.equal(created.status, 201);
    assert.equal((await account('/reviews')).body.reviews.length, 0);
    assert.equal((await account('/admin/reviews')).status, 403);
    await User.create({ name: 'Test Admin', phone: '+919876543219', role: 'admin' });
    const administrator = customer(); await mobileSignIn(administrator, '+919876543219', 'Test Admin');
    assert.equal((await administrator(`/admin/reviews/${created.body.reviewId}`, { approved: true }, 'PATCH')).status, 403);
    const publicReviews = (await account('/reviews')).body.reviews;
    assert.equal(publicReviews.length, 0);
    assert.equal((await Review.findById(created.body.reviewId)).verifiedPurchase, false);
    assert.equal((await account('/reviews')).body.reviews.length, 0);
    assert.equal(await Review.countDocuments(), 1);
  });
  await t.test('production configuration blocks demo controls and hides demo products', async () => {
    const production = createApp({ config: { ...config, nodeEnv: 'production', demoEnabled: true } }).listen(0, '127.0.0.1');
    await new Promise(resolve => production.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${production.address().port}/api/v1`;
      assert.equal((await fetch(url + '/demo-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404);
      const products = (await (await fetch(url + '/products')).json()).products;
      assert.equal(products.some(product => product.isDemo), false);
    } finally { await new Promise(resolve => production.close(resolve)); }
  });
  await t.test('concurrent checkouts cannot oversell the final pack', async () => {
    await ProductVariant.updateOne({ _id: variant._id }, { stock: 1 });
    const one = customer(), two = customer();
    await signInShopper(one); await signInShopper(two);
    await one('/cart/items', input); await two('/cart/items', input);
    const results = await Promise.all([one('/demo-payments', { action: 'create', delivery, requestKey: crypto.randomUUID() }), two('/demo-payments', { action: 'create', delivery, requestKey: crypto.randomUUID() })]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal((await ProductVariant.findById(variant._id)).stock, 0);
    const winner = results.findIndex(result => result.status === 200);
    await [one, two][winner]('/demo-payments', { action: 'simulate', orderId: results[winner].body.order.id, outcome: 'CANCELLED' });
    assert.equal((await ProductVariant.findById(variant._id)).stock, 1);
  });
});
