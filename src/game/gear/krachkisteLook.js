import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GearParts, gearMaterial, bar, spike, tri } from '../../render/gearfx.js';
import { lambert } from '../../render/ps1.js';
import { PALETTES, markSprenger, slimeBlob } from './weaponLook.js';
import { SAMPLE_HEX } from '../buffs.js';

// Krachkiste (GDD 17.1): Schrott-Lautsprecher auf Rohrstiel. Jede Stufe/jeder Ast = ein Instrument aus dem Brocken:
//  1 Blechkiste · 2 Schaedel-Box mit Rippen-Gitter · 3a Jaggo-Kamm als EQ-Zacken · 3b Barrotz-Kopfplatte als Gong
//  4 Brathalos-Fluegelhaut als Schalltrichter · 5k Kroll-Kessel mit Dampfpfeifen · 5g Gorgo-Lava-Subwoofer
//  5v Voltaro-Tesla-Spule · 6 goldene Doppelspule.
// Gemeinsames Geruest (immer gleich, damit Zonen-/Sample-Lesbarkeit nie vom Brocken abhaengt):
//   Stiel (y 0,55 .. -0,95), Schlagfaeche = MEMBRAN (eigenes Mesh, nach -z = Schlagrichtung), Sample-Kragen mit 3 Symbol-Wuerfeln ▲■●
//   am Stiel (y -0,44 / -0,56 / -0,68), Instrument um den Kopf (y = HY). Waffen-Frame: Griff im Ursprung, Kopf entlang -y.
// Entfalten: Teile des Instruments haengen an Pivot-Gruppen (je 1 Mesh), updateMesh() (weapons/krachkiste.js) dreht/skaliert sie.
// Draw Calls: 1 Koerper + 1 Membran + 0-3 Pivots + 3 Kragen-Wuerfel.

