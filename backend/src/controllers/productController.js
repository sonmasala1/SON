import { productQuery } from '../validators/product.js';
import { listProducts, findProduct } from '../services/productService.js';
import { demoAllowed } from '../middleware/session.js';

export async function getProducts(req, res, next) {
  const query = productQuery.safeParse(req.query);
  if (!query.success) return res.status(400).json({ success: false, message: 'Please check the search, category, and page values.' });
  try {
    res.json({ success: true, ...await listProducts(query.data, { includeDemo: demoAllowed(req), includeSamples: req.app.locals.config.nodeEnv !== 'production' }) });
  } catch (error) { next(Object.assign(error, { status: 503 })); }
}

export async function getProduct(req, res, next) {
  if (!/^[a-z0-9-]{1,120}$/.test(req.params.slug)) return res.status(400).json({ success: false, message: 'Invalid product address' });
  try {
    const product = await findProduct(req.params.slug, { includeDemo: demoAllowed(req), includeSamples: req.app.locals.config.nodeEnv !== 'production' });
    if (!product) return res.status(404).json({ success: false, message: 'This product is not available.' });
    res.json({ success: true, product });
  } catch (error) { next(Object.assign(error, { status: 503 })); }
}
