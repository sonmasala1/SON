import { z } from 'zod';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Cart from '../models/Cart.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import { audit } from '../services/staffAudit.js';
import { httpError } from '../utils/httpError.js';
import { objectId, parse } from '../validators/commerce.js';
import { productImageIssues } from '../validators/productImage.js';

const text = (max = 5000) => z.string().trim().max(max);
export const variantInput = z.object({
  label: text(40).min(1),
  sku: text(80).optional().default(''),
  weightGrams: z.number().int().positive().max(1000000).optional().nullable(),
  price: z.number().min(0).max(1000000).optional().nullable(),
  mrp: z.number().min(0).max(1000000).optional().nullable(),
  stock: z.number().int().min(0).max(10000000).default(0),
  image: text(1000).optional().default(''),
  imageCrop: z.enum(['full', 'left-half', 'right-half', 'left-third', 'middle-third', 'right-third']).optional().default('full'),
}).strict().superRefine((variant, context) => {
  if (variant.price != null && variant.mrp != null && variant.mrp < variant.price) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['mrp'], message: 'MRP cannot be below selling price.' });
  }
  if (variant.price > 0 && (!variant.sku || !variant.weightGrams || !variant.mrp)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['price'], message: 'Priced packs require a SKU, pack weight, and MRP.' });
  }
});
const productInputFields = z.object({
  name: text(160).min(1),
  hindiName: text(160).optional().default(''),
  sku: text(80).optional().default(''),
  slug: text(160).min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: text(5000).optional().default(''),
  hindiDescription: text(5000).optional().default(''),
  category: text(120).regex(/^[a-z0-9-]{1,120}$/),
  subcategory: text(120).optional().default(''),
  ingredients: z.array(text(160)).max(100).optional().default([]),
  rawSpiceIngredients: z.array(text(160)).max(100).optional().default([]),
  ingredientComposition: z.array(z.object({ name: text(160).min(1), percentage: z.number().min(0).max(100) }).strict()).max(100).optional().default([]),
  ingredientCompositionVerified: z.boolean().optional().default(false),
  ingredientCompositionSource: text(240).optional().default(''),
  botanicalName: text(240).optional().default(''),
  origin: text(240).optional().default(''),
  originVerificationStatus: z.enum(['unknown', 'verified']).optional().default('unknown'),
  originVerificationSource: text(240).optional().default(''),
  packSizeOptions: z.array(text(16)).max(30).optional().default([]),
  availablePackSizes: z.array(text(16)).max(30).optional().default([]),
  usageInstructions: text(2000).optional().default(''),
  storageInstructions: text(2000).optional().default(''),
  shelfLife: text(120).optional().default(''),
  shelfLifeVerificationStatus: z.enum(['unknown', 'verified']).optional().default('unknown'),
  shelfLifeVerificationSource: text(240).optional().default(''),
  allergenInformation: text(1000).optional().default(''),
  inventoryStatus: z.enum(['unknown', 'known']).optional().default('unknown'),
  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  catalogVisible: z.boolean().optional().default(false),
  image: text(1000).optional().default(''),
  images: z.array(text(1000)).max(20).optional().default([]),
  variants: z.array(variantInput).max(30).optional().default([]),
  featured: z.boolean().optional().default(false),
}).strict();
export const productInput = productInputFields.superRefine((product, context) => {
  for (const issue of productImageIssues(product)) context.addIssue({ code: z.ZodIssueCode.custom, path: issue.path.split('.'), message: issue.message });
  if (product.status === 'published' && !product.hindiName) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hindiName'], message: 'Published products require a Hindi name.' });
  }
  if (product.status === 'published' && !product.hindiDescription) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['hindiDescription'], message: 'Published products require a Hindi description.' });
  }
  if (product.origin && (product.originVerificationStatus !== 'verified' || !product.originVerificationSource)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['origin'], message: 'Origin claims require a verified source.' });
  }
  if (product.shelfLife && (product.shelfLifeVerificationStatus !== 'verified' || !product.shelfLifeVerificationSource)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['shelfLife'], message: 'Shelf-life claims require a verified source.' });
  }
  if (product.ingredientComposition.length) {
    const total = product.ingredientComposition.reduce((sum, item) => sum + item.percentage, 0);
    if (!product.ingredientCompositionVerified || !product.ingredientCompositionSource) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['ingredientComposition'], message: 'Blend percentages require a verified manufacturing-specification source.' });
    }
    if (Math.abs(total - 100) > 0.01) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['ingredientComposition'], message: 'Ingredient percentages must total 100.' });
    }
  }
});
const categoryInput = z.object({
  name: text(120).min(1),
  hindiName: text(120).optional().default(''),
  slug: text(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sort: z.number().int().min(0).max(10000).default(0),
  status: z.enum(['active', 'archived']).default('active'),
}).strict();
const listInput = z.object({
  q: text(80).optional().default(''),
  category: text(120).optional().default(''),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prepareProduct(input) {
  const product = { ...input };
  if (!product.sku) product.sku = undefined;
  else product.sku = product.sku.toUpperCase();
  if (!product.ingredientComposition?.length) {
    product.ingredientCompositionVerified = false;
    product.ingredientCompositionSource = '';
  }
  if (!product.origin) { product.originVerificationStatus = 'unknown'; product.originVerificationSource = ''; }
  if (!product.shelfLife) { product.shelfLifeVerificationStatus = 'unknown'; product.shelfLifeVerificationSource = ''; }
  if (!product.image && product.images?.length) product.image = product.images[0];
  if (product.image && product.images && !product.images.includes(product.image)) product.images = [product.image, ...product.images];
  if (product.inventoryStatus !== 'known' && product.variants?.some(variant => !variant.price || variant.price <= 0 || variant.stock === 0)) product.inventoryStatus = 'unknown';
  return product;
}

async function syncCanonicalVariants(product, variants, session) {
  await ProductVariant.updateMany({ productId: product._id }, { isActive: false }, { session });
  const activeIds = [];
  for (const variant of variants) {
    if (!(variant.price > 0) || !(variant.mrp > 0) || !variant.sku || !variant.weightGrams) continue;
    const existingSku = await ProductVariant.findOne({ sku: variant.sku }).session(session);
    if (existingSku && String(existingSku.productId) !== String(product._id)) {
      throw httpError(409, `Variant SKU ${variant.sku} is already assigned to another product.`);
    }
    const canonical = await ProductVariant.findOneAndUpdate(
      { productId: product._id, sku: variant.sku },
      {
        $set: {
          label: variant.label,
          weightGrams: variant.weightGrams,
          pricePaise: Math.round(variant.price * 100),
          mrpPaise: Math.round(variant.mrp * 100),
          offerPricePaise: null,
          stock: variant.stock,
          image: variant.image,
          imageCrop: variant.imageCrop,
          isActive: true,
        },
        $setOnInsert: { productId: product._id, sku: variant.sku, isDemo: false },
      },
      { new: true, upsert: true, runValidators: true, session },
    );
    activeIds.push(canonical._id);
  }
  product.variantIds = activeIds;
}

export async function listManagedProducts(req, res, next) {
  try {
    const input = parse(listInput, req.query);
    const filter = {};
    if (input.category) filter.category = input.category;
    if (input.status) filter.status = input.status;
    if (input.q) {
      const query = new RegExp(escapeRegex(input.q), 'i');
      filter.$or = [{ name: query }, { hindiName: query }, { sku: query }, { slug: query }];
    }
    const [records, total] = await Promise.all([
      Product.find(filter).sort({ updatedAt: -1, name: 1 }).skip((input.page - 1) * input.limit).limit(input.limit).lean(),
      Product.countDocuments(filter),
    ]);
    const products = await Promise.all(records.map(async record => {
      const variants = await ProductVariant.find({ productId: record._id, isActive: { $ne: false } }).sort({ weightGrams: 1 }).lean();
      return {
        ...record,
        variants: variants.length ? variants.map(variant => ({
          sku: variant.sku,
          label: variant.label,
          weightGrams: variant.weightGrams,
          price: variant.pricePaise / 100,
          mrp: variant.mrpPaise / 100,
          stock: variant.stock,
          image: variant.image || '',
          imageCrop: variant.imageCrop || 'full',
        })) : record.variants,
      };
    }));
    res.json({ success: true, products, pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } });
  } catch (error) { next(error); }
}

export async function createManagedProduct(req, res, next) {
  try {
    const input = prepareProduct(parse(productInput, req.body));
    await mongoose.connection.transaction(async session => {
      const [product] = await Product.create([input], { session });
      await syncCanonicalVariants(product, input.variants, session);
      await product.save({ session });
      await audit(req, 'PRODUCT_CREATED', { targetId: product._id, changes: { sku: product.sku, slug: product.slug } }, session);
      res.status(201).json({ success: true, product });
    });
  } catch (error) { next(error); }
}

export async function updateManagedProduct(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    const input = prepareProduct(parse(productInput, req.body));
    await mongoose.connection.transaction(async session => {
      const product = await Product.findById(id).session(session);
      if (!product) throw httpError(404, 'Product not found.');
      const previous = { sku: product.sku, slug: product.slug, status: product.status };
      Object.assign(product, input);
      await syncCanonicalVariants(product, input.variants, session);
      await product.save({ session });
      await audit(req, 'PRODUCT_UPDATED', { targetId: id, changes: { before: previous, after: { sku: product.sku, slug: product.slug, status: product.status } } }, session);
      res.json({ success: true, product });
    });
  } catch (error) { next(error); }
}

export async function archiveManagedProduct(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    await mongoose.connection.transaction(async session => {
      const product = await Product.findById(id).session(session);
      if (!product) throw httpError(404, 'Product not found.');
      product.status = 'archived';
      await product.save({ session });
      await audit(req, 'PRODUCT_ARCHIVED', { targetId: id }, session);
      res.json({ success: true });
    });
  } catch (error) { next(error); }
}

