import * as THREE from 'three';
import { GearParts, gearMaterial, bar, spike, tri } from '../../render/gearfx.js';

// [G] Tier/branch weapon looks (GDD 8.6): tier 1 rusty & small -> tier 2 bone -> tier 3 branch parts (a = Jaggo, b = Barrotz)
// -> tier 4 -> tier 5/6 (Rostwerke: k Kroll, g Gorgo, v Voltaro, 6 Funkenfuerst). JEDE Stufe/jeder Ast hat eine eigene Silhouette aus den Teilen seines Brockens (kein Stufe-4-Unterbau mit Aufbauten).
// Each builder returns ONE merged vertex-coloured mesh per weapon piece.
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



// ------------------------------------------------------------------ Paletten der Brocken
const KR = ['#9a4a26', '#7a3418', '#c8741e', '#4a4a50', '#d8d0c0', '#ffb030', '#a0a0a8']; // Kroll: Kesselblech, dunkel, Kante, Stahl, Nieten, Glut, Rohr
const GG = ['#3a3330', '#241f1d', '#463d38', '#ff6a1a', '#ffb040', '#d8c8a8'];            // Gorgo: Schlacke, Spalt, Segment-Hi, Glut, Glut-hell, Zahn
const VT = ['#b8642a', '#d88a4a', '#1a1e2a', '#2a3350', '#5ad0ff', '#fff0a0', '#ffd84a']; // Voltaro: Kupfer, Kupfer-hell, Navy, Navy-hell, Funke, Funke-hell, Gold
const TOOTH = '#f0e8d0';

const KEYS = ['rust', 'bone', 'jag', 'barr', 'brat', 'kroll', 'gorgo', 'volt', 'fuerst'];
function lookKey(top, branch) {
  if (top >= 6) return 'fuerst';
  if (top === 5) return branch === 'g' ? 'gorgo' : branch === 'v' ? 'volt' : 'kroll';
  if (top === 4) return 'brat';
  if (top === 3) return branch === 'b' ? 'barr' : 'jag';
  return top === 2 ? 'bone' : 'rust';
}

/** Flaches Polygon (einfach, ggf. konkav) von x/y-Punkten, in z um +-th/2 extrudiert (eigene Normalen = harte PS1-Kanten). */
function poly(P, pts, th, color, at = {}) {
  const n = pts.length, h = th / 2;
  const idx = THREE.ShapeUtils.triangulateShape(pts.map((p) => new THREE.Vector2(p[0], p[1])), []);
  let area = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const pos = [], nor = [], ind = [];
  for (const z of [h, -h]) for (const p of pts) { pos.push(p[0], p[1], z); nor.push(0, 0, z > 0 ? 1 : -1); }
  for (const t of idx) {
    const [a, b, c] = area > 0 ? t : [t[0], t[2], t[1]];
    ind.push(a, b, c, n + a, n + c, n + b);
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], k = pos.length / 3;
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if (area < 0) { nx = -nx; ny = -ny; }
    pos.push(a[0], a[1], h, b[0], b[1], h, b[0], b[1], -h, a[0], a[1], -h);
    for (let j = 0; j < 4; j++) nor.push(nx, ny, 0);
    if (area > 0) ind.push(k, k + 2, k + 1, k, k + 3, k + 2); else ind.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.setIndex(ind);
  return P.add(g, color, at);
}

/** Zickzack-Funkenbogen aus leuchtenden Balken. */
function sparkArc(P, a, b, n, jag, color, seed = 0, r = 0.03) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = i === n ? b : [a[0] + (b[0] - a[0]) * t + (hash(i + seed) - 0.5) * jag, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + (hash(i + seed + 5) - 0.5) * jag];
    bar(P, prev, p, r, r, color, { glow: 1 });
    prev = p;
  }
}

/** Kontext fuer Klingen (Plattmacher/Zwillingsklingen): Griff im Ursprung, Klinge ab y=-0.2 entlang -y (Tiefe d), sd = Seite (Spiegel fuer die linke Hand). */
function bladeCtx(P, fx, key, gs, flip) {
  const i = KEYS.indexOf(key);
  const L = (gs ? [1.55, 1.75, 1.95, 1.8, 2.1, 1.95, 2.15, 2.1, 2.3] : [0.6, 0.75, 0.88, 0.8, 1.0, 0.9, 0.95, 0.95, 1.1])[i];
  const W = (gs ? [0.36, 0.3, 0.42, 0.42, 0.5, 0.46, 0.44, 0.44, 0.44] : [0.12, 0.13, 0.17, 0.2, 0.2, 0.2, 0.18, 0.15, 0.17])[i];
  const th = (gs ? [0.07, 0.1, 0.09, 0.13, 0.1, 0.1, 0.1, 0.08, 0.09] : [0.04, 0.05, 0.05, 0.07, 0.04, 0.05, 0.05, 0.04, 0.045])[i];
  const cv = gs ? 0 : [0.05, 0.35, 0.1, 0, 0.3, 0, 0.12, 0, 0][i];
  const c = { P, fx, key, gs, L, W, th, sd: flip, S: gs ? 1 : 0.42, gl: gs ? 0.74 : 0.34, gw: gs ? 0.12 : 0.075 };
  c.X = (d) => flip * cv * L * (d / L) ** 2;
  c.pt = (d, o) => [c.X(d) + flip * o, -0.2 - d];
  c.p3 = (d, o, z = 0) => [c.X(d) + flip * o, -0.2 - d, z];
  c.top = c.gl - 0.16; // Griff-Oberkante
  c.grip = (color, wrap, n = 4) => {
    P.box(c.gw, c.gl, c.gw, color, { y: c.gl / 2 - 0.16 });
    for (let k = 0; k < n; k++) P.box(c.gw + 0.025, 0.045 * (gs ? 1 : 0.8), c.gw + 0.025, wrap, { y: -0.05 + k * (c.gl - 0.2) / n });
  };
  return c;
}

