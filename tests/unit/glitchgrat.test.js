import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/game/world/index.js';
import { getNav } from '../../src/game/monsters/nav.js';
import { GATHER_KINDS } from '../../src/data/gather.js';
import * as THREE from 'three';
import { createInput } from '../../src/input/input.js';

let w, L;
beforeAll(() => {
  w = createWorld('glitchgrat', { seed: 1 });
  L = w.layout;
});

describe('glitchgrat', () => {
  it('has 4 zones, mountain ground types, and elevated summit arena', () => {
    expect(w.id).toBe('glitchgrat');
    expect([w.zoneAt(-65, -65), w.zoneAt(-65, 65), w.zoneAt(65, 65), w.zoneAt(65, -65)]).toEqual([1, 2, 3, 4]);
    expect(w.groundType(-65, -65)).toBe('rock');
    expect(w.groundType(-65, 65)).toBe('ore');
    expect(w.groundType(65, 65)).toBe('frost');
    expect(w.groundType(65, -65)).toBe('core');
    expect(w.heightAt(65, -65)).toBeGreaterThan(w.heightAt(-65, 65) + 6); // Weltenkamm is higher than canyon
    expect(w.minimap.data.length).toBe(w.minimap.size * w.minimap.size * 4);
  });

  it('camp, all nests, routes and spawns are reachable', () => {
    expect(L.reachable(w.campPoint.x, w.campPoint.z)).toBe(true);
    for (const n of Object.values(L.nests)) {
      expect(L.reachable(n.x, n.z)).toBe(true);
    }
    for (const r of Object.values(L.routes)) {
      for (const p of r) expect(L.reachable(p.x, p.z)).toBe(true);
    }
    expect(L.reachable(65, -65)).toBe(true); // Weltenkamm center reachable
    expect(w.nestFor('pyrostur')).toEqual(L.nests[4]);
    expect(w.nestFor('felsengroll')).toEqual(L.nests[3]);
    expect(w.nestFor('voltiris')).toEqual(L.nests[2]);
    expect(w.nestFor('gockelok')).toEqual(L.nests[4]);
    expect(w.routeFor('pyrostur').length).toBeGreaterThan(3);
    const nav = getNav(w), camp = w.campPoint;
    for (const p of [...L.spawnPoints, ...Object.values(L.nests), ...w.gatherPoints.map((p) => p.pos)]) {
      expect(nav.find(camp.x, camp.z, p.x, p.z), `path to ${p.x},${p.z}`).not.toBeNull();
    }
    for (const id of ['pyrostur', 'felsengroll', 'voltiris', 'gockelok']) {
      const route = w.routeFor(id);
      route.forEach((p, i) => {
        const q = route[(i + 1) % route.length];
        expect(nav.find(p.x, p.z, q.x, q.z), `${id} route ${i}`).not.toBeNull();
      });
    }
  });

  it('summit arena on Weltenkamm is an open arena for epic boss fights', () => {
    let free = 0, n = 0;
    for (let x = 50; x <= 80; x += 2) {
      for (let z = -80; z <= -50; z += 2) {
        n++;
        if (L.walkable(x, z, 1.8)) free++;
      }
    }
    expect(free / n).toBeGreaterThan(0.85);
    expect(getNav(w)).toBeTruthy();
  });

  it('places gather points for glitchgrat materials in intended zones', () => {
    const kinds = Object.entries(GATHER_KINDS).filter(([, d]) => d.world === 'glitchgrat');
    expect(kinds.length).toBe(4); // graterz, frostkraut, glitchkristall, sternenstein
    for (const [kind, d] of kinds) {
      for (const p of w.gatherPoints.filter((q) => q.kind === kind)) {
        expect(Object.keys(d.zones).map(Number)).toContain(p.zone);
      }
    }
    expect(w.gatherPoints.length).toBeGreaterThan(15);
  });

  it('has vista proxies in the deep abyss looking down into previous worlds', () => {
    const south = w.mesh.getObjectByName('vista-schotterklamm');
    const west = w.mesh.getObjectByName('vista-rostwerke');
    const east = w.mesh.getObjectByName('vista-smaragdkueste');
    expect(south).toBeTruthy();
    expect(west).toBeTruthy();
    expect(east).toBeTruthy();
    expect(south.position.y).toBeLessThan(-50);
  });

  it('rendered arena floor matches player/monster height, with no floating platform', () => {
    w.mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (let x = 45; x <= 85; x += 4) for (let z = -85; z <= -45; z += 4) {
      if (Math.hypot(x - 65, z + 65) > 24) continue;
      const h = w.heightAt(x, z);
      expect(h).toBeCloseTo(25.5, 5);
      expect(L.walkable(x, z, 1.8) && L.clearOfColliders(x, z, 1.8)).toBe(true);
      ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
      const surface = ray.intersectObject(w.mesh, true).find((hit) =>
        /^(terrain-|props-|summit-)/.test(hit.object.name));
      expect(surface, `rendered floor at ${x},${z}`).toBeTruthy();
      expect(Math.abs(surface.point.y - h)).toBeLessThan(0.07);
    }
  });

  it('keeps dense-fog mutators active while extending the camera to the valley silhouettes', () => {
    const hunt = {
      player: { pos: { x: 65, z: -65 } },
      scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
      input: createInput(),
      mods: { hunt: { fog: 2 } }, bus: { emit() {} },
    };
    hunt.scene.fog = new THREE.Fog('#000000', 1, 2);
    w.update(0.016, hunt);
    expect(hunt.camera.far).toBe(360);
    expect(hunt.scene.fog.near).toBeCloseTo(17.5);
    expect(hunt.scene.fog.far).toBeCloseTo(55);
  });

  it('always supplies enough reachable ore to finish the excursion across hunt seeds', () => {
    for (const seed of [1, 42, 891]) {
      const world = createWorld('glitchgrat', { seed });
      const ore = world.gatherPoints.filter((p) => p.kind === 'graterz');
      expect(ore.reduce((n, p) => n + p.usesLeft, 0)).toBeGreaterThanOrEqual(8);
      const nav = getNav(world), camp = world.campPoint;
      for (const p of ore) expect(nav.find(camp.x, camp.z, p.pos.x, p.pos.z)).not.toBeNull();
      world.dispose();
    }
  });
});
