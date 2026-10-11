// Krachkiste-Screenshots (gearlab + Jagd-HUD). Playwright-Chromium aus /opt/node-tools (siehe pw-lib.mjs).
//   SH_URL=http://127.0.0.1:5182/ node tools/kk-shots.mjs poses <outdir> [tier=1] [branch]   Pirscher in 8 Posen (Ruhe, Aufdrehen, Schwinger, Stampfer, Boden-Stampfer, Abspielen, Remix, Zugabe), von hinten
//   SH_URL=... node tools/kk-shots.mjs hud <outdir> [tier=1] [branch]                        Jagd-HUD: Sample-Leiste, Buff-Symbole, Boden-Ring
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.env.SH_URL || 'http://127.0.0.1:5173/';
const [mode = 'poses', dir = '.', tierArg = '1', branchArg = ''] = process.argv.slice(2);
const tier = Number(tierArg), branch = branchArg || null;
const ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ARGS });

if (mode === 'poses') {
  const page = await browser.newPage({ viewport: { width: 2000, height: 560 } });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto(`${BASE}?scene=gearlab`);
  await page.waitForFunction(() => window.__SH?.app?.scene?.show, null, { timeout: 30000 });
  await page.evaluate(([tier, branch]) => {
    window.__SH.app.renderer.setResolution(1700);
    const sc = window.__SH.app.scene;
    const P = [['kk_a1', 0.3, null], ['kk_wind', 0.25, null], ['kk_a3', 0.2, null], ['kk_a3', 0.58, null], ['kk_stampf', 0.46, null], ['kk_play', 0.5, 'kk_play'], ['kk_remix', 0.55, 'kk_remix'], ['kk_finisher', 0.85, null]];
    sc.show(P.map(([a, t, open]) => ({
      gear: { weapon: { type: 'kk', tier, branch } }, anim: [a, t], yaw: 0.5,
      w: { move: open ? { anim: open } : null, t: 0.5, data: { kk: { bar: ['r', 'b', 'g'], pump: 0, pumpC: 'r' } } },
    })), { spacing: 1.9, cam: [0, 2.6, -9.5], look: [0, 1.5, 0], fov: 38 });
    window.__SH.pause(true);
  }, [tier, branch]);
  await page.evaluate(() => window.__SH.step(40));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${dir}/poses-kk-${tier}${branch ?? ''}.png` });
}

if (mode === 'hud') {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}?scene=hunt&quest=jaggo&weapon=kk&seed=1&god=1&aggro=0`);
  await page.waitForFunction(() => window.__SH?.hunt, null, { timeout: 30000 });
  await page.click('.ob [data-a=never]').catch(() => {}); // erste-Jagd-Tipp wegklicken
  await page.evaluate(([tier, branch]) => {
    const SH = window.__SH, h = SH.hunt, p = h.player;
    if (tier > 1) { p.setWeapon('kk', tier, branch); }
    SH.pause(true);
    SH.sim(30);
    const w = p.weapon;
    w.data.kk = { bar: ['r', 'b', 'g'], sampledInst: -1, pump: 0, pumpC: 'r', echo: [], open: 0 };
    p.buffs = { r: { lvl: 2, t: 40 }, g: { lvl: 1, t: 12 } };
    window.__SH.step(4);
  }, [tier, branch]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/hud-kk-bar.png` });
  // Abspielen -> Boden-Ring + Beat
  await page.evaluate(() => {
    const SH = window.__SH, p = SH.hunt.player;
    SH.input.set('special', true, 'bot');
    SH.sim(2); SH.input.set('special', false, 'bot');
    SH.sim(32);
    SH.step(2);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/hud-kk-play.png` });
  console.log('errors', errors.length, errors.slice(0, 3));
}
await browser.close();
