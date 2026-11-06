import { describe, expect, it } from 'vitest';
import { previewCart } from './cart-preview';
describe('pending cart UI', () => {
  const cart = { items: [], count: 0, version: 7, totals: { totalPaise: 4900 } };
  const product = { _id: 'product', name: 'Spice', slug: 'spice' };
  const variant = { _id: 'pack', stock: 2, unitPricePaise: 12500, label: '100 g' };
  it('updates quantity immediately without inventing a confirmed total or version', () => {
    const added = previewCart(cart, { type: 'add', product, variant });
    expect(added.count).toBe(1); expect(added.pending).toBe(true);
    expect(added.items[0].optimistic).toBe(true);
    expect(added.totals).toBe(cart.totals); expect(added.version).toBe(7);
    expect(cart.items).toEqual([]);
    const more = previewCart(added, { type: 'quantity', itemId: added.items[0]._id, quantity: 2 });
    expect(more.count).toBe(2); expect(more.items[0].lineTotalPaise).toBe(25000);
    expect(previewCart(more, { type: 'add', product, variant }).count).toBe(2);
    expect(previewCart(more, { type: 'remove', itemId: more.items[0]._id }).count).toBe(0);
  });
});
