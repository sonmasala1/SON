import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { masalaSeedCatalogue, masalaCategories } from '../../src/data/masalaSeedCatalogue.js';

export class SeedSafetyError extends Error { constructor(message) { super(message); this.name = 'SeedSafetyError'; } }

export function assertTarget(uri, databaseName) {
  let parsed;
  try { parsed = new URL(uri); } catch { throw new SeedSafetyError('Invalid Atlas configuration.'); }
  const selected = decodeURIComponent(parsed.pathname.replace(/^\/+/, '')) || databaseName;
  if (parsed.protocol !== 'mongodb+srv:' || parsed.hostname !== 'main.jtli6ua.mongodb.net' || selected !== 'son_masala' || (databaseName && databaseName !== selected)) {
    throw new SeedSafetyError('Seed restricted to main.jtli6ua.mongodb.net / son_masala. No writes performed.');
  }
}

function stable(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.toJSON === 'function') return stable(value.toJSON());
  if (Array.isArray(value)) return value.map(stable);
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}
export function fingerprint(snapshot) {
  return createHash('sha256').update(JSON.stringify(stable(snapshot))).digest('hex');
}

const baseImages = new Set(['jeera', 'kali-mirch', 'laung', 'dalchini', 'choti-elaichi', 'haldi-powder', 'dhaniya-powder', 'lal-mirch-powder', 'garam-masala', 'chole-masala', 'pav-bhaji-masala']);
const galleryImages = new Set(['ajwain', 'saunf', 'methi-dana', 'rai']);
const placeholder = '/images/product-placeholder.svg';

function localAssetExists(url, publicRoot) {
  if (!url?.startsWith('/') || url.startsWith('//')) return false;
  const root = path.resolve(publicRoot);
  const resolved = path.resolve(root, `.${url}`);
  return resolved.startsWith(root + path.sep) && existsSync(resolved);
}

function representativeImage(item, publicRoot) {
  const candidate = baseImages.has(item.slug) ? `/images/products/${item.slug}.png`
    : galleryImages.has(item.slug) ? `/images/products/${item.slug}-gallery.png` : placeholder;
  const url = localAssetExists(candidate, publicRoot) ? candidate : placeholder;
  if (!localAssetExists(url, publicRoot)) throw new Error('Neutral image placeholder is missing.');
  return { url, kind: url === placeholder ? 'placeholder' : 'representative-demo' };
}

function isStockPhoto(url) {
  try { return new URL(url).hostname === 'images.unsplash.com'; } catch { return false; }
}

function ownedArtwork(url) {
  return [...baseImages].some(slug => ['', '-sizes', '-legacy-sizes'].some(suffix => url === `/images/products/${slug}${suffix}.png`) || url === `/images/demo-${slug}.svg`)
    || [...galleryImages].some(slug => url === `/images/products/${slug}-gallery.png`);
}

function duplicateGroups(records, field) {
  const groups = new Map();
  for (const record of records) {
    if (!record[field]) continue;
    const key = String(record[field]).trim().toLowerCase();
    groups.set(key, [...(groups.get(key) || []), String(record._id)]);
  }
  return [...groups].filter(([, ids]) => ids.length > 1).map(([value, ids]) => ({ value, ids }));
}

