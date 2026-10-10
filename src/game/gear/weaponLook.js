import * as THREE from 'three';
import { GearParts, gearMaterial, bar, spike, tri } from '../../render/gearfx.js';

// [G] Tier/branch weapon looks (GDD 8.6): tier 1 rusty & small -> tier 2 bone -> tier 3 branch parts (a = Jaggo, b = Barrotz)
// -> tier 4 huge, glowing, with element particles -> tier 5/6 (Rostwerke): Stufe-4-Basis + Ast-Aufbauten (k Rost-Platten, g Schlacke-Glut, v Funkenbögen). Each builder returns ONE merged vertex-coloured mesh per weapon piece.
//   group.userData: glow (material for charge flashes), gearGlow (uGlow uniform), fx [{kind, rate, at, obj?}], twoHand, hand.
// Weapon-local frame: grip at the origin, blade along -y (hilt +y), blade flat faces +-z (broad side visible from behind).

const PI = Math.PI;
const hash = (i) => { const s = Math.sin(i * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };

const RUST = ['#8a6a4a', '#6a4a30', '#9a7a58', '#b0642a', '#3a2a1a'];
const STEEL = ['#9aa0aa', '#777c86', '#c9ced8', '#4a4e57'];
const BONE = ['#e8dcc0', '#d6c8a6', '#a89878'];
const JP = ['#5b4fb3', '#3f3590', '#2c2470', '#e8873a', '#ffb04a'];
const BZ = ['#7a7360', '#4e493c', '#a39b84', '#7e6240', '#5a4630'];
const BR = ['#c0281c', '#7a1812', '#e8442a', '#ff8a2a', '#ffd060', '#e8d8b0'];
const LEATHER = '#7a4a2a';

function finish(P, userData = {}) {
  const mat = gearMaterial(1);
  const mesh = new THREE.Mesh(P.merge(), mat);
  const g = new THREE.Group();
  g.add(mesh);
  g.userData = { glow: mat, gearGlow: mat.userData.glow, ...userData };
  return g;
}


// ------------------------------------------------------------------ Stufe 5/6 (Rostwerke): Kroll = Rost (k), Gorgo = Schlacke/Feuer (g), Voltaro = Funken (v)
const RW = {
  k: { base: '#8a4a2a', dark: '#5a2f1c', hi: '#d89a50', glow: '#ffb050', fx: 'ember' },
  g: { base: '#3a3430', dark: '#241f1c', hi: '#ff6a1a', glow: '#ffb040', fx: 'fire' },
  v: { base: '#b8642a', dark: '#1a1e2a', hi: '#5ad0ff', glow: '#fff0a0', fx: 'shock' },
};
/** Zickzack-Funkenbogen aus leuchtenden Balken. */
function sparkArc(P, a, b, n, jag, color, seed = 0) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = i === n ? b : [a[0] + (b[0] - a[0]) * t + (hash(i + seed) - 0.5) * jag, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + (hash(i + seed + 5) - 0.5) * jag];
    bar(P, prev, p, 0.03, 0.03, color, { glow: 1 });
    prev = p;
  }
}
/** Aufbauten ueber dem Stufe-4-Look. Klingen: ys = [oben, unten] entlang -y; Bogen (bow=true): Wirbel an beiden Wippen. */
function rwAccent(P, fx, top, branch, { ys = [-0.2, -1.8], w = 0.3, bow = false, H = 0.78 } = {}) {
  const key = top >= 6 ? 'v' : (RW[branch] ? branch : 'k'), c = RW[key], big = top >= 6 ? 1.5 : 1;
  const len = Math.abs(ys[1] - ys[0]);
  if (bow) {
    for (const o of [-1, 1]) {
      for (let i = 0; i < 3; i++) spike(P, [0, o * (0.3 + i * 0.16), 0.2], [0.05 * (i - 1), o * (0.36 + i * 0.16), 0.2 + 0.2 * big], 0.05 * big, i % 2 ? c.hi : c.base, { glow: 0.8 });
      P.box(0.16, 0.12, 0.16, c.dark, { y: o * H, z: 0 });
      P.box(0.07, 0.07, 0.07, c.glow, { y: o * (H + 0.1), glow: 1 });
      if (key === 'v') sparkArc(P, [0.2, o * 0.3, 0.1], [-0.2, o * (H - 0.05), 0.1], 4, 0.14, c.hi, o + (top * 3));
      if (key === 'g') P.box(0.04, 0.4, 0.04, c.hi, { y: o * 0.5, z: 0.22, glow: 1 });
      if (key === 'k') for (let i = 0; i < 3; i++) P.box(0.2, 0.05, 0.14, c.base, { y: o * (0.4 + i * 0.14), z: 0.12 });
      fx.push({ kind: c.fx, rate: top >= 6 ? 9 : 6, at: [0, o * (H + 0.08), 0] });
    }
    return;
  }
  const n = 4 + (top >= 6 ? 3 : 0);
  P.box(0.05, len * 0.9, 0.12, c.dark, { y: (ys[0] + ys[1]) / 2 });
  P.box(0.025, len * 0.85, 0.14, c.glow, { y: (ys[0] + ys[1]) / 2, glow: 1 });
  for (let i = 0; i < n; i++) for (const o of [-1, 1]) {
    const y = ys[0] - 0.2 - (i / n) * (len - 0.3);
    if (key === 'k') P.box(w * 0.5, 0.1, 0.16, i % 2 ? c.base : c.dark, { x: o * w * 0.2, y }); // Panzerplatten
    else spike(P, [o * w / 2, y, 0], [o * (w / 2 + 0.16 * big), y - 0.12, 0], 0.07 * big, i % 2 ? c.hi : c.base, { glow: key === 'g' ? 0.8 : 0.4 });
  }
  if (key === 'v') for (const o of [-1, 1]) sparkArc(P, [o * 0.05, ys[0] - 0.3, 0.08], [o * w * 0.9, ys[1] + 0.4, 0.08], 5, 0.2, c.hi, o * 7 + top);
  if (key === 'g') for (let i = 0; i < 3; i++) P.box(w * 0.7, 0.03, 0.15, c.hi, { y: ys[0] - 0.4 - i * (len / 4), glow: 1 }); // Schlacke-Risse
  P.cone(w * 0.35, 0.3 * big, 4, c.glow, { y: ys[1] - 0.12, rx: PI, ry: PI / 4, glow: 1 });
  fx.push({ kind: c.fx, rate: top >= 6 ? 12 : 8, at: [0, ys[1], 0] }, { kind: c.fx, rate: 4, at: [0, (ys[0] + ys[1]) / 2, 0] });
}

