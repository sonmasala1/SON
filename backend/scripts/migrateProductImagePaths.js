import fs from 'node:fs';
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTarget } from './lib/masalaSeedPlan.js';
import { readImageManifest, productImageIssues } from '../src/validators/productImage.js';

try {
  const env = getEnv();
  assertTarget(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  const manifest = readImageManifest();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const products = await db.collection('products').find({}, { session }).toArray();
      const variants = await db.collection('productVariants').find({}, { session }).toArray();
      if (products.length !== 27 || manifest.products.length !== 27) throw new Error('Expected the selected 27-product catalogue.');
      const backup = new URL(`../.runtime/image-path-migration/database-${Date.now()}.ejson`, import.meta.url);
      fs.writeFileSync(backup, mongoose.mongo.BSON.EJSON.stringify({ products, variants }, null, 2, { relaxed: false }));
      const productUpdates = products.map(product => {
        const owner = manifest.products.find(row => row.productId === String(product._id));
        if (!owner) throw new Error(`Missing manifest identity: ${product.slug}`);
        const set = {
          image: owner.image,
          images: [owner.image],
          variants: (product.variants || []).map(variant => ({ ...variant, image: owner.image, imageCrop: 'full' })),
        };
        const issues = productImageIssues({ ...product, ...set });
        if (issues.length) throw new Error(`${product.slug}: ${issues.map(issue => issue.message).join('; ')}`);
        return { updateOne: { filter: { _id: product._id }, update: { $set: set } } };
      });
      const variantUpdates = variants.map(variant => {
        const owner = manifest.products.find(row => row.productId === String(variant.productId));
        if (!owner) throw new Error(`Missing parent for variant ${variant.sku}`);
        return { updateOne: { filter: { _id: variant._id }, update: { $set: { image: owner.image, imageCrop: 'full' } } } };
      });
      await db.collection('products').bulkWrite(productUpdates, { session });
      if (variantUpdates.length) await db.collection('productVariants').bulkWrite(variantUpdates, { session });
    });
  } finally { await session.endSession(); }
  const saved = await db.collection('products').find({}).toArray();
  const savedVariants = await db.collection('productVariants').find({}).toArray();
  if (saved.some(product => productImageIssues(product).length)) throw new Error('Saved product image validation failed.');
  if (savedVariants.some(variant => variant.image !== manifest.products.find(row => row.productId === String(variant.productId))?.image)) throw new Error('Saved variant image validation failed.');
  console.log(`Updated and verified ${saved.length} products and ${savedVariants.length} variants: /images/products/*.png`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await disconnectDatabase(); }
