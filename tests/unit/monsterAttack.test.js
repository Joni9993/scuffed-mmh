import { describe, it, expect } from 'vitest';
import { AttackInstance, MIN_TELEGRAPH } from '../../src/game/monsters/attack.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { jaggling } from '../../src/game/monsters/jaggling.js';

const params = (id, extra = {}) => ({ attackId: id, t0: 12.5, origin: { x: 3, y: 0, z: -4 }, yaw: 0.7, targetPos: { x: 9, y: 0, z: 2 }, seed: 1234, ...extra });
const trace = (def, p) => {
  const inst = new AttackInstance(def, p);
  const out = [];
  for (let t = 0; t <= inst.duration + 0.01; t += 1 / 60) out.push({ s: inst.sample(t), h: inst.hitsAt(t).map((x) => [x.key, x.shape, x.dmg, x.knock]) });
  return out;
};
const all = [...Object.values(jaggo.attacks), ...Object.values(jaggling.attacks)];

describe('brocken attacks are deterministic', () => {
  for (const def of Object.values(jaggo.attacks)) {
    it(`${def.id}: same start params -> identical motion and hit shapes`, () => {
      expect(JSON.stringify(trace(def, params(def.id)))).toBe(JSON.stringify(trace(def, params(def.id))));
    });
    it(`${def.id}: rage replay is deterministic too`, () => {
      expect(JSON.stringify(trace(def, params(def.id, { rage: true })))).toBe(JSON.stringify(trace(def, params(def.id, { rage: true }))));
    });
  }
  it('different seed can change random choices (Schwanzwirbel direction) but never between replays', () => {
    const a = JSON.stringify(trace(jaggo.attacks.jaggo_schwanz, params('x', { seed: 1 })));
    const b = JSON.stringify(trace(jaggo.attacks.jaggo_schwanz, params('x', { seed: 1 })));
    expect(a).toBe(b);
  });
  it('hit shapes translate with the origin (host and clients agree up to origin)', () => {
    const d = jaggo.attacks.jaggo_bissreihe;
    const a = new AttackInstance(d, params('b', { origin: { x: 0, y: 0, z: 0 } }));
    const b = new AttackInstance(d, params('b', { origin: { x: 10, y: 0, z: 5 } }));
    const t = 0.66;
    const ha = a.hitsAt(t)[0].shape, hb = b.hitsAt(t)[0].shape;
    expect(hb.x - ha.x).toBeCloseTo(10, 6);
    expect(hb.z - ha.z).toBeCloseTo(5, 6);
    expect(hb.y).toBeCloseTo(ha.y, 6);
  });
  it('Bissreihe bite sphere sits in front of the head (forward of origin along yaw)', () => {
    const d = jaggo.attacks.jaggo_bissreihe;
    const inst = new AttackInstance(d, params('b', { origin: { x: 0, y: 0, z: 0 }, yaw: 0 }));
    const s = inst.hitsAt(0.66)[0].shape;
    expect(s.z).toBeGreaterThan(2.5);
    expect(Math.abs(s.x)).toBeLessThan(0.01);
  });
  it('Hüpfer lands on the target, at most 10 m away', () => {
    const d = jaggo.attacks.jaggo_huepfer;
    const far = new AttackInstance(d, params('h', { origin: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 30 }, yaw: 0 }));
    const s = far.sample(far.duration);
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(10, 5);
    const near = new AttackInstance(d, params('h', { origin: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 6 }, yaw: 0 }));
    expect(near.sample(near.duration).z).toBeCloseTo(6, 5);
    // airborne in the middle of the jump, grounded afterwards, hit only on landing
    expect(near.sample(near.tau(0) + 1.0).air).toBeGreaterThan(1);
    expect(near.sample(near.duration).air).toBe(0);
  });
});

describe('fairness: every hit is telegraphed >= 0.5 s', () => {
  for (const def of all) {
    it(`${def.id}: first hit no earlier than 0.5 s (normal and Rotglut)`, () => {
      for (const rage of [false, true]) {
        const inst = new AttackInstance(def, params(def.id, { rage }));
        expect(inst.firstHitTime()).toBeGreaterThanOrEqual(MIN_TELEGRAPH - 1e-9);
        for (const h of def.hits) expect(h.t0).toBeGreaterThanOrEqual(def.telegraph);
        // nothing hits during the telegraph
        for (let t = 0; t < inst.tgWall - 1e-6; t += 1 / 60) expect(inst.hitsAt(t).length).toBe(0);
      }
    });
    it(`${def.id}: telegraph >= 0.5 s in data`, () => {
      expect(def.telegraph).toBeGreaterThanOrEqual(0.5);
      expect(def.flashParts?.length).toBeGreaterThan(0);
    });
  }
  it('Rotglut: telegraph 20 % shorter (not below 0.5 s), rest 1.2x faster', () => {
    const d = jaggo.attacks.jaggo_huepfer;
    const n = new AttackInstance(d, params('h')), r = new AttackInstance(d, params('h', { rage: true }));
    expect(n.tgWall).toBeCloseTo(0.7);
    expect(r.tgWall).toBeCloseTo(0.56);
    expect(r.duration).toBeLessThan(n.duration);
    const bite = jaggo.attacks.jaggo_bissreihe;
    expect(new AttackInstance(bite, params('b', { rage: true })).tgWall).toBe(0.5);
  });
});
