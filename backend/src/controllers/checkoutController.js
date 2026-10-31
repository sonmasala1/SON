import { z } from 'zod';
import Order from '../models/Order.js';
import { getCart, serializeCart, validateCart } from '../services/cartService.js';
import { createPayLaterOrder, cancelPayLaterOrder, publicOrder } from '../services/paymentService.js';
import { deliveryInput, parse } from '../validators/commerce.js';
import { httpError } from '../utils/httpError.js';

export async function previewCheckout(req, res, next) {
  try {
    if (req.body.delivery) parse(deliveryInput, req.body.delivery);
    const cart = await serializeCart(req, await getCart(req));
    validateCart(cart);
    res.json({ success: true, cart });
  } catch (error) { next(error); }
}

export async function placePayLaterOrder(req, res, next) {
  try {
    const input = parse(z.object({ delivery: deliveryInput, requestKey: z.string().uuid(), cartVersion: z.number().int().min(0).optional(), expectedTotalPaise: z.number().int().min(0).optional() }).strict(), req.body);
    const order = await createPayLaterOrder(req, input);
    res.status(201).json({ success: true, order: publicOrder(order) });
  } catch (error) { next(error); }
}

export async function showCheckoutAttempt(req, res, next) {
  try {
    const requestKey = parse(z.string().uuid(), req.params.requestKey);
    const order = await Order.findOne({ ownerKey: req.ownerKey, requestKey, paymentMode: 'PAY_LATER', isDemo: { $ne: true } });
    if (!order) throw httpError(404, 'No order has been placed for this checkout attempt.');
    if (order.expiresAt && order.expiresAt.getTime() <= Date.now()) throw httpError(410, 'This checkout attempt has expired.');
    res.set('Cache-Control', 'no-store').json({ success: true, order: publicOrder(order) });
  } catch (error) { next(error); }
}

export async function cancelCustomerOrder(req, res, next) {
  try {
    const order = await cancelPayLaterOrder(req, req.params.id);
    res.json({ success: true, order: publicOrder(order) });
  } catch (error) { next(error); }
}
export async function showOrder(req, res, next) {
  try {
    const order = await Order.findOne({ publicId: req.params.id, ownerKey: req.ownerKey, isDemo: { $ne: true }, paymentMode: { $ne: 'DEMO' } });
    if (!order) throw httpError(404, 'Order not found.');
    res.set('Cache-Control', 'no-store').json({ success: true, order: publicOrder(order) });
  } catch (error) { next(error); }
}
