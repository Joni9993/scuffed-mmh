// UI-Screenshots (844x390 Touch): Auftragsbrett (mit gewähltem Mutator) + Spiegel/Tod-Log. SH_URL=... node tools/ui-shots.mjs outdir
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium, devices } = require('playwright');
const URL0 = process.env.SH_URL || 'http://127.0.0.1:8080/';
const OUT = process.argv[2] || '/tmp/sh-shots'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const town = () => page.waitForFunction(() => window.__SH?.town, null, { timeout: 40000 });
await page.goto(`${URL0}?scene=hub&nofs=1`); await town();
await page.evaluate(() => {
  __SH.save.get().nameSet = true; __SH.save.flush();
  localStorage.setItem('mmh.deathlog.v1', JSON.stringify([{ m: 'brathalos', a: 'feuer@223.56:f0', n: 1, q: 0 }, { m: 'brathalos', a: 'feuerteppich@415.35:t2', n: 1, q: 0 }, { m: 'brathalos', a: 'brathalos_flammenstoss', n: 6, q: 2 }, { m: 'barrotz', a: 'barrotz_ramm', n: 1, q: 0 }]));
});
await page.goto(`${URL0}?scene=hub&nofs=1&mode=solo`); await town(); await page.waitForTimeout(500);
for (const [id, name] of [['auftragsbrett', 'board'], ['spiegel', 'spiegel']]) {
  await page.evaluate((i) => __SH.town.toStation(i), id); await page.waitForTimeout(200);
  const cb = await page.evaluate(() => { const r = document.querySelector('[data-act="context"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.touchscreen.tap(cb[0], cb[1]);
  await page.waitForSelector('.st-panel', { timeout: 5000 }).catch(() => {});
  if (name === 'board') { const m = await page.$('.st-panel [data-a^="mut"], .st-panel .mut'); if (m) await m.tap(); await page.waitForTimeout(150); }
  if (name === 'spiegel') { const b = await page.$('.st-panel button:has-text("Erfolge")'); if (b) await b.tap(); await page.waitForTimeout(250); }
  if (name === 'spiegel') await page.evaluate(() => { const el = [...document.querySelectorAll('.st-panel .sub')].find((e) => /Tod-Log/.test(e.textContent)); el?.scrollIntoView(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.evaluate(() => document.querySelector('.st-x')?.click()); await page.waitForTimeout(200);
}
console.log('errors', errs.length, errs.slice(0, 2).join(' | '));
await browser.close();
