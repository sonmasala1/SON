const { test, expect } = require('./fixtures');

async function isolatedGoogle(page, { backendURL, cancelled = false } = {}) {
  let visits = 0;
  await page.route('https://accounts.google.com/o/oauth2/v2/auth?**', async route => {
    visits++;
    const auth = new URL(route.request().url());
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    // Fulfilled cross-origin redirects bypass the normal API route rewrite. Return to this test's isolated server.
    expect(callback.pathname).toBe('/api/v1/auth/google/callback');
    callback.port = new URL(backendURL).port;
    callback.searchParams.set('state', auth.searchParams.get('state'));
    if (cancelled) callback.searchParams.set('error', 'access_denied');
    else callback.searchParams.set('code', Buffer.from(JSON.stringify({ nonce: auth.searchParams.get('nonce'), challenge: auth.searchParams.get('code_challenge') })).toString('base64url'));
    await route.fulfill({ status: 302, headers: { location: callback.toString() }, body: '' });
  });
  return () => visits;
}

test('Google button uses the original four-colour G and remains independent of the mobile fields', async ({ page }) => {
  await page.goto('/login');
  const button = page.getByRole('button', { name: 'Continue with Google', exact: true });
  await expect(button).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Send OTP to Email', exact: true })).toBeDisabled();
  await expect(button.locator('img')).toHaveAttribute('src', '/images/google-g.svg');
  expect(await button.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  const styles = await button.evaluate(element => { const css = getComputedStyle(element); return { background: css.backgroundColor, weight: css.fontWeight, border: css.borderTopColor }; });
  expect(styles).toEqual({ background: 'rgb(255, 253, 248)', weight: '500', border: 'rgb(222, 216, 201)' });
  const google = await button.boundingBox(), divider = await page.locator('.customer-auth-divider').first().boundingBox(), terms = await page.locator('.customer-auth-terms').boundingBox();
  expect(divider.y).toBeLessThan(google.y); expect(terms.y).toBeGreaterThan(google.y);
  await expect(page.locator('input[type="email"]')).toHaveCount(1);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test('Google callback returns to checkout with the guest bag; persistent sessions skip further OTP and Google prompts', async ({ page, context, backendURL }) => {
  const visits = await isolatedGoogle(page, { backendURL });
  await page.goto('/shop'); await page.locator('.product-card').first().getByRole('button', { name: 'Buy Now' }).click();
  await expect(page).toHaveURL(/next=%2Fcheckout/);
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('Google Shopper');
  await expect(page.getByRole('button', { name: 'Shopping cart, 1 items' })).toBeVisible();
  const first = (await (await page.request.get(backendURL + '/auth/me')).json()).user;
  expect(first.role).toBe('CUSTOMER'); expect(first.email).toBe('google-shopper@example.com'); expect(first.phoneVerified).toBe(false);
  await page.goto('/account'); await expect(page.getByRole('heading', { name: 'Hello, Google Shopper.' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'Hello, Google Shopper.' })).toBeVisible();
  await page.goto('/login'); await expect(page).toHaveURL(/\/account$/); expect(visits()).toBe(1);
  const cookie = (await context.cookies()).find(cookie => cookie.name === 'son_customer_session'); expect(cookie.httpOnly).toBe(true); expect(cookie.expires).toBeGreaterThan(Date.now() / 1000);
  expect((await page.request.get(backendURL + '/admin/dashboard')).status()).toBe(403);
  expect((await page.request.get(backendURL + '/owner/admins')).status()).toBe(403);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect((await (await page.request.get(backendURL + '/auth/me')).json()).user).toBe(null);
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click(); await expect(page).toHaveURL(/\/account$/);
  expect((await (await page.request.get(backendURL + '/auth/me')).json()).user.id).toBe(first.id);
  await expect(page.getByRole('button', { name: 'Shopping cart, 1 items' })).toBeVisible(); expect(visits()).toBe(2);
});

test('cancelling Google consent returns to the login card with a recoverable error and the saved checkout destination', async ({ page, backendURL }) => {
  await isolatedGoogle(page, { backendURL, cancelled: true });
  await page.goto('/login?next=%2Fcheckout'); await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page).toHaveURL(/google_error=cancelled/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/checkout');
  await expect(page.locator('.customer-auth-card').getByRole('alert')).toContainText('cancelled');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue with Mobile OTP', exact: true }).click();
  await expect(page.getByLabel('FULL NAME', { exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('unconfigured Google sign-in shows a clear error and leaves mobile OTP usable', async ({ page }) => {
  await page.goto('/login');
  await page.route('**/auth/google/start', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Google sign-in is currently unavailable. Please use mobile OTP.' }) }));
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.locator('.customer-auth-card').getByRole('alert')).toContainText('Please use mobile OTP');
  await page.getByRole('button', { name: 'Continue with Mobile OTP', exact: true }).click();
  await expect(page.getByLabel('FULL NAME', { exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeEnabled();
  await page.getByLabel('FULL NAME', { exact: true }).fill('Mobile Shopper'); await page.getByLabel('MOBILE NUMBER', { exact: true }).fill('+91 98765 43210');
  await expect(page.getByRole('button', { name: 'Send OTP', exact: true })).toBeEnabled();
});
