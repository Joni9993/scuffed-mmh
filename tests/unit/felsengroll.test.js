import { describe, it, expect, beforeEach } from 'vitest';
import { felsengroll, FEL, crash } from '../../src/game/monsters/felsengroll.js';
import { addPillar, covered, pillarLive } from '../../src/game/monsters/felsengrollPillars.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { time } from '../../src/core/time.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());
const params = (id, rage = false, extra = {}) => ({ attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 8 }, yaw: 0, seed: 73, rage, ...extra });

describe('Felsengroll: armoured fortress', () => {
  it('has two thresholds, many chain families, no pressure meter and a bounded rig', () => {
    const { m } = make(felsengroll);
    expect(m.maxHp).toBe(24000);
    const moves = Object.values(felsengroll.attacks).filter((a) => a.id.startsWith('felsengroll_'));
    expect(moves.length).toBeGreaterThanOrEqual(22);
    expect(felsengroll.phases.map((p) => p.at)).toEqual([0.65, 0.3]);
    expect(Object.keys(felsengroll.chains).length).toBeGreaterThanOrEqual(8);
    let count = 0; m.mesh.traverse((n) => { if (n.isMesh) count++; });
    expect(count).toBeLessThanOrEqual(75);
    expect(felsengroll.chainMax).toBe(3);
    expect(felsengroll.aimTarget).toBeUndefined(); // fortress, not hunter: no lead aim
    expect(felsengroll.parts.filter((p) => p.breakHp).map((p) => p.id).sort()).toEqual(['club', 'shoulder']);
    for (const part of felsengroll.parts) for (const sp of part.spheres) expect(m.nodes[sp.node], sp.node).toBeTruthy();
  });

  it('transitions at 65% (Meteor) and 30% (Weltenbruch) and refills the armour', () => {
    const { m } = make(felsengroll); m.recover = 99; m.armor = 10; m.hp = m.maxHp * .64; m._b2Tick(1 / 60);
    expect(m.phase).toBe(1); expect(m.phaseSpecial).toBe('felsengroll_meteor'); expect(m.armor).toBe(100);
    m.hp = m.maxHp * .29; m._b2Tick(1 / 60);
    expect(m.phase).toBe(2); expect(m.phaseSpecial).toBe('felsengroll_weltenbruch');
  });

  it('armour halves plate damage (head excluded), opens the seams below 30 and exposes the core after a crash', () => {
    const { m } = make(felsengroll);
    felsengroll.tick(m, DT);
    const f = (id) => m.partById[id].factor;
    expect(f('head')).toBeCloseTo(m.partById.head.baseFactor);
    expect(f('body')).toBeCloseTo(m.partById.body.baseFactor * FEL.ARMOR_FACTOR);
    m.armor = 20; felsengroll.tick(m, DT);
    expect(f('body')).toBeCloseTo(m.partById.body.baseFactor);
    m.armor = 100; crash(m); felsengroll.tick(m, DT);
    expect(m.armor).toBe(40);
    expect(f('chest')).toBeCloseTo(m.partById.chest.baseFactor * FEL.EXPOSED_FACTOR);
    expect(f('body')).toBeCloseTo(m.partById.body.baseFactor * FEL.EXPOSED_FACTOR);
    expect(f('legs')).toBeCloseTo(m.partById.legs.baseFactor * FEL.ARMOR_FACTOR); // 40 >= 30: plates still closed
  });

  it('armour regenerates only while idle, faster in the last state', () => {
    const { m } = make(felsengroll); m.armor = 10; m.stagT = 0;
    for (let i = 0; i < 120; i++) felsengroll.tick(m, DT);
    expect(m.armor).toBeCloseTo(10 + 2 * FEL.ARMOR_REGEN, 0);
    m.armor = 10; m.phase = 2; for (let i = 0; i < 120; i++) felsengroll.tick(m, DT);
    expect(m.armor).toBeCloseTo(10 + 2 * FEL.ARMOR_REGEN_LAVA, 0);
    m.armor = 10; m.beginAttack('felsengroll_biss'); for (let i = 0; i < 30; i++) felsengroll.tick(m, DT);
    expect(m.armor).toBe(10);
  });

  it('shoulder break exposes a weak flank; breaking it mid-roll crashes him; club break removes the club moves', () => {
    const { m } = make(felsengroll);
    const hit = felsengroll.attacks.felsengroll_schulterstoss.hits[0];
    expect(felsengroll.hitDmgMul(m, hit)).toBe(1);
    m.beginAttack('felsengroll_rollangriff'); m.attack.t = m.attack.inst.wall(1.3); felsengroll.tick(m, DT);
    m._breakPart(m.partById.shoulder);
    expect(m.partById.shoulder.factor).toBe(1.3);
    expect(m.attack).toBeNull();
    expect(m.stagT).toBeGreaterThanOrEqual(FEL.CRASH_TIME); expect(m._exposedT).toBeGreaterThan(0);
    expect(felsengroll.hitDmgMul(m, hit)).toBe(0.65);
    m._breakPart(m.partById.club);
    expect(m.extra.club.visible).toBe(false);
    expect(m._atkAllowed(felsengroll.attacks.felsengroll_felswurf)).toBe(false);
    expect(m._atkAllowed(felsengroll.attacks.felsengroll_keulenwirbel)).toBe(false);
    expect(m._atkAllowed(felsengroll.attacks.felsengroll_stummel)).toBe(true);
  });

  it('meteor is target committed, lands on the ground and glitch counter interrupts it', () => {
    const def = felsengroll.attacks.felsengroll_meteor;
    const a = new AttackInstance(def, params(def.id));
    const landing = { x: a.target.x, z: a.target.z };
    a.target.x = 100;
    expect(a.sample(a.wall(1.5)).air).toBeGreaterThan(8);
    expect(a.sample(a.wall(2.1)).air).toBeCloseTo(0);
    expect(a.sample(a.wall(2.1)).z).toBeCloseTo(landing.z, 0);
    expect((def.duration - def.hits[0].t1) / 1.2).toBeGreaterThan(1.5);
    const { m } = make(felsengroll);
    m.beginAttack(def.id);
    felsengroll.onGlitchCounter(m, def.id);
    expect(m.attack).toBeNull();
    expect(m.stunT).toBeGreaterThanOrEqual(2.5);
  });

  it('rollangriff re-aims at the hunter\'s current spot without leading, and chains at most three times', () => {
    const def = felsengroll.attacks.felsengroll_rollangriff;
    const a = new AttackInstance(def, params(def.id, false, { targetPos: { x: 6, y: 0, z: 6 } }));
    const end = a.sample(a.wall(2.1));
    expect(Math.atan2(end.x, end.z)).toBeCloseTo(Math.PI / 4, 1);
    expect(Math.hypot(end.x, end.z)).toBeGreaterThan(Math.hypot(6, 6)); // rolls through the spot
    const { m } = make(felsengroll); m.rageUsed = true;
    const ok = (run) => { m._rollRun = run; return felsengroll.chains[def.id][0].cond(m); };
    expect([ok(0), ok(1), ok(2)]).toEqual([true, true, false]);
  });

  for (const def of Object.values(felsengroll.attacks).filter((a) => a.id.startsWith('felsengroll_'))) {
    it(`${def.id}: deterministic hits, honest markers and recovery even in rage`, () => {
      const a = new AttackInstance(def, params(def.id, true, { tempoMul: 1.08 })), b = new AttackInstance(def, params(def.id, true, { tempoMul: 1.08 }));
      for (let t = 0; t < a.duration; t += 0.11) {
        expect(a.sample(t)).toEqual(b.sample(t));
        expect(a.hitsAt(t)).toEqual(b.hitsAt(t));
      }
      expect(def.markerFromHits).toBe(true);
      expect(def.audit.length).toBeGreaterThan(0);
      if (!def.hits.length) { expect(def.events.some((e) => e.all)).toBe(true); return; }
      expect(a.footprints()).toEqual(b.footprints());
      expect(a.footprints().length).toBeGreaterThan(0);
      expect(a.firstHitTime()).toBeGreaterThanOrEqual(0.5);
      const recovery = (def.duration - Math.max(...def.hits.map((h) => h.t1))) / a.speed;
      expect(recovery).toBeGreaterThanOrEqual(0.4);
      if (def.punishWindow) expect(recovery).toBeGreaterThanOrEqual(1.5);
    });
  }

  it('pillars give hard cover only while they stand between impact and hunter', () => {
    const { m } = make(felsengroll);
    addPillar(m, 0, 5, { key: 'c1' }); m.time += .5;
    expect(covered(m, { x: 0, z: 0 }, { x: 0, z: 9 })).toBe(true);
    expect(covered(m, { x: 0, z: 0 }, { x: 4, z: 9 })).toBe(false);
    expect(covered(m, { x: 0, z: 0 }, { x: 0, z: 3 })).toBe(false);
    m.time += 30; expect(pillarLive(m.extra.pillars[0], m.time)).toBe(false);
    expect(covered(m, { x: 0, z: 0 }, { x: 0, z: 9 })).toBe(false);
  });
});
