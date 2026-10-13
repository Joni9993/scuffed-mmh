import * as THREE from 'three';
import { colored, recolor, put, merge, bakeShade, pillarGeo } from './props.js';

// Smaragdküste props: low-poly PS1 geometry (origin at ground, vertex coloured, mergeable).
const tint = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return [c.r, c.g, c.b]; };
const J = (rng, a) => (rng() - 0.5) * a;
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];
const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => put(colored(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, 1, rx, rz);
const ball = (r, color, x, y, z, s = 1) => put(colored(new THREE.IcosahedronGeometry(r, 0), color), x, y, z, 0, s);

/** Cylinder from point a to point b (thickness r at a, 0.8 r at b): trunks, roots, vines, driftwood. */
function seg(a, b, r, color) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 0.01;
  const g = new THREE.CylinderGeometry(r * 0.8, r, len, 5);
  g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); // axis along +z, starting at the origin
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(dx / len, dy / len, dz / len)));
  g.translate(a[0], a[1], a[2]);
  return colored(g, color);
}
/** Flat leaf radiating from the origin along +z, drooping by `droop` rad, rotated by yaw `ry`. */
function frond(len, w, droop, ry, color, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, 0.04, len);
  g.translate(0, 0, len / 2); g.rotateX(droop);
  const c = colored(g, color);
  recolor(c, (px, py, pz) => tint(color, 0.7 + Math.min(1, Math.max(0, pz / len)) * 0.45));
  return put(c, x, y, z, ry);
}

/** Palm: leaning, ringed trunk, crown of drooping fronds, coconuts. */
export function palmGeo(rng, h = 6) {
  const parts = [], lean = J(rng, 0.5) + (rng() < 0.5 ? 0.25 : -0.25), a = rng() * 6.3;
  const N = 5, at = (t) => [Math.cos(a) * lean * t * t * h * 0.35, h * t, Math.sin(a) * lean * t * t * h * 0.35];
  for (let i = 0; i < N; i++) parts.push(seg(at(i / N), at((i + 1) / N), 0.3 - i * 0.03, i % 2 ? '#8a6a48' : '#7a5c3c'));
  const top = at(1), greens = ['#3f9a3a', '#52b048', '#2f8030'];
  const nf = 8;
  for (let i = 0; i < nf; i++) parts.push(frond(2.6 + rng() * 0.8, 0.8, 0.35 + rng() * 0.5, (i / nf) * 6.283 + rng() * 0.3, greens[i % 3], top[0], top[1], top[2]));
  for (let i = 0; i < 3; i++) parts.push(ball(0.2, '#5a4026', top[0] + J(rng, 0.5), top[1] - 0.25, top[2] + J(rng, 0.5)));
  return bakeShade(merge(parts), 0.6);
}

/** Jungle tree: thick buttressed trunk, layered blobby canopy, hanging vines. `dark` = deep jungle palette. */
export function jungleTreeGeo(rng, h = 9, dark = false) {
  const parts = [], bark = dark ? '#4a3c2c' : '#6a4e34', leaf = dark ? ['#254a26', '#2f5a2c', '#1e3e22'] : ['#3a8a30', '#4aa23a', '#2e7428'];
  const r = 0.45 + h * 0.035;
  parts.push(put(colored(new THREE.CylinderGeometry(r * 0.6, r, h, 6), bark), 0, h / 2, 0));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + rng(); parts.push(seg([Math.cos(a) * r * 2.2, 0, Math.sin(a) * r * 2.2], [Math.cos(a) * r * 0.5, h * 0.3, Math.sin(a) * r * 0.5], r * 0.45, bark)); }
  const nb = 4 + ((rng() * 2) | 0);
  for (let i = 0; i < nb; i++) {
    const a = rng() * 6.283, d = i === 0 ? 0 : 1.4 + rng() * 1.8, rr = 2.0 + rng() * 1.2, y = h * (0.85 + (i % 2) * 0.12) + rng();
    const b = ball(rr, leaf[i % 3], Math.cos(a) * d, y, Math.sin(a) * d, 1);
    put(b, 0, 0, 0, 0, [1, 0.62, 1]);
    parts.push(b);
  }
  for (let i = 0; i < 4; i++) { // vines
    const a = rng() * 6.283, d = 1.6 + rng() * 1.6, y = h * 0.85, l = 2 + rng() * 3;
    parts.push(seg([Math.cos(a) * d, y, Math.sin(a) * d], [Math.cos(a) * d + J(rng, 0.3), y - l, Math.sin(a) * d + J(rng, 0.3)], 0.045, dark ? '#3a6a34' : '#4a8a3c'));
  }
  return bakeShade(merge(parts), 0.55);
}

