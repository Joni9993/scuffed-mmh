import * as THREE from 'three';
import { colored, recolor, put, merge, bakeShade } from './props.js';

const J = (rng, a) => (rng() - 0.5) * a;
const box = (w, h, d, color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) =>
  put(colored(new THREE.BoxGeometry(w, h, d), color), x, y, z, ry, 1, rx, rz);

/** Jagged mountain crag: stacked tilted blocks with sharp angles. */
export function cragGeo(rng, s = 1.0, baseCol = '#383e4c', topCol = '#566074') {
  const parts = [];
  const n = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const w = (2.0 + rng() * 2.2) * s;
    const h = (1.5 + rng() * 3.0) * s;
    const d = (2.0 + rng() * 2.2) * s;
    const col = i === n - 1 ? topCol : baseCol;
    parts.push(
      box(
        w,
        h,
        d,
        col,
        J(rng, 1.2 * s),
        (h * 0.5 + i * 1.2) * s,
        J(rng, 1.2 * s),
        rng() * 6.28,
        J(rng, 0.4),
        J(rng, 0.4)
      )
    );
  }
  return bakeShade(merge(parts), 0.5);
}

/** Sharp needle spire rising high. */
export function spireGeo(rng, h = 8, color = '#2c3240') {
  const g = colored(new THREE.ConeGeometry(0.8 + rng() * 0.6, h, 5), color);
  g.translate(0, h / 2, 0);
  recolor(g, (x, y) => (y > h * 0.75 ? '#7a8ba6' : null));
  return bakeShade(g, 0.55);
}

/** Frost pine: gnarled trunk with layered flat needle tiers and frost rims. */
export function frostPineGeo(rng, h = 6) {
  const parts = [];
  const trunkCol = '#2a221d';
  const needleCol = '#223832';
  const frostCol = '#9dc4be';

  // Trunk
  const r = 0.35 + h * 0.02;
  const trunk = colored(new THREE.CylinderGeometry(r * 0.6, r, h * 0.4, 5), trunkCol);
  trunk.translate(0, (h * 0.4) / 2, 0);
  parts.push(trunk);

  // Needle cones / layers
  const tiers = 3 + ((rng() * 2) | 0);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const tierH = h * (0.35 - t * 0.05);
    const tierR = (2.2 - t * 1.3) * (0.8 + rng() * 0.4);
    const y = h * (0.3 + t * 0.6);
    const cone = colored(new THREE.ConeGeometry(tierR, tierH, 5), t > 0.5 ? frostCol : needleCol);
    cone.translate(0, y, 0);
    parts.push(cone);
  }
  return bakeShade(merge(parts), 0.6);
}

/** Glitch Monolith: Dark obsidian slab with glowing neon circuit trim. */
export function glitchMonolithGeo(rng, h = 7) {
  const parts = [];
  const base = box(1.8, h, 0.7, '#14101e', 0, h / 2, 0, J(rng, 0.3), J(rng, 0.15));
  parts.push(base);

  // Neon glowing circuit slabs / ribs
  const neonCol = rng() < 0.5 ? '#00f0ff' : '#ff007f';
  const ribs = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < ribs; i++) {
    const y = h * (0.2 + (i / ribs) * 0.7);
    const rib = box(1.9, 0.1, 0.75, neonCol, 0, y, 0, J(rng, 0.2));
    parts.push(rib);
  }
  return merge(parts);
}

