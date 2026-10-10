import * as THREE from 'three';
import { SLOTS } from '../../data/armor.js';
import { armorSets, setTier, tierScale } from '../../data/gearlook.js';
import { bar, spike, tri } from '../../render/gearfx.js';

// [G] Procedural low-poly armor (GDD 8.6). Every set has its own silhouette per slot; add-ons grow with the set's tier
// (k = tierScale) and light up (glow) from tier 2. Pieces only add vertex-coloured boxes/pyramids to the per-joint
// GearParts, so a whole outfit costs ZERO extra draw calls (the 6 joint meshes stay merged).
// Joint-local frames: face = +z, left arm / leg = +x. torso: chest y 0.15..0.85, belt y -0.1..0.2; head box y 0..0.46;
// arm: shoulder at y 0, hand at y -0.78; leg: hip y 0, boot y -0.8.

const PI = Math.PI;
export const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const mix = (a, b, f) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), f).getHexString();

/** Always-present naked hunter body (tunic in the player colour, skin, leather pants, boots). */
export function buildBody(P, col) {
  P.torso.box(0.75, 0.3, 0.42, '#7a4a2a', { y: 0.05 });
  P.torso.box(0.78, 0.7, 0.46, col, { y: 0.5 });
  P.head.box(0.46, 0.46, 0.46, '#e8b088', { y: 0.23 });
  P.head.box(0.12, 0.08, 0.04, '#101010', { y: 0.28, z: 0.24 });
  for (const arm of [P.armR, P.armL]) {
    arm.box(0.24, 0.7, 0.26, col, { y: -0.35 });
    arm.box(0.2, 0.2, 0.2, '#e8b088', { y: -0.78 });
  }
  for (const leg of [P.legR, P.legL]) {
    leg.box(0.3, 0.85, 0.32, '#7a4a2a', { y: -0.42 });
    leg.box(0.32, 0.14, 0.46, '#2a1a10', { y: -0.8, z: 0.07 });
  }
}

const arms = (c, fn) => { fn(c.P.armR, -1); fn(c.P.armL, 1); };
const legs = (c, fn) => { fn(c.P.legR, -1); fn(c.P.legL, 1); };
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** Tilted lumpy blob (mud crust / fur tuft / patch) */
const lump = (P, color, x, y, z, s, i = 0, at = {}) => P.box(s * (0.8 + hash(i) * 0.5), s * (0.7 + hash(i + 3) * 0.5), s * (0.8 + hash(i + 7) * 0.5), color, { x, y, z, ry: hash(i + 1) * 3, rx: (hash(i + 2) - 0.5) * 0.7, ...at });

// ======================================================================= LUMPEN (tier 0): cloth + patches
const lumpen = {
  head(c) {
    const { head } = c.P;
    head.cone(0.34, 0.5, 4, c.col, { y: 0.55, z: -0.04, ry: PI / 4 });
    head.box(0.5, 0.08, 0.5, shade(c.col, 0.75), { y: 0.42 });
    head.box(0.1, 0.1, 0.03, '#b0904a', { x: 0.14, y: 0.55, z: 0.12, ry: 0.8 });
    head.box(0.1, 0.34, 0.1, shade(c.col, 0.85), { y: 0.5, z: -0.34, rx: 0.4 }); // drooping hood tail
  },
  body(c) {
    const { torso } = c.P;
    torso.box(0.8, 0.07, 0.48, '#a08a5a', { y: 0.2 }); // rope belt
    torso.box(0.22, 0.22, 0.02, '#b0904a', { x: 0.2, y: 0.58, z: 0.235 });
    torso.box(0.18, 0.16, 0.02, '#6a5a7a', { x: -0.18, y: 0.34, z: 0.235 });
    for (let i = 0; i < 5; i++) torso.box(0.12, 0.2 + hash(i) * 0.12, 0.04, shade(c.col, 0.7), { x: -0.3 + i * 0.15, y: -0.02, z: 0.22 }); // ragged hem
    arms(c, (a, o) => {
      a.box(0.1, 0.14, 0.02, '#8a6a3a', { x: o * 0.0, y: -0.3, z: 0.135 });
      a.box(0.27, 0.07, 0.29, '#a08a5a', { y: -0.62 }); // rope cuff
    });
  },
  legs(c) {
    legs(c, (l) => {
      l.box(0.18, 0.18, 0.02, '#b0904a', { x: 0.02, y: -0.3, z: 0.165 });
      l.box(0.34, 0.08, 0.36, shade(c.col, 0.9), { y: -0.62 });
      l.box(0.08, 0.14, 0.04, shade(c.col, 0.9), { x: 0.1, y: -0.72, z: 0.17 });
    });
  },
};

