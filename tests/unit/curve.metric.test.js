// Schwierigkeitskurve über alle 13 Brocken (docs/KURVE.md). Misst NACH erwarteter Rüstung (Set des Vorgängers, data/armor.js,
// Reduktion prot/(prot+80) wie bosspressure.test.js), dazu Angriffsfenster und erwartete Kampfdauer.
// Die Schleife run() ist die von bosspressure.test.js pressure() (nicht importiert: das würde dessen Tests mitlaufen lassen; gleiche Zahlen, geprüft Okt 2026).
// Tabelle: METRIC=1 npx vitest run tests/unit/curve.metric.test.js   (ONLY=krachfaust,brathalos zeigt nur diese Zeilen)
// Spalten: stand/circle/range = effektiver Schaden/min auf einen NICHT ausweichenden Pirscher (Ø Seeds) · idx = Mittel der drei Modi
//   p2 = circle bei 38 % HP · atk/min · Fenster% = Anteil Zeit in Leerlauf-Phasen >= 0,8 s (Erholung, Keuchen, Betäubung: man kann angreifen)
//   Keuch% = Anteil Keuchen · HP = Brocken-HP · min = erwartete Kampfdauer solo · Last = Schaden/Kampf ohne Ausweichen in Pirscher-HP
import { describe, it, expect } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { Player } from '../../src/game/player.js';
import { time } from '../../src/core/time.js';
import { ARMOR_SETS } from '../../src/data/armor.js';
import { weaponStats } from '../../src/data/weapons.js';
import { makeCtx, DT } from './p3helpers.js';

/** Brocken in Spielreihenfolge: [id, Map, Rüstungsset des Vorgängers, erwartete Waffenstufe]. */
export const ORDER = [
  ['jaggo', 'klamm', 'knochenkram', 1], ['barrotz', 'klamm', 'jaggo', 2], ['brathalos', 'klamm', 'barrotz', 3],
  ['kroll', 'rost', 'brathalos', 4], ['gorgo', 'rost', 'kroll', 5], ['voltaro', 'rost', 'gorgo', 5],
  ['blendax', 'smaragd', 'voltaro', 6], ['mampfaffe', 'smaragd', 'blendax', 6], ['krachfaust', 'smaragd', 'mampfaffe', 6],
  ['pyrostur', 'grat', 'krachfaust', 6], ['felsengroll', 'grat', 'pyrostur', 7], ['voltiris', 'grat', 'felsengroll', 7], ['gockelok', 'grat', 'voltiris', 7],
];
export const IDS = ORDER.map((o) => o[0]);
const GEAR = Object.fromEntries(ORDER.map(([id, , set]) => [id, set]));
const TIER = Object.fromEntries(ORDER.map(([id, , , t]) => [id, t]));
const SEEDS = [3, 7], T = 120;
const PLAYER_HP = 100; // Basis-Max-LP des Pirschers (ohne Essen) für „Last"

export const reduction = (id) => { const prot = 3 * ARMOR_SETS[GEAR[id]].prot; return prot / (prot + 80); };

/** Wie pressure() in bosspressure.test.js (gleiche Schleife), liefert zusätzlich Fenster-Kennzahlen. */
function run(id, mode, seed, hpFrac = 1) {
  time.reset();
  const ctx = makeCtx(seed);
  const m = new Monster(getMonsterDef(id), ctx, { id, x: 0, z: 0, yaw: 0, state: 'combat', seed });
  ctx.monsters.push(m);
  const p = new Player({ ctx }); p.spawnAt(0, 5, Math.PI); ctx.players.push(p); m.target = p;
  p.god = true;
  let dmg = 0, ang = 0, atk = 0, actT = 0, idle = 0, open = 0, tiredT = 0, prev = null;
  const orig = p.takeHit.bind(p);
  p.takeHit = (h) => { const r = orig(h); if (h.dmg > 0 && r !== 'iframe' && r !== 'ignored') dmg += h.dmg * (h.dmgMul ?? 1); return r; };
  ctx.bus.on('monsterAttack', () => { atk++; });
  const want = mode === 'range' ? 12 : 4.5;
  for (let t = 0; t < T; t += DT) {
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    if (mode === 'circle') { ang += DT * 0.35; p.pos.x = m.pos.x + Math.sin(ang) * want; p.pos.z = m.pos.z + Math.cos(ang) * want; }
    else if (d > want + 1.5 || (mode === 'range' && d < want - 3)) { p.pos.x = m.pos.x + dx / d * want; p.pos.z = m.pos.z + dz / d * want; }
    ctx.input.poll(DT); p.update(DT);
    m.update(DT);
    if (m.hp < m.maxHp * hpFrac * 0.97 || m.hp > m.maxHp * hpFrac) m.hp = m.maxHp * hpFrac;
    const busy = !!m.attack || !!m.chainNext;
    if (m.attack) actT += DT;
    if (m.tired) tiredT += DT;
    if (!busy) idle += DT; else { if (idle >= 0.8) open += idle; idle = 0; }
    prev = busy;
  }
  if (idle >= 0.8) open += idle;
  return { dmg: dmg / (T / 60), atk: atk / (T / 60), act: actT / T, open: open / T, tired: tiredT / T };
}

