// Read-only browser audit. Does not submit forms, log in, or mutate store data.
const { chromium, webkit } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const widths = (process.env.AUDIT_WIDTHS || '320,360,375,390,414,430,768,1024,1280,1440').split(',').map(Number);
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
async function inspect(page) {
  return page.evaluate(() => {
    const visible = element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[aria-hidden="true"], .skip-link');
    };
    const label = element => `${element.tagName}.${String(element.className).slice(0, 90)}`;
    const elements = [...document.querySelectorAll('body *')].filter(visible);
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      offscreen: elements.filter(element => {
        if (element.closest('.review-window')) return false;
        const rect = element.getBoundingClientRect();
        let left = rect.left, right = rect.right;
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (['hidden', 'clip', 'auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) {
            const clip = parent.getBoundingClientRect();
            left = Math.max(left, clip.left); right = Math.min(right, clip.right);
          }
        }
        return left < -1 || right > innerWidth + 1;
      }).map(label).slice(0, 15),
      // Native single-line inputs scroll their values; that is not a clipped layout.
      clipped: elements.filter(element => element.matches('button, .button, h1, h2, h3') && element.scrollWidth > element.clientWidth + 2).map(label),
      smallTargets: elements.filter(element => element.matches('button, .button, .icon-button, summary') && (element.getBoundingClientRect().width < 43.5 || element.getBoundingClientRect().height < 43.5)).map(label),
    };
  });
}
async function main() {
  const engine = process.env.AUDIT_BROWSER || 'chrome';
  const reportName = `test-results/responsive-${engine}${process.env.AUDIT_REPORT_SUFFIX || ''}.json`;
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: engine });
  const results = [], errors = [], chunks = [], failedRequests = [];
  const context = await browser.newContext();
  let page;
  const dataMode = process.env.AUDIT_CACHE_API === 'true' ? 'captured read-only API responses' : 'live API';
  if (process.env.AUDIT_CACHE_API === 'true') {
    const responses = new Map();
    await context.route('**/api/v1/**', async route => {
      if (route.request().method() !== 'GET') return route.abort('blockedbyclient');
      const url = route.request().url();
      if (!responses.has(url)) responses.set(url, (async () => {
        const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
        return { status: response.status, contentType: 'application/json', body: await response.text() };
      })());
      try { await route.fulfill(await responses.get(url)); }
      catch { responses.delete(url); await route.abort('failed'); }
    });
  }
  async function openPage(width) {
    const current = await context.newPage();
    await current.setViewportSize({ width, height: 900 });
    current.on('pageerror', error => errors.push({ url: current.url(), message: error.message }));
    current.on('console', message => { if (message.type() === 'error' && /hydration|matching|server HTML|chunk|Warning:/i.test(message.text())) errors.push({ url: current.url(), message: message.text() }); });
    current.on('response', response => { if (response.url().includes('/_next/static/chunks/')) chunks.push({ status: response.status(), url: new URL(response.url()).pathname }); });
    current.on('requestfailed', request => { if (request.url().includes('/_next/')) failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
    return current;
  }
  try {
    const productsResponse = await fetch('http://127.0.0.1:5000/api/v1/products?limit=48', { signal: AbortSignal.timeout(20000) });
    const products = productsResponse.ok ? (await productsResponse.json()).products || [] : [];
    const routes = process.env.AUDIT_ROUTES?.split(',') || ['/', '/shop', ...products.slice(0, 1).map(product => `/product/${product.slug}`), '/cart', '/checkout', '/login', '/account', '/wishlist', '/about', '/contact', '/recipes', '/policies', '/health', '/admin/login', '/owner/login', '/admin/reviews', '/admin/dashboard', '/admin/modules/inventory', '/owner/dashboard', '/missing-page'];
    for (const width of widths) {
      for (const locale of ['en', 'hi']) {
        await context.addCookies([{ name: 'son_locale', value: locale, url: baseURL }]);
        for (const route of routes) {
          if (page) await page.close();
          page = await openPage(width);
          const start = Date.now();
          try {
            await page.goto(baseURL + route, { waitUntil: 'networkidle', timeout: 60000 });
            await page.evaluate(() => document.fonts.ready);
            const issues = await inspect(page);
            results.push({ width, locale, route, ms: Date.now() - start, ...issues });
            if (issues.overflow || issues.offscreen.length || issues.clipped.length || issues.smallTargets.length) console.log(JSON.stringify(results.at(-1)));
            if (width === 320 && locale === 'en' && ['/shop', '/login'].includes(route)) await page.screenshot({ path: `test-results/${engine}-${route.slice(1)}-320.png`, fullPage: true });
          } catch (error) { errors.push({ width, locale, route, message: error.message }); }
          fs.mkdirSync(path.resolve('test-results'), { recursive: true });
          fs.writeFileSync(reportName, JSON.stringify({ engine, baseURL, dataMode, results, errors, chunks, failedRequests }, null, 2));
        }
      }
      console.log(`Completed ${engine} ${width}px`);
    }
    fs.mkdirSync(path.resolve('test-results'), { recursive: true });
    fs.writeFileSync(reportName, JSON.stringify({ engine, baseURL, dataMode, results, errors, chunks, failedRequests }, null, 2));
    console.log(JSON.stringify({ engine, checks: results.length, layoutFailures: results.filter(r => r.overflow || r.offscreen.length || r.clipped.length || r.smallTargets.length).length, errors, failedRequests, chunkResponses: chunks.length }));
  } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { inspect };
