import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/game/world/index.js';
import { zoneAt, zoneWeights, HALF } from '../../src/game/world/layout.js';
import { createRng } from '../../src/core/rng.js';

let w, L;
beforeAll(() => { w = createWorld('schotterklamm', { seed: 1 }); L = w.layout; });

describe('Schotterklamm heightfield', () => {
  it('is deterministic for the same terrain seed', () => {
    const w2 = createWorld('schotterklamm', { seed: 99 }); // hunt seed must not change the terrain
    for (const [x, z] of [[0, 0], [-60, -60], [60, 60], [33, -71], [-100, 40]]) expect(w2.heightAt(x, z)).toBe(w.heightAt(x, z));
  });
  it('is continuous (no jumps between nearby samples) and bounded', () => {
    const rng = createRng(5);
    let worst = 0;
    for (let i = 0; i < 4000; i++) {
      const x = (rng() - 0.5) * 2 * HALF, z = (rng() - 0.5) * 2 * HALF;
      const h = w.heightAt(x, z);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(-8);
      expect(h).toBeLessThan(45);
      const d = Math.abs(w.heightAt(x + 0.05, z) - h);
      worst = Math.max(worst, d);
    }
    expect(worst).toBeLessThan(0.3); // steepest cliff gradient ~5 -> 0.25 per 5 cm
  });
  it('clamps outside the map instead of returning NaN', () => {
    expect(Number.isFinite(w.heightAt(-500, 900))).toBe(true);
    expect(w.heightAt(-500, 900)).toBe(w.heightAt(-HALF, HALF));
  });
  it('Glutkamm lies higher than the other zones', () => {
    expect(w.heightAt(60, -60)).toBeGreaterThan(w.heightAt(-60, -60) + 6);
    expect(w.heightAt(60, 60)).toBeLessThan(w.heightAt(-60, -60));
  });
});

