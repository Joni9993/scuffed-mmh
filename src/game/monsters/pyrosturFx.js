import * as THREE from 'three';
import { basic } from '../../render/ps1.js';

// Two bounded dynamic batches. Flames use the very same committed positions and
// times as AttackInstance; they never create damage, timers or network decisions.
const CAPACITY = 6144, FIRE = [1, .29, .035], CORE = [1, .87, .43], ASH = [.48, .42, .36], STEAM = [.75, .83, .86];
function batch(name) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CAPACITY * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, basic({ vertexColors: true, side: THREE.DoubleSide, depthWrite: true }));
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
  root.add(flame.mesh, debris.mesh);
  return { flame, debris, attack: null, sounded: false, warned: false };
}

export function updatePyrosturFx(m) {
  // Headless combat simulations have no scene. Avoid allocating GPU batches there.
  if (!m.ctx.scene) return;
  const fx = m.extra.pyroFx ??= createPyrosturFx(m.mesh);
  fx.flame.reset(); fx.debris.reset();
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
