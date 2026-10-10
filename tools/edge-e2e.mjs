// Edge-to-edge check (Playwright): canvas / stage / ui layers cover the whole viewport even with safe-area insets
// (CDP Emulation.setSafeAreaInsetsOverride), HUD elements stay inside the insets.
// Run: SH_URL=http://127.0.0.1:5180/ node tools/edge-e2e.mjs [outdir]
import { createRequire } from 'module';
import { mkdirSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium, devices } = require('playwright');
const URL0 = process.env.SH_URL || 'http://127.0.0.1:5180/';
const OUT = process.argv[2] || '/tmp/sh-shots'; mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const CASES = [
  { name: 'pixel7-noinset', w: 844, h: 390, ins: { top: 0, left: 0, right: 0, bottom: 0 } },
  { name: 'notch-landscape', w: 844, h: 390, ins: { top: 0, left: 47, right: 47, bottom: 21 } },
  { name: 'topcutout', w: 915, h: 412, ins: { top: 32, left: 0, right: 0, bottom: 0 } },
];
let shots = 0;
for (const c of CASES) {
  for (const scene of ['hub&mode=solo', 'hunt&seed=3']) {
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.ins }).catch((e) => console.log('no inset override', e.message));
    await page.goto(`${URL0}?scene=${scene}&nofs=1`);
    await page.waitForFunction(() => window.__SH && (window.__SH.town || window.__SH.hunt), null, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10); };
      const sel = ['html', 'body', '#stage', '#game', '#ui', '#fxlayer'];
      const out = { vw: innerWidth, vh: innerHeight, sat: getComputedStyle(document.documentElement).getPropertyValue('--sat'), boxes: {} };
      for (const s of sel) out.boxes[s] = R(document.querySelector(s));
      out.pad = ['html', 'body'].map((s) => getComputedStyle(document.querySelector(s)).padding);
      const hud = [...document.querySelectorAll('.hud-tl,.hud-tr,#touch .tbtn,.tmenu,.th-menu,.th-tl,.pause-btn,[data-act]')].map((e) => ({ c: e.className, b: R(e), vis: getComputedStyle(e).display !== 'none' })).filter((x) => x.vis && x.b && x.b[2] > x.b[0]);
      out.hud = hud;
      return out;
    });
    const tag = `${c.name}/${scene.split('&')[0]}`;
    for (const [s, b] of Object.entries(r.boxes)) {
      if (!b) continue;
      if (b[0] > 0.5 || b[1] > 0.5 || b[2] < r.vw - 0.5 || b[3] < r.vh - 0.5) { problems.push(`${tag}: ${s} does not cover viewport ${JSON.stringify(b)} vs ${r.vw}x${r.vh}`); }
    }
    if (r.pad.some((p) => p !== '0px')) problems.push(`${tag}: html/body padding ${r.pad}`);
    for (const h of r.hud) {
      const [l, t, rr, b] = h.b;
      if (l < c.ins.left - 0.5 || t < c.ins.top - 0.5 || rr > r.vw - c.ins.right + 0.5 || b > r.vh - c.ins.bottom + 0.5) problems.push(`${tag}: HUD ${h.c} outside insets ${JSON.stringify(h.b)}`);
    }
    console.log(tag, 'sat=' + r.sat.trim(), 'stage', JSON.stringify(r.boxes['#stage']), 'game', JSON.stringify(r.boxes['#game']), 'hud', r.hud.length);
    if (shots < 3 && c.name !== 'pixel7-noinset') { await page.screenshot({ path: `${OUT}/edge-${c.name}-${scene.split('&')[0]}.png` }); shots++; }
    await ctx.close();
  }
}
console.log(problems.length ? 'PROBLEMS\n' + problems.join('\n') : 'edge-to-edge OK');
await browser.close(); process.exit(problems.length ? 1 : 0);
