import * as THREE from 'three';
import { basic } from '../../render/ps1.js';

// Two bounded dynamic batches. Flames use the very same committed positions and
// times as AttackInstance; they never create damage, timers or network decisions.
const CAPACITY = 6144, FIRE = [1, .29, .035], CORE = [1, .87, .43], ASH = [.48, .42, .36], STEAM = [.75, .83, .86];
const COAL = [.55, .075, .025], HOT = [1, .42, .09];
function batch(name) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, basic({ vertexColors: true, side: THREE.DoubleSide, depthWrite: true }));
  geo.addEventListener('dispose', () => mesh.material.dispose());
  mesh.name = name; mesh.frustumCulled = false; mesh.visible = false;
  let n = 0;
  return {
    mesh, reset() { n = 0; },
    tri(a, b, c, color, center = color) {
      if (n + 3 > CAPACITY) return;
      const pos = geo.attributes.position.array, cols = geo.attributes.color.array;
      for (const [i, p] of [a, b, c].entries()) {
        const k = n++ * 3, col = i === 2 ? center : color;
        pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2];
        cols[k] = col[0]; cols[k + 1] = col[1]; cols[k + 2] = col[2];
      }
    },
    finish() { geo.setDrawRange(0, n); mesh.visible = n > 0; if (n) { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; } },
  };
}

function plume(b, from, to, radius, time, color, seed = 0) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2], len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const sideLen = Math.hypot(ux, uz);
  const sx = sideLen < .001 ? 1 : uz / sideLen, sz = sideLen < .001 ? 0 : -ux / sideLen;
  const vx = -uy * sz, vy = uz * sx - ux * sz, vz = uy * sx;
  for (let j = 0; j < 6; j++) {
    const u = j / 6, v = (j + 1) / 6;
    for (let k = 0; k < 5; k++) {
      const angle = k / 5 * Math.PI * 2, next = (k + 1) / 5 * Math.PI * 2;
      const point = (f, a) => {
        const wave = 1 + .18 * Math.sin(f * 21 - time * 24 + seed);
        const r = radius * (.24 + Math.sin(f * Math.PI) * .65) * wave;
        return [from[0] + dx * f + (sx * Math.cos(a) + vx * Math.sin(a)) * r,
          from[1] + dy * f + vy * Math.sin(a) * r,
          from[2] + dz * f + (sz * Math.cos(a) + vz * Math.sin(a)) * r];
      };
      const a = point(u, angle), c = point(v, angle), d = point(v, next), e = point(u, next);
      b.tri(a, c, d, color, CORE); b.tri(a, d, e, color, CORE);
    }
  }
}

function eruption(b, at, radius, age, time, color, seed = 0) {
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4 + seed, r = radius * .48, x = at[0] + Math.sin(a) * r, z = at[2] + Math.cos(a) * r;
    const h = radius * (1.3 + .4 * Math.sin(i + time * 13)) * Math.max(.18, 1 - age);
    plume(b, [x, at[1], z], [x + Math.sin(a) * .5, at[1] + h, z + Math.cos(a) * .5], radius * .38, time, color, i);
  }
}

export function createPyrosturFx(root) {
  const flame = batch('pyrostur-fire-volume'), debris = batch('pyrostur-impact-trails');
  // Four feet share one instanced, soft contact-shadow draw. A tiny data texture
  // works in headless checks too and adds no realtime shadow-map pass.
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    pixels[(y * 32 + x) * 4 + 3] = Math.max(0, 1 - r) ** 2 * 170;
  }
  const shadowMap = new THREE.DataTexture(pixels, 32, 32); shadowMap.needsUpdate = true;
  const footShadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false, fog: true }), 4);
  footShadows.geometry.addEventListener('dispose', () => { shadowMap.dispose(); footShadows.material.dispose(); });
  footShadows.name = 'pyrostur-foot-contact'; footShadows.frustumCulled = false; footShadows.renderOrder = 1;
  root.add(flame.mesh, debris.mesh, footShadows);
  return { flame, debris, attack: null, sounded: false, warned: false,
    footShadows, shadowTransform: new THREE.Object3D(),
    inverse: new THREE.Matrix4(), anchorPosition: new THREE.Vector3() };
}

function groundContacts(m, fx) {
  const ids = ['ankleForeL', 'ankleForeR', 'ankleL', 'ankleR'];
  fx.footShadows.visible = !!m.alive;
  if (!m.alive) return;
  m.mesh.updateWorldMatrix(true, false); fx.inverse.copy(m.mesh.matrixWorld).invert();
  const transform = fx.shadowTransform;
  for (let i = 0; i < 4; i++) {
    const node = m.nodes[ids[i]];
    if (!node) { transform.scale.setScalar(0); transform.updateMatrix(); fx.footShadows.setMatrixAt(i, transform.matrix); continue; }
    node.updateWorldMatrix(true, false);
    const p = fx.anchorPosition.set(0, -.14, .3).applyMatrix4(node.matrixWorld);
    const ground = m.ctx.world?.heightAt(p.x, p.z) ?? 0;
    const contact = Math.max(0, 1 - Math.max(0, p.y - ground) / .7);
    p.y = ground + .045; p.applyMatrix4(fx.inverse);
    transform.position.copy(p); transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.scale.set(1.45 * contact, 1.65 * contact, 1); transform.updateMatrix();
    fx.footShadows.setMatrixAt(i, transform.matrix);
  }
  fx.footShadows.instanceMatrix.needsUpdate = true;
}

