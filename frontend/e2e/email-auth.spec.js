const { test, expect, enterCustomerCode } = require('./fixtures');

test('Hindi email verification localizes headings and digit labels', async ({ page, readEmailCode }) => {
  await page.goto('/login');
  await expect(page.locator('.customer-auth-card')).toBeVisible();
  await page.locator('.language-toggle button').click();
  await page.getByRole('tab').first().click();
  await page.locator('#email-full-name').fill('Hindi Email Shopper');
  await page.locator('#email-mobile').fill('9876543210');
  await page.locator('#customer-email').fill('hindi-email@example.com');
  await page.locator('.customer-auth-primary').click();
  await expect(page.locator('#customer-auth-heading')).toContainText('ईमेल पता');
  await expect(page.locator('.customer-otp-digits input').first()).toHaveAttribute('aria-label', 'सत्यापन कोड का अंक 1');
  await enterCustomerCode(page, await readEmailCode());
  await page.locator('.customer-auth-primary').click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: /Hindi Email Shopper/ })).toBeVisible();
});

for (const width of [320, 768, 1440]) test(`email registration and returning login at ${width}px`, async ({ page, readEmailCode, advanceAuthClock }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/login?next=/account');
  await page.getByRole('tab', { name: 'Create Account', exact: true }).click();
  await page.getByLabel('FULL NAME', { exact: true }).fill('Email Browser Shopper');
  await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('9876543210');
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('email-browser@example.com');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `../artifacts/customer-registration-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Send OTP to Email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Email Address' })).toBeVisible();
  await page.screenshot({ path: `../artifacts/customer-email-verification-${width}.png`, fullPage: true });
  await expect(page.getByRole('button', { name: /Resend OTP in/ })).toBeDisabled();
  await enterCustomerCode(page, await readEmailCode());
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Hello, Email Browser Shopper.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hello, Email Browser Shopper.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Login', exact: true }).click();
  await expect(page.getByLabel('FULL NAME', { exact: true })).toHaveCount(0);
  await advanceAuthClock(61000);
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('email-browser@example.com');
  await page.getByRole('button', { name: 'Send OTP to Email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Email Address' })).toBeVisible();
  await enterCustomerCode(page, await readEmailCode());
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Email Browser Shopper.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('email-only new customer completes profile after proving email ownership', async ({ page, readEmailCode }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Login', exact: true }).click();
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('profile-browser@example.com');
  await page.getByRole('button', { name: 'Send OTP to Email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Email Address' })).toBeVisible();
  await enterCustomerCode(page, await readEmailCode());
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page.getByLabel('FULL NAME', { exact: true })).toBeVisible();
  await page.getByLabel('FULL NAME', { exact: true }).fill('Profile Browser Shopper');
  await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('9876543210');
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Profile Browser Shopper.' })).toBeVisible();
});

test('rapid form submissions dispatch once and registration signs in without another OTP', async ({ page, readEmailCode }) => {
  let sends = 0;
  const keys = [];
  page.on('request', request => {
    if (request.url().includes('/auth/email/send-otp')) { sends++; keys.push(request.headers()['idempotency-key']); }
  });
  await page.goto('/login');
  await page.getByLabel('FULL NAME', { exact: true }).fill('Single Email Shopper');
  await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('9876543210');
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('single-action@example.com');
  await page.locator('#customer-email-panel').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('heading', { name: 'Verify Your Email Address' })).toBeVisible();
  expect(sends).toBe(1);
  expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
  await enterCustomerCode(page, await readEmailCode());
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Hello, Single Email Shopper.' })).toBeVisible();
  expect(sends).toBe(1);
});

test('email expiry, resend cooldown and incorrect-code errors are actionable', async ({ page, readEmailCode, advanceAuthClock }) => {
  await page.goto('/login');
  await page.clock.install();
  await page.getByRole('tab', { name: 'Login', exact: true }).click();
  await page.getByLabel('EMAIL ADDRESS', { exact: true }).fill('expiry-browser@example.com');
  await page.getByRole('button', { name: 'Send OTP to Email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify Your Email Address' })).toBeVisible();
  const real = await readEmailCode();
  await enterCustomerCode(page, String((Number(real) + 1) % 1000000).padStart(6, '0'));
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page.locator('.customer-auth-error')).toContainText('incorrect');
  await expect(page.getByRole('button', { name: /Resend OTP in/ })).toBeDisabled();
  await advanceAuthClock(302000);
  await page.clock.fastForward(302000);
  await expect(page.locator('.customer-auth-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify & Continue' })).toBeDisabled();
  await page.getByRole('button', { name: 'Resend OTP', exact: true }).click();
  await expect(page.locator('.customer-auth-error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Resend OTP in/ })).toBeDisabled();
});
