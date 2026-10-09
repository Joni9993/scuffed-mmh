import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Low-poly prop geometry builders. Every geometry comes out non-indexed with position / normal / uv / color so that
// anything can be merged into one draw call per material.

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** Prepare a geometry: non-indexed, with a flat vertex colour (hex string or [r,g,b] 0..1). */
export function colored(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  if (Array.isArray(color)) _c.setRGB(color[0], color[1], color[2]); else _c.set(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
/** Vertex-colour jitter / gradient: fn(x,y,z,i) -> hex or null (keep). */
export function recolor(geo, fn) {
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const col = fn(p.getX(i), p.getY(i), p.getZ(i), i);
    if (col == null) continue;
    if (Array.isArray(col)) _c.setRGB(col[0], col[1], col[2]); else _c.set(col);
    c.setXYZ(i, _c.r, _c.g, _c.b);
  }
  return geo;
}
/** Colour per triangle (non-indexed geometry): fn(faceIndex) -> hex. */
export function faceColors(geo, fn) {
  const c = geo.attributes.color;
  for (let f = 0; f < c.count / 3; f++) {
    _c.set(fn(f));
    for (let k = 0; k < 3; k++) c.setXYZ(f * 3 + k, _c.r, _c.g, _c.b);
  }
  return geo;
}
export function scaleColor(geo, k) {
  const c = geo.attributes.color;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  return geo;
}
/** Bake simple directional shading into vertex colours (for unlit materials). */
export function bakeShade(geo, ambient = 0.58) {
  const n = geo.attributes.normal, c = geo.attributes.color;
  for (let i = 0; i < c.count; i++) {
    const k = ambient + (1 - ambient) * Math.max(0, n.getY(i) * 0.7 + n.getX(i) * 0.25 + 0.15);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return geo;
}
/** Return geo transformed in place: pos, euler (x,y,z), uniform or [sx,sy,sz] scale. */
export function put(geo, x, y, z, ry = 0, s = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  if (Array.isArray(s)) _s.set(s[0], s[1], s[2]); else _s.setScalar(s);
  _m.compose(_v.set(x, y, z), _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}
export const merge = (arr) => mergeGeometries(arr, false);

/** Deterministic hash jitter by position so shared corners of non-indexed polyhedra move together. */
function jitterPos(geo, amount, seed) {
  const p = geo.attributes.position;
  const h = (x, y, z, k) => { const s = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 757) * 78.233 + Math.round(z * 541) * 37.719 + seed * 4.1 + k * 91.7) * 43758.5453; return s - Math.floor(s) - 0.5; };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + h(x, y, z, 1) * amount, y + h(x, y, z, 2) * amount, z + h(x, y, z, 3) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}
const lerpHex = (a, b, t) => { _c.set(a).lerp(new THREE.Color(b), t); return [_c.r, _c.g, _c.b]; };

// ------------------------------------------------------------------ geometry builders (origin at ground)

/** Boulder: squashed, jittered icosahedron. Returns uv-planar-mapped geo with vertex colour gradient base->top. */
export function rockGeo(rng, r, base = '#6a6070', top = '#8a8294') {
  const g = new THREE.IcosahedronGeometry(1, 0);
  jitterPos(g, 0.35, rng() * 100);
  const gc = colored(g, base);
  const sy = 0.7 + rng() * 0.7;
  put(gc, 0, 0, 0, rng() * 6.3, [r * (0.9 + rng() * 0.3), r * sy, r * (0.9 + rng() * 0.3)]);
  recolor(gc, (x, y) => lerpHex(base, top, Math.min(1, Math.max(0, (y / (r * sy) + 1) * 0.5 + (rng() - 0.5) * 0.25))));
  planarUV(gc, 0.3);
  put(gc, 0, r * sy * 0.55, 0);
  return gc;
}
/** Tapered 5-6 sided pillar with strata bands (cliff spires, Z2/Z4). */
export function pillarGeo(rng, r, h, base = '#7a6a5a', top = '#a89880') {
  const g = new THREE.CylinderGeometry(r * (0.45 + rng() * 0.2), r, h, 5 + ((rng() * 2) | 0), 2);
  jitterPos(g, r * 0.18, rng() * 100);
  const gc = colored(g, base);
  recolor(gc, (x, y) => {
    const t = (y + h / 2) / h;
    const band = Math.floor((y + h / 2) * 1.6) % 2 ? 0.88 : 1;
    const c = new THREE.Color(base).lerp(new THREE.Color(top), t * 0.8).multiplyScalar(band);
    return [c.r, c.g, c.b];
  });
  planarUV(gc, 0.3);
  put(gc, 0, h / 2 - 0.4, 0, rng() * 6.3);
  return gc;
}
/** world-ish planar UV from local position (so textured merged props never stretch badly). */
export function planarUV(geo, k = 0.25) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), nz = Math.abs(n.getZ(i));
    uv.setXY(i, (nz > nx ? p.getX(i) : p.getZ(i)) * k + p.getY(i) * 0.1, p.getY(i) * k);
  }
  return geo;
}

