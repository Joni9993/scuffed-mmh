import * as THREE from 'three';
import { Parts } from '../../render/vcolor.js';
import { GearParts, gearMaterial } from '../../render/gearfx.js';
import { lambert } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';
import { BROCKEN_PAL as PAL } from './weaponLook.js';

// [GA] Glitchaxt-Optik (GDD 17.2): Stiel mit festem Anker-Teil + 10 lose Datenbloecke. Die Bloecke morphen in ~0,2 s zwischen
// Axt-Anordnung (Klumpen am Stielende) und Schwert-Anordnung (Reihe entlang der Verlaengerung) und leuchten vom Griff aus magenta
// (Druck). Je Stufe/Ast eigene Block-Form + Palette (Brocken-Material). Waffen-Frame wie alle Waffen: Griff im Ursprung, Kopf entlang -y,
// Schneide/Vorderseite = -z. Ein gemergtes Mesh fuer Stiel + Anker, ein Mesh je Block (gemeinsame Geometrie je Look, 2 Varianten).

export const GA_N = 10;
const hash = (i) => { const s = Math.sin(i * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ss = (t) => t * t * (3 - 2 * t);
const MAGENTA = [1, 0.1, 0.8];
const SEAM = '#8a1a78'; // unbeleuchtet dunkel, mit glow-Uniform x1,6 helles Magenta
const TINT = 0.1; // schwacher Magenta-Schein ueber den ganzen Block
export const MORPH_TIME = 0.2;

// ------------------------------------------------------------------ Anordnungen: [x, y, z, sx, sy, sz, rx, ry, rz], Index 0 = naechster Block am Griff
export const AXT = [
  [0, -0.50, 0, 0.7, 0.9, 0.9, 0, 0, 0],
  [0, -0.68, 0, 0.85, 0.9, 0.9, 0, 0, 0],
  [0, -0.86, 0, 1.0, 1.0, 1.0, 0, 0, 0],
  [0, -1.02, 0, 1.15, 1.2, 1.2, 0, 0, 0],
  [0, -1.02, 0.21, 0.9, 1.0, 0.9, 0, 0, 0],
  [0, -0.84, -0.22, 0.75, 1.0, 1.2, 0.35, 0, 0],
  [0, -1.02, -0.27, 0.8, 1.2, 1.4, 0, 0, 0],
  [0, -1.20, -0.22, 0.75, 1.0, 1.2, -0.35, 0, 0],
  [0, -0.82, -0.47, 0.55, 1.0, 0.8, 0.55, 0, 0],
  [0, -1.22, -0.47, 0.55, 1.0, 0.8, -0.55, 0, 0],
];
export const SCHWERT = Array.from({ length: GA_N }, (_, i) => [0, -0.40 - i * 0.152, 0, 1.12 - i * 0.045 - (i === GA_N - 1 ? 0.2 : 0), 0.84 - (i === GA_N - 1 ? 0.12 : 0), 0.85 - i * 0.015, 0, 0, 0]);

// ------------------------------------------------------------------ Block-Formen je Look (Bounding ~0.22 x 0.16 x 0.10, vorn = -z)
function blockGeo(key, v) {
  const P = new GearParts();
  const { RUST, BONE, JP, BZ, BR, KR, GG, VT, TOOTH } = PAL;
  switch (key) {
    case 'rust': // Rost-Wuerfel: verbeulter Blechklotz, Schrauben, Rostfleck
      P.box(0.22, 0.16, 0.10, RUST[2]); P.box(0.22, 0.04, 0.105, RUST[1], { y: -0.07 });
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.024, 0.024, 0.02, RUST[4], { x: x * 0.085, y: y * 0.055, z: 0.058 });
      P.box(0.08, 0.06, 0.012, RUST[3], { x: v ? 0.04 : -0.05, y: 0.01, z: 0.056 });
      if (v) P.box(0.07, 0.07, 0.11, RUST[4], { x: 0.08, y: 0.065, rz: 0.4 });
      break;
    case 'bone': // Knochen: Rohr mit Gelenkknollen
      P.box(0.17, 0.12, 0.085, BONE[0]);
      for (const o of [-1, 1]) { P.sphere(0.065, 5, 4, BONE[1], { x: o * 0.095, y: 0.02 }); P.sphere(0.05, 5, 4, BONE[1], { x: o * 0.1, y: -0.04, z: 0.01 }); }
      P.box(0.12, 0.018, 0.09, BONE[2], { y: v ? 0.02 : -0.02 }); P.box(0.022, 0.1, 0.09, BONE[2], { x: 0.03 });
      break;
    case 'jag': // Jaggo: violette Schuppenplatte, Reisszahn nach vorn, oranger Kamm obenauf
      P.box(0.22, 0.15, 0.10, JP[0]); P.box(0.22, 0.03, 0.105, JP[2], { y: -0.06 }); P.box(0.03, 0.15, 0.106, JP[1], { x: -0.06 }); P.box(0.03, 0.15, 0.106, JP[1], { x: 0.06 });
      P.cone(0.045, 0.14, 4, TOOTH, { z: -0.09, rx: -Math.PI / 2, y: v ? 0.02 : -0.01 });
      P.cone(0.05, 0.13, 3, JP[3], { y: 0.12, x: v ? 0.04 : -0.03, rz: v ? -0.2 : 0.1 }); P.cone(0.035, 0.09, 3, JP[4], { y: 0.1, x: v ? -0.06 : 0.07 });
      break;
    case 'barr': // Barrotz: Hornplatten uebereinander, Schlammband, Schock-Nubbel
      P.box(0.23, 0.07, 0.11, BZ[0], { y: 0.045 }); P.box(0.20, 0.07, 0.115, BZ[2], { y: -0.03, x: v ? 0.015 : -0.015 });
      P.box(0.23, 0.025, 0.12, BZ[4], { y: 0.0 }); P.box(0.05, 0.1, 0.02, BZ[3], { x: -0.07, y: 0.0, z: 0.06 });
      P.cone(0.025, 0.07, 4, '#9fe8ff', { x: v ? -0.08 : 0.08, y: 0.1, z: 0.03 });
      break;
    case 'brat': // Brathalos: rote Schuppe (Dach), Hornspitze, Glutader
      P.box(0.2, 0.11, 0.095, BR[0]); P.cone(0.115, 0.1, 4, BR[2], { y: 0.09, ry: Math.PI / 4, sz: 0.8 }); P.box(0.2, 0.025, 0.1, BR[1], { y: -0.06 });
      P.box(0.17, 0.016, 0.1, BR[3], { y: 0.0, z: 0.0 }); P.cone(0.035, 0.12, 3, BR[5], { z: -0.09, rx: -Math.PI / 2, y: v ? -0.02 : 0.02 });
      break;
    case 'kroll': // Kroll: genietetes Kesselblech, Plattenkanten, Rohrstummel
      P.box(0.22, 0.16, 0.10, KR[0]); P.box(0.23, 0.025, 0.105, KR[2], { y: 0.07 }); P.box(0.23, 0.025, 0.105, KR[2], { y: -0.07 }); P.box(0.02, 0.16, 0.106, KR[1], { x: v ? 0.03 : -0.03 });
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box(0.022, 0.022, 0.018, KR[4], { x: x * 0.09, y: y * 0.055, z: 0.056 });
      P.cyl(0.025, 0.025, 0.09, 5, KR[6], { x: v ? -0.07 : 0.07, y: 0.1 }); P.box(0.05, 0.04, 0.02, KR[5], { y: 0.0, z: 0.058, x: -0.04 });
      break;
    case 'gorgo': // Gorgo: dunkle Schlacke, Glutriss, Zahn
      P.box(0.21, 0.16, 0.10, GG[0]); P.box(0.22, 0.05, 0.095, GG[2], { y: 0.055, x: v ? 0.01 : -0.01 }); P.box(0.22, 0.03, 0.11, GG[1], { y: -0.06 });
      P.box(0.11, 0.016, 0.012, GG[3], { x: -0.02, y: 0.01, z: 0.056, rz: 0.55 }); P.box(0.05, 0.012, 0.012, GG[4], { x: 0.04, y: -0.03, z: 0.057, rz: -0.4 });
      P.cone(0.03, 0.1, 3, GG[5], { y: 0.11, x: v ? 0.06 : -0.06 });
      break;
    case 'volt': // Voltaro: Kupferspule mit Navy-Kappen und Funkenspitze
      P.cyl(0.062, 0.062, 0.2, 6, VT[0], { rz: Math.PI / 2 });
      for (const x of [-0.06, 0, 0.06]) P.cyl(0.068, 0.068, 0.022, 6, VT[1], { x, rz: Math.PI / 2 });
      for (const o of [-1, 1]) P.box(0.03, 0.15, 0.1, VT[2], { x: o * 0.1 });
      P.box(0.04, 0.04, 0.04, VT[4], { y: 0.09, x: v ? 0.05 : -0.05 }); P.box(0.014, 0.05, 0.014, VT[5], { y: 0.12, x: v ? 0.05 : -0.05 });
      break;
    default: // Funkenfuerst: goldener Block, Navy-Einlagen, helle Leiterbahn
      P.box(0.23, 0.17, 0.105, VT[6]); P.box(0.19, 0.04, 0.11, VT[2], { y: 0.0 }); P.box(0.04, 0.17, 0.11, VT[3], { x: v ? 0.06 : -0.06 });
      P.box(0.17, 0.012, 0.112, VT[4], { y: 0.0 }); P.box(0.03, 0.03, 0.03, VT[5], { x: v ? -0.09 : 0.09, y: 0.06, z: 0.055 });
      break;
  }
  // Fugen: duenne Magenta-Rahmen oben/unten, ragen seitlich ueber den Block -> leuchten vom Griff aus je nach Druck (glow = 1)
  for (const y of [-1, 1]) P.box(0.238, 0.014, 0.116, SEAM, { y: y * 0.084, glow: 1 });
  return P.merge();
}

// ------------------------------------------------------------------ Stiel + Anker-Teil (festes Teil, morpht nie)
function shaftGeo(key, tier) {
  const P = new Parts();
  const { RUST, BONE, JP, BZ, BR, KR, GG, VT, TOOTH } = PAL;
  const wood = { rust: '#5a4a38', bone: BONE[2], jag: JP[1], barr: BZ[4], brat: BR[1], kroll: KR[3], gorgo: GG[1], volt: VT[2], fuerst: VT[2] }[key];
  const wrap = { rust: '#a08a5a', bone: '#7a4a2a', jag: JP[0], barr: BZ[3], brat: BR[5], kroll: KR[2], gorgo: GG[3], volt: VT[1], fuerst: VT[6] }[key];
  P.box(0.055, 1.5, 0.055, '#2a2438', { y: -0.4 }); // Kern (zwischen den Bloecken sichtbar)
  P.box(0.075, 0.74, 0.075, wood, { y: 0.0 }); // Griffholz
  for (let i = 0; i < 6; i++) P.box(0.095, 0.04, 0.095, wrap, { y: -0.13 + i * 0.1, ry: i % 2 ? 0.3 : -0.3 }); // Wicklung
  P.box(0.11, 0.07, 0.11, wrap, { y: 0.4 }); // Knauf
  // Anker-Teil an der Zwinge: je Brocken ein Erkennungsmerkmal
  const ay = -0.27;
  switch (key) {
    case 'rust': P.box(0.17, 0.08, 0.17, RUST[4], { y: ay }); for (const x of [-1, 1]) P.box(0.03, 0.03, 0.03, RUST[3], { x: x * 0.07, y: ay, z: 0.09 }); break;
    case 'bone': P.sphere(0.085, 6, 5, BONE[0], { y: ay, sx: 1.4, sz: 1.0 }); for (const o of [-1, 1]) P.box(0.04, 0.04, 0.02, '#2a2218', { x: o * 0.045, y: ay + 0.01, z: 0.085 }); break;
    case 'jag': for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; P.cone(0.03, 0.12, 3, TOOTH, { x: Math.cos(a) * 0.09, y: ay, z: Math.sin(a) * 0.09, rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2 }); } P.box(0.13, 0.05, 0.13, JP[2], { y: ay }); break;
    case 'barr': P.box(0.2, 0.09, 0.2, BZ[1], { y: ay }); for (const o of [-1, 1]) P.cone(0.045, 0.16, 4, BZ[2], { x: o * 0.13, y: ay + 0.04, rz: -o * 0.6 }); break;
    case 'brat': P.box(0.14, 0.06, 0.14, BR[0], { y: ay }); for (const o of [-1, 1]) { P.cone(0.04, 0.2, 3, BR[5], { x: o * 0.14, y: ay + 0.06, rz: -o * 0.9 }); P.box(0.02, 0.16, 0.1, BR[2], { x: o * 0.09, y: ay - 0.08, rz: o * 0.3 }); } break;
    case 'kroll': P.box(0.16, 0.05, 0.16, KR[3], { y: ay }); P.box(0.17, 0.02, 0.02, KR[5], { y: ay + 0.05 }); P.box(0.02, 0.02, 0.17, KR[5], { y: ay + 0.05 }); P.cyl(0.02, 0.02, 0.1, 5, KR[6], { y: ay + 0.1 }); break;
    case 'gorgo': for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; P.cone(0.03, 0.12, 3, GG[5], { x: Math.cos(a) * 0.1, y: ay, z: Math.sin(a) * 0.1, rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2 }); } P.box(0.13, 0.05, 0.13, GG[3], { y: ay }); break;
    case 'volt': for (let i = 0; i < 4; i++) P.cyl(0.085, 0.085, 0.022, 6, i % 2 ? VT[1] : VT[0], { y: ay + i * 0.035 }); P.cone(0.025, 0.14, 4, VT[4], { y: ay + 0.2 }); break;
    default: for (let i = 0; i < 4; i++) P.cyl(0.095, 0.095, 0.022, 6, i % 2 ? VT[2] : VT[6], { y: ay + i * 0.035 }); P.box(0.04, 0.04, 0.04, VT[5], { y: ay + 0.17 }); for (const o of [-1, 1]) P.cone(0.025, 0.14, 4, VT[4], { x: o * 0.12, y: ay + 0.05, rz: -o * 1.0 }); break;
  }
  if (tier >= 6) P.box(0.04, 0.04, 0.04, VT[5], { y: 0.5 });
  return P.merge();
}