// ------------------------------------------------------------------ greatsword
const GS_LEN = [1.55, 1.75, 1.95, 2.05];
const GS_W = [0.27, 0.32, 0.4, 0.62];

function gsHilt(P, tier, branch, wrap) {
  const w = tier >= 3 ? 0.12 : 0.1;
  P.box(w, 0.74, w, LEATHER, { y: 0.21 });
  for (let i = 0; i < 4; i++) P.box(w + 0.025, 0.045, w + 0.025, wrap, { y: -0.05 + i * 0.17 });
  P.box(0.16 + tier * 0.02, 0.1, 0.16 + tier * 0.02, tier === 4 ? BR[1] : tier === 3 ? (branch === 'b' ? BZ[2] : JP[3]) : tier === 2 ? BONE[1] : RUST[4], { y: 0.62 });
}

export function buildGreatswordLook(tier = 1, branch = null) {
  const top = Math.min(6, Math.max(1, tier));
  tier = Math.min(4, top);
  const P = new GearParts();
  const L = GS_LEN[tier - 1], W = GS_W[tier - 1], y0 = -0.2, body = L - 0.28;
  const fx = [];
  const slab = (w, len, th, color, y, at = {}) => P.box(w, len, th, color, { y: y0 - y - len / 2, ...at });
  const tipAt = (w, th, color, y, at = {}) => P.cone(w * 0.72, 0.3, 4, color, { y: y0 - y - 0.15, rx: PI, ry: PI / 4, sz: th / (w * 0.72) * 0.9, ...at });
  if (tier === 1) { // Rostplatte: small rusty slab
    gsHilt(P, 1, null, '#a08a5a');
    P.box(0.4, 0.07, 0.13, RUST[4], { y: -0.17 });
    slab(W, body, 0.07, RUST[0], 0);
    slab(0.08, body, 0.075, RUST[1], 0, { x: W / 2 - 0.04 });
    tipAt(W, 0.07, RUST[2], body);
    for (let i = 0; i < 7; i++) P.box(0.05 + hash(i) * 0.05, 0.05 + hash(i + 3) * 0.06, 0.08, i % 3 ? RUST[3] : RUST[4], { x: (hash(i + 1) - 0.5) * W, y: y0 - 0.2 - hash(i + 2) * (body - 0.2), z: 0, glow: 0 });
    P.box(0.07, 0.07, 0.09, RUST[4], { x: -W / 2, y: y0 - 0.6 }); // chip in the edge
    P.box(0.06, 0.06, 0.09, RUST[4], { x: W / 2, y: y0 - 1.0 });
  } else if (tier === 2) { // Knochenplatte: steel with bone plates and spine spikes
    gsHilt(P, 2, null, '#a08a5a');
    P.box(0.3, 0.1, 0.12, BONE[1], { y: -0.17 });
    for (const o of [-1, 1]) bar(P, [o * 0.12, -0.17, 0], [o * 0.34, -0.38, 0.0], 0.06, 0.015, BONE[0]);
    slab(W, body, 0.08, STEEL[1], 0);
    slab(0.07, body, 0.085, STEEL[2], 0, { x: W / 2 - 0.035 });
    tipAt(W, 0.08, STEEL[0], body);
    for (let i = 0; i < 3; i++) P.box(W * 0.72, 0.3, 0.12, i % 2 ? BONE[1] : BONE[0], { y: y0 - 0.25 - i * 0.42 - 0.15 });
    for (let i = 0; i < 4; i++) spike(P, [-W / 2, y0 - 0.2 - i * 0.34, 0], [-W / 2 - 0.2, y0 - 0.3 - i * 0.34, 0], 0.045, BONE[0]);
  } else if (tier === 3 && branch !== 'b') { // Jaggo-Hackbeil: wide cleaver tip, orange crest fins, serrated back
    gsHilt(P, 3, 'a', JP[3]);
    P.box(0.5, 0.09, 0.14, JP[1], { y: -0.17 });
    for (const o of [-1, 1]) bar(P, [o * 0.18, -0.17, 0], [o * 0.34, 0.05, 0], 0.06, 0.0, JP[3], { glow: 0.25 });
    slab(W * 0.85, body * 0.45, 0.09, JP[0], 0);
    slab(W * 1.3, body * 0.55, 0.1, JP[0], body * 0.45, { x: W * 0.08 });
    slab(0.06, body, 0.11, JP[3], 0, { x: W * 0.65 - 0.02, glow: 0.3 });
    tipAt(W * 1.3, 0.1, JP[0], body, { x: W * 0.08 });
    for (let i = 0; i < 4; i++) slab(W * 1.2, 0.05, 0.105, JP[i % 2 ? 1 : 2], 0.3 + i * 0.32, { x: W * 0.05 });
    for (let i = 0; i < 5; i++) spike(P, [-W * 0.65, y0 - 0.25 - i * 0.28, 0], [-W * 0.65 - 0.17, y0 - 0.34 - i * 0.28, 0], 0.05, JP[3], { glow: 0.3 });
  } else if (tier === 3) { // Barrotz-Brecher: thick shaft, heavy crusher block
    gsHilt(P, 3, 'b', BZ[3]);
    P.box(0.46, 0.14, 0.2, BZ[1], { y: -0.17 });
    slab(0.26, body * 0.55, 0.13, BZ[0], 0);
    slab(0.62, body * 0.5, 0.3, BZ[0], body * 0.5);
    slab(0.64, 0.07, 0.32, BZ[2], body * 0.5);
    slab(0.64, 0.07, 0.32, BZ[2], body);
    slab(0.5, 0.12, 0.25, BZ[1], body + 0.07);
    for (let i = 0; i < 4; i++) P.box(0.07, 0.07, 0.34, BZ[2], { x: -0.2 + i * 0.13, y: y0 - body * 0.62, z: 0 });
    for (let i = 0; i < 9; i++) P.box(0.1 + hash(i) * 0.1, 0.1 + hash(i + 4) * 0.1, 0.1, i % 2 ? BZ[3] : BZ[4], { x: (hash(i + 2) - 0.5) * 0.7, y: y0 - body * 0.4 - hash(i + 7) * body * 0.6, z: (hash(i + 5) > 0.5 ? 1 : -1) * 0.16, ry: hash(i) * 3 }); // mud crust
    for (const o of [-1, 1]) spike(P, [o * 0.31, y0 - body * 0.8, 0], [o * 0.52, y0 - body * 0.8 - 0.1, 0], 0.07, BZ[2]);
  } else { // Brathalos-Glutplatte: huge red blade, glowing core, flame teeth, wing guard
    gsHilt(P, 4, null, BR[1]);
    P.box(0.3, 0.14, 0.2, BR[1], { y: -0.17 });
    P.box(0.14, 0.14, 0.14, BR[4], { y: 0.62, glow: 1 });
    for (const o of [-1, 1]) {
      bar(P, [o * 0.15, -0.17, 0], [o * 0.55, -0.02, 0], 0.07, 0.04, BR[1]);
      bar(P, [o * 0.55, -0.02, 0], [o * 0.62, 0.34, 0], 0.04, 0.0, BR[5], { glow: 0.6 });
      bar(P, [o * 0.15, -0.2, 0], [o * 0.5, -0.42, 0], 0.05, 0.0, BR[2], { glow: 0.5 });
    }
    slab(W, body, 0.14, BR[0], 0);
    slab(0.12, body, 0.17, BR[1], 0, { x: -W / 2 + 0.06 });
    slab(0.12, body, 0.17, BR[1], 0, { x: W / 2 - 0.06 });
    slab(0.12, body * 0.88, 0.18, BR[3], 0.05, { glow: 1 }); // glowing core
    slab(0.05, body * 0.75, 0.19, BR[4], 0.12, { glow: 1 });
    tipAt(W, 0.14, BR[0], body);
    P.cone(0.1, 0.34, 4, BR[4], { y: y0 - body - 0.3, rx: PI, ry: PI / 4, sz: 0.5, glow: 1 });
    for (let i = 0; i < 6; i++) for (const o of [-1, 1]) spike(P, [o * W / 2, y0 - 0.3 - i * 0.26, 0], [o * (W / 2 + 0.14 + 0.03 * (i % 2)), y0 - 0.42 - i * 0.26, 0], 0.07, i % 2 ? BR[2] : BR[1], { glow: i % 2 ? 0.7 : 0.3 });
    for (let i = 0; i < 4; i++) P.box(W + 0.02, 0.03, 0.15, BR[1], { y: y0 - 0.5 - i * 0.4 });
    fx.push({ kind: 'fire', rate: 9, at: [0, y0 - body - 0.1, 0] }, { kind: 'ember', rate: 5, at: [0, y0 - body * 0.5, 0] });
  }
  if (top >= 5) rwAccent(P, fx, top, branch, { ys: [y0, y0 - body], w: W });
  const g = finish(P, { twoHand: { lo: 0.2, hi: 0.5 }, fx, glowBase: tier === 4 ? 1 : tier === 3 ? 0.9 : 0.5 });
  return g;
}

