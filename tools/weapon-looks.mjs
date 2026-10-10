// Waffen-Optik je Stufe/Ast nebeneinander (gearlab, weaponOnly): Stufe 1, 2, 3a, 3b, 4, 5k, 5g, 5v, 6.
//   SH_URL=http://127.0.0.1:8195/ node tools/weapon-looks.mjs <outdir> [gs,db,bow]   -> look-gs.png, look-db.png, look-bow.png
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.env.SH_URL || 'http://127.0.0.1:8195/';
const dir = process.argv[2] || '.';
const types = (process.argv[3] || 'gs,db,bow').split(',');
const STEPS = [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null], [5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 2000, height: 640 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}?scene=gearlab`);
await page.waitForFunction(() => window.__SH?.app?.scene?.show, null, { timeout: 30000 });
for (const t of types) {
  await page.evaluate(([t, steps]) => {
    window.__SH.app.renderer.setResolution(1700);
    const sc = window.__SH.app.scene;
    const bow = t === 'bow', db = t === 'db';
    sc.show(steps.map(([tier, branch]) => ({ gear: { weapon: { type: t, tier, branch } }, weaponOnly: true, yaw: bow ? 0.8 : 0.35 })), { spacing: db ? 1.8 : 1.95, cam: [0, bow ? 1.4 : db ? 2.9 : 3.3, bow ? 8.6 : db ? 7.4 : 10.8], look: [0, bow ? 1.3 : db ? 2.9 : 3.3, 0], fov: 38 });
    window.__SH.pause(true);
  }, [t, STEPS]);
  await page.evaluate(() => window.__SH.step(3));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/look-${t}.png` });
}
await browser.close();
