import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPyrostur, PYRO_SCALE } from '../../src/game/monsters/pyrosturRig.js';

const feet = ['ankleForeL', 'ankleForeR', 'ankleL', 'ankleR'];
const point = (r, id, offset = [0, 0, 0]) => {
  r.root.updateMatrixWorld(true);
  return r.nodes[id].localToWorld(new THREE.Vector3(...offset));
};
const localFootBox = (r, id) => {
  r.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(r.nodes[id], true);
};
describe('Pyrostur elder silhouette and articulation', () => {
  it('has four grounded legs plus separate soaring wings within the mobile geometry budget', () => {
    const r = buildPyrostur(); r.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(r.root), size = box.getSize(new THREE.Vector3());
    expect(PYRO_SCALE).toBe(1.65);
    expect(size.x).toBeGreaterThan(18);
    expect(size.z).toBeGreaterThan(13);
    expect(size.y).toBeGreaterThan(5);
    expect(box.min.y).toBeGreaterThan(-.08);
    expect(point(r, 'tailTip', [0, 0, -1.65]).z).toBeLessThan(-9);
    for (const id of feet) {
      expect(localFootBox(r, id).min.y, id).toBeGreaterThan(-.08);
      expect(localFootBox(r, id).min.y, id).toBeLessThan(.1);
    }
    for (const side of ['L', 'R']) {
      expect(r.nodes['foreleg' + side]).not.toBe(r.nodes['wing' + side]);
      expect(r.nodes['ankleFore' + side].parent).toBe(r.nodes['elbowFore' + side]);
      expect(point(r, 'wrist' + side).y).toBeGreaterThan(3);
      expect(Math.abs(point(r, 'wrist' + side).x)).toBeGreaterThan(4);
    }
    let meshes = 0, triangles = 0;
    r.root.traverse(o => { if (o.isMesh) { meshes++; triangles += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
    expect(meshes).toBeLessThanOrEqual(110); expect(triangles).toBeLessThanOrEqual(15000);
    expect(r.extra.coreMat.isMeshBasicMaterial).toBe(true);
    expect(Object.values(r.partMeshes).every(list => list.length > 0)).toBe(true);
  });
  it('offers a reachable skull and chest in a committed recovery pose', () => {
    const r = buildPyrostur(), idle = point(r, 'head');
    r.apply({ bodyY: -.5, bodyPitch: 6, head: 10, neck: 0, jaw: 35 });
    const head = point(r, 'head', [0, 0, .55]), chest = point(r, 'chest', [0, 0, .25]);
    expect(head.y).toBeLessThan(2); expect(head.y).toBeGreaterThan(.05);
    expect(chest.y).toBeLessThan(1.6); expect(chest.y).toBeGreaterThan(.2);
    expect(idle.y - head.y).toBeGreaterThan(.8);
    expect(head.z).toBeGreaterThan(idle.z);
  });
  it('articulates all six limbs independently and resets every omitted pose channel', () => {
    const r = buildPyrostur();
    const ids = [...feet, 'wristL', 'wristR', 'head', 'tailTip'];
    const rest = Object.fromEntries(ids.map(id => [id, point(r, id)]));
    r.apply({ wingL: 35, elbowL: -40, wristL: 30, foreL: 25, foreKneeL: -35, foreAnkleL: 10, hindL: -20, kneeL: 30, tailCurl: 50 });
    expect(point(r, 'wristL').distanceTo(rest.wristL)).toBeGreaterThan(.5);
    expect(point(r, 'ankleForeL').distanceTo(rest.ankleForeL)).toBeGreaterThan(.3);
    expect(point(r, 'ankleL').distanceTo(rest.ankleL)).toBeGreaterThan(.3);
    for (const id of ['wristR', 'ankleForeR', 'ankleR']) expect(point(r, id).distanceTo(rest[id]), id).toBeLessThan(.00001);
    expect(point(r, 'tailTip').distanceTo(rest.tailTip)).toBeGreaterThan(1);
    r.apply({});
    for (const id of ids) expect(point(r, id).distanceTo(rest[id]), id).toBeLessThan(.00001);
    r.apply({ bodyY: -.5, bodyPitch: 6, bodyRoll: 20 });
    r.apply({});
    for (const id of ids) expect(point(r, id).distanceTo(rest[id]), id + ' after bank').toBeLessThan(.00001);
    for (const id of feet) expect(r.nodes[id].rotation.z, id + ' resets bank compensation').toBe(0);
    r.apply({ wing: NaN, head: undefined });
    expect(point(r, 'head').toArray().every(Number.isFinite)).toBe(true);
  });
  it('keeps the actual four foot meshes above ground in crouch, recovery and banking poses', () => {
    const r = buildPyrostur();
    for (const roll of [-20, 0, 20]) for (const pose of [
      { bodyY: -.45, bodyPitch: 9, foreL: 0, foreR: 0, hindL: 25, hindR: 25 },
      { bodyY: -.5, bodyPitch: 6, foreL: -5, foreR: -5, hindL: 18, hindR: 18 },
      { bodyY: -.35, bodyPitch: 12, hindL: 25, hindR: 25 },
    ]) {
      r.root.position.y = 0; r.apply({ ...pose, bodyRoll: roll });
      const angles = feet.map(id => r.nodes[id].rotation.x);
      for (const id of feet) expect(localFootBox(r, id).min.y, `${id}/${JSON.stringify(pose)}/roll${roll}`).toBeGreaterThan(-.08);
      r.root.position.y = 25; r.apply({ ...pose, bodyRoll: roll });
      feet.forEach((id, i) => {
        expect(r.nodes[id].rotation.x, id).toBeCloseTo(angles[i]);
        expect(localFootBox(r, id).min.y - 25, id).toBeGreaterThan(-.08);
        expect(r.nodes[id].scale.toArray()).toEqual([1, 1, 1]);
      });
    }
  });
});