// ------------------------------------------------------------------ dual blades (one blade; flip = -1 for the left hand)
const DB_LEN = [0.62, 0.78, 0.9, 1.0];

export function buildDualBladeLook(tier = 1, branch = null, flip = 1) {
  const top = Math.min(6, Math.max(1, tier));
  tier = Math.min(4, top);
  const P = new GearParts();
  const L = DB_LEN[tier - 1], f = flip;
  const fx = [];
  const grip = (wrap, guard, pommel, w = 0.3) => {
    P.box(0.07, 0.3, 0.07, LEATHER, { y: 0 });
    P.box(w, 0.06, 0.12, guard, { y: -0.17 });
    P.box(0.1, 0.07, 0.1, pommel, { y: 0.17 });
    P.box(0.085, 0.04, 0.085, wrap, { y: 0.05 });
    P.box(0.085, 0.04, 0.085, wrap, { y: -0.07 });
  };
  const y0 = -0.2;
  if (tier === 1) { // rusty shank
    grip('#a08a5a', RUST[4], RUST[4], 0.22);
    P.box(0.11, L - 0.18, 0.035, RUST[0], { y: y0 - (L - 0.18) / 2 });
    P.cone(0.085, 0.2, 4, RUST[2], { y: y0 - (L - 0.18) - 0.08, rx: PI, ry: PI / 4, sz: 0.4 });
    for (let i = 0; i < 4; i++) P.box(0.04 + hash(i) * 0.04, 0.05, 0.045, i % 2 ? RUST[3] : RUST[4], { x: (hash(i + 2) - 0.5) * 0.09, y: y0 - 0.1 - i * 0.12 });
  } else if (tier === 2) { // Knochenkrallen: curved bone claws
    grip('#a08a5a', BONE[1], BONE[0], 0.26);
    let px = 0, py = y0;
    for (let i = 0; i < 4; i++) {
      const nx = px + f * (0.02 + i * 0.035), ny = py - L / 4.2;
      bar(P, [px, py, 0], [nx, ny, 0], 0.075 - i * 0.012, 0.075 - (i + 1) * 0.015, i % 2 ? BONE[1] : BONE[0]);
      px = nx; py = ny;
    }
    spike(P, [px, py, 0], [px + f * 0.14, py - 0.2, 0], 0.03, BONE[0]);
    P.box(0.03, L * 0.8, 0.05, BONE[2], { x: -f * 0.05, y: y0 - L * 0.4 });
  } else if (tier === 3 && branch !== 'b') { // Jaggo-Zähne: fang with serration
    grip(JP[3], JP[1], JP[3], 0.3);
    P.box(0.15, L * 0.45, 0.05, JP[0], { y: y0 - L * 0.225 });
    P.box(0.11, L * 0.4, 0.045, JP[0], { x: f * 0.01, y: y0 - L * 0.65 });
    P.cone(0.08, 0.24, 4, JP[4], { x: f * 0.02, y: y0 - L * 0.85 - 0.1, rx: PI, ry: PI / 4, sz: 0.5 });
    P.box(0.04, L * 0.85, 0.06, JP[3], { x: f * 0.075, y: y0 - L * 0.42, glow: 0.3 });
    for (let i = 0; i < 4; i++) spike(P, [-f * 0.07, y0 - 0.15 - i * 0.2, 0], [-f * 0.15, y0 - 0.25 - i * 0.2, 0], 0.035, JP[4], { glow: 0.3 });
    for (let i = 0; i < 2; i++) P.box(0.16, 0.03, 0.055, JP[2], { y: y0 - 0.2 - i * 0.3 });
  } else if (tier === 3) { // Schlammsauger: blunt mud-crusted sucker with static sparks
    grip(BZ[3], BZ[1], BZ[2], 0.32);
    P.box(0.17, L * 0.7, 0.07, BZ[0], { y: y0 - L * 0.35 });
    P.box(0.22, 0.2, 0.09, BZ[1], { y: y0 - L * 0.78 });
    P.cone(0.1, 0.2, 4, BZ[2], { y: y0 - L * 0.78 - 0.17, rx: PI, ry: PI / 4, sz: 0.6 });
    for (let i = 0; i < 4; i++) P.box(0.08 + hash(i) * 0.08, 0.08, 0.09, i % 2 ? BZ[3] : BZ[4], { x: (hash(i + 3) - 0.5) * 0.14, y: y0 - 0.1 - i * 0.18, z: (i % 2 ? 1 : -1) * 0.03, ry: hash(i) * 2 });
    for (let i = 0; i < 3; i++) P.box(0.05, 0.05, 0.1, '#8fe8ff', { x: (i - 1) * 0.05, y: y0 - 0.25 - i * 0.2, glow: 1 });
    fx.push({ kind: 'shock', rate: 5, at: [0, y0 - L * 0.7, 0] });
  } else { // Brathalos-Glühkrallen: long glowing red claw
    grip(BR[1], BR[1], BR[4], 0.34);
    P.box(0.04, 0.04, 0.04, BR[4], { y: 0.17, glow: 1 });
    let px = 0, py = y0;
    for (let i = 0; i < 5; i++) {
      const nx = px + f * (0.01 + i * 0.045), ny = py - L / 4.6;
      bar(P, [px, py, 0], [nx, ny, 0], 0.095 - i * 0.015, 0.095 - (i + 1) * 0.018, i % 2 ? BR[1] : BR[0]);
      bar(P, [px + f * 0.06, py, 0], [nx + f * 0.06, ny, 0], 0.03, 0.025, BR[3], { glow: 1 });
      px = nx; py = ny;
    }
    spike(P, [px, py, 0], [px + f * 0.2, py - 0.3, 0], 0.045, BR[4], { glow: 1 });
    for (let i = 0; i < 4; i++) spike(P, [-f * 0.07 + f * i * 0.01, y0 - 0.2 - i * 0.2, 0], [-f * 0.18, y0 - 0.3 - i * 0.2, 0], 0.045, BR[2], { glow: 0.6 });
    fx.push({ kind: 'fire', rate: 5, at: [f * 0.1, y0 - L * 0.9, 0] }, { kind: 'ember', rate: 2.5, at: [f * 0.05, y0 - L * 0.5, 0] });
  }
  if (top >= 5) rwAccent(P, fx, top, branch, { ys: [y0, y0 - (L - 0.2)], w: 0.2 });
  return finish(P, { fx, glowBase: tier === 4 ? 1 : tier === 3 ? 0.9 : 0.5 });
}

