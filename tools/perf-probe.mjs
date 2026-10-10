// Perf probe: renderer.info (draw calls, triangles, geometries, textures) at camp and in combat + JS allocation per sim step.
// Usage: npm run dev (5173), then: SH_URL=http://127.0.0.1:5173/ node tools/perf-probe.mjs [quest=brathalos] [weapon=bow]
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const quest = process.argv[2] || 'brathalos', weapon = process.argv[3] || 'bow';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${process.env.SH_URL || 'http://127.0.0.1:5173/'}?scene=hunt&quest=${quest}&weapon=${weapon}&seed=1&god=1${process.env.NOAMB ? '&noambient=1' : ''}`);
await page.waitForFunction(() => window.__SH && window.__SH.hunt, null, { timeout: 30000 });
await page.evaluate(() => window.__SH.pause(true));
const info = () => page.evaluate(() => {
  const SH = window.__SH, r = SH.app.renderer.renderer ?? SH.app.renderer.three ?? null;
  SH.step(2);
  const ri = (SH.app.renderer.info ?? r?.info);
  if (!ri) return null;
  return { calls: ri.render.calls, tris: ri.render.triangles, geos: ri.memory.geometries, tex: ri.memory.textures, progs: ri.programs?.length };
});
console.log('camp', JSON.stringify(await info()));
// combat: aggro monster next to the hunter, bot attacks
const alloc = await page.evaluate(() => {
  const SH = window.__SH, h = SH.hunt, m = h.mainMonster, p = h.player, inp = SH.input;
  m.target = p; m.discovered = true; m.setState('combat'); m.recover = 0;
  p.pos.set(m.pos.x + 6, m.pos.y, m.pos.z);
  p.lock = { monster: m, idx: 0 };
  SH.sim(120);
  const res = {};
  window.gc?.();
  const h0 = performance.memory?.usedJSHeapSize ?? 0;
  const N = 600;
  for (let i = 0; i < N; i++) { inp.set('attack', (i % 40) < 3, 'bot'); SH.sim(1); }
  const h1 = performance.memory?.usedJSHeapSize ?? 0;
  inp.set('attack', false, 'bot');
  res.bytesPerStep = Math.round((h1 - h0) / N);
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) { inp.set('attack', (i % 40) < 3, 'bot'); SH.sim(1); }
  res.msPerSimStep = +((performance.now() - t0) / 300).toFixed(3);
  return res;
});
console.log('sim alloc', JSON.stringify(alloc));
console.log('combat', JSON.stringify(await info()));
await browser.close();
