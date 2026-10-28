const { test, expect, mfaCode } = require('./fixtures');

test('authenticated reviews require moderation and carousel rotates with accessible controls', async ({ page, backendURL, staffCredentials }) => {
  test.setTimeout(60000);
  let csrf = '';
  const api = async (endpoint, body, method = 'POST') => {
    const response = await page.request.fetch(backendURL + endpoint, { method, headers: { Origin: 'http://localhost:3000', 'X-CSRF-Token': csrf }, ...(body ? { data: body } : {}) });
    expect(response.ok()).toBeTruthy(); const data = await response.json(); if (data.csrfToken) csrf = data.csrfToken; return data;
  };
  await page.goto('/'); await expect(page.getByText('Be the first to review SON MASALA.')).toBeVisible();
  const product = (await api('/products', null, 'GET')).products.find(product => product.slug === 'haldi-powder');
  for (let index = 0; index < 2; index++) {
    const sent = await api('/auth/send-otp', { fullName: `Isolated Reviewer ${index}`, phone: `+91987654321${index}`, channel: 'sms' });
    await api('/auth/verify-otp', { challengeToken: sent.challengeToken, code: sent.developmentCode });
    await api('/reviews', { productId: product._id, displayName: `Isolated Reviewer ${index}`, rating: 4 + index, comment: `Isolated browser-test review ${index}. This is not a live customer testimonial.` });
    await api('/auth/logout', {});
  }
  await page.reload(); await expect(page.getByText('Be the first to review SON MASALA.')).toBeVisible();
  const login = await api('/admin/auth/login', { adminId: staffCredentials.adminId, password: staffCredentials.password });
  await api('/admin/auth/mfa/verify', { challengeToken: login.challengeToken, code: mfaCode(staffCredentials.secret) });
  await page.goto('/admin/reviews'); await expect(page.getByRole('heading', { name: 'Review moderation' })).toBeVisible();
  const approve = page.getByRole('button', { name: 'Approve Review' }); await expect(approve).toHaveCount(2);
  await approve.first().click(); await expect(approve).toHaveCount(1); await approve.first().click(); await expect(approve).toHaveCount(0);
  await page.clock.install();
  await page.goto('/'); await expect(page.locator('.review-slide')).toHaveCount(2); await expect(page.getByText('Verified purchase', { exact: true })).not.toBeVisible();
  const active = page.locator('.review-slide[aria-hidden="false"]'); const first = await active.locator('strong').textContent();
  await page.mouse.move(0, 0); await expect(page.locator('.reviews-carousel')).toHaveAttribute('data-paused', 'false'); await page.clock.fastForward(4600); await expect(active.locator('strong')).not.toHaveText(first);
  const second = await active.locator('strong').textContent(); await page.locator('.reviews-carousel').hover(); await expect(page.locator('.reviews-carousel')).toHaveAttribute('data-paused', 'true'); await page.clock.fastForward(10000); await expect(active.locator('strong')).toHaveText(second);
  await page.getByRole('button', { name: 'Next review' }).click(); await expect(active.locator('strong')).toHaveText(first);
  await page.clock.fastForward(10000); await expect(active.locator('strong')).toHaveText(first);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.getByRole('heading', { name: 'What Our Customers Say' }).click(); await page.mouse.move(0, 0); await page.clock.fastForward(10000); await expect(active.locator('strong')).toHaveText(first);
});
