import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';
import { initializeModels } from '../src/config/models.js';
import { createCommerceProduct } from './helpers/commerceFixtures.js';
import Product from '../src/models/Product.js';
import ProductVariant from '../src/models/ProductVariant.js';
import Cart from '../src/models/Cart.js';
import Order from '../src/models/Order.js';
import Payment from '../src/models/Payment.js';
import InventoryReservation from '../src/models/InventoryReservation.js';
import { AdminAccount, AdminSession } from '../src/models/administration.js';
import { digest, randomToken, keyedDigest } from '../src/services/staffCrypto.js';

const delivery = { fullName: 'Fixture Shopper', email: 'shopper@example.com', phone: '9876543210', address: '123 Fixture Street', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
test('real Pay Later checkout: inventory sources, atomic persistence, races and administration', async t => {
  if (!process.env.MONGODB_TEST_URI) return t.skip('Requires an isolated replica set via MONGODB_TEST_URI; never uses MONGODB_URI.');
  const dbName = `son_masala_test_checkout_${Date.now()}_${process.pid}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => { if (mongoose.connection.name === dbName && dbName.startsWith('son_masala_test_checkout_')) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  await initializeModels();
  const logs = [], messages = [];
  let now = Date.now(), phone = 900;
  const config = { nodeEnv: 'test', demoEnabled: true, mfaEncryptionKey: randomBytes(32).toString('base64'), clock: () => now, testLogSink: record => logs.push(record), deliveryAdapter: async message => messages.push(message) };
  const server = createApp({ config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function actor() {
    const jar = new Map(); let csrf = '';
    const request = async (path, body, method = body ? 'POST' : 'GET') => {
      const response = await fetch(base + path, { method, headers: { Origin: 'http://localhost:3000', Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), 'X-CSRF-Token': csrf, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      for (const cookie of response.headers.getSetCookie()) { const [name, value] = cookie.split(';')[0].split('='); if (value) jar.set(name, value); else jar.delete(name); }
      return { status: response.status, body: await response.json() };
    };
    request.jar = jar;
    request.csrf = value => { csrf = value; };
    return request;
  }
  async function shopper() {
    const client = actor(); now += 61000;
    const contact = `+919876543${phone++}`;
    const sent = await client('/auth/send-otp', { fullName: 'Fixture Shopper', phone: contact, channel: 'sms' });
    assert.equal(sent.status, 200);
    const code = messages.filter(message => message.contact === contact).at(-1).text.match(/\b(\d{6})\b/)[1];
    assert.equal((await client('/auth/verify-otp', { challengeToken: sent.body.challengeToken, code })).status, 200);
    return client;
  }
  async function admin(permissions = ['orders.view', 'orders.update', 'orders.cancel', 'inventory.view', 'inventory.update', 'shipping.view', 'payments.view', 'dashboard.view']) {
    const account = await AdminAccount.create({ adminId: randomUUID(), fullName: 'Fixture Admin', email: `${randomUUID()}@example.com`, role: 'ADMIN', permissions, status: 'ACTIVE', mfaEnabled: true });
    const token = randomToken();
    await AdminSession.create({ accountId: account._id, tokenHash: digest(token), realm: 'admin', sessionVersion: account.sessionVersion, expiresAt: new Date(now + 3600000), lastSeenAt: new Date(now) });
    const client = actor(); client.jar.set('son_admin_session', token); client.csrf(keyedDigest(`csrf:${token}`, config)); return client;
  }
  const add = (client, fixture, quantity = 1) => client('/cart/items', { productId: fixture.product.id, variantId: String(fixture.variant._id), quantity });
  const place = (client, requestKey = randomUUID()) => client('/checkout/place', { delivery, requestKey });
  const stock = async fixture => fixture.variant.productId ? (await ProductVariant.findById(fixture.variant._id)).stock : (await Product.findById(fixture.product._id)).variants.id(fixture.variant._id).stock;

  await t.test('storefront excludes demo/sample records even with the old flag enabled; simulation endpoint is gone', async () => {
    await createCommerceProduct('hidden-demo', { isDemo: true });
    await createCommerceProduct('hidden-sample', { isSample: true });
    const client = actor();
    assert.equal((await client('/products')).body.products.length, 0);
    assert.equal((await client('/demo-payments', { action: 'create' })).status, 404);
    assert.equal(await Order.countDocuments(), 0);
    assert.equal((await place(client)).status, 401);
  });

  for (const source of ['EMBEDDED', 'CANONICAL']) {
    await t.test(`${source}: product → selection → cart → preview → confirmed order and retry`, async () => {
      const fixture = await createCommerceProduct(`valid-${source.toLowerCase()}`, { source, stock: 5 });
      const client = await shopper();
      const product = (await client(`/products/${fixture.product.slug}`)).body.product;
      assert.equal(String(product.variants[0]._id), String(fixture.variant._id));
      if (source === 'EMBEDDED') {
        // This was the old final checkout predicate: the browsable pack has no standalone record.
        assert.equal(await ProductVariant.findOne({ _id: fixture.variant._id, productId: fixture.product._id, stock: { $gte: 2 } }), null);
      }
      assert.equal((await add(client, fixture, 2)).status, 200);
      const preview = await client('/checkout/preview', { delivery });
      assert.equal(preview.status, 200); assert.equal(preview.body.cart.items[0].stock, 5);
      const key = randomUUID();
      const attempts = await Promise.all(Array.from({ length: 6 }, () => place(client, key)));
      assert.ok(attempts.every(result => result.status === 201), JSON.stringify(attempts));
      const order = attempts[0].body.order;
      assert.ok(attempts.every(result => result.body.order.id === order.id));
      assert.equal(order.paymentStatus, 'PENDING'); assert.equal(order.fulfillmentStatus, 'PLACED');
      assert.equal(order.paymentMode, 'PAY_LATER'); assert.deepEqual(order.delivery, delivery);
      assert.equal(order.totals.totalPaise, 29900); assert.equal(await stock(fixture), 3);
      assert.equal((await client('/cart')).body.cart.count, 0);
      const saved = await Order.findOne({ publicId: order.id });
      assert.equal(await Payment.countDocuments({ orderId: saved._id, status: 'PENDING' }), 1);
      assert.equal(await InventoryReservation.countDocuments({ orderId: saved._id, inventorySource: source, quantity: 2 }), 1);
      assert.equal(saved.expiresAt, undefined);
      assert.equal((await place(client, key)).body.order.id, order.id);
      assert.equal((await client(`/checkout/attempts/${key}`)).body.order.id, order.id);
      assert.equal((await client(`/orders/${order.id}`)).status, 200);
      assert.equal((await client('/auth/orders')).body.orders[0].id, order.id);
      assert.equal((await (await shopper())(`/orders/${order.id}`)).status, 404);
      assert.equal((await actor()(`/orders/${order.id}`)).status, 401);
      const staff = await admin();
      assert.ok((await staff('/admin/orders')).body.records.some(row => row.publicId === order.id));
      const inventory = (await staff('/admin/inventory')).body.records.find(row => String(row._id) === String(fixture.variant._id));
      assert.equal(inventory.stock, 3);
      assert.equal((await client('/admin/orders')).status, 403);
      const cancellations = await Promise.all([client(`/orders/${order.id}/cancel`, {}, 'PATCH'), staff(`/admin/orders/${saved.id}`, { fulfillmentStatus: 'CANCELLED' }, 'PATCH')]);
      assert.ok(cancellations.every(result => result.status === 200), JSON.stringify(cancellations));
      assert.equal(await stock(fixture), 5);
      assert.equal((await Payment.findOne({ orderId: saved._id })).status, 'CANCELLED');
      assert.equal(await InventoryReservation.countDocuments({ orderId: saved._id, status: 'RELEASED' }), 1);
      assert.equal((await client(`/orders/${order.id}/cancel`, {}, 'PATCH')).status, 200);
      assert.equal(await stock(fixture), 5);
      assert.equal((await staff(`/admin/orders/${saved.id}`, { paymentStatus: 'PAID', paymentConfirmed: true }, 'PATCH')).status, 409);
    });
  }

  await t.test('checkout reports the exact item and quantities when stock changes after preview', async () => {
    const fixture = await createCommerceProduct('insufficient-stock', { stock: 3 });
    const client = await shopper(); assert.equal((await add(client, fixture, 3)).status, 200);
    assert.equal((await client('/checkout/preview', { delivery })).status, 200);
    await ProductVariant.updateOne({ _id: fixture.variant._id }, { $set: { stock: 1 } });
    const before = await Order.countDocuments(), result = await place(client);
    assert.equal(result.status, 409); assert.equal(result.body.code, 'INSUFFICIENT_STOCK');
    assert.deepEqual(result.body.conflicts[0], { productId: fixture.product.id, variantId: fixture.variant.id, name: fixture.product.name, label: '100 g', requested: 3, available: 1, reason: 'INSUFFICIENT_STOCK' });
    assert.match(result.body.message, /requested 3, available 1/);
    assert.equal(await Order.countDocuments(), before); assert.equal(await stock(fixture), 1);
    assert.equal((await client('/checkout/preview', { delivery })).status, 409);
  });

  for (const source of ['EMBEDDED', 'CANONICAL']) {
    await t.test(`${source}: simultaneous customers competing for the last pack cannot oversell`, async () => {
      const fixture = await createCommerceProduct(`race-${source.toLowerCase()}`, { source, stock: 1 });
      const a = await shopper(), b = await shopper();
      assert.equal((await add(a, fixture)).status, 200); assert.equal((await add(b, fixture)).status, 200);
      const results = await Promise.all([place(a), place(b)]);
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      assert.equal(results.find(result => result.status === 409).body.conflicts[0].available, 0);
      assert.equal(await stock(fixture), 0);
      assert.equal(await Order.countDocuments({ 'items.variantId': fixture.variant._id }), 1);
    });
  }

  await t.test('canonical price/stock wins over embedded copies; inactive packs cannot fall back', async () => {
    const fixture = await createCommerceProduct('canonical-precedence', { stock: 2, pricePaise: 15900 });
    await ProductVariant.updateOne({ _id: fixture.variant._id }, { $set: { pricePaise: 16900, mrpPaise: 16900 } });
    const client = await shopper();
    const added = await add(client, fixture); assert.equal(added.body.cart.items[0].unitPricePaise, 16900);
    await ProductVariant.updateOne({ _id: fixture.variant._id }, { $set: { isActive: false } });
    assert.equal((await client(`/products/${fixture.product.slug}`)).body.product.variants.length, 0);
    const rejected = await place(client); assert.equal(rejected.status, 409); assert.equal(rejected.body.conflicts[0].reason, 'VARIANT_UNAVAILABLE');
    assert.equal((await Product.findById(fixture.product._id)).variants[0].stock, 2);
  });

  await t.test('wrong parent, missing variant and archived product are rejected without changing inventory', async () => {
    const fixture = await createCommerceProduct('unavailable-cases', { stock: 3 });
    const other = await createCommerceProduct('wrong-parent', { stock: 3 });
    const client = await shopper();
    assert.equal((await client('/cart/items', { productId: other.product.id, variantId: fixture.variant.id, quantity: 1 })).status, 409);
    assert.equal((await client('/cart/items', { productId: fixture.product.id, variantId: new mongoose.Types.ObjectId().toString(), quantity: 1 })).status, 409);
    assert.equal((await add(client, fixture)).status, 200);
    await Product.updateOne({ _id: fixture.product._id }, { $set: { status: 'archived' } });
    const result = await place(client); assert.equal(result.status, 409); assert.equal(result.body.conflicts[0].name, fixture.product.name);
    assert.equal(result.body.conflicts[0].reason, 'PRODUCT_UNAVAILABLE'); assert.equal(await stock(fixture), 3);
  });

  await t.test('different retry keys against the same cart cannot purchase its contents twice', async () => {
    const fixture = await createCommerceProduct('different-keys', { stock: 5 });
    const client = await shopper(); await add(client, fixture);
    const results = await Promise.all([place(client), place(client)]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    assert.equal(await stock(fixture), 4); assert.equal(await Order.countDocuments({ 'items.variantId': fixture.variant._id }), 1);
  });

  await t.test('shipping updates never mark pending orders paid; recording payment requires explicit confirmation', async () => {
    const fixture = await createCommerceProduct('payment-confirmation', { stock: 3 });
    const client = await shopper(); await add(client, fixture);
    const order = (await place(client)).body.order, saved = await Order.findOne({ publicId: order.id });
    const staff = await admin(), denied = await admin(['orders.view']);
    assert.equal((await denied(`/admin/orders/${saved.id}`, { paymentStatus: 'PAID', paymentConfirmed: true }, 'PATCH')).status, 403);
    assert.equal((await staff(`/admin/orders/${saved.id}`, { fulfillmentStatus: 'PACKED' }, 'PATCH')).status, 200);
    assert.equal((await Order.findById(saved._id)).paymentStatus, 'PENDING');
    assert.equal((await staff(`/admin/orders/${saved.id}`, { paymentStatus: 'PAID' }, 'PATCH')).status, 409);
    assert.equal((await staff(`/admin/orders/${saved.id}`, { paymentStatus: 'PAID', paymentConfirmed: true }, 'PATCH')).status, 200);
    assert.equal((await Payment.findOne({ orderId: saved._id })).status, 'PAID');
    assert.equal((await staff(`/admin/orders/${saved.id}`, { paymentStatus: 'PENDING' }, 'PATCH')).status, 409);
    assert.equal((await client(`/orders/${order.id}/cancel`, {}, 'PATCH')).status, 409);
    assert.equal((await staff(`/admin/orders/${saved.id}`, { fulfillmentStatus: 'CANCELLED' }, 'PATCH')).status, 409);
    assert.equal(await stock(fixture), 2);
    assert.equal(await InventoryReservation.countDocuments({ orderId: saved._id, status: 'CONSUMED' }), 1);
  });

  await t.test('invalid delivery and forged prices cannot create orders; logs contain codes without customer data', async () => {
    const client = await shopper();
    assert.equal((await client('/checkout/place', { delivery: { ...delivery, pincode: 'bad' }, requestKey: randomUUID() })).status, 400);
    assert.equal((await client('/checkout/place', { delivery, requestKey: randomUUID(), totalPaise: 1 })).status, 400);
    const serialized = JSON.stringify(logs);
    assert.ok(logs.some(record => record.event === 'order.stock.conflict' && record.code === 'INSUFFICIENT_STOCK'));
    assert.ok(!serialized.includes(delivery.address)); assert.ok(!serialized.includes(delivery.email));
    assert.equal(await ProductVariant.countDocuments({ stock: { $lt: 0 } }), 0);
    assert.equal(await Cart.countDocuments({ 'items.quantity': { $lt: 0 } }), 0);
  });

  await t.test('stale cart versions and changed totals require review without charging submitted prices', async () => {
    const fixture = await createCommerceProduct('review-version', { stock: 5 });
    const client = await shopper(); await add(client, fixture);
    const preview = (await client('/checkout/preview', { delivery })).body.cart;
    await client(`/cart/items/${preview.items[0]._id}`, { quantity: 2 }, 'PATCH');
    const stale = await client('/checkout/place', { delivery, requestKey: randomUUID(), cartVersion: preview.version, expectedTotalPaise: preview.totals.totalPaise });
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'CART_CHANGED');
    const fresh = (await client('/checkout/preview', { delivery })).body.cart;
    const changed = await client('/checkout/place', { delivery, requestKey: randomUUID(), cartVersion: fresh.version, expectedTotalPaise: 1 });
    assert.equal(changed.status, 409); assert.equal(changed.body.code, 'TOTAL_CHANGED');
    assert.equal(await Order.countDocuments({ 'items.variantId': fixture.variant._id }), 0);
    assert.equal(await stock(fixture), 5);
  });

  await t.test('a persistence failure after deduction rolls back inventory, orders and reservations', async () => {
    const fixture = await createCommerceProduct('transaction-rollback', { source: 'EMBEDDED', stock: 3 });
    const client = await shopper(); await add(client, fixture);
    const original = InventoryReservation.create;
    try {
      InventoryReservation.create = async () => { throw new Error('Isolated persistence failure'); };
      assert.equal((await place(client)).status, 500);
    } finally { InventoryReservation.create = original; }
    assert.equal(await stock(fixture), 3);
    assert.equal(await Order.countDocuments({ 'items.variantId': fixture.variant._id }), 0);
    assert.equal(await InventoryReservation.countDocuments({ variantId: fixture.variant._id }), 0);
    assert.equal((await client('/cart')).body.cart.count, 1);
  });

  for (const source of ['EMBEDDED', 'CANONICAL']) {
    await t.test(`${source}: authorized inventory adjustments are reflected in product, cart and preview`, async () => {
      const fixture = await createCommerceProduct(`inventory-${source.toLowerCase()}`, { source, stock: 3 });
      const client = await shopper(); await add(client, fixture, 2);
      const staff = await admin();
      assert.equal((await staff(`/admin/inventory/${fixture.variant._id}`, { stock: 1 }, 'PATCH')).status, 200);
      assert.equal((await staff(`/admin/inventory/${fixture.variant._id}`, { stock: 9, expectedStock: 3 }, 'PATCH')).status, 409);
      assert.equal((await client(`/products/${fixture.product.slug}`)).body.product.variants[0].stock, 1);
      assert.equal((await client('/cart')).body.cart.items[0].stock, 1);
      assert.equal((await client('/checkout/preview', { delivery })).status, 409);
      assert.equal((await staff(`/admin/inventory/${fixture.variant._id}`, { stock: -1 }, 'PATCH')).status, 400);
    });
  }
  for (const source of ['EMBEDDED', 'CANONICAL']) {
    await t.test(`${source}: an old admin product form cannot overwrite stock deducted by checkout`, async () => {
      const fixture = await createCommerceProduct(`stale-product-${source.toLowerCase()}`, { source, stock: 3 });
      const client = await shopper(); await add(client, fixture); assert.equal((await place(client)).status, 201);
      const staff = await admin(['products.update']);
      const input = { name: fixture.product.name, slug: fixture.product.slug, category: fixture.product.category, description: fixture.product.description, hindiName: 'परीक्षण मसाला', hindiDescription: 'अलग परीक्षण कैटलॉग', status: 'published', variants: [{ sku: `${fixture.product.slug}-100`, label: '100 g', weightGrams: 100, price: 125, mrp: 125, stock: 3 }], expectedVersion: fixture.product.__v };
      assert.equal((await staff(`/admin/products/${fixture.product.id}`, input, 'PATCH')).status, 409);
      assert.equal(await stock(fixture), 2);
      if (source === 'EMBEDDED') {
        input.expectedVersion = (await Product.findById(fixture.product._id)).__v;
        assert.equal((await staff(`/admin/products/${fixture.product.id}`, input, 'PATCH')).status, 409);
        assert.equal(await ProductVariant.countDocuments({ productId: fixture.product._id }), 0);
      }
    });
  }
  await t.test('saving product details preserves an existing offer price and its canonical variant ID', async () => {
    const fixture = await createCommerceProduct('preserve-offer', { stock: 4 });
    await ProductVariant.updateOne({ _id: fixture.variant._id }, { $set: { offerPricePaise: 10000 } });
    const staff = await admin(['products.update']);
    const input = { name: fixture.product.name, slug: fixture.product.slug, category: fixture.product.category, description: fixture.product.description, hindiName: 'परीक्षण मसाला', hindiDescription: 'अलग परीक्षण कैटलॉग', status: 'published', variants: [{ sku: fixture.variant.sku, label: '100 g', weightGrams: 100, price: 125, mrp: 125, stock: 4 }], expectedVersion: fixture.product.__v };
    assert.equal((await staff(`/admin/products/${fixture.product.id}`, input, 'PATCH')).status, 200);
    const variant = await ProductVariant.findById(fixture.variant._id);
    assert.equal(variant.offerPricePaise, 10000); assert.equal(variant.stock, 4);
    assert.equal(await ProductVariant.countDocuments({ productId: fixture.product._id }), 1);
  });
});
