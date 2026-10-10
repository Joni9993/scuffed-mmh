// Mobile layout e2e (Playwright): panels fit the viewport, pause button clear of the minimap, PWA manifest + SW.
// Run: SH_URL=http://127.0.0.1:5174/ node tools/mobile-e2e.mjs [outdir]   (SW check needs a production build: npm run build && npm run preview)
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium, devices } = require('playwright');
const URL0 = process.env.SH_URL || 'http://127.0.0.1:5174/';
const OUT = process.argv[2] || '/tmp/sh-shots';
mkdirSync(OUT, { recursive: true });
const SIZES = [[844, 390], [740, 360], [568, 320]];
const STATIONS = ['schmiede', 'laden', 'truhe', 'kochtopf', 'auftragsbrett', 'spiegel', 'optionen'];
const problems = [];
const bad = (m) => { problems.push(m); console.log('PROBLEM', m); };
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let shots = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${URL0}?scene=hub&nofs=1`);
  await page.waitForFunction(() => window.__SH?.town, null, { timeout: 40000 });
  await page.evaluate(() => { for (const id of ['flickbrause', 'knisterkraut', 'jaggo_schuppe', 'blaublatt']) window.__SH.save.give(id, 5); });
  for (const id of STATIONS) {
    await page.evaluate((i) => window.__SH.town.open(i), id);
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const p = document.querySelector('.st-panel'); if (!p) return null;
      const b = p.getBoundingClientRect(), body = p.querySelector('.st-body'), x = p.querySelector('.st-x').getBoundingClientRect();
      const clipped = [...p.querySelectorAll('input,button,.nm,.card')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.left < b.left - 1 || r.right > b.right + 1); }).map((e) => e.className || e.tagName);
      const small = [...p.querySelectorAll('button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); }).map((e) => (e.textContent || e.className).slice(0, 12) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, xr: x.right, xt: x.top, scroll: body.scrollHeight > body.clientHeight, hOver: body.scrollWidth > body.clientWidth + 1, clipped, small, vh: innerHeight, vw: innerWidth };
    });
    const tag = `${w}x${h} ${id}`;
    if (!r) { bad(`${tag}: no panel`); continue; }
    if (r.l < -0.5 || r.t < -0.5 || r.r > r.vw + 0.5 || r.b > r.vh + 0.5) bad(`${tag}: panel outside viewport ${JSON.stringify([r.l, r.t, r.r, r.b])}`);
    if (r.hOver) bad(`${tag}: horizontal overflow`);
    if (r.clipped.length) bad(`${tag}: clipped ${r.clipped.join(',')}`);
    if (r.small.length) bad(`${tag}: small targets ${r.small.join(' ')}`);
    if (id === 'truhe') { // second tab: Vorrat (item list + detail)
      await page.evaluate(() => document.querySelector('.st-panel [data-a="tab"][data-k="stock"]')?.click()); await page.waitForTimeout(150);
      const r2 = await page.evaluate(() => { const b = document.querySelector('.st-body'); return { h: b.scrollWidth > b.clientWidth + 1, bot: document.querySelector('.st-panel').getBoundingClientRect().bottom, vh: innerHeight }; });
      if (r2.h || r2.bot > r2.vh + 0.5) bad(`${tag}: truhe stock overflow`);
    }
    if ((id === 'laden' && w !== 740) || (id === 'truhe' && w === 740) || (id === 'spiegel' && w === 568)) await page.screenshot({ path: `${OUT}/${w}x${h}-${id}.png` });
    await page.evaluate(() => document.querySelector('.st-x').click());
  }
  console.log(w, h, 'errors', errs.slice(0, 3));
  await ctx.close();
}
// hunt HUD: pause button vs minimap, strip
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${URL0}?scene=hunt&nofs=1&seed=3`);
  await page.waitForFunction(() => window.__SH?.hunt, null, { timeout: 40000 });
  await page.evaluate(() => { window.__SH.save.give?.('flickbrause', 3); });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const rect = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    return { menu: rect('.tmenu'), mini: rect('.mini'), timer: rect('.hud-timer'), ko: rect('.hud-ko'), item: rect('.btn-item'), bar: rect('.btn-bar'), strip: rect('.hh-strip') };
  });
  const ov = (a, b) => a && b && a.w && b.w && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  for (const k of ['mini', 'timer', 'ko']) if (ov(r.menu, r[k])) bad(`${w}x${h}: pause overlaps ${k}`);
  if (!r.menu || r.menu.w < 43.5) bad(`${w}x${h}: pause hit size ${r.menu?.w}`);
  console.log(w, h, JSON.stringify({ menu: r.menu, mini: r.mini, timer: r.timer, ko: r.ko, bar: r.bar }));
  if (w !== 740) await page.screenshot({ path: `${OUT}/${w}x${h}-hud.png` });
  await ctx.close();
}
// PWA: manifest parses, SW registers (production build only)
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await page.goto(`${URL0}?scene=title&nofs=1&sw=1`);
  const m = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const j = await (await fetch(l.href)).json(); return j; });
  const icons = m.icons.map((i) => i.sizes + ':' + i.purpose).join(' ');
  console.log('manifest', m.id, m.start_url, m.scope, m.display, m.orientation, icons);
  if (!m.icons.some((i) => i.sizes === '192x192') || !m.icons.some((i) => i.sizes === '512x512' && i.purpose.includes('maskable'))) bad('manifest icons');
  const sw = await page.evaluate(async () => { try { const r = await navigator.serviceWorker.register('sw.js', { scope: './' }); await navigator.serviceWorker.ready; return r.scope; } catch (e) { return 'ERR ' + e.message; } });
  console.log('sw scope', sw);
  if (String(sw).startsWith('ERR')) bad('sw register ' + sw);
  await ctx.close();
}
await browser.close();
console.log(problems.length ? `FAILED (${problems.length})` : 'OK');
process.exit(problems.length ? 1 : 0);