export async function deleteManagedProduct(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    await mongoose.connection.transaction(async session => {
      const product = await Product.findById(id).session(session);
      if (!product) throw httpError(404, 'Product not found.');
      if (await Order.exists({ 'items.productId': id }).session(session)) {
        throw httpError(409, 'This product has order history. Archive it instead of deleting it.');
      }
      await ProductVariant.deleteMany({ productId: id }, { session });
      await Cart.updateMany({ 'items.productId': id }, { $pull: { items: { productId: id } } }, { session });
      await Product.deleteOne({ _id: id }, { session });
      await audit(req, 'PRODUCT_DELETED', { targetId: id }, session);
      res.json({ success: true });
    });
  } catch (error) { next(error); }
}

export async function listManagedCategories(_req, res, next) {
  try { res.json({ success: true, categories: await Category.find().sort({ sort: 1, name: 1 }).lean() }); }
  catch (error) { next(error); }
}

export async function createManagedCategory(req, res, next) {
  try {
    const input = parse(categoryInput, req.body);
    const category = await Category.create(input);
    await audit(req, 'CATEGORY_CREATED', { targetId: category._id, changes: { slug: category.slug } });
    res.status(201).json({ success: true, category });
  } catch (error) { next(error); }
}

export async function updateManagedCategory(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    const input = parse(categoryInput, req.body);
    const category = await Category.findByIdAndUpdate(id, input, { new: true, runValidators: true });
    if (!category) throw httpError(404, 'Category not found.');
    await audit(req, 'CATEGORY_UPDATED', { targetId: id, changes: { slug: category.slug } });
    res.json({ success: true, category });
  } catch (error) { next(error); }
}