// ======================================================================= FELLKLUFT (tier 1): fur
const FUR = ['#8a6a44', '#a98458', '#d8c49a', '#5a4026'];
const fellkluft = {
  head(c) {
    const { head } = c.P, k = c.k;
    head.box(0.54, 0.2 * k, 0.54, FUR[0], { y: 0.5 });
    head.box(0.58, 0.12, 0.58, FUR[2], { y: 0.4 });
    for (let i = 0; i < 6; i++) lump(head, FUR[i % 2 ? 1 : 3], -0.22 + (i % 3) * 0.22, 0.62 + hash(i) * 0.06, i < 3 ? 0.12 : -0.12, 0.12 * k, i);
    for (const o of [-1, 1]) {
      head.cone(0.1 * k, 0.24 * k, 4, FUR[0], { x: o * 0.2, y: 0.7 * k, z: -0.06, rz: -o * 0.25, ry: PI / 4 });
      head.cone(0.05, 0.14, 4, FUR[2], { x: o * 0.2, y: 0.7 * k - 0.02, z: 0.0, rz: -o * 0.25, ry: PI / 4 });
      head.box(0.08, 0.26, 0.14, FUR[2], { x: o * 0.29, y: 0.22, z: 0.0 }); // ear flaps
    }
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    torso.box(0.86, 0.5, 0.52, FUR[0], { y: 0.5 });
    torso.box(0.94, 0.2 * k, 0.64, FUR[2], { y: 0.88 }); // big collar
    for (let i = 0; i < 8; i++) lump(torso, FUR[i % 3 === 0 ? 3 : 1], -0.4 + i * 0.115, 0.92 + (i % 2) * 0.06, 0.3 * (i % 2 ? 1 : -1), 0.12 * k, i + 20);
    for (let i = 0; i < 6; i++) torso.cone(0.07, 0.2 + hash(i) * 0.1, 4, FUR[i % 2 ? 0 : 1], { x: -0.33 + i * 0.132, y: 0.18, z: 0.26, rx: PI, ry: PI / 4 }); // hem tufts
    arms(c, (a, o) => {
      a.box(0.38 * k, 0.2 * k, 0.4 * k, FUR[2], { y: 0.0 });
      for (let i = 0; i < 3; i++) lump(a, FUR[1], o * (0.04 + i * 0.05), 0.1 * k, (i - 1) * 0.12, 0.1 * k, i + 40);
      a.box(0.3, 0.14, 0.32, FUR[2], { y: -0.66 });
    });
  },
  legs(c) {
    legs(c, (l) => {
      l.box(0.42, 0.34, 0.56, FUR[0], { y: -0.7, z: 0.05 });
      l.box(0.44, 0.12, 0.46, FUR[2], { y: -0.52 });
      for (let i = 0; i < 4; i++) lump(l, FUR[1], -0.15 + i * 0.1, -0.5, 0.2, 0.09, i + 60);
      l.box(0.34, 0.1, 0.34, FUR[2], { y: -0.08 });
    });
  },
};

// ======================================================================= KNOCHENKRAM (tier 1): bone
const BONE = ['#e8dcc0', '#d6c8a6', '#a89878', '#2a2218'];
const knochenkram = {
  head(c) {
    const { head } = c.P, k = c.k;
    head.box(0.58, 0.32, 0.58, BONE[0], { y: 0.4 });
    head.box(0.6, 0.06, 0.6, BONE[2], { y: 0.54 });
    for (const o of [-1, 1]) {
      head.box(0.14, 0.14, 0.05, BONE[3], { x: o * 0.14, y: 0.42, z: 0.29 }); // eye sockets
      bar(head, [o * 0.3, 0.46, 0.0], [o * 0.46 * k, 0.66 * k, 0.0], 0.07, 0.01, BONE[1]); // tusk-horns
      head.box(0.08, 0.2, 0.06, BONE[1], { x: o * 0.29, y: 0.2, z: 0.1 }); // cheek bone
    }
    head.cone(0.05, 0.1, 4, BONE[3], { y: 0.34, z: 0.3, rx: PI, ry: PI / 4 });
    for (let i = 0; i < 4; i++) head.box(0.07, 0.09, 0.05, BONE[0], { x: -0.12 + i * 0.08, y: 0.22, z: 0.285 }); // teeth over the face
    head.box(0.16 * k, 0.1 * k, 0.5, BONE[2], { y: 0.58 + 0.04 * k }); // brow ridge on top
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    for (let i = 0; i < 3; i++) torso.box(0.72 - i * 0.04, 0.07, 0.06, BONE[i % 2], { y: 0.66 - i * 0.16, z: 0.245 }); // ribs
    torso.box(0.07, 0.5, 0.06, BONE[1], { y: 0.5, z: 0.25 });
    torso.box(0.08, 0.8, 0.02, '#7a4a2a', { x: 0.16, y: 0.5, z: 0.236, rz: 0.6 }); // strap
    for (let i = 0; i < 3; i++) spike(torso, [0, 0.45 + i * 0.15, -0.23], [0, 0.55 + i * 0.15 + 0.08 * k, -0.36 - 0.04 * k], 0.05, BONE[0]); // spine
    arms(c, (a, o) => {
      a.box(0.36 * k, 0.1, 0.4 * k, BONE[0], { x: o * 0.04, y: 0.06 });
      spike(a, [o * 0.1, 0.1, 0], [o * (0.2 + 0.1 * k), 0.1 + 0.3 * k, 0], 0.07 * k, BONE[1]);
      a.box(0.1, 0.4, 0.05, BONE[1], { y: -0.5, z: 0.135 }); // vambrace bone
    });
  },
  legs(c) {
    legs(c, (l, o) => {
      l.box(0.2, 0.42, 0.07, BONE[0], { y: -0.55, z: 0.195 });
      l.box(0.24, 0.17, 0.17, BONE[1], { y: -0.26, z: 0.2 });
      spike(l, [0, -0.26, 0.28], [0, -0.26, 0.28 + 0.12 * c.k], 0.05, BONE[0]);
      l.box(0.3, 0.06, 0.34, BONE[2], { y: -0.7 });
    });
  },
};

