import test from 'node:test';
import assert from 'node:assert/strict';
import ProductVariant from '../src/models/ProductVariant.js';
import { hydrateProducts } from '../src/services/productService.js';

test('catalogue batches variants in one query and preserves canonical eligibility and embedded fallback', async t => {
  let calls = 0;
  t.mock.method(ProductVariant, 'find', query => {
    calls++; assert.deepEqual(query.productId.$in, ['first', 'second', 'third']);
    return { sort: () => ({ lean: async () => [
      { _id: 'a', productId: 'first', isActive: true, pricePaise: 15000, mrpPaise: 15000, stock: 4 },
      { _id: 'b', productId: 'first', isSample: true, pricePaise: 100, mrpPaise: 100, stock: 9 },
      { _id: 'c', productId: 'second', isActive: false, pricePaise: 10000, mrpPaise: 10000, stock: 7 },
    ] }) };
  });
  const result = await hydrateProducts([
    { _id: 'first' }, { _id: 'second', variants: [{ price: 20, stock: 1 }] },
    { _id: 'third', variants: [{ _id: 'legacy', price: 30, stock: 2 }] },
  ]);
  assert.equal(calls, 1);
  assert.equal(result[0].variants.length, 1); assert.equal(result[0].variants[0].unitPricePaise, 15000);
  assert.deepEqual(result[1].variants, []); // Inactive canonical packs must not fall back to embedded stock.
  assert.equal(result[2].variants[0].inventorySource, 'EMBEDDED');
  assert.deepEqual(await hydrateProducts([]), []); assert.equal(calls, 1);
});