export async function deleteManagedCategory(req, res, next) {
  try {
    const id = parse(objectId, req.params.id);
    const category = await Category.findById(id);
    if (!category) throw httpError(404, 'Category not found.');
    if (await Product.exists({ category: category.slug })) throw httpError(409, 'This category contains products. Archive it or reassign its products first.');
    await Category.deleteOne({ _id: id });
    await audit(req, 'CATEGORY_DELETED', { targetId: id, changes: { slug: category.slug } });
    res.json({ success: true });
  } catch (error) { next(error); }
}

function parseCsv(content) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted && character === '"' && content[index + 1] === '"') { cell += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (!quoted && character === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (quoted) throw httpError(400, 'CSV contains an unclosed quoted field.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const csvFields = [
  'sku', 'name', 'hindiName', 'slug', 'category', 'subcategory', 'status',
  'description', 'hindiDescription', 'ingredients', 'rawSpiceIngredients',
  'ingredientComposition', 'ingredientCompositionVerified', 'ingredientCompositionSource',
  'botanicalName', 'origin', 'originVerificationStatus', 'originVerificationSource', 'packSizeOptions', 'availablePackSizes',
  'usageInstructions', 'storageInstructions', 'shelfLife', 'shelfLifeVerificationStatus', 'shelfLifeVerificationSource',
  'allergenInformation', 'inventoryStatus', 'image', 'images', 'variants', 'featured',
];

function csvCell(value) {
  const content = Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : String(value ?? '');
  return `"${content.replaceAll('"', '""')}"`;
}

export async function exportProductsCsv(_req, res, next) {
  try {
    const records = await Product.find().sort({ name: 1 }).lean();
    const canonical = await ProductVariant.find({ productId: { $in: records.map(record => record._id) }, isActive: { $ne: false } }).lean();
    const canonicalByProduct = new Map();
    for (const variant of canonical) {
      const key = String(variant.productId);
      if (!canonicalByProduct.has(key)) canonicalByProduct.set(key, []);
      canonicalByProduct.get(key).push({
        sku: variant.sku, label: variant.label, weightGrams: variant.weightGrams,
        price: variant.pricePaise / 100, mrp: variant.mrpPaise / 100, stock: variant.stock,
      image: variant.image || '', imageCrop: variant.imageCrop || 'full',
      });
    }
    const lines = [csvFields.join(',')];
    for (const record of records) {
      const variants = canonicalByProduct.get(String(record._id)) || (record.variants || []).map(variant => ({
        sku: variant.sku || '', label: variant.label, weightGrams: variant.weightGrams ?? null,
        price: variant.price ?? null, mrp: variant.mrp ?? null, stock: variant.stock ?? 0,
        image: variant.image || '', imageCrop: variant.imageCrop || 'full',
      }));
      const row = { ...record, variants, ingredientComposition: (record.ingredientComposition || []).map(item => ({ name: item.name, percentage: item.percentage })) };
      lines.push(csvFields.map(field => csvCell(row[field])).join(','));
    }
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="son-masala-products.csv"', 'Cache-Control': 'no-store' });
    res.send(lines.join('\r\n'));
  } catch (error) { next(error); }
}

const jsonFields = new Set(['ingredients', 'rawSpiceIngredients', 'ingredientComposition', 'packSizeOptions', 'availablePackSizes', 'images', 'variants']);
const boolFields = new Set(['ingredientCompositionVerified', 'featured']);
const productCsvInput = productInputFields.partial();

export async function importProductsCsv(req, res, next) {
  try {
    if (typeof req.body !== 'string' || req.body.length > 2_000_000) throw httpError(400, 'Upload a CSV file smaller than 2 MB.');
    const rows = parseCsv(req.body);
    const header = rows.shift()?.map(value => value.trim());
    if (!header?.length || new Set(header).size !== header.length || header.some(field => !csvFields.includes(field))) {
      throw httpError(400, 'CSV headers are missing, duplicated, or unsupported.');
    }
    const dataRows = rows.slice(0, 501);
    if (rows.length > 500) throw httpError(400, 'Import up to 500 products at a time.');
    const counts = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const errors = [];
    for (const [index, row] of dataRows.entries()) {
      try {
        if (row.length !== header.length) throw new Error('The number of values does not match the header.');
        const source = Object.fromEntries(header.map((field, column) => {
          const value = row[column].trim();
          if (jsonFields.has(field)) return [field, value ? JSON.parse(value) : []];
          if (boolFields.has(field)) return [field, value.toLowerCase() === 'true'];
          return [field, value];
        }));
        if (source.ingredientCompositionVerified == null) delete source.ingredientCompositionVerified;
        const parsed = parse(productCsvInput, source);
        const identity = parsed.sku ? { sku: parsed.sku } : parsed.slug ? { slug: parsed.slug } : null;
        if (!identity) throw new Error('Each row requires a stable SKU or slug.');
        const existing = await Product.findOne(identity);
        if (existing) {
          const stored = existing.toObject();
          const candidate = Object.fromEntries(Object.keys(productInputFields.shape).map(field => [field, stored[field]]));
          for (const field of header) candidate[field] = parsed[field];
          const input = prepareProduct(parse(productInput, candidate));
          await mongoose.connection.transaction(async session => {
            Object.assign(existing, input);
            await syncCanonicalVariants(existing, input.variants, session);
            await existing.save({ session });
          });
          counts.updated += 1;
        } else {
          const candidate = { name: '', slug: '', category: 'whole-spices' };
          for (const field of header) candidate[field] = parsed[field];
          const input = prepareProduct(parse(productInput, candidate));
          await mongoose.connection.transaction(async session => {
            const [product] = await Product.create([input], { session });
            await syncCanonicalVariants(product, input.variants, session);
            await product.save({ session });
          });
          counts.inserted += 1;
        }
      } catch (error) {
        counts.failed += 1;
        const message = error instanceof z.ZodError
          ? error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')
          : error instanceof SyntaxError
            ? 'A JSON-formatted CSV cell is invalid.'
            : error.status === 400 ? error.message : 'The row could not be saved; verify the product data and identifiers.';
        errors.push({ row: index + 2, message });
      }
    }
    await audit(req, 'PRODUCTS_CSV_IMPORTED', { changes: { counts } });
    res.json({ success: true, counts, errors });
  } catch (error) { next(error); }
}
