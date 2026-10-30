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

test('delivery is 49 rupees below 499 and free at the exact eligible-subtotal boundary', () => {
  const item = amount => [{ regularPricePaise: amount, unitPricePaise: amount, quantity: 1 }];
  assert.deepEqual(cartTotals(item(49899)), { subtotalPaise: 49899, discountPaise: 0, deliveryPaise: 4900, totalPaise: 54799 });
  assert.deepEqual(cartTotals(item(49900)), { subtotalPaise: 49900, discountPaise: 0, deliveryPaise: 0, totalPaise: 49900 });
  assert.equal(cartTotals(item(49901)).deliveryPaise, 0);
  assert.equal(cartTotals([{ regularPricePaise: 60000, unitPricePaise: 49899, quantity: 1 }]).deliveryPaise, 4900, 'discounted subtotal controls eligibility');
  assert.equal(cartTotals([{ regularPricePaise: 24950, unitPricePaise: 24950, quantity: 2 }]).deliveryPaise, 0);
});

test('unavailable items cannot qualify an order for free shipping; paise and quantities stay integral', () => {
  const available = { regularPricePaise: 10000, unitPricePaise: 10000, quantity: 1, available: true };
  const unavailable = { regularPricePaise: 60000, unitPricePaise: 60000, quantity: 1, available: false };
  assert.deepEqual(cartTotals([available, unavailable]), { subtotalPaise: 10000, discountPaise: 0, deliveryPaise: 4900, totalPaise: 14900 });
  assert.equal(cartTotals([unavailable]).totalPaise, 0);
  assert.equal(cartTotals([]).deliveryPaise, 0);
  assert.throws(() => cartTotals([{ ...available, unitPricePaise: 10.5 }]), /Invalid cart/);
  assert.throws(() => cartTotals([{ ...available, quantity: 0 }]), /Invalid cart/);
  assert.throws(() => cartTotals([available], -1), /Invalid delivery/);
});
