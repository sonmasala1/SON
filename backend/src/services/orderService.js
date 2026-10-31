import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import InventoryReservation from '../models/InventoryReservation.js';
import { runTransaction } from './paymentService.js';
import { releaseOrderInventory } from './inventoryService.js';
import { httpError } from '../utils/httpError.js';
import { audit } from './staffAudit.js';

export async function updateOrderState(req, id, input) {
  return runTransaction(async session => {
    const order = await Order.findOne({ _id: id, isDemo: { $ne: true }, paymentMode: 'PAY_LATER' }).session(session);
    if (!order) throw httpError(404, 'Order not found.');
    const changes = {};
    for (const key of ['paymentStatus', 'fulfillmentStatus']) if (input[key] && input[key] !== order[key]) changes[key] = input[key];
    if (!Object.keys(changes).length) return order;
    if (order.fulfillmentStatus === 'CANCELLED' || order.paymentStatus === 'CANCELLED') throw httpError(409, 'A cancelled order cannot be reopened or marked paid.');
    const cancelling = changes.paymentStatus === 'CANCELLED' || changes.fulfillmentStatus === 'CANCELLED';
    if (cancelling) {
      if (!req.staffPermissions.includes('orders.cancel')) throw httpError(403, 'Your account does not have permission to cancel orders.');
      if (order.paymentStatus !== 'PENDING' || changes.paymentStatus === 'PAID' || ['SHIPPED', 'DELIVERED'].includes(order.fulfillmentStatus)) throw httpError(409, 'This order requires the store to arrange a return or refund before cancellation.');
      await releaseOrderInventory(order, session);
      changes.paymentStatus = 'CANCELLED';
      changes.fulfillmentStatus = 'CANCELLED';
    } else if (changes.paymentStatus === 'PAID') {
      if (order.paymentStatus !== 'PENDING' || input.paymentConfirmed !== true) throw httpError(409, 'Confirm that payment was received before marking this order paid.');
      await InventoryReservation.updateMany({ orderId: id, status: 'HELD' }, { $set: { status: 'CONSUMED' } }, { session });
    } else if (changes.paymentStatus) {
      throw httpError(409, 'A recorded payment cannot be reset to pending.');
    }
    const before = { paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus };
    Object.assign(order, changes);
    await order.save({ session });
    if (changes.paymentStatus) await Payment.updateOne({ orderId: id }, { $set: { status: changes.paymentStatus } }, { session });
    await audit(req, 'ORDER_STATUS_UPDATED', { targetId: id, changes: { before, after: changes } }, session);
    return order;
  });
}