const { RUST, BONE, JP, BZ, BR, KR, GG, VT, TOOTH, STEEL, SP } = PALETTES;
const PI = Math.PI;
export const HY = -1.2; // Kopf-Mitte (y) im Waffen-Frame
export const KK_KEYS = ['rust', 'bone', 'jag', 'barr', 'brat', 'kroll', 'gorgo', 'volt', 'fuerst'];
export function kkLookKey(tier, branch) {
  const t = Math.min(6, Math.max(1, tier | 0));
  if (t >= 6) return branch === 'x' ? 'sprenger' : 'fuerst';
  if (t === 5) return branch === 'g' ? 'gorgo' : branch === 'v' ? 'volt' : 'kroll';
  if (t === 4) return 'brat';
  if (t === 3) return branch === 'b' ? 'barr' : 'jag';
  return t === 2 ? 'bone' : 'rust';
}
const hash = (i) => { const s = Math.sin(i * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };

// Sample-Symbole ▲■● (je Zelle eine 16-px-Textur, pixelig). Der Kragen besteht aus 3 Wuerfeln (Symbol auf allen Seiten, von jeder Seite lesbar)
const _sym = [];
function symTex(cell) {
  if (_sym[cell]) return _sym[cell];
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const fill = ['#2c2c34', SAMPLE_HEX.r, SAMPLE_HEX.b, SAMPLE_HEX.g][cell], line = ['#555560', '#3a0a08', '#081a3a', '#0a3a12'][cell];
  g.fillStyle = '#16161e'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = fill; g.strokeStyle = line; g.lineWidth = 2;
  g.beginPath();
  if (cell === 0) g.arc(8, 8, 2.5, 0, PI * 2);
  else if (cell === 1) { g.moveTo(8, 1.5); g.lineTo(14.5, 14); g.lineTo(1.5, 14); } else if (cell === 2) g.rect(3, 3, 10, 10); else g.arc(8, 8, 6, 0, PI * 2);
  g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return (_sym[cell] = t);
}
/** Zellen-Index: '' = leer, r = ▲, b = ■, g = ● */
export const CELL = { '': 0, r: 1, b: 2, g: 3 };

function membrane(rad, base, cap) {
  const cone = new THREE.ConeGeometry(rad, rad * 0.55, 10, 1, true); // Spitze nach +y
  cone.rotateX(-PI / 2); // Spitze nach -z (nach vorn, in Schlagrichtung), Basis in der Frontebene
  const dome = new THREE.SphereGeometry(rad * 0.3, 6, 4);
  dome.scale(1, 1, 0.55);
  dome.translate(0, 0, -rad * 0.3);
  for (const [g, col] of [[cone, base], [dome, cap]]) {
    const cc = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  const geo = mergeGeometries([cone, dome], false);
  const mat = lambert({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0, 0, 0) });
  return { mesh: new THREE.Mesh(geo, mat), mat };
}

/** Pivot-Gruppe mit eigenem Mesh. kind: 'rot' (Winkel rest -> max), 'eq' (Skalierung hüpft), 'spin', 'arc' (skaliert/erscheint). */
function makePivot(parent, mat, list, o) {
  const P = new GearParts();
  o.build(P);
  const g = new THREE.Group();
  g.position.set(...o.at);
  g.add(new THREE.Mesh(P.merge(), mat));
  parent.add(g);
  list.push({ g, kind: o.kind ?? 'rot', axis: o.axis ?? 'x', rest: o.rest ?? 0, max: o.max ?? 1, wob: o.wob ?? 0, ph: o.ph ?? 0, showAt: o.showAt ?? -1, rate: o.rate ?? 10, cap: o.cap ?? 0, ang: 0 });
  return g;
}

// ------------------------------------------------------------------ gemeinsames Geruest
function frame(c, { stick = STEEL[1], wrap = '#a08a5a', pommel = STEEL[2], flange = STEEL[0], wraps = 4 }) {
  const { P } = c;
  P.cyl(0.034, 0.034, 1.5, 6, stick, { y: -0.2 });
  for (let k = 0; k < wraps; k++) P.box(0.085, 0.05, 0.085, wrap, { y: -0.04 + k * 0.1 });
  P.box(0.1, 0.07, 0.1, pommel, { y: 0.58 });
  // Sample-Kragen: zwei Flansche (die Symbol-Wuerfel sitzen dazwischen)
  P.cyl(0.075, 0.075, 0.025, 8, flange, { y: -0.375 });
  P.cyl(0.075, 0.075, 0.025, 8, flange, { y: -0.745 });
  // Montageplatte Stiel -> Kopf
  P.box(0.16, 0.05, 0.16, stick, { y: HY + 0.25 });
}

// ------------------------------------------------------------------ die neun Instrumente
const LOOKS = {
  // Stufe 1: Blechkiste -- verbeulte Schrottkiste, Klebeband, Nieten; Seitenklappen + Deckel klappen auf
  rust(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: '#a08a5a' };
    B(0.52, 0.46, 0.34, RUST[1]);
    for (const x of [-1, 1]) B(0.04, 0.5, 0.36, RUST[4], x * 0.26, 0, 0);
    for (const y of [-1, 1]) B(0.56, 0.04, 0.36, RUST[4], 0, y * 0.24, 0);
    B(0.44, 0.38, 0.02, RUST[2], 0, 0, -0.175);
    B(0.07, 0.5, 0.37, '#a8a8a0', -0.14, 0, 0, { rz: 0.16 }); B(0.07, 0.5, 0.37, '#a8a8a0', 0.17, 0, 0, { rz: -0.12 }); // Klebeband
    for (const [x, y] of [[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]]) B(0.035, 0.035, 0.03, RUST[3], x, y, -0.2);
    B(0.12, 0.1, 0.012, RUST[3], 0.14, -0.05, 0.175, { rz: 0.3 }); B(0.1, 0.08, 0.012, '#c9ced8', -0.12, 0.06, 0.175); // Rostflecken + Etikett
    B(0.14, 0.1, 0.02, '#111118', 0.08, -0.08, 0.18); // Bassreflex-Loch
    bar(P, [0.1, HY - 0.1, 0.19], [0.18, HY - 0.32, 0.26], 0.012, 0.012, '#2a2a30'); // Kabelstummel
    bar(P, [-0.12, HY + 0.24, 0], [0.12, HY + 0.24, 0], 0.02, 0.02, STEEL[1]); // Tragegriff
    piv({ at: [-0.27, HY, -0.17], axis: 'y', rest: 0, max: -1.15, wob: 0.06, build: (Q) => { Q.box(0.025, 0.4, 0.22, RUST[2], { x: -0.012, z: 0.11 }); Q.box(0.03, 0.4, 0.03, RUST[4], { x: -0.012, z: 0.0 }); Q.box(0.03, 0.12, 0.1, RUST[3], { x: -0.02, y: 0.1, z: 0.12 }); } });
    piv({ at: [0.27, HY, -0.17], axis: 'y', rest: 0, max: 1.15, wob: 0.06, ph: 2, build: (Q) => { Q.box(0.025, 0.4, 0.22, RUST[2], { x: 0.012, z: 0.11 }); Q.box(0.03, 0.4, 0.03, RUST[4], { x: 0.012, z: 0.0 }); Q.box(0.03, 0.12, 0.1, '#a8a8a0', { x: 0.02, y: -0.08, z: 0.12 }); } });
    piv({ at: [0, HY + 0.245, 0.17], axis: 'x', rest: 0, max: 0.8, wob: 0.05, build: (Q) => { Q.box(0.5, 0.02, 0.32, RUST[0], { z: -0.16 }); Q.box(0.2, 0.025, 0.1, '#a8a8a0', { z: -0.2, x: 0.1, ry: 0.2 }); } });
    c.mem = { y: 0, z: -0.19, rad: 0.15, base: '#2e2c34', cap: '#575560' };
    c.rim = { color: RUST[4] };
  },
  // Stufe 2: Schaedel-Box -- Cabinet als Schaedel, Rippen-Gitter vor der Membran, Kiefer klappt auf
  bone(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: '#7a4a2a', stick: BONE[2], pommel: BONE[0], flange: BONE[1] };
    B(0.5, 0.42, 0.34, BONE[0]);
    P.sphere(0.27, 8, 6, BONE[0], { y: HY + 0.2, sy: 0.62, sz: 0.85 }); // Schaedeldecke
    for (const x of [-1, 1]) {
      B(0.1, 0.1, 0.1, BONE[1], x * 0.26, 0.04, -0.12); // Jochbein
      B(0.1, 0.09, 0.05, '#1a130c', x * 0.14, 0.14, -0.175); // Augenhoehle
      B(0.12, 0.03, 0.04, BONE[2], x * 0.14, 0.2, -0.18); // Braue
      for (let k = 0; k < 3; k++) B(0.02, 0.04, 0.34, BONE[2], x * (0.19 + k * 0.025), 0.18 - k * 0.1, 0, { rz: x * 0.2 });
    }
    B(0.05, 0.08, 0.04, '#1a130c', 0, 0.08, -0.18); // Nasenloch
    for (let i = -2; i <= 1; i++) { // Rippen-Gitter
      const x = (i + 0.5) * 0.085;
      bar(P, [x, HY + 0.17, -0.2], [x * 1.18, HY + 0.0, -0.26], 0.018, 0.018, BONE[1]);
      bar(P, [x * 1.18, HY + 0.0, -0.26], [x, HY - 0.15, -0.2], 0.018, 0.018, BONE[1]);
    }
    for (let k = 0; k < 5; k++) B(0.06, 0.05, 0.05, k % 2 ? BONE[1] : BONE[0], 0, 0.15 - k * 0.075, 0.2, { sx: 1 - k * 0.05 }); // Wirbelsaeule hinten
    piv({ at: [0, HY - 0.215, 0.14], axis: 'x', rest: 0, max: -0.85, wob: 0.07, build: (Q) => { // Unterkiefer
      Q.box(0.44, 0.07, 0.4, BONE[0], { y: -0.035, z: -0.2 });
      for (let k = 0; k < 6; k++) Q.cone(0.022, 0.07, 4, TOOTH, { x: -0.18 + k * 0.072, y: 0.03, z: -0.36 });
      Q.box(0.1, 0.1, 0.1, BONE[1], { x: -0.22, y: 0.0, z: -0.04 }); Q.box(0.1, 0.1, 0.1, BONE[1], { x: 0.22, y: 0.0, z: -0.04 });
    } });
    for (const x of [-1, 1]) piv({ at: [x * 0.26, HY + 0.1, 0.0], axis: 'z', rest: 0, max: x * -0.6, wob: 0.05, ph: x, build: (Q) => { // Rippenbogen an den Seiten
      for (let k = 0; k < 3; k++) { bar(Q, [0, -k * 0.09, 0.1 - k * 0.1], [x * 0.14, -0.1 - k * 0.09, 0.08 - k * 0.1], 0.016, 0.014, BONE[k % 2]); bar(Q, [x * 0.14, -0.1 - k * 0.09, 0.08 - k * 0.1], [x * 0.2, -0.26 - k * 0.07, 0.06 - k * 0.1], 0.014, 0.01, BONE[1]); }
    } });
    c.mem = { y: -0.02, z: -0.19, rad: 0.15, base: '#2a2620', cap: '#4a4234' };
    c.rim = { color: BONE[2] };
  },
  // Stufe 3a: Jaggo-Kamm als EQ-Zacken -- violette Schuppenbox, orange Zackenreihen hüpfen wie ein Equalizer
  jag(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: JP[3], stick: JP[1], pommel: JP[2], flange: JP[0] };
    B(0.5, 0.44, 0.34, JP[0]);
    for (let k = 0; k < 4; k++) for (const x of [-1, 1]) B(0.012, 0.07, 0.3, k % 2 ? JP[1] : JP[2], x * 0.256, 0.15 - k * 0.1, 0);
    B(0.46, 0.04, 0.02, JP[3], 0, 0.2, -0.18); B(0.46, 0.04, 0.02, JP[3], 0, -0.2, -0.18);
    for (let i = 0; i < 6; i++) { const x = -0.2 + i * 0.08; // Zahnraster ueber/unter der Membran
      P.cone(0.025, 0.07, 4, TOOTH, { x, y: HY + 0.14, z: -0.2, rx: PI }); P.cone(0.025, 0.07, 4, TOOTH, { x, y: HY - 0.14, z: -0.2 }); }
    for (const x of [-1, 1]) { spike(P, [x * 0.24, HY + 0.1, -0.15], [x * 0.3, HY + 0.18, -0.36], 0.05, JP[4], { glow: 0.3 }); spike(P, [x * 0.24, HY - 0.1, -0.15], [x * 0.3, HY - 0.18, -0.34], 0.04, JP[3], { glow: 0.3 }); }
    for (let i = 0; i < 5; i++) B(0.07, 0.07, 0.07, i % 2 ? JP[3] : JP[4], -0.18 + i * 0.09, 0.18, 0.17, { glow: 0.3 }); // Kammansatz hinten
    for (let g = 0; g < 3; g++) piv({ at: [-0.17 + g * 0.17, HY + 0.2, 0], kind: 'eq', ph: g * 2.1, build: (Q) => {
      for (let k = 0; k < 3; k++) { const h = 0.16 + hash(g * 3 + k) * 0.14; Q.cone(0.045 - k * 0.004, h, 4, k % 2 ? JP[3] : JP[4], { x: (k - 1) * 0.05, y: h / 2, z: (k - 1) * 0.02, glow: 0.35 }); }
    } });
    c.mem = { y: 0, z: -0.19, rad: 0.15, base: '#2c2438', cap: '#4a3a64' };
    c.rim = { color: JP[3] };
  },
  // Stufe 3b: Barrotz-Kopfplatte als Gong -- schwere Platte im Rahmen, Hoerner, Schlammkruste
  barr(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: BZ[3], stick: BZ[4], pommel: BZ[1], flange: BZ[1] };
    for (const x of [-1, 1]) bar(P, [x * 0.33, HY - 0.36, 0], [x * 0.33, HY + 0.34, 0], 0.045, 0.045, BZ[1]);
    bar(P, [-0.36, HY + 0.34, 0], [0.36, HY + 0.34, 0], 0.045, 0.045, BZ[2]);
    bar(P, [-0.36, HY - 0.36, 0], [0.36, HY - 0.36, 0], 0.05, 0.05, BZ[1]);
    for (let i = 0; i < 6; i++) B(0.09 + hash(i) * 0.06, 0.08, 0.09, i % 2 ? BZ[3] : BZ[4], (hash(i + 3) - 0.5) * 0.7, -0.36 + hash(i + 8) * 0.04, 0.0, { ry: i }); // Schlamm am Rahmen
    for (const x of [-1, 1]) bar(P, [x * 0.12, HY + 0.34, 0], [x * 0.1, HY + 0.18, 0], 0.012, 0.012, STEEL[1]); // Ketten
    const gong = piv({ at: [0, HY + 0.3, 0], axis: 'x', rest: 0, max: 0.55, wob: 0.1, build: (Q) => {
      Q.cyl(0.3, 0.3, 0.07, 12, BZ[0], { y: -0.34, rx: PI / 2 });
      Q.cyl(0.32, 0.32, 0.045, 12, BZ[2], { y: -0.34, z: -0.012, rx: PI / 2 });
      Q.cyl(0.19, 0.19, 0.04, 10, BZ[1], { y: -0.34, z: -0.05, rx: PI / 2 });
      for (const x of [-1, 1]) { bar(Q, [x * 0.2, -0.16, 0], [x * 0.3, 0.04, 0.0], 0.06, 0.02, BZ[2]); bar(Q, [x * 0.3, 0.04, 0], [x * 0.24, 0.18, 0], 0.025, 0.0, TOOTH); } // Hoerner
      for (let i = 0; i < 7; i++) Q.box(0.07 + hash(i) * 0.05, 0.07, 0.06, i % 2 ? BZ[3] : BZ[4], { x: (hash(i + 4) - 0.5) * 0.5, y: -0.34 + (hash(i + 9) - 0.5) * 0.5, z: 0.045, ry: i });
    } });
    c.mem = { y: 0, z: -0.19, rad: 0.15, base: '#3a3328', cap: '#6a5c44', parent: gong, pz: -0.075, pyAbs: -0.34 };
    c.rim = null;
    for (const x of [-1, 1]) piv({ at: [x * 0.33, HY + 0.3, 0], axis: 'z', rest: 0, max: x * -0.5, wob: 0.06, ph: x * 2, build: (Q) => { bar(Q, [0, 0, 0], [x * 0.14, 0.14, 0], 0.045, 0.02, BZ[2]); bar(Q, [x * 0.14, 0.14, 0], [x * 0.12, 0.3, 0], 0.02, 0.0, TOOTH); } });
    c.fx.push({ kind: 'shock', rate: 3, at: [0, HY, 0] });
  },
  // Stufe 4: Brathalos-Fluegelhaut als Schalltrichter -- Horn aus Membran, Fluegel spreizen sich zum Trichter
  brat(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: BR[5], stick: BR[1], pommel: BR[4], flange: BR[1] };
    P.cyl(0.29, 0.1, 0.4, 8, BR[0], { y: HY, rx: -PI / 2, z: -0.02 }); // Trichter (weite Oeffnung nach vorn)
    P.cyl(0.31, 0.31, 0.04, 8, BR[1], { y: HY, z: -0.2, rx: PI / 2 }); // Hornrand
    P.cyl(0.21, 0.21, 0.03, 8, '#2a0c0a', { y: HY, z: -0.215, rx: PI / 2 }); // Trichter-Mund (dunkel), die Membran sitzt darin
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; spike(P, [Math.cos(a) * 0.3, HY + Math.sin(a) * 0.3, -0.2], [Math.cos(a) * 0.36, HY + Math.sin(a) * 0.36, -0.3], 0.03, BR[5], { glow: 0.15 }); }
    B(0.2, 0.24, 0.16, BR[1], 0, 0, 0.2); // Korpus hinten
    P.sphere(0.07, 5, 4, BR[4], { y: HY, z: 0.3, glow: 1 });
    for (const x of [-1, 1]) bar(P, [x * 0.1, HY + 0.2, 0.1], [x * 0.16, HY + 0.42, 0.28], 0.04, 0.012, BR[5]); // Hoerner hinten
    const wing = (x) => (Q) => {
      const R = [0, 0.2, 0], T1 = [0.0, 0.3, 0.55], T2 = [0.02, -0.02, 0.7], T3 = [0.0, -0.26, 0.5], Rb = [0, -0.2, 0];
      tri(Q, R, T1, T2, BR[0], { glow: 0.25 }); tri(Q, R, T2, Rb, BR[2], { glow: 0.3 }); tri(Q, Rb, T2, T3, BR[1], { glow: 0.2 });
      for (const T of [T1, T2, T3]) bar(Q, R, T, 0.022, 0.012, BR[5]);
      for (const T of [T1, T2, T3]) bar(Q, [0, 0, 0.1], T, 0.01, 0.01, BR[3], { glow: 1 });
      spike(Q, T2, [0.02, -0.04, 0.9], 0.04, BR[5], { glow: 0.3 });
    };
    for (const x of [-1, 1]) piv({ at: [x * 0.17, HY, -0.12], axis: 'y', rest: x * 0.05, max: x * 1.25, wob: 0.05, ph: x, build: wing(x) });
    c.mem = { y: 0, z: -0.17, rad: 0.17, base: '#3a1812', cap: '#6a2a20' };
    c.rim = null;
    c.fx.push({ kind: 'fire', rate: 5, at: [0, HY, -0.35] }, { kind: 'ember', rate: 3, at: [0, HY + 0.3, 0] });
  },
  // Stufe 5k: Kroll-Kessel mit Dampfpfeifen -- Kessel, Nietenbaender, Dampfpfeifen richten sich auf, Ventilrad dreht
  kroll(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: KR[2], stick: KR[3], pommel: KR[2], flange: KR[3] };
    P.cyl(0.25, 0.26, 0.44, 10, KR[0], { y: HY });
    for (const y of [-0.15, 0.15]) { P.cyl(0.275, 0.275, 0.05, 10, KR[3], { y: HY + y }); for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; P.box(0.04, 0.04, 0.04, KR[4], { x: Math.cos(a) * 0.28, y: HY + y, z: Math.sin(a) * 0.28 }); } }
    P.sphere(0.23, 8, 5, KR[1], { y: HY + 0.2, sy: 0.55 }); // Kuppel
    B(0.34, 0.34, 0.03, KR[3], 0, 0, -0.245); // Frontflansch
    for (const [x, y] of [[-0.14, 0.14], [0.14, 0.14], [-0.14, -0.14], [0.14, -0.14]]) B(0.04, 0.04, 0.03, KR[4], x, y, -0.27);
    bar(P, [0.27, HY - 0.15, 0.0], [0.3, HY + 0.12, 0.08], 0.03, 0.03, KR[6]); // Rohr
    B(0.1, 0.08, 0.12, KR[3], 0, -0.2, 0.22); B(0.06, 0.2, 0.06, KR[2], 0, 0.0, 0.26); // Abgas hinten
    P.box(0.04, 0.04, 0.06, KR[5], { x: -0.1, y: HY - 0.1, z: -0.27, glow: 1 });
    // Dampfpfeifen am Kopfende: liegen eingeklappt an der Kesselwand und klappen beim Abspielen nach vorn (weg vom Stiel) aus
    const pipe = (h) => (Q) => { Q.cyl(0.035, 0.035, h, 6, KR[2], { y: h / 2 }); Q.cyl(0.052, 0.052, 0.04, 6, KR[4], { y: h }); Q.sphere(0.03, 4, 3, KR[5], { y: h + 0.03, glow: 1 }); Q.cyl(0.05, 0.05, 0.03, 6, KR[3], { y: 0.0 }); };
    piv({ at: [-0.29, HY - 0.2, 0], axis: 'z', rest: 0, max: PI * 0.97, cap: 1, wob: 0.04, build: pipe(0.36) });
    piv({ at: [0.29, HY - 0.2, 0], axis: 'z', rest: 0, max: -PI * 0.97, cap: 1, wob: 0.04, ph: 1.7, build: pipe(0.3) });
    piv({ at: [0, HY - 0.2, 0.28], axis: 'x', rest: 0, max: PI * 0.97, cap: 1, wob: 0.04, ph: 3.1, build: pipe(0.42) });
    piv({ at: [-0.29, HY + 0.04, 0.0], kind: 'spin', axis: 'x', rate: 9, build: (Q) => {
      Q.cyl(0.11, 0.11, 0.04, 8, KR[3], { rz: PI / 2, x: -0.02 });
      for (let k = 0; k < 4; k++) Q.box(0.03, 0.05, 0.3, KR[5], { x: -0.04, rx: k * PI / 4 });
      Q.sphere(0.04, 4, 3, KR[2], { x: -0.05, glow: 0.4 });
    } });
    c.mem = { y: 0, z: -0.265, rad: 0.12, base: '#2e2e34', cap: '#5a5a62' };
    c.rim = { color: KR[4], z: -0.27 };
    c.fx.push({ kind: 'ember', cols: ['#e8f0f4', '#c8d4dc'], rate: 5, at: [0, HY - 0.6, 0] }, { kind: 'ember', cols: ['#e8f0f4', '#c8d4dc'], rate: 3, at: [0, HY + 0.1, 0.4] });
  },
  // Stufe 5g: Gorgo-Lava-Subwoofer -- runder Bass, Glutkern, Panzerplatten klappen auf, Zahnring
  gorgo(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: GG[3], stick: GG[1], pommel: GG[3], flange: GG[2] };
    P.cyl(0.3, 0.3, 0.34, 10, GG[0], { y: HY, rx: PI / 2 });
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2 + 0.2; P.box(0.12, 0.1, 0.36, k % 2 ? GG[2] : GG[1], { x: Math.cos(a) * 0.3, y: HY + Math.sin(a) * 0.3, rz: a }); } // Segmentring
    P.cyl(0.22, 0.22, 0.05, 10, GG[3], { y: HY, z: -0.17, rx: PI / 2, glow: 1 }); // Lavakern hinter der Membran
    P.cyl(0.25, 0.25, 0.02, 10, GG[4], { y: HY, z: -0.185, rx: PI / 2, glow: 1 });
    for (const z of [-0.12, 0.12]) P.cyl(0.315, 0.315, 0.025, 10, GG[3], { y: HY, z, rx: PI / 2, glow: 1 }); // Glutringe
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; bar(P, [Math.cos(a) * 0.31, HY + Math.sin(a) * 0.31, -0.13], [Math.cos(a) * 0.31, HY + Math.sin(a) * 0.31, 0.13], 0.012, 0.012, GG[4], { glow: 1 }); } // Lavanaehte
    for (let k = 0; k < 10; k++) { const a = k / 10 * PI * 2; spike(P, [Math.cos(a) * 0.27, HY + Math.sin(a) * 0.27, -0.19], [Math.cos(a) * 0.2, HY + Math.sin(a) * 0.2, -0.3], 0.03, GG[5]); } // Zahnring
    for (const [x, y, l] of [[-0.18, 0.2, 0.3], [0.1, 0.27, 0.26], [0.26, -0.05, 0.3], [-0.26, -0.1, 0.22]]) bar(P, [x, HY + y, 0.0], [x * 1.02, HY + y - l, 0.0], 0.014, 0.01, GG[3], { glow: 1 }); // Lavaadern
    bar(P, [-0.2, HY + 0.29, 0.14], [0.2, HY + 0.29, 0.14], 0.03, 0.03, GG[3], { glow: 1 });
    B(0.16, 0.2, 0.14, GG[1], 0, 0, 0.22); P.sphere(0.06, 5, 4, GG[4], { y: HY, z: 0.3, glow: 1 });
    for (const x of [-1, 1]) piv({ at: [x * 0.31, HY, -0.19], axis: 'y', rest: 0, max: x * 1.15, wob: 0.07, ph: x, build: (Q) => { // Panzertuer
      Q.box(0.2, 0.34, 0.04, GG[2], { x: -x * 0.1 }); Q.box(0.18, 0.1, 0.05, GG[0], { x: -x * 0.1, y: 0.1 }); Q.box(0.18, 0.1, 0.05, GG[0], { x: -x * 0.1, y: -0.1 });
      Q.box(0.03, 0.2, 0.06, GG[3], { x: -x * 0.17, glow: 1 }); spike(Q, [-x * 0.2, 0.12, 0], [-x * 0.26, 0.14, -0.1], 0.025, GG[5]); spike(Q, [-x * 0.2, -0.12, 0], [-x * 0.26, -0.14, -0.1], 0.025, GG[5]);
    } });
    c.mem = { y: 0, z: -0.2, rad: 0.15, base: '#2a2220', cap: '#4a3a30' };
    c.rim = { color: GG[2], z: -0.2 };
    c.fx.push({ kind: 'fire', rate: 5, at: [0, HY + 0.32, 0] }, { kind: 'ember', rate: 4, at: [0, HY, -0.25] });
  },
  // Stufe 5v: Voltaro-Tesla-Spule -- Navy-Box, Kupferspule am Boden, Antennen spreizen sich, Funken
  volt(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: VT[0], stick: VT[2], pommel: VT[0], flange: VT[1] };
    B(0.46, 0.4, 0.32, VT[2]);
    B(0.46, 0.04, 0.34, VT[0], 0, 0.2, 0); B(0.46, 0.04, 0.34, VT[0], 0, -0.2, 0);
    B(0.38, 0.32, 0.02, VT[3], 0, 0, -0.165);
    for (const x of [-1, 1]) { B(0.05, 0.05, 0.05, VT[4], x * 0.19, 0.14, -0.19, { glow: 1 }); B(0.05, 0.05, 0.05, VT[4], x * 0.19, -0.14, -0.19, { glow: 1 }); }
    for (let k = 0; k < 7; k++) P.cyl(0.115 - k * 0.006, 0.12 - k * 0.006, 0.05, 8, k % 2 ? VT[1] : VT[0], { y: HY - 0.26 - k * 0.055 }); // Spulenwicklung am Boden
    P.sphere(0.085, 6, 5, VT[1], { y: HY - 0.69, glow: 0.35 });
    bar(P, [0, HY - 0.72, 0], [0, HY - 0.82, 0], 0.025, 0.0, VT[4], { glow: 1 });
    B(0.16, 0.12, 0.1, VT[3], 0, 0.1, 0.2); P.sphere(0.04, 4, 3, VT[5], { y: HY + 0.1, z: 0.27, glow: 1 });
    for (const x of [-1, 1]) piv({ at: [x * 0.1, HY - 0.3, 0], axis: 'z', rest: x * 0.12, max: x * -0.95, wob: 0.08, ph: x, build: (Q) => { // Antennen + Funkenbogen
      bar(Q, [0, 0, 0], [x * 0.1, -0.2, 0], 0.022, 0.012, VT[1]); Q.box(0.045, 0.045, 0.045, VT[4], { x: x * 0.1, y: -0.2, glow: 1 });
      bar(Q, [0, 0, 0.08], [x * 0.14, -0.3, 0.08], 0.018, 0.01, VT[1]); Q.box(0.04, 0.04, 0.04, VT[5], { x: x * 0.14, y: -0.3, z: 0.08, glow: 1 });
      let prev = [x * 0.1, -0.2, 0];
      for (let i = 1; i <= 4; i++) { const t = i / 4, p = i === 4 ? [-x * 0.0, -0.45, 0] : [x * (0.1 - 0.1 * t) + (hash(i + x) - 0.5) * 0.08, -0.2 - 0.25 * t, (hash(i + 5) - 0.5) * 0.06]; bar(Q, prev, p, 0.012, 0.012, VT[4], { glow: 1 }); prev = p; }
    } });
    c.mem = { y: 0, z: -0.18, rad: 0.14, base: '#1e2230', cap: '#3a4466' };
    c.rim = { color: VT[0] };
    c.fx.push({ kind: 'shock', rate: 5, at: [0, HY - 0.7, 0] });
  },
  // Stufe 6: goldene Doppelspule -- Gold-Cabinet, zwei Spulen kippen auseinander, Lichtbogen dazwischen
  fuerst(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: VT[6], stick: VT[2], pommel: VT[6], flange: VT[6] };
    B(0.48, 0.44, 0.34, VT[6]);
    B(0.48, 0.05, 0.36, VT[2], 0, 0.22, 0); B(0.48, 0.05, 0.36, VT[2], 0, -0.22, 0);
    B(0.4, 0.34, 0.02, VT[0], 0, 0, -0.18);
    for (const [x, y] of [[-0.19, 0.15], [0.19, 0.15], [-0.19, -0.15], [0.19, -0.15]]) B(0.05, 0.05, 0.04, VT[5], x, y, -0.2, { glow: 1 });
    P.sphere(0.07, 5, 4, VT[5], { y: HY, z: 0.2, glow: 1 }); B(0.2, 0.14, 0.12, VT[2], 0, 0.05, 0.17);
    for (const x of [-1, 1]) piv({ at: [x * 0.31, HY + 0.1, 0], axis: 'z', rest: x * 0.04, max: x * 0.5, wob: 0.05, ph: x, build: (Q) => { // Stimmgabel-Zinken: Spulen haengen nach vorn (weg vom Stiel)
      for (let k = 0; k < 9; k++) Q.cyl(0.075, 0.08, 0.045, 8, k % 2 ? VT[6] : VT[0], { y: -0.04 - k * 0.058 });
      Q.sphere(0.09, 6, 5, VT[5], { y: -0.62, glow: 1 }); Q.cyl(0.04, 0.05, 0.12, 6, VT[2], { y: 0.0 });
      for (const s of [-1, 1]) { bar(Q, [0, -0.5, 0], [s * 0.12, -0.68, 0], 0.014, 0.01, VT[6], { glow: 0.4 }); Q.box(0.035, 0.035, 0.035, VT[5], { x: s * 0.12, y: -0.68, glow: 1 }); }
    } });
    piv({ at: [0, HY - 0.44, 0], kind: 'arc', showAt: 0.12, build: (Q) => { // Lichtbogen zwischen den Kuppen
      for (const [yo, col, r] of [[0.0, VT[5], 0.022], [0.07, VT[4], 0.016], [-0.06, VT[4], 0.014]]) {
        let prev = [-0.6, yo, 0];
        for (let i = 1; i <= 8; i++) { const t = i / 8; const p = [-0.6 + 1.2 * t, yo + (i === 8 ? 0 : (hash(i * 3 + yo * 50) - 0.5) * 0.14), (hash(i + 2 + yo * 20) - 0.5) * 0.05]; bar(Q, prev, p, r, r, col, { glow: 1 }); prev = p; }
      }
    } });
    c.mem = { y: 0, z: -0.19, rad: 0.15, base: '#2a2418', cap: '#6a5a2a' };
    c.rim = { color: VT[5] };
    c.fx.push({ kind: 'shock', rate: 9, at: [0, HY - 0.6, 0] }, { kind: 'ember', cols: ['#ffd84a', '#fff0a0'], rate: 4, at: [0, HY, 0.25] });
  },
  // Stufe 6x Sprenger (Krachfaust): Faust-Kiste -- Obsidian-Klotz mit vier Knöchel-Buckeln vor der Membran, Schleimdecke mit Sprengknoten, Hornkamm; Panzertueren klappen auf
  sprenger(c) {
    const { P, B, piv } = c;
    c.stickCol = { wrap: SP[3], stick: SP[0], pommel: SP[3], flange: SP[2] };
    B(0.54, 0.44, 0.36, SP[0]);
    B(0.58, 0.06, 0.4, SP[2], 0, -0.2, 0);
    B(0.46, 0.34, 0.02, SP[1], 0, 0, -0.185);
    B(0.52, 0.07, 0.38, SP[3], 0, 0.235, 0, { glow: 0.3 }); // Schleimdecke
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      P.sphere(0.09, 5, 4, SP[1], { x: x * 0.22, y: HY + y * 0.16, z: -0.2 }); // Knöchel-Buckel
      slimeBlob(P, x * 0.22, HY + y * 0.16, -0.27, 0.04);
    }
    for (const k of [-1, 0, 1]) spike(P, [k * 0.16, HY + 0.26, 0.0], [k * 0.22, HY + 0.52 - Math.abs(k) * 0.1, 0.06], 0.065, SP[0]); // Hornkamm
    for (const k of [-2, -1, 0, 1, 2]) slimeBlob(P, k * 0.1, HY + 0.29, 0.12 - Math.abs(k) * 0.03, 0.05 + (k % 2 ? 0 : 0.012));
    B(0.22, 0.24, 0.14, SP[1], 0, 0, 0.25); B(0.26, 0.04, 0.16, SP[2], 0, 0.12, 0.25);
    slimeBlob(P, 0, HY, 0.34, 0.08);
    for (const x of [-1, 1]) piv({ at: [x * 0.285, HY, -0.18], axis: 'y', rest: 0, max: x * 1.15, wob: 0.06, ph: x, build: (Q) => { // Panzertuer mit Schleimfutter
      Q.box(0.03, 0.42, 0.24, SP[2], { x: x * 0.015, z: 0.12 }); Q.box(0.035, 0.3, 0.12, SP[3], { x: -x * 0.012, z: 0.13, glow: 0.3 });
      spike(Q, [x * 0.02, 0.18, 0.2], [x * 0.14, 0.3, 0.26], 0.04, SP[0]);
      slimeBlob(Q, -x * 0.03, -0.1, 0.13, 0.04);
    } });
    c.mem = { y: 0, z: -0.2, rad: 0.15, base: '#3a4a0c', cap: '#d8f030' };
    c.rim = { color: SP[3] };
    c.fx.push({ kind: 'poison', cols: ['#b6d81c', '#e4f23c'], rate: 4, at: [0, HY + 0.35, 0] }, { kind: 'ember', rate: 3, at: [0, HY, -0.3] });
  },
};