/** Floating Glitch Rubble: Suspended cubes hovering with cyan/magenta drift. */
export function floatingRubbleGeo(rng, r = 2.0) {
  const parts = [];
  const n = 4 + ((rng() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const s = 0.4 + rng() * 0.8;
    const col = rng() < 0.4 ? '#00f0ff' : rng() < 0.7 ? '#ff007f' : '#2a2238';
    const x = J(rng, r * 2);
    const y = 1.5 + rng() * 3.5;
    const z = J(rng, r * 2);
    parts.push(box(s, s, s, col, x, y, z, rng() * 6.28, J(rng, 0.8), J(rng, 0.8)));
  }
  return merge(parts);
}

/** Data Crystal: Sharp prismatic spikes growing from rock. */
export function dataCrystalGeo(rng, s = 1.0) {
  const parts = [];
  const colors = ['#00f0ff', '#7000ff', '#ff007f', '#39ff14'];
  const n = 3 + ((rng() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const col = colors[(rng() * colors.length) | 0];
    const h = (1.5 + rng() * 2.0) * s;
    const r = (0.25 + rng() * 0.25) * s;
    const spike = colored(new THREE.ConeGeometry(r, h, 4), col);
    spike.translate(0, h / 2, 0);
    put(spike, J(rng, 0.6 * s), 0, J(rng, 0.6 * s), rng() * 6.28, 1, J(rng, 0.5), J(rng, 0.5));
    parts.push(spike);
  }
  return merge(parts);
}

/** Frost grass tufts. */
export function frostGrassTuft(rng, s = 0.8) {
  const parts = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const blade = box(0.12 * s, (0.8 + rng() * 0.5) * s, 0.05 * s, '#8ab8d0', J(rng, 0.4 * s), 0.4 * s, J(rng, 0.4 * s), (i / n) * Math.PI + J(rng, 0.3), J(rng, 0.3));
    parts.push(blade);
  }
  return merge(parts);
}

/** Inlaid stone border. The heightfield supplies the playable floor. */
export function summitDaisGeo(r = 16) {
  const border = colored(new THREE.RingGeometry(r - 1.2, r, 48), '#8892a6');
  border.rotateX(-Math.PI / 2);
  return border;
}

/** Neon rune circuit ring for the summit dais. */
export function summitCircuitGeo(r = 12) {
  const parts = [];
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Glowing neon pad
    const pad = box(1.2, 0.025, 0.8, '#669eae', x, 0, z, -a);
    parts.push(pad);
  }
  return merge(parts);
}

/** Broken digital archway framing the arena entrance. */
export function glitchArchGeo(rng, w = 12, h = 9) {
  const parts = [];
  const pCol = '#1a1424';
  const neonCol = '#00f0ff';

  // Left & right pillars
  parts.push(box(1.8, h, 1.8, pCol, -w / 2, h / 2, 0));
  parts.push(box(1.8, h * 0.75, 1.8, pCol, w / 2, (h * 0.75) / 2, 0)); // right one is broken/shorter

  // Broken lintel
  const lintel = box(w * 0.65, 1.4, 1.6, pCol, -w * 0.15, h, 0, 0, 0, -0.15);
  parts.push(lintel);

  // Glowing rune bands
  parts.push(box(2.0, 0.2, 2.0, neonCol, -w / 2, h * 0.6, 0));
  parts.push(box(2.0, 0.2, 2.0, '#ff007f', w / 2, h * 0.4, 0));

  return bakeShade(merge(parts), 0.55);
}

// -------------------------------------------------------------------------
// VISTAS (Deep Lookdown Homage into the Valleys of the previous maps)
// Placed far below in the abyss (y approx -80 to -110)
// -------------------------------------------------------------------------

/** South Vista: Schotterklamm mesa & desert towers proxy. */
export function schotterklammVistaGeo() {
  const parts = [];
  // Flat desert canyon mesas
  const mesaCol = '#a87848';
  const shadowCol = '#6a4a2a';
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 45;
    const z = -60 - (i % 3) * 25;
    const w = 35 + (i % 2) * 15;
    const h = 25 + (i % 3) * 12;
    const d = 30;
    parts.push(box(w, h, d, i % 2 ? mesaCol : shadowCol, x, h / 2, z, 0.1 * i));
    // Bone pillar spike
    const spike = colored(new THREE.ConeGeometry(3, 18, 4), '#e2d8c0');
    spike.translate(x + 10, h + 9, z);
    parts.push(spike);
  }
  return bakeShade(merge(parts), 0.5);
}

/** West Vista: Rostwerke industrial cooling tower and smokestacks proxy. */
export function rostwerkeVistaGeo() {
  const parts = [];
  const rustCol = '#7a4228';
  const darkCol = '#3a2418';

  for (let i = 0; i < 5; i++) {
    const x = -70 - (i % 3) * 30;
    const z = (i - 2) * 40;
    // Massive cooling tower
    const tower = colored(new THREE.CylinderGeometry(14, 18, 40, 8), darkCol);
    tower.translate(x, 20, z);
    parts.push(tower);

    // Chimneys
    const stack = colored(new THREE.CylinderGeometry(2, 2.5, 55, 6), rustCol);
    stack.translate(x + 15, 27, z + 8);
    parts.push(stack);

    // Girders / factory block
    parts.push(box(30, 16, 25, rustCol, x - 10, 8, z - 10));
  }
  return bakeShade(merge(parts), 0.45);
}