/** Fern / big-leaf bush: ring of arched leaves. */
export function fernGeo(rng, s = 1, dark = false) {
  const parts = [], greens = dark ? ['#2e5a2c', '#3a6a34', '#244a24'] : ['#48a038', '#5ab848', '#3a8a30'];
  const n = 7;
  for (let i = 0; i < n; i++) parts.push(frond((1.2 + rng() * 0.6) * s, 0.4 * s, 0.4 + rng() * 0.2, (i / n) * 6.283 + rng() * 0.4, greens[i % 3], 0, 0.1 * s, 0));
  return merge(parts);
}

/** Tangle of mossy roots crawling over the ground (deep jungle). */
export function rootsGeo(rng, r = 1.6) {
  const parts = [], n = 4 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rng() * 0.6, len = r * (0.8 + rng() * 0.8), w = 0.16 + rng() * 0.12;
    let prev = [0, 0.1, 0];
    for (let k = 1; k <= 3; k++) {
      const t = k / 3, p = [Math.cos(a + t * 0.5) * len * t, Math.sin(t * Math.PI) * 0.55 * (0.6 + rng() * 0.6) + 0.05, Math.sin(a + t * 0.5) * len * t];
      parts.push(seg(prev, p, w * (1.1 - t * 0.5), '#4a3a28'));
      parts.push(seg([prev[0], prev[1] + w * 0.6, prev[2]], [p[0], p[1] + w * 0.6, p[2]], w * 0.55, '#4a7a34')); // moss on top
      prev = p;
    }
  }
  parts.push(ball(0.35, '#3a5a2c', 0, 0.2, 0, 1));
  return bakeShade(merge(parts), 0.6);
}

/** Driftwood log with two stubby branches (beach). */
export function driftwoodGeo(rng, len = 3) {
  const parts = [seg([-len / 2, 0.2, 0], [len / 2, 0.28, 0], 0.2, '#b8a88c')];
  for (let i = 0; i < 2; i++) { const x = J(rng, len * 0.6); parts.push(seg([x, 0.25, 0], [x + J(rng, 0.4), 0.8 + rng() * 0.4, (i ? 1 : -1) * 0.5], 0.08, '#a89878')); }
  return bakeShade(merge(parts), 0.7);
}

/** Beach/jungle shell (half sphere with pale ribs), also used by the Muschel gather point. */
const shell = (r, color, x, z, ry) => {
  const g = colored(new THREE.SphereGeometry(r, 6, 3, 0, 6.283, 0, Math.PI / 2), color);
  recolor(g, (px, py, pz) => (Math.abs(Math.sin(Math.atan2(px, pz) * 4)) > 0.7 ? tint(color, 1.18) : null));
  return put(g, x, 0, z, ry, [1, 0.5, 0.8]);
};

// ------------------------------------------------------------------ temple

