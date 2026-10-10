// Rostwerke + Interactables im echten Spiel: Ventil/Kran/Ableiter auslösen, Status prüfen, Screenshot.
//   SH_URL=... node tools/rost-probe.mjs [quest=jaggo] [out.png]
import { open } from './pw-lib.mjs';
const quest = process.argv[2] || 'jaggo';
const { browser, page, errors } = await open(`scene=hunt&quest=${quest}&world=rostwerke&god=1&seed=2`);
await page.evaluate(() => document.querySelector('[data-a="ok"]')?.click());
const r = await page.evaluate(() => {
  const SH = window.__SH, h = SH.hunt, p = h.player, ia = h.interact, w = h.world;
  const out = { world: w.id, zones: [1, 2, 3, 4].map((z) => z), list: ia?.list?.length, types: {} };
  for (const e of ia?.list ?? []) out.types[e.type] = (out.types[e.type] ?? 0) + 1;
  const ev = {}; for (const k of ['valveBurst', 'craneDrop', 'rodDestroyed']) h.bus.on(k, () => { ev[k] = (ev[k] ?? 0) + 1; });
  for (const type of ['valve', 'crane', 'rod']) {
    const e = ia.list.find((x) => x.type === type);
    p.pos.set(e.x + 1.5, w.heightAt(e.x + 1.5, e.z), e.z);
    SH.sim(2);
    const lbl = h.contextLabel;
    for (let i = 0; i < 3; i++) { ia.use(p, e.id); SH.sim(30); }
    out[type] = lbl;
  }
  SH.sim(120);
  out.events = ev; out.gather = w.gatherPoints.length; out.ground = [w.groundType(p.pos.x, p.pos.z)];
  out.music = h.world.id === 'rostwerke';
  return out;
});
console.log(JSON.stringify(r));
await page.evaluate(() => window.__SH.step(1));
await page.screenshot({ path: process.argv[3] || 'rost.png' });
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
