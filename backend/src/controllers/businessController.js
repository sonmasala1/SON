import { z } from 'zod';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import User from '../models/User.js';
import { AdminSession, AdminPasskey } from '../models/administration.js';
import { parse, objectId } from '../validators/commerce.js';
import { audit, securityNow } from '../services/staffAudit.js';
import { httpError } from '../utils/httpError.js';

const actual = { isDemo: { $ne: true }, paymentMode: { $ne: 'DEMO' } };
const paid = { ...actual, paymentStatus: { $in: ['PAID', 'CAPTURED'] } };
export async function businessDashboard(req, res, next) {
  try {
    const modules = {}, has = permission => req.staffPermissions.includes(permission);
    if (has('orders.view')) modules.orders = { total: await Order.countDocuments(actual), paid: await Order.countDocuments(paid), pending: await Order.countDocuments({ ...actual, paymentStatus: 'PENDING' }), demoOrders: await Order.countDocuments({ isDemo: true }) };
    if (has('payments.view')) {
      const rows = await Payment.aggregate([{ $match: { ...actual, status: { $in: ['PAID', 'CAPTURED'] } } }, { $group: { _id: null, collectedPaise: { $sum: '$amountPaise' }, refundedPaise: { $sum: { $ifNull: ['$refundedAmountPaise', 0] } } } }]);
      const values = rows[0] || { collectedPaise: 0, refundedPaise: 0 };
      modules.payments = { collectedPaise: values.collectedPaise, refundedPaise: values.refundedPaise, netCollectedPaise: values.collectedPaise - values.refundedPaise };
    }
    if (has('customers.view')) modules.customers = { total: await User.countDocuments({}) };
    if (has('products.view')) modules.products = { published: await Product.countDocuments({ status: 'published' }), drafts: await Product.countDocuments({ status: 'draft' }) };
    if (has('inventory.view')) modules.inventory = { lowStock: await ProductVariant.countDocuments({ stock: { $lte: 5 } }), variants: await ProductVariant.countDocuments({}), availableUnits: (await ProductVariant.aggregate([{ $group: { _id: null, count: { $sum: '$stock' } } }]))[0]?.count || 0 };
    if (has('analytics.view')) {
      const productSales = await Order.aggregate([{ $match: paid }, { $unwind: '$items' }, { $group: { _id: '$items.productId', name: { $first: '$items.name' }, units: { $sum: '$items.quantity' }, revenuePaise: { $sum: '$items.lineTotalPaise' } } }, { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } }, { $set: { category: { $ifNull: [{ $arrayElemAt: ['$product.category', 0] }, 'uncategorized'] } } }, { $project: { product: 0 } }]);
      const categorySales = Object.values(productSales.reduce((groups, row) => { const group = groups[row.category] ||= { category: row.category, units: 0, revenuePaise: 0 }; group.units += row.units; group.revenuePaise += row.revenuePaise; return groups; }, {}));
      modules.analytics = { unitsSold: productSales.reduce((total, row) => total + row.units, 0), productSales, categorySales };
    }
    res.json({ success: true, modules, excludesDemoSales: true });
  } catch (error) { next(error); }
}
export const listBusinessData = type => async (_req, res, next) => {
  try {
    const sources = { orders: () => Order.find().select('publicId paymentStatus paymentMode isDemo fulfillmentStatus totals delivery.fullName delivery.email createdAt').sort({ createdAt: -1 }).limit(100).lean(), products: () => Product.find().select('name slug category status isDemo').sort({ name: 1 }).limit(100).lean(), customers: () => User.find().select('name email phone createdAt').sort({ createdAt: -1 }).limit(100).lean(), inventory: () => ProductVariant.find().populate('productId', 'name').select('productId sku label stock isDemo').sort({ stock: 1 }).limit(100).lean(), payments: () => Payment.find().select('orderId paymentMode status amountPaise isDemo createdAt').sort({ createdAt: -1 }).limit(100).lean(), shipping: () => Order.find().select('publicId isDemo fulfillmentStatus createdAt').sort({ createdAt: -1 }).limit(100).lean() };
    res.json({ success: true, records: await sources[type]() });
  } catch (error) { next(error); }
};
export async function updateInventory(req, res, next) {
  try {
    const id = parse(objectId, req.params.id); const input = parse(z.object({ stock: z.number().int().min(0).max(10000000) }).strict(), req.body);
    await mongoose.connection.transaction(async session => {
      const item = await ProductVariant.findById(id).session(session);
      if (!item) throw httpError(404, 'Inventory record not found.');
      await ProductVariant.updateOne({ _id: id }, { stock: input.stock }, { session, runValidators: true });
      await audit(req, 'INVENTORY_UPDATED', { targetId: id, changes: { before: item.stock, after: input.stock } }, session);
    }); res.json({ success: true });
  } catch (error) { next(error); }
}
export async function updateOrder(req, res, next) {
  try {
    const id = parse(objectId, req.params.id); const input = parse(z.object({ fulfillmentStatus: z.enum(['NEW', 'PROCESSING', 'PACKED']) }).strict(), req.body);
    await mongoose.connection.transaction(async session => {
      const order = await Order.findById(id).session(session); if (!order) throw httpError(404, 'Order not found.');
      await Order.updateOne({ _id: id }, input, { session });
      await audit(req, 'ORDER_STATUS_UPDATED', { targetId: id, changes: { before: order.fulfillmentStatus, after: input.fulfillmentStatus } }, session);
    }); res.json({ success: true });
  } catch (error) { next(error); }
}
export async function ownerSecurity(req, res, next) {
  try { res.json({ success: true, sessions: await AdminSession.find({ accountId: req.staff._id, revokedAt: null, expiresAt: { $gt: new Date(securityNow(req)) } }).select('realm mfaMethod lastSeenAt createdAt expiresAt userAgent').lean(), passkeys: await AdminPasskey.find({ accountId: req.staff._id }).select('createdAt deviceType backedUp').lean(), currentSessionId: req.staffSession.id }); }
  catch (error) { next(error); }
}
export async function revokeOtherOwnerSessions(req, res, next) {
  try {
    await mongoose.connection.transaction(async session => { await AdminSession.updateMany({ accountId: req.staff._id, _id: { $ne: req.staffSession._id }, revokedAt: null }, { revokedAt: new Date(securityNow(req)) }, { session }); await audit(req, 'OWNER_OTHER_SESSIONS_REVOKED', { targetId: req.staff.id }, session); });
    res.json({ success: true });
  } catch (error) { next(error); }
}
