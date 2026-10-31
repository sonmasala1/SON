import { productQuery } from '../validators/product.js';
import { listProducts, findProduct } from '../services/productService.js';

export async function getProducts(req, res, next) {
  const query = productQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, message: 'Please check the search, category, and page values.' });
  try {
    res.set('Cache-Control', 'no-store').json({ success: true, ...await listProducts(query.data, { includeDemo: false, includeSamples: false }) });
  } catch (error) { next(Object.assign(error, { status: 503 })); }
}

export async function getProduct(req, res, next) {
  if (!/^[a-z0-9-]{1,120}$/.test(req.params.slug)) return res.status(400).json({ success: false, message: 'Invalid product address' });
  try {
    const product = await findProduct(req.params.slug, { includeDemo: false, includeSamples: false });
    if (!product) return res.status(404).json({ success: false, message: 'This product is not available.' });
    res.set('Cache-Control', 'no-store').json({ success: true, product });
  } catch (error) { next(Object.assign(error, { status: 503 })); }
}
