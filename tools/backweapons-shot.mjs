// Screenshot of the 4 weapons stowed on the back (gearlab lineup, seen from behind). 844x390.
//   SH_URL=http://127.0.0.1:5173/ node tools/backweapons-shot.mjs out.png
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.env.SH_URL || 'http://127.0.0.1:5173/';
const out = process.argv[2] || 'backweapons.png';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}?scene=gearlab`);
await page.waitForFunction(() => window.__SH?.app?.scene?.show, null, { timeout: 30000 });
await page.evaluate(async () => {
  const { mountOnBack } = await import('/src/game/gear/backMount.js');
  const { REST } = await import('/src/game/anim.js');
  const types = ['gs', 'kt', 'db', 'bow'];
  const sc = window.__SH.app.scene;
  sc.show(types.map((t) => ({ gear: { weapon: { type: t, tier: 1 } }, yaw: 0, pose: { ...REST }, noWeapon: true })), { spacing: 2.2, cam: [0, 1.5, -6], look: [0, 1.0, 0] });
  sc.camera.position.set(0, 1.5, -6); sc.camera.lookAt(0, 1.0, 0);
  const { getWeapon } = await import('/src/game/weapons/index.js');
  sc.rigs.forEach((r, i) => { const m = getWeapon(types[i]).buildMesh({ tier: 1, branch: null }); mountOnBack(r.rig, m, types[i]); r.pose = { ...REST }; });
  window.__SH.pause(true);
});
await page.evaluate(() => window.__SH.step(2));
await page.waitForTimeout(500);
await page.screenshot({ path: out });
await browser.close();
