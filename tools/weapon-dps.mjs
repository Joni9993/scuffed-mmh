// Headless-ish DPS comparison (gs / db / bow) against a frozen Jaggo via window.__SH.sim.
// Usage: start 'npm run dev', then: SH_URL=http://127.0.0.1:5173/ node tools/weapon-dps.mjs [frozen|aggro] [filter|-] [seconds] [fin]
// Needs playwright (e.g. NODE_PATH or /opt/node-tools). Not part of the build.
import { open } from './pw-lib.mjs';
const mode = process.argv[2] || 'frozen';
const secs = Number(process.argv[4] || 40);
const useFin = process.argv[5] === 'fin';
const strategies = {
  gs_mash: { replace: true, weapon: 'gs', dist: 2.6, prog: 'mash' },
  gs_charge: { replace: true, weapon: 'gs', dist: 2.8, prog: 'gs_charge' },
  db_mash: { weapon: 'db', dist: 2.2, prog: 'mash' },
  db_rausch: { weapon: 'db', dist: 2.2, prog: 'mash', rausch: true },
  bow_quick: { weapon: 'bow', dist: 11, prog: 'bow_quick' },
  bow_charge: { weapon: 'bow', dist: 11, prog: 'bow_charge' },
  bow_quick_body: { weapon: 'bow', dist: 11, prog: 'bow_quick', lockIdx: 1 },
  bow_charge_body: { weapon: 'bow', dist: 11, prog: 'bow_charge', lockIdx: 1 },
  bow_close: { weapon: 'bow', dist: 5, prog: 'bow_quick' },
};
const only = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
for (const [name, s] of Object.entries(strategies)) {
  if (only && !name.includes(only)) continue;
  const { browser, page, errors } = await open(`scene=hunt&quest=jaggo&weapon=${s.weapon}&seed=1&nofx=1&god=1${mode === 'aggro' ? '&aggro=1' : ''}`);
  const res = await page.evaluate(({ s, mode, secs, useFin }) => {
    const SH = window.__SH, h = SH.hunt, p = h.player, m = h.mainMonster, inp = SH.input;
    if (mode === 'frozen') { m.update = () => {}; }
    m.hp = m.maxHp = 1e7; m.rageUsed = true; m.rageCd = 1e9;
    const place = () => {
      const hd = m.lockPoints()[0].pos;
      const dx = hd.x - m.pos.x, dz = hd.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
      p.pos.x = hd.x + (dx / d) * (s.dist - 0.6); p.pos.z = hd.z + (dz / d) * (s.dist - 0.6);
      p.pos.y = h.world.heightAt(p.pos.x, p.pos.z);
    };
    if (mode === 'frozen') { place(); }
    p.lock = { monster: m, idx: s.lockIdx ?? 0 };
    const set = (a, b) => { inp.set('attack', a, 'bot'); inp.set('special', b, 'bot'); };
    let A = false, B = false, phase = 0, pt = 0, fin = 0, finHold = 0;
    const N = 60 * secs;
    const dmg0 = h.stats.damage;
    const hist = [];
    for (let i = 0; i < N; i++) {
      if (mode === 'frozen' && p.state === 'free' && !p.weapon.busy && s.replace) place();
      const w = p.weapon;
      A = false; B = false;
      switch (s.prog) {
        case 'mash': A = (i % 6) < 3 && !(s.rausch && i < 20); break;
        case 'gs_charge': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 1.62) { phase = 1; pt = 0; } } else { A = false; if (pt >= 0.3) { phase = 0; pt = 0; } } break; }
        case 'bow_quick': A = (i % 21) < 3; break;
        case 'bow_charge': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 0.95) { phase = 1; pt = 0; } } else { A = false; if (pt >= 0.12) { phase = 0; pt = 0; } } break; }
      }
      if (s.rausch && i >= 1 && i < 6) B = true;
      if (useFin && w.wucht >= 100 && s.weapon === 'db' && finHold === 0 && w.moveId !== 'db_finisher') finHold = 24;
      if (finHold > 0) { B = true; A = false; finHold--; }
      else if (useFin && w.wucht >= 100 && s.weapon !== 'db') { B = (i % 4) < 2; A = false; }
      if (w.moveId === 'db_finisher' || w.moveId === 'gs_finisher' || w.moveId === 'b_finisher') fin++;
      set(A, B);
      SH.sim(1);
      if (i % 600 === 599) hist.push(Math.round(h.stats.damage - dmg0) + (w.data.rausch ? "R" : ""));
    }
    set(false, false);
    return { dmg: h.stats.damage - dmg0, hits: h.stats.hits, hist, wucht: p.weapon.wucht, fin, stamina: p.v.stamina };
  }, { s, mode, secs, useFin });
  console.log(name.padEnd(11), 'dps', (res.dmg / secs).toFixed(1), 'hits', res.hits, 'cum/10s', res.hist.join(','), 'finFrames', res.fin, 'stam', Math.round(res.stamina), errors.length ? errors.slice(0, 2) : '');
  await browser.close();
}
