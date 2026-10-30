import { z } from 'zod';
import Order from '../models/Order.js';
import { getCart, serializeCart } from '../services/cartService.js';
import { createDemoOrder, createPayLaterOrder, settleDemoOrder, cancelPayLaterOrder, publicOrder, releaseExpiredReservations } from '../services/paymentService.js';
import { deliveryInput, parse } from '../validators/commerce.js';
import { httpError } from '../utils/httpError.js';

export async function previewCheckout(req, res, next) {
  try {
    if (req.body.delivery) parse(deliveryInput, req.body.delivery);
    const cart = await serializeCart(req, await getCart(req));
    if (!cart.valid) throw httpError(409, 'Please review your bag. Some quantities are unavailable.');
    res.json({ success: true, cart });
  } catch (error) { next(error); }
}
export async function demoPayment(req, res, next) {
  try {
    const schema = z.discriminatedUnion('action', [
      z.object({ action: z.literal('create'), delivery: deliveryInput, requestKey: z.string().uuid() }).strict(),
      z.object({ action: z.literal('simulate'), orderId: z.string().regex(/^DEMO-[A-F0-9-]{36}$/), outcome: z.enum(['PAID_DEMO', 'FAILED', 'CANCELLED']) }).strict(),
    ]);
    const input = parse(schema, req.body);
    await releaseExpiredReservations();
    const order = input.action === 'create' ? await createDemoOrder(req, input) : await settleDemoOrder({ ownerKey: req.ownerKey, ...input });
    res.json({ success: true, order: publicOrder(order) });
  } catch (error) { next(error); }
}

export async function placePayLaterOrder(req, res, next) {
  try {
    const input = parse(z.object({ delivery: deliveryInput, requestKey: z.string().uuid() }).strict(), req.body);
    const order = await createPayLaterOrder(req, input);
    res.status(201).json({ success: true, order: publicOrder(order) });
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
    await releaseExpiredReservations();
    const order = await Order.findOne({ publicId: req.params.id, ownerKey: req.ownerKey });
    if (!order) throw httpError(404, 'Order not found.');
    res.set('Cache-Control', 'no-store').json({ success: true, order: publicOrder(order) });
  } catch (error) { next(error); }
}