export function gaLookKey(tier, branch) {
  if (tier >= 6) return 'fuerst';
  if (tier === 5) return branch === 'g' ? 'gorgo' : branch === 'v' ? 'volt' : 'kroll';
  if (tier === 4) return 'brat';
  if (tier === 3) return branch === 'b' ? 'barr' : 'jag';
  return tier === 2 ? 'bone' : 'rust';
}
/** Wie schief die Bloecke sitzen: niedrige Stufe = schief + ruckelig, hohe = sauber. */
const SKEW = { rust: 0.3, bone: 0.2, jag: 0.14, barr: 0.14, brat: 0.08, kroll: 0.05, gorgo: 0.05, volt: 0.04, fuerst: 0 };
const BASE_EM = { rust: [0, 0, 0], bone: [0, 0, 0], jag: [0.04, 0.0, 0.1], barr: [0, 0.05, 0.06], brat: [0.2, 0.05, 0], kroll: [0, 0, 0], gorgo: [0.2, 0.05, 0], volt: [0, 0.06, 0.16], fuerst: [0.16, 0.14, 0.04] };

const _e = new THREE.Euler(), _qb = new THREE.Quaternion(), _q = new THREE.Quaternion();
const slotQ = (s, skew, i, out) => out.setFromEuler(_e.set(s[6] + (hash(i * 3 + 1) - 0.5) * 2 * skew, s[7] + (hash(i * 3 + 2) - 0.5) * 2 * skew * 0.8, s[8] + (hash(i * 3 + 3) - 0.5) * 2 * skew, 'YXZ'));