// Cosmetic only: anatomical vents breathe even between attacks. Small opaque
// ribbons and sparks leave the armour and silhouette readable on a phone. Their
// clock is the monster clock; there are no particle lifetimes or random pools.
function furnacePresence(m, fx) {
  const anchors = m.extra.ventAnchors;
  if (!anchors?.length) return;
  const heat = Math.max(0, Math.min(1, (m.pressure ?? 0) / 100));
  const intensity = Math.min(1.35, .22 + heat * .72 + (m.rage ? .28 : 0));
  const time = m.time ?? 0;
  m.mesh.updateWorldMatrix(true, false);
  fx.inverse.copy(m.mesh.matrixWorld).invert();
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    anchor.updateWorldMatrix(true, false);
    const p = fx.anchorPosition.setFromMatrixPosition(anchor.matrixWorld).applyMatrix4(fx.inverse);
    const x = p.x, y = p.y, z = p.z;
    const phase = time * (1.4 + heat * 1.6) + i * 1.9;
    const pulse = .72 + .28 * Math.sin(phase);
    const height = (.16 + intensity * .48) * pulse;
    const width = .025 + intensity * .045;
    const drift = Math.sin(phase * .7) * .09;
    // Thin hot fissure above each vent, never a full-body emissive wash.
    fx.debris.tri([x - width, y, z], [x + width, y, z],
      [x + drift, y + height, z - .08], COAL, HOT);
    fx.debris.tri([x, y, z - width], [x, y, z + width],
      [x - drift, y + height * .8, z + .07], COAL, FIRE);
    // Four deterministic rising cinders per vent. Near the top they shrink to
    // zero instead of popping through a second transparent rendering pass.
    for (let j = 0; j < 4; j++) {
      const age = ((time * (.35 + intensity * .3) + i * .173 + j * .25) % 1 + 1) % 1;
      const spread = age * (.12 + intensity * .34), angle = i * 2.4 + j * 1.7;
      const px = x + Math.sin(angle + age) * spread;
      const py = y + .1 + age * (.6 + intensity * 1.3);
      const pz = z + Math.cos(angle) * spread - age * .15;
      const size = (.018 + intensity * .022) * Math.sin(age * Math.PI);
      fx.debris.tri([px - size, py, pz], [px + size, py, pz],
        [px, py + size * 3, pz + size], FIRE, HOT);
    }
  }
}

export function updatePyrosturFx(m) {
  // Headless combat simulations have no scene. Avoid allocating GPU batches there.
  if (!m.ctx.scene) return;
  const fx = m.extra.pyroFx ??= createPyrosturFx(m.mesh);
  fx.flame.reset(); fx.debris.reset();
  groundContacts(m, fx);
  if (m.alive) furnacePresence(m, fx);
  const a = m.attack, kind = a?.inst.def.vfx;
  if (a?.inst !== fx.attack) { fx.attack = a?.inst; fx.sounded = false; fx.warned = false; }
  if (m.alive && a && kind) {
    const inst = a.inst, tau = inst.tau(a.t), time = m.time;
    const fire = ['breath', 'rain', 'pressure'].includes(kind), steam = kind === 'steam';
    if (!fx.warned && kind === 'pressure') {
      fx.warned = true; m.ctx.bus.emit('sfx', { name: 'pyroPressure', pos: m.pos });
    }
    for (const [i, h] of (inst.def.hits ?? []).entries()) {
      const pre = h.t0 - tau, age = (tau - h.t0) / .42;
      if (kind === 'rain' && pre > 0 && pre < .65 && h.shape === 'sphere') {
        const at = h.at, y = at[1] + pre * 13;
        plume(fx.flame, [at[0], y + 2.5, at[2]], [at[0], y, at[2]], h.radius * .32, time, FIRE, i);
      }
      if (tau < h.t0 || tau > h.t1 + .22) continue;
      if (!fx.sounded) {
        fx.sounded = true;
        m.ctx.bus.emit('sfx', { name: fire ? 'pyroFlame' : steam ? 'pyroPressure' : 'pyroClaw', pos: m.pos });
      }
      if (fire || steam) {
        const color = steam ? STEAM : FIRE;
        if (h.shape === 'capsule') plume(fx.flame, h.from, h.to, h.radius, time, color, i);
        else eruption(fx.flame, h.at, h.radius, Math.max(0, age), time, color, i);
      } else {
        // Claw/wing/tail arcs trace the actual strike instead of flashing the body white.
        if (h.shape === 'capsule') {
          const from = h.from, to = h.to, mid = [(from[0] + to[0]) * .5, (from[1] + to[1]) * .5 + .35, (from[2] + to[2]) * .5];
          fx.debris.tri(from, to, mid, ASH, CORE);
        }
        const at = h.at ?? h.to;
        for (let j = 0; j < 6; j++) {
          const ang = j * 1.047 + i, reach = h.radius * (1 + Math.max(0, age));
          const x = at[0] + Math.sin(ang) * reach, z = at[2] + Math.cos(ang) * reach;
          fx.debris.tri([x, .08, z], [x + .18, .12, z + .18], [x, .7 * Math.max(.1, 1 - age), z], ASH);
        }
      }
    }
  }
  fx.flame.finish(); fx.debris.finish();
}
