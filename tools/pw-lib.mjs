import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
export async function open(query, { w = 844, h = 390 } = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.goto('' + (process.env.SH_URL || 'http://127.0.0.1:5173/') + '?' + query);
  await page.waitForFunction(() => window.__SH && window.__SH.hunt, null, { timeout: 30000 });
  await page.evaluate(() => window.__SH.pause(true));
  return { browser, page, errors };
}
