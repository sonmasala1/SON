export function toPaise(value) {
  const paise = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('Invalid price');
  return paise;
}
export function cartTotals(items, deliveryChargePaise = 4900, freeDeliveryThresholdPaise = 49900) {
  const subtotalPaise = items.reduce((sum, item) => sum + item.regularPricePaise * item.quantity, 0);
  const totalProductsPaise = items.reduce((sum, item) => sum + item.unitPricePaise * item.quantity, 0);
  const discountPaise = subtotalPaise - totalProductsPaise;
  const deliveryPaise = items.length && totalProductsPaise < freeDeliveryThresholdPaise ? deliveryChargePaise : 0;
  return { subtotalPaise, discountPaise, deliveryPaise, totalPaise: totalProductsPaise + deliveryPaise };
}