// ======================================================================= JAGGO (tier 2): purple scales, orange crest
const JP = ['#5b4fb3', '#3f3590', '#2c2470', '#e8873a', '#ffb04a'];
const jaggo = {
  head(c) {
    const { head } = c.P, k = c.k, g = 0.25;
    head.box(0.54, 0.28, 0.54, JP[0], { y: 0.45 });
    head.box(0.56, 0.05, 0.56, JP[3], { y: 0.33 });
    for (const o of [-1, 1]) {
      head.box(0.06, 0.24, 0.3, JP[1], { x: o * 0.28, y: 0.2, z: 0.0 }); // cheek guards
      head.box(0.07, 0.06, 0.2, JP[3], { x: o * 0.29, y: 0.34, z: 0.0 });
    }
    head.box(0.06, 0.24, 0.05, JP[3], { y: 0.28, z: 0.265 }); // nose guard
    // crest: stepped fins front -> back, orange then purple, taller with tier
    const hs = [0.2, 0.3, 0.42, 0.34, 0.22];
    for (let i = 0; i < 5; i++) {
      const h = hs[i] * k, z = 0.22 - i * 0.12;
      head.box(0.07, h, 0.11, i < 3 ? JP[3] : JP[0], { y: 0.58 + h / 2 - 0.02, z, rx: -0.25, glow: i < 3 ? g : 0 });
      head.box(0.075, 0.04, 0.12, JP[4], { y: 0.58 + h - 0.02, z, rx: -0.25, glow: g * 2 });
    }
  },
  body(c) {
    const { torso } = c.P, k = c.k, g = 0.2;
    for (let i = 0; i < 4; i++) {
      torso.box(0.82, 0.13, 0.5, i % 2 ? JP[1] : JP[0], { y: 0.24 + i * 0.16, z: 0.01 + (i % 2) * 0.01 });
      torso.box(0.83, 0.025, 0.51, JP[3], { y: 0.31 + i * 0.16, z: 0.01, glow: g });
    }
    for (let i = 0; i < 4; i++) torso.box(0.1, 0.1, 0.03, JP[2], { x: -0.27 + i * 0.18, y: 0.4 + (i % 2) * 0.16, z: 0.265, rz: PI / 4 });
    for (let i = 0; i < 3; i++) { // dorsal fins
      const h = (0.22 + i * 0.05) * k;
      torso.box(0.06, h, 0.2, JP[3], { y: 0.45 + i * 0.17, z: -0.33, rx: 0.3, glow: g });
    }
    arms(c, (a, o) => {
      a.box(0.3, 0.07, 0.34, JP[1], { x: o * 0.02, y: 0.08 });
      a.box(0.38, 0.07, 0.42, JP[0], { x: o * 0.05, y: 0.15 });
      a.box(0.4, 0.025, 0.43, JP[3], { x: o * 0.05, y: 0.19, glow: g });
      spike(a, [o * 0.18, 0.18, 0], [o * (0.3 + 0.12 * k), 0.18 + 0.28 * k, -0.04], 0.07 * k, JP[3], { glow: g * 2 });
      a.box(0.29, 0.1, 0.31, JP[1], { y: -0.5 });
      a.box(0.3, 0.025, 0.32, JP[3], { y: -0.44, glow: g });
    });
  },
  legs(c) {
    const g = 0.2;
    legs(c, (l) => {
      for (let i = 0; i < 3; i++) {
        l.box(0.35, 0.11, 0.37, i % 2 ? JP[1] : JP[0], { y: -0.28 - i * 0.14 });
        l.box(0.355, 0.025, 0.375, JP[3], { y: -0.22 - i * 0.14, glow: g });
      }
      for (let i = -1; i <= 1; i++) spike(l, [i * 0.09, -0.8, 0.28], [i * 0.1, -0.8, 0.28 + 0.16 * c.k], 0.04, JP[4]); // claws
    });
  },
};

