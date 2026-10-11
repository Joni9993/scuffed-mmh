// Waffen-Optik je Stufe/Ast nebeneinander (gearlab, weaponOnly): Stufe 1, 2, 3a, 3b, 4, 5k, 5g, 5v, 6.
//   SH_URL=http://127.0.0.1:8195/ node tools/weapon-looks.mjs <outdir> [gs,db,bow,kt,kk]   -> look-gs.png, look-db.png, look-bow.png ...
//   [KK] Krachkiste: KK_VIEW=back|front (Membran-Seite), KK_OPEN=1 (entfaltet beim Abspielen / 2 = Remix), KK_BAR=rbg (Sample-Kragen) -> look-kk[-front][-open].png
//        KK_ONLY=5k,6 (nur diese Stufen) + KK_MATRIX=1: je Stufe 4 Bilder (hinten zu / vorn zu / vorn offen / vorn Remix) gross -> look-kk-matrix.png
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const BASE = process.env.SH_URL || 'http://127.0.0.1:8195/';
const dir = process.argv[2] || '.';
const types = (process.argv[3] || 'gs,db,bow').split(',');
const KK = { matrix: !!process.env.KK_MATRIX, view: process.env.KK_VIEW || 'back', open: Number(process.env.KK_OPEN || 0), bar: (process.env.KK_BAR || '').split('') };
const kkSuffix = KK.matrix ? '-matrix' : (KK.view === 'front' ? '-front' : '') + (KK.open === 2 ? '-remix' : KK.open ? '-open' : '');
const ALL = { 1: [1, null], 2: [2, null], '3a': [3, 'a'], '3b': [3, 'b'], 4: [4, null], '5k': [5, 'k'], '5g': [5, 'g'], '5v': [5, 'v'], 6: [6, 'v'] };
const ONLY = process.env.KK_ONLY ? process.env.KK_ONLY.split(',') : Object.keys(ALL);
const STEPS = ONLY.map((k) => ALL[k]);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 2000, height: 640 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}?scene=gearlab`);
await page.waitForFunction(() => window.__SH?.app?.scene?.show, null, { timeout: 30000 });
for (const t of types) {
  await page.evaluate(([t, steps, KK]) => {
    window.__SH.app.renderer.setResolution(1700);
    const sc = window.__SH.app.scene;
    const bow = t === 'bow', db = t === 'db', kk = t === 'kk';
    const wOf = (open, view) => ({ move: open ? { anim: open === 2 ? 'kk_remix' : 'kk_play' } : null, t: open === 2 ? 0.55 : 0.5, data: { kk: { bar: KK.bar, pump: 0, pumpC: 'r' } } });
    if (kk && KK.matrix) {
      const variants = [[0, 'back'], [0, 'front'], [1, 'front'], [2, 'front']];
      const items = steps.flatMap(([tier, branch]) => variants.map(([open, view]) => ({ gear: { weapon: { type: t, tier, branch } }, weaponOnly: true, yaw: view === 'front' ? Math.PI - 0.3 : 0.4, w: wOf(open) })));
      sc.show(items, { spacing: 1.55, cam: [0, 3.15, 3.2 + items.length * 0.45], look: [0, 3.15, 0], fov: 38 });
    } else {
      const w = kk ? wOf(KK.open) : undefined;
      sc.show(steps.map(([tier, branch]) => ({ gear: { weapon: { type: t, tier, branch } }, weaponOnly: true, yaw: bow ? 0.8 : kk ? (KK.view === 'front' ? Math.PI - 0.5 : 0.4) : 0.35, w })), { spacing: db ? 1.8 : kk ? 1.3 : 1.95, cam: kk ? [0, 3.0, 6.6] : [0, bow ? 1.4 : db ? 2.9 : 3.3, bow ? 8.6 : db ? 7.4 : 10.8], look: [0, kk ? 3.0 : bow ? 1.3 : db ? 2.9 : 3.3, 0], fov: 38 });
    }
    window.__SH.pause(true);
  }, [t, STEPS, KK]);
  await page.evaluate((n) => window.__SH.step(n), t === 'kk' ? 40 : 3);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/look-${t}${t === 'kk' ? kkSuffix : ''}.png` });
}
await browser.close();