// ------------------------------------------------------------------ Klingen-Familien: je Brocken eine eigene Form
const BLADES = {
  // Stufe 1: Schrott-Werkzeug -- schiefe Blechplatte mit Meisselspitze, Nieten, Holzgriff
  rust(c) {
    const { P, L, W, th, S } = c;
    c.grip('#6a4a30', '#a08a5a', 4);
    P.box(W * 0.9, 0.07, 0.12, RUST[4], { y: -0.17, rz: 0.08 });
    poly(P, [c.pt(0, -W * 0.5), c.pt(0, W * 0.5), c.pt(L * 0.25, W * 0.58), c.pt(L * 0.45, W * 0.44), c.pt(L * 0.62, W * 0.56), c.pt(L * 0.9, W * 0.4), c.pt(L, -W * 0.02), c.pt(L * 0.82, -W * 0.48), c.pt(L * 0.55, -W * 0.4), c.pt(L * 0.3, -W * 0.58)], th, RUST[2]);
    poly(P, [c.pt(L * 0.32, -W * 0.62), c.pt(L * 0.32, -W * 0.05), c.pt(L * 0.66, -W * 0.05), c.pt(L * 0.66, -W * 0.62)], th * 1.9, '#b0642a'); // aufgeschweisstes Blech
    for (const [d, o] of [[0.36, -0.5], [0.36, -0.14], [0.62, -0.5], [0.62, -0.14]]) P.box(0.05 * S + 0.02, 0.05 * S + 0.02, th * 2.6, RUST[4], { x: c.X(L * d) + c.sd * o * W, y: -0.2 - L * d });
    for (let i = 0; i < 5; i++) poly(P, [c.pt(L * (0.1 + i * 0.17), (i % 2 ? 1 : -1) * W * 0.46), c.pt(L * (0.14 + i * 0.17), (i % 2 ? 1 : -1) * W * 0.3), c.pt(L * (0.18 + i * 0.17), (i % 2 ? 1 : -1) * W * 0.5)], th * 1.5, i % 2 ? RUST[4] : RUST[3]);
    poly(P, [c.pt(L * 0.7, W * 0.2), c.pt(L * 0.8, W * 0.35), c.pt(L * 0.76, W * 0.1)], th * 1.6, RUST[3]);
  },
  // Stufe 2: Knochenklinge -- Oberschenkelknochen mit Gelenkknollen, Sehnenwicklung, Schaedel-Parierstange
  bone(c) {
    const { P, L, W, th, S } = c;
    c.grip(BONE[2], '#7a4a2a', 4);
    P.sphere(0.1 * S + 0.04, 6, 5, BONE[0], { y: -0.14, sx: 1.7, sz: 0.9 }); // Schaedel
    P.box(0.09 * S + 0.03, 0.05 * S + 0.02, 0.05 * S + 0.04, BONE[1], { y: -0.2 - 0.06 * S });
    for (const o of [-1, 1]) { P.box(0.045 * S + 0.015, 0.045 * S + 0.015, 0.05, '#2a2218', { x: o * 0.045 * S * 1.6, y: -0.13, z: 0.09 * S + 0.03 }); bar(P, [o * 0.13 * S * 1.4, -0.12, 0], [o * 0.27 * S * 1.5, 0.06, 0], 0.045 * S + 0.015, 0.01, BONE[0]); }
    poly(P, [c.pt(0, -W * 0.18), c.pt(0, W * 0.18), c.pt(L * 0.1, W * 0.3), c.pt(L * 0.3, W * 0.2), c.pt(L * 0.72, W * 0.3), c.pt(L * 0.95, W * 0.12), c.pt(L, 0), c.pt(L * 0.9, -W * 0.15), c.pt(L * 0.7, -W * 0.34), c.pt(L * 0.3, -W * 0.22), c.pt(L * 0.1, -W * 0.32)], th, BONE[0]);
    for (const d of [0.12, 0.78]) for (const o of [-1, 1]) P.sphere(W * 0.2, 5, 4, BONE[1], { x: c.X(L * d) + c.sd * o * W * 0.14, y: -0.2 - L * d, sz: 0.55 }); // Gelenkknollen
    for (let i = 0; i < 3; i++) P.box(W * 0.66, 0.035, th + 0.04, '#7a4a2a', { x: c.X(L * (0.34 + i * 0.1)), y: -0.2 - L * (0.34 + i * 0.1) });
    for (let i = 0; i < 4; i++) spike(P, [c.X(L * (0.18 + i * 0.17)) - c.sd * W * 0.3, -0.2 - L * (0.18 + i * 0.17), 0], [c.X(L * (0.18 + i * 0.17)) - c.sd * W * 0.62, -0.2 - L * (0.2 + i * 0.17) - 0.1 * S, 0], 0.04 * S + 0.01, BONE[1]);
    P.box(W * 0.05 + 0.01, L * 0.6, th * 1.5, BONE[2], { x: c.X(L * 0.5) + c.sd * W * 0.12, y: -0.2 - L * 0.5 });
  },
  // Stufe 3a Jaggo: Reisszahn mit orangem Kammruecken, Zahnreihe, Schuppengriff
  jag(c) {
    const { P, L, W, th, S } = c;
    c.grip(JP[1], JP[0], 5);
    for (let k = 0; k < 5; k++) P.box(c.gw + 0.03, 0.04, c.gw + 0.03, k % 2 ? JP[2] : JP[0], { y: -0.1 + k * (c.gl - 0.2) / 5 + 0.05 });
    for (const o of [-1, 1]) { bar(P, [o * 0.08, -0.17, 0], [o * 0.28 * (S + 0.3), -0.06, 0.0], 0.05 * S + 0.02, 0.0, JP[3], { glow: 0.3 }); bar(P, [o * 0.1, -0.17, 0], [o * 0.22 * (S + 0.3), -0.34 * (S + 0.2), 0], 0.04 * S + 0.015, 0.0, JP[4], { glow: 0.2 }); }
    P.cone(c.gw * 0.7, 0.2 * (S + 0.3), 4, JP[3], { y: c.top + 0.1, glow: 0.3 });
    poly(P, [c.pt(0, -W * 0.4), c.pt(0, W * 0.4), c.pt(L * 0.5, W * 0.5), c.pt(L * 0.82, W * 0.4), c.pt(L, W * 0.02), c.pt(L * 0.9, -W * 0.3), c.pt(L * 0.55, -W * 0.46)], th, JP[0]);
    for (let i = 0; i < 4; i++) poly(P, [c.pt(L * (0.12 + i * 0.18), -W * 0.42), c.pt(L * (0.12 + i * 0.18), W * 0.42), c.pt(L * (0.15 + i * 0.18), W * 0.42), c.pt(L * (0.15 + i * 0.18), -W * 0.42)], th * 1.3, i % 2 ? JP[1] : JP[2]);
    poly(P, [c.pt(L * 0.04, W * 0.04), c.pt(L * 0.04, -W * 0.04), c.pt(L * 0.86, -W * 0.02), c.pt(L * 0.92, W * 0.02)], th * 1.5, JP[3], { glow: 0.3 });
    const nf = Math.round(L * (c.gs ? 3.4 : 5));
    for (let i = 0; i < nf; i++) { const d = 0.04 * L + (i / nf) * L * 0.88, h = W * (0.5 - 0.3 * i / nf), dl = L * 0.7 / nf * 1.2; poly(P, [c.pt(d, -W * 0.42), c.pt(d + dl, -W * 0.4), c.pt(d + dl * 1.2, -W * 0.42 - h)], th * 0.8, i % 2 ? JP[3] : JP[4], { glow: 0.35 }); } // Kamm
    const nt = Math.round(L * (c.gs ? 3 : 4.4));
    for (let i = 0; i < nt; i++) { const d = L * 0.18 + (i / nt) * L * 0.62, dl = L * 0.55 / nt; poly(P, [c.pt(d, W * 0.46), c.pt(d + dl, W * 0.44), c.pt(d + dl * 0.5, W * 0.46 + W * 0.2)], th * 0.7, TOOTH); } // Zaehne
  },
  // Stufe 3b Barrotz: Kopfplatte als stumpfe Klinge, Hoerner, Schlammkruste, Schwanzkeulen-Knauf
  barr(c) {
    const { P, L, W, th, S } = c;
    c.grip(BZ[4], BZ[3], 3);
    P.box(0.2 * (S + 0.4), 0.18 * (S + 0.4), 0.2 * (S + 0.4), BZ[1], { y: c.top + 0.12 }); // Keulenknauf
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) spike(P, [x * 0.08 * (S + 0.4), c.top + 0.12, z * 0.08 * (S + 0.4)], [x * 0.17 * (S + 0.4), c.top + 0.2 * (S + 0.4), z * 0.17 * (S + 0.4)], 0.04 * S + 0.015, BZ[2]);
    P.box(W * 1.0, 0.12 * S + 0.06, th * 1.7, BZ[1], { y: -0.17 });
    poly(P, [c.pt(0, -W * 0.22), c.pt(0, W * 0.22), c.pt(L * 0.42, W * 0.28), c.pt(L * 0.48, W * 0.42), c.pt(L * 0.48, -W * 0.42), c.pt(L * 0.42, -W * 0.28)], th, BZ[0]);
    poly(P, [c.pt(L * 0.4, -W * 0.28), c.pt(L * 0.4, W * 0.28), c.pt(L * 0.52, W * 0.9), c.pt(L * 0.9, W * 1.0), c.pt(L, W * 0.7), c.pt(L, -W * 0.7), c.pt(L * 0.9, -W * 1.0), c.pt(L * 0.52, -W * 0.9)], th * 2.2, BZ[0]); // Kopfplatte
    poly(P, [c.pt(L * 0.55, -W * 0.14), c.pt(L * 0.55, W * 0.14), c.pt(L * 0.98, W * 0.12), c.pt(L * 0.98, -W * 0.12)], th * 3.1, BZ[2]); // Mittelgrat
    for (const o of [-1, 1]) {
      poly(P, [c.pt(L * 0.9, o * W * 1.0), c.pt(L, o * W * 0.7), c.pt(L * 1.03, o * W * 0.4), c.pt(L * 0.98, o * W * 0.95)], th * 2.6, BZ[2]); // Randleiste
      bar(P, c.p3(L * 0.55, o * W * 0.92), c.p3(L * 0.5, o * W * 1.75), 0.09 * (S + 0.3), 0.03, BZ[2]); // Hoerner
      bar(P, c.p3(L * 0.5, o * W * 1.75), c.p3(L * 0.36, o * W * 1.95), 0.03, 0.0, TOOTH);
    }
    for (let i = 0; i < 11; i++) P.box(0.08 + hash(i) * 0.1 * S, 0.08 + hash(i + 4) * 0.08, 0.09, i % 2 ? BZ[3] : BZ[4], { x: c.X(L * 0.5) + (hash(i + 2) - 0.5) * W * 1.7, y: -0.2 - L * (0.5 + hash(i + 7) * 0.48), z: (hash(i + 5) > 0.5 ? 1 : -1) * th * 1.4, ry: hash(i) * 3 }); // Schlamm
    for (let i = 0; i < 3; i++) P.box(0.05, 0.1 + hash(i) * 0.12, 0.06, BZ[4], { x: c.X(L) + (i - 1) * W * 0.4, y: -0.2 - L - 0.04, z: th * 1.2 }); // Schlammtropfen
    if (!c.gs) c.fx.push({ kind: 'shock', rate: 5, at: [0, -0.2 - L * 0.7, 0] });
  },
  // Stufe 4 Brathalos: Fluegelklinge -- Knochenspant + rote Membran, Horn-Spitze, Glutadern
  brat(c) {
    const { P, L, W, th, S } = c, sd = c.sd;
    c.grip(BR[1], BR[5], 3);
    P.sphere(0.07 * (S + 0.4), 5, 4, BR[4], { y: c.top + 0.08, glow: 1 });
    for (const o of [-1, 1]) bar(P, [o * 0.08, -0.17, 0], [o * 0.1 * (S + 0.6), 0.18 * (S + 0.5), 0.06], 0.05 * S + 0.02, 0.01, BR[5]); // Hoerner nach hinten
    P.box(0.22 * (S + 0.5), 0.07, 0.11, BR[1], { y: -0.17 });
    const R = c.p3(L * 0.1, -W * 0.38), B = c.p3(L * 0.38, -W * 0.1), Sp = c.p3(L * 0.97, -W * 0.14), F1 = c.p3(L * 0.5, W * 1.0), F2 = c.p3(L * 0.82, W * 0.72), F3 = c.p3(L * 0.28, W * 0.62);
    tri(P, B, R, F3, BR[1], { glow: 0.2 }); tri(P, B, F3, F1, BR[0], { glow: 0.25 }); tri(P, B, F1, F2, BR[2], { glow: 0.3 }); tri(P, B, F2, Sp, BR[0], { glow: 0.25 });
    for (const [a, b] of [[B, F3], [B, F1], [B, F2]]) bar(P, a, b, 0.016 + 0.01 * S, 0.012, BR[3], { glow: 1 }); // Glutadern
    poly(P, [c.pt(0, -W * 0.5), c.pt(0, -W * 0.22), c.pt(L, -W * 0.06), c.pt(L * 1.02, -W * 0.22)], th * 1.5, BR[5]); // Knochenspant
    for (const [a, b, r] of [[R, F3, 0.03], [R, F1, 0.035], [B, F2, 0.03]]) bar(P, a, b, r * (S + 0.4), 0.012, BR[5]); // Fingerknochen
    for (const F of [F1, F2, F3]) spike(P, F, [F[0] + sd * 0.1 * (S + 0.3), F[1] - 0.14 * (S + 0.3), 0], 0.035 * S + 0.015, BR[5], { glow: 0.3 });
    spike(P, Sp, [Sp[0] + sd * 0.03, Sp[1] - 0.45 * (S + 0.4), 0], 0.06 * (S + 0.3), BR[5], { glow: 0.2 }); // Horn-Spitze
    spike(P, [Sp[0], Sp[1] - 0.24 * (S + 0.4), 0], [Sp[0] + sd * 0.03, Sp[1] - 0.58 * (S + 0.4), 0], 0.03 * (S + 0.3), BR[4], { glow: 1 });
    c.fx.push({ kind: 'fire', rate: c.gs ? 8 : 5, at: [Sp[0], Sp[1] - 0.3, 0] }, { kind: 'ember', rate: 4, at: [F1[0], F1[1], 0] });
  },
  // Stufe 5k Kroll: Scheren-Klinge -- Kesselkorpus mit Nietenbaendern, Ventilrad, zwei Scheren-Zangen
  kroll(c) {
    const { P, L, W, th, S } = c;
    c.grip(KR[3], KR[1], 3);
    P.cyl(0.15 * (S + 0.5), 0.15 * (S + 0.5), 0.05, 8, KR[3], { y: -0.17, rx: PI / 2 }); // Ventilrad
    for (let k = 0; k < 4; k++) P.box(0.3 * (S + 0.5), 0.032, 0.062, KR[4], { y: -0.17, rz: k * PI / 4 });
    P.box(0.07, 0.07, 0.09, KR[5], { y: -0.17, glow: 0.5 });
    P.cyl(0.05 * (S + 0.6), 0.05 * (S + 0.6), 0.18 * (S + 0.4), 6, KR[3], { y: c.top + 0.1 });
    const bh = L * 0.44, rb = W * 0.55;
    P.cyl(rb, rb * 0.9, bh, 8, KR[0], { y: -0.2 - bh / 2, sz: 0.56 }); // Kessel
    for (const t of [0.12, 0.5, 0.88]) { P.cyl(rb * 1.08, rb * 1.08, 0.06 * (S + 0.6), 8, KR[3], { y: -0.2 - bh * t, sz: 0.62 }); for (let k = 0; k < 5; k++) P.box(0.04 * (S + 0.5), 0.04 * (S + 0.5), 0.04 * (S + 0.5), KR[4], { x: -rb * 0.8 + k * rb * 0.4, y: -0.2 - bh * t, z: rb * 0.5 }); } // Nieten
    bar(P, [rb * 0.9, -0.3, 0.1], [rb * 1.05, -0.2 - bh * 0.9, 0.1], 0.03 * (S + 0.5), 0.03 * (S + 0.5), KR[6]);
    P.cyl(0.07 * (S + 0.5), 0.05 * (S + 0.5), 0.1, 6, KR[2], { x: rb * 0.5, y: -0.15, glow: 0.2 }); // Dampfventil
    const d0 = bh * 0.96;
    poly(P, [c.pt(d0, -W * 0.62), c.pt(d0, -W * 0.1), c.pt(L * 0.72, -W * 0.16), c.pt(L * 0.9, W * 0.12), c.pt(L, W * 0.34), c.pt(L * 0.96, W * 0.02), c.pt(L * 0.86, -W * 0.36), c.pt(L * 0.7, -W * 0.7)], th * 1.5, KR[0]); // grosse Schere
    poly(P, [c.pt(d0, W * 0.08), c.pt(d0, W * 0.62), c.pt(L * 0.8, W * 0.55), c.pt(L * 0.96, W * 0.2), c.pt(L * 0.8, W * 0.2), c.pt(L * 0.65, W * 0.18)], th * 1.5, KR[1]); // kleine Schere
    for (let i = 0; i < 3; i++) poly(P, [c.pt(L * (0.62 + i * 0.09), W * 0.18 - i * 0.02), c.pt(L * (0.66 + i * 0.09), W * 0.18 - i * 0.02), c.pt(L * (0.64 + i * 0.09), W * 0.04 - i * 0.02)], th * 1.2, KR[4]); // Scherenzaehne
    poly(P, [c.pt(L * 0.72, -W * 0.16), c.pt(L * 0.9, W * 0.12), c.pt(L, W * 0.34), c.pt(L, W * 0.3), c.pt(L * 0.9, W * 0.08)], th * 1.9, KR[2]); // Schneidkante
    P.sphere(W * 0.14, 5, 4, KR[5], { x: c.X(d0), y: -0.2 - d0, glow: 1, sz: 0.5 }); // Gelenkbolzen
    c.fx.push({ kind: 'ember', cols: ['#e8f0f4', '#c8d4dc'], rate: 5, at: [rb * 0.5, -0.1, 0] }, { kind: 'ember', rate: 3, at: [c.X(L), -0.2 - L, 0] });
  },
  // Stufe 5g Gorgo: segmentierter Schlackewurm, Zahnring-Maul, Glutrisse
  gorgo(c) {
    const { P, L, W, th, S } = c;
    c.grip(GG[1], GG[2], 4);
    P.sphere(0.07 * (S + 0.5), 5, 4, GG[3], { y: c.top + 0.06, glow: 1 });
    for (let k = 0; k < 7; k++) { const a = k / 7 * PI * 2; spike(P, [Math.cos(a) * 0.07 * (S + 0.5), -0.16, Math.sin(a) * 0.07 * (S + 0.5)], [Math.cos(a) * 0.19 * (S + 0.6), -0.3 * (S + 0.4), Math.sin(a) * 0.19 * (S + 0.6)], 0.035 * (S + 0.4), GG[5]); } // Zahnring-Maul
    P.cyl(0.1 * (S + 0.6), 0.1 * (S + 0.6), 0.04, 7, GG[3], { y: -0.2, glow: 1 });
    poly(P, [c.pt(0, -W * 0.22), c.pt(0, W * 0.22), c.pt(L, W * 0.1), c.pt(L, -W * 0.1)], th * 2.5, GG[3], { glow: 1 }); // Glutkern
    const n = Math.round(L / (c.gs ? 0.27 : 0.2));
    for (let i = 0; i < n; i++) {
      const d0 = 0.03 + (i / n) * (L - 0.03), d1 = d0 + (L / n) * 0.84, w = W * (0.55 - 0.3 * i / n) * (i % 2 ? 0.92 : 1), s = (d1 - d0) * 0.25;
      poly(P, [c.pt(d0, -w * 0.7), c.pt(d0, w * 0.7), c.pt(d0 + s, w), c.pt(d1 - s, w), c.pt(d1, w * 0.7), c.pt(d1, -w * 0.7), c.pt(d1 - s, -w), c.pt(d0 + s, -w)], th * 1.7, i % 2 ? GG[2] : GG[0]);
      poly(P, [c.pt(d0 + s, -w * 0.2), c.pt(d1 - s, w * 0.35), c.pt(d1 - s, w * 0.15), c.pt(d0 + s, -w * 0.4)], th * 1.85, GG[3], { glow: 1 }); // Riss
      spike(P, c.p3((d0 + d1) / 2, -w * 0.9), c.p3((d0 + d1) / 2 + s * 0.6, -w * 1.55), 0.03 * (S + 0.5), GG[1]);
    }
    const tp = c.pt(L, 0);
    spike(P, [tp[0] - c.sd * W * 0.2, tp[1] + 0.12, 0], [tp[0] + c.sd * W * 0.1, tp[1] - 0.32 * (S + 0.5), 0], 0.05 * (S + 0.4), GG[5]);
    spike(P, [tp[0] + c.sd * W * 0.2, tp[1] + 0.12, 0], [tp[0] - c.sd * W * 0.1, tp[1] - 0.32 * (S + 0.5), 0], 0.05 * (S + 0.4), GG[5]);
    c.fx.push({ kind: 'fire', rate: c.gs ? 10 : 6, at: [tp[0], tp[1] - 0.1, 0] }, { kind: 'ember', rate: 4, at: [c.X(L * 0.5), -0.2 - L * 0.5, 0] });
  },
  // Stufe 5v Voltaro: Kupferklinge mit Spulenwicklungen und Antennen-Kamm
  volt(c) {
    const { P, L, W, th, S } = c;
    c.grip(VT[2], VT[0], 5);
    P.sphere(0.07 * (S + 0.5), 5, 4, VT[0], { y: c.top + 0.06 });
    P.box(0.36 * (S + 0.4), 0.05, 0.08, VT[0], { y: -0.17 });
    for (const o of [-1, 1]) P.box(0.06 * (S + 0.4), 0.06 * (S + 0.4), 0.06 * (S + 0.4), VT[4], { x: o * 0.19 * (S + 0.4), y: -0.17, glow: 1 });
    poly(P, [c.pt(0, -W * 0.25), c.pt(0, W * 0.25), c.pt(L * 0.9, W * 0.2), c.pt(L, 0), c.pt(L * 0.9, -W * 0.2)], th, VT[0]);
    poly(P, [c.pt(L * 0.05, -W * 0.06), c.pt(L * 0.05, W * 0.06), c.pt(L * 0.92, W * 0.04), c.pt(L * 0.97, 0), c.pt(L * 0.92, -W * 0.04)], th * 1.3, VT[2]);
    const nc = c.gs ? 5 : 4;
    for (let i = 0; i < nc; i++) P.box(W * 0.58, 0.05 * (S + 0.5), th * 2.3, i % 2 ? VT[0] : VT[1], { x: c.X(L * (0.12 + i * 0.16)), y: -0.2 - L * (0.12 + i * 0.16) }); // Spulen
    P.box(0.05 * (S + 0.4), 0.05 * (S + 0.4), 0.05 * (S + 0.4), VT[5], { x: c.X(L), y: -0.2 - L - 0.03, glow: 1 });
    const tips = [];
    for (let i = 0; i < 4; i++) {
      const d = L * (0.16 + i * 0.2), len = W * (1.0 - i * 0.12) + 0.1 * S;
      const a = c.p3(d, -W * 0.22), b = c.p3(d - L * 0.07, -W * 0.22 - len);
      bar(P, a, b, 0.025 * (S + 0.5), 0.012, VT[1]);
      P.box(0.045 * (S + 0.4), 0.045 * (S + 0.4), 0.045 * (S + 0.4), VT[4], { x: b[0], y: b[1], glow: 1 });
      tips.push(b);
    }
    for (let i = 0; i < 3; i++) sparkArc(P, tips[i], tips[i + 1], 3, 0.06 * (S + 0.5), VT[4], i * 3, 0.014 + 0.012 * S);
    c.fx.push({ kind: 'shock', rate: c.gs ? 8 : 5, at: [tips[0][0], tips[0][1], 0] }, { kind: 'shock', rate: 4, at: [c.X(L), -0.2 - L, 0] });
  },
  // Stufe 6 Funkenfuerst: Stimmgabel-Krone -- Zwillingszinken, Goldkern, Funkenbogen im Spalt, Antennenkrone
  fuerst(c) {
    const { P, L, W, th, S } = c;
    c.grip(VT[2], VT[6], 5);
    P.sphere(0.09 * (S + 0.5), 5, 4, VT[6], { y: c.top + 0.08, glow: 0.8 });
    P.box(0.5 * (S + 0.4), 0.06, 0.1, VT[6], { y: -0.17 });
    for (const o of [-1, 1]) { P.box(0.07 * (S + 0.4), 0.07 * (S + 0.4), 0.07 * (S + 0.4), VT[5], { x: o * 0.26 * (S + 0.4), y: -0.17, glow: 1 }); spike(P, [o * 0.26 * (S + 0.4), -0.14, 0], [o * 0.3 * (S + 0.4), 0.12 * (S + 0.5), 0], 0.03 * (S + 0.5), VT[0]); }
    const g0 = L * 0.28, off = W * 0.28;
    poly(P, [c.pt(0, -W * 0.34), c.pt(0, W * 0.34), c.pt(g0, W * 0.38), c.pt(g0, -W * 0.38)], th * 1.6, VT[0]); // Schaft-Block
    P.sphere(W * 0.2, 6, 5, VT[5], { x: c.X(g0 * 0.5), y: -0.2 - g0 * 0.5, glow: 1 }); // Goldkern
    const tips = [];
    for (const o of [-1, 1]) {
      poly(P, [c.pt(g0, o * off - W * 0.17), c.pt(g0, o * off + W * 0.17), c.pt(L * 0.92, o * off + W * 0.12), c.pt(L, o * off), c.pt(L * 0.92, o * off - W * 0.12)], th, VT[0]);
      poly(P, [c.pt(g0, o * off - W * 0.04), c.pt(g0, o * off + W * 0.04), c.pt(L * 0.94, o * off + W * 0.03), c.pt(L * 0.98, o * off)], th * 1.3, VT[2]);
      for (let i = 0; i < 5; i++) P.box(W * 0.36, 0.05 * (S + 0.5), th * 2.3, i % 2 ? VT[0] : VT[6], { x: c.X(L * (0.32 + i * 0.12)) + c.sd * o * off, y: -0.2 - L * (0.32 + i * 0.12) });
      P.box(0.06 * (S + 0.4), 0.06 * (S + 0.4), 0.06 * (S + 0.4), VT[5], { x: c.X(L) + c.sd * o * off, y: -0.2 - L - 0.03, glow: 1 });
      for (let i = 0; i < 3; i++) {
        const d = L * (0.38 + i * 0.17), a = c.p3(d, o * (off + W * 0.14)), b = c.p3(d - L * 0.08, o * (off + W * 0.14 + W * (0.9 - i * 0.12)));
        bar(P, a, b, 0.03 * (S + 0.5), 0.014, VT[6]);
        P.box(0.05 * (S + 0.4), 0.05 * (S + 0.4), 0.05 * (S + 0.4), VT[5], { x: b[0], y: b[1], glow: 1 });
      }
      tips.push(c.p3(L, o * off));
    }
    for (let i = 0; i < 4; i++) { const d = L * (0.4 + i * 0.16); sparkArc(P, c.p3(d, -off + W * 0.12), c.p3(d, off - W * 0.12), 4, 0.05 * (S + 0.5), i % 2 ? VT[5] : VT[4], i * 7, 0.015 + 0.015 * S); }
    c.fx.push({ kind: 'shock', rate: c.gs ? 14 : 8, at: [tips[0][0], tips[0][1], 0] }, { kind: 'shock', rate: c.gs ? 14 : 8, at: [tips[1][0], tips[1][1], 0] }, { kind: 'ember', cols: ['#ffd84a', '#fff0a0'], rate: 4, at: [0, -0.2 - g0 * 0.5, 0] });
  },
};

