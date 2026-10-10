import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/game/world/index.js';
import { getNav } from '../../src/game/monsters/nav.js';
import { createHazards, TOXIC_DELAY } from '../../src/game/world/hazards.js';
import { createBus } from '../../src/core/events.js';
import { GATHER_KINDS } from '../../src/data/gather.js';

let w, L;
beforeAll(() => { w = createWorld('rostwerke', { seed: 1 }); L = w.layout; });

const sampleGround = () => {
  const seen = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };
  for (let x = -126; x <= 126; x += 2) for (let z = -126; z <= 126; z += 2) seen[w.zoneAt(x, z)].add(w.groundType(x, z));
  return seen;
};

describe('rostwerke terrain', () => {
  it('has 4 zones and the 6 contract ground types where expected', () => {
    expect(w.id).toBe('rostwerke');
    expect([w.zoneAt(-60, -60), w.zoneAt(-60, 60), w.zoneAt(60, 60), w.zoneAt(60, -60)]).toEqual([1, 2, 3, 4]);
    const g = sampleGround();
    expect(g[1].has('slag')).toBe(true);
    expect(g[2].has('metal')).toBe(true);
    expect(g[3].has('toxic')).toBe(true);
    expect(g[3].has('grass')).toBe(true);
    expect(g[4].has('metal')).toBe(true);
    expect(w.bounds.maxX - w.bounds.minX).toBe(260);
  });
  it('Kesselhalle has a raised walkway reachable by ramp, Turbinenkrone is high', () => {
    const base = w.heightAt(-60, 40);
    expect(w.heightAt(-95, 40)).toBeGreaterThan(base + 3);
    expect(w.heightAt(-44, 97)).toBeGreaterThan(base + 5);
    expect(L.reachable(-95, 40)).toBe(true);
    expect(L.reachable(-44, 97)).toBe(true);
    expect(w.heightAt(60, -30)).toBeGreaterThan(w.heightAt(60, 60) + 10);
    expect(L.reachable(60, -30)).toBe(true);
  });
  it('minimap and env present', () => {
    expect(w.minimap.data.length).toBe(w.minimap.size * w.minimap.size * 4);
    expect(w.env.background).toBeTruthy();
    expect(w.env.fog.far).toBeGreaterThan(w.env.fog.near);
  });
});

describe('rostwerke contract fields', () => {
  it('spawnPoints (4), campPoint, monsterSpawns, nestFor/routeFor per Brocken', () => {
    expect(w.spawnPoints.length).toBe(4);
    expect(w.campPoint).toHaveProperty('x');
    for (const k of ['kroll', 'gorgo', 'voltaro', 'default']) expect(w.monsterSpawns[k]).toHaveProperty('x');
    expect(w.zoneAt(w.monsterSpawns.kroll.x, w.monsterSpawns.kroll.z)).toBe(2);
    expect(w.zoneAt(w.monsterSpawns.gorgo.x, w.monsterSpawns.gorgo.z)).toBe(1);
    expect(w.zoneAt(w.monsterSpawns.voltaro.x, w.monsterSpawns.voltaro.z)).toBe(4);
    for (const id of ['kroll', 'gorgo', 'voltaro']) {
      expect(w.routeFor(id).length).toBeGreaterThan(4);
      expect(w.nestFor(id)).toHaveProperty('x');
    }
    expect(w.nestFor('unknown')).toEqual(w.nestFor('kroll'));
  });
  it('all spawns, nests, routes and the camp are walkable, reachable and not inside colliders', () => {
    const pts = [w.campPoint, ...w.spawnPoints, ...Object.values(w.monsterSpawns)];
    for (const id of ['kroll', 'gorgo', 'voltaro']) pts.push(w.nestFor(id), ...w.routeFor(id));
    for (const p of pts) {
      expect(L.walkable(p.x, p.z, 1.2)).toBe(true);
      expect(L.reachable(p.x, p.z)).toBe(true);
      expect(L.clearOfColliders(p.x, p.z, 0.8), JSON.stringify(p)).toBe(true);
      expect(w.groundType(p.x, p.z)).not.toBe('toxic');
    }
  });
  it('nav grid: camp <-> every nest and route leg has a path (also up the ramps)', () => {
    const nav = getNav(w);
    expect(nav).toBeTruthy();
    for (const id of ['kroll', 'gorgo', 'voltaro']) {
      const n = w.nestFor(id);
      expect(nav.find(w.campPoint.x, w.campPoint.z, n.x, n.z), `camp->${id}`).toBeTruthy();
      const r = w.routeFor(id);
      for (let i = 0; i < r.length - 1; i++) expect(nav.find(r[i].x, r[i].z, r[i + 1].x, r[i + 1].z), `${id} leg ${i}`).toBeTruthy();
    }
    const kz = w.nestFor('kroll'), vz = w.nestFor('voltaro');
    expect(nav.find(kz.x, kz.z, vz.x, vz.z)).toBeTruthy(); // Kesselhalle -> Giftgraben -> up the long ramp -> Turbinenkrone
  });
});

