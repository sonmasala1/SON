import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from '../src/config/db.js';
import Product from '../src/models/Product.js';
import ProductVariant from '../src/models/ProductVariant.js';
import Category from '../src/models/Category.js';
import { demoCatalogue } from '../src/data/demoCatalogue.js';

// Explicit opt-in: adds labelled sample data to the configured original store.
try {
  const env = getEnv();
  if (env.NODE_ENV === 'production') throw new Error('Run household sample setup only in development.');
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const original = await Product.find({ slug: { $in: demoCatalogue.map(item => item.slug) } }).lean();
  const originalVariants = await ProductVariant.find({ productId: { $in: original.map(item => item._id) } }).lean();
  const backupDir = fileURLToPath(new URL('../.runtime/catalogue-backups/', import.meta.url));
  mkdirSync(backupDir, { recursive: true });
  const backup = `${backupDir}household-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify({ database: mongoose.connection.name, products: original, variants: originalVariants }, null, 2));
  console.log('Saved original catalogue fields to:', backup);
  const counts = { prepared: 0, enriched: 0 };
  for (const [index, item] of demoCatalogue.entries()) {
    await mongoose.connection.transaction(async session => {
      let product = await Product.findOne({ slug: item.slug }).session(session);
      // Preserve commercial prices, stock, and variant IDs while attaching artwork.
      if (product?.status === 'published' && !product.isSample) {
        const canonical = await ProductVariant.find({ productId: product._id, isActive: { $ne: false } }).session(session);
        const existing = canonical.length ? canonical : product.variants;
        const ids = [];
        const weights = new Set();
        for (const stored of existing) {
          const weight = stored.weightGrams;
          const legacy = [50, 200].includes(weight);
          const image = weight === 100 ? item.image : `/images/products/${item.slug}-${legacy ? 'legacy-sizes' : 'sizes'}.png`;
          const imageCrop = weight === 100 ? 'full' : [50, 250].includes(weight) ? 'left-half' : 'right-half';
          await ProductVariant.updateOne({ _id: stored._id }, {
            $set: { image, imageCrop },
            $setOnInsert: { productId: product._id, sku: stored.sku, label: stored.label, weightGrams: weight, pricePaise: stored.pricePaise ?? Math.round(stored.price * 100), mrpPaise: stored.mrpPaise ?? Math.round((stored.mrp ?? stored.price) * 100), stock: stored.stock, isActive: true, isDemo: false, isSample: !!stored.isSample },
          }, { upsert: true, runValidators: true, session });
          ids.push(stored._id);
          weights.add(weight);
        }
        const base = existing.find(variant => variant.weightGrams === 100);
        for (const weight of [100, 250, 500]) {
          if (weights.has(weight)) continue;
          const pricePaise = Math.round((base?.pricePaise ?? (base?.price || item.pricePaise / 100) * 100) * weight / 100);
          const added = await ProductVariant.findOneAndUpdate({ sku: `SAMPLE-${item.sku}-${weight}` }, { $setOnInsert: {
            productId: product._id, sku: `SAMPLE-${item.sku}-${weight}`, label: `${weight} g`, weightGrams: weight, pricePaise, mrpPaise: pricePaise, stock: 50, isSample: true,
            image: weight === 100 ? item.image : `/images/products/${item.slug}-sizes.png`, imageCrop: weight === 100 ? 'full' : weight === 250 ? 'left-half' : 'right-half',
          } }, { upsert: true, new: true, runValidators: true, session });
          ids.push(added._id);
        }
        product.image = item.image;
        product.images = [item.image, `/images/products/${item.slug}-sizes.png`, `/images/products/${item.slug}-legacy-sizes.png`];
        product.variantIds = ids;
        product.availablePackSizes = [...new Set([...existing.map(variant => variant.label), '100 g', '250 g', '500 g'])];
        product.packSizeOptions = product.availablePackSizes;
        await product.save({ session });
        counts.enriched++;
        return;
      }
      if (!product) product = new Product({ name: item.name, slug: item.slug, category: item.category });
      const originalArtwork = index < 12;
      const image = originalArtwork ? item.image : `/images/products/${item.slug}-gallery.png`;
      Object.assign(product, {
        name: item.name, hindiName: item.hindiName, description: item.description,
        hindiDescription: product.hindiDescription || `${item.hindiName} — घरेलू रसोई के लिए नमूना उत्पाद।`,
        category: item.category, isDemo: false, isSample: true,
        status: 'draft', image, images: [image, `/images/products/${item.slug}-${originalArtwork ? 'sizes' : 'gallery'}.png`].filter((url, i, list) => list.indexOf(url) === i),
        featured: index < 4, inventoryStatus: 'known', packSizeOptions: ['100 g', '250 g', '500 g'], availablePackSizes: ['100 g', '250 g', '500 g'],
      });
      await product.save({ session });
      const ids = [];
      for (const [sizeIndex, weightGrams] of [100, 250, 500].entries()) {
        const sku = `SAMPLE-${item.sku}-${weightGrams}`;
        const variantImage = originalArtwork && weightGrams === 100 ? item.image : `/images/products/${item.slug}-${originalArtwork ? 'sizes' : 'gallery'}.png`;
        const imageCrop = originalArtwork ? ['full', 'left-half', 'right-half'][sizeIndex] : ['left-third', 'middle-third', 'right-third'][sizeIndex];
        const pricePaise = Math.round(item.pricePaise * weightGrams / 100);
        const variant = await ProductVariant.findOneAndUpdate({ sku }, {
          $set: { image: variantImage, imageCrop, isActive: true },
          $setOnInsert: { productId: product._id, sku, label: `${weightGrams} g`, weightGrams, pricePaise, mrpPaise: pricePaise, stock: 50, isDemo: false, isSample: true },
        }, { upsert: true, new: true, runValidators: true, session });
        if (!variant.productId.equals(product._id)) throw new Error('Sample variant SKU belongs to another product.');
        ids.push(variant._id);
      }
      product.variantIds = ids;
      product.status = 'published';
      await product.save({ session });
      counts.prepared++;
    });
  }
  for (const [sort, [slug, name, hindiName]] of [
    ['ground-spices', 'Ground Spices', 'पिसे मसाले'], ['whole-spices', 'Whole Spices', 'साबुत मसाले'], ['blended-masalas', 'Blended Masalas', 'मिश्रित मसाले'],
  ].entries()) await Category.updateOne({ slug }, { $setOnInsert: { slug, name, hindiName, sort, status: 'active' } }, { upsert: true });
  console.log('Household catalogue ready:', JSON.stringify(counts), 'Database:', mongoose.connection.name);
} catch (error) {
  console.error('Household catalogue setup failed:', error.code ? classifyDatabaseError(error) : 'Check configuration, transaction support, and sample product identifiers.');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
