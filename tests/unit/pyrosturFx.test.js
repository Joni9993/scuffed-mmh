import { describe, it, expect } from 'vitest';
import { make } from './p3helpers.js';
import { pyrostur } from '../../src/game/monsters/pyrostur.js';
import { updatePyrosturFx } from '../../src/game/monsters/pyrosturFx.js';

describe('Pyrostur visible attack effects', () => {
  it('keeps anatomical heat and four terrain contacts bounded between attacks and clears them at death', () => {
    const { m, ctx } = make(pyrostur); ctx.scene = {};
    updatePyrosturFx(m);
    const fx = m.extra.pyroFx, matrix = fx.footShadows.instanceMatrix.array;
    expect(fx.debris.mesh.geometry.drawRange.count).toBeGreaterThan(0);
    expect(fx.footShadows.count).toBe(4);
    expect(fx.footShadows.visible).toBe(true);
    for (let i = 0; i < 90; i++) { m.time += 1 / 60; updatePyrosturFx(m); }
    expect(fx.footShadows.instanceMatrix.array).toBe(matrix);
    expect([...matrix].every(Number.isFinite)).toBe(true);
    expect(fx.debris.mesh.geometry.drawRange.count).toBeLessThanOrEqual(6144);
    m._die(); updatePyrosturFx(m);
    expect(fx.footShadows.visible).toBe(false);
    expect(fx.debris.mesh.visible).toBe(false);
  });
  it('shows the committed flame lane only when firing, and removes it on interruption', () => {
    const { m, ctx } = make(pyrostur); ctx.scene = {};
    const inst = m.beginAttack('pyrostur_ofenschneise', { teach: false });
    m.attack.t = inst.wall(.8); updatePyrosturFx(m);
    const mesh = m.extra.pyroFx.flame.mesh;
    expect(mesh.visible).toBe(false);
    m.attack.t = inst.wall(1.6); updatePyrosturFx(m);
    expect(mesh.visible).toBe(true);
    const geo = mesh.geometry, vertices = geo.attributes.position.array;
    let furthest = -Infinity;
    for (let i = 0; i < geo.drawRange.count; i++) furthest = Math.max(furthest, vertices[i * 3 + 2]);
    expect(furthest).toBeGreaterThan(20); // flame actually reaches the far end of the damaging lane
    m._interrupt(); updatePyrosturFx(m); expect(mesh.visible).toBe(false);
  });
  it('fire rain has falling projectiles before impact and nondegenerate vertical flames at impact', () => {
    const { m, ctx } = make(pyrostur); ctx.scene = {};
    const inst = m.beginAttack('pyrostur_feuerregen', { teach: false });
    m.attack.t = inst.wall(1.4); updatePyrosturFx(m);
    const geo = m.extra.pyroFx.flame.mesh.geometry;
    expect(geo.drawRange.count).toBeGreaterThan(0);
    m.attack.t = inst.wall(1.84); updatePyrosturFx(m);
    const a = geo.attributes.position.array, y = [], x = [];
    for (let i = 0; i < geo.drawRange.count; i++) { x.push(a[i * 3]); y.push(a[i * 3 + 1]); }
    expect(Math.max(...y) - Math.min(...y)).toBeGreaterThan(2);
    expect(Math.max(...x) - Math.min(...x)).toBeGreaterThan(6);
    expect(geo.drawRange.count).toBeLessThanOrEqual(6144);
    const old = geo.attributes.position.array;
    for (let i = 0; i < 20; i++) updatePyrosturFx(m);
    expect(geo.attributes.position.array).toBe(old); // no growing geometry or particle pools
    expect(m.extra.pyroFx.debris.mesh.parent).toBe(m.mesh);
  });
});