// ======================================================================= BARROTZ (tier 3): thick plates, mud crusts
const BZ = ['#7a7360', '#4e493c', '#a39b84', '#7e6240', '#5a4630', '#ff7a2a'];
const barrotz = {
  head(c) {
    const { head } = c.P, k = c.k;
    head.box(0.64, 0.56, 0.64, BZ[0], { y: 0.27 });
    head.box(0.7, 0.1, 0.7, BZ[2], { y: 0.54 });
    head.box(0.14, 0.12 * k, 0.66, BZ[1], { y: 0.62 + 0.04 * k });
    head.box(0.5, 0.06, 0.04, BZ[1], { y: 0.3, z: 0.325 });
    head.box(0.4, 0.035, 0.045, BZ[5], { y: 0.3, z: 0.33, glow: 0.8 }); // glowing slit
    head.box(0.44, 0.16, 0.1, BZ[1], { y: 0.07, z: 0.31 }); // chin guard
    for (const o of [-1, 1]) {
      spike(head, [o * 0.3, 0.52, 0.06], [o * (0.34 + 0.1 * k), 0.52 + 0.2 * k, 0.04], 0.11, BZ[2]);
      head.box(0.05, 0.4, 0.06, BZ[2], { x: o * 0.33, y: 0.26, z: 0.2 });
    }
    for (let i = 0; i < 7; i++) lump(head, BZ[i % 2 ? 3 : 4], -0.28 + hash(i) * 0.56, 0.1 + hash(i + 9) * 0.5, hash(i + 4) > 0.5 ? 0.32 : -0.32, 0.13, i + 80);
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    torso.box(1.0, 0.72, 0.66, BZ[0], { y: 0.5 });
    torso.box(1.02, 0.08, 0.68, BZ[2], { y: 0.86 });
    for (let i = 0; i < 3; i++) torso.box(1.03, 0.05, 0.67, BZ[1], { y: 0.28 + i * 0.2 });
    torso.box(0.9, 0.62, 0.12, BZ[1], { y: 0.5, z: -0.38 });
    for (let i = 0; i < 4; i++) torso.box(0.06, 0.06, 0.04, BZ[2], { x: -0.36 + i * 0.24, y: 0.7, z: 0.34 }); // rivets
    torso.box(0.2, 0.2, 0.05, BZ[2], { y: 0.5, z: 0.35 }); // boss
    for (let i = 0; i < 8; i++) lump(torso, i % 2 ? BZ[3] : BZ[4], -0.4 + hash(i) * 0.8, 0.12 + hash(i + 5) * 0.3, 0.31 * (hash(i + 2) > 0.4 ? 1 : -1.1), 0.15, i + 100);
    arms(c, (a, o) => {
      a.box(0.6 * k * 0.8, 0.26, 0.64, BZ[0], { x: o * 0.12, y: 0.08 });
      a.box(0.52 * k * 0.8, 0.16, 0.54, BZ[2], { x: o * 0.14, y: 0.26 });
      a.box(0.4, 0.04, 0.4, BZ[1], { x: o * 0.14, y: 0.35 });
      for (let i = 0; i < 3; i++) lump(a, BZ[i % 2 ? 3 : 4], o * (0.1 + i * 0.1), 0.38, (i - 1) * 0.16, 0.14, i + 140);
      a.box(0.32, 0.34, 0.34, BZ[0], { y: -0.5 });
      a.box(0.34, 0.05, 0.36, BZ[2], { y: -0.32 });
    });
  },
  legs(c) {
    legs(c, (l) => {
      l.box(0.4, 0.56, 0.44, BZ[0], { y: -0.5 });
      l.box(0.34, 0.2, 0.2, BZ[2], { y: -0.27, z: 0.22 });
      l.box(0.44, 0.06, 0.46, BZ[1], { y: -0.2 });
      l.box(0.44, 0.2, 0.58, BZ[1], { y: -0.76, z: 0.06 });
      for (let i = 0; i < 5; i++) lump(l, i % 2 ? BZ[3] : BZ[4], -0.16 + hash(i) * 0.32, -0.6 - hash(i + 3) * 0.2, 0.2, 0.13, i + 160);
    });
  },
};

