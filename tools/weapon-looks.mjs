// Waffen-Optik je Stufe/Ast nebeneinander (gearlab, weaponOnly): Stufe 1, 2, 3a, 3b, 4, 5k, 5g, 5v, 6.
//   SH_URL=http://127.0.0.1:8195/ node tools/weapon-looks.mjs <outdir> [gs,db,bow]   -> look-gs.png, look-db.png, look-bow.png
//   [GA] Typ `ga` (Glitchaxt) rendert Zustaende: look-ga-axt/-schwert/-blitz/-glitch/-fehl/-kern.png (alle 9 Looks), YAW=<rad> ueberschreibt die Drehung
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
// [GA] Glitchaxt-Zustaende: w = Waffen-Stub fuer updateMesh (Modus/Druck/Move), glitch = Zustandsfehler-Optik
const GA_STATES = {
  axt: { w: { data: { mode: 'axt', druck: 55 } } },
  schwert: { w: { data: { mode: 'schwert', druck: 55 } } },
  schwert_voll: { w: { data: { mode: 'schwert', druck: 100 } } },
  tot: { w: { data: { mode: 'axt', druck: 0 } } },
  warn: { w: { data: { mode: 'schwert', druck: 9 } } },
  blitz: { w: { data: { mode: 'schwert', druck: 0, blitzT: 0.3 } } },
  glitch: { w: { data: { mode: 'schwert', druck: 70, glitchVis: true } } },
  fehl: { w: { data: { mode: 'axt', druck: 0 }, move: { anim: 'ga_fehl' }, t: 0.2 } },
  kern: { w: { data: { mode: 'schwert', druck: 80 }, move: { anim: 'ga_finisher' }, t: 0.6 } },
  entlad: { w: { data: { mode: 'schwert', druck: 0 }, move: { anim: 'ga_entlad' }, t: 0.5 } },
};
async function gaShots() {
  const only = (process.env.GA_STATES || Object.keys(GA_STATES).join(',')).split(',');
  for (const name of only) {
    const stt = GA_STATES[name];
    await page.evaluate(([steps, stt, yaw]) => {
      window.__SH.app.renderer.setResolution(1700);
      const sc = window.__SH.app.scene;
      sc.show(steps.map(([tier, branch]) => ({ gear: { weapon: { type: 'ga', tier, branch } }, weaponOnly: true, yaw, w: JSON.parse(JSON.stringify(stt.w)) })), { spacing: 1.75, cam: [0, 3.05, 7.4], look: [0, 3.05, 0], fov: 38 });
      window.__SH.pause(true);
    }, [STEPS, stt, Number(process.env.YAW ?? 0.9)]);
    await page.evaluate(() => window.__SH.step(45));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/look-ga-${name}.png` });
  }
}
if (types.includes('ga')) { await gaShots(); types.splice(types.indexOf('ga'), 1); }
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
