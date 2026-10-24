// Anti-Kite (docs/ANTIKITE.md): Jaggo, Barrotz, Blendax und Mampfaffe müssen auch Fernkämpfer und Umkreiser treffen.
// Messung = pressure() aus bosspressure.test.js (Schaden/min gegen nicht ausweichenden Pirscher, ohne Rüstung, Seeds 3 + 7).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { make, DT } from './p3helpers.js';
import { monsters } from '../../src/game/monsters/index.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { time } from '../../src/core/time.js';

beforeEach(() => time.reset());

// pressure() aus der Messlatte; dynamisch importiert, damit deren describe-Blöcke (Rostwerke-Vergleich) hier nicht ein zweites Mal laufen
let pressure;
beforeAll(async () => { ({ pressure } = await import('./bosspressure.test.js')); });

const SEEDS = [3, 7];
const avg = (id, mode) => SEEDS.reduce((a, s) => a + pressure(id, mode, s), 0) / SEEDS.length;
// Stand-Druck VOR dem Umbau (Messung Okt 2026): darf nicht sinken (Spannung aus Verhalten, nicht aus Abzügen)
const STAND_BEFORE = { jaggo: 399, barrotz: 756, blendax: 1256, mampfaffe: 1612 };
const NEW = {
  jaggo: ['jaggo_geroellwurf', 'jaggo_drehbiss', 'jaggo_fernsprung'],
  barrotz: ['barrotz_brockenwurf'],
  blendax: ['blendax_rauschregen', 'blendax_blink'],
  mampfaffe: ['mampfaffe_obstsalve', 'mampfaffe_dschungelbeben'],
};

describe('Anti-Kite: Druck auf Abstand', () => {
  it.each(Object.keys(STAND_BEFORE))('%s: range >= 30 %% und circle >= 40 %% von stand, stand sinkt nicht', (id) => {
    const stand = avg(id, 'stand'), circle = avg(id, 'circle'), range = avg(id, 'range');
    if (process.env.METRIC) console.log(`${id.padEnd(10)} stand=${stand.toFixed(0)} circle=${circle.toFixed(0)} range=${range.toFixed(0)}  (${(100 * circle / stand).toFixed(0)} % / ${(100 * range / stand).toFixed(0)} %)`);
    expect(stand).toBeGreaterThanOrEqual(STAND_BEFORE[id] - 1);
    expect(range).toBeGreaterThanOrEqual(0.3 * stand);
    expect(circle).toBeGreaterThanOrEqual(0.4 * stand);
  }, 300000);
});

describe('Anti-Kite: neue Angriffe halten die Projektregeln', () => {
  const rows = Object.entries(NEW).flatMap(([id, list]) => list.map((a) => [id, a]));
  it.each(rows)('%s / %s: Audit, Telegraph, Kette', (id, atkId) => {
    const def = monsters[id], atk = def.attacks[atkId];
    expect(atk, 'Angriff fehlt').toBeTruthy();
    expect(Array.isArray(atk.audit) && atk.audit.length > 0, 'audit:[Distanzen] fehlt').toBe(true);
    expect(atk.cue?.color && atk.cue?.tone, 'Farbcue + Windup-Ton').toBeTruthy();
    for (const rage of [false, true]) {
      const inst = new AttackInstance(atk, { attackId: atkId, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 5, rage });
      expect(inst.tgWall).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(inst.firstHitTime()).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    const inChain = Object.entries(def.chains).some(([k, v]) => k === atkId || v.some((o) => o.atk === atkId));
    expect(inChain, 'nicht in chains eingebunden').toBe(true);
  });

  it('Jaggo (Einsteiger): neue Moves kündigen >= 0,7 s an, auch in Rotglut und ohne Timing-Variation', () => {
    for (const atkId of NEW.jaggo) {
      const atk = monsters.jaggo.attacks[atkId];
      expect(atk.tgVar, 'feste Ankündigung').toBe(false);
      for (const rage of [false, true]) {
        const inst = new AttackInstance(atk, { attackId: atkId, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 12 }, seed: 5, rage });
        expect(inst.tgWall, `${atkId} rage=${rage}`).toBeGreaterThanOrEqual(0.7);
      }
    }
  });
});

describe('Anti-Kite: deterministisch (Host = Gast)', () => {
  const LOBS = ['jaggo_geroellwurf', 'barrotz_brockenwurf', 'blendax_rauschregen', 'mampfaffe_obstsalve'];
  it.each(LOBS)('%s: Wurfziele hängen nur an den Startparametern', (atkId) => {
    const id = atkId.split('_')[0];
    const { ctx, m } = make({ ...monsters[id], hp: 1e7 }, 'combat', 0, 12);
    const g = new Monster(m.def, ctx, { id: 'gast', authority: false, seed: 99 });
    const params = { attackId: atkId, t0: 1, origin: { x: 0, y: 0, z: 0 }, yaw: 0.2, targetPos: { x: 2, y: 0, z: 12 }, seed: 4242 };
    m.startAttack(params); g.startAttack(params);
    for (let t = 0; t < 2.2; t += DT) { m.attack && m._runAttack(DT); g.attack && g._runAttack(DT); m.projectiles.update(DT); g.projectiles.update(DT); }
    const defs = (x) => x.projectiles.list.map((p) => p.def);
    expect(defs(m).length).toBeGreaterThan(0);
    expect(defs(g)).toEqual(defs(m));
  });
  it('Vorhalt reist als targetPos mit (Host entscheidet, Gast liest nur)', () => {
    const { ctx, m, p } = make({ ...monsters.jaggo, hp: 1e7 }, 'combat', 0, 12);
    p.vel.x = 5; p.vel.z = 0;
    const out = [];
    ctx.bus.on('monsterAttack', (e) => out.push(e));
    m.beginAttack('jaggo_geroellwurf');
    expect(out[0].targetPos.x).toBeGreaterThan(p.pos.x + 1); // läuft nach +x -> Wurf zielt voraus
    const g = new Monster(m.def, ctx, { id: 'gast', authority: false, seed: 3 });
    expect(g.startAttack(out[0]).target).toEqual(out[0].targetPos);
  });
});
