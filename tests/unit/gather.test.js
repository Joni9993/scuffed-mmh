import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createWorld } from '../../src/game/world/index.js';
import { createBus } from '../../src/core/events.js';
import { GATHER_KINDS, GATHER_TIME, rollGather, dropTable } from '../../src/data/gather.js';
import { createHazards } from '../../src/game/world/hazards.js';

const ITEM_IDS = new Set('knisterkraut blaublatt wabbelpilz stinkmorchel schrotterz glimmstein altknochen grossknochen brummkaefer blitzkaefer glutbrocken sprudelwasser'.split(' '));

describe('gather data', () => {
  it('drop tables only use contract item ids and positive weights', () => {
    for (const [kind, k] of Object.entries(GATHER_KINDS)) {
      for (const zone of Object.keys(k.zones)) {
        const t = dropTable(kind, Number(zone));
        expect(t.length).toBeGreaterThan(0);
        for (const d of t) { expect(ITEM_IDS.has(d.id)).toBe(true); expect(d.w).toBeGreaterThan(0); expect(d.n[0]).toBeGreaterThanOrEqual(1); }
      }
    }
  });
  it('rollGather is deterministic per (seed, point, use) and varies across them', () => {
    const a = rollGather(1, 'g2-8', 'erzader', 2, 0), b = rollGather(1, 'g2-8', 'erzader', 2, 0);
    expect(a).toEqual(b);
    const seen = new Set();
    for (let s = 1; s <= 60; s++) seen.add(JSON.stringify(rollGather(s, 'g2-8', 'erzader', 2, 0)));
    expect(seen.size).toBeGreaterThan(2);
    for (const r of seen) for (const it of JSON.parse(r)) expect(['schrotterz', 'glimmstein']).toContain(it.id);
  });
  it('rare drops are rarer than common drops (weights respected)', () => {
    let common = 0, rare = 0;
    for (let s = 0; s < 800; s++) for (const it of rollGather(s, 'x', 'erzader', 2, 0)) (it.id === 'schrotterz' ? common++ : rare++);
    expect(common).toBeGreaterThan(rare * 3);
    expect(rare).toBeGreaterThan(0);
  });
  it('every kind of the GDD table exists and a roll always returns 1+ items', () => {
    expect(Object.keys(GATHER_KINDS).length).toBe(7);
    for (const [kind, k] of Object.entries(GATHER_KINDS)) for (const zone of Object.keys(k.zones)) expect(rollGather(7, 'p', kind, Number(zone), 1).length).toBeGreaterThanOrEqual(1);
  });
});

describe('gather points in the world', () => {
  let w;
  beforeAll(() => { w = createWorld('schotterklamm', { seed: 1 }); });
  it('6-10 points per zone, kinds only in their GDD zones, 1-3 uses', () => {
    for (const z of [1, 2, 3, 4]) {
      const pts = w.gatherPoints.filter((p) => p.zone === z);
      expect(pts.length).toBeGreaterThanOrEqual(6);
      expect(pts.length).toBeLessThanOrEqual(10);
      for (const p of pts) { expect(GATHER_KINDS[p.kind].zones[z]).toBeGreaterThan(0); expect(w.zoneAt(p.pos.x, p.pos.z)).toBe(z); }
    }
    for (const p of w.gatherPoints) { expect(p.usesLeft).toBeGreaterThanOrEqual(1); expect(p.usesLeft).toBeLessThanOrEqual(3); }
    expect(new Set(w.gatherPoints.map((p) => p.kind)).size).toBe(7);
  });
  it('points are reachable, walkable, dry and not on lava', () => {
    for (const p of w.gatherPoints) {
      expect(w.layout.reachable(p.pos.x, p.pos.z)).toBe(true);
      expect(['mud', 'lava']).not.toContain(w.groundType(p.pos.x, p.pos.z));
      expect(Math.abs(p.pos.y - w.heightAt(p.pos.x, p.pos.z))).toBeLessThan(1e-6);
    }
  });
  it('placement is deterministic from the hunt seed and differs between seeds', () => {
    const sig = (world) => JSON.stringify(world.gatherPoints.map((p) => [p.id, p.kind, +p.pos.x.toFixed(3), +p.pos.z.toFixed(3), p.usesLeft]));
    const again = createWorld('schotterklamm', { seed: 1 });
    expect(sig(again)).toBe(sig(w));
    expect(sig(createWorld('schotterklamm', { seed: 2 }))).not.toBe(sig(w));
  });
  it('setGatherState updates usesLeft (network sync) and rejects unknown ids', () => {
    const p = w.gatherPoints[3];
    expect(w.setGatherState(p.id, 0)).toBe(true);
    expect(p.usesLeft).toBe(0);
    expect(w.setGatherState(p.id, 99)).toBe(true);
    expect(p.usesLeft).toBe(p.maxUses);
    expect(w.setGatherState('nope', 1)).toBe(false);
  });
});