/** Stone block with a moss cap. */
export function blockGeo(w, h, d, base = '#76867c') {
  return merge([box(w, h, d, base, 0, h / 2, 0), box(w * 0.9, 0.12, d * 0.9, '#4a7a3a', 0, h + 0.02, 0)]);
}
/** Ruined temple pillar: stands (h) or is broken (h small) with a rubble block at its foot. */
export function templePillar(rng, h, r = 0.9) {
  const parts = [pillarGeo(rng, r, h, '#6a7a70', '#9aaa9e')];
  parts.push(box(r * 2.5, 0.35, r * 2.5, '#5e6e64', 0, 0.12, 0, rng() * 3));
  if (h > 5) parts.push(box(r * 2.6, 0.5, r * 2.6, '#7a8a80', 0, h - 0.5, 0, rng() * 3));
  parts.push(box(r * 1.1, 0.5, r * 0.9, '#6a7a70', J(rng, 2.4) + r * 1.6, 0.25, J(rng, 2.4), rng() * 3));
  // vines
  for (let i = 0; i < 3; i++) { const a = rng() * 6.283, y = h * (0.6 + rng() * 0.4); parts.push(seg([Math.cos(a) * r, y, Math.sin(a) * r], [Math.cos(a) * r * 1.1, y - 1.5 - rng() * 2.5, Math.sin(a) * r * 1.1], 0.045, '#3f7a34')); }
  return bakeShade(merge(parts), 0.6);
}
/** Fallen pillar lying on its side. */
export function fallenPillar(rng, len = 5, r = 0.85) {
  const g = pillarGeo(rng, r, len, '#6a7a70', '#8a9a8e');
  put(g, 0, r * 0.85, 0, rng() * 6.283, 1, 0, Math.PI / 2);
  return bakeShade(merge([g, box(len * 0.55, 0.12, r * 1.4, '#4a7a3a', 0, r * 1.75, 0, 0)]), 0.6);
}
/** Gate: two stout pillars and a broken lintel (the ruined entrance at the top of the temple stair). */
export function gateGeo(rng, span = 14) {
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(pillarGeo(rng, 1.3, 9, '#6a7a70', '#9aaa9e'));
    put(parts[parts.length - 1], s * span / 2, 0, 0);
    parts.push(box(3.4, 0.6, 3.4, '#5e6e64', s * span / 2, 0.2, 0));
  }
  parts.push(box(span * 0.46, 1.1, 2.0, '#76867c', -span * 0.25, 8.6, 0, 0, 0, 0.06)); // lintel halves, one tilted down
  parts.push(box(span * 0.3, 1.1, 2.0, '#76867c', span * 0.33, 8.7, 0, 0, 0, -0.18));
  for (let i = 0; i < 6; i++) parts.push(seg([J(rng, span), 8.4, 0.8], [J(rng, span) , 8.4 - 2 - rng() * 3, 0.8], 0.05, '#3f7a34'));
  return bakeShade(merge(parts), 0.6);
}
/** Standing rune slab. Returns { stone, glow } (glow = emissive runes, unlit). */
export function runeSlab(rng) {
  const stone = merge([box(1.5, 2.4, 0.4, '#6a7a70', 0, 1.2, 0), box(1.7, 0.3, 0.6, '#5e6e64', 0, 0.12, 0), box(1.1, 0.1, 0.46, '#4a7a3a', 0, 2.42, 0)]);
  const glow = [];
  glow.push(box(0.1, 0.9, 0.06, '#58ffd0', 0, 1.35, 0.22));
  for (let i = 0; i < 3; i++) glow.push(box(0.5, 0.08, 0.06, i % 2 ? '#40e8c8' : '#7affe0', J(rng, 0.2), 0.95 + i * 0.4, 0.22));
  glow.push(put(colored(new THREE.OctahedronGeometry(0.16, 0), '#7affe0'), 0, 2.0, 0.22));
  return { stone: bakeShade(stone, 0.6), glow: merge(glow) };
}
/** Floor ring of glowing runes around the apex nest (lies flat, origin = centre). */
export function runeRing(r = 9) {
  const parts = [];
  const t = new THREE.TorusGeometry(r, 0.14, 4, 36); t.rotateX(Math.PI / 2);
  parts.push(colored(t, '#38d8b8'));
  const t2 = new THREE.TorusGeometry(r * 0.62, 0.1, 4, 28); t2.rotateX(Math.PI / 2);
  parts.push(colored(t2, '#2ab8a0'));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; parts.push(put(colored(new THREE.OctahedronGeometry(0.34, 0), '#7affe0'), Math.cos(a) * r, 0.08, Math.sin(a) * r, a, [1, 0.3, 1.6])); }
  return merge(parts);
}
/** Low dais (3 stacked round slabs) at the apex nest. */
export function daisGeo(r = 7) {
  return bakeShade(merge([
    put(colored(new THREE.CylinderGeometry(r, r + 0.4, 0.3, 12), '#6e7e74'), 0, 0.15, 0),
    put(colored(new THREE.CylinderGeometry(r * 0.78, r * 0.82, 0.3, 12), '#7a8a80'), 0, 0.42, 0),
    put(colored(new THREE.CylinderGeometry(r * 0.5, r * 0.54, 0.3, 10), '#86968c'), 0, 0.68, 0),
  ]), 0.7);
}

