// UI contract tests use controlled API responses; live MFA/MongoDB coverage is in staff-auth.spec.js.
const { test, expect } = require('@playwright/test');

async function sessionApi(page, context, options = {}) {
  await context.addCookies([
    { name: 'son_customer_session', value: 'c'.repeat(43), domain: 'localhost', path: '/' },
    { name: 'son_admin_session', value: 'a'.repeat(43), domain: 'localhost', path: '/api/v1' },
  ]);
  const calls = { me: 0, dashboard: 0, customer: 0 };
  const customer = { id: 'customer-1', name: 'Customer Shopper', role: 'CUSTOMER' };
  const account = { fullName: 'Admin Operator', adminId: 'ADM-TEST', role: 'ADMIN', permissions: ['dashboard.view', 'orders.view'] };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1/', '');
    // The compiled API origin can differ between dev and production builds.
    const cookie = (await context.cookies()).map(value => `${value.name}=${value.value}`).join('; ');
    let status = 200, body = { success: true }, headers = {};
    if (path === 'admin/auth/me') {
      calls.me++;
      if (options.unauthorized || !cookie.includes('son_admin_session=')) { status = 401; body = { message: 'Please sign in with an authorized staff account.' }; }
      else body = { success: true, account, csrfToken: 'staff-csrf', session: { expiresAt: '2099-01-01T00:00:00Z' } };
    } else if (path === 'admin/dashboard') {
      calls.dashboard++;
      if (options.timeout && calls.dashboard === 1) return;
      if (options.fail && calls.dashboard === 1) { status = 503; body = { message: 'Business database is temporarily unavailable. Please retry.' }; }
      else body = { success: true, modules: { orders: { total: 42, pending: 3 } } };
    } else if (path === 'admin/auth/logout') {
      expect(route.request().headers()['x-csrf-token']).toBe('staff-csrf');
      await context.clearCookies({ name: 'son_admin_session' });
      headers['Set-Cookie'] = 'son_admin_session=; Path=/api/v1; Max-Age=0; HttpOnly';
    } else if (path === 'auth/logout') {
      await context.clearCookies({ name: 'son_customer_session' });
      headers['Set-Cookie'] = 'son_customer_session=; Path=/; Max-Age=0; HttpOnly';
    } else if (path === 'cart') {
      calls.customer++;
      body = { success: true, user: cookie.includes('son_customer_session=') ? customer : null, cart: { items: [], count: 0 } };
    } else if (path === 'wishlist') body = { success: true, wishlist: { slugs: [], products: [] } };
    else if (path === 'auth/orders') body = { success: true, orders: [] };
    await route.fulfill({ status, json: body, headers });
  });
  return calls;
}

test('admin identity, refresh, navigation and admin logout preserve customer identity', async ({ page, context }) => {
  const calls = await sessionApi(page, context);
  await page.goto('/account');
  await expect(page.locator('header')).toContainText('Customer');
  await page.goto('/admin/dashboard');
  await expect(page.locator('header')).toContainText('Admin Operator');
  await expect(page.locator('header')).not.toContainText('Customer');
  await expect(page.locator('header').getByLabel(/Shopping cart|Wishlist|Customer profile/)).toHaveCount(0);
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  expect(calls.dashboard).toBe(1);
  await page.reload();
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await page.getByLabel('Admin profile: Admin Operator', { exact: true }).click();
  await page.getByRole('button', { name: 'Admin Profile', exact: true }).click();
  await expect(page.locator('#staff-header-profile')).toContainText('ADM-TEST');
  await page.getByRole('button', { name: 'Sign Out of Admin', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  const cookies = await context.cookies();
  expect(cookies.some(cookie => cookie.name === 'son_customer_session')).toBe(true);
  expect(cookies.some(cookie => cookie.name === 'son_admin_session')).toBe(false);
  await page.goto('/account');
  await expect(page.locator('header')).toContainText('Customer');
});

test('customer logout preserves the admin session', async ({ page, context }) => {
  await sessionApi(page, context);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const cookies = await context.cookies();
  expect(cookies.some(cookie => cookie.name === 'son_customer_session')).toBe(false);
  expect(cookies.some(cookie => cookie.name === 'son_admin_session')).toBe(true);
  await page.goto('/admin/dashboard');
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await expect(page.locator('header')).toContainText('Admin Operator');
});

test('failed dashboard ends loading and retry renders metrics', async ({ page, context }) => {
  const calls = await sessionApi(page, context, { fail: true });
  await page.goto('/admin/dashboard');
  await expect(page.locator('.staff-content [role="alert"]')).toContainText('Business database is temporarily unavailable');
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
  await expect(page.getByText('Loading authorized business data…', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  expect(calls.dashboard).toBe(2);
});

test('session revalidation does not refetch metrics or customer APIs', async ({ page, context }) => {
  await page.clock.install();
  const calls = await sessionApi(page, context);
  await page.goto('/admin/dashboard');
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await page.clock.fastForward(60001);
  await expect.poll(() => calls.me).toBe(2);
  await expect(page.locator('header')).toContainText('Admin Operator');
  expect(calls.dashboard).toBe(1);
  expect(calls.customer).toBe(0);
});

test('unauthorized session never fetches dashboard or polls auth', async ({ page, context }) => {
  await page.clock.install();
  const calls = await sessionApi(page, context, { unauthorized: true });
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.clock.fastForward(120001);
  expect(calls.dashboard).toBe(0);
  expect(calls.me).toBe(1);
});

test('hanging dashboard times out and allows retry', async ({ page, context }) => {
  await page.clock.install();
  const calls = await sessionApi(page, context, { timeout: true });
  await page.goto('/admin/dashboard');
  await expect.poll(() => calls.dashboard).toBe(1);
  await page.clock.fastForward(15001);
  await expect(page.locator('.staff-content [role="alert"]')).toContainText('request took too long');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('42', { exact: true })).toBeVisible();
});

test('mobile admin profile controls remain visible and keyboard accessible', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await sessionApi(page, context);
  await page.goto('/admin/dashboard');
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  const profile = page.getByLabel('Admin profile: Admin Operator', { exact: true });
  await profile.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Admin Profile', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign Out of Admin', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(profile).toBeFocused();
  await expect(page.getByRole('button', { name: 'Admin Profile', exact: true })).toBeHidden();
  const bounds = await profile.boundingBox();
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
});
