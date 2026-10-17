import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildPyrostur } from '../../src/game/monsters/pyrosturRig.js';
import { posePyrosturPresence } from '../../src/game/monsters/pyrosturMotion.js';
import { pyrostur } from '../../src/game/monsters/pyrostur.js';
import { make, DT } from './p3helpers.js';
const feet = ['ankleForeL', 'ankleForeR', 'ankleL', 'ankleR'];
const snapshot = (rig, id) => { rig.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(rig.nodes[id], true).min.y; };
function pose(rig, speed, phase, time = 0) {
  const p = {};
  posePyrosturPresence({ vel: { x: 0, z: speed }, gait: phase * Math.PI * 2 / 1.42, time, pressure: 30, rot: 0, pos: { x: 0, z: 0 } }, p);
  rig.apply(p); return p;
}
describe('Pyrostur grounded quadruped presence', () => {
  it('never cycles the legs while stationary, even if an old movement phase remains', () => {
    const rig = buildPyrostur();
    for (let sample = 0; sample < 16; sample++) {
      const p = pose(rig, 0, sample / 16, sample * .3);
      for (const id of ['foreL', 'foreR', 'hindL', 'hindR', 'foreKneeL', 'foreKneeR', 'kneeL', 'kneeR']) expect(p[id], id).toBeCloseTo(0, 8);
      for (const id of feet) expect(snapshot(rig, id), id).toBeGreaterThan(-.08);
    }
  });
  for (const [name, speed, minimumContacts] of [['walk', 3, 3], ['jog', 8, 2]]) it(`${name} carries weight on ${minimumContacts} feet and never pushes its feet through the floor`, () => {
    const rig = buildPyrostur(); let minimum = 4;
    for (let sample = 0; sample < 96; sample++) {
      const phase = sample / 96;
      pose(rig, speed, phase);
      const heights = feet.map(id => snapshot(rig, id));
      minimum = Math.min(minimum, heights.filter(y => y <= .15).length);
      for (let i = 0; i < feet.length; i++) expect(heights[i], `${name}/${phase}/${feet[i]}`).toBeGreaterThan(-.08);
      expect(heights.filter(y => y <= .15).length, `${name}/${phase}: ${JSON.stringify(heights)}`).toBeGreaterThanOrEqual(minimumContacts);
    }
    expect(minimum).toBeGreaterThanOrEqual(minimumContacts);
  });
  it('moves the four legs without turning the enormous wings into walking limbs', () => {
    const rig = buildPyrostur();
    pose(rig, 3, 0); const wing = rig.nodes.wingL.quaternion.clone(), fore = rig.nodes.forelegL.quaternion.clone();
    pose(rig, 3, .4);
    expect(rig.nodes.wingL.quaternion.angleTo(wing)).toBeLessThan(.00001);
    expect(rig.nodes.forelegL.quaternion.angleTo(fore)).toBeGreaterThan(.2);
  });
  it('preserves the production feeding pose instead of replacing it with neutral presence', () => {
    const { m } = make(pyrostur, 'fressen');
    m.time = .2; m._visuals(DT);
    expect(m._tgt.neck).toBeGreaterThan(.4);
    expect(m._tgt.head).toBeGreaterThan(25);
    expect(m._tgt.bodyPitch).toBeGreaterThan(5);
    expect(m.nodes.head.rotation.x).toBeGreaterThan(0);
    m.state = 'combat'; m._visuals(DT);
    expect(m._tgt.neck).toBeLessThan(.1);
    expect(m._tgt.head).toBeLessThan(5);
  });
  it('layers poison, scald, stink and rust reactions over the actual quadruped gait', () => {
    const sample = status => {
      const { m } = make(pyrostur); m.time = .2; m.gait = .37; m.vel.set(0, 0, 3);
      if (status) m.st[status] = 5;
      m._visuals(DT); return m._tgt;
    };
    const base = sample();
    for (const [status, channels] of [
      ['poisonT', ['neck', 'head', 'jaw']],
      ['scaldT', ['bodyRoll', 'bodyY', 'tailYaw']],
      ['stink', ['headYaw', 'head', 'neck']],
      ['rustT', ['neck', 'tailYaw']],
    ]) {
      const affected = sample(status);
      for (const key of channels) expect(Math.abs(affected[key] - base[key]), `${status}/${key}`).toBeGreaterThan(.001);
      expect(Math.abs(affected.foreL) + Math.abs(affected.hindL), status + ' still walks on four legs').toBeGreaterThan(1);
    }
  });
});
