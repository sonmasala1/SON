import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const manifestUrl = new URL('../data/productImageManifest.json', import.meta.url);
const publicRoot = path.resolve(fileURLToPath(new URL('../../../frontend/public/', import.meta.url)));
export const readImageManifest = () => JSON.parse(readFileSync(manifestUrl, 'utf8'));
export const imageHash = filename => createHash('sha256').update(readFileSync(filename)).digest('hex');
export function localImageFile(url) {
  if (typeof url !== 'string' || !/^\/images\/products\/[a-z0-9-]+\.png$/.test(url)) return null;
  const filename = path.resolve(publicRoot, `.${url}`);
  return filename.startsWith(publicRoot + path.sep) ? filename : null;
}

// Ownership is explicit: no fuzzy names, filename guessing, image indexes or cross-SKU fallbacks.
export function productImageIssues(product, manifest = readImageManifest(), { checkFiles = true } = {}) {
  const issues = [];
  const row = manifest.products.find(item => item.slug === product.slug && item.sku === (product.sku || ''));
  const media = [['image', product.image], ...(product.images || []).map((url, index) => [`images.${index}`, url]),
    ...(product.variants || []).map((variant, index) => [`variants.${index}.image`, variant.image])].filter(([, url]) => url);
  if (!media.length) return issues; // An unillustrated draft is preferable to an unrelated image.
  if (!row || row.name !== product.name || row.hindiName !== (product.hindiName || '') || (product._id && row.productId !== String(product._id))) {
    return [{ path: 'image', message: 'Image ownership requires the registered product ID, SKU, slug, English and Hindi names.' }];
  }
  if (row.category !== product.category) issues.push({ path: 'category', message: 'Category does not match the verified product image identity.' });
  for (const [field, url] of media) {
    if (url !== row.image) { issues.push({ path: field, message: `Only the registered image for ${product.sku || product.slug} may be assigned.` }); continue; }
    if (!row.visuallyVerified || !row.sha256) { issues.push({ path: field, message: 'The product-specific image must be visually verified and hashed before assignment.' }); continue; }
    const filename = localImageFile(url);
    if (checkFiles && (!filename || !existsSync(filename) || imageHash(filename) !== row.sha256)) issues.push({ path: field, message: 'Registered image file is missing or its contents changed.' });
  }
  for (const [index, variant] of (product.variants || []).entries()) {
    const owner = manifest.products.find(item => item.variantSkus.includes(variant.sku));
    if (owner && owner.productId !== row.productId) issues.push({ path: `variants.${index}.sku`, message: 'Variant SKU belongs to another product.' });
    if (variant.image && variant.imageCrop && variant.imageCrop !== 'full') issues.push({ path: `variants.${index}.imageCrop`, message: 'Individual demo photos must use the full image.' });
  }
  return issues;
}

export function assertProductImages(product) {
  const issues = productImageIssues(product);
  if (issues.length) { const error = new Error(issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')); error.status = 400; throw error; }
}