export function boneStick(len = 1.2, th = 0.1, color = '#e8dcc0') {
  const parts = [colored(new THREE.CylinderGeometry(th, th, len, 5), color)];
  for (const s of [-1, 1]) parts.push(put(colored(new THREE.OctahedronGeometry(th * 1.8, 0), color), 0, s * len / 2, 0));
  return merge(parts);
}
export function skullGeo(s = 1, color = '#efe4c8') {
  const cr = put(colored(new THREE.SphereGeometry(0.42, 6, 4), color), 0, 0.15, 0, 0, [1, 0.9, 1.15]);
  const sn = put(colored(new THREE.BoxGeometry(0.34, 0.26, 0.62), color), 0, -0.05, 0.55);
  const eye1 = put(colored(new THREE.BoxGeometry(0.16, 0.16, 0.1), '#2a2018'), 0.2, 0.2, 0.4);
  const eye2 = put(colored(new THREE.BoxGeometry(0.16, 0.16, 0.1), '#2a2018'), -0.2, 0.2, 0.4);
  const horn1 = put(colored(new THREE.ConeGeometry(0.1, 0.55, 4), '#d6c6a0'), 0.36, 0.5, -0.1, 0, 1, 0, -0.5);
  const horn2 = put(colored(new THREE.ConeGeometry(0.1, 0.55, 4), '#d6c6a0'), -0.36, 0.5, -0.1, 0, 1, 0, 0.5);
  return put(merge([cr, sn, eye1, eye2, horn1, horn2]), 0, 0.2, 0, 0, s);
}
/** Ribcage lying on its side: arch ribs along a spine, with a skull at one end. */
export function ribcageGeo(rng, scale = 1) {
  const parts = [];
  const n = 5 + ((rng() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const rr = (1.5 - Math.abs(i - (n - 1) / 2) * 0.17) * scale;
    parts.push(put(colored(new THREE.TorusGeometry(rr, 0.12 * scale, 4, 7, Math.PI), '#e6dabc'), 0, 0.05, (i - (n - 1) / 2) * 0.62 * scale, (rng() - 0.5) * 0.15));
  }
  const spine = put(colored(new THREE.CylinderGeometry(0.1 * scale, 0.1 * scale, n * 0.66 * scale, 5), '#d6c8a6'), 0, 0.1, 0, 0, 1, Math.PI / 2);
  parts.push(spine);
  parts.push(put(skullGeo(1.15 * scale), 0, 0, (n / 2 + 0.55) * 0.62 * scale));
  return merge(parts);
}
export function deadTreeGeo(rng, h = 4.5, bark = '#5a4634', charred = false) {
  const parts = [];
  const trunk = put(colored(new THREE.CylinderGeometry(0.1, 0.34, h, 5), bark), 0, h / 2, 0, 0, 1, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12);
  planarUV(trunk, 0.4);
  parts.push(trunk);
  const nb = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < nb; i++) {
    const y = h * (0.35 + rng() * 0.5), a = rng() * 6.3, len = 1.2 + rng() * 1.4, tilt = 0.7 + rng() * 0.6;
    const b = colored(new THREE.CylinderGeometry(0.03, 0.1, len, 4), bark);
    put(b, 0, len / 2, 0);
    put(b, 0, y, 0, a, 1, 0, tilt);
    planarUV(b, 0.4);
    parts.push(b);
    if (rng() < 0.6) {
      const t = colored(new THREE.CylinderGeometry(0.02, 0.06, 0.9, 4), bark);
      put(t, 0, 0.45, 0);
      put(t, Math.cos(a) * len * 0.7, y + len * 0.5, Math.sin(a) * len * 0.7, a + 1, 1, 0, -0.5);
      planarUV(t, 0.4);
      parts.push(t);
    }
  }
  if (charred) for (const p of parts) scaleColor(p, 0.55);
  return merge(parts);
}
export function crystalCluster(rng, colors, s = 1) {
  const parts = [];
  const n = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const h = (1.0 + rng() * 1.7) * s, w = (0.22 + rng() * 0.16) * s;
    const g = colored(new THREE.ConeGeometry(w, h, 4), colors[(rng() * colors.length) | 0]);
    const base = new THREE.Color(colors[i % colors.length]);
    recolor(g, (x, y) => { const t = Math.min(1, Math.max(0, y / h + 0.5)); const c = base.clone().multiplyScalar(0.55 + t * 0.75); return [c.r, c.g, c.b]; });
    put(g, 0, h / 2, 0);
    put(g, Math.cos(i * 2.3) * 0.35 * s, 0, Math.sin(i * 2.3) * 0.35 * s, rng() * 6, 1, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
    parts.push(g);
  }
  return bakeShade(merge(parts), 0.8);
}
export function bigMushroom(rng, h, capColors) {
  const stem = colored(new THREE.CylinderGeometry(0.13 * h / 1.6, 0.22 * h / 1.6, h, 5), '#d8d0b8');
  put(stem, 0, h / 2, 0);
  const capR = (0.6 + rng() * 0.4) * h / 1.6 * 1.4;
  const cap = new THREE.SphereGeometry(capR, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  const c = colored(cap, capColors[0]);
  const base = capColors[(rng() * capColors.length) | 0];
  faceColors(c, (f) => (rng() < 0.22 ? '#f4efd8' : base));
  put(c, 0, h * 0.92, 0, 0, [1, 0.8, 1]);
  return merge([stem, c]);
}
export function tuftGeo(rng, color, h = 0.8) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const hh = h * (0.6 + rng() * 0.6);
    const g = colored(new THREE.ConeGeometry(0.14, hh, 3, 1, true), color);
    recolor(g, (x, y) => { const t = y / hh + 0.5; const c = new THREE.Color(color).multiplyScalar(0.65 + t * 0.55); return [c.r, c.g, c.b]; });
    put(g, 0, hh / 2, 0);
    put(g, (rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.4, rng() * 6, 1, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5);
    parts.push(g);
  }
  return merge(parts);
}

