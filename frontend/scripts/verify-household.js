const { chromium, expect } = require('@playwright/test');
const { mkdirSync } = require('node:fs');

// Browser smoke check against the local development storefront and its real API.
async function verify() {
  const base = process.env.VERIFY_STORE_URL || 'http://localhost:3000';
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local storefront for this sample-data check.');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/product/haldi-powder`);
    await expect(page.locator('.variant-pill')).toHaveCount(3, { timeout: 30000 });
    for (const [label, crop, price] of [['100 g', 'full', '\u20b999.00'], ['250 g', 'left-half', '\u20b9247.50'], ['500 g', 'right-half', '\u20b9495.00']]) {
      await page.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator('.product-image [data-image-crop]')).toHaveAttribute('data-image-crop', crop);
      await expect(page.locator('.price-row strong')).toHaveText(price);
    }
    const added = page.waitForResponse(response => response.url().endsWith('/cart/items') && response.request().method() === 'POST', { timeout: 25000 });
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click();
    const response = await added;
    expect(response.status()).toBe(200);
    const { cart } = await response.json();
    expect(cart.items[0].label).toBe('500 g');
    expect(cart.items[0].imageCrop).toBe('right-half');
    await expect(page.getByRole('dialog', { name: 'Your shopping bag' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Remove Haldi Powder', exact: true }).click();
    await page.getByRole('button', { name: 'Close shopping bag' }).click();
    await page.getByRole('button', { name: 'Show 250 g image', exact: true }).click();
    await expect(page.getByRole('button', { name: '250 g', exact: true })).toHaveAttribute('aria-pressed', 'true');
    mkdirSync('verification', { recursive: true });
    await page.screenshot({ path: 'verification/household-size-gallery-desktop.png', fullPage: true });
    await page.goto(`${base}/product/garam-masala`);
    await page.getByRole('button', { name: '100 g', exact: true }).click();
    await expect(page.locator('.price-row strong')).toHaveText('\u20b9145.00');
    await page.getByRole('button', { name: '500 g', exact: true }).click();
    await expect(page.locator('.price-row strong')).toHaveText('\u20b9599.00');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/product/rai`);
    await expect(page.locator('.variant-pill')).toHaveCount(3);
    await page.getByRole('button', { name: 'Show 500 g image', exact: true }).click();
    await expect(page.locator('.product-image [data-image-crop]')).toHaveAttribute('data-image-crop', 'right-third');
    await expect.poll(() => page.locator('.product-image img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'verification/household-size-gallery-mobile.png', fullPage: true });
    expect(errors).toEqual([]);
    console.log('Passed: size images/prices, thumbnail selection, selected pack in cart, removal, existing commercial prices, mobile gallery, no overflow or runtime errors.');
  } finally { await browser.close(); }
}

verify().catch(error => { console.error(error.message); process.exitCode = 1; });
