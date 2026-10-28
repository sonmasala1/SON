const { test, expect, mfaCode, customerSignIn } = require('./fixtures');

async function signIn(page, realm, credentials) {
  await page.goto(`/${realm}/login`);
  await page.getByLabel(realm === 'owner' ? 'Owner ID' : 'Admin ID', { exact: true }).fill(credentials.adminId);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByLabel('MFA verification code').fill(mfaCode(credentials.secret));
  await page.getByRole('button', { name: realm === 'owner' ? 'Sign in as Owner' : 'Sign in as Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Business dashboard', exact: true })).toBeVisible();
}

test('customer mobile OTP keeps administration separate and denies internal APIs', async ({ page, backendURL }) => {
  await page.goto('/login');
  await customerSignIn(page);
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('navigation', { name: 'Administration navigation' })).toHaveCount(0);
  for (const endpoint of ['/admin/dashboard', '/owner/admins', '/owner/audit-logs']) {
    expect((await page.request.get(backendURL + endpoint)).status()).toBe(403);
  }
  await page.goto('/owner/access-management');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});

test('staff sign-in shows permitted business data and cannot open owner controls', async ({ page, backendURL, staffCredentials }) => {
  await signIn(page, 'admin', staffCredentials);
  await expect(page.getByText('Actual sales and payment totals exclude all demo transactions.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Staff access', exact: true })).toHaveCount(0);
  expect((await page.request.get(backendURL + '/owner/admins')).status()).toBe(403);
  await page.goto('/owner/access-management');
  await expect(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
});

test('owner invitation requires email verification, chosen password, and MFA before staff access', async ({ page, backendURL, ownerCredentials }) => {
  test.setTimeout(60000);
  await signIn(page, 'owner', ownerCredentials);
  await page.getByRole('link', { name: 'Staff access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff access management' })).toBeVisible();
  await page.goto('/owner/admins/new');
  await page.getByLabel('Full Name', { exact: true }).fill('Invited Browser Staff');
  await page.getByLabel('Email', { exact: true }).fill('invited-browser@example.com');
  await page.getByLabel('Mobile Number', { exact: true }).fill('+919876543210');
  await page.getByRole('button', { name: 'Send Admin Invitation' }).click();
  await expect(page.getByRole('heading', { name: 'Development invitation prepared.' })).toBeVisible();
  const invitationUrl = await page.getByLabel('Development invitation link').inputValue();
  await page.getByRole('link', { name: 'Back to staff access' }).click();
  await page.getByRole('button', { name: 'Sign out of owner' }).click();
  await expect(page).toHaveURL(/\/owner\/login$/);
  await page.goto(invitationUrl);
  await expect(page).not.toHaveURL(/#token=/);
  const requested = page.waitForResponse(response => response.url().includes('/invitations/request-code'));
  await page.getByRole('button', { name: 'Verify invitation & send email code' }).click();
  const challenge = await (await requested).json();
  expect((await page.request.get(backendURL + '/admin/dashboard')).status()).toBe(401);
  await page.getByLabel('Email verification code').fill(challenge.developmentCode);
  await page.getByRole('button', { name: 'Verify Email', exact: true }).click();
  await page.getByLabel('Choose a secure password').fill('Unique invited browser password 42!');
  const enrolled = page.waitForResponse(response => response.url().includes('/invitations/enroll'));
  await page.getByRole('button', { name: 'Continue to MFA Enrollment' }).click();
  const enrollment = await (await enrolled).json();
  expect((await page.request.get(backendURL + '/admin/dashboard')).status()).toBe(401);
  await page.getByLabel('Authenticator verification code').fill(mfaCode(enrollment.secret));
  await page.getByRole('button', { name: 'Verify MFA & Activate' }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery codes.' })).toBeVisible();
  await page.getByRole('button', { name: 'I saved my recovery codes' }).click();
  await expect(page.getByRole('heading', { name: 'Business dashboard', exact: true })).toBeVisible();
  expect((await page.request.get(backendURL + '/owner/admins')).status()).toBe(403);
  await expect(page.getByRole('link', { name: 'Payments', exact: true })).toHaveCount(0);
});

test('owner passkeys require verified WebAuthn and support secure sign-in', async ({ page, context, backendURL, ownerCredentials }) => {
  test.setTimeout(60000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await signIn(page, 'owner', ownerCredentials);
  await page.getByRole('link', { name: 'Owner security', exact: true }).click();
  await page.getByLabel('Authenticator code', { exact: true }).fill(mfaCode(ownerCredentials.secret, 30000));
  await page.getByRole('button', { name: 'Add Owner Passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Registered passkeys (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out of owner' }).click();
  await expect(page).toHaveURL(/\/owner\/login$/);
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  const requested = await page.request.post(backendURL + '/owner/auth/passkeys/options', { headers: { Origin: 'http://localhost:3000' }, data: { adminId: ownerCredentials.adminId } });
  expect(requested.ok()).toBeTruthy();
  const challenge = await requested.json();
  // Simulate a client weakening browser options; the API must still enforce UV.
  const unverified = await page.evaluate(async options => {
    const bytes = encoded => Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), value => value.charCodeAt(0));
    const credential = await navigator.credentials.get({ publicKey: { ...options, challenge: bytes(options.challenge), allowCredentials: options.allowCredentials.map(value => ({ ...value, id: bytes(value.id) })), userVerification: 'discouraged' } });
    return credential.toJSON();
  }, challenge.options);
  const denied = await page.request.post(backendURL + '/owner/auth/passkeys/verify', { headers: { Origin: 'http://localhost:3000' }, data: { challengeToken: challenge.challengeToken, response: unverified } });
  expect(denied.status()).toBe(401);
  expect((await page.request.get(backendURL + '/owner/auth/me')).status()).toBe(401);
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  await page.getByLabel('Owner ID', { exact: true }).fill(ownerCredentials.adminId);
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Business dashboard', exact: true })).toBeVisible();
  await page.screenshot({ path: '../artifacts/owner-dashboard.png', fullPage: true });
  await page.getByRole('link', { name: 'Staff access', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff access management' })).toBeVisible();
  await page.screenshot({ path: '../artifacts/owner-staff-access.png', fullPage: true });
  await cdp.detach();
});
