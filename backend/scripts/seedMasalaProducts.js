import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase, classifyDatabaseError } from '../src/config/db.js';
import Product from '../src/models/Product.js';
import Category from '../src/models/Category.js';
import { assertTarget, SeedSafetyError, fingerprint, planMasalaSeed } from './lib/masalaSeedPlan.js';

const reportPath = fileURLToPath(new URL('../.runtime/masala-seed-dry-run.json', import.meta.url));
const publicRoot = fileURLToPath(new URL('../../frontend/public/', import.meta.url));
const counts = records => Object.fromEntries(['inserted', 'updated', 'skipped', 'failed'].map(action => [action, records.filter(record => record.action === action).length]));

async function snapshot(db, session) {
  const options = session ? { session } : {};
  return {
    products: await db.collection('products').find({}, options).sort({ _id: 1 }).toArray(),
    categories: await db.collection('categories').find({}, options).sort({ _id: 1 }).toArray(),
    variants: await db.collection('productVariants').find({}, options).sort({ _id: 1 }).toArray(),
  };
}

function documentCounts(data) {
  return { products: data.products.length, categories: data.categories.length, canonicalVariants: data.variants.length,
    published: data.products.filter(product => product.status === 'published').length,
    drafts: data.products.filter(product => product.status === 'draft').length };
}

function sourceFingerprint() {
  return fingerprint(['./seedMasalaProducts.js', './lib/masalaSeedPlan.js', '../src/data/masalaSeedCatalogue.js'].map(name => readFileSync(new URL(name, import.meta.url), 'utf8')));
}

async function validatePlan(plan, before) {
  for (const row of plan.products) {
    if (row.action === 'failed') continue;
    const original = before.products.find(product => String(product._id) === row.id);
    try { await new Product({ ...original, ...row.set }).validate(); }
    catch (error) {
      row.action = 'failed';
      row.reason = `Schema validation failed: ${Object.keys(error.errors || {}).join(', ') || error.name}`;
      plan.blockers.push(`${row.name}: ${row.reason}`);
    }
  }
  for (const row of plan.categories.filter(row => row.action === 'inserted')) await new Category(row.set).validate();
}

async function run() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dry-run', '--apply'].includes(arg)) || (args.includes('--dry-run') && args.includes('--apply'))) {
    throw new SeedSafetyError('Usage: node scripts/seedMasalaProducts.js [--dry-run | --apply]');
  }
  const apply = args.includes('--apply');
  const env = getEnv();
  const fileEnv = dotenv.parse(readFileSync(new URL('../.env', import.meta.url)));
  if (env.MONGODB_URI !== fileEnv.MONGODB_URI || env.MONGODB_DB_NAME !== fileEnv.MONGODB_DB_NAME) {
    throw new SeedSafetyError('Process database settings differ from backend/.env. Resolve that mismatch first.');
  }
  assertTarget(env.MONGODB_URI, env.MONGODB_DB_NAME);
  // Uses the existing DNS setup. Does NOT call maintainDatabaseConnection/initializeModels.
  await connectDatabase(env.MONGODB_URI, env.MONGODB_DB_NAME);
  const db = mongoose.connection.db;
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  if (db.databaseName !== 'son_masala' || !collections.some(collection => collection.name === 'products') || !await db.collection('products').countDocuments()) {
    throw new SeedSafetyError('son_masala is not initialized with an existing products collection. Stopped without writing.');
  }
  await db.command({ ping: 1 });
  const before = await snapshot(db);
  const plan = planMasalaSeed(before, publicRoot);
  await validatePlan(plan, before);
  const report = {
    mode: apply ? 'apply' : 'dry-run', host: 'main.jtli6ua.mongodb.net', database: db.databaseName,
    generatedAt: new Date().toISOString(), currentDocumentCounts: documentCounts(before),
    requiredProducts: plan.products.length,
    proposed: { products: counts(plan.products), categories: counts(plan.categories), variantImageUpdates: plan.variants.length },
    products: plan.products, categories: plan.categories, variantImages: plan.variants,
    warnings: plan.warnings, duplicates: plan.duplicates, blockers: plan.blockers,
    snapshotFingerprint: fingerprint(before), planFingerprint: fingerprint(plan), sourceFingerprint: sourceFingerprint(),
    policy: 'No prices, MRP, stock, verified fields, status, featured flags or stable identities are overwritten. Missing products are unpriced drafts. Botanical identity and blend formulation require verification. No deletion or sample-price creation.',
  };
  if (!apply) {
    mkdirSync(fileURLToPath(new URL('../.runtime/', import.meta.url)), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    console.log(`Dry-run only. No database writes. Review report: ${reportPath}`);
    if (plan.blockers.length) process.exitCode = 1;
    return;
  }
  if (!existsSync(reportPath)) throw new SeedSafetyError('Run --dry-run and obtain approval before --apply.');
  const approved = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (approved.mode !== 'dry-run' || approved.database !== 'son_masala' || approved.snapshotFingerprint !== report.snapshotFingerprint || approved.planFingerprint !== report.planFingerprint || approved.sourceFingerprint !== report.sourceFingerprint) {
    throw new SeedSafetyError('Database or proposed changes differ from the reviewed dry-run. Run a new dry-run and obtain approval.');
  }
  if (plan.blockers.length) throw new SeedSafetyError('Dry-run has blockers. Resolve them before applying.');
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (fingerprint(await snapshot(db, session)) !== approved.snapshotFingerprint) throw new SeedSafetyError('Catalogue changed before the transaction. No changes applied.');
      for (const row of plan.categories.filter(row => row.action === 'inserted')) {
        const document = new Category(row.set).toObject();
        await db.collection('categories').insertOne({ ...document, createdAt: new Date(), updatedAt: new Date() }, { session });
      }
      for (const row of plan.products) {
        if (row.action === 'inserted') {
          const document = new Product(row.set).toObject();
          await db.collection('products').insertOne({ ...document, createdAt: new Date(), updatedAt: new Date() }, { session });
        } else if (row.action === 'updated') {
          await db.collection('products').updateOne({ _id: new mongoose.Types.ObjectId(row.id) }, { $set: { ...row.set, updatedAt: new Date() } }, { session });
        }
      }
      for (const row of plan.variants) await db.collection('productVariants').updateOne({ _id: new mongoose.Types.ObjectId(row.id) }, { $set: { ...row.set, updatedAt: new Date() } }, { session });
    });
  } finally { await session.endSession(); }
  report.actualDocumentCounts = documentCounts(await snapshot(db));
  console.log(JSON.stringify(report, null, 2));
  writeFileSync(reportPath.replace('dry-run.json', `applied-${Date.now()}.json`), JSON.stringify(report, null, 2));
}

try { await run(); }
catch (error) {
  console.error(error instanceof SeedSafetyError ? error.message : classifyDatabaseError(error));
  process.exitCode = 1;
} finally { await disconnectDatabase(); }
