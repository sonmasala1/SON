const { test, expect, customerSignIn } = require('./fixtures');

test('full-width homepage has only the requested shopping sections and product prices', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: 'Featured Masalas' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'All Masala Products' })).toBeVisible();
  await expect(page.getByText('Be the first to review SON MASALA.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Special Offers' })).not.toBeVisible();
  await expect(page.getByText('YOUR EVERYDAY ESSENTIALS')).not.toBeVisible();
  await expect(page.locator('.story-section,.why-section,.collection-grid,.recipes-section,.newsletter')).toHaveCount(0);
  expect(await page.locator('.hero').evaluate(element => element.getBoundingClientRect().width)).toBe(1920);
  expect(await page.locator('header').evaluate(element => element.getBoundingClientRect().width)).toBe(1920);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const featured = page.locator('.shopping-featured');
  await expect(featured.getByText('₹99.00', { exact: true })).toBeVisible();
  await expect(featured.getByText('₹89.00', { exact: true })).toBeVisible();
  await expect(featured.getByText('₹119.00', { exact: true })).toBeVisible();
  await expect(featured.getByText(/^(DEMO|SAMPLE) PRODUCT$/)).toHaveCount(0);
  await page.screenshot({ path: '../artifacts/shopping-home-large-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`shopping layout is responsive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(6);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (width === 390) { await page.screenshot({ path: '../artifacts/shopping-home-mobile.png', fullPage: true }); await page.getByRole('button', { name: 'Open menu' }).click(); await page.getByRole('navigation').getByRole('link', { name: 'About', exact: true }).click(); await expect(page).toHaveURL(/\/about$/); }
  });
}

test('search, category filter, and product detail requests use real MongoDB data', async ({ page }) => {
  await page.goto('/shop');
  await page.getByRole('searchbox', { name: 'Search products' }).fill('Haldi');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'View Details' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Haldi Powder' })).toBeVisible();
  await expect(page.getByText('SKU: DEMO-HALDI-100')).toBeVisible();
  await page.goto('/shop?category=whole-spices'); await expect(page.getByRole('heading', { name: 'No products match this selection.' })).toBeVisible();
});

test('cart drawer, count, quantity, refresh persistence, and removal work', async ({ page }) => {
  await page.goto('/shop'); await expect(page.locator('.product-card')).toHaveCount(3);
  const product = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: 'Haldi Powder', exact: true }) });
  await product.getByRole('button', { name: 'Add to Cart' }).click();
  const drawer = page.getByRole('dialog', { name: 'Your shopping bag' }); await expect(drawer).toBeVisible();
  await expect(drawer.getByText('₹148.00', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Increase Haldi Powder' }).click();
  await expect(drawer.getByText('₹247.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close shopping bag' }).click();
  await expect(page.getByRole('button', { name: 'Shopping cart, 2 items' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('button', { name: 'Shopping cart, 2 items' })).toBeVisible();
  await page.goto('/cart'); await expect(page.getByText('₹247.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Decrease Haldi Powder' }).click(); await expect(page.getByText('₹148.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Haldi Powder' }).click(); await expect(page.getByRole('heading', { name: 'Your bag is waiting for a little flavour.' })).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('fullName');
});

test('wishlist persists and product API error has a working retry', async ({ page }) => {
  await page.goto('/login'); await customerSignIn(page); await expect(page).toHaveURL(/\/account$/);
  await page.goto('/shop'); await expect(page.locator('.product-card')).toHaveCount(3);
  await page.getByRole('button', { name: 'Save Haldi Powder to wishlist' }).click();
  await page.goto('/wishlist'); await expect(page.locator('.product-card')).toHaveCount(1); await page.reload(); await expect(page.locator('.product-card')).toHaveCount(1);
  await page.route('**/api/v1/products?**', route => route.abort()); await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Our spice shelf needs a moment.' }).first()).toBeVisible();
  await page.unroute('**/api/v1/products?**');
  // Restore the worker API forwarding after removing the temporary failure route.
  await page.reload(); await expect(page.locator('.product-card')).toHaveCount(6);
});
