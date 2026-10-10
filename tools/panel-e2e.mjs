// Panel input regression (Playwright, 844x390 touch): hunt -> back to town -> post -> unpost -> close -> move works
// (real CDP touch) -> post -> Abflugtor ready -> hunt starts. Root cause was the singleton hub scene keeping dead/starting.
// Run: SH_URL=http://127.0.0.1:5180/ node tools/panel-e2e.mjs [outdir]
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium, devices } = require('playwright');
const URL0 = process.env.SH_URL || 'http://127.0.0.1:5180/';
const OUT = process.argv[2] || '/tmp/sh-shots'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
const fail = []; const chk = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail.push(m); };
const town = () => page.waitForFunction(() => window.__SH?.town, null, { timeout: 40000 });
await page.goto(`${URL0}?scene=hub&nofs=1`); await town();
await page.evaluate(() => { __SH.save.get().nameSet = true; __SH.save.flush(); });
await page.goto(`${URL0}?scene=hub&nofs=1&mode=solo`); await town(); await page.waitForTimeout(500);

const pos = () => page.evaluate(() => ({ x: __SH.town.player.pos.x, z: __SH.town.player.pos.z }));
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const realMoves = async () => {
  const p0 = await pos();
  await touch('touchStart', [[120, 250]]); await touch('touchMove', [[120, 290]]); await page.waitForTimeout(500);
  const p1 = await pos();
  await touch('touchEnd', []);
  return Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.3;
};
const touchOn = () => page.evaluate(() => getComputedStyle(__SH.app.touch.el).display !== 'none');
const at = async (id) => { await page.evaluate((i) => __SH.town.toStation(i), id); await page.waitForTimeout(150); };
const tapCtx = async () => {
  const cb = await page.evaluate(() => { const r = document.querySelector('[data-act="context"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await touch('touchStart', [cb]); await page.waitForTimeout(120); await touch('touchEnd', []);
};

// 1) a full hunt round trip first (this is what poisons the singleton scene)
await at('auftragsbrett'); await tapCtx(); await page.waitForSelector('.st-panel');
await page.tap('.st-panel [data-a="post"]'); await page.tap('.st-x'); await page.waitForTimeout(150);
await at('tor'); await tapCtx(); await page.waitForTimeout(250); await tapCtx();
await page.waitForFunction(() => __SH.scene === 'hunt', null, { timeout: 20000 });
chk(true, 'first hunt started');
await page.evaluate(() => __SH.goto('hub')); await town(); await page.waitForTimeout(600);

// 2) panel cycle after returning
await at('auftragsbrett'); await tapCtx(); await page.waitForSelector('.st-panel');
await page.tap('.st-panel [data-a="post"]'); await page.waitForTimeout(150);
await page.screenshot({ path: `${OUT}/brett-posted.png` });
await page.tap('.st-panel [data-a="unpost"]'); await page.waitForTimeout(150);
await page.tap('.st-x'); await page.waitForTimeout(200);
chk(await touchOn(), 'touch controls visible after close');
chk(await realMoves(), 'real touch move after post->unpost->close');
await at('auftragsbrett'); await tapCtx(); await page.waitForSelector('.st-panel');
await page.tap('.st-panel [data-a="post"]'); await page.tap('.st-x'); await page.waitForTimeout(200);
chk(await realMoves(), 'real touch move after post->close');
await at('tor'); await tapCtx(); await page.waitForTimeout(250); await tapCtx();
await page.waitForTimeout(2500);
const sc = await page.evaluate(() => __SH.scene);
chk(sc === 'hunt', 'second hunt starts via Abflugtor (scene=' + sc + ')');
console.log('errors', errs.slice(0, 3));
await browser.close(); process.exit(fail.length ? 1 : 0);
