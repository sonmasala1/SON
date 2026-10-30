'use client';

import { useCallback, useEffect, useState } from 'react';
import { Text, LocalizedAttrs } from '@/components/LocalizedText';
import { apiUrl } from '@/lib/api';
import { useStaff } from './StaffSession';

const blankProduct = () => ({
  name: '', hindiName: '', sku: '', slug: '', description: '', hindiDescription: '',
  category: '', subcategory: '', ingredients: [], rawSpiceIngredients: [], ingredientComposition: [],
  ingredientCompositionVerified: false, ingredientCompositionSource: '', botanicalName: '',
  origin: '', originVerificationStatus: 'unknown', originVerificationSource: '', packSizeOptions: [], availablePackSizes: [],
  usageInstructions: '', storageInstructions: '', shelfLife: '', shelfLifeVerificationStatus: 'unknown', shelfLifeVerificationSource: '',
  allergenInformation: '', inventoryStatus: 'unknown', status: 'draft', catalogVisible: false, image: '', images: [], variants: [],
});
const lines = value => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
const csvList = value => value.split(',').map(item => item.trim()).filter(Boolean);

function ProductFormField({ label, value, onChange, textarea = false, ...props }) {
  return <label className="staff-form-field"><Text>{label}</Text>{textarea
    ? <LocalizedAttrs><textarea value={value || ''} onChange={onChange} {...props} /></LocalizedAttrs>
    : <LocalizedAttrs><input value={value || ''} onChange={onChange} {...props} /></LocalizedAttrs>}</label>;
}