/** East Vista: Smaragdküste tropical ocean & jungle silhouette proxy. */
export function smaragdkuesteVistaGeo() {
  const parts = [];
  const seaCol = '#1a8a9a';
  const islandCol = '#2a6a38';

  // Ocean plane chunk
  const ocean = colored(new THREE.BoxGeometry(220, 4, 160), seaCol);
  ocean.translate(70, -2, 0);
  parts.push(ocean);

  // Jungle island mounds
  for (let i = 0; i < 7; i++) {
    const x = 50 + (i % 3) * 35;
    const z = (i - 3) * 35;
    const mound = colored(new THREE.ConeGeometry(16 + (i % 2) * 8, 20, 6), islandCol);
    mound.translate(x, 8, z);
    parts.push(mound);
  }
  return bakeShade(merge(parts), 0.55);
}

// -------------------------------------------------------------------------
// GATHER BUILDERS (for placeGlitchgratPoints)
// -------------------------------------------------------------------------
export const GG_BUILDERS = {
  graterz(rng) {
    const parts = [];
    const rock = colored(new THREE.DodecahedronGeometry(0.65, 0), '#404858');
    put(rock, 0, 0.4, 0, rng() * 6.28, [1.1, 0.8, 1.0]);
    parts.push(rock);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + rng() * 0.4;
      const crystal = colored(new THREE.OctahedronGeometry(0.18, 0), i % 2 ? '#00f0ff' : '#9d4edd');
      put(crystal, Math.cos(a) * 0.45, 0.4 + J(rng, 0.2), Math.sin(a) * 0.45, a);
      parts.push(crystal);
    }
    return merge(parts);
  },
  frostkraut(rng) {
    const parts = [];
    const leaf = ['#4a8aa0', '#6aa8c0', '#3a6a80'];
    for (let i = 0; i < 7; i++) {
      const h = 0.6 + rng() * 0.5, a = (i / 7) * 6.28 + rng();
      const g = colored(new THREE.ConeGeometry(0.12, h, 3), leaf[i % 3]);
      put(g, 0, h / 2, 0);
      put(g, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, a, 1, 0, 0.35 + rng() * 0.25);
      parts.push(g);
    }
    for (let i = 0; i < 3; i++) {
      const a = rng() * 6.28;
      parts.push(put(colored(new THREE.OctahedronGeometry(0.1, 0), '#d8f4ff'), Math.cos(a) * 0.25, 0.75 + rng() * 0.2, Math.sin(a) * 0.25));
    }
    return merge(parts);
  },
  glitchkristall(rng) {
    const parts = [];
    parts.push(put(colored(new THREE.CylinderGeometry(0.55, 0.65, 0.05, 7), '#1a1424'), 0, 0.02, 0));
    const colors = ['#00f0ff', '#ff007f', '#39ff14', '#00f0ff'];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + rng() * 0.3;
      const h = 0.5 + rng() * 0.5;
      const spike = colored(new THREE.ConeGeometry(0.14, h, 4), colors[i % colors.length]);
      put(spike, Math.cos(a) * 0.35, h / 2, Math.sin(a) * 0.35, a, 1, J(rng, 0.3), J(rng, 0.3));
      parts.push(spike);
    }
    return merge(parts);
  },
  sternenstein(rng) {
    const parts = [];
    const base = colored(new THREE.IcosahedronGeometry(0.5, 0), '#140c1e');
    put(base, 0, 0.3, 0, rng() * 6.28, [1.2, 0.7, 1.1]);
    parts.push(base);
    const gem = colored(new THREE.OctahedronGeometry(0.24, 0), '#f72585');
    put(gem, 0, 0.55, 0, rng() * 6.28);
    parts.push(gem);
    return merge(parts);
  },
};
