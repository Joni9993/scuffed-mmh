import * as THREE from 'three';
import { colored, recolor, put, merge, bakeShade, faceColors } from './props.js';

// Rostwerke props: low-poly PS1 geometry (origin at ground, vertex coloured, mergeable).
const tint = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return [c.r, c.g, c.b]; };
const J = (rng, a) => (rng() - 0.5) * a;
const cyl = (rt, rb, h, seg, color, x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0) => put(colored(new THREE.CylinderGeometry(rt, rb, h, seg), color), x, y, z, ry, 1, rx, rz);
const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => put(colored(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, 1, rx, rz);

/** Giant boiler: body, dome, bands, legs, manhole, chimney. r = body radius. */
export function kesselGeo(rng, r, base = '#8a4a2a') {
  const h = r * 1.9, parts = [];
  const body = colored(new THREE.CylinderGeometry(r, r, h, 9, 2), base);
  recolor(body, (x, y) => tint(base, 0.7 + ((y + h / 2) / h) * 0.45));
  parts.push(put(body, 0, 1.4 + h / 2, 0));
  const dome = colored(new THREE.SphereGeometry(r, 9, 4, 0, 6.283, 0, Math.PI / 2), tint(base, 1.05));
  parts.push(put(dome, 0, 1.4 + h, 0, 0, [1, 0.55, 1]));
  for (const f of [0.25, 0.55, 0.85]) parts.push(cyl(r * 1.05, r * 1.05, 0.35, 9, '#4a2c1c', 0, 1.4 + h * f, 0));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.4; parts.push(box(0.8, 1.6, 0.8, '#3a2a22', Math.cos(a) * r * 0.78, 0.7, Math.sin(a) * r * 0.78)); }
  parts.push(cyl(r * 0.85, r * 0.85, 0.4, 9, '#3a2a22', 0, 1.0, 0));
  parts.push(box(1.2, 1.2, 0.5, '#2a1c14', Math.cos(0.9) * r * 0.98, 1.4 + h * 0.4, Math.sin(0.9) * r * 0.98, -0.9));
  parts.push(cyl(0.55, 0.65, 3.2, 6, '#5a3a28', r * 0.35, 1.4 + h + r * 0.55 + 1.2, 0));
  parts.push(cyl(0.8, 0.55, 0.5, 6, '#2a2a2e', r * 0.35, 1.4 + h + r * 0.55 + 3.0, 0));
  // pressure gauge
  parts.push(cyl(0.45, 0.45, 0.2, 8, '#d8d0b8', -Math.cos(2.2) * r * 1.0, 1.4 + h * 0.55, -Math.sin(2.2) * r * 1.0, Math.PI / 2, 0, 0.0));
  return bakeShade(merge(parts), 0.6);
}

/** Horizontal pipe from (ax,az) to (bx,bz) at height y, radius r, with flanges. */
export function pipeRun(ax, az, bx, bz, y, r = 0.55, base = '#7a4a30') {
  const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
  const geo = [];
  const body = colored(new THREE.CylinderGeometry(r, r, len, 7), base);
  put(body, 0, 0, 0, 0, 1, Math.PI / 2, 0);
  geo.push(body);
  const n = Math.max(1, Math.floor(len / 7));
  for (let i = 0; i <= n; i++) {
    const t = (i / n - 0.5) * len;
    const f = colored(new THREE.CylinderGeometry(r * 1.3, r * 1.3, 0.3, 7), '#3a2a22');
    put(f, 0, 0, t, 0, 1, Math.PI / 2, 0);
    geo.push(f);
  }
  const m = merge(geo);
  put(m, (ax + bx) / 2, y, (az + bz) / 2, yaw);
  return bakeShade(m, 0.6);
}

/** Smokestack (tall brick chimney). */
export function stackGeo(rng, r, h) {
  const parts = [];
  const g = colored(new THREE.CylinderGeometry(r * 0.7, r, h, 8, 3), '#7a4a38');
  recolor(g, (x, y) => tint('#7a4a38', 0.6 + ((y + h / 2) / h) * 0.5 + (rng() - 0.5) * 0.08));
  parts.push(put(g, 0, h / 2, 0));
  parts.push(cyl(r * 0.85, r * 0.7, 1.2, 8, '#2a2220', 0, h, 0));
  for (const f of [0.3, 0.6, 0.9]) parts.push(cyl(r * (1 - f * 0.3) * 1.06, r * (1 - f * 0.3) * 1.06, 0.35, 8, '#3a2a22', 0, h * f, 0));
  return bakeShade(merge(parts), 0.6);
}

