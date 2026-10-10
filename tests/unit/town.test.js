import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { STATIONS, BOXES, CIRCLES, SPAWNS, TOWN_HALF_X, TOWN_HALF_Z, pickStation, collideTown, heightAtTown, pushOutOfBox, insideSolid } from '../../src/game/town/layout.js';
import { FLOW, flowStart, flowNext } from '../../src/game/town/flow.js';
import { EMOTES, emoteWire, emoteText } from '../../src/game/town/emotes.js';
import { createTown } from '../../src/game/town/world.js';
import { encodeTown, decodeTown } from '../../src/net/protocol.js';

describe('station proximity', () => {
  it('picks the station you stand on, null in the open', () => {
    for (const s of STATIONS) expect(pickStation(s.x, s.z)?.id).toBe(s.id);
    expect(pickStation(0, -11)).toBe(null);
    expect(pickStation(0, 0)).toBe(null);
  });
  it('respects the radius and prefers the closest (in radii)', () => {
    const s = STATIONS[0];
    expect(pickStation(s.x + s.r + 0.1, s.z)).toBe(null);
    expect(pickStation(s.x + s.r - 0.1, s.z)?.id).toBe(s.id);
    const a = { id: 'a', x: 0, z: 0, r: 4 }, b = { id: 'b', x: 3, z: 0, r: 1.5 };
    expect(pickStation(2.6, 0, [a, b]).id).toBe('b');
    expect(pickStation(1, 0, [a, b]).id).toBe('a');
  });
  it('station spots are reachable (not inside a solid) and spawns are free', () => {
    for (const s of STATIONS) { const p = { x: s.x, z: s.z }; collideTown(p, 0.4); expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThan(0.05); }
    for (const s of SPAWNS) { const p = { x: s.x, z: s.z }; collideTown(p, 0.4); expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeLessThan(0.05); }
  });
});

describe('town collision', () => {
  it('keeps points inside the plateau', () => {
    const p = { x: 99, z: -99 };
    collideTown(p, 0.4);
    expect(p.x).toBeCloseTo(TOWN_HALF_X - 0.4);
    expect(p.z).toBeCloseTo(-(TOWN_HALF_Z - 0.4));
  });
  it('pushes out of the campfire and of rotated huts', () => {
    const p = { x: 0.2, z: 0.1 };
    collideTown(p, 0.4);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(1.5 + 0.4 - 1e-6);
    for (const b of BOXES) {
      const q = { x: b.x, z: b.z };
      collideTown(q, 0.4);
      const probe = { ...q };
      expect(pushOutOfBox(probe, 0.4 - 0.01, b)).toBe(false);
    }
  });
  it('random walkers never end up inside a solid or outside', () => {
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2000; i++) {
      const p = { x: (rnd() - 0.5) * 70, z: (rnd() - 0.5) * 70 };
      collideTown(p, 0.4);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(TOWN_HALF_X);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(TOWN_HALF_Z);
      for (const k of CIRCLES) if (!k.id.startsWith('gate')) expect(Math.hypot(p.x - k.x, p.z - k.z)).toBeGreaterThan(k.r + 0.4 - 0.02);
    }
  });
  it('height is finite and gentle; camera clipping sees huts', () => {
    for (let x = -30; x <= 30; x += 3) for (let z = -30; z <= 30; z += 3) { const h = heightAtTown(x, z); expect(Math.abs(h)).toBeLessThan(0.4); }
    const b = BOXES[0];
    expect(insideSolid(b.x, 1, b.z)).toBe(true);
    expect(insideSolid(b.x, 20, b.z)).toBe(false);
  });
});

describe('town flow state machine', () => {
  it('start states', () => {
    expect(flowStart({ nameSet: false })).toBe(FLOW.NAME);
    expect(flowStart({ nameSet: true })).toBe(FLOW.CHOICE);
    expect(flowStart({ nameSet: false, entered: true })).toBe(FLOW.TOWN);
    expect(flowStart({ mode: 'solo' })).toBe(FLOW.TOWN);
    expect(flowStart({ mode: 'host' })).toBe(FLOW.CONNECTING);
    expect(flowStart({ mode: 'join' })).toBe(FLOW.CONNECTING);
  });
  it('name -> choice -> solo / host / join', () => {
    expect(flowNext(FLOW.NAME, 'nameDone')).toBe(FLOW.CHOICE);
    expect(flowNext(FLOW.NAME, 'solo')).toBe(FLOW.NAME);
    expect(flowNext(FLOW.CHOICE, 'solo')).toBe(FLOW.TOWN);
    const c = flowNext(FLOW.CHOICE, 'host');
    expect(c).toBe(FLOW.CONNECTING);
    expect(flowNext(c, 'ok')).toBe(FLOW.TOWN);
    expect(flowNext(c, 'fail')).toBe(FLOW.CHOICE);
    const j = flowNext(FLOW.CHOICE, 'joinPrompt');
    expect(j).toBe(FLOW.JOIN);
    expect(flowNext(j, 'back')).toBe(FLOW.CHOICE);
    expect(flowNext(j, 'join')).toBe(FLOW.CONNECTING);
    expect(flowNext(FLOW.TOWN, 'solo')).toBe(FLOW.TOWN);
  });
});

describe('emotes + presence fields', () => {
  it('six emotes with wire ids', () => {
    expect(EMOTES).toHaveLength(6);
    expect(EMOTES).toEqual(['Hilfe!', 'Hier!', 'Falle!', 'Danke', 'Los!', 'Oops']);
    expect(emoteText(emoteWire(2))).toBe('Falle!');
    expect(emoteWire(9)).toBe(0);
    expect(emoteText(0)).toBe(null);
  });
  it('encodeTown carries emote, colour and weapon (and stays small without them)', () => {
    const base = { x: 1, y: 0, z: 2, rot: 0.5, speed: 3 };
    const d = decodeTown(encodeTown({ ...base, emote: 4, emoteN: 7, color: 2, weapon: 'bow' }, 12));
    expect(d).toMatchObject({ x: 1, z: 2, emote: 4, emoteN: 7, color: 2, weapon: 'bow' });
    const plain = encodeTown(base, 12);
    expect(plain.e).toBeUndefined();
    expect(decodeTown(plain).emote).toBe(0);
  });
});

describe('town world', () => {
  it('implements the world interface with few meshes', () => {
    const w = createTown();
    expect(typeof w.heightAt(0, 0)).toBe('number');
    expect(w.spawnPoints.length).toBe(4);
    let meshes = 0;
    w.mesh.traverse((o) => { if (o.isMesh || o.isSprite) meshes++; });
    expect(meshes).toBeLessThan(40);
    const p = new THREE.Vector3(0, 0, 0);
    w.collide(p, 0.4);
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(1.8);
  });
});

describe('scene lifecycle (singleton scenes)', () => {
  it('resetLifecycle clears the dead/starting flags exit()/beginHunt left behind', async () => {
    const { resetLifecycle } = await import('../../src/game/town/flow.js');
    const scene = { dead: true, starting: true };
    expect(resetLifecycle(scene)).toBe(scene);
    expect(scene.dead).toBe(false);
    expect(scene.starting).toBe(false);
  });
  it('hub enter() calls resetLifecycle (regression: panels dead after a hunt)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../../src/scenes/hub.js', import.meta.url), 'utf8');
    expect(src.slice(src.indexOf('enter(app'), src.indexOf('exit() {'))).toContain('resetLifecycle(this)');
  });
});
