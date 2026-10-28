import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { assertTarget, fingerprint, planMasalaSeed } from '../scripts/lib/masalaSeedPlan.js';
import { masalaSeedCatalogue } from '../src/data/masalaSeedCatalogue.js';

const publicRoot = fileURLToPath(new URL('../../frontend/public/', import.meta.url));
const empty = () => ({ products: [], categories: [], variants: [] });

test('seed refuses other hosts, implicit databases, test and sample_mflix', () => {
  assert.doesNotThrow(() => assertTarget('mongodb+srv://main.jtli6ua.mongodb.net/', 'son_masala'));
  for (const [uri, db] of [['mongodb+srv://main.jtli6ua.mongodb.net/', 'test'], ['mongodb+srv://main.jtli6ua.mongodb.net/sample_mflix', 'sample_mflix'], ['mongodb://localhost/son_masala', 'son_masala'], ['mongodb+srv://wrong.mongodb.net/son_masala', 'son_masala'], ['mongodb+srv://main.jtli6ua.mongodb.net/', undefined]]) assert.throws(() => assertTarget(uri, db));
});

test('27 required entries become unpriced drafts, not invented business inventory', () => {
  const plan = planMasalaSeed(empty(), publicRoot);
  assert.equal(plan.products.length, 27);
  assert.equal(new Set(masalaSeedCatalogue.map(item => item.sku)).size, 27);
  for (const row of plan.products) {
    assert.equal(row.action, 'inserted');
    assert.equal(row.set.status, 'draft');
    assert.equal(row.set.inventoryStatus, 'unknown');
    assert.deepEqual(row.set.variants, []);
    assert.deepEqual(row.set.availablePackSizes, []);
    assert.equal(row.set.botanicalName, '');
    assert.ok(row.set.hindiDescription);
  }
});

test('seed preserves business pricing, stock, status, SKU, verified claims and custom photography', () => {
  const product = { _id: 'existing', slug: 'jeera', sku: 'BUSINESS-CUMIN', category: 'whole-spices', status: 'published', featured: true, image: 'https://business.example/cumin.jpg', botanicalName: 'Verified identity', origin: 'Verified origin', originVerificationStatus: 'verified', originVerificationSource: 'Supplier document', variants: [{ _id: 'v', price: 49, mrp: 59, stock: 7 }] };
  const source = { ...empty(), products: [product] };
  const before = fingerprint(source);
  const row = planMasalaSeed(source, publicRoot).products.find(row => row.slug === 'jeera');
  for (const field of ['sku', 'status', 'featured', 'image', 'botanicalName', 'origin', 'originVerificationStatus', 'originVerificationSource', 'variants']) assert.equal(row.set[field], undefined, field);
  assert.equal(fingerprint(source), before);
});

test('existing aliases are reused and ambiguous identities or duplicate SKUs block writes', () => {
  const source = { ...empty(), products: [{ _id: 'a', slug: 'pipli', sku: 'PIPLI', status: 'draft' }] };
  const row = planMasalaSeed(source, publicRoot).products.find(row => row.name === 'Pipli');
  assert.equal(row.id, 'a');
  assert.equal(row.slug, 'pipli');
  assert.equal(row.set.slug, undefined);
  source.products.push({ _id: 'b', slug: 'long-pepper', sku: 'PIPLI' });
  assert.ok(planMasalaSeed(source, publicRoot).blockers.length);
});

test('unavailable spice photos use neutral placeholders and stock-photo repairs preserve money', () => {
  const source = { ...empty(), products: [{ _id: 'a', slug: 'mutton-masala', sku: 'MUTTON', image: 'https://images.unsplash.com/beverage', variants: [{ image: 'https://images.unsplash.com/beverage', price: 75, mrp: 90, stock: 4 }] }], variants: [{ _id: 'v', productId: 'a', image: 'https://images.unsplash.com/beverage', pricePaise: 7500, stock: 4 }] };
  const plan = planMasalaSeed(source, publicRoot);
  const row = plan.products.find(row => row.slug === 'mutton-masala');
  assert.equal(row.set.imageKind, 'placeholder');
  assert.equal(row.set.image, '/images/product-placeholder.svg');
  assert.equal(row.set.variants[0].price, 75);
  assert.equal(row.set.variants[0].stock, 4);
  assert.deepEqual(Object.keys(plan.variants[0].set).sort(), ['image', 'imageCrop']);
});