describe('rostwerke interactables', () => {
  it('6 valve (Z2), 2 crane (Z1, dropAt), 4 rod (Z4), each with a mesh and a walkable, reachable spot', () => {
    const ia = w.interactables;
    const by = (t) => ia.filter((i) => i.type === t);
    expect(by('valve').length).toBe(6);
    expect(by('crane').length).toBe(2);
    expect(by('rod').length).toBe(4);
    expect(new Set(ia.map((i) => i.id)).size).toBe(12);
    for (const i of by('valve')) expect(i.zone).toBe(2);
    for (const i of by('crane')) { expect(i.zone).toBe(1); expect(i.dropAt).toHaveProperty('x'); expect(L.walkable(i.dropAt.x, i.dropAt.z, 1.2)).toBe(true); expect(L.reachable(i.dropAt.x, i.dropAt.z)).toBe(true); }
    for (const i of by('rod')) expect(i.zone).toBe(4);
    for (const i of ia) {
      expect(w.zoneAt(i.x, i.z)).toBe(i.zone);
      expect(typeof i.yaw).toBe('number');
      expect(i.mesh?.isGroup).toBe(true);
      expect(L.walkable(i.x, i.z, 0.8)).toBe(true);
      expect(L.reachable(i.x, i.z)).toBe(true);
      expect(w.mesh.children).toContain(i.mesh);
    }
  });
});

describe('rostwerke gather points', () => {
  it('~28 points in the GDD zones, only Rostwerke kinds, walkable, reachable, dry', () => {
    const pts = w.gatherPoints;
    expect(pts.length).toBeGreaterThanOrEqual(26);
    expect(pts.length).toBeLessThanOrEqual(30);
    const zoneOf = { kupferdraht: [2], schlacke: [1], rostkaefer: [3], giftschlamm: [3], funkenstein: [4] };
    for (const p of pts) {
      expect(GATHER_KINDS[p.kind].world).toBe('rostwerke');
      expect(zoneOf[p.kind]).toContain(p.zone);
      expect(w.zoneAt(p.pos.x, p.pos.z)).toBe(p.zone);
      expect(L.reachable(p.pos.x, p.pos.z)).toBe(true);
      expect(w.groundType(p.pos.x, p.pos.z)).not.toBe('toxic');
      expect(Math.abs(p.pos.y - w.heightAt(p.pos.x, p.pos.z))).toBeLessThan(1e-6);
    }
    for (const k of Object.keys(zoneOf)) expect(pts.some((p) => p.kind === k)).toBe(true);
    expect(pts.filter((p) => p.kind === 'funkenstein').length).toBeLessThanOrEqual(3);
  });
  it('deterministic from the seed, different between seeds; Schotterklamm ignores the new kinds', () => {
    const sig = (world) => JSON.stringify(world.gatherPoints.map((p) => [p.id, p.kind, +p.pos.x.toFixed(3), +p.pos.z.toFixed(3), p.usesLeft]));
    expect(sig(createWorld('rostwerke', { seed: 1 }))).toBe(sig(w));
    expect(sig(createWorld('rostwerke', { seed: 2 }))).not.toBe(sig(w));
    const sk = createWorld('schotterklamm', { seed: 1 });
    expect(sk.gatherPoints.some((p) => GATHER_KINDS[p.kind].world)).toBe(false);
  });
  it('setGatherState works', () => {
    const p = w.gatherPoints[0];
    expect(w.setGatherState(p.id, 0)).toBe(true);
    expect(p.usesLeft).toBe(0);
    w.setGatherState(p.id, p.maxUses);
  });
});

describe('toxic ground hazard', () => {
  it('poisons a Pirscher standing in Giftschlamm after 1.5 s, not before, and not on the Steg', () => {
    let tx = null;
    for (let x = 20; x < 110 && !tx; x += 1) if (w.groundType(x, 96) === 'toxic' && w.groundType(x + 1, 96) === 'toxic') tx = { x: x + 0.5, z: 96 };
    if (!tx) for (let x = 20; x < 110 && !tx; x += 1) for (let z = 20; z < 110; z += 1) if (w.groundType(x, z) === 'toxic' && w.groundType(x + 1, z) === 'toxic') { tx = { x: x + 0.5, z }; break; }
    expect(tx).toBeTruthy();
    const mk = (pos) => {
      const calls = [];
      const p = { pos: { ...pos, y: 0 }, state: 'free', alive: true, status: {}, addStatus(t, o) { calls.push([t, o]); this.status[t] = { t: o?.t ?? 12 }; return true; } };
      return { p, calls };
    };
    const hz = createHazards(w.layout);
    const hunt = (p) => ({ players: [p], bus: createBus(), fx: { spark() {}, flash() {} } });
    const { p, calls } = mk(tx);
    const h = hunt(p);
    for (let t = 0; t < TOXIC_DELAY - 0.1; t += 1 / 30) hz.update(1 / 30, h);
    expect(calls.length).toBe(0);
    for (let t = 0; t < 0.4; t += 1 / 30) hz.update(1 / 30, h);
    expect(calls.some((c) => c[0] === 'poison')).toBe(true);
    const dry = mk({ x: w.campPoint.x, z: w.campPoint.z });
    const h2 = hunt(dry.p);
    for (let t = 0; t < 3; t += 1 / 30) hz.update(1 / 30, h2);
    expect(dry.calls.length).toBe(0);
  });
});

describe('rostwerke render cost', () => {
  it('keeps the mesh count (draw calls) moderate', () => {
    const s = w.stats();
    expect(s.meshes).toBeLessThan(160);
    expect(s.tris).toBeLessThan(150000);
  });
});
