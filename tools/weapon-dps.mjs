// Headless-ish DPS comparison (gs / db / bow / kt) against a frozen Jaggo via window.__SH.sim.
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
  // [KT] katana: chain mash, Ziehschnitt cycle (Blankgezogen), and chain + a Konter every N s (injected monster hit at stance t = 0.12 s)
  gs_mash_body: { replace: true, weapon: 'gs', dist: 2.6, prog: 'mash', lockIdx: 1, placeIdx: 1 },
  gs_charge_body: { replace: true, weapon: 'gs', dist: 2.8, prog: 'gs_charge', lockIdx: 1, placeIdx: 1 },
  kt_mash_body: { replace: true, weapon: 'kt', dist: 2.2, prog: 'mash', lockIdx: 1, placeIdx: 1 },
  kt_blank_body: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_blank', lockIdx: 1, placeIdx: 1 },
  kt_mix_body: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_mix', lockIdx: 1, placeIdx: 1 },
  kt_mixcounter8_body: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_mix', counterEvery: 8, lockIdx: 1, placeIdx: 1 },
  kt_played_well: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_mix', counterEvery: 8, lockIdx: 1, placeIdx: 1, schliff: 3 }, // chain + Ziehschnitt + a Konter every 8 s, Schliff 3 kept up
  kt_played_well6: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_mix', counterEvery: 6, lockIdx: 1, placeIdx: 1, schliff: 3 },
  kt_mix_body_s3: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_mix', lockIdx: 1, placeIdx: 1, schliff: 3 },
  kt_blank_body_s3: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_blank', lockIdx: 1, placeIdx: 1, schliff: 3 },
  kt_mash_body_s3: { replace: true, weapon: 'kt', dist: 2.2, prog: 'mash', lockIdx: 1, placeIdx: 1, schliff: 3 },
  kt_mash: { replace: true, weapon: 'kt', dist: 2.2, prog: 'mash' },
  kt_blank: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_blank' },
  kt_counter10: { replace: true, weapon: 'kt', dist: 2.2, prog: 'mash', counterEvery: 10 },
  kt_counter6: { replace: true, weapon: 'kt', dist: 2.2, prog: 'mash', counterEvery: 6 },
  kt_mixcounter8: { replace: true, weapon: 'kt', dist: 2.2, prog: 'kt_mix', counterEvery: 8 },
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
      const hd = m.lockPoints()[s.placeIdx ?? 0].pos; // [KT] placeIdx: aim placement at body (1) instead of head (0)
      const dx = hd.x - m.pos.x, dz = hd.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
      p.pos.x = hd.x + (dx / d) * (s.dist - 0.6); p.pos.z = hd.z + (dz / d) * (s.dist - 0.6);
      p.pos.y = h.world.heightAt(p.pos.x, p.pos.z);
    };
    if (mode === 'frozen') { place(); }
    p.lock = { monster: m, idx: s.lockIdx ?? 0 };
    const set = (a, b) => { inp.set('attack', a, 'bot'); inp.set('special', b, 'bot'); };
    let A = false, B = false, phase = 0, pt = 0, fin = 0, finHold = 0, cEv = 0, counters = 0;
    const N = 60 * secs;
    const dmg0 = h.stats.damage;
    const hist = [];
    for (let i = 0; i < N; i++) {
      if (mode === 'frozen' && p.state === 'free' && !p.weapon.busy && s.replace) place();
      const w = p.weapon;
      if (s.weapon === 'kt' && mode === 'frozen' && ['kt_konter', 'kt_zieh', 'kt_gleit'].includes(w.moveId) && w.t > 0.2) place(); // [KT] lunges: step back into range
      if (s.schliff && i === 0) { w.data.schliff = s.schliff; w.data.schliffT = 1e9; } // [KT] steady-state Schliff (counters keep it up)
      A = false; B = false;
      switch (s.prog) {
        case 'mash': A = (i % 6) < 3 && !(s.rausch && i < 20); break;
        case 'gs_charge': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 1.62) { phase = 1; pt = 0; } } else { A = false; if (pt >= 0.3) { phase = 0; pt = 0; } } break; }
        case 'kt_blank': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 0.67) { phase = 1; pt = 0; } } else { A = false; if (pt >= 0.1) { phase = 0; pt = 0; } } break; } // [KT]
        case 'kt_mix': { // [KT] 3 chain cuts, then a Blankgezogen draw
          pt += 1 / 60;
          if (phase === 0) { A = (i % 12) < 4; if (w.moveId === 'kt_a3' && w.t > 0.3) { phase = 1; pt = 0; } }
          else if (phase === 1) { A = true; if (pt >= 0.67) { phase = 2; pt = 0; } }
          else { A = false; if (pt >= 0.3) { phase = 0; pt = 0; } }
          break;
        }
        case 'bow_quick': A = (i % 21) < 3; break;
        case 'bow_charge': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 0.95) { phase = 1; pt = 0; } } else { A = false; if (pt >= 0.12) { phase = 0; pt = 0; } } break; }
      }
      if (s.counterEvery) { // [KT]
        if (i > 0 && i % (60 * s.counterEvery) === 0) cEv = 1;
        if (cEv === 1 && w.moveId !== 'kt_stance') { B = (i % 8) < 3; A = false; }
        if (cEv === 1 && w.moveId === 'kt_stance') cEv = 2;
        if (cEv === 2 && w.moveId === 'kt_stance' && w.t >= 0.12) { p.takeHit({ dmg: 20, key: 'dps' + i, sourcePos: { x: m.pos.x, y: 0, z: m.pos.z }, monster: m, attackId: 'dps' }); cEv = 0; counters++; }
        if (cEv === 2 && w.moveId !== 'kt_stance') cEv = 0;
      }
      if (s.rausch && i >= 1 && i < 6) B = true;
      if (useFin && w.wucht >= 100 && (s.weapon === 'db' || s.weapon === 'kt') && finHold === 0 && w.moveId !== 'db_finisher' && w.moveId !== 'kt_finisher') finHold = 24;
      if (finHold > 0) { B = true; A = false; finHold--; }
      else if (useFin && w.wucht >= 100 && s.weapon !== 'db' && s.weapon !== 'kt') { B = (i % 4) < 2; A = false; }
      if (w.moveId === 'db_finisher' || w.moveId === 'gs_finisher' || w.moveId === 'b_finisher' || w.moveId === 'kt_finisher') fin++;
      set(A, B);
      SH.sim(1);
      if (i % 600 === 599) hist.push(Math.round(h.stats.damage - dmg0) + (w.data.rausch ? "R" : ""));
    }
    set(false, false);
    return { dmg: h.stats.damage - dmg0, hits: h.stats.hits, hist, wucht: p.weapon.wucht, fin, stamina: p.v.stamina, counters };
  }, { s, mode, secs, useFin });
  console.log(name.padEnd(11), 'dps', (res.dmg / secs).toFixed(1), 'hits', res.hits, 'cum/10s', res.hist.join(','), 'finFrames', res.fin, 'counters', res.counters, 'stam', Math.round(res.stamina), errors.length ? errors.slice(0, 2) : '');
  await browser.close();
}
