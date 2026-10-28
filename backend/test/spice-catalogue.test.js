import test from 'node:test';
import assert from 'node:assert/strict';
import { spiceCatalogue, spiceCatalogueCategories } from '../src/data/spiceCatalogue.js';

test('catalogue contains every requested entry with stable unique identifiers', () => {
  assert.equal(spiceCatalogue.length, 27);
  assert.deepEqual(spiceCatalogue.map(product => product.slug), [
    'jeera', 'sabut-dhaniya', 'kali-mirch', 'laung', 'dalchini', 'choti-elaichi',
    'badi-elaichi', 'tej-patta', 'ajwain', 'saunf', 'methi-dana', 'rai', 'jaiphal',
    'javitri', 'pippali', 'sukhi-adrak', 'haldi-powder', 'dhaniya-powder',
    'lal-mirch-powder', 'jeera-powder', 'garam-masala', 'biryani-masala',
    'chole-masala', 'rajma-masala', 'sabzi-masala', 'mutton-masala', 'chicken-masala',
  ]);
  assert.equal(new Set(spiceCatalogue.map(product => product.slug)).size, spiceCatalogue.length);
  assert.equal(new Set(spiceCatalogue.map(product => product.sku)).size, spiceCatalogue.length);
  assert.deepEqual(
    spiceCatalogueCategories.map(category => category.slug),
    ['whole-spices', 'ground-spices', 'blended-masalas'],
  );
});

test('unverified catalogue entries remain non-purchasable drafts without invented claims', () => {
  for (const product of spiceCatalogue) {
    assert.equal(product.status, 'draft');
    assert.equal(product.inventoryStatus, 'unknown');
    assert.deepEqual(product.variants, []);
    assert.deepEqual(product.availablePackSizes, []);
    assert.equal(product.origin, '');
    assert.equal(product.shelfLife, '');
    assert.deepEqual(product.ingredientComposition, []);
    assert.equal(product.ingredientCompositionVerified, false);
    assert.equal(product.ingredientCompositionSource, '');
  }
  assert.deepEqual(spiceCatalogue.find(product => product.slug === 'jeera').packSizeOptions, ['100 g', '250 g', '500 g']);
  assert.ok(spiceCatalogue.filter(product => product.category === 'blended-masalas').every(product => product.ingredients.length === 0));
});