export function planMasalaSeed(snapshot, publicRoot) {
  const { products, categories } = snapshot;
  const plan = { products: [], categories: [], variants: [], warnings: [], blockers: [] };
  const duplicates = { productSkus: duplicateGroups(products, 'sku'), productSlugs: duplicateGroups(products, 'slug'), variantSkus: duplicateGroups(snapshot.variants, 'sku') };
  if (Object.values(duplicates).some(groups => groups.length)) plan.blockers.push('Existing duplicate SKUs/slugs require manual review before applying.');
  const chosenIds = new Set();
  for (const item of masalaSeedCatalogue) {
    const matches = products.filter(product => [item.slug, ...item.aliases].includes(product.slug) || product.sku === item.sku);
    const direct = matches.filter(product => product.slug === item.slug || product.sku === item.sku);
    if (direct.length > 1 || (!direct.length && matches.length > 1)) {
      plan.blockers.push(`Ambiguous stable identity for ${item.name}.`);
      plan.products.push({ name: item.name, action: 'failed', reason: 'Multiple stable matches' });
      continue;
    }
    const existing = direct[0] || matches[0];
    if (matches.length > 1) plan.warnings.push({ product: item.name, reason: 'Existing alias records retained; no merge or deletion.', slugs: matches.map(product => product.slug) });
    if (existing && chosenIds.has(String(existing._id))) {
      plan.blockers.push(`Two required entries resolve to ${existing.slug}.`);
      continue;
    }
    if (existing) chosenIds.add(String(existing._id));
    const set = {};
    const fill = (key, value) => {
      if (!existing?.[key] || (Array.isArray(existing[key]) && !existing[key].length)) {
        if (value !== '' && (!Array.isArray(value) || value.length)) set[key] = value;
      }
    };
    fill('name', item.name); fill('hindiName', item.hindiName); fill('sku', item.sku);
    fill('description', item.description); fill('hindiDescription', item.hindiDescription);
    fill('subcategory', item.subcategory); fill('rawSpiceIngredients', item.rawSpiceIngredients);
    fill('ingredients', item.rawSpiceIngredients); fill('storageInstructions', item.storageInstructions);
    const storedPacks = [...new Set([
      ...(existing?.availablePackSizes || []),
      ...(existing?.variants || []).map(variant => variant.label),
      ...snapshot.variants.filter(variant => String(variant.productId) === String(existing?._id) && variant.isActive !== false).map(variant => variant.label),
    ].filter(Boolean))];
    fill('packSizeOptions', storedPacks.length ? storedPacks : item.packSizeOptions);
    if (existing?.category !== item.category) set.category = item.category;
    // Botanical identities/formulations are not treated as verified business data.
    if (!existing) Object.assign(set, { slug: item.slug, botanicalName: '', availablePackSizes: [], variants: [], variantIds: [], inventoryStatus: 'unknown', status: 'draft', featured: false, isDemo: false, isSample: false });
    const media = representativeImage(item, publicRoot);
    if (!existing?.image || isStockPhoto(existing.image) || ownedArtwork(existing.image) || existing.image === placeholder) {
      if (existing?.image !== media.url) set.image = media.url;
      if (existing?.imageKind !== media.kind) set.imageKind = media.kind;
      const gallery = (existing?.images || []).map(url => isStockPhoto(url) ? media.url : url);
      const images = [...new Set([media.url, ...gallery])];
      if (fingerprint(existing?.images || []) !== fingerprint(images)) set.images = images;
    } else {
      plan.warnings.push({ product: item.name, reason: 'Custom business image retained; image relevance needs manual confirmation.' });
    }
    // Preserve all embedded/canonical prices, MRP, stock, IDs and verification fields.
    const proposedSku = set.sku || existing?.sku;
    if (products.some(product => product.sku?.toLowerCase() === proposedSku?.toLowerCase() && String(product._id) !== String(existing?._id))) {
      plan.blockers.push(`SKU conflict for ${item.name}.`);
    }
    plan.products.push({
      name: item.name, id: existing ? String(existing._id) : null,
      slug: existing?.slug || item.slug, sku: proposedSku,
      action: !existing ? 'inserted' : Object.keys(set).length ? 'updated' : 'skipped',
      set, imageKind: set.imageKind || existing?.imageKind || 'unverified',
      status: existing?.status || 'draft',
    });
    if (existing) {
      for (const variant of snapshot.variants.filter(variant => String(variant.productId) === String(existing._id))) {
        if (!isStockPhoto(variant.image)) continue;
        // No guessed size-specific photo: replace known stock photos with a neutral image.
        plan.variants.push({ id: String(variant._id), product: item.name, set: { image: placeholder, imageCrop: 'full' } });
      }
      if ((existing.variants || []).some(variant => isStockPhoto(variant.image))) {
        set.variants = existing.variants.map(variant => isStockPhoto(variant.image) ? { ...variant, image: placeholder, imageCrop: 'full' } : variant);
        plan.products.at(-1).action = 'updated';
      }
    }
  }
  for (const category of masalaCategories) {
    const existing = categories.find(record => record.slug === category.slug);
    plan.categories.push({ slug: category.slug, action: existing ? 'skipped' : 'inserted', ...(!existing ? { set: category } : {}) });
  }
  plan.duplicates = duplicates;
  return plan;
}
