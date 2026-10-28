const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: 'list',
});
