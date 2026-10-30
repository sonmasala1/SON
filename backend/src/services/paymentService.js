import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import ProductVariant from '../models/ProductVariant.js';
import InventoryReservation from '../models/InventoryReservation.js';
import Cart from '../models/Cart.js';
import { getCart, serializeCart } from './cartService.js';
import { httpError } from '../utils/httpError.js';
import { logEvent } from './logger.js';

export async function runTransaction(work) {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw httpError(503, 'Checkout needs a MongoDB replica set. Please contact the store administrator.');
  let result;
  await mongoose.connection.transaction(async session => { result = await work(session); });
  return result;
}
export async function createDemoOrder(req, { delivery, requestKey }) {
  try {
    return await runTransaction(async session => {
      const existing = await Order.findOne({ ownerKey: req.ownerKey, requestKey }).session(session);
      if (existing) return existing;
      if (await Order.countDocuments({ ownerKey: req.ownerKey, paymentStatus: 'PENDING' }).session(session) >= 3) throw httpError(409, 'Please complete or cancel an existing demo payment first.');
      const cart = await getCart(req, session);
      const preview = await serializeCart(req, cart, session);
      if (!preview.valid) throw httpError(409, 'Your bag is empty or contains unavailable quantities. Please review it.');
      if (preview.items.some(item => !item.isDemo)) throw httpError(400, 'Demo checkout accepts development demo products only.');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const [order] = await Order.create([{
        publicId: `DEMO-${randomUUID().toUpperCase()}`, ownerKey: req.ownerKey, userId: req.user?._id,
        cartId: cart._id, cartVersion: cart.__v, requestKey, paymentMode: 'DEMO', paymentStatus: 'PENDING',
        items: preview.items, totals: preview.totals, delivery, expiresAt,
      }], { session });
      for (const item of preview.items) {
        const variant = await ProductVariant.findOneAndUpdate({ _id: item.variantId, productId: item.productId, isDemo: true, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } }, { session });
        if (!variant) throw httpError(409, 'Stock changed while you were checking out. Please review your bag.');
        await InventoryReservation.create([{ orderId: order._id, variantId: item.variantId, quantity: item.quantity, expiresAt }], { session });
      }

      await Payment.create([{ orderId: order._id, paymentMode: 'DEMO', status: 'PENDING', amountPaise: order.totals.totalPaise }], { session });
      return order;
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Order.findOne({ ownerKey: req.ownerKey, requestKey });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function createPayLaterOrder(req, { delivery, requestKey }) {
        try {
          return await runTransaction(async session => {
            const existing = await Order.findOne({ ownerKey: req.ownerKey, requestKey }).session(session);
            if (existing) return existing;
            const cart = await getCart(req, session);
            const preview = await serializeCart(req, cart, session);
            if (!preview.valid || preview.items.some(item => item.isDemo)) throw httpError(409, 'Your bag contains unavailable items. Please review it before placing the order.');
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            const [order] = await Order.create([{
              publicId: `SON-${randomUUID().toUpperCase()}`, ownerKey: req.ownerKey, userId: req.user?._id,
              cartId: cart._id, cartVersion: cart.__v, requestKey, paymentMode: 'PAY_LATER',
              paymentStatus: 'PENDING', fulfillmentStatus: 'PLACED', isDemo: false,
              items: preview.items.map(item => ({
                productId: item.productId, variantId: item.variantId, name: item.name, hindiName: item.hindiName,
                label: item.label, sku: item.sku, image: item.image, imageCrop: item.imageCrop, quantity: item.quantity,
                unitPricePaise: item.unitPricePaise, lineTotalPaise: item.lineTotalPaise,
              })),
              totals: preview.totals, delivery, expiresAt,
            }], { session });
            for (const item of preview.items) {
              const updated = await ProductVariant.findOneAndUpdate(
                { _id: item.variantId, productId: item.productId, isDemo: false, isActive: true, stock: { $gte: item.quantity } },
                { $inc: { stock: -item.quantity } }, { new: true, session }
              );
              if (!updated) throw httpError(409, 'Stock changed while you were checking out. Please review your bag.');
              await InventoryReservation.create([{ orderId: order._id, variantId: item.variantId, quantity: item.quantity, status: 'HELD', expiresAt }], { session });
            }
            await Payment.create([{ orderId: order._id, paymentMode: 'PAY_LATER', status: 'PENDING', amountPaise: order.totals.totalPaise, isDemo: false }], { session });
            cart.items = []; cart.increment();
            await cart.save({ session });
            logEvent('INFO', 'order.created', { status: 201 }, req);
            logEvent('INFO', 'order.stock.reserved', { status: 200 }, req);
            return order;
          });
        } catch (error) {
          if (error.code === 11000) {
            const order = await Order.findOne({ ownerKey: req.ownerKey, requestKey });
            if (order) return order;
          }
          throw error;
        }
      }

      export async function cancelPayLaterOrder(req, orderId) {
        return runTransaction(async session => {
          const order = await Order.findOne({ publicId: orderId, ownerKey: req.ownerKey, isDemo: false, paymentMode: 'PAY_LATER' }).session(session);
          if (!order) throw httpError(404, 'Order not found.');
          if (order.fulfillmentStatus === 'CANCELLED') return order;
          if (order.paymentStatus === 'PAID') throw httpError(409, 'Paid orders cannot be cancelled here. Please contact the store.');
          for (const reservation of await InventoryReservation.find({ orderId: order._id, status: 'HELD' }).session(session)) {
            await ProductVariant.updateOne({ _id: reservation.variantId }, { $inc: { stock: reservation.quantity } }, { session });
            reservation.status = 'RELEASED';
            await reservation.save({ session });
          }
          order.paymentStatus = 'CANCELLED';
          order.fulfillmentStatus = 'CANCELLED';
          await order.save({ session });
          logEvent('INFO', 'order.cancelled', { status: 200 }, req);
          return order;
        });
      }
export async function settleDemoOrder({ ownerKey, orderId, outcome, expiredOnly = false }) {
  return runTransaction(async session => {
    const order = await Order.findOne({ publicId: orderId, ownerKey, isDemo: true, paymentMode: 'DEMO' }).session(session);
    if (!order) throw httpError(404, 'Demo order not found.');
    if (order.paymentStatus !== 'PENDING') {
      if (expiredOnly || order.paymentStatus === outcome) return order;
      throw httpError(409, 'This demo payment already has a final status.');
    }
    const status = order.expiresAt <= new Date() ? 'CANCELLED' : outcome;
    if (expiredOnly && order.expiresAt > new Date()) return order;
    const held = await InventoryReservation.find({ orderId: order._id, status: 'HELD' }).session(session);
    if (status === 'PAID_DEMO') {
      for (const reservation of held) { reservation.status = 'CONSUMED'; await reservation.save({ session }); }
      const cart = await Cart.findById(order.cartId).session(session);
      if (cart) {
        // Keep items added after the order was created; remove only purchased quantities.
        for (const purchased of order.items) {
          const line = cart.items.find(item => String(item.variantId) === String(purchased.variantId));
          if (line) line.quantity = Math.max(0, line.quantity - purchased.quantity);
        }
        cart.items = cart.items.filter(item => item.quantity > 0); cart.increment();
        await cart.save({ session });
      }
    } else {
      for (const reservation of held) {
        await ProductVariant.updateOne({ _id: reservation.variantId, isDemo: true }, { $inc: { stock: reservation.quantity } }, { session });
        reservation.status = 'RELEASED'; await reservation.save({ session });
      }
    }
    order.paymentStatus = status;
    await order.save({ session });
    await Payment.updateOne({ orderId: order._id }, { status }, { session });
    return order;
  });
}
export async function releaseExpiredReservations() {
  const orders = await Order.find({ paymentMode: 'DEMO', isDemo: true, paymentStatus: 'PENDING', expiresAt: { $lte: new Date() } }).select('publicId ownerKey').limit(50).lean();
  for (const order of orders) await settleDemoOrder({ ownerKey: order.ownerKey, orderId: order.publicId, outcome: 'CANCELLED', expiredOnly: true });
}
export function publicOrder(order) {
  const { publicId, paymentMode, paymentStatus, fulfillmentStatus, items, totals, delivery, createdAt, expiresAt, isDemo } = order.toObject ? order.toObject() : order;
  return { id: publicId, paymentMode, paymentStatus, fulfillmentStatus, items, totals, delivery, createdAt, expiresAt, isDemo };
}