// ======================================================================= BRATHALOS (tier 4): red scales, horns, wing cape
const BR = ['#c0281c', '#7a1812', '#e8442a', '#ff8a2a', '#ffd060', '#e8d8b0', '#8a1a14', '#1a1010'];
const brathalos = {
  head(c) {
    const { head } = c.P, k = c.k;
    head.box(0.56, 0.42, 0.56, BR[0], { y: 0.32 });
    head.box(0.58, 0.07, 0.58, BR[1], { y: 0.54 });
    head.box(0.5, 0.17, 0.05, BR[7], { y: 0.28, z: 0.285 }); // visor mask
    head.box(0.4, 0.055, 0.05, '#ffe070', { y: 0.3, z: 0.295, glow: 1 }); // glowing visor slit
    head.box(0.4, 0.1, 0.07, BR[1], { y: 0.08, z: 0.27 });
    for (let i = 0; i < 3; i++) {
      const h = (0.18 + (i === 1 ? 0.12 : 0)) * k;
      head.box(0.06, h, 0.12, BR[2], { y: 0.58 + h / 2, z: 0.1 - i * 0.14, rx: -0.3, glow: 0.3 });
      head.box(0.065, 0.05, 0.13, BR[4], { y: 0.58 + h, z: 0.1 - i * 0.14, rx: -0.3, glow: 1 });
    }
    for (const o of [-1, 1]) { // swept-back horns
      const s = 1 + 0.15 * k;
      const p0 = [o * 0.24, 0.46, 0.02], p1 = [o * 0.36 * s, 0.7 * s, -0.04], p2 = [o * 0.34 * s, 0.98 * s, -0.3 * s], p3 = [o * 0.22 * s, 1.08 * s, -0.62 * s];
      bar(head, p0, p1, 0.095, 0.075, BR[5]);
      bar(head, p1, p2, 0.075, 0.05, BR[5]);
      bar(head, p2, p3, 0.05, 0.0, BR[4], { glow: 0.8 });
      head.box(0.12, 0.1, 0.14, BR[1], { x: o * 0.25, y: 0.48, z: 0.02 });
    }
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    for (let i = 0; i < 4; i++) {
      torso.box(0.84, 0.14, 0.52, i % 2 ? BR[1] : BR[0], { y: 0.22 + i * 0.16 });
      torso.box(0.85, 0.03, 0.53, BR[3], { y: 0.3 + i * 0.16, glow: 0.45 });
    }
    torso.box(0.2, 0.26, 0.05, BR[4], { y: 0.52, z: 0.28, glow: 1 }); // ember core
    torso.box(0.28, 0.34, 0.03, BR[1], { y: 0.52, z: 0.265 });
    // wing cape: struts + membranes
    for (const o of [-1, 1]) {
      const R0 = [o * 0.14, 0.78, -0.28], S1 = [o * 0.85, 1.5, -0.75], S2 = [o * 1.15, 0.95, -0.85], S3 = [o * 0.95, 0.2, -0.7], S4 = [o * 0.3, -0.15, -0.5];
      for (const S of [S1, S2, S3]) bar(torso, R0, S, 0.04, 0.02, BR[5]);
      tri(torso, R0, S1, S2, BR[6], { glow: 0.12 });
      tri(torso, R0, S2, S3, BR[0], { glow: 0.2 });
      tri(torso, R0, S3, S4, BR[1], { glow: 0.08 });
      torso.box(0.14, 0.2, 0.12, BR[1], { x: o * 0.14, y: 0.78, z: -0.28 });
      torso.box(0.07, 0.07, 0.07, BR[4], { x: S1[0], y: S1[1], z: S1[2], glow: 1 });
    }
    arms(c, (a, o) => {
      a.box(0.34, 0.08, 0.38, BR[1], { x: o * 0.02, y: 0.06 });
      a.box(0.44, 0.08, 0.5, BR[0], { x: o * 0.07, y: 0.14 });
      a.box(0.46, 0.03, 0.52, BR[3], { x: o * 0.07, y: 0.19, glow: 0.5 });
      spike(a, [o * 0.2, 0.18, 0.1], [o * (0.4 + 0.12 * k), 0.18 + 0.5 * k, 0.1], 0.1 * k, BR[2], { glow: 0.7 });
      spike(a, [o * 0.22, 0.14, -0.12], [o * (0.52 + 0.1 * k), 0.14 + 0.2 * k, -0.2 - 0.2 * k], 0.08 * k, BR[2], { glow: 0.7 });
      a.box(0.3, 0.3, 0.32, BR[0], { y: -0.5 });
      a.box(0.31, 0.04, 0.33, BR[3], { y: -0.34, glow: 0.5 });
      spike(a, [0, -0.6, 0.16], [0, -0.55, 0.16 + 0.3 * k], 0.06, BR[5], { glow: 0.3 });
    });
  },
  legs(c) {
    const k = c.k;
    legs(c, (l) => {
      for (let i = 0; i < 3; i++) {
        l.box(0.36, 0.13, 0.38, i % 2 ? BR[1] : BR[0], { y: -0.3 - i * 0.14 });
        l.box(0.365, 0.03, 0.385, BR[3], { y: -0.235 - i * 0.14, glow: 0.45 });
      }
      l.box(0.04, 0.4, 0.02, BR[4], { x: 0.0, y: -0.52, z: 0.195, glow: 1 }); // ember crack
      spike(l, [0, -0.22, 0.2], [0, -0.14, 0.2 + 0.4 * k], 0.09, BR[5], { glow: 0.6 }); // knee spike
      for (let i = -1; i <= 1; i++) spike(l, [i * 0.1, -0.8, 0.28], [i * 0.12, -0.84, 0.28 + 0.22 * k], 0.05, BR[5]); // talons
    });
  },
};

