import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import { hydrateProduct } from './productService.js';
import { httpError } from '../utils/httpError.js';
import { cartTotals } from '../utils/money.js';
import { stockConflict } from './inventoryService.js';
import Order from '../models/Order.js';
import { logEvent } from './logger.js';

export async function getCart(req, session = null) {
  let cart = await Cart.findOne({ ownerKey: req.ownerKey }).session(session);
  if (!cart) {
    try { [cart] = await Cart.create([{ ownerKey: req.ownerKey, userId: req.user?._id, items: [] }], { session }); }
    catch (error) { if (error.code !== 11000 || session) throw error; cart = await Cart.findOne({ ownerKey: req.ownerKey }); }
  }
  return cart;
}
export async function getVariant(req, productId, variantId, session = null, quantity = 1) {
  const record = await Product.findById(productId).session(session).lean();
  const unavailable = { productId, variantId, name: record?.name || `Product ${productId}`, label: record?.variants?.find(value => String(value._id) === String(variantId))?.label, quantity, stock: 0 };
  if (!record || record.status !== 'published' || record.isDemo || record.isSample) throw stockConflict([{ ...unavailable, reason: 'PRODUCT_UNAVAILABLE' }], 'PRODUCT_UNAVAILABLE');
  const product = await hydrateProduct(record, session, false);
  const variant = product.variants.find(value => String(value._id) === String(variantId));
  if (!variant || !Number.isSafeInteger(variant.unitPricePaise) || variant.unitPricePaise < 1 || !Number.isSafeInteger(variant.stock) || variant.stock < 0) {
    const stored = await ProductVariant.findOne({ _id: variantId, productId }).select('label').session(session).lean();
    throw stockConflict([{ ...unavailable, label: stored?.label || unavailable.label, reason: 'VARIANT_UNAVAILABLE' }], 'VARIANT_UNAVAILABLE');
  }
  return { product, variant };
}
export async function serializeCart(req, cart, session = null) {
  const items = [];
  for (const item of cart.items) {
    try {
      const { product, variant } = await getVariant(req, item.productId, item.variantId, session, item.quantity);
      items.push({ _id: String(item._id), productId: product._id, variantId: variant._id, inventorySource: variant.inventorySource, slug: product.slug, name: product.name, hindiName: product.hindiName, image: variant.image || product.image, imageCrop: variant.imageCrop || 'full', label: variant.label, sku: variant.sku, quantity: item.quantity, stock: variant.stock, regularPricePaise: variant.pricePaise, unitPricePaise: variant.unitPricePaise, lineTotalPaise: variant.unitPricePaise * item.quantity, available: Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 99 && variant.stock >= item.quantity });
    } catch (error) {
      if (error.status !== 409) throw error;
      items.push({ _id: String(item._id), productId: item.productId, variantId: item.variantId, name: error.conflicts?.[0]?.name || `Product ${item.productId}`, label: error.conflicts?.[0]?.label, reason: error.code, quantity: item.quantity, available: false, stock: 0, regularPricePaise: 0, unitPricePaise: 0, lineTotalPaise: 0 });
    }
  }
  const { deliveryChargePaise, freeDeliveryThresholdPaise } = req.app.locals.config;
  const totals = cartTotals(items, deliveryChargePaise, freeDeliveryThresholdPaise);
  if (!session) logEvent('INFO', 'cart.calculated', { ...totals, itemCount: items.length }, req);
  return { id: cart.id, version: cart.__v, items, count: items.reduce((sum, item) => sum + item.quantity, 0), totals, valid: items.length > 0 && items.every(item => item.available), deliveryChargePaise, freeDeliveryThresholdPaise };
}
export function validateCart(cart) {
  if (!cart.items.length) throw Object.assign(httpError(409, 'Your bag is empty. Add a product before placing an order.'), { code: 'CART_EMPTY', logReason: 'cart_empty' });
  const seen = new Set();
  for (const item of cart.items) {
    const key = `${item.productId}:${item.variantId}`;
    if (seen.has(key)) throw Object.assign(httpError(409, `${item.name} (${item.label || item.variantId}) appears more than once in your bag. Remove the repeated pack and review your quantities.`), { code: 'CART_CHANGED', logReason: 'cart_changed' });
    seen.add(key);
  }
  const unavailable = cart.items.filter(item => !item.available);
  if (unavailable.length) throw stockConflict(unavailable);
}
export async function mutateCart(req, change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cart = await getCart(req);
    const items = await change(cart.items.map(item => item.toObject()));
    if (items.length > 50) throw httpError(400, 'Your bag can contain up to 50 different packs.');
    const saved = await Cart.findOneAndUpdate({ _id: cart._id, __v: cart.__v }, { $set: { items }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (saved) return serializeCart(req, saved);
  }
  throw httpError(409, 'Your bag changed in another tab. Please refresh and try again.');
}
export async function mergeGuestCart(req, user, session) {
  const guest = await Cart.findOne({ ownerKey: req.guestKey }).session(session);
  const ownerKey = `user:${user.id}`;
  let customer = await Cart.findOne({ ownerKey }).session(session);
  if (!customer) [customer] = await Cart.create([{ ownerKey, userId: user._id, items: [] }], { session });
  // Claim only orders owned by this browser's secret guest cookie, never by submitted name/phone.
  await Order.updateMany({ ownerKey: req.guestKey }, { ownerKey, userId: user._id }, { session });
  if (guest) await Order.updateMany({ ownerKey, cartId: guest._id, paymentStatus: 'PENDING' }, { cartId: customer._id }, { session });
  if (!guest || !guest.items.length) return;
  for (const item of guest.items) {
    try {
      const { variant } = await getVariant(req, item.productId, item.variantId, session);
      const match = customer.items.find(value => String(value.variantId) === String(item.variantId) && String(value.productId) === String(item.productId));
      const quantity = Math.min(99, variant.stock, item.quantity + (match?.quantity || 0));
      if (quantity < 1) continue;
      if (match) match.quantity = quantity;
      else if (customer.items.length < 50) customer.items.push({ productId: item.productId, variantId: item.variantId, quantity });
    } catch (error) { if (error.status !== 409) throw error; }
  }
  customer.increment();
  await customer.save({ session });
  guest.items = []; guest.increment();
  await guest.save({ session });
}
