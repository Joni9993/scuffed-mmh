import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPyrostur, PYRO_SCALE } from '../../src/game/monsters/pyrosturRig.js';

const point = (r, id, offset = [0, 0, 0]) => {
  r.root.updateMatrixWorld(true);
  return r.nodes[id].localToWorld(new THREE.Vector3(...offset));
};
describe('Pyrostur elder silhouette and articulation', () => {
  it('keeps a broad low hunting silhouette, long weapon tail and grounded feet within mobile geometry budget', () => {
    const r = buildPyrostur(); r.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(r.root), size = box.getSize(new THREE.Vector3());
    expect(PYRO_SCALE).toBe(1.65);
    expect(size.x).toBeGreaterThan(size.y * 2.5);
    expect(size.z).toBeGreaterThan(size.y * 3);
    expect(box.min.y).toBeGreaterThan(-.08); expect(box.min.y).toBeLessThan(.1);
    expect(point(r, 'tailTip').z).toBeLessThan(-7);
    for (const id of ['legL', 'legR']) expect(point(r, id, [0, -1.04, 1.02]).y).toBeLessThan(.1);
    let meshes = 0, triangles = 0;
    r.root.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.attributes.position.count / 3; } });
    expect(meshes).toBeLessThanOrEqual(45); expect(triangles).toBeLessThan(18000);
    expect(r.extra.coreMat.isMeshBasicMaterial).toBe(true);
    expect(Object.values(r.partMeshes).every(list => list.length > 0)).toBe(true);
  });
  it('offers reachable lowered skull and chest in a committed recovery pose', () => {
    const r = buildPyrostur(), idle = point(r, 'head');
    r.apply({ bodyY: -.55, bodyPitch: 9, head: 25, neck: .15, headReach: .3, jaw: 28 });
    const head = point(r, 'head', [0, 0, .55]), chest = point(r, 'chest', [0, 0, .25]);
    expect(head.y).toBeLessThan(1.65); expect(head.y).toBeGreaterThan(.05);
    expect(chest.y).toBeLessThan(1.6); expect(idle.y - head.y).toBeGreaterThan(1);
    expect(head.z).toBeGreaterThan(idle.z);
  });
  it('articulates shoulder, elbow, wrist and tail independently and resets omitted pose keys', () => {
    const r = buildPyrostur(), left = point(r, 'wristL'), right = point(r, 'wristR'), tail = point(r, 'tailTip');
    r.apply({ bodyYaw: 12, wingL: 35, elbowL: -40, wristL: 30, foreL: 15, tailCurl: 50, hindL: 20 });
    expect(point(r, 'wristL').distanceTo(left)).toBeGreaterThan(.5);
    expect(r.nodes.wristL.rotation.x).toBeCloseTo(Math.PI / 6);
    expect(r.nodes.elbowR.rotation.z).toBeCloseTo(0);
    expect(point(r, 'tailTip').distanceTo(tail)).toBeGreaterThan(1);
    r.apply({});
    expect(point(r, 'wristL').distanceTo(left)).toBeLessThan(.00001);
    expect(point(r, 'wristR').distanceTo(right)).toBeLessThan(.00001);
    expect(point(r, 'tailTip').distanceTo(tail)).toBeLessThan(.00001);
    r.apply({ wing: NaN, head: undefined });
    expect(point(r, 'head').toArray().every(Number.isFinite)).toBe(true);
  });
  it('corrects a banking foreclaw through shoulder articulation, independent of world elevation', () => {
    const r = buildPyrostur();
    for (const roll of [-20, 0, 20]) for (const pose of [
      { bodyY: -.5, bodyPitch: 6, wing: 12, elbowL: 12, elbowR: 12, foreL: -5, foreR: -5 },
      { bodyY: -.45, bodyPitch: 9, wing: 15, elbowL: 10, elbowR: 10 },
    ]) {
      r.root.position.y = 0; r.apply({ ...pose, bodyRoll: roll });
      for (const side of ['L', 'R']) expect(point(r, 'wrist' + side, [0, -.99, .36]).y).toBeGreaterThan(-.05);
      const leftAngle = r.nodes.wingL.rotation.z;
      expect(r.nodes.body.position.y).toBeCloseTo(1.55 + pose.bodyY);
      r.root.position.y = 25; r.apply({ ...pose, bodyRoll: roll });
      expect(r.nodes.wingL.rotation.z).toBeCloseTo(leftAngle);
      for (const side of ['L', 'R']) expect(point(r, 'wrist' + side, [0, -.99, .36]).y - 25).toBeGreaterThan(-.05);
    }
  });
  it('compresses hinged hocks in actual crouch/recovery poses, preserving soles and flight/death articulation', () => {
    const r = buildPyrostur();
    for (const pose of [
      { bodyY: -.45, bodyPitch: 9, hindL: 25, hindR: 25 },
      { bodyY: -.5, bodyPitch: 6, hindL: 18, hindR: 18 },
      { bodyY: -.35, bodyPitch: 12, hindL: 25, hindR: 25 },
    ]) for (const roll of [-20, 0, 20]) {
      r.root.position.y = 0; r.apply({ ...pose, bodyRoll: roll });
      for (const side of ['L', 'R']) {
        expect(r.nodes['knee' + side].rotation.x).toBeLessThan(0);
        expect(r.nodes['knee' + side].rotation.x).toBeGreaterThanOrEqual(-100 * Math.PI / 180 - .0001);
        for (const x of [-.27, 0, .27]) for (const yz of [[-.14, .64], [-.15, -.19]])
          expect(point(r, 'ankle' + side, [x, ...yz]).y).toBeGreaterThan(-.05);
        expect(r.nodes['ankle' + side].scale.toArray()).toEqual([1, 1, 1]);
      }
      const kneeAngle = r.nodes.kneeL.rotation.x;
      r.root.position.y = 25; r.apply({ ...pose, bodyRoll: roll });
      expect(r.nodes.kneeL.rotation.x).toBeCloseTo(kneeAngle);
    }
    r.apply({ bodyY: .45, bodyPitch: -25, hindL: 25, hindR: 25 });
    expect(r.nodes.kneeL.rotation.x).toBe(0);
    r.apply({ bodyY: -1.1, bodyRoll: 80, legL: 40 });
    expect(r.nodes.kneeL.rotation.x).toBe(0);
    expect(r.nodes.legL.rotation.x).toBeCloseTo(40 * Math.PI / 180);
    r.root.position.y = 0; r.apply({});
    expect(point(r, 'ankleL', [0, -.14, .64]).y).toBeCloseTo(.0165);
  });
});
