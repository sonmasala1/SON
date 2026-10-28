import { CustomerSession } from '../models/customerAuthentication.js';
import Order from '../models/Order.js';
import { CUSTOMER_COOKIE, customerCookie, customerNow, publicCustomer } from '../services/customerSessionService.js';

export function me(req, res) { res.set('Cache-Control', 'no-store').json({ success: true, user: publicCustomer(req.user) }); }
export function passwordAuthenticationRetired(_req, res) { res.status(410).json({ success: false, message: 'Customer sign-in now uses mobile OTP verification. Please use /login.' }); }
export async function logout(req, res, next) {
  try {
    if (req.customerSession) await CustomerSession.updateOne({ _id: req.customerSession._id }, { revokedAt: new Date(customerNow(req)) });
    res.clearCookie(CUSTOMER_COOKIE, customerCookie(req)); res.clearCookie('son_session', customerCookie(req));
    res.set('Cache-Control', 'no-store').json({ success: true });
  } catch (error) { next(error); }
}
export async function revokeOtherCustomerSessions(req, res, next) {
  try { await CustomerSession.updateMany({ userId: req.user._id, _id: { $ne: req.customerSession._id }, revokedAt: null }, { revokedAt: new Date(customerNow(req)) }); res.json({ success: true }); }
  catch (error) { next(error); }
}
export async function customerOrders(req, res, next) {
  try {
    const filter = { userId: req.user._id, ownerKey: `user:${req.user.id}` };
    if (req.app.locals.config.nodeEnv === 'production') { filter.isDemo = { $ne: true }; filter.paymentMode = { $ne: 'DEMO' }; }
    const orders = await Order.find(filter).select('publicId paymentStatus paymentMode isDemo totals createdAt').sort({ createdAt: -1 }).limit(50).lean();
    res.set('Cache-Control', 'no-store').json({ success: true, orders: orders.map(order => ({ id: order.publicId, ...order, _id: undefined })) });
  } catch (error) { next(error); }
}
