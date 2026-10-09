import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { createRng } from '../../core/rng.js';

/**
 * TEST ARENA – phase 1 placeholder world. Implements the world interface (see docs/ARCHITECTURE.md):
 *  { id, bounds, heightAt(x,z), collide(pos, radius), spawnPoints, campPoint, nestPoint, monsterSpawns,
 *    zones, env:{background, fog:{color,near,far}}, update(dt, hunt), mesh }
 */
export function createTestArena() {
  const R = 56;
  const rng = createRng(42);
  const heightAt = (x, z) => {
    const d = Math.hypot(x, z);
    const flat = Math.min(1, Math.max(0, (d - 14) / 18)); // flat in the middle
    return flat * (0.9 * Math.sin(x * 0.09) * Math.cos(z * 0.08) + 0.5 * Math.sin(x * 0.21 + z * 0.17));
  };
  const rocks = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rng() * 0.2, r = R - 3 + rng() * 2;
    rocks.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, r: 3.2 + rng() * 2.2 });
  }
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 12 + rng() * 30;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x + 38, z) < 8) continue;
    rocks.push({ x, z, r: 1.4 + rng() * 1.2 });
  }

  const group = new THREE.Group();
  // ground
  const gg = new THREE.PlaneGeometry(R * 2.4, R * 2.4, 48, 48);
  gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  const uv = gg.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 36, uv.getY(i) * 36);
  gg.computeVertexNormals();
  const ground = new THREE.Mesh(gg, lambert({ map: tex('grass', { size: 32 }) }));
  group.add(ground);
  // dirt patch in camp
  const camp = new THREE.Mesh(new THREE.CircleGeometry(7, 10), lambert({ map: tex('dirt', { size: 32 }) }));
  camp.rotation.x = -Math.PI / 2;
  camp.position.set(-38, heightAt(-38, 0) + 0.04, 0);
  group.add(camp);

  // rocks (merged -> 1 draw call)
  const geos = [];
  for (const k of rocks) {
    const h = k.r * (1.1 + rng() * 0.9);
    const g = new THREE.CylinderGeometry(k.r * 0.7, k.r, h, 5 + (rng() * 2) | 0);
    g.rotateY(rng() * 3);
    g.translate(k.x, heightAt(k.x, k.z) + h / 2 - 0.3, k.z);
    geos.push(g);
  }
  const rockMesh = new THREE.Mesh(mergeGeometries(geos), lambert({ map: tex('stone', { size: 32 }) }));
  group.add(rockMesh);
  // bones + tufts
  const bg = [];
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, r = 8 + rng() * 38;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const b = new THREE.TorusGeometry(1.4 - rng() * 0.4, 0.14, 4, 8, Math.PI);
    b.rotateY(rng() * 3);
    b.translate(x, heightAt(x, z), z);
    bg.push(b);
  }
  group.add(new THREE.Mesh(mergeGeometries(bg), lambert({ map: tex('bone', { size: 16 }), side: THREE.DoubleSide })));
  const tg = [];
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, r = rng() * (R - 6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const c = new THREE.ConeGeometry(0.22, 0.7 + rng() * 0.5, 3);
    c.translate(x, heightAt(x, z) + 0.3, z);
    tg.push(c);
  }
  group.add(new THREE.Mesh(mergeGeometries(tg), lambert({ color: '#6b8a3a' })));

  // light
  group.add(new THREE.AmbientLight('#9a8ac0', 1.25));
  const sun = new THREE.DirectionalLight('#ffc490', 1.3);
  sun.position.set(-6, 9, -12);
  group.add(sun);
  const fill = new THREE.DirectionalLight('#6a8aff', 0.35);
  fill.position.set(5, 4, 8);
  group.add(fill);

  return {
    id: 'test',
    name: 'Testarena',
    bounds: { minX: -R, maxX: R, minZ: -R, maxZ: R },
    heightAt,
    collide(pos, radius) {
      const d = Math.hypot(pos.x, pos.z);
      if (d > R - 1 - radius) { const k = (R - 1 - radius) / d; pos.x *= k; pos.z *= k; }
      for (const k of rocks) {
        const dx = pos.x - k.x, dz = pos.z - k.z, dd = Math.hypot(dx, dz), min = k.r * 0.9 + radius;
        if (dd < min) { const s = min / (dd || 1e-4); pos.x = k.x + dx * s; pos.z = k.z + dz * s; }
      }
      return pos;
    },
    spawnPoints: [{ x: -14, z: -4, yaw: Math.PI / 2 }, { x: -14, z: 2, yaw: Math.PI / 2 }, { x: -16, z: -1, yaw: Math.PI / 2 }, { x: -16, z: 5, yaw: Math.PI / 2 }],
    campPoint: { x: -38, z: 0 },
    nestPoint: { x: 38, z: -32 },
    monsterSpawns: { default: { x: 8, z: 4 } },
    zones: [{ id: 'arena', name: 'Testarena', x: 0, z: 0, r: R }],
    env: { background: '#3a2a58', fog: { color: '#3a2a58', near: 26, far: 100 } },
    update() {},
    mesh: group,
  };
}