/** Gantry frame: 4 posts, two top beams. span along x, depth along z. */
export function gantryGeo(span, depth, h) {
  const parts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.7, h, 0.7, '#6a4a30', sx * span / 2, h / 2, sz * depth / 2));
  for (const sz of [-1, 1]) parts.push(box(span + 1, 0.8, 0.8, '#7a5236', 0, h, sz * depth / 2));
  parts.push(box(0.7, 0.7, depth, '#7a5236', -span / 2, h, 0), box(0.7, 0.7, depth, '#7a5236', span / 2, h, 0));
  for (const sz of [-1, 1]) { // diagonal braces
    parts.push(box(0.25, Math.hypot(span, h) * 0.55, 0.25, '#4a3226', 0, h / 2, sz * depth / 2, 0, 0, Math.atan2(span, h) * 0.9));
  }
  return bakeShade(merge(parts), 0.6);
}

/** Scrap pile: heap of rusty lumps with girders sticking out. */
export function scrapGeo(rng, r) {
  const parts = [];
  const cols = ['#a07a58', '#b88a60', '#8a8480', '#a85a3a', '#7a7a80'];
  for (let i = 0; i < 6; i++) {
    const g = colored(new THREE.IcosahedronGeometry(1, 0), cols[i % cols.length]);
    const k = r * (0.45 + rng() * 0.4);
    put(g, J(rng, r * 0.9), k * 0.5, J(rng, r * 0.9), rng() * 6, [k * (0.9 + rng() * 0.5), k * (0.6 + rng() * 0.4), k * (0.9 + rng() * 0.5)]);
    parts.push(g);
  }
  for (let i = 0; i < 4; i++) parts.push(box(0.25, r * (1.2 + rng()), 0.45, i % 2 ? '#7a4a30' : '#4a4a50', J(rng, r), r * 0.5, J(rng, r), rng() * 6, J(rng, 1.2), J(rng, 1.2)));
  parts.push(cyl(0.45, 0.45, 0.35, 8, '#4a5a30', J(rng, r), 0.2, J(rng, r), 0, 0, 0)); // a tyre-ish disc
  return bakeShade(merge(parts), 0.62);
}

export function barrelGroup(rng, n = 3) {
  const parts = [];
  const cols = ['#9a4a28', '#b8942a', '#4a8a3a', '#6a6a70'];
  for (let i = 0; i < n; i++) {
    const c = cols[(rng() * cols.length) | 0], x = J(rng, 1.6), z = J(rng, 1.6);
    if (rng() < 0.25) parts.push(cyl(0.45, 0.45, 1.1, 7, c, x, 0.45, z, 0, Math.PI / 2, rng() * 6));
    else { parts.push(cyl(0.45, 0.45, 1.1, 7, c, x, 0.55, z)); parts.push(cyl(0.47, 0.47, 0.12, 7, '#2a2220', x, 0.8, z)); }
  }
  return bakeShade(merge(parts), 0.62);
}

/** Turbine ruin: sunken housing ring + hub + broken blades (axis along x, tilted). r = ring radius. */
export function turbineGeo(rng, r) {
  const parts = [];
  const ring = colored(new THREE.TorusGeometry(r, r * 0.13, 5, 12), '#5a5e68');
  parts.push(put(ring, 0, r * 0.7, 0, Math.PI / 2, 1, 0, 0.12));
  parts.push(cyl(r * 0.2, r * 0.2, r * 0.6, 8, '#3c4048', 0, r * 0.7, 0, 0, Math.PI / 2));
  const blades = 9;
  for (let i = 0; i < blades; i++) {
    if (rng() < 0.2) continue;
    const a = (i / blades) * 6.283, len = r * (0.55 + rng() * 0.35);
    const b = box(r * 0.06, len, r * 0.3, i % 2 ? '#6a7080' : '#58606c', 0, 0, 0);
    put(b, 0, len / 2 + r * 0.15, 0, 0, 1, 0, 0.35);
    put(b, 0, 0, 0, 0, 1, a, 0);
    put(b, 0, r * 0.7, 0, Math.PI / 2, 1, 0, 0.12);
    parts.push(b);
  }
  parts.push(box(r * 0.5, r * 0.5, r * 2.2, '#4a3a34', 0, r * 0.1, 0));
  parts.push(box(r * 0.3, r * 0.4, r * 0.3, '#5a3a28', r * 0.2, r * 1.6, J(rng, r), rng() * 3));
  return bakeShade(merge(parts), 0.6);
}