// ------------------------------------------------------------------ bow
export const BOW_H = 0.78;
export function buildBowLook(tier = 1, branch = null) {
  const top = Math.min(6, Math.max(1, tier));
  tier = Math.min(4, top);
  const P = new GearParts();
  const H = BOW_H, N = 8, fx = [];
  const th = [0.062, 0.075, 0.085, 0.11][tier - 1];
  const limb = tier === 1 ? ['#6a4a2a', '#5a3a1c', '#7a5a34'] : tier === 2 ? ['#7a4d26', '#5a3418', '#e8dcc0'] : tier === 3 && branch !== 'b' ? [JP[0], JP[1], JP[3]] : tier === 3 ? [BZ[0], BZ[1], BZ[3]] : [BR[0], BR[1], BR[3]];
  const pts = [];
  for (let i = 0; i <= N; i++) { const y = -H + (2 * H * i) / N; pts.push([0, y, 0.3 * (1 - (y / H) ** 2)]); }
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[i + 1], taper = 1 - 0.35 * Math.abs((a[1] + b[1]) / 2 / H);
    bar(P, a, b, th * taper * 0.75, th * taper * 0.75, i % 3 === 1 && tier !== 1 ? limb[1] : limb[0]);
    if (tier === 1 && i % 3 === 1) P.box(th * 1.4, 0.05, th * 1.4, limb[2], { y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 }); // knots
  }
  P.box(0.1, 0.26, 0.1, LEATHER, { y: 0, z: 0.3 });
  for (let i = 0; i < 3; i++) P.box(0.115, 0.035, 0.115, tier === 1 ? '#a08a5a' : limb[2], { y: -0.08 + i * 0.08, z: 0.3 });
  for (const o of [-1, 1]) {
    const tip = [0, o * H, 0];
    if (tier === 1) P.box(0.05, 0.07, 0.05, '#3a2a1a', { y: o * H, z: 0 });
    else if (tier === 2) { P.box(0.09, 0.12, 0.09, BONE[0], { y: o * H }); spike(P, [0, o * H, 0], [0, o * (H + 0.16), -0.08], 0.04, BONE[0]); bar(P, [0, o * 0.35, 0.22], [0, o * 0.5, 0.17], 0.045, 0.045, BONE[1]); }
    else if (tier === 3 && branch !== 'b') {
      for (let i = 0; i < 3; i++) spike(P, [0, o * (0.45 + i * 0.12), 0.2 - i * 0.04], [0, o * (0.55 + i * 0.12), 0.38 - i * 0.04 + 0.04 * i], 0.045, JP[3], { glow: 0.3 }); // comb fins
      spike(P, tip, [0, o * (H + 0.2), -0.1], 0.05, JP[4], { glow: 0.4 });
      P.box(0.12, 0.04, 0.12, JP[3], { y: o * 0.2, z: 0.3, glow: 0.3 });
    } else if (tier === 3) { // Prellbogen: plated, heavy, sparking tips
      P.box(0.14, 0.2, 0.13, BZ[1], { y: o * 0.55, z: 0.17 });
      P.box(0.16, 0.06, 0.15, BZ[2], { y: o * 0.45, z: 0.2 });
      P.box(0.15, 0.14, 0.15, BZ[2], { y: o * H });
      for (let i = 0; i < 3; i++) P.box(0.1 + hash(i + o) * 0.06, 0.08, 0.1, i % 2 ? BZ[3] : BZ[4], { x: (hash(i) - 0.5) * 0.1, y: o * (0.3 + i * 0.12), z: 0.26 - i * 0.03, ry: i });
      P.box(0.07, 0.07, 0.07, '#8fe8ff', { y: o * (H + 0.08), glow: 1 });
    } else { // Schwingbogen: bat-wing limbs
      for (const s of [-1, 1]) {
        const root = [0, o * 0.18, 0.3], mid = [s * 0.5, o * 0.55, 0.08], end = [s * 0.34, o * (H + 0.12), -0.12];
        bar(P, root, mid, 0.035, 0.02, BR[5]);
        bar(P, [0, o * 0.4, 0.25], end, 0.03, 0.015, BR[5]);
        tri(P, root, mid, [0, o * 0.5, 0.2], BR[1], { glow: 0.2 });
        tri(P, mid, end, [0, o * 0.45, 0.2], BR[0], { glow: 0.25 });
        P.box(0.05, 0.05, 0.05, BR[4], { x: mid[0], y: mid[1], z: mid[2], glow: 1 });
      }
      spike(P, [0, o * H, 0], [0, o * (H + 0.24), -0.1], 0.055, BR[4], { glow: 1 });
    }
    if (tier === 3 && branch === 'b') fx.push({ kind: 'shock', rate: 3.5, at: [0, o * (H + 0.06), 0] });
    if (tier === 4) fx.push({ kind: 'poison', rate: 4, at: [0, o * (H + 0.1), -0.05] });
  }
  if (top >= 5) rwAccent(P, fx, top, branch, { bow: true, H });
  const g = finish(P, { fx, glowBase: tier >= 3 ? 0.9 : 0.4, hand: 'L' });
  return g;
}
