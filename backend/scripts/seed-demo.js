import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { initializeModels } from '../src/config/models.js';
import mongoose from 'mongoose';
import Product from '../src/models/Product.js';
import ProductVariant from '../src/models/ProductVariant.js';
import Category from '../src/models/Category.js';
import { demoCatalogue } from '../src/data/demoCatalogue.js';

export async function seedDemo({ fullCatalog = false } = {}) {
  if (process.env.NODE_ENV === 'production' || !/(?:_demo(?:$|_)|_test_)/.test(mongoose.connection.name)) throw new Error('Demo seed is restricted to an isolated demo/test database.');
  for (const [index, [name, hindiName, slug]] of [['Ground Spices', 'पिसे मसाले', 'ground-spices'], ['Whole Spices', 'साबुत मसाले', 'whole-spices'], ['Blended Masalas', 'मिश्रित मसाले', 'blended-masalas'], ['Combo Packs', 'कॉम्बो पैक', 'combo-packs']].entries()) {
    await Category.updateOne({ slug }, { $setOnInsert: { name, hindiName, slug, sort: index } }, { upsert: true });
  }
  const catalogue = fullCatalog ? demoCatalogue : demoCatalogue.slice(0, 3);
  for (const [index, { name, hindiName, slug, pricePaise, sku, description, category, image }] of catalogue.entries()) {
    const artwork = index < 12 ? image : `/images/products/${slug}-gallery.png`;
    const imageCrop = index < 12 ? 'full' : 'left-third';
    let product = await Product.findOne({ slug });
    if (product && !product.isDemo) { console.log(`Skipped existing non-demo product: ${slug}`); continue; }
    if (!product) product = await Product.create({ name, hindiName, slug, description, category, isDemo: true, status: 'draft', featured: true, image: artwork, images: [artwork], packSizeOptions: ['100 g'], availablePackSizes: ['100 g'], inventoryStatus: 'known' });
    // Refresh generated artwork on demo records while preserving existing prices and stock.
    product.image = artwork;
    product.images = [artwork];
    let variant = await ProductVariant.findOne({ sku: `DEMO-${sku}-100` });
    if (!variant) variant = await ProductVariant.create({ productId: product._id, sku: `DEMO-${sku}-100`, label: '100 g', weightGrams: 100, pricePaise, mrpPaise: pricePaise, stock: 50, isDemo: true });
    variant.image = artwork;
    variant.imageCrop = imageCrop;
    await variant.save();
    if (!product.variantIds.some(id => id.equals(variant._id))) product.variantIds.push(variant._id);
    product.status = 'published';
    await product.save();
  }
  console.log('Demo catalogue ready. Existing real prices and demo stock were not overwritten.');
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/seed-demo.js')) {
  try { const env = getEnv(); await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME); await initializeModels(); await seedDemo({ fullCatalog: true }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await disconnectDatabase(); }
}
