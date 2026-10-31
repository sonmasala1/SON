import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import InventoryReservation from '../models/InventoryReservation.js';
import { getCart, serializeCart, validateCart } from './cartService.js';
import { deductInventory, releaseOrderInventory } from './inventoryService.js';
import { httpError } from '../utils/httpError.js';
import { logEvent } from './logger.js';

export async function runTransaction(work) {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw httpError(503, 'Checkout needs a MongoDB replica set. Please contact the store administrator.');
  let result;
  await mongoose.connection.transaction(async session => { result = await work(session); });
  return result;
}

export async function createPayLaterOrder(req, { delivery, requestKey, cartVersion, expectedTotalPaise }) {
  try {
    const order = await runTransaction(async session => {
      const existing = await Order.findOne({ ownerKey: req.ownerKey, requestKey }).session(session);
      if (existing) return existing;
      const cart = await getCart(req, session);
      if (cartVersion != null && cart.__v !== cartVersion) throw Object.assign(httpError(409, 'Your bag changed after review. Please review it again.'), { code: 'CART_CHANGED', logReason: 'cart_changed' });
      const preview = await serializeCart(req, cart, session);
      validateCart(preview);
      if (expectedTotalPaise != null && preview.totals.totalPaise !== expectedTotalPaise) throw Object.assign(httpError(409, 'Prices or delivery charges changed after review. Please review the updated total.'), { code: 'TOTAL_CHANGED', logReason: 'cart_changed' });
      const [created] = await Order.create([{
        publicId: `SON-${randomUUID().toUpperCase()}`, ownerKey: req.ownerKey, userId: req.user?._id,
        cartId: cart._id, cartVersion: cart.__v, requestKey, paymentMode: 'PAY_LATER',
        paymentStatus: 'PENDING', fulfillmentStatus: 'PLACED', isDemo: false,
        items: preview.items, totals: preview.totals, delivery,
      }], { session });
      for (const item of preview.items) {
        await deductInventory(item, session);
        await InventoryReservation.create([{ orderId: created._id, productId: item.productId, variantId: item.variantId, inventorySource: item.inventorySource, quantity: item.quantity, status: 'HELD' }], { session });
      }
      await Payment.create([{ orderId: created._id, paymentMode: 'PAY_LATER', status: 'PENDING', amountPaise: created.totals.totalPaise, isDemo: false }], { session });
      cart.items = []; cart.increment();
      await cart.save({ session });
      return created;
    });
    // Log only after commit; MongoDB can retry transaction callbacks.
    logEvent('INFO', 'order.created', { status: 201 }, req);
    return order;
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Order.findOne({ ownerKey: req.ownerKey, requestKey });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function cancelPayLaterOrder(req, orderId) {
  const result = await runTransaction(async session => {
    const order = await Order.findOne({ publicId: orderId, ownerKey: req.ownerKey, isDemo: { $ne: true }, paymentMode: 'PAY_LATER' }).session(session);
    if (!order) throw httpError(404, 'Order not found.');
    if (order.fulfillmentStatus === 'CANCELLED') return order;
    if (order.paymentStatus !== 'PENDING' || ['SHIPPED', 'DELIVERED'].includes(order.fulfillmentStatus)) throw httpError(409, 'This order cannot be cancelled here. Please contact the store.');
    await releaseOrderInventory(order, session);
    order.paymentStatus = 'CANCELLED';
    order.fulfillmentStatus = 'CANCELLED';
    await order.save({ session });
    await Payment.updateOne({ orderId: order._id }, { $set: { status: 'CANCELLED' } }, { session });
    return order;
  });
  logEvent('INFO', 'order.cancelled', { status: 200 }, req);
  return result;
}

export function publicOrder(order) {
  const { publicId, paymentMode, paymentStatus, fulfillmentStatus, items, totals, delivery, createdAt } = order.toObject ? order.toObject() : order;
  return { id: publicId, paymentMode, paymentStatus, fulfillmentStatus, items, totals, delivery, createdAt };
}
