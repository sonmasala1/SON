import { z } from 'zod';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import Order from '../models/Order.js';
import { reviewInput, objectId, parse } from '../validators/commerce.js';
import { httpError } from '../utils/httpError.js';
import { publishedFilter } from '../services/productService.js';
import mongoose from 'mongoose';
import { audit } from '../services/staffAudit.js';

export async function getReviews(req, res, next) {
  try {
    const filter = { approved: true };
    if (req.query.productId) filter.productId = parse(objectId, req.query.productId);
    const visibleProducts = await Product.distinct('_id', publishedFilter(false, false));
    filter.productId = filter.productId ? { $in: visibleProducts.filter(id => String(id) === filter.productId) } : { $in: visibleProducts };
    const reviews = await Review.find(filter).select('displayName rating comment productId createdAt verifiedPurchase').populate('productId', 'name hindiName slug').sort({ createdAt: -1 }).limit(30).lean();
    res.set('Cache-Control', 'no-store').json({ success: true, reviews });
  } catch (error) { next(error); }
}
export async function createReview(req, res, next) {
  try {
    const input = parse(reviewInput, req.body);
    if (!await Product.exists({ ...publishedFilter(false, false), _id: input.productId })) throw httpError(404, 'Product not found.');
    // Demo orders never qualify for a verified purchase badge.
    const verifiedPurchase = !!await Order.exists({ userId: req.user._id, isDemo: false, paymentStatus: 'PAID', 'items.productId': input.productId });
    const review = await Review.create({ ...input, userId: req.user._id, approved: false, verifiedPurchase });
    res.status(201).json({ success: true, message: 'Thank you. Your review is awaiting moderation.', reviewId: review.id });
  } catch (error) { next(error.code === 11000 ? httpError(409, 'You have already reviewed this product.') : error); }
}
export async function moderationList(_req, res, next) {
  try { res.json({ success: true, reviews: await Review.find().populate('productId', 'name').sort({ createdAt: -1 }).limit(100).lean() }); }
  catch (error) { next(error); }
}
export async function moderate(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    const { approved } = parse(z.object({ approved: z.boolean() }).strict(), req.body);
    let review;
    await mongoose.connection.transaction(async session => {
      review = await Review.findByIdAndUpdate(id, { approved }, { new: true, runValidators: true, session });
      if (!review) throw httpError(404, 'Review not found.');
      await audit(req, 'REVIEW_MODERATED', { targetId: id, changes: { approved } }, session);
    });
    res.json({ success: true, review });
  } catch (error) { next(error); }
}
