import mongoose from 'mongoose';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from '../src/config/db.js';
import { readImageManifest } from '../src/validators/productImage.js';
import { fingerprint } from './lib/masalaSeedPlan.js';
import { planProductImages, renderImagePreview } from './lib/productImagePlan.js';

const reportUrl = new URL('../.runtime/product-image-dry-run.json', import.meta.url);
const args = process.argv.slice(2);
const offline = args.includes('--offline');
const apply = args.includes('--apply');
const approved = args[args.indexOf('--approved') + 1];
async function snapshot(db, session) {
  const options = session ? { session } : {};
  return { database: db.databaseName, products: await db.collection('products').find({}, options).sort({ slug: 1 }).toArray(), categories: await db.collection('categories').find({}, options).toArray(), variants: await db.collection('productVariants').find({}, options).toArray() };
}
try {
  if (args.some((arg, index) => !['--offline', '--apply', '--dry-run', '--approved'].includes(arg) && args[index - 1] !== '--approved')) throw new Error('Unsupported option.');
  if (apply && (offline || args.includes('--dry-run') || !args.includes('--approved') || !/^[a-f0-9]{64}$/.test(approved || ''))) throw new Error('Apply requires the exact reviewed --approved digest and a live database.');
  let db;
  if (!offline) {
    const env = getEnv();
    await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
    db = mongoose.connection.db;
    if (db.databaseName !== 'son_masala') throw new Error('Refusing a database other than son_masala.');
  }
  const before = offline ? JSON.parse(readFileSync(new URL('../.runtime/product-image-snapshot.json', import.meta.url))) : await snapshot(db);
  if (before.database !== 'son_masala' || !before.products.length) throw new Error('Expected an existing son_masala catalogue.');
  const plan = planProductImages(before, readImageManifest());
  const digest = fingerprint(plan);
  if (apply) {
    if (!existsSync(reportUrl)) throw new Error('Create and review a dry-run first.');
    const reviewed = JSON.parse(readFileSync(reportUrl));
    if (reviewed.digest !== approved || digest !== approved) throw new Error('Database, image files or manifest changed since review. Prepare a fresh preview for approval.');
    if (plan.blockers.length) throw new Error('Missing, duplicate or unverified images block the entire migration.');
    // The full original catalogue is retained for recovery. Write only media and category fields.
    writeFileSync(new URL(`../.runtime/product-images-backup-${Date.now()}.json`, import.meta.url), JSON.stringify(before, null, 2));
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (fingerprint(await snapshot(db, session)) !== plan.snapshotFingerprint) throw new Error('Catalogue changed before transaction. No changes applied.');
        for (const row of plan.products) {
          const set = { image: row.set.image, images: row.set.images, imageKind: row.set.imageKind, category: row.set.category };
          // Set embedded image fields individually; no price, stock or other variant details are replaced.
          for (const [index, variant] of row.set.variants.entries()) {
            set[`variants.${index}.image`] = variant.image;
            set[`variants.${index}.imageCrop`] = 'full';
          }
          await db.collection('products').updateOne({ _id: new mongoose.Types.ObjectId(row.id) }, { $set: set }, { session });
        }
        for (const row of plan.variants) await db.collection('productVariants').updateOne({ _id: new mongoose.Types.ObjectId(row.id) }, { $set: row.set }, { session });
      });
    } finally { await session.endSession(); }
    writeFileSync(new URL(`../.runtime/product-images-applied-${Date.now()}.json`, import.meta.url), JSON.stringify({ digest, plan }, null, 2));
    console.log(`Applied reviewed image and category changes to ${plan.products.length} products and ${plan.variants.length} variants.`);
  } else {
    mkdirSync(new URL('../.runtime/', import.meta.url), { recursive: true });
    writeFileSync(reportUrl, JSON.stringify({ mode: offline ? 'offline-preview' : 'live-dry-run', digest, plan }, null, 2));
    writeFileSync(new URL('../../frontend/public/product-image-review.html', import.meta.url), renderImagePreview(plan));
    console.log(JSON.stringify({ mode: offline ? 'offline-preview' : 'live-dry-run', database: plan.database, products: plan.products.length, ready: plan.products.filter(p => p.ready).length, missingImages: plan.products.filter(p => !p.generated).length, canonicalVariants: plan.variants.length, categoryCorrections: plan.products.filter(p => p.before.category !== p.set.category).length, blockers: plan.blockers.length, digest, preview: '/product-image-review.html' }, null, 2));
  }
} catch (error) { console.error(error.name?.includes('Mongo') ? classifyDatabaseError(error) : error.message); process.exitCode = 1; }
finally { await disconnectDatabase(); }
