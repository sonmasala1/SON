import mongoose from 'mongoose';
import dns from 'node:dns';
import { writeFileSync, mkdirSync } from 'node:fs';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from '../src/config/db.js';

try {
  const env = getEnv();
  if (process.env.AUDIT_DNS_SERVERS) dns.setServers(process.env.AUDIT_DNS_SERVERS.split(','));
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  if (db.databaseName !== 'son_masala') throw new Error('Expected son_masala');
  const data = { database: db.databaseName, products: await db.collection('products').find({}).sort({ slug: 1 }).toArray(), categories: await db.collection('categories').find({}).toArray(), variants: await db.collection('productVariants').find({}).toArray() };
  mkdirSync(new URL('../.runtime/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../.runtime/product-image-snapshot.json', import.meta.url), JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ database: data.database, products: data.products.map(({ _id, name, hindiName, sku, slug, category, image, images, variants }) => ({ _id, name, hindiName, sku, slug, category, image, images, variants: variants?.map(({ sku, image }) => ({ sku, image })) })), categories: data.categories, canonicalVariants: data.variants.length }, null, 2));
} catch (error) { console.error(classifyDatabaseError(error)); console.error({ name: error.name, code: error.code, causeCode: error.cause?.code, syscall: error.syscall, servers: [...(error.reason?.servers?.values?.() || [])].map(s => ({ address: s.address, error: s.error?.message })) }); process.exitCode = 1; }
finally { await disconnectDatabase(); }
