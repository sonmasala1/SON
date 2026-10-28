import Product from '../src/models/Product.js';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';

try {
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await Product.createCollection();
  await Product.createIndexes();
  for (const [name, slug] of [['Haldi Powder', 'haldi-powder'], ['Dhaniya Powder', 'dhaniya-powder'], ['Lal Mirch Powder', 'lal-mirch-powder']]) {
    await Product.updateOne({ slug }, { $setOnInsert: { name, slug, category: 'ground-spices', status: 'draft', variants: [], description: '', image: '' } }, { upsert: true, runValidators: true });
  }
  console.log('Three initial products ensured as drafts. Existing products were not modified.');
} catch {
  console.error('Draft setup failed. Check MongoDB connectivity and configuration.');
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
