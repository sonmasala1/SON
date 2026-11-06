// Browser-only response interception. No credentials, OTP delivery, store writes or seed scripts.
const { test, expect } = require('@playwright/test');
const { inspect } = require('../scripts/audit-responsive');
const widths = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440];
let product;
test.beforeAll(async () => {
  const response = await fetch('http://127.0.0.1:5000/api/v1/products?limit=1', { signal: AbortSignal.timeout(20000) });
  expect(response.ok).toBeTruthy();
  product = (await response.json()).products[0];
  expect(product).toBeTruthy();
});

for (const width of widths) test(`protected layouts, menus and review form at ${width}px`, async ({ page }) => {
  test.setTimeout(180000);
  const errors = [], writes = [];
  let reviewPayload;
  const context = page.context();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  const user = { id: 'browser-only', name: 'Responsive UI validation account', email: 'responsive@example.invalid', emailVerified: true };
  const item = { _id: 'browser-line', productId: product._id, variantId: String(product.variants[0]._id), slug: product.slug, name: `${product.name} ${product.name} ${product.name}`, hindiName: `${product.hindiName} ${product.hindiName}`, label: product.variants[0].label, image: product.image, quantity: 1, stock: 4, available: true, unitPricePaise: 10000, lineTotalPaise: 10000 };
  const totals = { subtotalPaise: 10000, discountPaise: 0, deliveryPaise: 4900, totalPaise: 14900 };
  const cart = { items: [item], totals, count: 1, valid: true, checkoutEnabled: true, version: 'browser-only' };
  const delivery = { fullName: user.name, email: user.email, phone: '9876543210', address: 'Browser-only layout validation address', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
  const order = { _id: 'browser-order', id: 'BROWSER-ONLY-LAYOUT-VALIDATION', publicId: 'BROWSER-ONLY-LAYOUT-VALIDATION', items: [item], totals, delivery, createdAt: '2026-10-31T12:00:00Z', paymentMode: 'PAY_LATER', paymentStatus: 'PENDING', fulfillmentStatus: 'PLACED' };
  const permissions = ['dashboard.view', 'products.view', 'inventory.view', 'inventory.update', 'reviews.view', 'reviews.moderate', 'orders.view', 'orders.update', 'customers.view', 'payments.view', 'shipping.view', 'analytics.view'];
  await context.route('**/api/v1/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.replace('/api/v1/', '');
    let data = { success: true }, status = 200;
    if (request.method() !== 'GET') {
      writes.push(endpoint);
      // Never forward a write to any backend.
      if (endpoint === 'checkout/preview') data.cart = cart;
      else if (endpoint === 'reviews') { reviewPayload = request.postDataJSON(); status = 201; data.message = 'Thank you. Your review is awaiting moderation.'; }
      else { status = 403; data = { success: false, message: 'Browser audit blocks store mutations.' }; }
    } else if (/^(admin|owner)\/auth\/me$/.test(endpoint)) data = { ...data, account: { fullName: user.name, adminId: 'BROWSER-ONLY', email: user.email, role: 'ADMIN', permissions }, csrfToken: 'browser-only', session: { expiresAt: '2026-11-04T12:00:00Z' } };
    else if (endpoint === 'cart') data = { ...data, user, cart };
    else if (endpoint === 'auth/me') data.user = user;
    else if (endpoint === 'wishlist') data.wishlist = { products: [product], slugs: [product.slug] };
    else if (endpoint === 'auth/orders') data.orders = [order];
    else if (endpoint.startsWith('orders/')) data.order = order;
    else if (endpoint === 'products') data = { ...data, products: [product], pagination: { page: 1, pages: 1, total: 1 } };
    else if (endpoint.startsWith('products/')) data.product = product;
    else if (endpoint === 'categories') data.categories = [];
    else if (endpoint === 'reviews' || endpoint === 'admin/reviews') data.reviews = [];
    else if (/dashboard$/.test(endpoint) || endpoint === 'admin/analytics') data.modules = { orders: { total: 123456, pending: 7 }, inventory: { availableUnits: 123456, lowStock: 2 }, products: { published: 18 }, analytics: { unitsSold: 123456, productSales: [{ _id: 'browser', name: item.name, units: 123456, revenuePaise: 123456789 }], categorySales: [] } };
    else if (endpoint === 'admin/orders') data.records = [order];
    else if (endpoint === 'admin/inventory') data.records = [{ _id: 'browser-only', productId: { name: item.name }, label: item.label, stock: 123456 }];
    else data.records = [];
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const check = async label => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
    expect(await inspect(page), `${label} ${width}px`).toEqual({ overflow: false, offscreen: [], clipped: [], smallTargets: [] });
  };
  for (const locale of ['en', 'hi']) {
    await page.context().addCookies([{ name: 'son_locale', value: locale, url: 'http://localhost:3000' }]);
    for (const [route, selector] of [['/cart', '.cart-item'], ['/checkout', '.delivery-form'], ['/account', '.account-panel'], ['/wishlist', '.product-card'], ['/orders/browser-only', '.confirmation-product'], ['/admin/dashboard', '.staff-metric-grid'], ['/admin/modules/inventory', '.staff-table tbody tr'], ['/admin/modules/orders', '.staff-order-card'], ['/admin/reviews', '.staff-content h1'], [`/product/${product.slug}`, '.review-form']]) {
      // A fresh document avoids a prior dev page's pending RSC reload navigating the next test page.
      await page.close();
      page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await expect(page.locator(selector).first()).toBeVisible({ timeout: 15000 });
      await check(`${locale} ${route}`);
      if (route === '/checkout') {
        for (const [name, value] of Object.entries(delivery)) await page.locator(`[name="${name}"]`).fill(value);
        await page.locator('.delivery-form button[type="submit"]').click();
        await expect(page.locator('.delivery-review')).toBeVisible();
        await check(`${locale} checkout preview`);
      }
      if (route === '/cart') {
        await page.locator('.header-cart').click();
        await expect(page.locator('.cart-drawer')).toBeVisible();
        await check(`${locale} drawer`);
        await page.keyboard.press('Escape');
        await expect(page.locator('.cart-drawer')).toHaveCount(0);
      }
      if (route === '/admin/dashboard') {
        await page.locator('.staff-identity summary').click();
        await check(`${locale} staff profile menu`);
        await page.keyboard.press('Escape');
      }
    }
  }
  // Verify the browser flow using an intercepted response, with zero review persistence.
  await page.locator('.review-rating-stars label').nth(2).click();
  await page.locator('.review-form [name="comment"]').fill('Browser-only validation of the moderation acknowledgement.');
  await page.locator('.review-form button[type="submit"]').click();
  await expect(page.locator('.review-form [role="status"]')).not.toBeEmpty();
  await expect(page.locator('.review-form button[type="submit"]')).toBeDisabled();
  expect(writes.filter(endpoint => endpoint === 'reviews')).toHaveLength(1);
  expect(reviewPayload.rating).toBe(3);
  expect(reviewPayload).not.toHaveProperty('approved');
  expect(reviewPayload).not.toHaveProperty('verifiedPurchase');
  if (width === 320) {
    await page.locator('.menu-toggle').click();
    await expect(page.locator('.main-nav')).toBeVisible();
    await check('expanded mobile menu');
    await page.keyboard.press('Escape');
    await expect(page.locator('.main-nav')).toBeHidden();
    await page.locator('.header-search-toggle').click();
    await expect(page.locator('.header-search input')).toBeVisible();
    await check('expanded mobile search');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const text = [...document.querySelectorAll('body *')].filter(element => !element.closest('svg') && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
      const sizes = text.map(element => parseFloat(getComputedStyle(element).fontSize));
      text.forEach((element, index) => { element.style.fontSize = `${sizes[index] * 1.5}px`; element.style.lineHeight = '1.6'; });
    });
    await check('Hindi text enlarged to 150%');
  }
  expect(errors).toEqual([]);
});
