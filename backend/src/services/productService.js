import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import { toPaise } from '../utils/money.js';

export function publishedFilter(includeDemo = false, includeSamples = process.env.NODE_ENV !== 'production') {
  return { status: 'published', ...(!includeDemo ? { isDemo: { $ne: true } } : {}), ...(!includeSamples ? { isSample: { $ne: true } } : {}), $or: [
    { 'variantIds.0': { $exists: true } },
    { 'variants.0': { $exists: true }, variants: { $not: { $elemMatch: { price: { $not: { $gt: 0 } } } } } },
  ] };
}
// Explicitly approved catalogue entries can be browsed before pricing is configured.
// Cart and checkout continue to use publishedFilter.
export function storefrontFilter(includeDemo = false, includeSamples = process.env.NODE_ENV !== 'production') {
  return { $or: [publishedFilter(includeDemo, includeSamples), {
    catalogVisible: true, status: { $in: ['draft', 'published'] },
    ...(!includeDemo ? { isDemo: { $ne: true } } : {}),
    ...(!includeSamples ? { isSample: { $ne: true } } : {}),
  }] };
}
export async function hydrateProduct(product, session = null, includeSamples = process.env.NODE_ENV !== 'production') {
  const canonical = await ProductVariant.find({ productId: product._id }).sort({ weightGrams: 1 }).session(session).lean();
  const activeCanonical = canonical.filter(value => value.isActive !== false && (includeSamples || !value.isSample));
  const embedded = (product.variants || []).filter(value => includeSamples || (!product.isSample && !value.isSample));
  const variants = !includeSamples && product.isSample ? [] : canonical.length ? activeCanonical.map(value => {
    const unitPricePaise = value.offerPricePaise ?? value.pricePaise ?? toPaise(value.price);
    return { ...value, pricePaise: value.pricePaise ?? toPaise(value.price), mrpPaise: value.mrpPaise ?? toPaise(value.mrp ?? value.price), unitPricePaise, price: unitPricePaise / 100 };
  }) : embedded.filter(value => value.isActive !== false).map(value => {
    const unitPricePaise = value.offerPricePaise ?? value.pricePaise ?? toPaise(value.price);
    return { ...value, pricePaise: value.pricePaise ?? toPaise(value.price), mrpPaise: value.mrpPaise ?? toPaise(value.mrp ?? value.price), unitPricePaise };
  });
  return { ...product, isDemo: !!product.isDemo, variants };
}
export async function listProducts({ q, category, page, limit, featured, offers, sort }, { includeDemo = false, includeSamples = process.env.NODE_ENV !== 'production' } = {}) {
  const filter = storefrontFilter(includeDemo, includeSamples);
  if (category) filter.category = category;
  if (featured === 'true') filter.featured = true;
  if (q) filter.$and = [{ $or: ['name', 'hindiName'].map(field => ({ [field]: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } })) }];
  if (offers === 'true') {
    const ids = await ProductVariant.distinct('productId', { offerPricePaise: { $gt: 0 }, isActive: { $ne: false }, ...(!includeDemo ? { isDemo: { $ne: true } } : {}), ...(!includeSamples ? { isSample: { $ne: true } } : {}) });
    filter._id = { $in: ids };
  }
  let records;
  let total;
  if (sort) {
    const direction = sort === 'price-asc' ? 1 : -1;
    [records, total] = await Promise.all([
      Product.aggregate([
        { $match: filter },
        { $lookup: { from: 'productVariants', localField: '_id', foreignField: 'productId', as: 'canonicalVariants' } },
        { $set: { activeCanonicalVariants: { $filter: { input: '$canonicalVariants', as: 'variant', cond: { $and: [{ $ne: ['$$variant.isActive', false] }, includeSamples ? true : { $ne: ['$$variant.isSample', true] }] } } } } },
        { $set: {
          _sortPrice: {
            $cond: [
              { $gt: [{ $size: '$canonicalVariants' }, 0] },
              { $min: { $map: { input: '$activeCanonicalVariants', as: 'variant', in: { $ifNull: ['$$variant.offerPricePaise', '$$variant.pricePaise'] } } } },
              { $min: { $map: { input: { $filter: { input: { $ifNull: ['$variants', []] }, as: 'variant', cond: { $and: [{ $ne: ['$$variant.isActive', false] }, includeSamples ? true : { $ne: ['$$variant.isSample', true] }] } } }, as: 'variant', in: { $ifNull: ['$$variant.offerPricePaise', { $ifNull: ['$$variant.pricePaise', { $multiply: ['$$variant.price', 100] }] }] } } } },
            ],
          },
        } },
        { $set: { _unpriced: { $cond: [{ $gt: ['$_sortPrice', 0] }, 0, 1] } } },
        { $sort: { _unpriced: 1, _sortPrice: direction, name: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { canonicalVariants: 0, activeCanonicalVariants: 0, _sortPrice: 0, _unpriced: 0 } },
      ]),
      Product.countDocuments(filter),
    ]);
  } else {
    [records, total] = await Promise.all([Product.find(filter).sort({ featured: -1, name: 1 }).skip((page - 1) * limit).limit(limit).lean(), Product.countDocuments(filter)]);
  }
  const products = await Promise.all(records.map(product => hydrateProduct(product, null, includeSamples)));
  return { products, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
export async function findProduct(slug, { includeDemo = false, includeSamples = process.env.NODE_ENV !== 'production' } = {}) {
  const product = await Product.findOne({ ...storefrontFilter(includeDemo, includeSamples), slug }).lean();
  return product ? hydrateProduct(product, null, includeSamples) : null;
}
