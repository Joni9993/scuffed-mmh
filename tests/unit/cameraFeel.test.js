import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createCameraRig } from '../../src/render/camera.js';
import { angleDiff } from '../../src/core/math.js';

const DT = 1 / 60;
const ZERO = { dx: 0, dy: 0 };
const newRig = () => createCameraRig(new THREE.PerspectiveCamera(60, 2, 0.1, 170), () => 0, null);

describe('free camera feel', () => {
  it('does not swing around when the hunter runs toward the camera', () => {
    const rig = newRig();
    const pos = new THREE.Vector3();
    rig.snap(pos, 0);
    for (let i = 0; i < 300; i++) { pos.z -= 6 * DT; rig.update(DT, { playerPos: pos, playerYaw: Math.PI, moving: true, camInput: ZERO, lockPos: null }); }
    expect(Math.abs(angleDiff(rig.yaw, 0))).toBeLessThan(0.05);
  });
  it('slowly follows behind when running sideways', () => {
    const rig = newRig();
    const pos = new THREE.Vector3();
    rig.snap(pos, 0);
    for (let i = 0; i < 360; i++) { pos.x += 6 * DT; rig.update(DT, { playerPos: pos, playerYaw: Math.PI / 2, moving: true, camInput: ZERO, lockPos: null }); }
    const a = angleDiff(rig.yaw, Math.PI / 2);
    expect(Math.abs(a)).toBeLessThan(Math.PI / 2 - 0.3);
  });
});

describe('lock camera stays calm', () => {
  it('ignores a spinning lock point around the monster body (Brocken dreht sich)', () => {
    const rig = newRig();
    const pl = new THREE.Vector3(0, 0, 0), center = new THREE.Vector3(0, 0, 8), lp = new THREE.Vector3();
    rig.snap(pl, 0);
    let minYaw = 1e9, maxYaw = -1e9;
    for (let i = 0; i < 600; i++) {
      const a = i * DT * 4; // Teil kreist 4 rad/s, 3 m Radius
      lp.set(center.x + Math.sin(a) * 3, 2.5, center.z + Math.cos(a) * 3);
      rig.update(DT, { playerPos: pl, playerYaw: 0, moving: false, camInput: ZERO, lockPos: lp, lockCenter: center, lockRef: 1, lockSize: 1.5 });
      if (i > 60) { minYaw = Math.min(minYaw, rig.yaw); maxYaw = Math.max(maxYaw, rig.yaw); }
    }
    expect(maxYaw - minYaw).toBeLessThan(0.02);
  });
  it('turns at most ~1.6 rad/s while circling the monster up close', () => {
    const rig = newRig();
    const center = new THREE.Vector3(0, 0, 0), pl = new THREE.Vector3(0, 0, -2.5);
    rig.snap(pl, 0);
    for (let i = 0; i < 90; i++) rig.update(DT, { playerPos: pl, playerYaw: 0, moving: false, camInput: ZERO, lockPos: center, lockCenter: center, lockRef: 1, lockSize: 1.5 });
    let worst = 0, prev = rig.yaw;
    for (let i = 0; i < 300; i++) {
      const a = Math.PI + i * DT * 2.4; // Pirscher umkreist den Brocken in 2,5 m (Winkel zum Ziel aendert sich 2,4 rad/s)
      pl.set(Math.sin(a) * 2.5, 0, Math.cos(a) * 2.5);
      rig.update(DT, { playerPos: pl, playerYaw: 0, moving: true, camInput: ZERO, lockPos: center, lockCenter: center, lockRef: 1, lockSize: 1.5 });
      worst = Math.max(worst, Math.abs(angleDiff(prev, rig.yaw)) / DT); prev = rig.yaw;
    }
    expect(worst).toBeLessThan(1.65);
  });
});
