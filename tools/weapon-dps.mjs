// DPS comparison (gs / db / bow / kk) against a frozen Brocken via window.__SH.sim. Ideal play, god on, tier 1 weapons.
// Usage: npm run dev (port 5173), then: SH_URL=http://127.0.0.1:5173/ node tools/weapon-dps.mjs [quest=jaggo] [seconds=40] [tier=1]
// ONLY=kk: nur diese Strategien. BUFF=r3: Krachkiste-Buff dauerhaft (Rot Stufe 3). GLITCH=1: Glitch-Modus dauerhaft (bei Ende sofort neu starten) → Faktor gegen normal. QUICK=1: kleiner Sweep.
// Melee strategies are swept over all lockable parts and distances; the best (part, distance) is reported. Needs playwright (/opt/node-tools).
import { open } from './pw-lib.mjs';
const quest = process.argv[2] || 'jaggo';
const secs = Number(process.argv[3] || 40);
const strategies = [
  { name: 'gs_mash', weapon: 'gs', prog: 'mash', dists: [2.2, 2.8, 3.4], melee: true },
  { name: 'gs_charge', weapon: 'gs', prog: 'gs_charge', dists: [2.4, 3.0], melee: true },
  { name: 'db_mash', weapon: 'db', prog: 'mash', dists: [1.6, 2.2], melee: true },
  { name: 'db_rausch', weapon: 'db', prog: 'rausch', dists: [1.6, 2.2], melee: true },
  { name: 'bow_quick', weapon: 'bow', prog: 'bow_quick', dists: [11], melee: false },
  { name: 'bow_charge3', weapon: 'bow', prog: 'bow_charge3', dists: [11], melee: false },
  { name: 'bow_charge2', weapon: 'bow', prog: 'bow_charge2', dists: [11], melee: false },
  // [KK] Krachkiste: A-Kette (stumpf), Aufdrehen-Zyklus (Voll aufgedreht), Mischung Kette + Voll. Ideal-DPS ohne Buffs (B/Abspielen nie benutzt).
  { name: 'kk_mash', weapon: 'kk', prog: 'mash', dists: [2.2, 2.8], melee: true },
  { name: 'kk_voll', weapon: 'kk', prog: 'kk_voll', dists: [2.2, 2.8], melee: true },
  { name: 'kk_mix', weapon: 'kk', prog: 'kk_mix', dists: [2.2, 2.8], melee: true },
];
const tier = Number(process.argv[4] || 1);
async function run(s, dist, lockIdx) {
  const { browser, page, errors } = await open(`scene=hunt&quest=${quest}&weapon=${s.weapon}&seed=1&nofx=1&god=1`);
  const res = await page.evaluate(({ s, dist, lockIdx, secs, tier, glitch, buff }) => {
    const SH = window.__SH, h = SH.hunt, p = h.player, m = h.mainMonster, inp = SH.input;
    if (tier > 1 && p.stats) { /* power override via weapon stats */ }
    m.update = () => {}; m.hp = m.maxHp = 1e8;
    const nLock = m.lockPoints().length;
    if (lockIdx >= nLock) return null;
    const place = () => {
      const hd = m.lockPoints()[lockIdx].pos;
      const dx = hd.x - m.pos.x, dz = hd.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
      p.pos.x = hd.x + (dx / d) * (dist - 0.6); p.pos.z = hd.z + (dz / d) * (dist - 0.6);
      p.pos.y = h.world.heightAt(p.pos.x, p.pos.z);
    };
    place();
    if (buff) { p.buffs = {}; for (const [, c, l] of buff.matchAll(/([rbg])(\d)/g)) p.buffs[c] = { lvl: Number(l), t: 1e9 }; p.v.buffMul = 1; } // [KK] BUFF=r3 -> Rot Stufe 3 dauerhaft (Angriff +20 %)
    p.lock = { monster: m, idx: lockIdx };
    const set = (a, b) => { inp.set('attack', a, 'bot'); inp.set('special', b, 'bot'); };
    let phase = 0, pt = 0, rausch = false, toggle = 0;
    const N = 60 * secs, dmg0 = h.stats.damage;
    for (let i = 0; i < N; i++) {
      if (p.state === 'free' && !p.weapon.busy && s.melee) place();
      const w = p.weapon;
      let A = false, B = false;
      switch (s.prog) {
        case 'mash': A = (i % 6) < 3; break;
        case 'rausch': {
          A = (i % 6) < 3;
          if (toggle > 0) { toggle--; B = true; A = false; }
          else if (!w.data.rausch && p.v.stamina > 85 && !p.v.exhaust) toggle = 3;
          else if (w.data.rausch && p.v.stamina < 12) toggle = 3;
          break;
        }
        case 'gs_charge': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 1.62) { phase = 1; pt = 0; } } else if (pt >= 0.3) { phase = 0; pt = 0; } break; }
        case 'kk_voll': { pt += 1 / 60; if (phase === 0) { A = true; if (pt >= 0.9) { phase = 1; pt = 0; } } else if (pt >= 0.1) { phase = 0; pt = 0; } break; } // [KK] 0,9 s halten = Voll aufgedreht
        case 'kk_mix': { // [KK] Kette (3 Schlaege), dann ein Voll-aufgedreht-Stampfer
          pt += 1 / 60;
          if (phase === 0) { A = (i % 12) < 4; if (w.moveId === 'kk_a3' && w.t > 0.62) { phase = 1; pt = 0; } }
          else if (phase === 1) { A = true; if (pt >= 0.9) { phase = 2; pt = 0; } }
          else if (pt >= 0.1) { phase = 0; pt = 0; }
          break;
        }
        case 'bow_quick': A = (i % 21) < 3; break;
        case 'bow_charge3': case 'bow_charge2': {
          const hold = s.prog === 'bow_charge3' ? 0.95 : 0.5;
          pt += 1 / 60;
          if (phase === 0) { A = true; if (pt >= hold) { phase = 1; pt = 0; } } else if (pt >= 0.5) { phase = 0; pt = 0; }
          break;
        }
      }
      set(A, B);
      if (glitch && !p.glitching) { p.glitch.energy = 100; inp.set('glitch', true, 'bot'); } else if (glitch) inp.set('glitch', false, 'bot');
      SH.sim(1);
    }
    set(false, false);
    return { dps: (h.stats.damage - dmg0) / secs, hits: h.stats.hits, stam: p.v.stamina, nLock };
  }, { s, dist, lockIdx, secs, tier, glitch: !!process.env.GLITCH, buff: process.env.BUFF || '' });
  await browser.close();
  return res;
}
const out = [];
for (const s of strategies) {
  if (process.env.ONLY && !s.name.startsWith(process.env.ONLY)) continue; // [KK] ONLY=kk -> nur diese Waffe
  let best = null;
  for (const d of process.env.QUICK ? s.dists.slice(0, 1) : s.dists) {
    for (let li = 0; li < (process.env.QUICK ? 2 : s.melee ? 6 : 2); li++) {
      const r = await run(s, d, li);
      if (!r) break;
      if (!best || r.dps > best.dps) best = { ...r, dist: d, lockIdx: li };
    }
  }
  out.push([s.name, best]);
  console.log(s.name.padEnd(12), 'dps', best.dps.toFixed(1), 'part#', best.lockIdx, 'dist', best.dist, 'hits', best.hits, 'stam', Math.round(best.stam));
}
if (process.env.ONLY) process.exit(0);
const g = Math.max(...out.filter((o) => o[0].startsWith('gs')).map((o) => o[1].dps));
const d = Math.max(...out.filter((o) => o[0].startsWith('db')).map((o) => o[1].dps));
const b = Math.max(...out.filter((o) => o[0].startsWith('bow')).map((o) => o[1].dps));
const k = Math.max(...out.filter((o) => o[0].startsWith('kk')).map((o) => o[1].dps)); // [KK]
console.log(`BEST gs ${g.toFixed(1)}  db ${d.toFixed(1)} (${((d / g) * 100).toFixed(0)}%)  bow ${b.toFixed(1)} (${((b / g) * 100).toFixed(0)}%)  kk ${k.toFixed(1)} (${((k / g) * 100).toFixed(0)}%)`);
