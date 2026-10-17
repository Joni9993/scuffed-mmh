import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildVoltiris, VOLT_SCALE } from '../../src/game/monsters/voltirisRig.js';
import { buildPyrostur } from '../../src/game/monsters/pyrosturRig.js';
import { poseVoltirisPresence } from '../../src/game/monsters/voltirisMotion.js';

const feet = ['ankleForeL', 'ankleForeR', 'ankleL', 'ankleR'];
const footMin = (r, id) => { r.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(r.nodes[id], true).min.y; };
const REST_KEYS = ['bodyY', 'bodyPitch', 'bodyRoll', 'bodyYaw', 'neck', 'neckYaw', 'head', 'headYaw', 'headReach', 'jaw', 'wing', 'spread', 'wingL', 'wingR', 'elbowL', 'elbowR', 'wristL', 'wristR', 'foreL', 'foreR', 'foreKneeL', 'foreKneeR', 'foreAnkleL', 'foreAnkleR', 'hindL', 'hindR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'tailPitch', 'tailYaw', 'tailCurl', 'boiler', 'legL', 'legR'];
const size = (r) => { r.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(r.root).getSize(new THREE.Vector3()); };

describe('Voltiris elder rig', () => {
  it('stays inside the mobile geometry budget and reads tall and slender', () => {
    const r = buildVoltiris(); const s = size(r);
    let meshes = 0, tris = 0;
    r.root.traverse(o => { if (o.isMesh) { meshes++; tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; } });
    expect(meshes).toBeLessThanOrEqual(75); expect(tris).toBeLessThanOrEqual(15000);
    const ps = size(buildPyrostur());
    expect(s.y).toBeGreaterThan(ps.y * 1.5); expect(s.y).toBeGreaterThan(s.x); expect(s.y / s.x).toBeGreaterThan(1.05);
    expect(VOLT_SCALE).toBeGreaterThan(1);
    for (const [k, list] of Object.entries(r.partMeshes)) expect(list.length, k).toBeGreaterThan(0);
  });
  it('exposes every Pyrostur node plus antenna, and the extras', () => {
    const r = buildVoltiris(), py = buildPyrostur();
    for (const id of Object.keys(py.nodes)) expect(r.nodes[id], id).toBeDefined();
    expect(r.nodes.antenna).toBe(r.extra.antenna); expect(r.nodes.antenna.parent).toBe(r.nodes.head);
    expect(r.extra.ventAnchors.length).toBeGreaterThanOrEqual(8); expect(r.extra.ventAnchors.length).toBeLessThanOrEqual(12);
    expect(r.extra.coreMat.isMeshBasicMaterial).toBe(true);
    expect(r.extra.wings.wingL).toBe(r.nodes.wingL);
    for (const k of Object.keys(py.extra)) if (k !== 'pipe' && k !== 'needle') expect(r.extra[k], k).toBeDefined();
  });
  it('has an asymmetric wing pair, left larger', () => {
    const r = buildVoltiris(); r.root.updateMatrixWorld(true);
    const wl = new THREE.Box3().setFromObject(r.nodes.wingL).getSize(new THREE.Vector3()), wr = new THREE.Box3().setFromObject(r.nodes.wingR).getSize(new THREE.Vector3());
    expect(wl.length()).toBeGreaterThan(wr.length() * 1.2);
  });
  it('keeps feet on the ground at rest and finite under extreme poses', () => {
    const r = buildVoltiris();
    for (const id of feet) { expect(footMin(r, id), id).toBeGreaterThan(-.08); expect(footMin(r, id), id).toBeLessThan(.1); }
    const extreme = Object.fromEntries(REST_KEYS.map(k => [k, k === 'boiler' ? 1 : 80]));
    for (const pose of [extreme, Object.fromEntries(REST_KEYS.map(k => [k, -80])), { wing: NaN, head: undefined, boiler: NaN }, {}]) {
      r.apply(pose); r.root.updateMatrixWorld(true);
      r.root.traverse(o => { expect(o.position.toArray().concat(o.quaternion.toArray(), o.scale.toArray()).every(Number.isFinite)).toBe(true); });
    }
    r.apply({}); for (const id of feet) expect(footMin(r, id), id).toBeGreaterThan(-.08);
  });
  it('keeps feet above ground in crouch poses', () => {
    const r = buildVoltiris();
    for (const roll of [-20, 0, 20]) { r.apply({ bodyY: -.6, bodyPitch: 9, hindL: 25, hindR: 25, bodyRoll: roll }); for (const id of feet) expect(footMin(r, id), id).toBeGreaterThan(-.08); }
  });
  it('glow follows the boiler (charge) channel', () => {
    const r = buildVoltiris(); r.apply({ boiler: 0 }); const a = r.extra.coreMat.color.getHex(); r.apply({ boiler: 1 });
    expect(r.extra.coreMat.color.getHex()).not.toBe(a);
  });
  it('makeEcho returns a cheap eyeless wireframe group', () => {
    const r = buildVoltiris(), e = r.extra.makeEcho();
    expect(e.isGroup).toBe(true);
    const meshes = []; e.traverse(o => o.isMesh && meshes.push(o));
    expect(meshes.length).toBeGreaterThan(0); expect(meshes.length).toBeLessThanOrEqual(6);
    for (const m of meshes) { expect(m.material.wireframe).toBe(true); expect(m.geometry.attributes.position.count).toBeGreaterThan(0); }
    const eb = new THREE.Box3().setFromObject(e).getSize(new THREE.Vector3()), rb = size(r);
    expect(eb.y).toBeGreaterThan(rb.y * .6);
    expect(r.extra.echoGeometry().isGroup).toBe(true);
  });
  for (const [name, speed, contacts] of [['walk', 3, 2], ['jog', 8, 2]]) it(`${name} gait keeps ${contacts}+ feet planted`, () => {
    const r = buildVoltiris();
    for (let i = 0; i < 96; i++) {
      const p = {}; poseVoltirisPresence({ vel: { x: 0, z: speed }, gait: i / 96 * Math.PI * 2, time: i * .05, charge: .5, rot: 0, pos: { x: 0, z: 0 } }, p);
      r.apply(p);
      const h = feet.map(id => footMin(r, id));
      for (const y of h) expect(y).toBeGreaterThan(-.08);
      expect(h.filter(y => y <= .2).length, JSON.stringify(h)).toBeGreaterThanOrEqual(contacts);
    }
  });
  it('motion output is finite with and without target/charge', () => {
    for (const m of [{ vel: { x: 0, z: 0 }, gait: 0, time: 3 }, { vel: { x: 1, z: 9 }, gait: 40, time: 77, extra: { glow: .9 }, target: { pos: { x: 5, z: 5 } }, pos: { x: 0, z: 0 }, rot: 1 }]) {
      const p = {}; poseVoltirisPresence(m, p);
      for (const [k, v] of Object.entries(p)) expect(Number.isFinite(v), k).toBe(true);
    }
  });
});
