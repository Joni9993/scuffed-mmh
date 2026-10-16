import { describe, it, expect, beforeEach } from 'vitest';
import { felsengroll } from '../../src/game/monsters/felsengroll.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { time } from '../../src/core/time.js';
import { make, DT } from './p3helpers.js';

beforeEach(() => time.reset());
const params = (id, rage = false) => ({ attackId: id, t0: 0, origin: { x: 0, y: 0, z: 0 }, targetPos: { x: 0, y: 0, z: 8 }, yaw: 0, seed: 73, rage });

describe('Felsengroll: committed heavy apex', () => {
  it('has three phases, three chain families and a bounded mobile rig', () => {
    const { m } = make(felsengroll);
    expect(m.maxHp).toBe(24000);
    expect(Object.keys(felsengroll.attacks).length).toBeGreaterThanOrEqual(8);
    expect(felsengroll.phases.map((p) => p.at)).toEqual([0.65, 0.3]);
    expect(Object.keys(felsengroll.chains).length).toBeGreaterThanOrEqual(3);
    let count = 0; m.mesh.traverse((n) => { if (n.isMesh) count++; });
    expect(count).toBeLessThanOrEqual(32);
    expect(felsengroll.chainMax).toBe(2);
  });

  it('shoulder break exposes a weak flank and reduces shoulder impact; club break removes the outside followup', () => {
    const { m } = make(felsengroll);
    const hit = felsengroll.attacks.felsengroll_schulter.hits[0];
    expect(felsengroll.hitDmgMul(m, hit)).toBe(1);
    m._breakPart(m.partById.shoulder);
    expect(m.partById.shoulder.factor).toBe(1.3);
    expect(m.extra.shoulder.visible).toBe(false);
    expect(felsengroll.hitDmgMul(m, hit)).toBe(0.65);
    m._breakPart(m.partById.club);
    expect(m.extra.club.visible).toBe(false);
    expect(felsengroll.attacks.felsengroll_keule.cond(m)).toBe(false);
    expect(felsengroll.attacks.felsengroll_stummel.cond(m)).toBe(true);
    expect(felsengroll.attacks.felsengroll_stummel.hits).toHaveLength(1);
  });

  it('meteor is target committed, grounded on impact and offers a long counter opening', () => {
    const def = felsengroll.attacks.felsengroll_meteor;
    const a = new AttackInstance(def, params(def.id));
    const landing = { ...a.landing };
    a.target.x = 100;
    expect(a.landing).toEqual(landing);
    expect(a.sample(a.wall(1.9)).air).toBeCloseTo(0);
    expect(a.sample(a.wall(1.9)).z).toBeCloseTo(8);
    expect((def.duration - def.hits[0].t1) / 1.2).toBeGreaterThan(1.5);
    const { m } = make(felsengroll);
    m.beginAttack(def.id);
    felsengroll.onGlitchCounter(m, def.id);
    expect(m.attack).toBeNull();
    expect(m.stunT).toBeGreaterThanOrEqual(2.5);
  });

  for (const def of Object.values(felsengroll.attacks).filter((a) => !a.internal)) {
    it(`${def.id}: deterministic hits, honest markers and recovery even in rage`, () => {
      const a = new AttackInstance(def, params(def.id, true));
      const b = new AttackInstance(def, params(def.id, true));
      for (let t = 0; t < a.duration; t += 0.11) {
        expect(a.sample(t)).toEqual(b.sample(t));
        expect(a.hitsAt(t)).toEqual(b.hitsAt(t));
      }
      expect(def.markerFromHits).toBe(true);
      expect(def.audit.length).toBeGreaterThan(0);
      expect(a.firstHitTime()).toBeGreaterThanOrEqual(0.5);
      expect((def.duration - Math.max(...def.hits.map((h) => h.t1))) / 1.2).toBeGreaterThanOrEqual(1);
      expect(a.footprints()).toEqual(b.footprints());
    });

    it(`${def.id}: a hunter can escape every audited distance with one well timed roll`, () => {
      for (const rage of [false, true]) for (const d of def.audit) {
        let escaped = false;
        for (const direction of [[-1, 0], [0, -1]]) {
          if (escaped) break;
          for (let rollAt = 0; rollAt < 2.6; rollAt += 0.1) {
            const { m, p, ctx } = make(felsengroll, 'combat', 0, d);
            m.recover = 99; m.rage = rage; m.rageT = 999;
            ctx.cameraYaw = Math.PI;
            const ins = m.beginAttack(def.id);
            let rolled = false, hurt = false;
            const take = p.takeHit.bind(p);
            p.takeHit = (h) => { const res = take(h); if (res === 'hit' || res === 'block') hurt = true; return res; };
            for (let t = 0; t < ins.duration + 0.2; t += DT) {
              if (!rolled && t >= rollAt) { ctx.input.setStick(...direction, 'bot'); ctx.input.press('roll', 50); rolled = true; }
              ctx.input.poll(DT); p.update(DT); ctx.input.setStick(0, 0, 'bot'); m.update(DT); m.recover = 99;
            }
            m.dispose?.();
            if (!hurt) { escaped = true; break; }
          }
        }
        expect(escaped, `${def.id} distance ${d}, rage ${rage}`).toBe(true);
      }
    });
  }
});
