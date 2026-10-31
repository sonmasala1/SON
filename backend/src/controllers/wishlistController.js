import { z } from 'zod';
import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';
import { storefrontFilter, hydrateProduct } from '../services/productService.js';
import { parse } from '../validators/commerce.js';
import { httpError } from '../utils/httpError.js';

async function snapshot(req) {
  const saved = await Wishlist.findById(req.user._id).lean();
  const records = await Product.find({ ...storefrontFilter(false, false), _id: { $in: saved?.productIds || [] } }).lean();
  const products = await Promise.all(records.map(record => hydrateProduct(record, null, false)));
  return { slugs: products.map(product => product.slug), products };
}
export async function showWishlist(req, res, next) {
  try { res.set('Cache-Control', 'no-store').json({ success: true, wishlist: await snapshot(req) }); } catch (error) { next(error); }
}
export async function changeWishlist(req, res, next) {
  try {
    parse(z.object({}).strict(), req.body || {});
    const slug = parse(z.string().min(1).max(150).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), req.params.slug);
    const adding = req.method === 'PUT';
    const product = await Product.findOne({ slug, ...adding ? storefrontFilter(false, false) : {} }).select('_id');
    if (!product) throw httpError(404, 'Product not found.');
    if (adding) {
      try { await Wishlist.updateOne({ _id: req.user._id }, { $addToSet: { productIds: product._id } }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; await Wishlist.updateOne({ _id: req.user._id }, { $addToSet: { productIds: product._id } }); }
    } else await Wishlist.updateOne({ _id: req.user._id }, { $pull: { productIds: product._id } });
    res.set('Cache-Control', 'no-store').json({ success: true, wishlist: await snapshot(req) });
  } catch (error) { next(error); }
}