function buildBlade(gs, tier, branch, flip) {
  const top = Math.min(6, Math.max(1, tier));
  const key = lookKey(top, branch);
  const P = new GearParts(), fx = [];
  const c = bladeCtx(P, fx, key, gs, flip);
  BLADES[key](c);
  const glowBase = top >= 4 ? 1 : top === 3 ? 0.9 : 0.5;
  return finish(P, gs ? { twoHand: { lo: 0.2, hi: 0.5 }, fx, glowBase } : { fx, glowBase });
}

export function buildGreatswordLook(tier = 1, branch = null) { return buildBlade(true, tier, branch, 1); }
/** one blade; flip = -1 for the left hand */
export function buildDualBladeLook(tier = 1, branch = null, flip = 1) { return buildBlade(false, tier, branch, flip); }

// ------------------------------------------------------------------ bow
export const BOW_H = 0.78;
const bowZ = (y, k = 0.3) => k * (1 - (y / BOW_H) ** 2);
function bowPts(N, k = 0.3, xo = 0) { const a = []; for (let i = 0; i <= N; i++) { const y = -BOW_H + (2 * BOW_H * i) / N; a.push([xo, y, bowZ(y, k)]); } return a; }
function limbBars(P, pts, th, cols, taperK = 0.35) {
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], t = 1 - taperK * Math.abs((a[1] + b[1]) / 2 / BOW_H); bar(P, a, b, th * t * 0.75, th * t * 0.75, cols[i % cols.length]); }
}
const gripWrap = (P, color, wrap, n = 3, w = 0.1, h = 0.26) => { P.box(w, h, w, color, { y: 0, z: 0.3 }); for (let i = 0; i < n; i++) P.box(w + 0.015, 0.035, w + 0.015, wrap, { y: -h * 0.3 + i * (h * 0.6 / Math.max(1, n - 1)), z: 0.3 }); };

