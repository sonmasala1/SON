const { test: base, expect } = require('@playwright/test');
const { fork } = require('node:child_process');
const path = require('node:path');
const OTPAuth = require(path.resolve(__dirname, '../../backend/node_modules/otpauth'));
const mfaCode = (secret, offset = 0) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' }).generate({ timestamp: Date.now() + offset });
const test = base.extend({
  testApplication: [async ({}, use) => {
    const fixture = fork(path.resolve(__dirname, '../../backend/scripts/browser-fixture.js'), [], { cwd: path.resolve(__dirname, '../../backend'), stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const application = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Isolated database startup timed out')), 15000); fixture.once('message', message => { clearTimeout(timer); resolve(message); }); fixture.once('exit', code => { clearTimeout(timer); reject(new Error(`Isolated database exited: ${code}`)); }); });
    application.advanceAuthClock = milliseconds => new Promise(resolve => { const id = Math.random().toString(36); const listener = message => { if (message.type === 'auth-clock-advanced' && message.id === id) { fixture.off('message', listener); resolve(); } }; fixture.on('message', listener); fixture.send({ type: 'advance-auth-clock', milliseconds, id }); });
    application.readEmailCode = () => new Promise(resolve => { const id = Math.random().toString(36); const listener = message => { if (message.type === 'email-code' && message.id === id) { fixture.off('message', listener); resolve(message.code); } }; fixture.on('message', listener); fixture.send({ type: 'read-email-code', id }); });
    try { await use(application); }
    finally { if (fixture.connected && fixture.exitCode === null) { const exited = new Promise(resolve => fixture.once('exit', resolve)); fixture.send('shutdown'); await exited; } }
  }, { scope: 'test' }],
  readEmailCode: async ({ testApplication }, use) => use(testApplication.readEmailCode),
  backendURL: async ({ testApplication }, use) => use(`http://localhost:${testApplication.port}/api/v1`),
  staffCredentials: async ({ testApplication }, use) => use(testApplication.staff),
  ownerCredentials: async ({ testApplication }, use) => use(testApplication.owner),
  advanceAuthClock: async ({ testApplication }, use) => use(testApplication.advanceAuthClock),
  page: async ({ page, backendURL }, use) => { await page.route('**/api/v1/**', route => { const url = new URL(route.request().url()); url.port = new URL(backendURL).port; return route.continue({ url: url.toString() }); }); await use(page); },
});
async function enterCustomerCode(page, code) { await page.locator('.customer-otp-digits input').first().fill(code); }
async function customerSignIn(page, { name = 'Browser Shopper', phone = '9876543210', channel = 'SMS OTP' } = {}) {
  await expect(page.locator('.customer-auth-card')).toBeVisible();
  if (await page.locator('#customer-email').isVisible()) await page.locator('.customer-email-button').click();
  await page.locator('#customer-full-name').fill(name);
  await page.locator('#customer-mobile').fill(phone);
  await page.locator(`input[name="channel"][value="${channel === 'WhatsApp OTP' ? 'whatsapp' : 'sms'}"]`).check();
  const sent = page.waitForResponse(response => response.url().includes('/auth/send-otp'));
  await page.locator('.customer-auth-primary').click();
  const challenge = await (await sent).json(); await enterCustomerCode(page, challenge.developmentCode);
  await page.locator('.customer-auth-primary').click();
}
module.exports = { test, expect, mfaCode, customerSignIn, enterCustomerCode };
