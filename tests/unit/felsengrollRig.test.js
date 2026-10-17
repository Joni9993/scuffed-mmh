import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFelsengroll, FELS_SCALE } from '../../src/game/monsters/felsengrollRig.js';
import { buildPyrostur } from '../../src/game/monsters/pyrosturRig.js';
import { poseFelsengrollPresence } from '../../src/game/monsters/felsengrollMotion.js';

const feet = ['ankleForeL', 'ankleForeR', 'ankleL', 'ankleR'];
const footMin = (r, id) => { r.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(r.nodes[id], true).min.y; };
const REST_KEYS = ['bodyY', 'bodyPitch', 'bodyRoll', 'bodyYaw', 'neck', 'neckYaw', 'head', 'headYaw', 'headReach', 'jaw', 'wing', 'spread', 'wingL', 'wingR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'foreL', 'foreR', 'foreKneeL', 'foreKneeR', 'foreAnkleL', 'foreAnkleR', 'hindL', 'hindR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'tailPitch', 'tailYaw', 'tailCurl', 'boiler', 'legL', 'legR'];

describe('Felsengroll elder rig', () => {
  it('stays inside the mobile geometry budget and reads wide and low', () => {
    const r = buildFelsengroll(); r.root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(r.root).getSize(new THREE.Vector3());
    let meshes = 0, tris = 0;
    r.root.traverse(o => { if (o.isMesh) { meshes++; tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
    expect(meshes).toBeLessThanOrEqual(75); expect(tris).toBeLessThanOrEqual(15000);
    expect(FELS_SCALE).toBeGreaterThan(1.5);
    const py = buildPyrostur(); py.root.updateMatrixWorld(true);
    const ps = new THREE.Box3().setFromObject(py.root).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThan(ps.x); expect(size.y).toBeLessThan(9); expect(size.y / size.x).toBeLessThan(.5);
    expect(size.x).toBeGreaterThan(10);
    for (const list of Object.values(r.partMeshes)) expect(list.length).toBeGreaterThan(0);
  });
  it('exposes every Pyrostur node plus shoulder and club', () => {
    const r = buildFelsengroll(), py = buildPyrostur();
    for (const id of Object.keys(py.nodes)) expect(r.nodes[id], id).toBeDefined();
    expect(r.nodes.shoulder).toBe(r.extra.shoulder); expect(r.nodes.club).toBe(r.extra.club);
    expect(r.nodes.club.parent).toBe(r.nodes.tailTip);
    expect(r.extra.ventAnchors.length).toBeGreaterThanOrEqual(8); expect(r.extra.ventAnchors.length).toBeLessThanOrEqual(12);
    expect(r.extra.coreMat.isMeshBasicMaterial).toBe(true);
    expect(r.extra.poolVisuals).toEqual([]);
    expect(r.extra.wings.wingL).toBe(r.nodes.wingL);
    for (const k of Object.keys(py.extra)) if (k !== 'pipe' && k !== 'needle') expect(r.extra[k], k).toBeDefined();
  });
  it('keeps feet on the ground at rest and finite under extreme poses', () => {
    const r = buildFelsengroll();
    for (const id of feet) { expect(footMin(r, id), id).toBeGreaterThan(-.08); expect(footMin(r, id), id).toBeLessThan(.1); }
    const extreme = Object.fromEntries(REST_KEYS.map(k => [k, k === 'boiler' ? 1 : 80]));
    for (const pose of [extreme, Object.fromEntries(REST_KEYS.map(k => [k, -80])), { wing: NaN, head: undefined }, {}]) {
      r.apply(pose); r.root.updateMatrixWorld(true);
      r.root.traverse(o => { expect(o.position.toArray().concat(o.quaternion.toArray(), o.scale.toArray()).every(Number.isFinite)).toBe(true); });
    }
    r.apply({}); for (const id of feet) expect(footMin(r, id), id).toBeGreaterThan(-.08);
  });
  it('keeps feet above ground in crouch poses', () => {
    const r = buildFelsengroll();
    for (const roll of [-20, 0, 20]) { r.apply({ bodyY: -.4, bodyPitch: 9, hindL: 25, hindR: 25, bodyRoll: roll }); for (const id of feet) expect(footMin(r, id), id).toBeGreaterThan(-.08); }
  });
  it('pulses seam glow with the boiler channel', () => {
    const r = buildFelsengroll(); r.apply({ boiler: 0 }); const a = r.extra.coreMat.color.getHex(); r.apply({ boiler: 1 });
    expect(r.extra.coreMat.color.getHex()).not.toBe(a);
  });
  for (const [name, speed, contacts] of [['walk', 3, 3], ['jog', 8, 2]]) it(`${name} gait keeps ${contacts}+ feet planted`, () => {
    const r = buildFelsengroll();
    for (let i = 0; i < 96; i++) {
      const p = {}; poseFelsengrollPresence({ vel: { x: 0, z: speed }, gait: i / 96 * Math.PI * 2, time: 0, quake: 30, rot: 0, pos: { x: 0, z: 0 } }, p);
      r.apply(p);
      const h = feet.map(id => footMin(r, id));
      for (const y of h) expect(y).toBeGreaterThan(-.08);
      expect(h.filter(y => y <= .15).length, JSON.stringify(h)).toBeGreaterThanOrEqual(contacts);
    }
  });
});
