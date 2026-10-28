import { getCart, serializeCart, mutateCart, getVariant } from '../services/cartService.js';
import { cartItem, quantityInput, objectId, parse } from '../validators/commerce.js';
import { httpError } from '../utils/httpError.js';
import { publicCustomer } from '../services/customerSessionService.js';

export async function showCart(req, res, next) {
  try { res.set('Cache-Control', 'no-store').json({ success: true, cart: await serializeCart(req, await getCart(req)), user: publicCustomer(req.user) }); } catch (error) { next(error); }
}
export async function addCartItem(req, res, next) {
  try {
    const input = parse(cartItem, req.body);
    const cart = await mutateCart(req, async items => {
      const match = items.find(item => String(item.productId) === input.productId && String(item.variantId) === input.variantId);
      const quantity = input.quantity + (match?.quantity || 0);
      const { variant } = await getVariant(req, input.productId, input.variantId);
      if (quantity > variant.stock || quantity > 99) throw httpError(409, `Only ${variant.stock} packs are currently available.`);
      if (match) match.quantity = quantity; else items.push(input);
      return items;
    });
    res.json({ success: true, cart });
  } catch (error) { next(error); }
}
export async function updateCartItem(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    const { quantity } = parse(quantityInput, req.body);
    const cart = await mutateCart(req, async items => {
      const item = items.find(item => String(item._id) === id);
      if (!item) throw httpError(404, 'This item is no longer in your bag.');
      const { variant } = await getVariant(req, item.productId, item.variantId);
      if (quantity > variant.stock) throw httpError(409, `Only ${variant.stock} packs are currently available.`);
      item.quantity = quantity; return items;
    });
    res.json({ success: true, cart });
  } catch (error) { next(error); }
}
export async function removeCartItem(req, res, next) {
  try { const id = parse(objectId, req.params.id); res.json({ success: true, cart: await mutateCart(req, items => items.filter(item => String(item._id) !== id)) }); }
  catch (error) { next(error); }
}
