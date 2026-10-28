import mongoose from 'mongoose';
import { getEnv } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import Category from '../src/models/Category.js';
import Product from '../src/models/Product.js';
import { spiceCatalogue, spiceCatalogueCategories } from '../src/data/spiceCatalogue.js';

const applyChanges = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
const unknownArguments = process.argv.slice(2).filter(argument => !['--apply', '--dry-run'].includes(argument));
if (unknownArguments.length || (applyChanges && dryRun)) {
  if (applyChanges && dryRun) {
    console.error('Choose either --dry-run or --apply, not both.');
  } else {
    console.error(`Unknown option: ${unknownArguments[0]}`);
  }
  process.exitCode = 2;
} else {
  const productCounts = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const categoryCounts = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  try {
    const { MONGODB_URI, MONGODB_DB_NAME } = getEnv();
    if (!MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
    await connectDatabase(MONGODB_URI, MONGODB_DB_NAME);
    const productsCollectionExists = await mongoose.connection.db
      .listCollections({ name: Product.collection.name }, { nameOnly: true })
      .hasNext();
    if (!productsCollectionExists) throw new Error('The configured database does not contain the existing products collection.');

    const slugs = spiceCatalogue.map(product => product.slug);
    const skus = spiceCatalogue.map(product => product.sku);
    const existing = await Product.find({ $or: [{ slug: { $in: slugs } }, { sku: { $in: skus } }] })
      .select('slug sku')
      .lean();
    const existingCategories = await Category.find({ slug: { $in: spiceCatalogueCategories.map(category => category.slug) } })
      .select('slug')
      .lean();
    const existingCategorySlugs = new Set(existingCategories.map(category => category.slug));
    const existingSlugs = new Set(existing.map(product => product.slug));
    const existingSkus = new Set(existing.map(product => product.sku).filter(Boolean));
    const productPreview = spiceCatalogue.map(product => ({
      sku: product.sku,
      slug: product.slug,
      name: product.name,
      hindiName: product.hindiName,
      category: product.category,
      subcategory: product.subcategory,
      status: product.status,
      packSizeOptions: product.packSizeOptions,
      action: existingSlugs.has(product.slug) || existingSkus.has(product.sku) ? 'skip-existing' : 'insert-draft',
    }));
    const categoryPreview = spiceCatalogueCategories.map(category => ({
      slug: category.slug,
      name: category.name,
      action: existingCategorySlugs.has(category.slug) ? 'skip-existing' : 'insert',
    }));

    for (const product of spiceCatalogue) {
      if (existingSlugs.has(product.slug) || existingSkus.has(product.sku)) {
        productCounts.skipped += 1;
        continue;
      }
      if (!applyChanges) {
        productCounts.inserted += 1;
        continue;
      }
      try {
        const now = new Date();
        const result = await Product.updateOne(
          { $or: [{ slug: product.slug }, { sku: product.sku }] },
          { $setOnInsert: { ...product, createdAt: now, updatedAt: now } },
          { upsert: true, runValidators: true, timestamps: false },
        );
        if (result.upsertedCount === 1) {
          productCounts.inserted += 1;
          existingSlugs.add(product.slug);
          existingSkus.add(product.sku);
        } else {
          productCounts.skipped += 1;
        }
      } catch (error) {
        if (error.code === 11000) productCounts.skipped += 1;
        else {
          productCounts.failed += 1;
          console.error(`Failed to seed ${product.sku}; details withheld.`);
        }
      }
    }

    for (const category of spiceCatalogueCategories) {
      if (existingCategorySlugs.has(category.slug)) {
        categoryCounts.skipped += 1;
        continue;
      }
      if (!applyChanges) {
        categoryCounts.inserted += 1;
        continue;
      }
      try {
        const now = new Date();
        const result = await Category.updateOne(
          { slug: category.slug },
          { $setOnInsert: { ...category, createdAt: now, updatedAt: now } },
          { upsert: true, runValidators: true, timestamps: false },
        );
        if (result.upsertedCount === 1) {
          categoryCounts.inserted += 1;
          existingCategorySlugs.add(category.slug);
        } else categoryCounts.skipped += 1;
      } catch (error) {
        if (error.code === 11000) categoryCounts.skipped += 1;
        else {
          categoryCounts.failed += 1;
          console.error(`Failed to ensure category ${category.slug}.`);
        }
      }
    }

    const counts = Object.fromEntries(Object.keys(productCounts).map(key => [key, productCounts[key] + categoryCounts[key]]));
    console.log(JSON.stringify({
      mode: applyChanges ? 'apply' : 'dry-run',
      products: spiceCatalogue.length,
      counts: { total: counts, products: productCounts, categories: categoryCounts },
      preview: { products: productPreview, categories: categoryPreview },
      note: applyChanges
        ? 'Only missing products and categories were inserted. Existing records and prices, inventory, and ingredient data were not updated.'
        : 'No database records were changed. Re-run with --apply only after approving insertion.',
    }, null, 2));
    if (counts.failed) process.exitCode = 1;
  } catch (error) {
    const code = error?.code ? ` (database code ${error.code})` : '';
    console.error(`Product catalogue seed failed${code}. Check backend/.env, MongoDB connectivity, and the Atlas allowlist.`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}
