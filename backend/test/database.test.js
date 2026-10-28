import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import Product from '../src/models/Product.js';
import Subscriber from '../src/models/Subscriber.js';
import { initializeModels } from '../src/config/models.js';

const configured = process.env.MONGODB_TEST_URI;

test('real MongoDB: published products, filters, drafts, and newsletter persistence', { skip: !configured }, async (t) => {
  const databaseName = `son_masala_test_${Date.now()}_${process.pid}`;
  await mongoose.connect(configured, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  t.after(async () => {
    // Only the isolated database created by this test may be removed.
    if (mongoose.connection.name === databaseName && databaseName.startsWith('son_masala_test_')) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  await initializeModels();
  await Product.create({ name: 'Draft Test Spice', slug: 'draft-test', category: 'ground-spices' });
  const product = await Product.create({ name: 'Integration Test Spice', slug: 'published-test', description: 'Synthetic fixture in an isolated test database only.', category: 'ground-spices', status: 'published', variants: [{ label: '100 g', price: 123, stock: 2 }] });
  // A record inserted outside Mongoose must not expose an unpriced published product.
  await Product.collection.insertOne({ name: 'Malformed record', slug: 'invalid-test', category: 'ground-spices', status: 'published', variants: [{ label: '100 g', price: null }] });
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const response = await fetch(`${base}/products`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.products.length, 1);
  assert.equal(body.products[0]._id, product.id);
  assert.equal(body.products[0].variants[0].price, 123);
  assert.equal((await fetch(`${base}/products/draft-test`)).status, 404);
  assert.equal((await fetch(`${base}/products/invalid-test`)).status, 404);
  assert.equal((await fetch(`${base}/products/published-test`)).status, 200);
  assert.equal((await (await fetch(`${base}/products?q=.*`)).json()).products.length, 0);
  assert.equal((await (await fetch(`${base}/products?category=whole-spices`)).json()).products.length, 0);
  assert.equal((await fetch(`${base}/products?limit=1000`)).status, 400);
  assert.equal((await fetch(`${base}/ready`)).status, 200);
  const post = data => fetch(`${base}/newsletter`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post({ email: 'test@example.com', consent: false })).status, 400);
  assert.equal((await post({ email: 'test@example.com', consent: true })).status, 200);
  assert.equal((await post({ email: 'test@example.com', consent: true })).status, 200);
  assert.equal(await Subscriber.countDocuments(), 1);
});