/** Overturned railway Waggon (camp). Local origin = centre, long axis = z. */
export function wagonGeo() {
  const parts = [];
  const bodyC = '#b0603a';
  const body = colored(new THREE.BoxGeometry(3.6, 3.2, 11), bodyC);
  faceColors(body, (f) => tint(bodyC, 0.75 + ((f * 7) % 5) * 0.07));
  parts.push(put(body, 0, 1.3, 0, 0, 1, 0, 0.32));
  for (let i = -2; i <= 2; i++) parts.push(box(0.15, 3.0, 0.3, '#3a2218', -1.0 + i * 0.1, 1.5, i * 2.0, 0, 0, 0.32)); // ribs
  parts.push(box(3.0, 0.15, 10.4, '#4a2e22', 0.25, 3.1, 0, 0, 0, 0.32)); // roof panel
  parts.push(box(0.2, 2.2, 3.2, '#2a1c16', 1.62, 1.3, 1.2, 0, 0, 0.32)); // open sliding door
  for (const z of [-3.6, 3.6]) { // wheels sticking out sideways
    parts.push(cyl(1.0, 1.0, 0.3, 9, '#3c3430', -2.2, 3.1, z, 0, Math.PI / 2 - 0.32));
    parts.push(cyl(0.3, 0.3, 0.5, 6, '#6a5a50', -2.2, 3.1, z, 0, Math.PI / 2 - 0.32));
  }
  parts.push(box(0.5, 0.5, 2.5, '#3a3430', 0, 0.3, 6.6)); // coupling
  return bakeShade(merge(parts), 0.62);
}

/** Planked Steg over a toxic channel. along = direction of the channel (radians), length across the channel. */
export function stegGeo(across, width, yaw) {
  const parts = [box(width, 0.22, across, '#7a5236', 0, 0, 0)];
  for (let i = -3; i <= 3; i++) parts.push(box(width * 1.02, 0.06, 0.12, '#3a2418', 0, 0.14, i * (across / 7)));
  for (const s of [-1, 1]) { parts.push(box(0.12, 0.9, across, '#5a3a28', s * (width / 2 - 0.1), 0.6, 0)); parts.push(box(0.14, 0.14, across, '#8a6a48', s * (width / 2 - 0.1), 1.05, 0)); }
  const m = merge(parts);
  put(m, 0, 0, 0, yaw);
  return bakeShade(m, 0.64);
}

// ------------------------------------------------------------------ interactables (visible, separate meshes so the logic side can animate them)

/** Dampfventil: pipe stub with nozzle (body) + red handwheel (wheel). Local +z = facing direction (away from the Kessel). */
export function valveGeos() {
  const body = [
    cyl(0.5, 0.6, 1.5, 7, '#6a4a34', 0, 0.75, 0.2), cyl(0.7, 0.7, 0.25, 7, '#2a2220', 0, 0.15, 0.2),
    cyl(0.28, 0.28, 1.0, 6, '#8a8a90', 0, 1.9, 0.2), cyl(0.38, 0.38, 0.25, 6, '#2a2220', 0, 2.5, 0.2),
    box(0.5, 0.4, 0.9, '#5a4a40', 0, 1.2, -0.4),
  ];
  const wheel = [put(colored(new THREE.TorusGeometry(0.55, 0.09, 4, 10), '#d83a2a'), 0, 1.5, 0.82, 0, 1, 0, 0), cyl(0.09, 0.09, 0.5, 5, '#a02a20', 0, 1.5, 0.6, Math.PI / 2, 0)];
  for (let i = 0; i < 3; i++) wheel.push(put(box(0.07, 1.1, 0.07, '#d83a2a'), 0, 1.5, 0.82, 0, 1, 0, (i / 3) * Math.PI));
  return { body: bakeShade(merge(body), 0.7), wheel: bakeShade(merge(wheel), 0.85) };
}

