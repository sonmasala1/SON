// Read-only diagnostics. Never initializes models, changes indexes, or outputs personal data.
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from '../src/config/db.js';

try {
  const env = getEnv();
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  await db.command({ ping: 1 });
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name);
  const products = await db.collection('products').find({}, { projection: { name: 1, hindiName: 1, slug: 1, category: 1, status: 1, variants: 1, variantIds: 1, isDemo: 1, isSample: 1, image: 1 } }).toArray();
  const variants = await db.collection('productVariants').find({}, { projection: { productId: 1, pricePaise: 1, stock: 1, isSample: 1 } }).toArray();
  const categorySlugs = new Set(await db.collection('categories').distinct('slug'));
  const productIds = new Set(products.map(p => String(p._id)));
  const variantIds = new Set(variants.map(v => String(v._id)));
  const duplicateSlugs = await db.collection('products').aggregate([{ $group: { _id: '$slug', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: 'count' }]).toArray();
  const staffCollection = collections.find(name => name.toLowerCase() === 'adminaccounts');
  const staff = staffCollection ? await db.collection(staffCollection).aggregate([{ $group: { _id: { role: '$role', status: '$status', mfaEnabled: '$mfaEnabled' }, count: { $sum: 1 } } }]).toArray() : [];
  console.log(JSON.stringify({ database: db.databaseName, ping: 'passed', collections: collections.filter(name => ['products', 'categories', 'productVariants'].includes(name)),
    products: products.length, variants: variants.length,
    published: products.filter(p => p.status === 'published').length,
    demoOrSample: products.filter(p => p.isDemo || p.isSample).length,
    missingHindiNames: products.filter(p => !p.hindiName).length,
    unknownCategories: products.filter(p => !categorySlugs.has(p.category)).length,
    missingVariantReferences: products.reduce((n, p) => n + (p.variantIds || []).filter(id => !variantIds.has(String(id))).length, 0),
    orphanVariants: variants.filter(v => !productIds.has(String(v.productId))).length,
    nonPositiveCanonicalPrices: variants.filter(v => !(v.pricePaise > 0)).length,
    duplicateSlugGroups: duplicateSlugs[0]?.count || 0,
    staffStatusCounts: staff
  }, null, 2));
} catch (error) {
  console.error(classifyDatabaseError(error));
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
