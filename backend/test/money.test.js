import test from 'node:test';
import assert from 'node:assert/strict';
import { cartTotals, toPaise } from '../src/utils/money.js';
test('prices use integer paise and discounts never use floating point totals', () => {
  assert.equal(toPaise(19.99), 1999);
  const totals = cartTotals([{ regularPricePaise: 9900, unitPricePaise: 8900, quantity: 2 }]);
  assert.deepEqual(totals, { subtotalPaise: 19800, discountPaise: 2000, deliveryPaise: 4900, totalPaise: 22700 });
  assert.equal(cartTotals([{ regularPricePaise: 49900, unitPricePaise: 49900, quantity: 1 }]).deliveryPaise, 0);
  assert.equal(cartTotals([]).totalPaise, 0);
});