/** Schrottkran: body = mast + arm + counterweight (+ ground ring at the drop spot, passed in as ring geo); load = rope + hanging scrap. */
export function craneGeos(arm = 12, loadY = 5) {
  const body = [];
  body.push(cyl(1.0, 1.4, 1.2, 6, '#4a3a30', 0, 0.6, 0));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) body.push(box(0.2, 12.5, 0.2, '#c89a2a', sx * 0.5, 6.4, sz * 0.5));
  for (let y = 1.5; y < 12; y += 2.2) { body.push(box(1.2, 0.16, 0.16, '#a87820', 0, y, 0.5), box(1.2, 0.16, 0.16, '#a87820', 0, y, -0.5), box(0.16, 0.16, 1.2, '#a87820', 0.5, y, 0), box(0.16, 0.16, 1.2, '#a87820', -0.5, y, 0)); }
  body.push(box(0.7, 0.7, arm + 3, '#d8a830', 0, 12.9, (arm - 3) / 2)); // arm along +z (rotated by yaw outside)
  body.push(box(1.6, 1.2, 1.6, '#4a4a50', 0, 12.6, -2.4)); // counterweight
  body.push(box(1.1, 1.0, 1.1, '#5a3a28', 0, 13.7, 0.4)); // cabin
  const load = [];
  const ropeLen = 12.6 - loadY;
  load.push(cyl(0.05, 0.05, ropeLen, 4, '#202020', 0, loadY + ropeLen / 2, 0));
  load.push(box(0.5, 0.35, 0.5, '#2a2a2e', 0, loadY + 0.2, 0));
  for (const s of [-1, 1]) load.push(box(0.05, 1.2, 0.05, '#202020', s * 0.7, loadY - 0.3, 0, 0, 0, s * 0.5));
  load.push(box(2.8, 1.5, 2.8, '#7a4a30', 0, loadY - 1.3, 0));
  load.push(box(2.9, 0.2, 2.9, '#3a2c24', 0, loadY - 0.5, 0));
  load.push(box(0.4, 2.2, 0.5, '#5a5a62', 0.6, loadY - 1.1, 0.3, 0.4, 0.3, 0.5));
  load.push(box(1.6, 0.4, 1.6, '#9a5a30', -0.4, loadY - 2.2, 0.2, 0.7));
  return { body: bakeShade(merge(body), 0.6), load: bakeShade(merge(load), 0.62) };
}

/** Blitzableiter: base block, tall mast with fins and a glowing tip. */
export function rodGeo() {
  const p = [];
  p.push(cyl(1.3, 1.6, 0.8, 6, '#3c4048', 0, 0.4, 0), cyl(0.5, 0.7, 4, 6, '#58606c', 0, 2.5, 0));
  p.push(cyl(0.22, 0.4, 8, 6, '#7a828e', 0, 8, 0));
  for (let i = 0; i < 3; i++) { const y = 3.2 + i * 2.6, w = 1.8 - i * 0.4; p.push(box(w, 0.12, 0.12, '#a0a8b4', 0, y + 2, 0), box(0.12, 0.12, w, '#a0a8b4', 0, y + 2, 0)); }
  p.push(put(colored(new THREE.ConeGeometry(0.2, 2.2, 5), '#ffe040'), 0, 13.1, 0));
  p.push(put(colored(new THREE.OctahedronGeometry(0.42, 0), '#9ae8ff'), 0, 14.4, 0));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; p.push(box(0.1, 3.4, 0.1, '#2a2e36', Math.cos(a) * 1.1, 1.8, Math.sin(a) * 1.1, 0, Math.sin(a) * 0.45, -Math.cos(a) * 0.45)); }
  return merge(p); // unlit-ish: no bake, lit material
}