// ------------------------------------------------------------------ gather point builders (Smaragdküste kinds), same signature as gatherables.js BUILDERS
export const SK_BUILDERS = {
  muschel(rng) {
    const parts = [put(colored(new THREE.CylinderGeometry(0.62, 0.7, 0.04, 8), '#e8d8a8'), 0, 0.02, 0)];
    const cols = ['#f4c8b8', '#f8f0e0', '#e8a0a8', '#fff4d8'];
    for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + rng(); parts.push(shell(0.26 + rng() * 0.1, cols[i % 4], Math.cos(a) * 0.3, Math.sin(a) * 0.3, rng() * 6)); }
    parts.push(put(colored(new THREE.OctahedronGeometry(0.1, 0), '#fff8f0'), 0.05, 0.12, -0.05));
    return merge(parts);
  },
  kokosnuss(rng) {
    const parts = [frond(0.9, 0.3, 0.4, 0.4, '#3f9a3a', -0.3, 0.05, -0.1), frond(0.8, 0.3, 0.4, 2.4, '#52b048', -0.3, 0.05, -0.1)];
    for (let i = 0; i < 3; i++) { const a = rng() * 6.283; parts.push(ball(0.2 + rng() * 0.05, i === 0 ? '#7a5a36' : '#5a4026', Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3, 1)); }
    parts.push(put(colored(new THREE.SphereGeometry(0.17, 5, 3, 0, 6.283, 0, Math.PI / 2), '#f4ead0'), 0.5, 0.0, 0.3, 0, [1, 0.8, 1], Math.PI)); // opened half
    return merge(parts);
  },
  dschungelkraut(rng) {
    const parts = [];
    const leaf = ['#3aa860', '#48c070', '#2e8a4a'];
    for (let i = 0; i < 8; i++) {
      const h = 0.7 + rng() * 0.6, a = (i / 8) * 6.28 + rng();
      const g = colored(new THREE.ConeGeometry(0.15, h, 3), leaf[i % 3]);
      recolor(g, (x, y) => tint(leaf[i % 3], 0.6 + (y / h + 0.5) * 0.7));
      put(g, 0, h / 2, 0); put(g, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, a, 1, 0, 0.35 + rng() * 0.3);
      parts.push(g);
    }
    for (let i = 0; i < 3; i++) { const a = rng() * 6.28; parts.push(put(colored(new THREE.OctahedronGeometry(0.11, 0), i === 0 ? '#ff5a7a' : '#ffd24a'), Math.cos(a) * 0.34, 0.85 + rng() * 0.2, Math.sin(a) * 0.34)); }
    return merge(parts);
  },
  gluehpilz(rng) {
    const parts = [put(colored(new THREE.CylinderGeometry(0.62, 0.7, 0.04, 8), '#1e3a22'), 0, 0.02, 0)];
    const caps = ['#40f0d0', '#68ffa8', '#30c8e8'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28 + rng() * 0.4, h = 0.25 + rng() * 0.3, r = 0.2 + rng() * 0.12, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4;
      parts.push(put(colored(new THREE.CylinderGeometry(0.05, 0.08, h, 4), '#d8e8d0'), x, h / 2, z));
      const c = colored(new THREE.SphereGeometry(r, 5, 3, 0, 6.283, 0, Math.PI / 2), caps[i % 3]);
      recolor(c, (px, py) => tint(caps[i % 3], 0.8 + Math.max(0, py / r) * 0.5));
      parts.push(put(c, x, h, z, 0, [1, 0.75, 1]));
    }
    return merge(parts);
  },
  // Futter des Mampfaffen: laut und eindeutig, schon von weitem an der Farbe zu erkennen
  feuerpilz(rng) {
    const parts = [put(colored(new THREE.CylinderGeometry(0.62, 0.7, 0.04, 8), '#3a1a10'), 0, 0.02, 0)];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + rng() * 0.5, h = 0.35 + rng() * 0.3, r = 0.28 + rng() * 0.12, x = Math.cos(a) * 0.38, z = Math.sin(a) * 0.38;
      parts.push(put(colored(new THREE.CylinderGeometry(0.07, 0.1, h, 4), '#f0e0c0'), x, h / 2, z));
      const c = colored(new THREE.SphereGeometry(r, 6, 3, 0, 6.283, 0, Math.PI / 2), '#ff3a1a');
      recolor(c, (px, py) => tint('#ff3a1a', 0.85 + Math.max(0, py / r) * 0.5));
      parts.push(put(c, x, h, z, 0, [1, 0.7, 1]));
      for (let j = 0; j < 3; j++) { const b = rng() * 6.28; parts.push(put(colored(new THREE.OctahedronGeometry(0.06, 0), '#ffe14d'), x + Math.cos(b) * r * 0.55, h + r * 0.55, z + Math.sin(b) * r * 0.55)); } // gelbe Punkte
    }
    for (let i = 0; i < 3; i++) { const a = rng() * 6.28; parts.push(put(colored(new THREE.OctahedronGeometry(0.09, 0), '#ff9a2a'), Math.cos(a) * 0.45, 0.95 + rng() * 0.3, Math.sin(a) * 0.45)); } // Glutpunkte
    return merge(parts);
  },
  giftkraut(rng) {
    const parts = [];
    const leaf = ['#a8c030', '#c0d840', '#8aa020'];
    for (let i = 0; i < 9; i++) {
      const h = 0.6 + rng() * 0.6, a = (i / 9) * 6.28 + rng();
      const g = colored(new THREE.ConeGeometry(0.16, h, 3), leaf[i % 3]);
      recolor(g, (x, y) => tint(leaf[i % 3], 0.6 + (y / h + 0.5) * 0.7));
      put(g, 0, h / 2, 0); put(g, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, a, 1, 0, 0.35 + rng() * 0.3);
      parts.push(g);
    }
    parts.push(put(colored(new THREE.OctahedronGeometry(0.2, 0), '#9a30d0'), 0, 1.05, 0)); // violette Giftbluete
    for (let i = 0; i < 4; i++) { const a = i * 1.57; parts.push(put(colored(new THREE.OctahedronGeometry(0.11, 0), '#c060ff'), Math.cos(a) * 0.26, 0.95, Math.sin(a) * 0.26)); }
    return merge(parts);
  },
  glitchpilz(rng) {
    const parts = [put(colored(new THREE.CylinderGeometry(0.62, 0.7, 0.04, 8), '#050a05'), 0, 0.02, 0)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rng() * 0.4, h = 0.3 + rng() * 0.4, r = 0.22 + rng() * 0.12, x = Math.cos(a) * 0.4, z = Math.sin(a) * 0.4;
      parts.push(put(colored(new THREE.CylinderGeometry(0.05, 0.08, h, 4), '#0b140b'), x, h / 2, z)); // schwarzer Stiel
      const c = colored(new THREE.SphereGeometry(r, 5, 3, 0, 6.283, 0, Math.PI / 2), i % 2 ? '#39ff14' : '#7dff3a');
      recolor(c, (px, py) => tint(i % 2 ? '#39ff14' : '#7dff3a', 0.85 + Math.max(0, py / r) * 0.6));
      parts.push(put(c, x, h, z, 0, [1, 0.75, 1]));
    }
    parts.push(box(0.5, 0.05, 0.05, '#d8ffd0', 0, 1.0, 0, 0)); parts.push(box(0.05, 0.5, 0.05, '#d8ffd0', 0, 1.0, 0, 0)); // Pixel-Kreuz ueber dem Pilz
    return merge(parts);
  },
  tempelstein(rng) {
    const parts = [put(colored(new THREE.DodecahedronGeometry(0.5, 0), '#6a7a70'), 0, 0.34, 0, rng() * 6, [1.1, 0.8, 1])];
    parts.push(box(0.5, 0.06, 0.04, '#58ffd0', 0, 0.45, 0.46, 0)); parts.push(box(0.06, 0.4, 0.04, '#58ffd0', 0, 0.45, 0.47, 0));
    parts.push(put(colored(new THREE.OctahedronGeometry(0.14, 0), '#7affe0'), 0.35, 0.7, 0.1, rng() * 3));
    parts.push(box(0.4, 0.2, 0.35, '#5e6e64', -0.55, 0.1, 0.2, rng() * 3));
    return merge(parts);
  },
};

export { shell, box, seg, frond, ball };
