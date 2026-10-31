const { test, expect } = require('@playwright/test');

async function ordersApi(page, { canUpdate = true } = {}) {
  const records = [2, 20].map((count, index) => ({
    _id: `order-${index + 1}`, publicId: `SON-2026-000${index + 1}`,
    paymentStatus: 'PENDING', fulfillmentStatus: 'PLACED',
    delivery: { fullName: `Customer ${index + 1}`, address: '12 Market Road', city: 'Varanasi', pincode: '221001', phone: '9876543210', email: `customer${index + 1}@example.com` },
    items: Array.from({ length: count }, (_, item) => ({ variantId: `variant-${item}`, name: `Spice ${item + 1}`, label: '100 g', quantity: item + 1, lineTotalPaise: 12500 * (item + 1) })),
    totals: { totalPaise: index ? 2625000 : 37500 },
  }));
  const writes = [];
  await page.addInitScript(() => {
    window.copiedOrderIds = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => window.copiedOrderIds.push(value) } });
  });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    let body = { success: true };
    if (path === 'admin/auth/me') body = { success: true, account: { fullName: 'Order Administrator', adminId: 'ADM-ORDERS', role: 'ADMIN', permissions: ['orders.view', ...(canUpdate ? ['orders.update'] : [])] }, csrfToken: 'test-csrf', session: { expiresAt: '2099-01-01T00:00:00Z' } };
    if (path === 'admin/orders') body = { success: true, records };
    if (route.request().method() === 'PATCH') {
      const changes = route.request().postDataJSON();
      writes.push({ path, changes });
      Object.assign(records.find(record => path.endsWith(record._id)), changes);
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/admin/modules/orders');
  await expect(page.locator('.staff-order-card')).toHaveCount(2);
  return writes;
}

test('shared desktop cards align controls and footer for two versus twenty products', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const writes = await ordersApi(page);
  const cards = page.locator('.staff-order-card');
  const geometry = await cards.evaluateAll(elements => elements.map(card => {
    const cardRect = card.getBoundingClientRect();
    const rect = selector => { const value = card.querySelector(selector).getBoundingClientRect(); return { x: value.x - cardRect.x, y: value.y - cardRect.y, width: value.width, height: value.height }; };
    return { width: cardRect.width, height: cardRect.height, order: rect('select'), payment: rect('label:nth-of-type(2) select'), footer: rect('.staff-order-card-footer'), save: rect('.staff-save-button') };
  }));
  expect(geometry[0]).toEqual(geometry[1]);
  await expect(cards.nth(0).locator('.staff-order-product:visible')).toHaveCount(2);
  await expect(cards.nth(1).locator('.staff-order-product:visible')).toHaveCount(3);
  await cards.nth(1).getByText('View All Products', { exact: false }).click();
  await expect(cards.nth(1).locator('.staff-order-product:visible')).toHaveCount(20);
  const expandedControlHeight = await cards.nth(1).locator('select').first().evaluate(element => element.getBoundingClientRect().height);
  expect(expandedControlHeight).toBe(52);
  await cards.nth(1).getByText('View All Products', { exact: false }).click();
  await expect(cards.nth(1).locator('.staff-order-product:visible')).toHaveCount(3);
  await cards.nth(0).getByRole('button', { name: 'Copy order ID SON-2026-0001' }).click();
  await expect(cards.nth(0).getByText('Copied', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.copiedOrderIds)).toEqual(['SON-2026-0001']);
  expect(writes).toEqual([]);
  await page.screenshot({ path: 'test-results/admin-orders-desktop.png', fullPage: true });
});

test('save feedback, drafts and payment confirmation stay independent per order', async ({ page }) => {
  const writes = await ordersApi(page);
  const first = page.locator('.staff-order-card').nth(0), second = page.locator('.staff-order-card').nth(1);
  await first.getByRole('combobox', { name: 'Order status', exact: true }).selectOption('CONFIRMED');
  await second.getByRole('combobox', { name: 'Order status', exact: true }).selectOption('PACKED');
  await first.getByRole('button', { name: 'Save Changes' }).click();
  await expect(first.getByRole('status')).toHaveText('Saved successfully');
  await expect(second.getByRole('status')).toHaveCount(0);
  await expect(second.getByRole('combobox', { name: 'Order status', exact: true })).toHaveValue('PACKED');
  expect(writes).toEqual([{ path: 'admin/orders/order-1', changes: { fulfillmentStatus: 'CONFIRMED' } }]);
  await second.getByRole('combobox', { name: 'Payment status', exact: true }).selectOption('PAID');
  await second.getByLabel('Payment received and verified').check();
  await second.getByRole('button', { name: 'Save Changes' }).click();
  await expect(second.getByRole('status')).toHaveText('Saved successfully');
  expect(writes[1]).toEqual({ path: 'admin/orders/order-2', changes: { fulfillmentStatus: 'PACKED', paymentStatus: 'PAID', paymentConfirmed: true } });
  await expect(first.getByLabel('Order status: Confirmed', { exact: true })).toBeVisible();
});

test('mobile sections stack without overflow and read-only controls stay protected', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ordersApi(page, { canUpdate: false });
  const card = page.locator('.staff-order-card').nth(1);
  await expect(card.getByRole('combobox', { name: 'Order status', exact: true })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Save Changes' })).toHaveCount(0);
  await card.getByText('View All Products', { exact: false }).click();
  await expect(card.locator('.staff-order-product:visible')).toHaveCount(20);
  const layout = await card.evaluate(element => {
    const customer = element.querySelector('.staff-order-party').getBoundingClientRect();
    const products = element.querySelector('.staff-order-items').getBoundingClientRect();
    const controls = element.querySelector('.staff-order-controls').getBoundingClientRect();
    return { stacked: customer.bottom <= products.top && products.bottom <= controls.top, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(layout).toEqual({ stacked: true, overflow: false });
  await page.screenshot({ path: 'test-results/admin-orders-mobile.png', fullPage: true });
});
