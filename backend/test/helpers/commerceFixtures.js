import Product from '../../src/models/Product.js';
import ProductVariant from '../../src/models/ProductVariant.js';

// Synthetic fixtures are used only AFTER each test has connected to its own named database.
export async function createCommerceProduct(slug, { source = 'CANONICAL', stock = 4, pricePaise = 12500, ...extra } = {}) {
  const product = await Product.create({ name: slug, slug, category: 'ground-spices', description: 'Isolated checkout fixture', status: 'published', variants: [{ label: '100 g', price: pricePaise / 100, stock }], ...extra });
  const variant = source === 'CANONICAL'
    ? await ProductVariant.create({ productId: product._id, sku: `${slug}-100`, label: '100 g', weightGrams: 100, pricePaise, mrpPaise: pricePaise, stock })
    : product.variants[0];
  return { product, variant };
}
