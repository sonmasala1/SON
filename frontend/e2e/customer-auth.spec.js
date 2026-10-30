const { chromium } = require('@playwright/test');
const { test, expect, customerSignIn, enterCustomerCode } = require('./fixtures');

async function requestCode(page, channel = 'SMS OTP') {
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  if (await page.getByRole('button', { name: 'Continue with Mobile OTP', exact: true }).isVisible()) await page.getByRole('button', { name: 'Continue with Mobile OTP', exact: true }).click();
  await page.getByLabel('FULL NAME', { exact: true }).fill('आशा O’Connor');
  await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('9876543210');
  await page.getByRole('radio', { name: channel, exact: true }).check();
  const response = page.waitForResponse(response => response.url().includes('/auth/send-otp'));
  await page.getByRole('button', { name: 'Send OTP', exact: true }).click();
  const result = await (await response).json();
  await expect(page.getByRole('heading', { name: 'Verify Your Mobile Number' })).toBeVisible();
  return result;
}

for (const width of [320, 390, 768, 1440]) test(`split customer login is accessible and responsive at ${width}px`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('EMAIL ADDRESS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Mobile OTP', exact: true }).click();
  await expect(page.locator('.customer-auth-card input:not([type="radio"])')).toHaveCount(2);
  await expect(page.locator('input[type="password"], input[type="email"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Send OTP', exact: true })).toBeDisabled();
  await page.getByLabel('FULL NAME', { exact: true }).fill('आशा O’Connor');
  await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('1234567890');
  await expect(page.getByRole('button', { name: 'Send OTP', exact: true })).toBeDisabled();
  await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('9876543210');
  await expect(page.getByRole('button', { name: 'Send OTP', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const card = await page.locator('.customer-auth-card').boundingBox(); expect(card.width).toBeLessThanOrEqual(480);
  if (width <= 760) expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThan(2);
  else expect(card.x).toBeGreaterThanOrEqual(width / 2);
  if (width < 900) { await page.getByRole('button', { name: 'Open menu' }).click(); await expect(page.getByRole('link', { name: 'All Spices', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close menu' }).click(); }
  await page.getByLabel('FULL NAME', { exact: true }).clear(); await page.getByLabel('MOBILE NUMBER', { exact: true }).clear();
  await page.getByRole('heading', { name: 'Welcome back' }).click();
  if ([390, 1440].includes(width)) await page.screenshot({ path: `../artifacts/customer-login-${width}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('OTP inputs advance focus, accept pasted codes and display invalid-code errors', async ({ page }) => {
  await page.goto('/login'); const challenge = await requestCode(page);
  await expect(page.getByText('Local development preview', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Verification code digit 1', { exact: true })).toBeFocused();
  await page.getByLabel('Verification code digit 1', { exact: true }).press('1');
  await expect(page.getByLabel('Verification code digit 2', { exact: true })).toBeFocused();
  await page.getByLabel('Verification code digit 2', { exact: true }).press('Backspace');
  await expect(page.getByLabel('Verification code digit 1', { exact: true })).toBeFocused();
  const wrong = String((Number(challenge.developmentCode) + 1) % 1000000).padStart(6, '0'); await enterCustomerCode(page, wrong);
  await page.getByRole('button', { name: 'Verify & Continue' }).click(); await expect(page.locator('.customer-auth-card').getByRole('alert')).toContainText('incorrect');
  await page.getByLabel('Verification code digit 1', { exact: true }).evaluate((element, code) => { const data = new DataTransfer(); data.setData('text', code); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); }, challenge.developmentCode);
  for (let index = 0; index < 6; index++) await expect(page.getByLabel(`Verification code digit ${index + 1}`, { exact: true })).toHaveValue(challenge.developmentCode[index]);
  await page.screenshot({ path: '../artifacts/customer-otp-verification.png', fullPage: true });
  await page.getByRole('button', { name: 'Verify & Continue' }).click(); await expect(page.getByRole('heading', { name: 'Hello, आशा O’Connor.' })).toBeVisible();
});

test('expiry and resend stay in the card; WhatsApp uses the same mobile-only flow', async ({ page, advanceAuthClock }) => {
  await page.goto('/login'); await page.clock.install(); const challenge = await requestCode(page, 'WhatsApp OTP');
  expect(challenge.channel).toBe('whatsapp'); await expect(page.getByRole('button', { name: /Resend OTP in/ })).toBeDisabled();
  await advanceAuthClock(302000); await page.clock.fastForward(302000);
  await expect(page.locator('.customer-auth-card').getByRole('alert')).toContainText('expired'); await expect(page.getByRole('button', { name: 'Verify & Continue' })).toBeDisabled();
  const sent = page.waitForResponse(response => response.url().includes('/auth/resend-otp'));
  await page.getByRole('button', { name: 'Resend OTP', exact: true }).click(); const replacement = await (await sent).json();
  expect(replacement.challengeToken).not.toBe(challenge.challengeToken); await expect(page.locator('.customer-auth-card').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Change Mobile Number' }).click(); await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('MOBILE NUMBER', { exact: true })).toHaveValue('9876543210');
});

test('persistent login survives refresh, navigation, and restoration in a new browser process', async ({ page, context, backendURL }) => {
  test.setTimeout(60000);
  await page.goto('/login'); await customerSignIn(page, { name: 'Persistent Shopper' });
  await expect(page.getByRole('heading', { name: 'Hello, Persistent Shopper.' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Hello, Persistent Shopper.' })).toBeVisible();
  const saved = await context.storageState(); const cookie = saved.cookies.find(cookie => cookie.name === 'son_customer_session'); expect(cookie.httpOnly).toBe(true); expect(cookie.expires).toBeGreaterThan(Date.now() / 1000);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const reopened = await browser.newContext({ storageState: saved }); const newPage = await reopened.newPage(); let otpRequests = 0;
    await newPage.route('**/api/v1/**', route => { const url = new URL(route.request().url()); if (url.pathname.endsWith('/send-otp')) otpRequests++; url.port = new URL(backendURL).port; return route.continue({ url: url.toString() }); });
    await newPage.goto(`${process.env.E2E_BASE_URL || 'http://localhost:3000'}/login`); await expect(newPage).toHaveURL(/\/account$/); await expect(newPage.getByRole('heading', { name: 'Hello, Persistent Shopper.' })).toBeVisible(); expect(otpRequests).toBe(0);
    await newPage.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(newPage.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.reload(); await expect(page).toHaveURL(/\/login$/);
  } finally { await browser.close(); }
});

test('checkout sign-in returns to checkout with selected products and the saved name', async ({ page }) => {
  await page.goto('/shop'); await page.locator('.product-card').first().getByRole('button', { name: 'Buy Now' }).click();
  await expect(page).toHaveURL(/next=%2Fcheckout/); await expect(page).toHaveURL(/next=%2Fcheckout/);
  await customerSignIn(page, { name: 'Checkout Shopper' }); await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Checkout Shopper'); await expect(page.getByLabel('Phone', { exact: true })).toHaveValue('9876543210');
  await expect(page.getByRole('button', { name: 'Shopping cart, 1 items' })).toBeVisible();
});

for (const channel of ['SMS OTP', 'WhatsApp OTP']) test(`${channel} delivery failures keep the form available and do not display verification`, async ({ page }) => {
  await page.goto('/login');
  await page.route('**/auth/send-otp', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Message delivery is unavailable. Please try again later.' }) }));
  await page.getByRole('button', { name: 'Continue with Mobile OTP', exact: true }).click();
  await page.getByLabel('FULL NAME', { exact: true }).fill('Delivery Test'); await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('9876543210'); await page.getByRole('radio', { name: channel, exact: true }).check();
  await page.getByRole('button', { name: 'Send OTP', exact: true }).click(); await expect(page.locator('.customer-auth-card').getByRole('alert')).toContainText('delivery is unavailable');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Send OTP', exact: true })).toBeEnabled();
});

test('logout clears customer state even when the subsequent cart and session refresh fail', async ({ page, backendURL }) => {
  await page.goto('/login'); await customerSignIn(page, { name: 'Logout Shopper' }); await expect(page.getByRole('heading', { name: 'Hello, Logout Shopper.' })).toBeVisible();
  await page.route(/\/api\/v1\/(?:cart|auth\/me)$/, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Temporarily unavailable.' }) }));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hello, Logout Shopper.' })).toHaveCount(0);
  expect((await (await page.request.get(backendURL + '/auth/me')).json()).user).toBe(null);
});
