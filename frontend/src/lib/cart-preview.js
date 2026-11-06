// Pending UI only. Server totals/version remain authoritative until confirmation.
export function previewCart(cart, change) {
  if (!cart) return cart;
  let items = cart.items || [];
  if (change.type === 'add') {
    const { product, variant } = change;
    const existing = items.find(item => String(item.productId) === String(product._id) && String(item.variantId) === String(variant._id));
    const quantity = (existing?.quantity || 0) + 1;
    const unitPricePaise = variant.unitPricePaise ?? variant.offerPricePaise ?? variant.pricePaise;
    if (!Number.isSafeInteger(unitPricePaise) || unitPricePaise < 1 || quantity > Math.min(99, variant.stock)) return cart;
    const item = { ...existing, _id: existing?._id || `pending:${product._id}:${variant._id}`, productId: product._id, variantId: variant._id, slug: product.slug, name: product.name, hindiName: product.hindiName, image: variant.image || product.image, imageCrop: variant.imageCrop || 'full', label: variant.label, quantity, stock: variant.stock, unitPricePaise, lineTotalPaise: quantity * unitPricePaise, available: true, optimistic: true };
    items = existing ? items.map(value => value === existing ? item : value) : [...items, item];
  } else if (change.type === 'quantity') {
    items = items.map(item => item._id === change.itemId && Number.isSafeInteger(change.quantity) && change.quantity > 0 && change.quantity <= Math.min(99, item.stock)
      ? { ...item, quantity: change.quantity, lineTotalPaise: change.quantity * item.unitPricePaise, optimistic: true } : item);
  } else if (change.type === 'remove') items = items.filter(item => item._id !== change.itemId);
  return { ...cart, items, count: items.reduce((sum, item) => sum + item.quantity, 0), pending: true };
}
