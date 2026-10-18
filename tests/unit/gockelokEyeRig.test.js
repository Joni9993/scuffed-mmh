import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { gockelok, beginEye } from '../../src/game/monsters/gockelok.js';
import { make, DT } from './p3helpers.js';

const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
function visibleBox(root) {
  root.updateMatrixWorld(true); const box = new THREE.Box3(), b = new THREE.Box3();
  root.traverse((o) => { if (!o.isMesh || !shown(o)) return; o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(b); });
  return box;
}
function step(m, n = 30) { for (let i = 0; i < n; i++) { m.time += DT; gockelok.tick(m, DT); m._visuals(DT); } }

describe('Gockelok true form: Auge des Glitch', () => {
  it('is a huge separate model with reachable, finite hurtboxes', () => {
    const { m } = make(gockelok); step(m, 2);
    const roosterH = visibleBox(m.mesh).getSize(new THREE.Vector3()).y;
    m.applyDamage({ dmg: m.maxHp, partId: 'body' }); beginEye(m); m.recover = 999; step(m);
    expect(m.gockelForm).toBe('eye');
    const box = visibleBox(m.mesh), size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(8); expect(size.y).toBeGreaterThan(roosterH * 1.8); expect(box.min.y).toBeGreaterThan(m.pos.y - .5);
    const hp = m.hurtParts(); expect(hp.length).toBeGreaterThan(8);
    for (const h of hp) for (const v of [h.sphere.x, h.sphere.y, h.sphere.z, h.sphere.r]) expect(Number.isFinite(v), h.part.id).toBe(true);
    const low = hp.filter((h) => h.sphere.y - m.pos.y < 3).map((h) => h.part.id);
    expect(low).toEqual(expect.arrayContaining(['legs', 'spur', 'tail']));
    expect(Math.max(...hp.map((h) => h.sphere.y)) - m.pos.y).toBeGreaterThan(6); // pupil/core high up for ranged
    for (const p of m.lockPoints()) expect(Number.isFinite(p.pos.y)).toBe(true);
    // the rooster rig is hidden; the eye animates over time
    expect(m.mesh.getObjectByName('Auge des Glitch').visible).toBe(true);
    const head = m.hurtParts().find((h) => h.part.id === 'head').pos.clone(); step(m, 40);
    expect(m.hurtParts().find((h) => h.part.id === 'head').pos.distanceTo(head)).toBeGreaterThan(0);
    gockelok.dispose(m);
  });
  it('a crash/stun opening sinks the pupil into melee reach', () => {
    const { m } = make(gockelok); m.applyDamage({ dmg: m.maxHp, partId: 'body' }); beginEye(m);
    m.recover = 999; m.crashOpening = 4; step(m, 60);
    const head = m.hurtParts().find((h) => h.part.id === 'head');
    expect(head.sphere.y - head.sphere.r - m.pos.y).toBeLessThan(3);
    gockelok.dispose(m);
  });
});
