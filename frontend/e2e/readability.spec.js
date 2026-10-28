const { test, expect, enterCustomerCode, mfaCode } = require('./fixtures');

async function readable(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Inspect the settled layout; the bag intentionally slides in from outside.
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  const issues = await page.evaluate(() => {
    const visible = element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[aria-hidden="true"]');
    };
    const tiny = [...document.querySelectorAll('body *')].filter(element =>
      visible(element) && [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) &&
      parseFloat(getComputedStyle(element).fontSize) < 14
    ).map(element => `${element.tagName}.${element.className}: ${getComputedStyle(element).fontSize} ${element.textContent.slice(0, 60)}`);
    const targets = [...document.querySelectorAll('button:has(svg), a.icon-button, .quantity-controls button, .review-dots button')]
      .filter(visible).filter(element => {
        const box = element.getBoundingClientRect();
        return box.width < 43.5 || box.height < 43.5;
      }).map(element => `${element.className} ${element.getAttribute('aria-label')}`);
    const inputs = [...document.querySelectorAll('input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), select')]
      .filter(visible).filter(element => element.getBoundingClientRect().height < 48).map(element => element.id || element.name);
    const icons = [...document.querySelectorAll('.app-icon')].filter(visible)
      .filter(element => element.getBoundingClientRect().width < 22 || element.getBoundingClientRect().height < 22)
      .map(element => element.dataset.icon);
    const clippedControls = [...document.querySelectorAll('.button, .customer-google-button, .customer-auth-primary, .staff-sidebar a')]
      .filter(visible).filter(element => element.scrollWidth > element.clientWidth + 2)
      .map(element => element.textContent.trim());
    const offscreen = [...document.querySelectorAll('main, header, footer, .wrap, .product-card, .cart-summary, .staff-content, .staff-sidebar, .staff-table, .customer-auth-card, .header-actions')]
      .filter(visible).filter(element => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > innerWidth + 1;
      }).map(element => element.className || element.tagName);
    return { tiny, targets, inputs, icons, clippedControls, offscreen, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(issues, `${page.url()} at ${page.viewportSize().width}px`).toEqual({ tiny: [], targets: [], inputs: [], icons: [], clippedControls: [], offscreen: [], overflow: false });
}

async function staffLogin(page, realm, credentials) {
  await page.goto(`/${realm}/login`);
  await readable(page);
  await page.getByLabel(realm === 'owner' ? 'Owner ID' : 'Admin ID', { exact: true }).fill(credentials.adminId);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByLabel('MFA verification code').fill(mfaCode(credentials.secret));
  await page.locator('.staff-login-form form .button').click();
  await expect(page.locator('.staff-metric-grid article').first()).toBeVisible();
}

for (const width of [375, 768, 1440, 1920]) {
  test(`readable English/Hindi storefront, shopping and staff panels at ${width}px`, async ({ page, staffCredentials, ownerCredentials }) => {
    test.setTimeout(180000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    for (const locale of ['en', 'hi']) {
      for (const route of ['/', '/shop', '/product/haldi-powder', '/login', '/about', '/contact', '/recipes', '/policies', '/cart']) {
        await page.goto(route);
        if (await page.locator('html').getAttribute('lang') !== locale) await page.locator('.language-toggle button').click();
        if (['/shop', '/product/haldi-powder'].includes(route)) await expect(page.locator('.product-copy').first()).toBeVisible();
        await readable(page);
        if (['/', '/shop', '/login'].includes(route) && [375, 1440].includes(width)) {
          await page.screenshot({ path: `../artifacts/readability-${locale}-${route === '/' ? 'home' : route.slice(1)}-${width}.png`, fullPage: true });
        }
      }
    }
    // Exercise expanded controls and an actual guest cart, then return through OTP.
    await page.locator('.language-toggle button').click();
    await page.goto('/shop');
    await page.locator('.header-search-toggle').click();
    await readable(page);
    await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await expect(page.locator('.cart-drawer .cart-item')).toBeVisible();
    await readable(page);
    await page.getByRole('button', { name: 'Close shopping bag', exact: true }).click();
    await page.goto('/cart');
    await readable(page);
    await page.getByRole('link', { name: 'Proceed to Checkout', exact: false }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.locator('#customer-full-name').fill('Browser Shopper');
    await page.locator('#customer-mobile').fill('9876543210');
    const sent = page.waitForResponse(response => response.url().includes('/auth/send-otp'));
    await page.locator('.customer-auth-primary').click();
    const challenge = await (await sent).json();
    await expect(page.locator('.customer-otp-digits')).toBeVisible();
    await expect(page.locator('.customer-otp-digits input').first()).toHaveCSS('font-size', '26px');
    await readable(page);
    await enterCustomerCode(page, challenge.developmentCode);
    await page.locator('.customer-auth-primary').click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.locator('.delivery-form')).toBeVisible();
    await readable(page);
    await page.locator('.language-toggle button').click();
    await readable(page);
    const delivery = { fullName: 'Browser Shopper', email: 'reader@example.com', phone: '9876543210', address: '123 Sample Street', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' };
    for (const [name, value] of Object.entries(delivery)) await page.locator(`[name="${name}"]`).fill(value);
    await page.locator('.delivery-form button[type="submit"], .delivery-form .button').click();
    await expect(page.locator('.delivery-review')).toBeVisible();
    await readable(page);
    await page.locator('.checkout-grid > .cart-summary .button').click();
    await expect(page.locator('.demo-payment-panel')).toBeVisible();
    await readable(page);
    await page.locator('.demo-payment-actions .button').first().click();
    await expect(page.locator('.order-confirmation-title')).toBeVisible();
    await readable(page);
    await page.goto('/shop');
    await expect(page.locator('.save-product').first()).toBeVisible();
    await page.locator('.save-product').first().click();
    await expect(page.locator('.save-product').first()).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/wishlist');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await readable(page);
    await page.goto('/account');
    await expect(page.locator('.account-panel')).toBeVisible();
    await readable(page);
    await page.locator('.language-toggle button').click();
    for (const [realm, credentials] of [['admin', staffCredentials], ['owner', ownerCredentials]]) {
      await staffLogin(page, realm, credentials);
      await readable(page);
      await page.goto('/admin/modules/inventory');
      await expect(page.locator('.staff-table tbody tr').first()).toBeVisible();
      await readable(page);
      expect(await page.locator('.staff-table-scroll').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if (realm === 'owner') {
        for (const route of ['/owner/access-management', '/owner/audit-logs', '/owner/security', '/admin/modules/analytics']) {
          await page.goto(route);
          await expect(page.locator('.staff-content h1')).toBeVisible();
          if (route === '/owner/access-management') await expect(page.locator('.staff-table tbody tr').first()).toBeVisible();
          if (route === '/owner/audit-logs') await expect(page.locator('.staff-table tbody tr').first()).toBeVisible();
          await readable(page);
          await page.locator('.language-toggle button').click();
          await readable(page);
          if (route === '/owner/access-management' && [375, 1440].includes(width)) await page.screenshot({ path: `../artifacts/readability-owner-${width}.png`, fullPage: true });
          await page.locator('.language-toggle button').click();
        }
      }
      await page.goto(`/${realm}/dashboard`);
      await page.getByRole('button', { name: `Sign out of ${realm}`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${realm}/login$`));
    }
    expect(errors).toEqual([]);
  });
}
