// Brocken-Druck (Owner-Feedback Okt 2026: Kroll/Gorgo/Voltaro „Boxsäcke"). Misst, wie viel Schaden ein Brocken einem
// NICHT ausweichenden Pirscher pro Minute macht – nach der Rüstung, die man zu dem Zeitpunkt realistisch trägt.
// Modi: stand (Nahkampf, bleibt stehen), circle (Nahkampf, umkreist), range (Fernkampf, hält ~12 m).
// Phase 1 (volle HP) und Phase 2 (38 % HP). Tabelle: METRIC=1 npx vitest run tests/unit/bosspressure.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { Player } from '../../src/game/player.js';
import { time } from '../../src/core/time.js';
import { makeCtx, DT } from './p3helpers.js';

beforeEach(() => time.reset());

// Schutz-Summe, mit der man den Brocken typischerweise jagt (Set des Vorgängers, data/armor.js) -> Reduktion prot/(prot+80)
const EXPECTED_PROT = { jaggo: 36, barrotz: 54, brathalos: 72, kroll: 84, gorgo: 102, voltaro: 108 };
const red = (id) => EXPECTED_PROT[id] / (EXPECTED_PROT[id] + 80);
const T = 120, SEEDS = [3, 7, 11];

export function pressure(id, mode, seed, hpFrac = 1) {
  const ctx = makeCtx(seed);
  const m = new Monster(getMonsterDef(id), ctx, { id, x: 0, z: 0, yaw: 0, state: 'combat', seed });
  ctx.monsters.push(m);
  const p = new Player({ ctx }); p.spawnAt(0, 5, Math.PI); ctx.players.push(p); m.target = p;
  p.god = true;
  let dmg = 0, ang = 0;
  const orig = p.takeHit.bind(p);
  p.takeHit = (h) => { const r = orig(h); if (h.dmg > 0 && r !== 'iframe' && r !== 'ignored') dmg += h.dmg * (h.dmgMul ?? 1); return r; };
  const want = mode === 'range' ? 12 : 4.5;
  for (let t = 0; t < T; t += DT) {
    const dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    if (mode === 'circle') { ang += DT * 0.35; p.pos.x = m.pos.x + Math.sin(ang) * want; p.pos.z = m.pos.z + Math.cos(ang) * want; }
    else if (d > want + 1.5 || (mode === 'range' && d < want - 3)) { p.pos.x = m.pos.x + dx / d * want; p.pos.z = m.pos.z + dz / d * want; }
    ctx.input.poll(DT); p.update(DT);
    m.update(DT);
    if (m.hp < m.maxHp * hpFrac * 0.97 || m.hp > m.maxHp * hpFrac) m.hp = m.maxHp * hpFrac;
  }
  return dmg / (T / 60);
}

/** Effektiver Schaden/min (nach erwarteter Rüstung), gemittelt über Seeds. */
export function effective(id, mode, hpFrac = 1) {
  return SEEDS.reduce((a, s) => a + pressure(id, mode, s, hpFrac), 0) / SEEDS.length * (1 - red(id));
}

const OLD = ['jaggo', 'barrotz', 'brathalos'], NEW = ['kroll', 'gorgo', 'voltaro'];

describe('Brocken-Druck', () => {
  const tab = {};
  const get = (id) => (tab[id] ??= {
    stand: effective(id, 'stand'), circle: effective(id, 'circle'), range: effective(id, 'range'), p2: effective(id, 'circle', 0.38),
  });
  it('Tabelle (METRIC=1)', () => {
    if (!process.env.METRIC) return;
    for (const id of [...OLD, ...NEW]) { const r = get(id); console.log(`${id.padEnd(10)} stand=${r.stand.toFixed(0)} circle=${r.circle.toFixed(0)} range=${r.range.toFixed(0)} p2circle=${r.p2.toFixed(0)}`); }
  }, 300000);
  // JR-4/5/6-Brocken müssen mehr Druck machen als die Eröffnungs-Brocken (Mittel Jaggo/Barrotz/Brathalos), in jeder Distanz
  it.each(NEW)('%s macht mehr Druck als die Eröffnungs-Brocken', (id) => {
    const r = get(id), avg = (k) => OLD.reduce((a, o) => a + get(o)[k], 0) / OLD.length;
    const mean = (x) => (x.stand + x.circle + x.range) / 3;
    expect(mean(r)).toBeGreaterThan(1.25 * OLD.reduce((a, o) => a + mean(get(o)), 0) / OLD.length);
    expect(r.circle).toBeGreaterThan(avg('circle'));
    expect(r.range).toBeGreaterThan(0.8 * avg('range'));
    expect(r.p2).toBeGreaterThan(r.circle); // Phase 2 wird gefährlicher, nicht leichter
  }, 300000);
});