// ======================================================================= KROLL (tier 5): Kesselpanzer-Platten, Nieten, Scheren-Schulter, Dampfrohre
const KR = ['#8a4a2a', '#5a2f1c', '#b86a34', '#3e3a38', '#7a7570', '#d89a50', '#ffb050', '#1a1412'];
/** Nietenreihe: n Nieten (x-Abstand dx) auf Höhe y, vorne bei z. */
const rivets = (J, n, dx, y, z, color = KR[5], size = 0.05) => { for (let i = 0; i < n; i++) J.box(size, size, size, color, { x: (i - (n - 1) / 2) * dx, y, z }); };
const kroll = {
  head(c) {
    const { head } = c.P, k = c.k;
    head.box(0.6, 0.5, 0.6, KR[3], { y: 0.3 });
    head.box(0.64, 0.1, 0.64, KR[0], { y: 0.56 });
    head.box(0.64, 0.08, 0.64, KR[1], { y: 0.1 });
    head.box(0.5, 0.15, 0.05, KR[7], { y: 0.3, z: 0.31 }); // Sichtschlitz
    head.box(0.4, 0.05, 0.05, KR[6], { y: 0.3, z: 0.325, glow: 1 });
    rivets(head, 5, 0.12, 0.56, 0.33); rivets(head, 5, 0.12, 0.1, 0.33);
    for (const o of [-1, 1]) { // Augenstiele
      bar(head, [o * 0.2, 0.6, 0.1], [o * 0.28 * k, 0.6 + 0.4 * k, 0.2], 0.05, 0.04, KR[4]);
      head.box(0.1, 0.1, 0.1, KR[6], { x: o * 0.28 * k, y: 0.62 + 0.4 * k, z: 0.2, glow: 1 });
      spike(head, [o * 0.3, 0.3, 0.1], [o * (0.55 + 0.15 * k), 0.34, 0.3 + 0.2 * k], 0.09, KR[2]); // Scheren-Wangen
    }
    head.box(0.14, 0.3 * k, 0.14, KR[4], { x: -0.12, y: 0.6 + 0.15 * k, z: -0.12 }); // Dampfrohr
    head.box(0.18, 0.05, 0.18, KR[6], { x: -0.12, y: 0.62 + 0.3 * k, z: -0.12, glow: 0.8 });
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    for (let i = 0; i < 3; i++) { // Kesselplatten
      torso.box(0.88, 0.22, 0.54, i % 2 ? KR[1] : KR[0], { y: 0.28 + i * 0.22 });
      torso.box(0.9, 0.03, 0.56, KR[3], { y: 0.39 + i * 0.22 });
      rivets(torso, 6, 0.14, 0.3 + i * 0.22, 0.28);
    }
    torso.box(0.26, 0.26, 0.05, KR[3], { y: 0.58, z: 0.29 }); // Manometer
    torso.box(0.18, 0.18, 0.05, KR[6], { y: 0.58, z: 0.31, glow: 1 });
    torso.box(0.5, 0.6, 0.3, KR[3], { y: 0.5, z: -0.38 }); // Rücken-Kessel
    torso.box(0.54, 0.05, 0.34, KR[0], { y: 0.28, z: -0.38 }); torso.box(0.54, 0.05, 0.34, KR[0], { y: 0.72, z: -0.38 });
    for (const o of [-1, 1]) { bar(torso, [o * 0.18, 0.8, -0.4], [o * 0.32, 1.0 + 0.2 * k, -0.45], 0.05, 0.05, KR[4]); torso.box(0.12, 0.06, 0.12, KR[6], { x: o * 0.32, y: 1.02 + 0.2 * k, z: -0.45, glow: 0.8 }); }
    arms(c, (a, o) => { // Scheren-Schulter
      a.box(0.42, 0.1, 0.46, KR[0], { x: o * 0.05, y: 0.08 });
      a.box(0.46, 0.08, 0.5, KR[1], { x: o * 0.07, y: 0.17 });
      rivets(a, 3, 0.12, 0.22, 0.2, KR[5], 0.045);
      spike(a, [o * 0.15, 0.2, 0.18], [o * (0.5 + 0.12 * k), 0.2 + 0.55 * k, 0.4 + 0.2 * k], 0.14 * k, KR[4]);
      spike(a, [o * 0.15, 0.2, 0.0], [o * (0.7 + 0.1 * k), 0.15 + 0.35 * k, 0.1], 0.12 * k, KR[2]);
      a.box(0.32, 0.34, 0.34, KR[3], { y: -0.5 }); a.box(0.34, 0.05, 0.36, KR[0], { y: -0.36 });
    });
  },
  legs(c) {
    const k = c.k;
    legs(c, (l) => {
      for (let i = 0; i < 3; i++) { l.box(0.38, 0.14, 0.4, i % 2 ? KR[1] : KR[0], { y: -0.28 - i * 0.15 }); rivets(l, 3, 0.1, -0.28 - i * 0.15, 0.21, KR[5], 0.04); }
      l.box(0.3, 0.2, 0.12, KR[3], { y: -0.18, z: 0.22 }); // Knieplatte
      spike(l, [0, -0.2, 0.26], [0, -0.1, 0.26 + 0.4 * k], 0.1, KR[4]);
      l.box(0.4, 0.12, 0.5, KR[3], { y: -0.78, z: 0.05 });
      for (const o of [-1, 1]) spike(l, [o * 0.1, -0.8, 0.28], [o * 0.2, -0.86, 0.28 + 0.3 * k], 0.06, KR[2]); // Zehenscheren
      l.box(0.1, 0.22, 0.1, KR[6], { x: 0.17, y: -0.6, z: -0.05, glow: 0.6 }); // Dampfstutzen
    });
  },
};