describe('zones and ground types', () => {
  it('zoneAt maps the four quadrants (1 Wiese, 2 Grube, 3 Senke, 4 Kamm)', () => {
    expect(w.zoneAt(-60, -60)).toBe(1);
    expect(w.zoneAt(-60, 60)).toBe(2);
    expect(w.zoneAt(60, 60)).toBe(3);
    expect(w.zoneAt(60, -60)).toBe(4);
    expect(zoneAt(-0.1, -0.1)).toBe(1);
    expect(w.zoneName(3)).toBe('Schlammsenke');
  });
  it('zone blend weights sum to 1 and favour the zone you stand in', () => {
    for (const [x, z, k] of [[-60, -60, 0], [-60, 60, 1], [60, 60, 2], [60, -60, 3], [3, 4, -1]]) {
      const v = zoneWeights(x, z, 14);
      expect(v.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
      if (k >= 0) expect(v[k]).toBeGreaterThan(0.99);
    }
  });
  it('groundType: grass in the meadow, rock in pit/ridge, mud only in zone 3, lava only in zone 4', () => {
    expect(w.groundType(w.campPoint.x, w.campPoint.z)).toBe('grass');
    expect(w.groundType(-70, 40)).toBe('rock');
    const seen = new Set();
    for (let x = -118; x < 118; x += 1) {
      for (let z = -118; z < 118; z += 1) {
        const g = w.groundType(x, z);
        seen.add(g);
        if (g === 'mud') expect(w.zoneAt(x, z)).toBe(3);
        if (g === 'lava') expect(w.zoneAt(x, z)).toBe(4);
      }
    }
    expect([...seen].sort()).toEqual(['grass', 'lava', 'mud', 'rock']);
    const pool = L.pools[0];
    expect(w.groundType(pool.x, pool.z)).toBe('mud');
    const c = L.cracks[0].pts[1];
    expect(w.groundType(c.x, c.z)).toBe('lava');
  });
  it('mud pools and lava cracks are not on the paths between zones or at nests', () => {
    for (const p of [w.nestFor('barrotz'), w.nestFor('brathalos'), w.nestFor('jaggo'), w.campPoint]) {
      expect(['mud', 'lava']).not.toContain(w.groundType(p.x, p.z));
    }
  });
});

describe('collision', () => {
  it('pushes a circle out of a rock collider', () => {
    const c = L.colliders[0];
    const pos = { x: c.x + c.r * 0.2, z: c.z };
    w.collide(pos, 0.4);
    expect(Math.hypot(pos.x - c.x, pos.z - c.z)).toBeGreaterThanOrEqual(c.r + 0.4 - 1e-3);
  });
  it('blocks cliffs: walking from camp straight at the central massif never enters a cliff', () => {
    const pos = { x: w.campPoint.x, z: w.campPoint.z };
    const dir = { x: -pos.x, z: -pos.z };
    const l = Math.hypot(dir.x, dir.z);
    for (let i = 0; i < 1500; i++) {
      pos.x += (dir.x / l) * 0.15; pos.z += (dir.z / l) * 0.15;
      w.collide(pos, 0.4);
      expect(L.sdfAt(pos.x, pos.z)).toBeGreaterThan(-0.2);
    }
    expect(Math.hypot(pos.x, pos.z)).toBeGreaterThan(30); // stopped at the foot of the massif
  });
  it('keeps everything inside the map boundary', () => {
    const pos = { x: 900, z: -900 };
    w.collide(pos, 1);
    expect(Math.abs(pos.x)).toBeLessThan(HALF);
    expect(Math.abs(pos.z)).toBeLessThan(HALF);
  });
  it('lets you through the canyon gaps between zones', () => {
    for (const [from, to] of [[{ x: -62, z: -20 }, { x: -62, z: 20 }], [{ x: -20, z: 62 }, { x: 20, z: 62 }], [{ x: 62, z: 20 }, { x: 62, z: -20 }]]) {
      const pos = { ...from };
      const n = 400, sx = (to.x - from.x) / n, sz = (to.z - from.z) / n;
      for (let i = 0; i < n; i++) { pos.x += sx; pos.z += sz; w.collide(pos, 0.5); }
      expect(Math.hypot(pos.x - to.x, pos.z - to.z)).toBeLessThan(1.5);
    }
  });
});

describe('nests, routes, spawns', () => {
  const okPoint = (p) => {
    expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    expect(L.walkable(p.x, p.z, 1.2)).toBe(true);
    expect(L.reachable(p.x, p.z)).toBe(true);
    expect(w.groundType(p.x, p.z)).not.toBe('lava');
  };
  it('nestFor: Jaggo in zone 2, Barrotz in 3, Brathalos in 4', () => {
    expect(w.zoneAt(w.nestFor('jaggo').x, w.nestFor('jaggo').z)).toBe(2);
    expect(w.zoneAt(w.nestFor('barrotz').x, w.nestFor('barrotz').z)).toBe(3);
    expect(w.zoneAt(w.nestFor('brathalos').x, w.nestFor('brathalos').z)).toBe(4);
    for (const id of ['jaggo', 'barrotz', 'brathalos', 'jaggling', 'unknown']) okPoint(w.nestFor(id));
    expect(w.nestFor('jaggo')).not.toBe(w.nestFor('jaggo')); // copies
  });
  it('routeFor returns walkable, reachable waypoints spread over several zones', () => {
    for (const id of ['jaggo', 'jaggling', 'barrotz', 'brathalos', 'unknown']) {
      const r = w.routeFor(id);
      expect(r.length).toBeGreaterThanOrEqual(4);
      r.forEach(okPoint);
      const zones = new Set(r.map((p) => w.zoneAt(p.x, p.z)));
      if (id !== 'jaggling') expect(zones.size).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < r.length; i++) expect(Math.hypot(r[i].x - r[(i + 1) % r.length].x, r[i].z - r[(i + 1) % r.length].z)).toBeGreaterThan(5);
    }
  });
  it('spawn points and camp are in the meadow, walkable, with the camp props in place', () => {
    expect(w.spawnPoints.length).toBeGreaterThanOrEqual(4);
    for (const s of w.spawnPoints) { okPoint(s); expect(w.zoneAt(s.x, s.z)).toBe(1); expect(typeof s.yaw).toBe('number'); }
    expect(w.zoneAt(w.campPoint.x, w.campPoint.z)).toBe(1);
    expect(L.campProps.tent && L.campProps.chest).toBeTruthy();
  });
  it('monsterSpawns has an entry per monster and a default', () => {
    for (const k of ['default', 'jaggo', 'barrotz', 'brathalos']) okPoint(w.monsterSpawns[k]);
  });
  it('the old test arena is still available and gets default phase 2 fields', () => {
    const a = createWorld('arena');
    expect(a.id).toBe('test');
    expect(a.zoneAt(0, 0)).toBe(1);
    expect(a.groundType(0, 0)).toBe('grass');
    expect(a.nestFor('barrotz')).toEqual(a.nestPoint);
    expect(a.gatherPoints).toEqual([]);
  });
});

describe('performance budget (static)', () => {
  it('has few meshes (draw calls) and a sane triangle count', () => {
    const s = w.stats();
    expect(s.meshes).toBeLessThan(140);
    expect(s.tris).toBeLessThan(90000);
  });
});