export default function ProductManagement() {
  const { request, account } = useStaff();
  const [products, setProducts] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(blankProduct);
  const [compositionText, setCompositionText] = useState('[]');
  const [categoryForm, setCategoryForm] = useState({ name: '', hindiName: '', slug: '', sort: 0, status: 'active' });
  const [editingCategory, setEditingCategory] = useState('');
  const [filters, setFilters] = useState({ q: '', category: '', status: '' });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const mayCreate = account.permissions.includes('products.create');
  const mayUpdate = account.permissions.includes('products.update');
  const mayDelete = account.permissions.includes('products.delete');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), page: String(page), limit: '50' });
      const [productResult, categoryResult] = await Promise.all([
        request(`admin/products?${params}`),
        request('admin/products/categories'),
      ]);
      setProducts(productResult.products || []);
      setPagination(productResult.pagination);
      setCategories(categoryResult.categories || []);
      setError('');
    } catch (loadError) { setError(loadError.message); }
  }, [filters, page, request]);
  useEffect(() => { void load(); }, [load]);

  function setField(field, value) { setForm(current => ({ ...current, [field]: value })); }
  function startNew() { setEditingId(''); setForm({ ...blankProduct(), category: categories[0]?.slug || '' }); setCompositionText('[]'); setNotice(''); }
  function editProduct(product) {
    setEditingId(product._id);
    const editable = blankProduct();
    for (const field of Object.keys(editable)) if (product[field] !== undefined) editable[field] = product[field];
    editable.ingredientComposition = (product.ingredientComposition || []).map(item => ({ name: item.name, percentage: item.percentage }));
    editable.variants = (product.variants || []).map(variant => ({
      label: variant.label, sku: variant.sku || '', weightGrams: variant.weightGrams ?? '',
      price: variant.price ?? '', mrp: variant.mrp ?? '', stock: variant.stock ?? 0,
      image: variant.image || '', imageCrop: variant.imageCrop || 'full',
    }));
    setForm(editable);
    setCompositionText(JSON.stringify(editable.ingredientComposition || []));
    setNotice('');
  }
  function updateVariant(index, key, value) {
    setForm(current => ({ ...current, variants: current.variants.map((variant, position) => position === index ? { ...variant, [key]: value } : variant) }));
  }
  function addVariant() {
    setForm(current => ({ ...current, variants: [...current.variants, { label: '', sku: '', weightGrams: '', price: '', mrp: '', stock: 0 }] }));
  }

  async function saveProduct(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      let ingredientComposition;
      try { ingredientComposition = JSON.parse(compositionText); }
      catch { throw new Error('Blend composition must be valid JSON.'); }
      const payload = {
        ...form,
        ingredientComposition,
        variants: form.variants.map(variant => ({
          ...variant,
          weightGrams: variant.weightGrams === '' || variant.weightGrams == null ? null : Number(variant.weightGrams),
          price: variant.price === '' || variant.price == null ? null : Number(variant.price),
          mrp: variant.mrp === '' || variant.mrp == null ? null : Number(variant.mrp),
          stock: Number(variant.stock || 0),
        })),
      };
      const result = await request(editingId ? `admin/products/${editingId}` : 'admin/products', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      setNotice(editingId ? 'Product updated.' : 'Product created.');
      editProduct(result.product);
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }

  async function changeProduct(product, action) {
    if (action === 'delete' && !window.confirm(`Permanently delete ${product.name}? Products with order history can only be archived.`)) return;
    if (action === 'archive' && !window.confirm(`Archive ${product.name}? It will no longer appear in the shop.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(action === 'delete' ? `admin/products/${product._id}` : `admin/products/${product._id}/archive`, { method: action === 'delete' ? 'DELETE' : 'POST' });
      if (editingId === product._id) startNew();
      setNotice(action === 'delete' ? 'Product deleted.' : 'Product archived.');
      await load();
    } catch (actionError) { setError(actionError.message); }
    finally { setBusy(false); }
  }

  async function saveCategory(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request(editingCategory ? `admin/products/categories/${editingCategory}` : 'admin/products/categories', {
        method: editingCategory ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...categoryForm, sort: Number(categoryForm.sort) }),
      });
      setCategoryForm({ name: '', hindiName: '', slug: '', sort: 0, status: 'active' });
      setEditingCategory('');
      setNotice('Category saved.');
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setBusy(false); }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete category ${category.name}?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`admin/products/categories/${category._id}`, { method: 'DELETE' });
      setNotice('Category deleted.');
      await load();
    } catch (actionError) { setError(actionError.message); }
    finally { setBusy(false); }
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('admin/products/import.csv', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text() });
      setNotice(`CSV import complete: ${result.counts.inserted} inserted, ${result.counts.updated} updated, ${result.counts.skipped} skipped, ${result.counts.failed} failed.`);
      if (result.errors?.length) setError(result.errors.slice(0, 5).map(item => `Row ${item.row}: ${item.message}`).join(' '));
      await load();
    } catch (importError) { setError(importError.message); }
    finally { setBusy(false); }
  }

  async function exportCsv() {
    setBusy(true); setError('');
    try {
      const response = await fetch(apiUrl('admin/products/export.csv'), { credentials: 'include', headers: { Accept: 'text/csv', 'X-Request-ID': crypto.randomUUID() } });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || `CSV export failed with HTTP ${response.status}.`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = 'son-masala-products.csv'; link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) { setError(exportError.message); }
    finally { setBusy(false); }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setFilters(current => ({ ...current, q: search.trim() }));
  }
  function updateFilter(key, value) { setPage(1); setFilters(current => ({ ...current, [key]: value })); }

  return <section className="catalog-admin">
    <div className="staff-page-heading"><h1><Text>{"Product catalogue"}</Text></h1><div className="staff-actions">
      {mayCreate && <button className="button button-small" onClick={startNew}><Text>{"Add product"}</Text></button>}
      <button className="button button-outline button-small" disabled={busy} onClick={exportCsv}><Text>{"Export CSV"}</Text></button>
      {mayUpdate && <label className="button button-outline button-small file-button"><Text>{"Import CSV"}</Text><input type="file" accept=".csv,text/csv" disabled={busy} onChange={importCsv} /></label>}
    </div></div>
    {error && <p role="alert" className="form-error"><Text error>{error}</Text></p>}
    {notice && <p role="status" className="staff-notice"><Text>{notice}</Text></p>}

    <div className="shop-toolbar">
      <form onSubmit={submitSearch}><label><Text>{"Search"}</Text><LocalizedAttrs><input value={search} onChange={event => setSearch(event.target.value)} maxLength={80} placeholder="Name, SKU, or slug" /></LocalizedAttrs></label><button className="button button-small"><Text>{"Search"}</Text></button></form>
      <label className="category-filter"><Text>{"Category"}</Text><LocalizedAttrs><select value={filters.category} onChange={event => updateFilter('category', event.target.value)}><option value=""><Text>{"All categories"}</Text></option>{categories.map(category => <option value={category.slug} key={category._id}>{category.name}</option>)}</select></LocalizedAttrs></label>
      <label className="category-filter"><Text>{"Status"}</Text><LocalizedAttrs><select value={filters.status} onChange={event => updateFilter('status', event.target.value)}><option value=""><Text>{"All statuses"}</Text></option>{['draft', 'published', 'archived'].map(status => <option key={status}>{status}</option>)}</select></LocalizedAttrs></label>
    </div>

    <div className="staff-table-scroll"><table className="staff-table"><thead><tr><th><Text>{"Product"}</Text></th><th><Text>{"SKU / category"}</Text></th><th><Text>{"Status / packs"}</Text></th><th><Text>{"Actions"}</Text></th></tr></thead><tbody>
      {products?.map(product => <tr key={product._id}><td><strong>{product.name}</strong><br /><span lang="hi">{product.hindiName}</span></td><td>{product.sku || '—'}<br />{product.category} / {product.subcategory || '—'}</td><td>{product.status}<br />{product.variants?.length || 0} pack(s)</td><td className="staff-actions">
        {mayUpdate && <button className="text-link" onClick={() => editProduct(product)}><Text>{"Edit"}</Text></button>}
        {mayUpdate && product.status !== 'archived' && <button className="text-link" onClick={() => changeProduct(product, 'archive')}><Text>{"Archive"}</Text></button>}
        {mayDelete && <button className="text-link danger-link" onClick={() => changeProduct(product, 'delete')}><Text>{"Delete"}</Text></button>}
      </td></tr>)}
      {products?.length === 0 && <tr><td colSpan="4"><Text>{"No products match these filters."}</Text></td></tr>}
      {!products && <tr><td colSpan="4" role="status"><Text>{"Loading products…"}</Text></td></tr>}
    </tbody></table></div>
    {pagination?.pages > 1 && <div className="pagination"><button disabled={pagination.page <= 1} onClick={() => setPage(value => value - 1)}><Text>{"Previous"}</Text></button><span><Text>{"Page "}</Text>{pagination.page}<Text>{" of "}</Text>{pagination.pages}<Text>{" · "}</Text>{pagination.total}<Text>{" products"}</Text></span><button disabled={pagination.page >= pagination.pages} onClick={() => setPage(value => value + 1)}><Text>{"Next"}</Text></button></div>}

    {(editingId || mayCreate) && <form className="catalog-product-form" onSubmit={saveProduct}>
      <h2><Text>{editingId ? 'Edit product' : 'Add product'}</Text></h2>
      <div className="staff-form-grid">
        <ProductFormField label="Product name (English)" value={form.name} onChange={event => setField('name', event.target.value)} required maxLength="160" />
        <ProductFormField label="Product name (Hindi)" value={form.hindiName} onChange={event => setField('hindiName', event.target.value)} maxLength="160" />
        <ProductFormField label="Product SKU" value={form.sku} onChange={event => setField('sku', event.target.value.toUpperCase())} maxLength="80" />
        <ProductFormField label="Slug" value={form.slug} onChange={event => setField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))} required maxLength="160" />
        <label className="staff-form-field"><Text>{"Category"}</Text><LocalizedAttrs><select value={form.category} onChange={event => setField('category', event.target.value)} required><option value=""><Text>{"Select a category"}</Text></option>{categories.filter(item => item.status !== 'archived').map(item => <option key={item._id} value={item.slug}>{item.name}</option>)}</select></LocalizedAttrs></label>
        <ProductFormField label="Subcategory" value={form.subcategory} onChange={event => setField('subcategory', event.target.value)} maxLength="120" />
        <ProductFormField label="Description (English)" value={form.description} onChange={event => setField('description', event.target.value)} textarea rows="3" />
        <ProductFormField label="Description (Hindi)" value={form.hindiDescription} onChange={event => setField('hindiDescription', event.target.value)} textarea rows="3" />
        <ProductFormField label="Ingredients (one per line)" value={(form.ingredients || []).join('\n')} onChange={event => setField('ingredients', lines(event.target.value))} textarea rows="3" />
        <ProductFormField label="Raw spice ingredients (one per line)" value={(form.rawSpiceIngredients || []).join('\n')} onChange={event => setField('rawSpiceIngredients', lines(event.target.value))} textarea rows="3" />
        <ProductFormField label="Blend composition JSON (verified only)" value={compositionText} onChange={event => setCompositionText(event.target.value)} textarea rows="3" />
        <label className="staff-form-field"><Text>{"Verified against manufacturing specifications"}</Text><LocalizedAttrs><input type="checkbox" checked={form.ingredientCompositionVerified} onChange={event => setField('ingredientCompositionVerified', event.target.checked)} /></LocalizedAttrs></label>
        <ProductFormField label="Verified specification source" value={form.ingredientCompositionSource} onChange={event => setField('ingredientCompositionSource', event.target.value)} maxLength="240" />
        <ProductFormField label="Botanical name" value={form.botanicalName} onChange={event => setField('botanicalName', event.target.value)} maxLength="240" />
        <ProductFormField label="Origin (verified only)" value={form.origin} onChange={event => setField('origin', event.target.value)} maxLength="240" />
        <label className="staff-form-field"><Text>{"Origin verification"}</Text><LocalizedAttrs><select value={form.originVerificationStatus} onChange={event => setField('originVerificationStatus', event.target.value)}><option value="unknown">Not verified</option><option value="verified">Verified</option></select></LocalizedAttrs></label>
        <ProductFormField label="Origin verification source" value={form.originVerificationSource} onChange={event => setField('originVerificationSource', event.target.value)} maxLength="240" />
        <ProductFormField label="Pack-size options (comma separated)" value={(form.packSizeOptions || []).join(', ')} onChange={event => setField('packSizeOptions', csvList(event.target.value))} />
        <ProductFormField label="Available pack sizes (comma separated)" value={(form.availablePackSizes || []).join(', ')} onChange={event => setField('availablePackSizes', csvList(event.target.value))} />
        <ProductFormField label="Usage instructions" value={form.usageInstructions} onChange={event => setField('usageInstructions', event.target.value)} textarea rows="3" />
        <ProductFormField label="Storage instructions" value={form.storageInstructions} onChange={event => setField('storageInstructions', event.target.value)} textarea rows="3" />
        <ProductFormField label="Shelf life (verified only)" value={form.shelfLife} onChange={event => setField('shelfLife', event.target.value)} maxLength="120" />
        <label className="staff-form-field"><Text>{"Shelf-life verification"}</Text><LocalizedAttrs><select value={form.shelfLifeVerificationStatus} onChange={event => setField('shelfLifeVerificationStatus', event.target.value)}><option value="unknown">Not verified</option><option value="verified">Verified</option></select></LocalizedAttrs></label>
        <ProductFormField label="Shelf-life verification source" value={form.shelfLifeVerificationSource} onChange={event => setField('shelfLifeVerificationSource', event.target.value)} maxLength="240" />
        <ProductFormField label="Allergen information" value={form.allergenInformation} onChange={event => setField('allergenInformation', event.target.value)} textarea rows="2" />
        <ProductFormField label="Product image URL" value={form.image} onChange={event => setField('image', event.target.value)} maxLength="1000" />
        <ProductFormField label="Additional image URLs (one per line)" value={(form.images || []).join('\n')} onChange={event => setField('images', lines(event.target.value))} textarea rows="3" />
        <label className="staff-form-field"><Text>{"Product status"}</Text><LocalizedAttrs><select value={form.status} onChange={event => setField('status', event.target.value)}>{['draft', 'published', 'archived'].map(status => <option key={status}>{status}</option>)}</select></LocalizedAttrs></label>
        <label className="staff-form-field"><input type="checkbox" checked={form.catalogVisible} onChange={event => setField('catalogVisible', event.target.checked)} /><Text>Show on the storefront, including before pricing is ready</Text></label>
        <label className="staff-form-field"><Text>{"Inventory state"}</Text><LocalizedAttrs><select value={form.inventoryStatus} onChange={event => setField('inventoryStatus', event.target.value)}><option value="unknown">Unknown</option><option value="known">Known</option></select></LocalizedAttrs></label>
      </div>
      <h3><Text>{"Pack sizes, prices and stock"}</Text></h3>
      <p className="staff-help"><Text>{"Leave price and MRP blank until verified. Unpriced packs cannot be purchased."}</Text></p>
      {(form.variants || []).map((variant, index) => <div className="catalog-variant-row" key={`${variant.sku || 'new'}-${index}`}>
        <ProductFormField label="Pack label" value={variant.label} onChange={event => updateVariant(index, 'label', event.target.value)} required />
        <ProductFormField label="Pack SKU" value={variant.sku} onChange={event => updateVariant(index, 'sku', event.target.value.toUpperCase())} />
        <ProductFormField label="Weight (g)" type="number" min="1" value={variant.weightGrams ?? ''} onChange={event => updateVariant(index, 'weightGrams', event.target.value)} />
        <ProductFormField label="Selling price (INR)" type="number" min="0" step="0.01" value={variant.price ?? ''} onChange={event => updateVariant(index, 'price', event.target.value)} />
        <ProductFormField label="MRP (INR)" type="number" min="0" step="0.01" value={variant.mrp ?? ''} onChange={event => updateVariant(index, 'mrp', event.target.value)} />
        <ProductFormField label="Stock" type="number" min="0" max="10000000" value={variant.stock ?? 0} onChange={event => updateVariant(index, 'stock', event.target.value)} />
        <button type="button" className="text-link danger-link" onClick={() => setField('variants', form.variants.filter((_, position) => position !== index))}><Text>{"Remove pack"}</Text></button>
      </div>)}
      <div className="staff-actions"><button type="button" className="button button-outline button-small" onClick={addVariant}><Text>{"Add pack size"}</Text></button><button className="button button-small" disabled={busy || (!editingId && !mayCreate) || (editingId && !mayUpdate)}><Text>{busy ? 'Saving…' : 'Save product'}</Text></button>{editingId && <button type="button" className="button button-outline button-small" onClick={startNew}><Text>{"Cancel"}</Text></button>}</div>
    </form>}

    <section className="catalog-category-admin">
      <h2><Text>{"Categories"}</Text></h2>
      {(mayCreate || editingCategory) && <form className="staff-inline-form" onSubmit={saveCategory}>
        <ProductFormField label="Category name" value={categoryForm.name} onChange={event => setCategoryForm(current => ({ ...current, name: event.target.value }))} required />
        <ProductFormField label="Hindi name" value={categoryForm.hindiName} onChange={event => setCategoryForm(current => ({ ...current, hindiName: event.target.value }))} />
        <ProductFormField label="Category slug" value={categoryForm.slug} onChange={event => setCategoryForm(current => ({ ...current, slug: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }))} required />
        <ProductFormField label="Sort order" type="number" min="0" value={categoryForm.sort} onChange={event => setCategoryForm(current => ({ ...current, sort: event.target.value }))} />
        <label className="staff-form-field"><Text>{"Category status"}</Text><LocalizedAttrs><select value={categoryForm.status} onChange={event => setCategoryForm(current => ({ ...current, status: event.target.value }))}><option value="active">Active</option><option value="archived">Archived</option></select></LocalizedAttrs></label>
        <button className="button button-small" disabled={busy || (!editingCategory && !mayCreate) || (editingCategory && !mayUpdate)}><Text>{"Save category"}</Text></button>
      </form>}
      <div className="staff-actions category-list">{categories.map(category => <div key={category._id}><strong>{category.name}</strong> <span>{category.slug} · {category.status || 'active'}</span>
        {mayUpdate && <button className="text-link" onClick={() => { setEditingCategory(category._id); setCategoryForm({ name: category.name, hindiName: category.hindiName || '', slug: category.slug, sort: category.sort || 0, status: category.status || 'active' }); }}>Edit</button>}
        {mayDelete && <button className="text-link danger-link" onClick={() => removeCategory(category)}>Delete</button>}
      </div>)}</div>
    </section>
  </section>;
}