const avg = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
const cache = {};
/** Alle Kennzahlen eines Brockens (gecacht). Schäden schon NACH Rüstung. */
export function row(id) {
  if (cache[id]) return cache[id];
  const red = 1 - reduction(id);
  const modes = {};
  for (const mode of ['stand', 'circle', 'range']) modes[mode] = SEEDS.map((s) => run(id, mode, s));
  const p2 = SEEDS.map((s) => run(id, 'circle', s, 0.38));
  const hp = getMonsterDef(id).hp;
  const power = weaponStats('gs', TIER[id]).power;
  const min = hp / (50 * power / 80 * 0.45) / 60; // Idealer Plattmacher-DPS 50 (St. 1), 45 % Uptime (GDD 5.4) -> Minuten
  const stand = avg(modes.stand, 'dmg') * red, circle = avg(modes.circle, 'dmg') * red, range = avg(modes.range, 'dmg') * red;
  return (cache[id] = {
    id, stand, circle, range, idx: (stand + circle + range) / 3, p2: avg(p2, 'dmg') * red,
    atk: avg(modes.circle, 'atk'), open: avg(modes.circle, 'open'), tired: avg(modes.circle, 'tired'), act: avg(modes.circle, 'act'),
    hp, min, load: ((stand + circle) / 2) * min / PLAYER_HP,
  });
}

describe('Kurve über 13 Brocken', () => {
  it('Tabelle (METRIC=1)', () => {
    if (!process.env.METRIC) return;
    const f = (x) => x.toFixed(0).padStart(5);
    console.log('\nBrocken        stand circle range |   idx    p2 | atk/min Fenster% Keuch% Aktiv% |    HP   min  Last | Sprung idx');
    let prev = null;
    const only = process.env.ONLY?.split(',');
    for (const [id, map] of ORDER) {
      if (only && !only.includes(id)) continue;
      const r = row(id);
      const jump = prev ? (r.idx / prev.idx).toFixed(2) + 'x' : '   -';
      console.log(`${id.padEnd(11)}${map.padEnd(4)}${f(r.stand)} ${f(r.circle)} ${f(r.range)} | ${f(r.idx)} ${f(r.p2)} | ${r.atk.toFixed(1).padStart(7)} ${(r.open * 100).toFixed(0).padStart(8)} ${(r.tired * 100).toFixed(0).padStart(6)} ${(r.act * 100).toFixed(0).padStart(7)} | ${String(r.hp).padStart(5)} ${r.min.toFixed(1).padStart(5)} ${r.load.toFixed(1).padStart(5)} | ${jump}`);
      prev = r;
    }
  }, 900000);

  // Gates (Brocken in meiner Zuständigkeit; Schwellen aus docs/KURVE.md)
  it('Krachfaust: klar über Blendax/Mampfaffe, an der Smaragd-Spitze', () => {
    const k = row('krachfaust'), b = row('blendax'), m = row('mampfaffe');
    expect(k.idx).toBeGreaterThan(1.25 * Math.max(b.idx, m.idx));
    for (const mode of ['stand', 'circle', 'range']) expect(k[mode]).toBeGreaterThan(Math.max(b[mode], m[mode]));
    expect(k.p2).toBeGreaterThan(k.circle);
  }, 900000);

  it('Brathalos über Barrotz, umkreisen lohnt nicht', () => {
    const br = row('brathalos'), ba = row('barrotz');
    expect(br.idx).toBeGreaterThan(ba.idx);
    expect(br.circle).toBeGreaterThanOrEqual(0.4 * br.stand);
  }, 900000);

  it('Smaragd-Einstieg liegt über der Rostwerke-Spitze, Mampfaffe >= Blendax, Rostwerke steigen (Kroll <= Gorgo <= Voltaro, je 3 % Toleranz)', () => {
    const top = Math.max(row('kroll').idx, row('gorgo').idx, row('voltaro').idx);
    expect(row('blendax').idx).toBeGreaterThanOrEqual(1.05 * row('voltaro').idx);
    expect(row('blendax').idx).toBeGreaterThan(top);
    expect(row('mampfaffe').idx).toBeGreaterThanOrEqual(row('blendax').idx);
    expect(row('krachfaust').idx / row('mampfaffe').idx).toBeLessThanOrEqual(1.6);
    expect(row('kroll').idx).toBeLessThanOrEqual(1.03 * row('gorgo').idx);
    expect(row('gorgo').idx).toBeLessThanOrEqual(1.03 * row('voltaro').idx);
  }, 900000);

  it('keine Sprünge > 2x zwischen aufeinanderfolgenden Brocken in meiner Zuständigkeit', () => {
    const mine = new Set(['brathalos', 'kroll', 'gorgo', 'voltaro', 'krachfaust', 'pyrostur', 'felsengroll', 'voltiris', 'gockelok']);
    for (let i = 1; i < IDS.length; i++) if (mine.has(IDS[i]) && mine.has(IDS[i - 1])) expect(row(IDS[i]).idx / row(IDS[i - 1]).idx, `${IDS[i - 1]} -> ${IDS[i]}`).toBeLessThan(2.0);
    expect(row('pyrostur').idx / row('krachfaust').idx).toBeLessThan(2.0);
  }, 900000);
});
