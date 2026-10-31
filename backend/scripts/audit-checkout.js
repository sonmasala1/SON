// Read-only diagnosis using the API's existing environment. No customer fields or credentials.
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { classifyDatabaseError } from '../src/config/db.js';

try {
  const env = getEnv();
  await mongoose.connect(env.MONGODB_URI, { ...(env.MONGODB_DB_NAME ? { dbName: env.MONGODB_DB_NAME } : {}), serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const hello = await db.admin().command({ hello: 1 });
  const products = await db.collection('products').find({}, { projection: { name: 1, status: 1, variants: 1, variantIds: 1 } }).toArray();
  const variants = await db.collection('productVariants').find({}, { projection: { productId: 1, stock: 1, isActive: 1 } }).toArray();
  const counts = { products: products.length, canonicalVariants: variants.length, embeddedOnly: 0, staleReferences: 0 };
  for (const product of products) {
    const canonical = variants.filter(value => String(value.productId) === String(product._id));
    if (!canonical.length && product.variants?.length) counts.embeddedOnly++;
    counts.staleReferences += (product.variantIds || []).filter(id => !canonical.some(value => String(value._id) === String(id))).length;
  }
  const carts = await db.collection('carts').find({ 'items.0': { $exists: true } }, { projection: { items: 1 } }).toArray();
  const cartLines = carts.flatMap(cart => cart.items).map(item => {
    const product = products.find(value => String(value._id) === String(item.productId));
    const canonical = variants.find(value => String(value._id) === String(item.variantId));
    const embedded = product?.variants?.find(value => String(value._id) === String(item.variantId));
    return { product: product?.name || 'missing', source: canonical ? 'canonical' : embedded ? 'embedded' : 'missing', requested: item.quantity, stock: canonical?.stock ?? embedded?.stock, productStatus: product?.status, parentMatches: canonical ? String(canonical.productId) === String(item.productId) : null };
  });
  const orderIndexes = (await db.collection('orders').indexes()).map(value => ({ key: value.key, unique: !!value.unique }));
  console.log(JSON.stringify({ replicaSet: !!hello.setName, counts, cartLines, orderIndexes }, null, 2));
} catch (error) {
  console.error(classifyDatabaseError(error));
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