const BOWS = {
  // Stufe 1: krummer Ast mit Knoten, Zwieseln und Bindfaden
  rust(P, fx) {
    const pts = bowPts(8, 0.26);
    for (let i = 0; i < 8; i++) { const a = pts[i], b = pts[i + 1], t = 1 - 0.3 * Math.abs((a[1] + b[1]) / 2 / BOW_H); bar(P, [a[0] + (hash(i) - 0.5) * 0.04, a[1], a[2]], [b[0] + (hash(i + 1) - 0.5) * 0.04, b[1], b[2]], 0.05 * t, 0.05 * t, i % 2 ? '#5a3a1c' : '#6a4a2a'); }
    for (const o of [-1, 1]) {
      for (let i = 0; i < 3; i++) { const y = o * (0.2 + i * 0.2), z = bowZ(y, 0.26); P.box(0.09, 0.06, 0.09, '#7a5a34', { y, z }); spike(P, [0, y, z], [(i % 2 ? 1 : -1) * 0.14, y + o * 0.12, z + 0.02], 0.02, '#4a3018'); } // Zwiesel
      P.box(0.04, 0.08, 0.04, RUST[4], { y: o * BOW_H, z: 0 });
      P.box(0.07, 0.03, 0.07, '#a08a5a', { y: o * (BOW_H - 0.08), z: 0.02 });
    }
    gripWrap(P, '#6a4a2a', '#a08a5a', 3);
  },
  // Stufe 2: Rippenbogen -- Knochen-Wurfarme mit Gelenken, Sehnenwicklung, Schaedelknaufe an den Spitzen
  bone(P, fx) {
    const pts = bowPts(8, 0.4);
    limbBars(P, pts, 0.075, [BONE[0], BONE[1]]);
    for (const o of [-1, 1]) {
      for (const t of [0.34, 0.64]) { const y = o * BOW_H * t; P.sphere(0.07, 5, 4, BONE[0], { y, z: bowZ(y, 0.4) }); }
      for (let i = 0; i < 3; i++) { const y = o * (0.22 + i * 0.17); P.box(0.095, 0.035, 0.095, '#7a4a2a', { y, z: bowZ(y, 0.4) }); }
      const y = o * BOW_H, z = bowZ(y, 0.4);
      P.sphere(0.075, 5, 4, BONE[0], { y: y + o * 0.04, z, sx: 1.2 });
      for (const e of [-1, 1]) P.box(0.025, 0.025, 0.03, '#2a2218', { x: e * 0.035, y: y + o * 0.05, z: z + 0.07 });
      spike(P, [0, y + o * 0.1, z], [0, y + o * 0.27, z - 0.08], 0.035, BONE[1]);
    }
    for (let k = 0; k < 4; k++) P.box(0.11 - (k % 2) * 0.02, 0.06, 0.11, k % 2 ? BONE[1] : BONE[0], { y: -0.1 + k * 0.07, z: 0.4 }); // Wirbel-Griff
  },
  // Stufe 3a Jaggo: Schuppenarme mit orangem Kamm als Wurfarm-Saum
  jag(P, fx) {
    const pts = bowPts(8, 0.3);
    limbBars(P, pts, 0.09, [JP[0], JP[1], JP[2]], 0.4);
    for (const o of [-1, 1]) {
      for (let i = 0; i < 6; i++) { const y = o * (0.12 + i * 0.105), z = bowZ(y); const h = 0.2 - i * 0.022; spike(P, [0, y, z + 0.03], [0, y + o * 0.09, z + 0.03 + h], 0.05 - i * 0.004, i % 2 ? JP[3] : JP[4], { glow: 0.35 }); } // Kamm
      for (let i = 0; i < 4; i++) { const y = o * (0.3 + i * 0.12); spike(P, [0.045, y, bowZ(y) - 0.02], [0.13, y + o * 0.02, bowZ(y) - 0.07], 0.022, TOOTH); spike(P, [-0.045, y, bowZ(y) - 0.02], [-0.13, y + o * 0.02, bowZ(y) - 0.07], 0.022, TOOTH); } // Zaehne
      spike(P, [0, o * BOW_H, 0], [0, o * (BOW_H + 0.25), -0.12], 0.06, JP[4], { glow: 0.4 });
    }
    gripWrap(P, JP[1], JP[3], 4, 0.12, 0.28);
    for (let k = 0; k < 3; k++) P.box(0.13, 0.04, 0.13, k % 2 ? JP[0] : JP[2], { y: -0.06 + k * 0.06, z: 0.3 });
  },
  // Stufe 3b Barrotz: kurzer, klobiger Prellbogen -- Plattenstapel, Hoerner nach vorn, Schlamm
  barr(P, fx) {
    const pts = bowPts(6, 0.22);
    limbBars(P, pts, 0.17, [BZ[0], BZ[1]], 0.15);
    for (const o of [-1, 1]) {
      for (let i = 0; i < 3; i++) { const y = o * (0.18 + i * 0.17), z = bowZ(y, 0.22); P.box(0.26 - i * 0.03, 0.12, 0.2, i % 2 ? BZ[1] : BZ[2], { y, z: z + 0.02 }); }
      const y = o * BOW_H, z = bowZ(y, 0.22);
      P.box(0.2, 0.15, 0.2, BZ[2], { y, z });
      bar(P, [0.06, y, z], [0.13, y - o * 0.05, z + 0.28], 0.07, 0.025, BZ[2]); bar(P, [-0.06, y, z], [-0.13, y - o * 0.05, z + 0.28], 0.07, 0.025, BZ[2]); // Hoerner
      for (let i = 0; i < 4; i++) P.box(0.1 + hash(i + o) * 0.08, 0.09, 0.1, i % 2 ? BZ[3] : BZ[4], { x: (hash(i) - 0.5) * 0.18, y: o * (0.12 + i * 0.16), z: 0.2 - i * 0.012, ry: i });
      fx.push({ kind: 'shock', rate: 3.5, at: [0, o * (BOW_H + 0.06), 0] });
    }
    P.box(0.2, 0.3, 0.16, BZ[1], { y: 0, z: 0.22 });
    P.box(0.22, 0.05, 0.18, BZ[2], { y: 0.12, z: 0.22 }); P.box(0.22, 0.05, 0.18, BZ[2], { y: -0.12, z: 0.22 });
  },
  // Stufe 4 Brathalos: Fledermaus-Fluegel als Wurfarme -- Knochenspant + rote Membran
  brat(P, fx) {
    const pts = bowPts(8, 0.3);
    limbBars(P, pts, 0.075, [BR[5], BR[5], BR[1]], 0.35);
    for (const o of [-1, 1]) for (const s of [-1, 1]) {
      const root = [0, o * 0.2, 0.3], mid = [s * 0.52, o * 0.55, 0.08], end = [s * 0.36, o * (BOW_H + 0.12), -0.12], bs = [0, o * 0.5, 0.2];
      bar(P, root, mid, 0.035, 0.02, BR[5]); bar(P, [0, o * 0.42, 0.24], end, 0.03, 0.014, BR[5]);
      tri(P, root, mid, bs, BR[1], { glow: 0.2 }); tri(P, mid, end, bs, BR[0], { glow: 0.28 }); tri(P, [0, o * 0.42, 0.24], end, [0, o * 0.62, 0.12], BR[2], { glow: 0.2 });
      bar(P, bs, mid, 0.012, 0.012, BR[3], { glow: 1 }); bar(P, bs, end, 0.012, 0.012, BR[3], { glow: 1 });
      spike(P, mid, [mid[0] + s * 0.1, mid[1] + o * 0.1, mid[2] - 0.04], 0.03, BR[5], { glow: 0.5 });
    }
    for (const o of [-1, 1]) { spike(P, [0, o * BOW_H, 0], [0, o * (BOW_H + 0.26), -0.1], 0.055, BR[4], { glow: 1 }); fx.push({ kind: 'fire', rate: 3, at: [0, o * (BOW_H + 0.15), -0.05] }); }
    gripWrap(P, BR[1], BR[5], 3, 0.1, 0.26);
  },
  // Stufe 5k Kroll: Kessel-Spannbogen -- eckige Druckrohre mit Nieten, Gelenkkessel, Ventilrad, Scheren-Spitzen
  kroll(P, fx) {
    const ys = [0.12, 0.38, 0.62, BOW_H], zs = [0.3, 0.27, 0.17, 0.02];
    for (const o of [-1, 1]) {
      let prev = [0, 0.0, 0.3];
      for (let i = 0; i < 4; i++) {
        const p = [0, o * ys[i], zs[i]];
        bar(P, prev, p, 0.075, 0.07, i % 2 ? KR[0] : KR[3]);
        if (i < 3) { P.box(0.17, 0.12, 0.17, KR[1], { y: p[1], z: p[2], rx: 0.4 * o }); P.box(0.19, 0.03, 0.19, KR[4], { y: p[1], z: p[2] }); }
        prev = p;
      }
      for (const i of [1, 2]) { const y = o * ((ys[i - 1] + ys[i]) / 2), z = (zs[i - 1] + zs[i]) / 2; P.box(0.12, 0.035, 0.12, KR[2], { y, z }); P.box(0.03, 0.03, 0.03, KR[4], { x: 0.065, y, z }); P.box(0.03, 0.03, 0.03, KR[4], { x: -0.065, y, z }); }
      const tz = zs[3];
      spike(P, [0.03, o * BOW_H, tz], [0.1, o * (BOW_H + 0.22), tz - 0.1], 0.05, KR[2]); spike(P, [-0.03, o * BOW_H, tz], [-0.1, o * (BOW_H + 0.22), tz - 0.1], 0.05, KR[0]); // Zange
      P.cyl(0.075, 0.075, 0.04, 8, KR[3], { y: o * 0.5, z: 0.31, rx: PI / 2 });
      for (let k = 0; k < 2; k++) P.box(0.16, 0.025, 0.05, KR[4], { y: o * 0.5, z: 0.34, rz: k * PI / 2 }); // Ventilrad
      fx.push({ kind: 'ember', cols: ['#e8f0f4', '#c8d4dc'], rate: 3, at: [0, o * ys[1], zs[1] + 0.1] });
    }
    P.box(0.14, 0.26, 0.14, KR[3], { z: 0.3 }); P.cyl(0.11, 0.11, 0.05, 8, KR[6], { y: 0.0, z: 0.4, rx: PI / 2 }); P.box(0.03, 0.09, 0.03, KR[5], { y: 0.02, z: 0.43, rz: 0.5, glow: 1 });
  },
  // Stufe 5g Gorgo: Wurmgrat-Bogen -- Segmentarme mit Glutspalten, Zahnring-Maeuler an den Spitzen
  gorgo(P, fx) {
    for (const o of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const t0 = 0.08 + i * 0.145, t1 = t0 + 0.115, p0 = [0, o * BOW_H * t0, bowZ(o * BOW_H * t0)], p1 = [0, o * BOW_H * t1, bowZ(o * BOW_H * t1)];
        const r = 0.115 - i * 0.012;
        bar(P, p0, p1, r, r * 0.92, i % 2 ? GG[2] : GG[0]);
        P.box(r * 0.6, 0.02, r * 0.6, GG[3], { y: p1[1] + o * 0.015, z: p1[2], glow: 1 });
        spike(P, [0, p0[1], p0[2] + r * 0.6], [0, p1[1], p0[2] + r * 0.6 + 0.12], 0.03, GG[1]);
      }
      const ty = o * (BOW_H + 0.02), tz = bowZ(o * BOW_H) - 0.02;
      for (let k = 0; k < 5; k++) { const a = k / 5 * PI * 2; spike(P, [Math.cos(a) * 0.05, ty, tz + Math.sin(a) * 0.05], [Math.cos(a) * 0.1, ty + o * 0.2, tz + Math.sin(a) * 0.1 - 0.02], 0.025, GG[5]); } // Zahnring
      P.sphere(0.05, 4, 4, GG[4], { y: ty + o * 0.06, z: tz, glow: 1 });
      fx.push({ kind: 'fire', rate: 4, at: [0, o * (BOW_H + 0.15), tz] });
    }
    gripWrap(P, GG[1], GG[3], 3, 0.12, 0.26);
    for (let k = 0; k < 3; k++) P.box(0.14, 0.02, 0.14, GG[3], { y: -0.08 + k * 0.08, z: 0.3, glow: 1 });
  },
  // Stufe 5v Voltaro: Spulenbogen -- Kupferrohr mit Wicklungen, Antennen-Zinken und Funkenbogen
  volt(P, fx) {
    const pts = bowPts(8, 0.3);
    limbBars(P, pts, 0.07, [VT[0], VT[0], VT[2]], 0.3);
    for (const o of [-1, 1]) {
      const tips = [];
      for (let i = 0; i < 4; i++) {
        const y = o * (0.18 + i * 0.16), z = bowZ(y);
        P.box(0.11, 0.045, 0.11, i % 2 ? VT[0] : VT[1], { y, z });
        const a = [0, y, z], b = [(i % 2 ? 1 : -1) * (0.3 - i * 0.03), y + o * 0.12, z + 0.1 + (i % 2) * 0.06];
        bar(P, a, b, 0.022, 0.012, VT[1]);
        P.box(0.045, 0.045, 0.045, VT[4], { x: b[0], y: b[1], z: b[2], glow: 1 });
        tips.push(b);
      }
      for (let i = 0; i < 3; i++) sparkArc(P, tips[i], tips[i + 1], 3, 0.06, VT[4], i * 4 + (o > 0 ? 0 : 9), 0.014);
      const y = o * BOW_H; P.sphere(0.06, 4, 4, VT[5], { y, z: 0, glow: 1 }); spike(P, [0, y, 0], [0, o * (BOW_H + 0.2), -0.08], 0.04, VT[0]);
      fx.push({ kind: 'shock', rate: 5, at: [0, o * (BOW_H + 0.08), 0] });
    }
    gripWrap(P, VT[2], VT[0], 4, 0.11, 0.28);
  },
  // Stufe 6 Funkenfuerst: Doppelschienen-Krone -- zwei Kupferarme, Antennenkrone, Goldkern, Funkenbogen dazwischen
  fuerst(P, fx) {
    for (const xo of [-0.13, 0.13]) {
      const pts = bowPts(8, 0.3, xo).map((p) => { const t = Math.abs(p[1]) / BOW_H; return [xo * (1 - 0.75 * t * t), p[1], p[2]]; });
      limbBars(P, pts, 0.06, [VT[0], VT[6], VT[0]], 0.25);
    }
    for (const o of [-1, 1]) {
      for (let i = 0; i < 4; i++) { const y = o * (0.14 + i * 0.17), z = bowZ(y), w = 0.13 * (1 - 0.6 * (Math.abs(y) / BOW_H) ** 2); P.box(w * 2 + 0.08, 0.04, 0.09, i % 2 ? VT[0] : VT[6], { y, z }); }
      for (let i = 0; i < 3; i++) { const y = o * (0.3 + i * 0.17), z = bowZ(y); sparkArc(P, [-0.1, y, z + 0.02], [0.1, y, z + 0.02], 3, 0.07, i % 2 ? VT[5] : VT[4], i * 5 + (o > 0 ? 0 : 11), 0.016); }
      const y = o * BOW_H;
      for (let k = -1; k <= 1; k++) { spike(P, [k * 0.04, y, 0], [k * 0.12, o * (BOW_H + 0.26 - Math.abs(k) * 0.08), -0.1], 0.03, VT[6], { glow: 0.3 }); P.box(0.04, 0.04, 0.04, VT[5], { x: k * 0.12, y: o * (BOW_H + 0.26 - Math.abs(k) * 0.08), z: -0.1, glow: 1 }); } // Krone
      for (const s of [-1, 1]) { const a = [s * 0.12, o * 0.35, bowZ(o * 0.35)], b = [s * 0.46, o * 0.52, bowZ(o * 0.35) + 0.14]; bar(P, a, b, 0.03, 0.014, VT[6]); P.box(0.055, 0.055, 0.055, VT[5], { x: b[0], y: b[1], z: b[2], glow: 1 }); }
      fx.push({ kind: 'shock', rate: 9, at: [0, o * (BOW_H + 0.15), -0.1] });
    }
    P.sphere(0.12, 6, 5, VT[5], { y: 0, z: 0.38, glow: 1 });
    P.box(0.15, 0.1, 0.15, VT[6], { y: 0.16, z: 0.3 }); P.box(0.15, 0.1, 0.15, VT[6], { y: -0.16, z: 0.3 });
    fx.push({ kind: 'ember', cols: ['#ffd84a', '#fff0a0'], rate: 4, at: [0, 0, 0.4] });
  },
};

export function buildBowLook(tier = 1, branch = null) {
  const top = Math.min(6, Math.max(1, tier));
  const P = new GearParts(), fx = [];
  BOWS[lookKey(top, branch)](P, fx);
  if (top >= 4) for (const o of [-1, 1]) fx.push({ kind: 'poison', rate: 3, at: [0, o * (BOW_H + 0.1), -0.05] });
  return finish(P, { fx, glowBase: top >= 3 ? 0.9 : 0.4, hand: 'L' });
}