// ======================================================================= GORGO (tier 5): Segment-Schuppen, Schlacke-Glühen, Wurmmaul-Helm
const GO = ['#3a3430', '#241f1c', '#5a504a', '#ff6a1a', '#ffb040', '#d8c8a0', '#6a2a14', '#120e0c'];
const gorgo = {
  head(c) {
    const { head } = c.P, k = c.k;
    for (let i = 0; i < 3; i++) head.box(0.58 - i * 0.07, 0.17, 0.58 - i * 0.07, i % 2 ? GO[1] : GO[0], { y: 0.12 + i * 0.17 }); // Segmentringe
    head.box(0.62, 0.04, 0.62, GO[3], { y: 0.21, glow: 0.9 }); head.box(0.55, 0.04, 0.55, GO[3], { y: 0.38, glow: 0.9 });
    head.box(0.5, 0.14, 0.05, GO[7], { y: 0.3, z: 0.3 });
    for (const o of [-1, 1]) head.box(0.1, 0.05, 0.05, GO[4], { x: o * 0.12, y: 0.3, z: 0.325, glow: 1 }); // Augen
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.4; spike(head, [Math.sin(a) * 0.3, 0.5, Math.cos(a) * 0.3], [Math.sin(a) * (0.42 + 0.1 * k), 0.5 + 0.1, Math.cos(a) * (0.42 + 0.1 * k) + 0.2 * k], 0.06 + 0.02 * k, GO[5]); } // Zahnkranz
    head.cone(0.2, 0.3 * k, 4, GO[2], { y: 0.7 + 0.1 * k, ry: PI / 4 });
    head.box(0.08, 0.2, 0.08, GO[4], { y: 0.6, glow: 1 });
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    for (let i = 0; i < 5; i++) {
      torso.box(0.86 - Math.abs(i - 2) * 0.03, 0.15, 0.52, i % 2 ? GO[1] : GO[0], { y: 0.22 + i * 0.14 });
      torso.box(0.88, 0.025, 0.54, GO[3], { y: 0.3 + i * 0.14, glow: 0.8 }); // glühende Fugen
    }
    torso.box(0.22, 0.4, 0.05, GO[4], { y: 0.5, z: 0.28, glow: 1 }); // Kern-Riss
    for (let i = 0; i < 6; i++) { // Wurmschwanz-Umhang
      const w = 0.7 - i * 0.09;
      torso.box(w, 0.2, 0.2, i % 2 ? GO[1] : GO[2], { y: 0.7 - i * 0.2, z: -0.36 - i * 0.06 });
      torso.box(w + 0.02, 0.025, 0.22, GO[3], { y: 0.8 - i * 0.2, z: -0.36 - i * 0.06, glow: 0.7 });
    }
    arms(c, (a, o) => {
      a.box(0.4, 0.12, 0.44, GO[0], { x: o * 0.05, y: 0.08 }); a.box(0.36, 0.12, 0.4, GO[2], { x: o * 0.06, y: 0.19 });
      a.box(0.42, 0.025, 0.46, GO[3], { x: o * 0.05, y: 0.14, glow: 0.8 });
      spike(a, [o * 0.2, 0.2, 0.0], [o * (0.4 + 0.1 * k), 0.2 + 0.45 * k, -0.1], 0.1 * k, GO[5]);
      lump(a, GO[1], 0, -0.5, 0.1, 0.34, 11); a.box(0.12, 0.03, 0.2, GO[3], { y: -0.5, z: 0.25, glow: 1 });
    });
  },
  legs(c) {
    const k = c.k;
    legs(c, (l, o) => {
      for (let i = 0; i < 3; i++) { l.box(0.38 - i * 0.02, 0.14, 0.4, i % 2 ? GO[1] : GO[0], { y: -0.28 - i * 0.15 }); l.box(0.4, 0.02, 0.42, GO[3], { y: -0.21 - i * 0.15, glow: 0.8 }); }
      l.box(0.08, 0.4, 0.04, GO[4], { x: o * 0.05, y: -0.5, z: 0.2, glow: 1 });
      for (let i = -1; i <= 1; i++) spike(l, [i * 0.1, -0.8, 0.28], [i * 0.16, -0.86, 0.28 + 0.34 * k], 0.07, GO[5]); // Grabkrallen
      spike(l, [0, -0.2, 0.2], [0, -0.1, 0.2 + 0.3 * k], 0.09, GO[2]);
    });
  },
};