// ------------------------------------------------------------------ gather point builders (Rostwerke kinds), same signature as gatherables.js BUILDERS
export const RW_BUILDERS = {
  kupferdraht(rng) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
      const t = colored(new THREE.TorusGeometry(0.34 - i * 0.04, 0.1, 4, 9), i % 2 ? '#c8703a' : '#e08a48');
      parts.push(put(t, J(rng, 0.1), 0.12 + i * 0.16, J(rng, 0.1), rng() * 6, 1, Math.PI / 2, 0));
    }
    parts.push(cyl(0.08, 0.08, 0.5, 5, '#6a6a70', 0, 0.3, 0));
    for (let i = 0; i < 3; i++) parts.push(box(0.04, 0.04, 0.8, '#e08a48', J(rng, 0.7), 0.04, J(rng, 0.7), rng() * 6));
    return merge(parts);
  },
  schlacke(rng) {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const a = rng() * 6.28, r = rng() * 0.45;
      const g = colored(new THREE.DodecahedronGeometry(0.2 + rng() * 0.15, 0), i % 2 ? '#3a3234' : '#2a2426');
      parts.push(put(g, Math.cos(a) * r, 0.16, Math.sin(a) * r, rng() * 6));
    }
    for (let i = 0; i < 5; i++) parts.push(put(colored(new THREE.OctahedronGeometry(0.07 + rng() * 0.04, 0), i % 2 ? '#ff8a30' : '#ffc050'), J(rng, 0.9), 0.1 + rng() * 0.3, J(rng, 0.9)));
    parts.push(put(colored(new THREE.CylinderGeometry(0.62, 0.7, 0.05, 7), '#4a3a34'), 0, 0.03, 0));
    return merge(parts);
  },
  rostkaefer(rng) {
    const parts = [put(colored(new THREE.SphereGeometry(0.62, 6, 3, 0, 6.283, 0, Math.PI / 2), '#5a3a22'), 0, 0, 0, 0, 1, 0, 0)];
    parts.push(put(colored(new THREE.CylinderGeometry(0.2, 0.3, 0.05, 6), '#1a120a'), 0.2, 0.34, 0.1));
    const cols = ['#b0502a', '#d8802a', '#8a3a1a', '#c8a030'];
    for (let i = 0; i < 9; i++) {
      const a = rng() * 6.28, r = 0.3 + rng() * 0.55;
      parts.push(put(colored(new THREE.SphereGeometry(0.11, 4, 3), cols[i % 4]), Math.cos(a) * r, 0.1, Math.sin(a) * r, a, [1, 0.7, 1.5]));
    }
    return merge(parts);
  },
  giftschlamm(rng) {
    const parts = [put(colored(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 8), '#78f040'), 0, 0.05, 0)];
    parts.push(put(colored(new THREE.CylinderGeometry(0.9, 0.95, 0.09, 8), '#3a3a2a'), 0, 0.02, 0));
    for (let i = 0; i < 4; i++) parts.push(put(colored(new THREE.SphereGeometry(0.12 + rng() * 0.08, 5, 3), '#b8ff80'), J(rng, 0.8), 0.14, J(rng, 0.8)));
    parts.push(cyl(0.22, 0.22, 0.7, 6, '#9a4a28', 0.85, 0.35, -0.2));
    parts.push(cyl(0.2, 0.2, 0.08, 6, '#78f040', 0.85, 0.72, -0.2));
    return merge(parts);
  },
  funkenstein(rng) {
    const parts = [put(colored(new THREE.DodecahedronGeometry(0.5, 0), '#3a3e4a'), 0, 0.32, 0, rng() * 6, [1.1, 0.7, 1])];
    for (let i = 0; i < 5; i++) {
      const a = rng() * 6.28, h = 0.45 + rng() * 0.4;
      const c = colored(new THREE.ConeGeometry(0.09, h, 4), i % 2 ? '#9ae8ff' : '#ffe860');
      recolor(c, (x, y) => tint(i % 2 ? '#9ae8ff' : '#ffe860', 0.7 + (y / h + 0.5) * 0.6));
      parts.push(put(c, Math.cos(a) * 0.28, 0.6 + h / 2 * 0.6, Math.sin(a) * 0.28, 0, 1, J(rng, 0.6), J(rng, 0.6)));
    }
    return merge(parts);
  },
};

export { box, cyl, tint };
