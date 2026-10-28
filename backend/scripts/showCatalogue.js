import fs from 'node:fs';
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { assertTarget } from './lib/masalaSeedPlan.js';
import { readImageManifest, productImageIssues } from '../src/validators/productImage.js';
import { listProducts } from '../src/services/productService.js';

try {
  const env = getEnv();
  assertTarget(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  const manifest = readImageManifest();
  const ids = manifest.products.map(row => new mongoose.Types.ObjectId(row.productId));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const products = await db.collection('products').find({ _id: { $in: ids } }, { session }).toArray();
      if (ids.length !== 27 || products.length !== 27) throw new Error('Expected all 27 selected products.');
      for (const product of products) {
        if (product.status === 'archived' || productImageIssues(product).length) throw new Error(`Cannot display ${product.slug}: check status and image identity.`);
      }
      fs.writeFileSync(new URL(`../.runtime/catalogue-backups/storefront-${Date.now()}.ejson`, import.meta.url), mongoose.mongo.BSON.EJSON.stringify(products, null, 2, { relaxed: false }));
      await db.collection('products').updateMany({ _id: { $in: ids } }, { $set: { catalogVisible: true } }, { session });
    });
  } finally { await session.endSession(); }
  for (const includeSamples of [true, false]) {
    const result = await listProducts({ page: 1, limit: 48 }, { includeSamples });
    if (result.pagination.total !== 27 || result.products.some(p => productImageIssues(p).length)) throw new Error('Storefront catalogue verification failed.');
    if (!includeSamples && result.products.some(p => p.variants.some(v => p.isSample || v.isSample))) throw new Error('Sample prices must not appear in production.');
    console.log(JSON.stringify({ mode: includeSamples ? 'development' : 'production', visibleProducts: result.pagination.total, matchingImages: result.products.length }));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await disconnectDatabase(); }
