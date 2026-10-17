// Menue-Screenshots (844x390 Touch): Auftragsbrett, Truhe (Ausruestung/Vorrat), Schmiede. Reicher Test-Spielstand.
// SH_URL=... node tools/menu-shots.mjs outdir [w h]
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium, devices } = require('playwright');
const URL0 = process.env.SH_URL || 'http://127.0.0.1:8080/';
const OUT = process.argv[2] || '/tmp/sh-shots'; mkdirSync(OUT, { recursive: true });
const W = Number(process.argv[3] || 844), H = Number(process.argv[4] || 390);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const town = () => page.waitForFunction(() => window.__SH?.town, null, { timeout: 40000 });
await page.goto(`${URL0}?scene=hub&nofs=1&mode=solo`); await town();
await page.evaluate(() => {
  const s = __SH.save.get(); s.nameSet = true; s.jr = 5; s.rp = 40; s.schrott = 9000;
  for (const id of ['flickbrause', 'pustekuchen', 'sprudelwasser', 'blendknolle', 'stinkbombe', 'klebefalle', 'knallgurke', 'grillsteak', 'brennspitze', 'knisterkraut', 'schrotterz', 'glimmstein', 'altknochen', 'grossknochen', 'glutsack', 'kupferdraht']) s.box[id] = 7;
  for (const id of Object.keys(s.armorOwned)) s.armorOwned[id] = true;
  for (const id of __SH.armorIds?.() ?? []) s.armorOwned[id] = true;
  s.weapons.gs = { tier: 3, branch: 'a' }; s.weapons.bow = { tier: 2, branch: null };
  s.armory.push({ type: 'gs', tier: 2, branch: null }, { type: 'db', tier: 3, branch: 'b' });
  s.clears.jaggo = 3;
  __SH.save.flush();
});
const open = async (id) => {
  await page.evaluate((i) => __SH.town.toStation(i), id); await page.waitForTimeout(200);
  const cb = await page.evaluate(() => { const r = document.querySelector('[data-act="context"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', [cb]); await page.waitForTimeout(120); await touch('touchEnd', []); // rohe Touch-Events: kein durchgereichter Klick auf das frische Panel
  await page.waitForSelector('.st-panel', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
};
const close = async () => { await page.evaluate(() => document.querySelector('.st-x')?.click()); await page.waitForTimeout(200); };
const tapSel = async (sel) => { const e = await page.$(sel); if (e) { await e.tap(); await page.waitForTimeout(250); } return !!e; };
await open('auftragsbrett'); await page.screenshot({ path: `${OUT}/board.png` });
for (const t of (process.env.BOARD_TABS || '').split(',').filter(Boolean)) { await tapSel(`.st-panel [data-a="tab"][data-k="${t}"]`); await page.screenshot({ path: `${OUT}/board-${t}.png` }); }
await close();
await open('truhe'); await page.screenshot({ path: `${OUT}/truhe-gear.png` });
await tapSel('.st-panel [data-a="tab"][data-k="items"]'); await page.screenshot({ path: `${OUT}/truhe-items.png` });
await tapSel('.st-panel [data-a="tab"][data-k="stock"]'); await page.screenshot({ path: `${OUT}/truhe-stock.png` });
await close();
await open('schmiede'); await page.screenshot({ path: `${OUT}/schmiede.png` });
await tapSel('.st-panel [data-a="wtypes"]'); await page.screenshot({ path: `${OUT}/schmiede-types.png` });
await close();
console.log('errors', errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
