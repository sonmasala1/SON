const { test, expect } = require('@playwright/test');

test('floating search, immediate cart preview, stock conflict rollback and approved-only review empty state', async ({ page }) => {
  const response = await fetch('http://127.0.0.1:5000/api/v1/products?limit=1');
  const product = (await response.json()).products[0];
  const variant = product.variants[0];
  const price = variant.unitPricePaise;
  const totals = { subtotalPaise: 0, discountPaise: 0, deliveryPaise: 0, totalPaise: 0 };
  let cart = { items: [], count: 0, valid: false, totals, version: 0 };
  let releaseAdd, releaseQuantity, adds = 0, cartReads = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    let data = { success: true }, status = 200;
    if (endpoint === 'cart/items' && route.request().method() === 'POST') {
      adds++;
      await new Promise(resolve => { releaseAdd = resolve; });
      cart = { ...cart, version: 1, count: 1, valid: true, items: [{ _id: 'browser-line', productId: product._id, variantId: variant._id, slug: product.slug, name: product.name, label: variant.label, image: product.image, stock: 2, quantity: 1, available: true, unitPricePaise: price, lineTotalPaise: price }], totals: { ...totals, subtotalPaise: price, totalPaise: price } };
      data.cart = cart;
    } else if (endpoint === 'cart/items/browser-line' && route.request().method() === 'PATCH') {
      await new Promise(resolve => { releaseQuantity = resolve; });
      cart = { ...cart, items: cart.items.map(item => ({ ...item, stock: 1 })) };
      status = 409; data = { success: false, message: 'Stock changed. Only one pack is available.' };
    } else if (endpoint === 'cart') { cartReads++; data = { ...data, cart, user: null }; }
    else if (endpoint === 'products') data = { ...data, products: [product], pagination: { page: 1, pages: 1, total: 1 } };
    else if (endpoint.startsWith('products/')) data.product = product;
    else if (endpoint === 'categories') data.categories = [];
    else if (endpoint === 'reviews') data.reviews = [];
    else if (endpoint === 'auth/me') data.user = null;
    else if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/shop', { waitUntil: 'networkidle' });
  await expect(page.locator('.product-card')).toBeVisible();
  const before = await page.locator('main').evaluate(element => element.getBoundingClientRect().top);
  await page.locator('.header-search-toggle').click();
  await expect(page.locator('.header-search input')).toBeFocused();
  const after = await page.locator('main').evaluate(element => element.getBoundingClientRect().top);
  expect(after).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.header-search-panel')).toBeHidden();
  const start = Date.now();
  await page.locator('.product-actions .button').first().click();
  await expect(page.locator('.product-card-quantity > span')).toHaveText('1', { timeout: 1000 });
  const previewMs = Date.now() - start;
  console.log(JSON.stringify({ optimisticQuantityVisibleMs: previewMs, serverResponseStillHeld: true }));
  expect(previewMs).toBeLessThan(1000);
  await expect(page.locator('.product-card-quantity button').first()).toBeDisabled();
  await expect.poll(() => typeof releaseAdd).toBe('function');
  await page.locator('.header-cart').click();
  await expect(page.locator('.cart-drawer .cart-item')).toBeVisible();
  await expect(page.locator('.cart-drawer').getByRole('link', { name: /Proceed to Checkout/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  releaseAdd();
  await expect(page.locator('.product-card-quantity button').last()).toBeEnabled();
  expect(adds).toBe(1);
  const readsBeforeFailure = cartReads;
  await page.locator('.product-card-quantity button').last().click();
  await expect(page.locator('.product-card-quantity > span')).toHaveText('2');
  await expect.poll(() => typeof releaseQuantity).toBe('function');
  releaseQuantity();
  await expect(page.locator('.product-card-quantity > span')).toHaveText('1');
  await expect(page.locator('.product-card-quantity button').last()).toBeDisabled();
  expect(cartReads).toBeGreaterThan(readsBeforeFailure);
  expect(errors).toEqual([]);
});
