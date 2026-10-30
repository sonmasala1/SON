import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';

const env = getEnv();
await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);

try {
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}).toArray();
  const variants = await db.collection('productVariants').find({}).toArray();
  let corrected = 0;

  for (const product of products) {
    const activeVariantIds = variants
      .filter(variant => String(variant.productId) === String(product._id) && variant.isActive !== false)
      .map(variant => variant._id);
    const currentIds = (product.variantIds || []).map(String);
    const expectedIds = activeVariantIds.map(String);
    if (currentIds.length !== expectedIds.length || currentIds.some(id => !expectedIds.includes(id))) {
      await db.collection('products').updateOne(
        { _id: product._id },
        { $set: { variantIds: activeVariantIds } },
      );
      corrected += 1;
    }
  }

  console.log(`Reconciled active variant references for ${corrected} products.`);
} finally {
  await disconnectDatabase();
}
