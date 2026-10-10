import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { pickTone, framingFor, shiftHue, attach, TIMBRES } from '../../src/game/cues.js';
import { createCameraRig } from '../../src/render/camera.js';
import { createBus } from '../../src/core/events.js';

describe('cues', () => {
  it('Ton deterministisch, cue gewinnt', () => {
    expect(pickTone('jaggo_biss')).toEqual(pickTone('jaggo_biss'));
    expect(TIMBRES).toContain(pickTone('x').timbre);
    const t = pickTone('x', { color: '#112233', tone: 'zisch' });
    expect(t.timbre).toBe('zisch'); expect(t.color).toBe('#112233');
  });
  it('Kette hoeher + Farbwechsel', () => {
    const a = pickTone('x', { color: '#ff0000' }, 0), c = pickTone('x', { color: '#ff0000' }, 2);
    expect(c.f).toBeGreaterThan(a.f); expect(c.color).not.toBe(a.color);
    expect(shiftHue('#ff0000', 120)).toBe('#00ff00');
  });
  it('Framing nur bei Kette / Reichweite', () => {
    expect(framingFor({ def: { range: [0, 5] } }, 0)).toBeNull();
    expect(framingFor({ def: { range: [0, 5] }, duration: 2 }, 1).amount).toBeGreaterThanOrEqual(0.15);
    expect(framingFor({ def: { range: [2, 12] } }, 0).amount).toBeLessThanOrEqual(0.25);
  });
  it('Kamera frame zoomt weich raus und zurueck', () => {
    const rig = createCameraRig(new THREE.PerspectiveCamera(), () => 0);
    const p = { playerPos: new THREE.Vector3(), playerYaw: 0, moving: false, camInput: { dx: 0, dy: 0 }, lockPos: null };
    for (let i = 0; i < 120; i++) rig.update(1 / 60, p);
    rig.frame(0.2, 2);
    let prev = rig.frameK, maxStep = 0, peak = 0;
    for (let i = 0; i < 90; i++) { rig.update(1 / 60, p); maxStep = Math.max(maxStep, Math.abs(rig.frameK - prev)); prev = rig.frameK; peak = Math.max(peak, prev); }
    expect(peak).toBeGreaterThan(0.1); expect(maxStep).toBeLessThan(0.01);
    for (let i = 0; i < 400; i++) rig.update(1 / 60, p);
    expect(rig.frameK).toBeLessThan(0.01);
  });
  it('attach: attackStart -> sfx windup, retarget nur lokal', () => {
    const bus = createBus(), out = [], hud = { center: (t) => out.push(t), banner: (t) => out.push(t) };
    const rig = { frames: [], update() {}, frame(a, s) { this.frames.push([a, s]); } };
    bus.on('sfx', (e) => out.push(e.name));
    const hunt = { bus, hud, rig, player: { id: 'p1', pos: { x: 0, z: 0 } } };
    const off = attach(hunt);
    const monster = { pos: { x: 3, z: 0 }, parts: [] };
    bus.emit('attackStart', { monster, attackId: 'a_b', inst: { tgWall: 0.6, duration: 2, def: {} }, chainIdx: 1 });
    expect(out).toContain('windup'); expect(rig.frames.length).toBe(1);
    bus.emit('retarget', { monster, playerId: 'p2' });
    expect(out).not.toContain('eye');
    bus.emit('retarget', { monster, playerId: 'p1' });
    expect(out).toContain('eye');
    off();
  });
});
