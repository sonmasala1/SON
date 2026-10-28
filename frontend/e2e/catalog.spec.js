const { test, expect, customerSignIn } = require('./fixtures');
const delivery = { fullName: 'Demo Shopper', email: 'demo@example.com', phone: '9876543210', address: '123 Sample Street', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
for (const [button, heading, status] of [
  ['Simulate Successful Payment', 'Your Demo Order Has Been Placed!', 'PAID_DEMO'],
  ['Simulate Failed Payment', 'Demo payment failed.', 'FAILED'],
  ['Simulate Cancelled Payment', 'Demo payment cancelled.', 'CANCELLED'],
]) {
  test(`complete checkout: ${status}`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/shop'); await expect(page.locator('.product-card')).toHaveCount(3);
    await page.locator('.product-card').filter({ has: page.getByRole('heading', { name: 'Haldi Powder', exact: true }) }).getByRole('button', { name: 'Buy Now' }).click();
    await expect(page).toHaveURL(/next=%2Fcheckout/); await customerSignIn(page); await expect(page).toHaveURL(/\/checkout$/); await expect(page.getByRole('heading', { name: 'Delivery details' })).toBeVisible();
    await page.getByRole('button', { name: 'Review Order' }).click(); await expect(page.getByRole('heading', { name: 'Delivery details' })).toBeVisible();
    for (const [key, value] of Object.entries(delivery)) await page.locator(`[name="${key}"]`).fill(value);
    await page.getByRole('button', { name: 'Review Order' }).click();
    await expect(page.getByRole('heading', { name: 'Review your demo order' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Demo Payment' }).click();
    await expect(page.getByRole('heading', { name: 'DEMO PAYMENT — NO REAL MONEY WILL BE CHARGED' })).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
    await page.reload(); await expect(page.getByRole('button', { name: button })).toBeVisible();
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(status, { exact: true })).toBeVisible();
    await expect(page.getByText('₹148.00', { exact: true })).toBeVisible();
    await expect(page.getByText('123 Sample Street', { exact: false })).toBeVisible();
    await page.screenshot({ path: `../artifacts/demo-order-${status.toLowerCase()}.png`, fullPage: true });
    await page.reload(); await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('son-masala-store') || '')).not.toContain('demo@example.com');
  });
}

test('mobile registration merges guest bag and sign-in restores customer cart', async ({ page, advanceAuthClock }) => {
  await page.goto('/shop'); await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart' }).click(); await page.getByRole('button', { name: 'Close shopping bag' }).click();
  await page.goto('/login'); await customerSignIn(page);
  await expect(page.getByRole('heading', { name: 'Hello, Browser Shopper.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shopping cart, 1 items' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Welcome to SON MASALA' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shopping cart, 0 items' })).toBeVisible();
  await advanceAuthClock(61000); await customerSignIn(page);
  await expect(page.getByRole('heading', { name: 'Hello, Browser Shopper.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Shopping cart, 1 items' })).toBeVisible();
});
