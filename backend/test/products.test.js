import test from 'node:test';
import assert from 'node:assert/strict';
import Product from '../src/models/Product.js';
import { productQuery } from '../src/validators/product.js';
import { classifyDatabaseError } from '../src/config/db.js';
import { publishedFilter, storefrontFilter } from '../src/services/productService.js';

test('commercial catalogue excludes sample-priced products in production', () => {
  assert.deepEqual(publishedFilter(false, false).isSample, { $ne: true });
  assert.deepEqual(publishedFilter(false, false).isDemo, { $ne: true });
  assert.equal(publishedFilter(false, true).isSample, undefined);
});

test('products default to drafts without invented prices or stock', async () => {
  const product = new Product({ name: 'Haldi Powder', slug: 'haldi-powder', category: 'ground-spices' });
  await product.validate();
  assert.equal(product.status, 'draft');
  assert.equal(product.catalogVisible, false);
  assert.deepEqual(product.variants.toObject(), []);
});

test('browsing explicitly approved drafts does not enable their purchase or expose archived products', async () => {
  const filter = storefrontFilter(false, false);
  assert.deepEqual(filter.$or[0], publishedFilter(false, false));
  assert.deepEqual(filter.$or[1], { catalogVisible: true, status: { $in: ['draft', 'published'] }, isDemo: { $ne: true } });
  assert.equal(publishedFilter(false, true).status, 'published');
  const preview = new Product({ name: 'New spice', slug: 'new-spice', category: 'whole-spices', catalogVisible: true });
  await preview.validate();
  assert.equal(preview.status, 'draft');
  assert.deepEqual(preview.variants.toObject(), []);
});

test('product SKU index matches the existing sparse non-unique database index', () => {
  const skuIndex = Product.schema.indexes().find(([keys]) => keys.sku === 1);
  assert.deepEqual(skuIndex[0], { sku: 1 });
  assert.equal(skuIndex[1].sparse, true);
  assert.equal(skuIndex[1].unique, undefined);
});

test('publication requires product details and positive prices', async () => {
  const product = new Product({ name: 'Unconfigured product', slug: 'unconfigured', category: 'ground-spices', status: 'published' });
  await assert.rejects(product.validate(), /description.*variants|variants.*description/);
  product.description = 'Configured product';
  product.variants = [{ label: '100 g', price: 0 }];
  await assert.rejects(product.validate(), /actual positive prices/);
});

test('product search rejects invalid categories and excessive limits', () => {
  assert.equal(productQuery.safeParse({ category: 'invalid category' }).success, false);
  assert.equal(productQuery.safeParse({ category: 'new-catalogue-category' }).success, true);
  assert.equal(productQuery.safeParse({ limit: 1000 }).success, false);
  assert.equal(productQuery.safeParse({ q: 'a'.repeat(81) }).success, false);
});

test('product claims require verification and blended percentages require a verified specification', async () => {
  const product = new Product({
    name: 'Test blend',
    slug: 'test-blend',
    category: 'blended-masalas',
    origin: 'Unverified origin',
    originVerificationStatus: 'unknown',
  });
  await assert.rejects(product.validate(), /Origin claims require a verified source/);
  product.origin = '';
  product.ingredientComposition = [{ name: 'Ingredient', percentage: 100 }];
  await assert.rejects(product.validate(), /verified SON MASALA specification source/);
  product.ingredientCompositionVerified = true;
  product.ingredientCompositionSource = 'Manufacturing specification revision 1';
  await product.validate();
});

test('database diagnostics classify errors without disclosing connection strings', () => {
  assert.match(classifyDatabaseError({ code: 18, message: 'mongodb://secret' }), /authentication/);
  assert.match(classifyDatabaseError({ code: 'ENOTFOUND' }), /DNS SRV lookup failed/);
  assert.match(classifyDatabaseError({ code: 86, codeName: 'IndexKeySpecsConflict' }), /index conflicts with the application schema/);
  assert.match(classifyDatabaseError({ reason: { servers: new Map([['atlas', { error: { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' } }]]) } }), /TLS handshake failed/);
  assert.match(classifyDatabaseError({ reason: { servers: new Map([['atlas', { error: { code: 'ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR' } }]]) } }), /current public IP is allowed in Atlas Network Access/);
  assert.equal(classifyDatabaseError({ message: 'mongodb://secret' }).includes('secret'), false);
});