/** -> THREE.Group (Waffen-Frame). userData: glow (Material), gearGlow, twoHand, fx, glowBase, kk {...} */
export function buildKrachkisteLook(tier = 1, branch = null) {
  const key = kkLookKey(tier, branch);
  const mat = gearMaterial(1);
  const P = new GearParts(), fx = [], pivots = [];
  const root = new THREE.Group();
  const B = (w, h, d, color, x = 0, y = 0, z = 0, at = {}) => P.box(w, h, d, color, { x, y: HY + y, z, ...at });
  const c = { P, B, fx, key, stickCol: {}, mem: null, rim: null, piv: null };
  c.piv = (o) => makePivot(root, mat, pivots, o);
  LOOKS[key](c);
  frame(c, c.stickCol);
  // Membran-Zierring (Sicke) vor der Frontflaeche
  if (c.rim) P.cyl(c.mem.rad * 1.28, c.mem.rad * 1.28, 0.035, 12, c.rim.color, { y: HY + c.mem.y, z: c.rim.z ?? c.mem.z + 0.012, rx: PI / 2 });
  const main = new THREE.Mesh(P.merge(), mat);
  root.add(main);
  const m = c.mem;
  const mem = membrane(m.rad, m.base, m.cap);
  if (m.parent) { mem.mesh.position.set(0, m.pyAbs ?? 0, m.pz ?? -0.04); m.parent.add(mem.mesh); } else { mem.mesh.position.set(0, HY + m.y, m.z); root.add(mem.mesh); }
  // Sample-Kragen: drei Symbol-Wuerfel ▲■● am Stiel, immer an derselben Stelle
  const slots = [];
  const slotGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  for (let i = 0; i < 3; i++) {
    const sm = new THREE.MeshBasicMaterial({ map: symTex(0), fog: false });
    const sp = new THREE.Mesh(slotGeo, sm);
    sp.position.set(0, -0.44 - i * 0.12, 0);
    root.add(sp);
    slots.push({ sp, mat: sm, cell: 0 });
  }
  root.scale.setScalar(1.18); // Kopf gut lesbar aus der Verfolgerkamera
  root.userData = {
    glow: mat, gearGlow: mat.userData.glow, twoHand: { lo: 0.2, hi: 0.5 }, fx, glowBase: tier >= 4 ? 0.9 : tier === 3 ? 0.8 : 0.5,
    kk: { key, tier, branch, pivots, slots, mem, main, open: 0, t: 0, pump: 0, pumpCol: [1, 1, 1], eq: null },
  };
  setSlots(root.userData.kk, []);
  return markSprenger(root, tier, branch);
}

/** Leiste (Array 'r'|'b'|'g', FIFO, aelteste zuerst) auf den Kragen legen. Slot i = i-tes Sample (von oben nach unten am Stiel). */
export function setSlots(kk, bar) {
  kk.slots.forEach((s, i) => {
    const cell = CELL[bar[i] ?? ''];
    if (cell === s.cell) return;
    s.cell = cell;
    s.mat.map = symTex(cell);
  });
}
