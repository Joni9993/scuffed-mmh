import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createWorld } from '../../src/game/world/index.js';
import { createCameraRig } from '../../src/render/camera.js';
import { createRng } from '../../src/core/rng.js';

let world;
beforeAll(() => { world = createWorld('schotterklamm', { seed: 1 }); });
const DT = 1 / 60;
const ZERO = { dx: 0, dy: 0 };

function newRig() {
  const cam = new THREE.PerspectiveCamera(60, 844 / 390, 0.1, 170);
  const rig = createCameraRig(cam, (x, z) => world.heightAt(x, z), (p, r) => world.collide(p, r));
  return { cam, rig };
}

describe('fix 4a: camera collision', () => {
  it('never sits below the ground or inside a wall / prop, wherever the hunter stands and looks', () => {
    const rng = createRng(11);
    const { cam, rig } = newRig();
    let checked = 0, worstBelow = 1e9, worstInside = 0;
    for (let n = 0; n < 220; n++) {
      // sample spots near cliffs: random walkable points, camera looking in a random direction
      const pos = { x: (rng() - 0.5) * 220, y: 0, z: (rng() - 0.5) * 220 };
      world.collide(pos, 0.4);
      pos.y = world.heightAt(pos.x, pos.z);
      rig.snap(pos, rng() * 6.28);
      rig.pitch = 0.1 + rng() * 0.9;
      for (let i = 0; i < 40; i++) {
        rig.update(DT, { playerPos: pos, playerYaw: 0, moving: false, camInput: ZERO, lockPos: null, shake: null });
        const c = cam.position;
        worstBelow = Math.min(worstBelow, c.y - world.heightAt(c.x, c.z));
        const q = { x: c.x, z: c.z };
        world.collide(q, 0.3);
        worstInside = Math.max(worstInside, Math.hypot(q.x - c.x, q.z - c.z));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(8000);
    expect(worstBelow).toBeGreaterThan(0.5);
    expect(worstInside).toBeLessThan(0.1);
  });
  it('pulls in when a wall is behind the hunter and relaxes again smoothly', () => {
    const { rig } = newRig();
    // a fake wall 3 m behind the focus (camera sits at -z of the look direction yaw=0)
    const cam = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
    const r2 = createCameraRig(cam, () => 0, (p) => { if (p.z < -3) p.z = -3; });
    const pos = { x: 0, y: 0, z: 0 };
    r2.snap(pos, 0);
    for (let i = 0; i < 90; i++) r2.update(DT, { playerPos: pos, playerYaw: 0, moving: false, camInput: ZERO, lockPos: null });
    expect(cam.position.z).toBeGreaterThan(-3.01);
    expect(rig).toBeTruthy();
  });
});

describe('fix 4b/4c: lock-on framing keeps the monster visible', () => {
  const sizes = [1.2, 1.7]; // Jaggo / Brathalos bodyRadius
  it('the lock target is clearly separated from the hunter on screen and in front of the near plane', () => {
    for (const size of sizes) {
      for (const d of [3, 5, 8, 12, 18]) {
        const cam = new THREE.PerspectiveCamera(60, 844 / 390, 0.1, 170);
        const rig = createCameraRig(cam, () => 0, null);
        const pl = new THREE.Vector3(0, 0, 0);
        const lock = { x: 0, y: 2.5 * size, z: d };
        rig.snap(pl, 0);
        for (let i = 0; i < 240; i++) rig.update(DT, { playerPos: pl, playerYaw: 0, moving: false, camInput: ZERO, lockPos: lock, lockSize: size });
        cam.updateMatrixWorld(true);
        const a = new THREE.Vector3(0, 1.0, 0).project(cam);           // hunter torso
        const b = new THREE.Vector3(lock.x, lock.y, lock.z).project(cam); // monster lock point
        expect(b.z).toBeLessThan(1);
        expect(Math.abs(b.x)).toBeLessThan(0.95);
        expect(Math.abs(b.y)).toBeLessThan(0.95);
        // hunter must not sit on top of the lock point: >= 0.12 NDC apart (screen is 2 wide)
        expect(Math.hypot(a.x - b.x, (a.y - b.y) * 0.46)).toBeGreaterThan(0.12);
      }
    }
  });
  it('raises pitch and distance with monster size (big monsters up close)', () => {
    const run = (size, d) => {
      const cam = new THREE.PerspectiveCamera(60, 2, 0.1, 170);
      const rig = createCameraRig(cam, () => 0, null);
      rig.snap({ x: 0, y: 0, z: 0 }, 0);
      for (let i = 0; i < 400; i++) rig.update(DT, { playerPos: { x: 0, y: 0, z: 0 }, playerYaw: 0, moving: false, camInput: ZERO, lockPos: { x: 0, y: 3, z: d }, lockSize: size });
      return { pitch: rig.pitch, dist: rig.dist };
    };
    expect(run(1.7, 4).pitch).toBeGreaterThan(run(1.7, 14).pitch);
    expect(run(1.7, 6).pitch).toBeGreaterThan(run(0.6, 6).pitch);
    expect(run(1.7, 6).dist).toBeGreaterThan(run(0.6, 6).dist);
  });
});