// ======================================================================= VOLTARO (tier 6): Kupfer-Spulen, Funkenbögen, Antennenkamm, Emissive
const VO = ['#b8642a', '#7a3a18', '#e8a050', '#1a1e2a', '#5ad0ff', '#fff0a0', '#2a3050', '#0c0e16'];
/** Funkenbogen: Zickzack-Blitz aus leuchtenden Balken zwischen a und b. */
function arc(J, a, b, n, jag, color = VO[4], w = 0.035, i0 = 0) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n, last = i === n;
    const p = last ? b : [a[0] + (b[0] - a[0]) * t + (hash(i + i0) - 0.5) * jag, a[1] + (b[1] - a[1]) * t + (hash(i + i0 + 5) - 0.5) * jag, a[2] + (b[2] - a[2]) * t + (hash(i + i0 + 9) - 0.5) * jag];
    bar(J, prev, p, w, w, color, { glow: 1 });
    prev = p;
  }
}
const voltaro = {
  head(c) {
    const { head } = c.P, k = c.k;
    head.box(0.58, 0.46, 0.58, VO[3], { y: 0.3 });
    head.box(0.6, 0.07, 0.6, VO[0], { y: 0.54 }); head.box(0.6, 0.07, 0.6, VO[0], { y: 0.1 });
    head.box(0.48, 0.15, 0.05, VO[7], { y: 0.3, z: 0.295 });
    head.box(0.4, 0.06, 0.05, VO[4], { y: 0.3, z: 0.31, glow: 1 }); // Visier
    for (let i = -2; i <= 2; i++) { // Antennenkamm
      const h = (0.28 + (2 - Math.abs(i)) * 0.14) * k;
      bar(head, [i * 0.1, 0.56, -0.05], [i * 0.1 * 1.4, 0.56 + h, -0.12 - Math.abs(i) * 0.04], 0.06, 0.025, VO[2]);
      head.box(0.07, 0.07, 0.07, i % 2 ? VO[5] : VO[4], { x: i * 0.14, y: 0.58 + h, z: -0.12 - Math.abs(i) * 0.04, glow: 1 });
    }
    arc(head, [-0.14, 0.58 + 0.5 * k, -0.12], [0.14, 0.58 + 0.5 * k, -0.12], 3, 0.1, VO[5], 0.03, 3);
    for (const o of [-1, 1]) { head.box(0.14, 0.28, 0.24, VO[0], { x: o * 0.34, y: 0.3 }); head.box(0.15, 0.04, 0.25, VO[4], { x: o * 0.34, y: 0.3, glow: 1 }); } // Seiten-Spulen
  },
  body(c) {
    const { torso } = c.P, k = c.k;
    torso.box(0.84, 0.66, 0.5, VO[3], { y: 0.52 });
    for (let i = 0; i < 5; i++) { torso.box(0.86, 0.07, 0.52, VO[0], { y: 0.28 + i * 0.13 }); torso.box(0.87, 0.02, 0.53, VO[4], { y: 0.33 + i * 0.13, glow: 1 }); } // Kupferspulen-Ringe
    torso.box(0.22, 0.22, 0.05, VO[5], { y: 0.56, z: 0.28, glow: 1 }); torso.box(0.3, 0.3, 0.03, VO[6], { y: 0.56, z: 0.265 });
    for (const o of [-1, 1]) { // Rückenspulen + Funkenbögen zu den Schulterspitzen
      torso.box(0.24, 0.5, 0.24, VO[0], { x: o * 0.24, y: 0.62, z: -0.38 });
      for (let i = 0; i < 4; i++) torso.box(0.27, 0.03, 0.27, VO[4], { x: o * 0.24, y: 0.42 + i * 0.12, z: -0.38, glow: 1 });
      bar(torso, [o * 0.24, 0.88, -0.38], [o * 0.3, 1.1 + 0.35 * k, -0.42], 0.05, 0.025, VO[2]);
      torso.box(0.08, 0.08, 0.08, VO[5], { x: o * 0.3, y: 1.12 + 0.35 * k, z: -0.42, glow: 1 });
    }
    arc(torso, [-0.3, 1.12 + 0.35 * k, -0.42], [0.3, 1.12 + 0.35 * k, -0.42], 4, 0.18, VO[5], 0.03, 7);
    arc(torso, [-0.24, 0.7, -0.52], [0.24, 0.5, -0.52], 5, 0.16, VO[4], 0.03, 13);
    arms(c, (a, o) => {
      a.box(0.36, 0.08, 0.4, VO[3], { x: o * 0.03, y: 0.07 }); a.box(0.46, 0.08, 0.5, VO[0], { x: o * 0.07, y: 0.15 });
      a.box(0.48, 0.03, 0.52, VO[4], { x: o * 0.07, y: 0.2, glow: 1 });
      spike(a, [o * 0.2, 0.2, 0.1], [o * (0.4 + 0.12 * k), 0.2 + 0.6 * k, 0.1], 0.1 * k, VO[2], { glow: 0.5 });
      spike(a, [o * 0.22, 0.16, -0.12], [o * (0.55 + 0.1 * k), 0.16 + 0.3 * k, -0.25 - 0.2 * k], 0.08 * k, VO[2], { glow: 0.5 });
      arc(a, [o * (0.4 + 0.12 * k), 0.2 + 0.6 * k, 0.1], [o * (0.55 + 0.1 * k), 0.16 + 0.3 * k, -0.25 - 0.2 * k], 3, 0.1, VO[5], 0.025, o + 20);
      for (let i = 0; i < 3; i++) { a.box(0.3, 0.07, 0.32, VO[0], { y: -0.4 - i * 0.1 }); a.box(0.31, 0.02, 0.33, VO[4], { y: -0.36 - i * 0.1, glow: 1 }); } // Spulen-Armschiene
    });
  },
  legs(c) {
    const k = c.k;
    legs(c, (l, o) => {
      for (let i = 0; i < 4; i++) { l.box(0.36, 0.1, 0.38, i % 2 ? VO[3] : VO[0], { y: -0.26 - i * 0.12 }); l.box(0.365, 0.02, 0.385, VO[4], { y: -0.21 - i * 0.12, glow: 1 }); }
      arc(l, [0.02, -0.18, 0.2], [-0.02, -0.74, 0.2], 5, 0.1, VO[5], 0.03, o + 30); // Blitzspur am Schienbein
      spike(l, [0, -0.2, 0.2], [0, -0.1, 0.2 + 0.4 * k], 0.09, VO[2], { glow: 0.4 });
      l.box(0.4, 0.12, 0.5, VO[3], { y: -0.78, z: 0.05 }); l.box(0.41, 0.03, 0.51, VO[4], { y: -0.72, z: 0.05, glow: 1 });
      for (let i = -1; i <= 1; i++) spike(l, [i * 0.1, -0.8, 0.28], [i * 0.12, -0.84, 0.28 + 0.26 * k], 0.05, VO[2]);
    });
  },
};

const SETS = { lumpen, fellkluft, knochenkram, jaggo, barrotz, brathalos, kroll, gorgo, voltaro };
export const ARMOR_BUILDERS = SETS;
export const SLOT_JOINTS = { head: ['head'], body: ['torso', 'armR', 'armL'], legs: ['legL', 'legR'] };

/** Adds the armor of `armor` ({head,body,legs} piece ids) to the joint parts P. Returns the visual summary. */
export function buildArmor(P, armor, col) {
  const sets = armorSets(armor);
  const tiers = {};
  for (const slot of SLOTS) {
    const set = sets[slot], tier = setTier(set);
    tiers[slot] = tier;
    SETS[set]?.[slot]({ P, col, k: tierScale(tier), tier, set });
  }
  return { sets, tiers };
}
