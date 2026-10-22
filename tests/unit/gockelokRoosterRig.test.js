import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gockelok, beginEye } from '../../src/game/monsters/gockelok.js';
import { ROOSTER_FX_CAP } from '../../src/game/monsters/gockelokRoosterFx.js';
import { make } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';

function poseAt(m, inst, tau) {
  m.attack.t = inst.wall(tau);
  const s = inst.sample(m.attack.t);
  m.pos.set(s.x, s.air, s.z); m.air = s.air; m.rot = s.yaw;
  gockelok.tick(m, 0); m._visuals(1);
}

describe('rooster leap and salvo physical presentation', () => {
  it('lands damaging claws at the actual sloped ground height on host and guest', () => {
    const { m, p, ctx } = make(gockelok, 'combat', 0, 18);
    ctx.world.heightAt = (_x, z) => z * .3;
    p.spawnAt(0, 18); p.v.hp = p.v.maxHp = 1000;
    const inst = m.beginAttack('gockelok_krallensprung', { teach: false });
    const guest = new Monster(gockelok, ctx, { id: 'guest', remote: true, state: 'combat' });
    const replay = guest.startAttack(structuredClone(inst.params));
    const t = inst.wall(inst.def.hits[0].t0), s = inst.sample(t);
    expect(s.groundY).toBeGreaterThan(4);
    expect(inst.sample(t)).toEqual(replay.sample(t)); expect(inst.hitsAt(t)).toEqual(replay.hitsAt(t));
    const before = p.v.hp; m._attackHits(inst, t);
    expect(p.v.hp).toBeLessThan(before);
    expect(inst.hitsAt(t)[0].shape.a.y).toBeCloseTo(s.groundY + 1);
    gockelok.dispose(guest); gockelok.dispose(m);
  });
  it('presents feet first in its real moving leap and plants on the announced landing', () => {
    const { m } = make(gockelok, 'combat', 0, 18);
    const inst = m.beginAttack('gockelok_krallensprung', { teach: false });
    poseAt(m, inst, .76);
    expect(m.air).toBeGreaterThan(1); expect(m.pos.z).toBeGreaterThan(5);
    expect(m.nodes.legL.rotation.x).toBeLessThan(-.8);
    expect(m.nodes.legR.rotation.x).toBeLessThan(-.8);
    expect(m.nodes.legL.rotation.z).toBeGreaterThan(.1);
    poseAt(m, inst, inst.def.hits[0].t0);
    expect(m.air).toBe(0);
    expect(m.mesh.getObjectByName('Ur-Hahn · Federhagel').count).toBeGreaterThan(0);
    const hit = inst.hitsAt(m.attack.t)[0];
    expect(Math.hypot(hit.shape.a.x - m.pos.x, hit.shape.a.z - m.pos.z)).toBeLessThan(4);
    gockelok.dispose(m);
  });

  it('shows feathers in the actual damaging lanes and clears them when interrupted or entering the eye', () => {
    const { m } = make(gockelok, 'combat', 0, 18);
    const inst = m.beginAttack('gockelok_federhagel', { teach: false });
    poseAt(m, inst, .6);
    const fx = m.mesh.getObjectByName('Ur-Hahn · Federhagel');
    expect(fx.count).toBe(12); // lifted wing tips before the first release
    for (const at of [.90, 1.47, 2.03]) {
      poseAt(m, inst, at);
      expect(fx.visible).toBe(true); expect(fx.count).toBeLessThanOrEqual(ROOSTER_FX_CAP);
      const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
      const hits = inst.def.hits.filter(h => at >= h.t0 && at <= h.t1);
      // The last five instances per active capsule sit along that capsule's centre line.
      const offset = fx.count - hits.length * 5;
      hits.forEach((h, i) => {
        fx.getMatrixAt(offset + i * 5 + 2, matrix); point.setFromMatrixPosition(matrix);
        const from = new THREE.Vector3(...h.from), to = new THREE.Vector3(...h.to);
        const line = new THREE.Line3(from, to);
        expect(point.distanceTo(line.closestPointToPoint(point, true, new THREE.Vector3()))).toBeLessThan(.001);
      });
    }
    m._interrupt(); gockelok.tick(m, 0); m._visuals(1); expect(fx.visible).toBe(false);
    m.applyDamage({ dmg: m.maxHp, partId: 'body' }); beginEye(m); m._visuals(1);
    expect(fx.visible).toBe(false); gockelok.dispose(m);
  });
});
