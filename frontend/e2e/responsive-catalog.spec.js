const { test, expect } = require('@playwright/test');
const { inspect } = require('../scripts/audit-responsive');

test('catalogue tables and product/category forms reflow without store mutations', async ({ context }) => {
  test.setTimeout(180000);
  const result = await fetch('http://127.0.0.1:5000/api/v1/products?limit=1', { signal: AbortSignal.timeout(20000) });
  const product = (await result.json()).products[0];
  const errors = [], writes = [];
  await context.route('**/api/v1/**', async route => {
    const endpoint = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    let data = { success: true };
    if (route.request().method() !== 'GET') { writes.push(endpoint); return route.abort('blockedbyclient'); }
    if (endpoint.endsWith('/auth/me')) data = { ...data, account: { fullName: 'Browser-only catalogue validation', adminId: 'BROWSER-ONLY', email: 'catalog@example.invalid', role: 'ADMIN', permissions: ['dashboard.view', 'products.view', 'products.create', 'products.update'] }, csrfToken: 'browser-only', session: { expiresAt: '2026-11-04T12:00:00Z' } };
    else if (endpoint === 'admin/products/categories') data.categories = [{ _id: 'browser-only', name: 'Blended Masalas', slug: 'blended-masalas', status: 'active' }];
    else if (endpoint === 'admin/products') data = { ...data, products: [product], pagination: { page: 1, pages: 1, total: 1 } };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  for (const width of [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440]) {
    for (const locale of ['en', 'hi']) {
      await context.addCookies([{ name: 'son_locale', value: locale, url: 'http://localhost:3000' }]);
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/modules/products', { waitUntil: 'networkidle' });
      await expect(page.locator('.catalog-product-form')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(await inspect(page), `${locale} catalogue at ${width}px`).toEqual({ overflow: false, offscreen: [], clipped: [], smallTargets: [] });
      // Open existing pack fields locally; never submit any form.
      await page.locator('.staff-table tbody tr').first().getByRole('button').first().click();
      await expect(page.locator('.catalog-variant-row').first()).toBeVisible();
      expect(await inspect(page), `${locale} pack fields at ${width}px`).toEqual({ overflow: false, offscreen: [], clipped: [], smallTargets: [] });
      await page.close();
    }
  }
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
