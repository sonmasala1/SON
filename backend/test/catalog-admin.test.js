import test from 'node:test';
import assert from 'node:assert/strict';
import { productInput, variantInput } from '../src/controllers/catalogAdminController.js';

const draft = {
  name: 'Raw cumin',
  slug: 'raw-cumin',
  category: 'whole-spices',
  status: 'draft',
};

test('catalogue admin accepts unpriced draft products without invented origin or shelf-life claims', () => {
  const result = productInput.safeParse(draft);
  assert.equal(result.success, true);
  assert.equal(result.data.status, 'draft');
  assert.deepEqual(result.data.variants, []);
  assert.equal(result.data.origin, '');
  assert.equal(result.data.shelfLife, '');
});

test('catalogue admin requires Hindi product details before publication', () => {
  const publishable = {
    ...draft,
    hindiName: 'कच्चा जीरा',
    description: 'Verified product description.',
    hindiDescription: 'पुष्ट उत्पाद विवरण।',
    status: 'published',
    inventoryStatus: 'known',
    variants: [{ label: '100g', sku: 'CUMIN-100', weightGrams: 100, price: 50, mrp: 60, stock: 0 }],
  };
  assert.equal(productInput.safeParse(publishable).success, true);
  assert.equal(productInput.safeParse({ ...publishable, hindiDescription: '' }).success, false);
});

test('catalogue admin requires traceable verification for origin and shelf life', () => {
  assert.equal(productInput.safeParse({ ...draft, origin: 'Kerala' }).success, false);
  assert.equal(productInput.safeParse({ ...draft, shelfLife: '12 months' }).success, false);
  assert.equal(productInput.safeParse({
    ...draft,
    origin: 'Kerala',
    originVerificationStatus: 'verified',
    originVerificationSource: 'Supplier lot documentation',
  }).success, true);
});

test('blend percentages require a verified specification and must total 100', () => {
  const composition = [{ name: 'Cumin', percentage: 60 }, { name: 'Coriander', percentage: 40 }];
  assert.equal(productInput.safeParse({ ...draft, ingredientComposition: composition }).success, false);
  assert.equal(productInput.safeParse({
    ...draft,
    ingredientComposition: composition,
    ingredientCompositionVerified: true,
    ingredientCompositionSource: 'Manufacturing spec revision 2',
  }).success, true);
  assert.equal(productInput.safeParse({
    ...draft,
    ingredientComposition: [{ name: 'Cumin', percentage: 60 }],
    ingredientCompositionVerified: true,
    ingredientCompositionSource: 'Manufacturing spec revision 2',
  }).success, false);
});

test('pack prices require SKU, weight and valid MRP; unpriced stock-zero packs remain valid drafts', () => {
  assert.equal(variantInput.safeParse({ label: '100g', price: null, mrp: null, stock: 0 }).success, true);
  assert.equal(variantInput.safeParse({ label: '100g', price: 50, mrp: 45, sku: 'CUMIN-100', weightGrams: 100, stock: 0 }).success, false);
  assert.equal(variantInput.safeParse({ label: '100g', price: 50, mrp: 60, sku: 'CUMIN-100', weightGrams: 100, stock: 0 }).success, true);
});
