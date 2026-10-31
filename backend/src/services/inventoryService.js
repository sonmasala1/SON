import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import InventoryReservation from '../models/InventoryReservation.js';
import { httpError } from '../utils/httpError.js';

export async function listInventory() {
  const real = { isDemo: { $ne: true }, isSample: { $ne: true } };
  const canonical = await ProductVariant.find(real).populate({ path: 'productId', select: 'name', match: real }).lean();
  const canonicalParents = await ProductVariant.distinct('productId');
  const legacy = await Product.find({ ...real, _id: { $nin: canonicalParents }, 'variants.0': { $exists: true } }).lean();
  const embedded = legacy.flatMap(product => product.variants.filter(variant => !variant.isSample).map(variant => ({ ...variant, productId: { _id: product._id, name: product.name }, inventorySource: 'EMBEDDED' })));
  return [...canonical.filter(variant => variant.productId).map(variant => ({ ...variant, inventorySource: 'CANONICAL' })), ...embedded].sort((a, b) => a.stock - b.stock);
}

export function stockConflict(items, code = 'INSUFFICIENT_STOCK') {
  const conflicts = items.map(item => ({ productId: String(item.productId), variantId: String(item.variantId), name: item.name, label: item.label || '', requested: item.quantity, available: item.stock || 0, reason: item.reason || code }));
  return Object.assign(httpError(409, conflicts.map(item => `${item.name}${item.label ? ` (${item.label})` : ''}: requested ${item.requested}, available ${item.available}.`).join(' ')), { code, logReason: 'stock_conflict', conflicts });
}

// The same source selected by hydrateProduct must be used for deduction and release.
// Never create canonical variants or copy stock from the legacy embedded representation.
export async function deductInventory(item, session) {
  const real = { isDemo: { $ne: true }, isSample: { $ne: true } };
  let result;
  if (item.inventorySource === 'EMBEDDED') {
    // This inventory-only write cannot change media/identity. Match the stock and ID in ONE array element.
    result = await Product.collection.updateOne({
      _id: item.productId, status: 'published', ...real,
      variants: { $elemMatch: { _id: item.variantId, isActive: { $ne: false }, ...real, stock: { $gte: item.quantity } } },
    }, { $inc: { 'variants.$.stock': -item.quantity, __v: 1 } }, { session });
  } else {
    // Writing the parent also serializes checkout against archive/edit and source changes.
    const parent = await Product.updateOne({ _id: item.productId, status: 'published', ...real }, { $inc: { __v: 1 } }, { session });
    if (!parent.matchedCount) throw stockConflict([{ ...item, stock: 0, reason: 'PRODUCT_UNAVAILABLE' }], 'PRODUCT_UNAVAILABLE');
    result = await ProductVariant.updateOne({ _id: item.variantId, productId: item.productId, isActive: { $ne: false }, ...real, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } }, { session });
  }
  if (!result.matchedCount) throw stockConflict([{ ...item, stock: 0, reason: 'INVENTORY_CHANGED' }], 'INVENTORY_CHANGED');
}

export async function releaseOrderInventory(order, session) {
  for (const reservation of await InventoryReservation.find({ orderId: order._id, status: 'HELD' }).session(session)) {
    const item = order.items.find(value => String(value.variantId) === String(reservation.variantId));
    const productId = reservation.productId || item?.productId;
    const result = reservation.inventorySource === 'EMBEDDED'
      ? await Product.collection.updateOne({ _id: productId, 'variants._id': reservation.variantId }, { $inc: { 'variants.$.stock': reservation.quantity, __v: 1 } }, { session })
      : await ProductVariant.updateOne({ _id: reservation.variantId, ...(productId ? { productId } : {}) }, { $inc: { stock: reservation.quantity } }, { session });
    if (!result.matchedCount) throw Object.assign(httpError(409, `Inventory for ${item?.name || 'an ordered product'} could not be restored. Contact the store administrator.`), { code: 'RESTOCK_TARGET_MISSING', logReason: 'restock_target_missing' });
    if (reservation.inventorySource !== 'EMBEDDED' && productId) await Product.updateOne({ _id: productId }, { $inc: { __v: 1 } }, { session });
    reservation.status = 'RELEASED';
    await reservation.save({ session });
  }
}
