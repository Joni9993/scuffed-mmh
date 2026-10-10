// Revierstreit: ?scene=hunt&quest=revierstreit&god=1, 60+ s simulieren; beide Brocken kämpfen, Bündnis, keine Konsolenfehler.
// SH_URL=http://127.0.0.1:8193/ node tools/revier-e2e.mjs [out.png]
import { open } from './pw-lib.mjs';
const { browser, page, errors } = await open('scene=hunt&quest=revierstreit&god=1&seed=1');
await page.evaluate(() => document.querySelector('[data-a="ok"]')?.click());
const r = await page.evaluate(() => {
  const SH = window.__SH, h = SH.hunt, out = { bosses: h.bosses.map((m) => m.id), hp0: h.bosses.map((m) => m.maxHp) };
  let hits = 0, ally = 0;
  h.bus.on('revierHit', () => hits++);
  h.bus.on('revierAlly', () => ally++);
  // Pirscher in die Nähe stellen (Uhr läuft), dann 70 s simulieren
  const m0 = h.bosses[0], p = h.player;
  p.pos.x = m0.pos.x - 30; p.pos.z = m0.pos.z;
  const snap = [];
  for (let s = 0; s < 70; s++) { SH.sim(60); p.pos.x = m0.pos.x - 30; p.pos.z = m0.pos.z; if (s === 20 || s === 40 || s === 65) snap.push(h.bosses.map((m) => Math.round(m.hp / m.maxHp * 100))); }
  out.hits = hits; out.ally = ally; out.phase = h.revier.phase; out.reason = h.revier.reason; out.hpPct = snap;
  out.targets = h.bosses.map((m) => m.target?.id ?? null);
  out.arrows = document.querySelectorAll('.hud-boss-arrow').length;
  return out;
});
console.log(JSON.stringify(r));
await page.screenshot({ path: process.argv[2] || 'revier.png' });
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
