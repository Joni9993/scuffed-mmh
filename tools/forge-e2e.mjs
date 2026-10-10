// Schmiede / Spiegel / Truhe layout e2e (Playwright): primary buttons stay inside the viewport without scrolling, screenshots.
// Run: SH_URL=http://127.0.0.1:5174/ node tools/forge-e2e.mjs [outdir]
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium, devices } = require('playwright');
const URL0 = process.env.SH_URL || 'http://127.0.0.1:5174/';
const OUT = process.argv[2] || '/tmp/sh-shots';
mkdirSync(OUT, { recursive: true });
const problems = [];
const bad = (m) => { problems.push(m); console.log('PROBLEM', m); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h] of [[844, 390], [568, 320]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${URL0}?scene=hub&nofs=1`);
  await page.waitForFunction(() => window.__SH?.town, null, { timeout: 40000 });
  await page.evaluate(() => { for (const id of ['flickbrause', 'knisterkraut', 'jaggo_schuppe', 'blaublatt', 'altknochen', 'schrotterz']) window.__SH.save.give(id, 5); window.__SH.save.give('schrott', 900); });
  const open = async (id) => { await page.evaluate((i) => window.__SH.town.open(i), id); await page.waitForTimeout(500); };
  const click = async (sel) => { await page.locator(sel).first().tap(); await page.waitForTimeout(350); };
  const inView = async (sel, tag) => {
    const r = await page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, vw: innerWidth, vh: innerHeight, h: b.height }; }, sel);
    if (!r) { bad(`${w}x${h} ${tag}: ${sel} missing`); return; }
    if (r.t < -0.5 || r.b > r.vh + 0.5 || r.l < -0.5 || r.r > r.vw + 0.5) bad(`${w}x${h} ${tag}: ${sel} outside viewport ${JSON.stringify(r)}`);
    if (r.h < 43.5) bad(`${w}x${h} ${tag}: ${sel} too small ${r.h}`);
  };
  const noScroll = async (tag) => {
    const r = await page.evaluate(() => { const b = document.querySelector('.st-body'); return { v: b.scrollHeight > b.clientHeight + 1, h: b.scrollWidth > b.clientWidth + 1 }; });
    if (r.v || r.h) bad(`${w}x${h} ${tag}: body scrolls ${JSON.stringify(r)}`);
  };
  // Schmiede Waffen
  await open('schmiede');
  await inView('.fg-info .btn', 'schmiede waffen'); await noScroll('schmiede waffen');
  await page.screenshot({ path: `${OUT}/${w}x${h}-schmiede-waffen.png` });
  // Rüstung: every set piece must keep the button on screen
  await click('[data-a="tab"][data-k="armor"]');
  for (const id of ['fellkluft_head', 'jaggo_body', 'brathalos_legs', 'lumpen_head']) {
    await page.evaluate((k) => document.querySelector(`[data-a="psel"][data-k="${k}"]`)?.click(), id);
    await page.waitForTimeout(250);
    await inView('.fg-info .btn', `schmiede ruestung ${id}`); await noScroll(`schmiede ruestung ${id}`);
  }
  await page.evaluate(() => document.querySelector('[data-a="psel"][data-k="jaggo_body"]')?.click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${w}x${h}-schmiede-ruestung.png` });
  // drag rotate
  const box = await page.locator('.gpv-canvas').boundingBox();
  const before = await page.evaluate(() => window.__SH && 1);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 }); await page.mouse.up();
  void before;
  await page.evaluate(() => document.querySelector('.st-x').click());
  // Spiegel
  await open('spiegel');
  await click('.sw:nth-child(3)');
  await page.screenshot({ path: `${OUT}/${w}x${h}-spiegel.png` });
  await click('[data-a="tab"][data-k="stats"]');
  await page.screenshot({ path: `${OUT}/${w}x${h}-spiegel-stats.png` });
  await page.evaluate(() => document.querySelector('.st-x').click());
  // Truhe detail
  await open('truhe');
  await click('[data-a="tab"][data-k="stock"]');
  await click('.cell:nth-child(2)');
  await page.screenshot({ path: `${OUT}/${w}x${h}-truhe-vorrat.png` });
  await click('[data-a="tab"][data-k="craft"]');
  await click('.chip.tap');
  if (!(await page.locator('.pop .idet').count())) bad(`${w}x${h}: truhe chip detail missing`);
  await inView('.pop .idet-a .btn', 'truhe pop');
  await page.screenshot({ path: `${OUT}/${w}x${h}-truhe-detail.png` });
  console.log(w, h, 'errors', errs.slice(0, 3));
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `${problems.length} problems` : 'ALL OK');
process.exit(problems.length ? 1 : 0);
