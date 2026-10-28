import test from 'node:test';
import assert from 'node:assert/strict';
import { productImageIssues } from '../src/validators/productImage.js';
import { planProductImages } from '../scripts/lib/productImagePlan.js';
import { readImageManifest } from '../src/validators/productImage.js';

const row = { productId: 'p1', sku: 'CARDAMOM', slug: 'badi-elaichi', name: 'Badi Elaichi', hindiName: 'बड़ी इलायची', category: 'whole-spices', image: '/images/products/badi-elaichi.png', visuallyVerified: true, sha256: 'abc', variantSkus: ['CARDAMOM-100'] };
const nutmeg = { ...row, productId: 'p2', sku: 'NUTMEG', slug: 'jaiphal', name: 'Jaiphal', image: '/images/products/jaiphal.png', variantSkus: ['NUTMEG-100'] };
const manifest = { products: [row, nutmeg] };
const product = { ...row, _id: 'p1', images: [row.image], variants: [{ sku: 'CARDAMOM-100', image: row.image, imageCrop: 'full' }] };
const check = value => productImageIssues(value, manifest, { checkFiles: false });
test('exact name, Hindi, SKU, slug and parent ID own the image', () => {
  assert.deepEqual(check(product), []);
  for (const field of ['name', 'hindiName', 'sku', 'slug', '_id']) assert.ok(check({ ...product, [field]: 'unrelated' }).length, field);
  assert.ok(check({ ...product, image: nutmeg.image }).length);
  assert.ok(check({ ...product, images: [nutmeg.image] }).length);
  assert.ok(check({ ...product, category: 'ground-spices' }).length);
});
test('variant images, crops and known unrelated variant SKUs cannot bypass ownership', () => {
  for (const variant of [{ sku: 'CARDAMOM-100', image: nutmeg.image }, { sku: 'NUTMEG-100', image: row.image }, { sku: 'CARDAMOM-100', image: row.image, imageCrop: 'left-half' }]) assert.ok(check({ ...product, variants: [variant] }).length);
});
test('external URLs, traversal, legacy photos and unverified files are rejected', () => {
  for (const image of ['https://images.unsplash.com/spice.jpg', '/images/spices.jpg', '/images/products/../jaiphal.png', '//example.com/image.png']) assert.ok(check({ ...product, image }).length);
  assert.ok(productImageIssues(product, { products: [{ ...row, visuallyVerified: false }] }, { checkFiles: false }).length);
  assert.ok(productImageIssues(product, manifest).length); // Hash/file integrity is mandatory.
});
test('the plan inspects every record and never invents missing images or business data', () => {
  const source = { database: 'son_masala', products: [{ ...product, image: '', images: [], variants: [{ sku: 'CARDAMOM-100', price: 77, stock: 12 }] }], variants: [], categories: [{ slug: 'whole-spices' }] };
  const original = JSON.stringify(source);
  const plan = planProductImages(source, manifest);
  assert.equal(plan.products.length, 1);
  assert.ok(plan.blockers.length);
  assert.equal(plan.products[0].set.variants[0].price, 77);
  assert.equal(plan.products[0].set.variants[0].stock, 12);
  assert.equal(JSON.stringify(source), original);
});
test('manifest covers the seven explicitly requested spice identities separately', () => {
  const actual = readImageManifest();
  for (const slug of ['badi-elaichi', 'jaiphal', 'javitri', 'methi-dana', 'sukhi-adrak', 'rai', 'pippali']) assert.ok(actual.products.some(p => p.slug === slug));
  assert.equal(new Set(actual.products.map(p => p.image)).size, actual.products.length);
});
