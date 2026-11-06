// Rasterize the existing brand SVG; pack the PNG in a standards-compliant ICO.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
async function main() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 64, height: 64 }, deviceScaleFactor: 1 });
    const svg = fs.readFileSync(path.resolve(__dirname, '../public/icon.svg'), 'utf8');
    await page.setContent(`<style>html,body{margin:0;width:64px;height:64px}svg{display:block;width:64px;height:64px}</style>${svg}`);
    const png = await page.screenshot({ omitBackground: true });
    const header = Buffer.alloc(22);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
    header[6] = 64; header[7] = 64;
    header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
    header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
    fs.writeFileSync(path.resolve(__dirname, '../public/favicon.ico'), Buffer.concat([header, png]));
    console.log('Generated favicon.ico from public/icon.svg');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
