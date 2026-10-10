// Metrik Brocken 2.0: verschiedene 3er-Angriffsfolgen pro simulierter Jagd (GDD §16.8).
// Läuft nur mit METRIC=1 (Ausgabe als Tabelle): METRIC=1 npx vitest run tests/unit/variety.metric.test.js
import { describe, it } from 'vitest';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { barrotz } from '../../src/game/monsters/barrotz.js';
import { brathalos } from '../../src/game/monsters/brathalos.js';
import { Player } from '../../src/game/player.js';
import { time } from '../../src/core/time.js';
import { makeCtx, DT } from './p3helpers.js';

const RUN = !!process.env.METRIC;
const SECS = 240, SEEDS = [1, 2, 3, 4, 5];

function sim(def, seed) {
  time.reset();
  const ctx = makeCtx(seed);
  const m = new Monster(def, ctx, { id: def.id, x: 0, z: 0, state: 'combat', seed });
  ctx.monsters.push(m);
  const p = new Player({ ctx });
  p.god = true;
  p.spawnAt(0, 8, Math.PI);
  ctx.players.push(p);
  m.target = p;
  const seq = [];
  ctx.bus.on('monsterAttack', (e) => seq.push(e.attackId));
  for (let t = 0; t < SECS; t += DT) {
    // Pirscher kreist mit wechselnder Distanz (3–20 m) um den Brocken
    const r = 11.5 + 8.5 * Math.sin(t * 0.21 + seed), a = t * 0.35;
    p.pos.x = m.pos.x + Math.sin(a) * r; p.pos.z = m.pos.z + Math.cos(a) * r;
    ctx.input.poll(DT); p.update(DT); m.update(DT);
    if (m.hp < m.maxHp * 0.5) m.hp = m.maxHp * 0.5; // nicht fliehen
  }
  const tri = new Set();
  for (let i = 0; i + 2 < seq.length; i++) tri.add(seq.slice(i, i + 3).join('>'));
  return { n: seq.length, moves: new Set(seq).size, tri: tri.size };
}

describe.skipIf(!RUN)('Metrik: Vielfalt der Angriffsfolgen', () => {
  it('jaggo / barrotz / brathalos', () => {
    const rows = [];
    for (const def of [jaggo, barrotz, brathalos]) {
      const r = SEEDS.map((s) => sim(def, s));
      const avg = (k) => (r.reduce((s, x) => s + x[k], 0) / r.length).toFixed(1);
      rows.push(`${def.id.padEnd(10)} Angriffe/${SECS}s ${avg('n')}  versch. Moves ${avg('moves')}  versch. 3er-Folgen ${avg('tri')}`);
    }
    console.log('\n' + rows.join('\n'));
  }, 300000);
});