let GHOST_MAT = null;
const ghostMat = () => (GHOST_MAT ??= new THREE.MeshBasicMaterial({ color: '#18e6ff', transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));

export function buildGlitchaxtLook(tier = 1, branch = null) {
  const top = Math.min(6, Math.max(1, tier));
  const key = gaLookKey(top, branch);
  const sk = SKEW[key];
  const root = new THREE.Group();
  const shaft = new THREE.Mesh(shaftGeo(key, top), lambert({ vertexColors: true, map: tex('grain', { size: 16 }) }));
  root.add(shaft);
  const geos = [blockGeo(key, 0), blockGeo(key, 1)];
  const big = top >= 6 ? 1.12 : 1;
  const blocks = [];
  for (let i = 0; i < GA_N; i++) {
    const m = gearMaterial(0);
    m.emissive = new THREE.Color(0, 0, 0);
    const mesh = new THREE.Mesh(geos[i % 2], m);
    root.add(mesh);
    const gh = new THREE.Mesh(geos[i % 2], ghostMat());
    gh.visible = false;
    root.add(gh);
    const a = AXT[i], b = SCHWERT[i];
    const jx = (hash(i * 5 + 11) - 0.5) * sk * 0.12, jz = (hash(i * 5 + 12) - 0.5) * sk * 0.12;
    const qa = slotQ(a, sk, i, new THREE.Quaternion()), qb = slotQ(b, sk, i + 20, new THREE.Quaternion());
    const dir = new THREE.Vector3(a[0] + (hash(i + 30) - 0.5) * 0.6, (hash(i + 40) - 0.5) * 0.8, a[2] + (hash(i + 50) - 0.5) * 0.9).normalize();
    blocks.push({ mesh, ghost: gh, mat: m, a, b, qa, qb, jx, jz, dir, sx: big, spin: (hash(i + 60) - 0.5) * 6 });
    mesh.position.set(a[0] + jx, a[1], a[2] + jz);
    mesh.quaternion.copy(qa);
    mesh.scale.set(a[3] * big, a[4] * big, a[5] * big);
  }
  root.userData = { twoHand: { lo: 0.22, hi: 0.42 }, ga: { key, tier: top, branch, blocks, shaft, k: 0, t: 0, tilt: 0, sk, em: BASE_EM[key], c: 0 } };
  return root;
}

/**
 * Pro Frame. s = { mode:'axt'|'schwert', druck:0..100, blitz:bool, glitch:bool, anim:string|null, at:number }
 * (anim/at = laufender Move: Entladung/Kernschmelze/Fehlzuendung/Husten steuern die Bloecke).
 */
export function updateGlitchaxtLook(root, s, dt) {
  const g = root?.userData.ga;
  if (!g) return;
  g.t += dt;
  const t = g.t;
  const target = s.mode === 'schwert' ? 1 : 0;
  g.k = g.k < target ? Math.min(target, g.k + dt / MORPH_TIME) : Math.max(target, g.k - dt / MORPH_TIME);
  const anim = s.anim ?? '', at = s.at ?? 0;
  const entl = anim.startsWith('ga_entlad'), fin = anim === 'ga_finisher', fehl = anim === 'ga_fehl', hust = anim === 'ga_husten';
  g.c += ((entl || (fin && at < 0.72) ? 1 : 0) - g.c) * Math.min(1, dt * 12);
  g.tilt = fehl ? 1 : Math.max(0, g.tilt - dt * 0.7);
  const ov = fin && at < 0.72 ? clamp(at / 0.4, 0, 1) : 0;
  const ex = fin && at >= 0.72 ? clamp((at - 0.72) / 0.28, 0, 1) : 0;
  const fb = fehl ? (at < 0.22 ? at / 0.22 : 1 - ss(clamp((at - 0.22) / 0.28, 0, 1))) : 0;
  const hu = hust ? Math.sin(clamp(at / 0.35, 0, 1) * Math.PI) : 0;
  const wob = s.mode === 'schwert' && s.druck > 0 && s.druck <= 15 ? 0.5 + 0.5 * (1 - s.druck / 15) : 0;
  const lit = (s.druck / 100) * GA_N;
  const pulse = 0.88 + 0.12 * Math.sin(t * 5);
  const flash = entl && at > 0.4 ? 0.5 + 0.5 * Math.sin(at * 57) : 0;
  const snapN = Math.floor(t * 30);
  for (let i = 0; i < GA_N; i++) {
    const B = g.blocks[i];
    const kb = clamp((g.k - i * 0.03) / 0.73, 0, 1);
    const e = ss(kb);
    const j = 4 * kb * (1 - kb); // Morph-Mitte: in Pixel aufgeloest
    let x = B.a[0] + (B.b[0] - B.a[0]) * e + B.jx, y = B.a[1] + (B.b[1] - B.a[1]) * e, z = B.a[2] + (B.b[2] - B.a[2]) * e + B.jz;
    let sx = B.a[3] + (B.b[3] - B.a[3]) * e, sy = B.a[4] + (B.b[4] - B.a[4]) * e, sz = B.a[5] + (B.b[5] - B.a[5]) * e;
    _q.copy(B.qa).slerp(B.qb, e);
    let jit = j * 0.05;
    if (j > 0.02) {
      const h1 = hash(i * 7 + snapN) - 0.5, h2 = hash(i * 11 + snapN * 3) - 0.5, h3 = hash(i * 13 + snapN * 5) - 0.5;
      x += Math.round(h1 * 6) * 0.025 * j; y += Math.round(h2 * 6) * 0.025 * j; z += Math.round(h3 * 6) * 0.025 * j;
      const sh = 1 - 0.4 * j; sx *= sh; sy *= sh; sz *= sh;
    }
    if (g.c > 0.01) { // Entladung / Ueberladen: Bloecke ziehen sich zum Ball zusammen
      const bx = Math.cos(i * 2.4) * 0.06, bz = Math.sin(i * 2.4) * 0.06;
      x += (bx - x) * g.c * 0.9; y += (-0.78 + (i - 4.5) * 0.02 - y) * g.c * 0.85; z += (bz - z) * g.c * 0.9;
      const sc = 1 - 0.3 * g.c; sx *= sc; sy *= sc; sz *= sc;
    }
    if (ov > 0 || flash > 0) {
      x += (hash(i + snapN * 2) - 0.5) * 0.03 * (ov + flash); z += (hash(i + 5 + snapN) - 0.5) * 0.03 * (ov + flash);
      const sc = 1 + 0.12 * Math.sin(t * 50 + i) * ov + 0.1 * flash; sx *= sc; sy *= sc; sz *= sc;
    }
    if (ex > 0 || fb > 0) { // Kernschmelze-Explosion / Fehlzuendung: Bloecke platzen weg
      const r = ex > 0 ? Math.sin(ex * Math.PI) * 0.9 : fb * 0.75 * (0.6 + hash(i + 70));
      x += B.dir.x * r; y += B.dir.y * r; z += B.dir.z * r;
      _q.multiply(_qb.setFromEuler(_e.set(B.spin * (ex > 0 ? ex : fb) * 0.5, B.spin * 0.3 * fb, B.spin * 0.4 * fb, 'YXZ')));
    }
    if (g.tilt > 0.01) _q.multiply(_qb.setFromEuler(_e.set((hash(i + 80) - 0.5) * 0.7 * g.tilt, 0, (hash(i + 90) - 0.5) * 0.9 * g.tilt, 'YXZ'))); // schief zurueckgeschnappt
    if (wob > 0) {
      x += Math.sin(t * 52 + i * 1.7) * 0.014 * wob; z += Math.sin(t * 47 + i * 2.3) * 0.012 * wob;
      _q.multiply(_qb.setFromEuler(_e.set(0, 0, Math.sin(t * 44 + i) * 0.09 * wob, 'YXZ')));
    }
    if (hu > 0) { const p = 1 + 0.22 * hu * (hash(i + 3) > 0.4 ? 1 : 0.3); sx *= p; sy *= p; sz *= p; jit = Math.max(jit, 0.04 * hu); }
    if (s.blitz) { const p = 1.05 + 0.04 * Math.sin(t * 40); sx *= p; sy *= p; sz *= p; }
    if (s.glitch) { y += Math.sin(t * 3 + i * 0.9) * 0.025; x += Math.sin(t * 2.3 + i) * 0.015; }
    B.mesh.position.set(x, y, z);
    B.mesh.quaternion.copy(_q);
    B.mesh.scale.set(sx * B.sx, sy * B.sx, sz * B.sx);
    // Glut: Fugen leuchten magenta vom Griff aus (glow-Uniform je Block), Blitz = weiss; Ueberladen/Entladung = weiss-magenta
    const gi = clamp(lit - i, 0, 1) * pulse;
    let r = MAGENTA[0] * gi * TINT + g.em[0], gr = MAGENTA[1] * gi * TINT + g.em[1], b = MAGENTA[2] * gi * TINT + g.em[2];
    const white = s.blitz ? 0.75 + 0.25 * Math.sin(t * 40) : Math.max(ov * 0.9, flash * 0.8, ex > 0 ? 1 - ex : 0, 0.7 * j, fehl ? fb * 0.5 : 0);
    if (white > 0) { r += (1 - r) * white; gr += (0.95 - gr) * white; b += (1 - b) * white; }
    B.mat.emissive.setRGB(Math.min(1, r), Math.min(1, gr), Math.min(1, b));
    B.mat.userData.glow.value = gi * (1 - Math.min(1, white * 1.2));
    B.mat.userData.ps1.uJit.value = jit;
    // Zustandsfehler: Geisterbloecke in der jeweils anderen Anordnung
    B.ghost.visible = !!s.glitch;
    if (s.glitch) {
      const o = s.mode === 'schwert' ? B.a : B.b, oq = s.mode === 'schwert' ? B.qa : B.qb;
      const off = Math.sin(t * 9 + i) * 0.03;
      B.ghost.position.set(o[0] + B.jx + 0.05 + off, o[1], o[2] + B.jz);
      B.ghost.quaternion.copy(oq);
      B.ghost.scale.set(o[3] * B.sx * 1.04, o[4] * B.sx * 1.04, o[5] * B.sx * 1.04);
    }
  }
}
