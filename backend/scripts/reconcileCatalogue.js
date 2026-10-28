import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from '../src/config/db.js';
import Product from '../src/models/Product.js';
import { masalaSeedCatalogue } from '../src/data/masalaSeedCatalogue.js';
import { assertTarget, fingerprint } from './lib/masalaSeedPlan.js';
import { productImageIssues, readImageManifest } from '../src/validators/productImage.js';

const runtime = fileURLToPath(new URL('../.runtime/', import.meta.url));
const reportFile = `${runtime}catalogue-reconciliation.json`;
async function snapshot(db, session) {
  const options = session ? { session } : {};
  return {
    products: await db.collection('products').find({}, options).sort({ _id: 1 }).toArray(),
    variants: await db.collection('productVariants').find({}, options).sort({ _id: 1 }).toArray(),
    categories: await db.collection('categories').find({}, options).sort({ _id: 1 }).toArray(),
  };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dry-run', '--apply'].includes(arg)) || args.length > 1) throw new Error('Use --dry-run or --apply.');
  const apply = args.includes('--apply');
  const env = getEnv();
  assertTarget(env.MONGODB_URI, env.MONGODB_DB_NAME);
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  const before = await snapshot(db);
  if (before.products.length < 27) throw new Error('Expected initialized SON MASALA catalogue.');
  const manifest = readImageManifest();
  if (manifest.products.length !== 27 || masalaSeedCatalogue.length !== 27) throw new Error('Expected exactly 27 selected identities.');
  const keepIds = new Set();
  const updates = [];
  const inserts = [];
  for (const item of masalaSeedCatalogue) {
    const original = before.products.find(p => p.slug === item.slug);
    const media = manifest.products.find(p => p.slug === item.slug);
    if (!media) throw new Error(`Missing manifest identity: ${item.slug}`);
    const id = original?._id || new mongoose.Types.ObjectId(media.productId);
    keepIds.add(String(id));
    const set = {
      name: item.name, hindiName: item.hindiName, category: item.category, subcategory: item.subcategory,
      image: media.image, images: [media.image], imageKind: 'representative-demo',
      variants: (original?.variants || []).map(v => ({ ...v, image: media.image, imageCrop: 'full' })),
    };
    if (!original?.description?.trim()) set.description = item.description;
    if (!original?.hindiDescription?.trim()) set.hindiDescription = item.hindiDescription;
    const candidate = original ? { ...original, ...set } : {
      ...item, ...set, _id: id, status: 'draft', inventoryStatus: 'unknown', availablePackSizes: [],
      variants: [], variantIds: [], sku: media.sku,
    };
    const issues = productImageIssues(candidate);
    if (issues.length) throw new Error(`${item.slug}: ${issues.map(i => i.message).join('; ')}`);
    await new Product(candidate).validate();
    if (original) updates.push({ id, set });
    else inserts.push(new Product(candidate).toObject());
  }
  const removed = before.products.filter(p => !keepIds.has(String(p._id)));
  const removedVariants = before.variants.filter(v => !keepIds.has(String(v.productId)));
  const variantUpdates = before.variants.filter(v => keepIds.has(String(v.productId))).map(v => {
    const media = manifest.products.find(p => p.productId === String(v.productId));
    return { id: v._id, image: media.image };
  });
  const digest = fingerprint({ before, manifest, updates, inserts, removed, removedVariants, variantUpdates });
  const report = {
    database: db.databaseName, generatedAt: new Date().toISOString(), digest,
    before: { products: before.products.length, variants: before.variants.length },
    after: { products: keepIds.size, variants: variantUpdates.length },
    inserted: inserts.map(p => ({ id: String(p._id), slug: p.slug, name: p.name })),
    kept: masalaSeedCatalogue.map(p => ({ slug: p.slug, name: p.name })),
    deleted: removed.map(p => ({ id: String(p._id), slug: p.slug, name: p.name })),
    deletedVariants: removedVariants.length,
    policy: 'Explicit 27-product selection. Preserve retained IDs, SKUs, pricing, stock and publication status. New products are unpriced drafts. Orders remain untouched.',
  };
  if (!apply) {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const reviewed = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  if (reviewed.digest !== digest) throw new Error('Catalogue or assets changed. Run --dry-run again.');
  const backupDirectory = `${runtime}catalogue-backups/reconcile-${Date.now()}/`;
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.writeFileSync(`${backupDirectory}catalogue.ejson`, mongoose.mongo.BSON.EJSON.stringify(before, null, 2, { relaxed: false }));
  fs.writeFileSync(`${backupDirectory}manifest.json`, JSON.stringify(manifest, null, 2));
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (fingerprint(await snapshot(db, session)) !== fingerprint(before)) throw new Error('Catalogue changed before transaction.');
      await db.collection('products').bulkWrite([
        ...updates.map(row => ({ updateOne: { filter: { _id: row.id }, update: { $set: { ...row.set, updatedAt: new Date() } } } })),
        ...inserts.map(row => ({ insertOne: { document: { ...row, createdAt: new Date(), updatedAt: new Date() } } })),
      ], { session });
      if (variantUpdates.length) await db.collection('productVariants').bulkWrite(variantUpdates.map(row => ({
        updateOne: { filter: { _id: row.id }, update: { $set: { image: row.image, imageCrop: 'full', updatedAt: new Date() } } },
      })), { session });
      await db.collection('productVariants').deleteMany({ _id: { $in: removedVariants.map(v => v._id) } }, { session });
      await db.collection('products').deleteMany({ _id: { $in: removed.map(p => p._id) } }, { session });
      if (await db.collection('products').countDocuments({}, { session }) !== 27) throw new Error('Final catalogue count must be 27.');
    });
  } finally { await session.endSession(); }
  const after = await snapshot(db);
  for (const p of after.products) {
    if (productImageIssues(p).length) throw new Error(`Post-apply image verification failed: ${p.slug}`);
    const old = before.products.find(value => String(value._id) === String(p._id));
    if (old && fingerprint({ status: old.status, sku: old.sku, variants: old.variants.map(({ image: _image, imageCrop: _imageCrop, ...v }) => v) }) !== fingerprint({ status: p.status, sku: p.sku, variants: p.variants.map(({ image: _image, imageCrop: _imageCrop, ...v }) => v) })) throw new Error(`Business fields changed: ${p.slug}`);
  }
  const result = { ...report, appliedAt: new Date().toISOString(), backupDirectory, verifiedProducts: after.products.length };
  fs.writeFileSync(`${backupDirectory}result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ products: after.products.length, variants: after.variants.length, inserted: inserts.length, deleted: removed.length, deletedVariants: removedVariants.length, backupDirectory }, null, 2));
}

try { await run(); }
catch (error) { console.error(error.name === 'MongooseServerSelectionError' ? classifyDatabaseError(error) : error.message); process.exitCode = 1; }
finally { await disconnectDatabase(); }