/** Camp: tent, chest, fire ring, flag. Returns {lit:[geos], glow:[geos], wood:[geos]} in local coords (origin = camp centre). */
export function campGeos() {
  const lit = [], glow = [], wood = [];
  const tent = new THREE.ConeGeometry(2.6, 2.6, 4);
  const tg = colored(tent, '#c8553a');
  faceColors(tg, (f) => (Math.floor(f / 1) % 2 ? '#c8553a' : '#e0c890'));
  put(tg, 0, 1.3, 0, Math.PI / 4);
  lit.push(put(tg, -4, 0, 0, 0.2));
  lit.push(put(colored(new THREE.BoxGeometry(0.9, 1.3, 0.1), '#2a1c14'), -4 + Math.sin(0.2) * 1.5, 0.6, 1.32 * Math.cos(0.2) + 0.1, 0.2));
  // chest
  lit.push(put(colored(new THREE.BoxGeometry(1.2, 0.7, 0.75), '#7a4a26'), 3, 0.35, 0.5, 0.3));
  lit.push(put(colored(new THREE.BoxGeometry(1.24, 0.28, 0.79), '#946030'), 3, 0.84, 0.5, 0.3));
  lit.push(put(colored(new THREE.BoxGeometry(0.2, 0.26, 0.1), '#e8c848'), 3 + Math.sin(0.3) * 0.38, 0.6, 0.5 + Math.cos(0.3) * 0.38, 0.3));
  glow.push(put(colored(new THREE.BoxGeometry(0.22, 0.3, 0.12), '#ffd860'), 3 + Math.sin(0.3) * 0.4, 0.6, 0.5 + Math.cos(0.3) * 0.4, 0.3));
  // fire ring
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    lit.push(put(colored(new THREE.DodecahedronGeometry(0.22, 0), '#6a6270'), Math.cos(a) * 0.8, 0.15, Math.sin(a) * 0.8 - 1.5, a));
  }
  wood.push(put(colored(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5), '#5a4634'), 0, 0.2, -1.5, 0.5, 1, 0, Math.PI / 2 - 0.2));
  wood.push(put(colored(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 5), '#5a4634'), 0, 0.2, -1.5, -0.5, 1, 0, Math.PI / 2 - 0.2));
  glow.push(bakeShade(put(colored(new THREE.ConeGeometry(0.4, 1.0, 5), '#ff9a30'), 0, 0.6, -1.5), 0.9));
  glow.push(bakeShade(put(colored(new THREE.ConeGeometry(0.22, 0.7, 4), '#ffe070'), 0, 0.55, -1.5), 0.9));
  // flag pole
  wood.push(put(colored(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 5), '#5a4634'), 0, 2.1, 4));
  lit.push(put(colored(new THREE.BoxGeometry(1.3, 0.8, 0.05), '#3f8a4a'), 0.72, 3.7, 4));
  return { lit, glow, wood };
}