function fakeHunt(world, pos) {
  const bus = createBus();
  const emitted = [];
  bus.on('*', (e, t) => emitted.push([t, e]));
  const down = { down: true, pressed: false };
  const hunt = {
    seed: 1, bus, emitted, world,
    scene: { background: new THREE.Color(), fog: new THREE.Fog('#000', 1, 2) },
    camera: new THREE.PerspectiveCamera(),
    app: { ui: { appendChild() {}, clientWidth: 844, clientHeight: 390 } },
    fx: { number() {}, spark() {}, flash() {} },
    input: { b: { context: down, attack: { pressed: false }, roll: { pressed: false } } },
    contextLabel: null,
  };
  hunt.player = { pos: new THREE.Vector3(pos.x, pos.y, pos.z), state: 'free', alive: true, weapon: { busy: false }, protect: 5, rot: 0, v: { hp: 100, maxHp: 100 }, takeHit() { return 'hit'; } };
  hunt.players = [hunt.player];
  return hunt;
}

describe('gather interaction', () => {
  it('hold context 0.8 s near a point: label, rooted, then exactly one gathered event; depleted points are inert', () => {
    const w = createWorld('schotterklamm', { seed: 1 });
    const pt = w.gatherPoints[0];
    const hunt = fakeHunt(w, { x: pt.pos.x + 1, y: pt.pos.y, z: pt.pos.z });
    const realCreate = document.createElement;
    document.createElement = () => ({ style: { setProperty() {} }, remove() {} });
    try {
      const dt = 1 / 60;
      let rooted = false;
      const left0 = pt.usesLeft;
      for (let i = 0; i < Math.round(GATHER_TIME / dt) - 3; i++) { w.update(dt, hunt); rooted ||= hunt.player.gatherRoot === true; }
      expect(hunt.contextLabel).toBe('Sammeln');
      expect(rooted).toBe(true);
      expect(hunt.emitted.filter(([t]) => t === 'gathered').length).toBe(0);
      for (let i = 0; i < 10; i++) w.update(dt, hunt);
      const g = hunt.emitted.filter(([t]) => t === 'gathered');
      expect(g.length).toBe(1);
      expect(g[0][1].pointId).toBe(pt.id);
      expect(g[0][1].items.length).toBeGreaterThanOrEqual(1);
      expect(g[0][1].items).toEqual(rollGather(1, pt.id, pt.kind, pt.zone, 0));
      expect(pt.usesLeft).toBe(left0 - 1);
      // still holding: must release before the next gather
      for (let i = 0; i < 80; i++) w.update(dt, hunt);
      expect(hunt.emitted.filter(([t]) => t === 'gathered').length).toBe(1);
      // deplete and check it is ignored
      w.setGatherState(pt.id, 0);
      hunt.input.b.context = { down: false, pressed: false };
      w.update(dt, hunt);
      expect(hunt.contextLabel).toBe(null);
    } finally { document.createElement = realCreate; }
  });
  it('rolling (or leaving "free") cancels the progress', () => {
    const w = createWorld('schotterklamm', { seed: 1 });
    const pt = w.gatherPoints[1];
    const hunt = fakeHunt(w, { x: pt.pos.x, y: pt.pos.y, z: pt.pos.z + 1 });
    const realCreate = document.createElement;
    document.createElement = () => ({ style: { setProperty() {} }, remove() {} });
    try {
      const dt = 1 / 60;
      for (let i = 0; i < 30; i++) w.update(dt, hunt);
      hunt.player.state = 'roll';
      for (let i = 0; i < 5; i++) w.update(dt, hunt);
      hunt.player.state = 'free';
      for (let i = 0; i < 30; i++) w.update(dt, hunt); // needs a full 0.8 s again
      expect(hunt.emitted.filter(([t]) => t === 'gathered').length).toBe(0);
    } finally { document.createElement = realCreate; }
  });
});

describe('hazards', () => {
  it('lava deals 10 HP per second (in ticks) and mud does not', () => {
    const w = createWorld('schotterklamm', { seed: 1 });
    const c = w.layout.cracks[0].pts[1];
    const hunt = fakeHunt(w, { x: c.x, y: 0, z: c.z });
    let dmg = 0;
    hunt.player.takeHit = (h) => { dmg += h.dmg * (1 - 5 / 85); return 'hit'; };
    const hz = createHazards(w.layout);
    for (let i = 0; i < 120; i++) hz.update(1 / 60, hunt);
    expect(dmg).toBeGreaterThan(14);
    expect(dmg).toBeLessThanOrEqual(20.01);
    const pool = w.layout.pools[0];
    hunt.player.pos.set(pool.x, 0, pool.z);
    const before = dmg;
    for (let i = 0; i < 120; i++) hz.update(1 / 60, hunt);
    expect(dmg).toBe(before);
  });
});
