import { existsSync } from 'node:fs';
import { fingerprint } from './masalaSeedPlan.js';
import { imageHash, localImageFile, productImageIssues } from '../../src/validators/productImage.js';

export function planProductImages(snapshot, manifest) {
  const blockers = [];
  const products = [];
  const variants = [];
  const usedHashes = new Map();
  const usedPaths = new Map();
  for (const product of snapshot.products) {
    const row = manifest.products.find(item => item.productId === String(product._id));
    if (!row) { blockers.push(`${product.slug}: no registered identity`); continue; }
    const filename = localImageFile(row.image);
    const available = filename && existsSync(filename);
    const set = { image: row.image, images: [row.image], imageKind: 'representative-demo', category: row.category,
      variants: (product.variants || []).map(variant => ({ ...variant, image: row.image, imageCrop: 'full' })) };
    const issues = productImageIssues({ ...product, ...set }, manifest);
    if (!available) issues.push({ path: 'image', message: 'Generated local image is missing.' });
    if (available) {
      const hash = imageHash(filename);
      if (usedHashes.has(hash)) issues.push({ path: 'image', message: `Duplicate image content shared with ${usedHashes.get(hash)}` });
      usedHashes.set(hash, product.slug);
    }
    if (usedPaths.has(row.image)) issues.push({ path: 'image', message: `Duplicate path shared with ${usedPaths.get(row.image)}` });
    usedPaths.set(row.image, product.slug);
    for (const issue of issues) blockers.push(`${product.slug}: ${issue.path}: ${issue.message}`);
    products.push({ id: String(product._id), name: product.name, hindiName: product.hindiName || '', sku: product.sku || '', slug: product.slug,
      before: { category: product.category, image: product.image || '', images: product.images || [], embeddedImages: (product.variants || []).map(v => ({ sku: v.sku, image: v.image || '' })) },
      set, ready: !issues.length, issues, generated: !!available });
    for (const variant of snapshot.variants.filter(v => String(v.productId) === String(product._id))) {
      const owner = manifest.products.find(item => item.variantSkus.includes(variant.sku));
      if (!owner || owner.productId !== row.productId) blockers.push(`${product.slug}: canonical variant SKU ${variant.sku} has no matching owner`);
      variants.push({ id: String(variant._id), productId: String(product._id), sku: variant.sku, before: { image: variant.image || '', imageCrop: variant.imageCrop || 'full' }, set: { image: row.image, imageCrop: 'full' } });
    }
    if (!snapshot.categories.some(category => category.slug === row.category)) blockers.push(`${product.slug}: missing category ${row.category}`);
  }
  for (const field of ['sku', 'slug']) {
    const values = snapshot.products.map(p => p[field]).filter(Boolean);
    if (new Set(values).size !== values.length) blockers.push(`Duplicate product ${field} values require review.`);
  }
  for (const variant of snapshot.variants) if (!snapshot.products.some(p => String(p._id) === String(variant.productId))) blockers.push(`Orphan canonical variant ${variant.sku}`);
  return { database: 'son_masala', products, variants, blockers: [...new Set(blockers)], snapshotFingerprint: fingerprint(snapshot), manifestFingerprint: fingerprint(manifest) };
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function renderImagePreview(plan) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SON MASALA — Product image review</title>
<style>body{font:16px system-ui;background:#faf6ed;color:#243d2e;margin:28px}header{max-width:1000px;margin-bottom:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:18px}article{background:white;border:1px solid #ddd5c3;padding:18px;border-radius:10px}img,.missing{width:100%;aspect-ratio:1;object-fit:contain;background:#f5f1e8}.missing{display:grid;place-items:center;color:#795d39}h2{font-size:20px}code{overflow-wrap:anywhere;font-size:12px}p{line-height:1.5}.ready{color:#257138}.pending{color:#9a3c24}details{font-size:12px}</style>
<header><h1>SON MASALA: exact product image review</h1><p>Preview only. MongoDB has not been updated. Each record retains its existing ID, name, SKU, prices, stock and order history. All images are representative demos.</p><p>${plan.products.length} products · ${plan.products.filter(p => p.ready).length} ready · ${plan.products.filter(p => !p.generated).length} missing generated images · ${plan.variants.length} canonical variants · ${plan.products.filter(p => p.before.category !== p.set.category).length} category corrections</p><p>Approval digest: <code>${fingerprint(plan)}</code></p><label>Find a product <input id="search" type="search" placeholder="Name, Hindi or SKU"></label></header><main>${plan.products.map(row => `<article data-search="${escape(`${row.name} ${row.hindiName} ${row.sku} ${row.slug}`.toLowerCase())}">${row.generated ? `<img src="${escape(row.set.image)}" alt="${escape(row.name)} — representative demo" loading="lazy">` : '<div class="missing">Image generation pending</div>'}<h2>${escape(row.name)}</h2><p lang="hi">${escape(row.hindiName)}</p><code>${escape(row.sku || 'No product SKU; bound to product ID')}<br>${escape(row.id)}</code><p>${escape(row.before.category)} → ${escape(row.set.category)}</p><p class="${row.ready ? 'ready' : 'pending'}">${row.ready ? 'Ready for approval' : 'Pending verification'}</p><code>${escape(row.set.image)}</code><details><summary>Audit details</summary><p>Previous image: ${escape(row.before.image || '(missing)')}</p>${row.issues.map(issue => `<p>${escape(issue.message)}</p>`).join('')}</details></article>`).join('')}</main><script>document.querySelector('#search').addEventListener('input', e => {for(const card of document.querySelectorAll('article'))card.hidden=!card.dataset.search.includes(e.target.value.toLowerCase())});</script></html>`;
}
