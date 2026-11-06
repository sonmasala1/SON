const { chromium, devices } = require('@playwright/test');
const fs = require('fs');
async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    await context.addInitScript(() => {
      window.__vitals = { lcp: 0, cls: 0 };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__vitals.cls += entry.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    const page = await context.newPage();
    if (process.env.PROFILE_LOCAL_API === 'true') await page.route('**/api/v1/**', async route => {
      if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
      const url = new URL(route.request().url());
      const response = await fetch(`http://127.0.0.1:5000${url.pathname}${url.search}`, { signal: AbortSignal.timeout(20000) });
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/v1/')) calls.push(new URL(request.url()).pathname + new URL(request.url()).search); });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => ({ ...window.__vitals, resources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/_next/image')).map(entry => ({ name: entry.name, bytes: entry.transferSize, durationMs: Math.round(entry.duration) })) }));
    const result = { environment: process.env.PROFILE_MODE || 'development', dataMode: process.env.PROFILE_LOCAL_API === 'true' ? 'read-only local API relay' : 'configured API', labOnly: true, metrics, apiCalls: calls, errors };
    fs.mkdirSync('test-results', { recursive: true });
    fs.writeFileSync(`test-results/performance-${result.environment}.json`, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
