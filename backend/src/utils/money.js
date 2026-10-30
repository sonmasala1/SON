export function toPaise(value) {
  const paise = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid price');
  return paise;
}
export function cartTotals(items, deliveryChargePaise = 4900, freeDeliveryThresholdPaise = 49900) {
  if (![deliveryChargePaise, freeDeliveryThresholdPaise].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid delivery configuration');
  const eligible = items.filter(item => item.available !== false);
  if (eligible.some(item => ![item.regularPricePaise, item.unitPricePaise].every(value => Number.isSafeInteger(value) && value >= 0) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.unitPricePaise > item.regularPricePaise)) throw new Error('Invalid cart price or quantity');
  const subtotalPaise = eligible.reduce((sum, item) => sum + item.regularPricePaise * item.quantity, 0);
  const totalProductsPaise = eligible.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0);
  const discountPaise = subtotalPaise - totalProductsPaise;
  const deliveryPaise = eligible.length && totalProductsPaise < freeDeliveryThresholdPaise ? deliveryChargePaise : 0;
  if (![subtotalPaise, totalProductsPaise, totalProductsPaise + deliveryPaise].every(Number.isSafeInteger)) throw new Error('Cart total exceeds supported limits');
  return { subtotalPaise, discountPaise, deliveryPaise, totalPaise: totalProductsPaise + deliveryPaise };
}
