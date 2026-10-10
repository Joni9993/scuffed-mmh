// [L] Pure decoration, zero gameplay, client-local: bird flocks (take off when a hunter walks through), glow-bug swarms (zones 3/4),
// butterflies + flowers (zone 1). 4 draw calls total (3 InstancedMesh + 1 Points), allocation-free per frame.
import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { lambert, basic } from '../render/ps1.js';

const BIRD_FLOCKS = 9, PER_FLOCK = 6, BUG_SWARMS = 7, BUGS = 14, FLOWER_PATCHES = 6, FLOWERS = 10, BUTTERFLIES = 14;
const ACT_R2 = 80 * 80;

function wingGeo(w, l) { // flat V (two triangles angled up), flap = scale.y
  const g = new THREE.BufferGeometry();
  const v = [-w, 0.12, 0, 0, 0, 0, 0, 0, l, 0, 0, 0, w, 0.12, 0, 0, 0, l];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function createAmbientFauna(hunt) {
  const w = hunt.world, L = w.layout;
  const group = new THREE.Group();
  group.name = 'ambient-fauna';
  if (!L) return { group, update() {}, dispose() {}, stats: {} };
  const rng = createRng((hunt.seed ^ 0xb1ad) >>> 0);
  const ground = (x, z, zone) => w.zoneAt(x, z) === zone && L.walkable(x, z, 1.5) && L.groundType(x, z) !== 'lava' && L.groundType(x, z) !== 'mud';
  const spot = (zone, minCamp = 14) => {
    const zc = w.zones[zone - 1];
    for (let t = 0; t < 80; t++) {
      const x = zc.x + (rng() - 0.5) * 100, z = zc.z + (rng() - 0.5) * 100;
      if (ground(x, z, zone) && Math.hypot(x - w.campPoint.x, z - w.campPoint.z) > minCamp) return { x, z };
    }
    return null;
  };
  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------- birds
  const flocks = [];
  for (let i = 0; i < BIRD_FLOCKS; i++) {
    const s = spot(i % 3 === 2 ? 2 : 1, 18);
    if (!s) continue;
    const f = { x: s.x, z: s.z, birds: [], t: 0 };
    for (let k = 0; k < PER_FLOCK; k++) {
      const a = rng() * 6.28, r = 0.5 + rng() * 2;
      f.birds.push({ hx: s.x + Math.cos(a) * r, hz: s.z + Math.sin(a) * r, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: 0, t: 0, ph: rng() * 6.28, yaw: rng() * 6.28, delay: rng() * 0.5, hy: 0 });
      const b = f.birds[k]; b.hy = w.heightAt(b.hx, b.hz); b.x = b.hx; b.y = b.hy; b.z = b.hz;
    }
    flocks.push(f);
  }
  const birdMat = basic({ color: '#2a2630', side: THREE.DoubleSide });
  const birds = new THREE.InstancedMesh(wingGeo(0.28, 0.38), birdMat, Math.max(1, flocks.length * PER_FLOCK));
  birds.frustumCulled = false; birds.count = 0;
  group.add(birds);

  // ---------------------------------------------------------------- flowers + butterflies (zone 1)
  const patches = [];
  for (let i = 0; i < FLOWER_PATCHES; i++) { const s = spot(1, 16); if (s) patches.push({ ...s, y: w.heightAt(s.x, s.z) }); }
  const fgeo = new THREE.PlaneGeometry(0.22, 0.22); fgeo.translate(0, 0.32, 0);
  const flowers = new THREE.InstancedMesh(fgeo, basic({ color: '#ffffff', side: THREE.DoubleSide }), Math.max(1, patches.length * FLOWERS));
  const cols = ['#f2e26a', '#e07ab0', '#f4f0f0', '#ff8a5a'];
  let fi = 0;
  for (const p of patches) for (let k = 0; k < FLOWERS; k++) {
    const x = p.x + (rng() - 0.5) * 7, z = p.z + (rng() - 0.5) * 7;
    dummy.position.set(x, w.heightAt(x, z), z); dummy.rotation.set(0, rng() * 3, 0); dummy.scale.setScalar(0.8 + rng() * 0.6); dummy.updateMatrix();
    flowers.setMatrixAt(fi, dummy.matrix); flowers.setColorAt(fi, new THREE.Color(cols[(rng() * cols.length) | 0])); fi++;
  }
  flowers.count = fi; flowers.instanceMatrix.needsUpdate = true; if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.frustumCulled = false;
  group.add(flowers);
  const flies = [];
  for (const p of patches) for (let k = 0; k < BUTTERFLIES / Math.max(1, patches.length) + 1; k++) flies.push({ p, ph: rng() * 6.28, sp: 0.5 + rng() * 0.6, r: 1.5 + rng() * 3, h: 0.6 + rng() * 0.9, x: p.x, y: p.y, z: p.z });
  const flyMat = basic({ color: '#ffffff', side: THREE.DoubleSide });
  const butter = new THREE.InstancedMesh(wingGeo(0.12, 0.1), flyMat, Math.max(1, flies.length));
  flies.forEach((f, i) => butter.setColorAt(i, new THREE.Color(cols[i % cols.length])));
  butter.frustumCulled = false; butter.count = 0;
  group.add(butter);

  // ---------------------------------------------------------------- glow bugs (Points, additive)
  const swarms = [];
  for (let i = 0; i < BUG_SWARMS; i++) { const s = spot(i % 2 ? 3 : 4, 20); if (s) swarms.push({ ...s, y: w.heightAt(s.x, s.z), ph: rng() * 6.28 }); }
  const bugPos = new Float32Array(Math.max(1, swarms.length * BUGS) * 3);
  const bugGeo = new THREE.BufferGeometry();
  bugGeo.setAttribute('position', new THREE.BufferAttribute(bugPos, 3));
  bugGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4);
  const bugMat = new THREE.PointsMaterial({ color: '#d8ff60', size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const bugs = new THREE.Points(bugGeo, bugMat);
  bugs.frustumCulled = false;
  group.add(bugs);
  void lambert;

  let t = 0;
  const stats = { flying: 0, perched: 0 };
  function update(dt) {
    t += dt;
    const pls = hunt.players;
    // birds
    let n = 0, fly = 0;
    for (const f of flocks) {
      let near = 1e9, any = false;
      for (const p of pls) { const dx = p.pos.x - f.x, dz = p.pos.z - f.z, d2 = dx * dx + dz * dz; if (d2 < near) near = d2; if (p.speed > 0.5 || d2 < 25) any = true; }
      const lp = hunt.player.pos, ldx = lp.x - f.x, ldz = lp.z - f.z;
      if (ldx * ldx + ldz * ldz > ACT_R2 * 1.4 && !f.birds.some((b) => b.state)) continue;
      const scare = near < 8 * 8 && any;
      for (const b of f.birds) {
        if (b.state === 0) {
          if (scare) { b.delay -= dt; if (b.delay <= 0) { const a = Math.atan2(b.hx - pls[0].pos.x, b.hz - pls[0].pos.z) + (b.ph - 3) * 0.5; b.state = 1; b.t = 0; b.vx = Math.sin(a) * 5; b.vz = Math.cos(a) * 5; b.vy = 4 + (b.ph % 1) * 2; b.yaw = a; b.delay = 0.5 * (b.ph % 1); } }
          else b.delay = 0.25 * (b.ph % 1);
          dummy.position.set(b.hx, b.hy + 0.08 + (Math.sin(t * 3 + b.ph) > 0.8 ? 0.05 : 0), b.hz); dummy.rotation.set(0, b.yaw, 0); dummy.scale.set(0.8, 0.15, 0.8);
        } else {
          b.t += dt; fly++;
          if (b.t < 1.6) b.vy += (b.t < 0.8 ? 3 : -2) * dt;
          const ar = b.yaw; b.vx += (Math.sin(ar) * 6 - b.vx) * dt; b.vz += (Math.cos(ar) * 6 - b.vz) * dt;
          if (b.state === 1 && b.t > 9) { b.state = 2; b.t = 0; }
          if (b.state === 2) { // glide back home, land
            const dx = b.hx - b.x, dz = b.hz - b.z, d = Math.hypot(dx, dz) || 1;
            const far = near < 14 * 14; if (far) { b.state = 1; b.t = 5; }
            b.vx += ((dx / d) * 5 - b.vx) * dt * 2; b.vz += ((dz / d) * 5 - b.vz) * dt * 2; b.vy += ((b.hy - b.y) * 1.2 - b.vy) * dt * 2; b.yaw = Math.atan2(b.vx, b.vz);
            if (d < 0.6 && b.y - b.hy < 0.5) { b.state = 0; b.x = b.hx; b.y = b.hy; b.z = b.hz; b.delay = 0.3; }
          } else b.vy = Math.min(b.vy, 3.5);
          b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
          if (b.state === 1 && b.y < b.hy + 2.5) b.vy += 4 * dt;
          dummy.position.set(b.x, b.y, b.z); dummy.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
          dummy.scale.set(1, Math.sin(t * 22 + b.ph * 3) * 0.9 + 0.1, 1);
        }
        dummy.updateMatrix(); birds.setMatrixAt(n++, dummy.matrix);
      }
    }
    birds.count = n; birds.instanceMatrix.needsUpdate = true;
    stats.flying = fly; stats.perched = n - fly;
    // butterflies (only near the hunter)
    const hp = hunt.player.pos;
    let bn = 0;
    for (let i = 0; i < flies.length; i++) {
      const f = flies[i];
      if ((f.p.x - hp.x) ** 2 + (f.p.z - hp.z) ** 2 > ACT_R2) continue;
      const a = t * f.sp + f.ph;
      f.x = f.p.x + Math.cos(a) * f.r + Math.sin(a * 2.3) * 0.8; f.z = f.p.z + Math.sin(a * 1.3) * f.r; f.y = f.p.y + f.h + Math.sin(a * 3.1) * 0.35;
      dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(0, a * 1.3, 0); dummy.scale.set(1, Math.sin(t * 18 + f.ph) * 1.2, 1);
      dummy.updateMatrix(); butter.setMatrixAt(bn, dummy.matrix);
      if (bn !== i && butter.instanceColor) { /* colours stay with the slot; harmless */ }
      bn++;
    }
    butter.count = bn; butter.instanceMatrix.needsUpdate = true;
    // glow bugs
    let k = 0;
    for (const s of swarms) {
      const near = (s.x - hp.x) ** 2 + (s.z - hp.z) ** 2 < ACT_R2;
      for (let i = 0; i < BUGS; i++, k++) {
        if (!near) { bugPos[k * 3 + 1] = -999; continue; }
        const a = t * (0.3 + (i % 5) * 0.07) + i * 1.7 + s.ph;
        bugPos[k * 3] = s.x + Math.cos(a) * (2 + (i % 4)) + Math.sin(a * 2.7) * 0.6;
        bugPos[k * 3 + 1] = s.y + 0.8 + (i % 3) * 0.5 + Math.sin(a * 1.9) * 0.5;
        bugPos[k * 3 + 2] = s.z + Math.sin(a * 1.1) * (2 + (i % 3));
      }
    }
    bugGeo.attributes.position.needsUpdate = true;
    bugMat.opacity = 0.7 + Math.sin(t * 6) * 0.25;
  }
  return {
    group, update, stats,
    dispose() { group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); },
  };
}
