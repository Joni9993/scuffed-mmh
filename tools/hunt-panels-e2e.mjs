// Hunt panels e2e (Playwright 844x390 touch): pause -> Optionen -> back, camp chest take / craft / gear, input restored.
// Run: SH_URL=http://127.0.0.1:5180/ node tools/hunt-panels-e2e.mjs [outdir]
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
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
await page.goto(`${URL0}?scene=hunt&nofs=1&seed=3&noambient=1&nofauna=1`);
await page.waitForFunction(() => window.__SH?.hunt, null, { timeout: 40000 });
await page.evaluate(() => { __SH.save.give('flickbrause', 6); __SH.save.give('knisterkraut', 3); __SH.save.give('sprudelwasser', 3); __SH.save.give('pustekuchen', 2); __SH.save.get().armorOwned.fellkluft_head = true; });
await page.waitForTimeout(500);
const pos = () => page.evaluate(() => ({ x: __SH.player.pos.x, z: __SH.player.pos.z }));
const realMoves = async () => {
  const p0 = await pos();
  await touch('touchStart', [[120, 250]]); await touch('touchMove', [[120, 290]]); await page.waitForTimeout(600);
  const p1 = await pos();
  await touch('touchEnd', []);
  return Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.3;
};
const touchOn = () => page.evaluate(() => getComputedStyle(__SH.app.touch.el).display !== 'none');

// ---- pause -> Optionen
chk(await realMoves(), 'moves at start');
await page.evaluate(() => __SH.press('menu', 80)); await page.waitForTimeout(300);
chk(await page.evaluate(() => !!document.querySelector('[data-a="opt"]')), 'pause menu has Optionen');
await page.tap('[data-a="opt"]'); await page.waitForSelector('.st-panel[data-station="optionen"]');
chk(await page.evaluate(() => !document.querySelector('#st-code')), 'no save import/reset mid-hunt');
await page.screenshot({ path: `${OUT}/hunt-optionen.png` });
await page.tap('.st-x'); await page.waitForTimeout(200);
chk(await page.evaluate(() => getComputedStyle(document.querySelector('[data-a="go"]').closest('.screen')).display !== 'none'), 'pause menu back after Optionen');
await page.tap('[data-a="go"]'); await page.waitForTimeout(300);
chk(await page.evaluate(() => !__SH.hunt.paused), 'resumed');
chk(await realMoves(), 'moves after pause/Optionen/resume');

// ---- camp chest
await page.evaluate(() => { const c = __SH.hunt.world.layout.campProps.chest; __SH.player.spawnAt(c.x - 1.5, c.z, 0); });
await page.waitForTimeout(500);
chk(await page.evaluate(() => __SH.hunt.contextLabel === 'Truhe'), 'context label Truhe at the chest');
const cb = await page.evaluate(() => { const r = document.querySelector('[data-act="context"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await touch('touchStart', [cb]); await page.waitForTimeout(120); await touch('touchEnd', []);
await page.waitForSelector('.st-panel[data-station="hunttruhe"]', { timeout: 4000 });
chk(!(await touchOn()), 'touch controls hidden while chest open');
await page.screenshot({ path: `${OUT}/hunt-truhe-take.png` });
const before = await page.evaluate(() => __SH.hunt.inventory.count('flickbrause'));
await page.tap('.st-panel [data-a="take"][data-k="flickbrause"]'); await page.waitForTimeout(150);
const after = await page.evaluate(() => __SH.hunt.inventory.count('flickbrause'));
chk(after === before + 1, `take +1 flickbrause (${before} -> ${after})`);
await page.tap('.st-panel [data-a="back"][data-k="flickbrause"]'); await page.waitForTimeout(100);
chk(await page.evaluate(() => __SH.hunt.inventory.count('flickbrause')) === before, 'put back');
await page.tap('.st-panel [data-a="tab"][data-k="craft"]'); await page.waitForTimeout(100);
await page.tap('.st-panel [data-a="craft"][data-k="flickbrause"]'); await page.waitForTimeout(100);
chk(await page.evaluate(() => __SH.hunt.meta.chest.delta.flickbrause === 1), 'crafted a Flickbrause into the chest');
await page.tap('.st-panel [data-a="tab"][data-k="gear"]'); await page.waitForTimeout(100);
await page.screenshot({ path: `${OUT}/hunt-truhe-gear.png` });
await page.tap('.st-panel [data-a="wpn"][data-k="bow"]'); await page.waitForTimeout(150);
chk(await page.evaluate(() => __SH.player.weaponId === 'bow'), 'weapon switched to bow immediately');
await page.tap('.st-panel [data-a="slot"][data-k="head"]'); await page.tap('.st-panel [data-a="wear"][data-k="fellkluft_head"]'); await page.waitForTimeout(150);
chk(await page.evaluate(() => __SH.player.gear.armor.head === 'fellkluft_head'), 'armor head changed on the rig');
await page.tap('.st-x'); await page.waitForTimeout(250);
chk(await touchOn(), 'touch controls back after chest');
chk(await realMoves(), 'moves after chest');
// combat lock: a monster in combat blocks weapon swaps
await page.evaluate(() => { const c = __SH.hunt.world.layout.campProps.chest; __SH.player.spawnAt(c.x - 1.5, c.z, 0); __SH.hunt.mainMonster.setState('combat'); });
await page.waitForTimeout(400);
await page.evaluate(() => __SH.press('context', 80)); await page.waitForTimeout(300);
if (await page.$('.st-panel[data-station="hunttruhe"]')) {
  await page.tap('.st-panel [data-a="tab"][data-k="gear"]');
  await page.tap('.st-panel [data-a="wpn"][data-k="gs"]'); await page.waitForTimeout(150);
  chk(await page.evaluate(() => __SH.player.weaponId === 'bow'), 'weapon swap refused while the Brocken is in combat');
  await page.tap('.st-x');
} else chk(false, 'chest reopen (context press)');
// persistence at hunt end
await page.evaluate(() => __SH.hunt.abandon());
await page.waitForFunction(() => __SH.scene === 'results', null, { timeout: 8000 });
const sv = await page.evaluate(() => { const s = __SH.save.get(); return { w: s.loadout.weapon, head: s.loadout.armor.head, fb: s.box.flickbrause ?? 0, kk: s.box.knisterkraut ?? 0 }; });
chk(sv.w === 'bow' && sv.head === 'fellkluft_head', 'gear persisted at hunt end ' + JSON.stringify(sv));
chk(sv.fb === 7 && sv.kk === 2, 'crafted stock persisted (6+1 flickbrause, 3-1 knisterkraut)');
console.log('errors', errs.slice(0, 3));
await browser.close(); process.exit(fail.length ? 1 : 0);
