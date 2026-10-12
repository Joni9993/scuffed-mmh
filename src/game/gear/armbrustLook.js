import * as THREE from 'three';
import { GearParts, gearMaterial, bar, spike, tri } from '../../render/gearfx.js';
import { PALETTES } from './weaponLook.js';

// Ratterbüchse (`lb`) Optik je Stufe/Ast, aus den Teilen des jeweiligen Brockens (wie bow/katana/kk/ga).
// Weapon-lokales Koordinatensystem (wie die Klingen): Griff im Ursprung, Lauf/Schaft entlang -y (Muendung bei y ~ -0.95, Schaftende bei +0.5),
// +z = oben (Magazin), Wurfarme laufen entlang x. Zweihand-Griff ueber userData.twoHand (linke Hand unter dem Vorderschaft).
const { RUST, BONE, JP, BZ, BR, KR, GG, VT, TOOTH } = PALETTES;
const PI = Math.PI;
const hash = (i) => { const s = Math.sin(i * 91.7 + 17.3) * 43758.5453; return s - Math.floor(s); };
export const LB_LEN = { butt: 0.5, muzzle: -0.95, limbY: -0.62, span: 0.56 };
const KEYS = ['rust', 'bone', 'jag', 'barr', 'brat', 'kroll', 'gorgo', 'volt', 'fuerst'];
export function lbLookKey(top, branch) {
  if (top >= 6) return 'fuerst';
  if (top === 5) return branch === 'g' ? 'gorgo' : branch === 'v' ? 'volt' : 'kroll';
  if (top === 4) return 'brat';
  if (top === 3) return branch === 'b' ? 'barr' : 'jag';
  return top === 2 ? 'bone' : 'rust';
}
export const LB_KEYS = KEYS;

// ---------- gemeinsames Skelett: Schaft, Griff, Abzug, Schiene, Magazin, Steigbuegel, Sehne
function skeleton(P, o) {
  const { stock, stock2, metal, grip, mag, magTop } = o;
  const by = LB_LEN.butt, my = LB_LEN.muzzle;
  bar(P, [0, by, 0], [0, my + 0.05, 0], 0.055, 0.045, stock);                        // Schaft
  P.box(0.13, 0.22, 0.17, stock2 ?? stock, { y: by - 0.1, z: -0.01 });                // Schulterkolben
  P.box(0.16, 0.05, 0.2, metal, { y: by + 0.01, z: -0.01 });                         // Kappe
  P.box(0.085, 0.22, 0.1, grip, { y: 0.02, z: -0.13, rx: -0.18 });                    // Pistolengriff
  P.box(0.03, 0.12, 0.03, metal, { y: -0.12, z: -0.07 });                             // Abzug
  P.box(0.05, 0.06, 0.05, metal, { y: -0.2, z: -0.06 });
  P.box(0.07, 0.62, 0.05, metal, { y: -0.42, z: 0.045 });                             // Schiene
  P.box(0.15, 0.4, 0.14, mag, { y: -0.3, z: 0.14 });                                  // Magazinkasten oben
  P.box(0.17, 0.05, 0.16, magTop ?? metal, { y: -0.1, z: 0.14 }); P.box(0.17, 0.05, 0.16, magTop ?? metal, { y: -0.5, z: 0.14 });
  bar(P, [-0.1, my + 0.1, -0.02], [0.1, my + 0.1, -0.02], 0.025, 0.025, metal);       // Steigbuegel (Fuss-Bügel)
  bar(P, [-0.1, my + 0.1, -0.02], [-0.1, my + 0.1, -0.2], 0.022, 0.022, metal); bar(P, [0.1, my + 0.1, -0.02], [0.1, my + 0.1, -0.2], 0.022, 0.022, metal);
  bar(P, [-0.1, my + 0.1, -0.2], [0.1, my + 0.1, -0.2], 0.022, 0.022, metal);
}
/** Sehne zwischen den Wurfarm-Spitzen (zum Schaftende hin gespannt). */
function string(P, tipY, tipX, color = '#efe6c8', r = 0.012) {
  const ny = LB_LEN.limbY + 0.3;
  bar(P, [-tipX, tipY, 0], [0, ny, 0.02], r, r, color); bar(P, [tipX, tipY, 0], [0, ny, 0.02], r, r, color);
  P.box(0.05, 0.06, 0.05, '#d8c090', { y: ny, z: 0.02 });
}
/** Wurfarm-Punkte: ab Schaft nach aussen (s = +-1), nach vorn gebogen. */
function limbPts(s, N = 5, span = LB_LEN.span, bend = 0.2) {
  const a = [];
  for (let i = 0; i <= N; i++) { const t = i / N; a.push([s * span * t, LB_LEN.limbY - bend * t * t, 0.02 + 0.03 * Math.sin(t * PI)]); }
  return a;
}
const limbBars = (P, pts, r0, r1, cols) => { for (let i = 0; i < pts.length - 1; i++) { const k = i / (pts.length - 1); bar(P, pts[i], pts[i + 1], r0 + (r1 - r0) * k, r0 + (r1 - r0) * (k + 1 / (pts.length - 1)), cols[i % cols.length]); } };
function sparkArc(P, a, b, n, jag, color, seed = 0, r = 0.014) {
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = i === n ? b : [a[0] + (b[0] - a[0]) * t + (hash(i + seed) - 0.5) * jag, a[1] + (b[1] - a[1]) * t + (hash(i + seed + 3) - 0.5) * jag, a[2] + (b[2] - a[2]) * t + (hash(i + seed + 5) - 0.5) * jag];
    bar(P, prev, p, r, r, color, { glow: 1 });
    prev = p;
  }
}

const LOOKS = {
  // Stufe 1: Schrott-Armbrust -- Bretterschaft, Blechstreifen als Wurfarme, Konservendose als Magazin, Bindfaden
  rust(P, fx) {
    skeleton(P, { stock: '#6a4a30', stock2: '#7a5a38', metal: RUST[4], grip: '#4a3018', mag: RUST[2], magTop: RUST[0] });
    for (const s of [-1, 1]) {
      const pts = limbPts(s, 4, 0.5, 0.14);
      limbBars(P, pts, 0.03, 0.02, [RUST[0], RUST[1]]);
      P.box(0.15, 0.05, 0.035, RUST[3], { x: s * 0.22, y: LB_LEN.limbY - 0.02, z: 0.04 }); // aufgeschweisstes Blech
      for (const t of [0.15, 0.35]) P.box(0.03, 0.03, 0.05, '#c9ced8', { x: s * t, y: LB_LEN.limbY, z: 0.05 }); // Nieten
      bar(P, [s * 0.09, LB_LEN.limbY + 0.0, 0.03], [s * 0.09, LB_LEN.limbY + 0.15, 0.03], 0.02, 0.02, '#a08a5a'); // Bindfaden-Wicklung
    }
    string(P, LB_LEN.limbY - 0.14, 0.5);
    P.cyl(0.07, 0.07, 0.3, 6, '#9a9aa4', { y: -0.3, z: 0.24, rx: PI / 2 }); // Konservendose quer
    P.box(0.12, 0.02, 0.1, '#c8541e', { y: -0.3, z: 0.31 });
    P.box(0.04, 0.5, 0.03, '#a08a5a', { y: -0.02, z: -0.02 }); // Klebeband-Wicklung am Schaft
  },
  // Stufe 2: Knochenschaft, Rippen-Wurfarme mit Gelenkknollen, Schaedelknauf, Sehnenwicklung
  bone(P, fx) {
    skeleton(P, { stock: BONE[0], stock2: BONE[1], metal: BONE[2], grip: '#7a4a2a', mag: BONE[1], magTop: BONE[0] });
    P.sphere(0.075, 5, 4, BONE[0], { y: LB_LEN.butt + 0.04, z: -0.01, sx: 1.2 }); // Gelenkknauf
    for (const s of [-1, 1]) {
      const pts = limbPts(s, 6, 0.56, 0.22);
      limbBars(P, pts, 0.045, 0.025, [BONE[0], BONE[1]]);
      for (const i of [2, 4]) P.sphere(0.055, 5, 4, BONE[0], { x: pts[i][0], y: pts[i][1], z: pts[i][2] });
      for (const i of [1, 3]) P.box(0.04, 0.07, 0.07, '#7a4a2a', { x: pts[i][0], y: pts[i][1], z: pts[i][2] }); // Sehnen
      const t = pts[6];
      P.sphere(0.06, 5, 4, BONE[0], { x: t[0], y: t[1] - 0.02, z: t[2] });
      for (const e of [-1, 1]) P.box(0.02, 0.025, 0.02, '#2a2218', { x: t[0] + e * 0.025, y: t[1] - 0.05, z: t[2] + 0.04 });
      spike(P, [t[0], t[1], t[2]], [t[0] + s * 0.07, t[1] - 0.14, t[2]], 0.028, BONE[1]);
    }
    string(P, LB_LEN.limbY - 0.22, 0.56);
    for (let k = 0; k < 4; k++) P.box(0.09, 0.05, 0.05, k % 2 ? BONE[1] : BONE[0], { y: -0.2 + k * 0.1, z: -0.05 }); // Wirbel als Zierleiste
  },
  // Stufe 3a Jaggo: Schuppenschaft, Wurfarme mit orangem Kamm und Zaehnen
  jag(P, fx) {
    skeleton(P, { stock: JP[1], stock2: JP[0], metal: JP[2], grip: JP[1], mag: JP[0], magTop: JP[3] });
    for (let i = 0; i < 5; i++) spike(P, [0, 0.35 - i * 0.2, 0.05], [0, 0.35 - i * 0.2 - 0.04, 0.17], 0.03, i % 2 ? JP[3] : JP[4], { glow: 0.35 }); // Rueckenkamm
    for (const s of [-1, 1]) {
      const pts = limbPts(s, 6, 0.58, 0.2);
      limbBars(P, pts, 0.055, 0.03, [JP[0], JP[1], JP[2]]);
      for (let i = 1; i < 6; i++) spike(P, [pts[i][0], pts[i][1], pts[i][2] + 0.03], [pts[i][0], pts[i][1] - 0.02, pts[i][2] + 0.03 + 0.2 - i * 0.025], 0.045 - i * 0.004, i % 2 ? JP[3] : JP[4], { glow: 0.35 }); // Kamm
      for (let i = 2; i < 6; i += 2) { spike(P, [pts[i][0], pts[i][1], pts[i][2]], [pts[i][0], pts[i][1] - 0.2, pts[i][2] - 0.06], 0.022, TOOTH); } // Zaehne nach vorn
      const t = pts[6];
      spike(P, [t[0], t[1], t[2]], [t[0] + s * 0.1, t[1] - 0.18, t[2] - 0.05], 0.05, JP[4], { glow: 0.4 });
    }
    string(P, LB_LEN.limbY - 0.2, 0.58, '#ffb04a');
    spike(P, [0, LB_LEN.muzzle + 0.1, 0.05], [0, LB_LEN.muzzle - 0.1, 0.08], 0.05, TOOTH); // Zahn-Muendung
  },
  // Stufe 3b Barrotz: kurzer, klobiger Prell-Aufbau -- Plattenstapel, Hoerner, Schlammklumpen
  barr(P, fx) {
    skeleton(P, { stock: BZ[1], stock2: BZ[0], metal: BZ[2], grip: BZ[4], mag: BZ[1], magTop: BZ[2] });
    P.box(0.2, 0.28, 0.18, BZ[0], { y: 0.3, z: -0.01 }); P.box(0.22, 0.04, 0.2, BZ[2], { y: 0.43, z: -0.01 }); // Plattenkolben
    for (const s of [-1, 1]) {
      const pts = limbPts(s, 4, 0.46, 0.12);
      limbBars(P, pts, 0.1, 0.07, [BZ[0], BZ[1]]);
      for (let i = 1; i < 4; i++) P.box(0.2 - i * 0.03, 0.12, 0.16, i % 2 ? BZ[1] : BZ[2], { x: pts[i][0], y: pts[i][1], z: pts[i][2] + 0.02 });
      const t = pts[4];
      P.box(0.16, 0.14, 0.16, BZ[2], { x: t[0], y: t[1], z: t[2] });
      bar(P, [t[0], t[1], t[2]], [t[0] + s * 0.07, t[1] - 0.26, t[2] + 0.02], 0.06, 0.02, BZ[2]); // Horn
      for (let i = 0; i < 3; i++) P.box(0.08 + hash(i + s) * 0.06, 0.08, 0.08, i % 2 ? BZ[3] : BZ[4], { x: s * (0.1 + i * 0.12), y: LB_LEN.limbY + 0.06, z: 0.1, ry: i }); // Schlamm
      fx.push({ kind: 'shock', rate: 3.5, at: [t[0], t[1] - 0.05, t[2]] });
    }
    string(P, LB_LEN.limbY - 0.12, 0.46, '#8a7a5a', 0.02);
  },
  // Stufe 4 Brathalos: Fledermaus-Fluegel als Wurfarme -- Knochenspant + rote Membran, Glutfenster im Magazin
  brat(P, fx) {
    skeleton(P, { stock: BR[1], stock2: BR[0], metal: BR[5], grip: BR[1], mag: BR[0], magTop: BR[5] });
    P.box(0.1, 0.3, 0.03, BR[3], { y: -0.3, z: 0.215, glow: 1 }); // Glutfenster
    for (const s of [-1, 1]) {
      const root = [s * 0.04, LB_LEN.limbY, 0.03], mid = [s * 0.42, LB_LEN.limbY - 0.1, 0.1], end = [s * 0.62, LB_LEN.limbY - 0.3, 0.02], back = [s * 0.34, LB_LEN.limbY + 0.34, 0.04], back2 = [s * 0.12, LB_LEN.limbY + 0.3, 0.03];
      bar(P, root, mid, 0.04, 0.025, BR[5]); bar(P, mid, end, 0.025, 0.012, BR[5]); bar(P, mid, back, 0.02, 0.012, BR[5]);
      tri(P, root, mid, back2, BR[1], { glow: 0.2 }); tri(P, mid, back, back2, BR[0], { glow: 0.28 }); tri(P, mid, end, back, BR[2], { glow: 0.2 });
      bar(P, mid, back2, 0.01, 0.01, BR[3], { glow: 1 });
      spike(P, end, [end[0] + s * 0.05, end[1] - 0.18, end[2]], 0.04, BR[4], { glow: 1 });
      fx.push({ kind: 'fire', rate: 3, at: [end[0], end[1] - 0.12, end[2]] });
    }
    string(P, LB_LEN.limbY - 0.3, 0.62, '#ffb04a');
  },
  // Stufe 5k Kroll: Kesselblech-Armbrust -- eckige Druckrohre mit Nieten, Boilertrommel, Ventilrad, Scherenspitzen
  kroll(P, fx) {
    skeleton(P, { stock: KR[3], stock2: KR[0], metal: KR[6], grip: KR[1], mag: KR[0], magTop: KR[2] });
    P.cyl(0.11, 0.11, 0.34, 8, KR[0], { y: -0.3, z: 0.24, rx: PI / 2 }); // Boilertrommel
    for (const y of [-0.16, -0.44]) P.cyl(0.12, 0.12, 0.03, 8, KR[3], { y, z: 0.24, rx: PI / 2 });
    for (let k = 0; k < 2; k++) P.box(0.2, 0.025, 0.04, KR[4], { y: 0.08, z: 0.1, rx: PI / 2 * k }); // Ventilrad
    P.cyl(0.06, 0.06, 0.03, 8, KR[3], { y: 0.08, z: 0.12, rx: 0 });
    for (const s of [-1, 1]) {
      let prev = [0, LB_LEN.limbY, 0.02];
      for (let i = 1; i <= 4; i++) {
        const p = [s * 0.14 * i, LB_LEN.limbY - 0.05 * i * i * 0.5, 0.02];
        bar(P, prev, p, 0.07, 0.065, i % 2 ? KR[0] : KR[3]);
        if (i < 4) { P.box(0.14, 0.14, 0.14, KR[1], { x: p[0], y: p[1], z: p[2] }); P.box(0.03, 0.15, 0.15, KR[4], { x: p[0], y: p[1], z: p[2] }); }
        prev = p;
      }
      spike(P, [prev[0], prev[1], 0.02], [prev[0] + s * 0.05, prev[1] - 0.22, -0.06], 0.05, KR[2]); spike(P, [prev[0], prev[1], 0.02], [prev[0] - s * 0.02, prev[1] - 0.22, 0.1], 0.04, KR[0]);
      fx.push({ kind: 'ember', cols: ['#e8f0f4', '#c8d4dc'], rate: 3, at: [s * 0.3, LB_LEN.limbY - 0.1, 0.12] });
    }
    string(P, LB_LEN.limbY - 0.25, 0.56, '#c8d4dc', 0.016);
    P.box(0.04, 0.05, 0.04, KR[5], { y: -0.1, z: 0.25, glow: 1 });
  },
  // Stufe 5g Gorgo: Schlacke-Segmente mit Glutspalten, Zahnring-Maeuler an den Spitzen
  gorgo(P, fx) {
    skeleton(P, { stock: GG[0], stock2: GG[2], metal: GG[1], grip: GG[1], mag: GG[0], magTop: GG[3] });
    for (let i = 0; i < 5; i++) { P.box(0.12 - i * 0.004, 0.015, 0.12, GG[3], { y: 0.34 - i * 0.2, z: 0, glow: 1 }); P.box(0.1, 0.1, 0.1, i % 2 ? GG[2] : GG[0], { y: 0.28 - i * 0.2, z: 0 }); } // Segmente am Schaft
    P.box(0.1, 0.3, 0.025, GG[3], { y: -0.3, z: 0.215, glow: 1 });
    for (const s of [-1, 1]) {
      let prev = [0, LB_LEN.limbY, 0.02];
      for (let i = 1; i <= 5; i++) {
        const t = i / 5, p = [s * 0.58 * t, LB_LEN.limbY - 0.2 * t * t, 0.02], r = 0.1 - i * 0.012;
        bar(P, prev, p, r, r * 0.9, i % 2 ? GG[2] : GG[0]);
        P.box(0.02, r * 1.1, r * 1.1, GG[3], { x: p[0], y: p[1], z: p[2], glow: 1 });
        prev = p;
      }
      for (let k = 0; k < 5; k++) { const a = k / 5 * PI * 2; spike(P, [prev[0], prev[1] + Math.cos(a) * 0.04, Math.sin(a) * 0.04 + 0.02], [prev[0] + s * 0.08, prev[1] - 0.12 + Math.cos(a) * 0.08, Math.sin(a) * 0.08 + 0.02], 0.022, GG[5]); } // Zahnring
      P.sphere(0.05, 4, 4, GG[4], { x: prev[0] + s * 0.04, y: prev[1] - 0.06, z: 0.02, glow: 1 });
      fx.push({ kind: 'fire', rate: 4, at: [prev[0] + s * 0.05, prev[1] - 0.1, 0.02] });
    }
    string(P, LB_LEN.limbY - 0.2, 0.58, GG[4], 0.016);
  },
  // Stufe 5v Voltaro: Kupferspulen-Armbrust -- Wicklungen, Antennenzinken, Funkenbogen
  volt(P, fx) {
    skeleton(P, { stock: VT[2], stock2: VT[3], metal: VT[0], grip: VT[2], mag: VT[3], magTop: VT[0] });
    for (let i = 0; i < 5; i++) P.box(0.13, 0.035, 0.13, i % 2 ? VT[0] : VT[1], { y: -0.2 - i * 0.075, z: 0.14 }); // Spule am Magazin
    P.sphere(0.05, 4, 4, VT[4], { y: -0.58, z: 0.14, glow: 1 });
    for (const s of [-1, 1]) {
      const pts = limbPts(s, 6, 0.58, 0.18), tips = [];
      limbBars(P, pts, 0.045, 0.025, [VT[0], VT[0], VT[2]]);
      for (let i = 1; i <= 4; i++) {
        const p = pts[i];
        P.box(0.05, 0.1, 0.1, i % 2 ? VT[0] : VT[1], { x: p[0], y: p[1], z: p[2] });
        const b = [p[0] + s * 0.02, p[1] - 0.1 - (i % 2) * 0.06, 0.12 + (i % 2) * 0.06];
        bar(P, p, b, 0.018, 0.01, VT[1]); P.box(0.04, 0.04, 0.04, VT[4], { x: b[0], y: b[1], z: b[2], glow: 1 });
        tips.push(b);
      }
      for (let i = 0; i < 3; i++) sparkArc(P, tips[i], tips[i + 1], 3, 0.05, VT[4], i * 4 + (s > 0 ? 0 : 9));
      fx.push({ kind: 'shock', rate: 5, at: [pts[6][0], pts[6][1] - 0.06, 0.04] });
    }
    string(P, LB_LEN.limbY - 0.18, 0.58, VT[5], 0.016);
  },
  // Stufe 6 Funkenfuerst: Doppelschienen-Krone aus Kupfer und Gold, Goldkern-Magazin, Funkenbogen
  fuerst(P, fx) {
    skeleton(P, { stock: VT[0], stock2: VT[6], metal: VT[6], grip: VT[2], mag: VT[2], magTop: VT[6] });
    P.sphere(0.1, 6, 5, VT[5], { y: -0.3, z: 0.26, glow: 1 }); // Goldkern
    for (const k of [-1, 0, 1]) { spike(P, [k * 0.05, LB_LEN.muzzle + 0.12, 0.04], [k * 0.07, LB_LEN.muzzle - 0.12 - (1 - Math.abs(k)) * 0.08, 0.04], 0.03, VT[6], { glow: 0.3 }); }
    for (const s of [-1, 1]) {
      for (const dz of [-0.07, 0.07]) {
        const pts = limbPts(s, 6, 0.6, 0.2).map((p) => [p[0], p[1], p[2] + dz]);
        limbBars(P, pts, 0.04, 0.022, [VT[0], VT[6], VT[0]]);
      }
      const pts = limbPts(s, 6, 0.6, 0.2);
      for (let i = 1; i < 6; i++) P.box(0.05, 0.05, 0.2, i % 2 ? VT[0] : VT[6], { x: pts[i][0], y: pts[i][1], z: pts[i][2] });
      for (let i = 1; i < 5; i += 2) sparkArc(P, [pts[i][0], pts[i][1], -0.05], [pts[i][0], pts[i][1], 0.1], 3, 0.06, i % 3 ? VT[5] : VT[4], i * 5 + (s > 0 ? 0 : 11));
      const t = pts[6];
      for (let k = -1; k <= 1; k++) { spike(P, [t[0], t[1], t[2] + k * 0.05], [t[0] + s * 0.08, t[1] - 0.2 + Math.abs(k) * 0.06, t[2] + k * 0.09], 0.028, VT[6], { glow: 0.3 }); P.box(0.04, 0.04, 0.04, VT[5], { x: t[0] + s * 0.08, y: t[1] - 0.2 + Math.abs(k) * 0.06, z: t[2] + k * 0.09, glow: 1 }); }
      fx.push({ kind: 'shock', rate: 9, at: [t[0], t[1] - 0.1, 0.05] });
    }
    string(P, LB_LEN.limbY - 0.2, 0.6, VT[5], 0.018);
    fx.push({ kind: 'ember', cols: ['#ffd84a', '#fff0a0'], rate: 4, at: [0, -0.3, 0.3] });
  },
};

// ---------- Glitch-Optik "Buffer Overflow" (nur im Glitch sichtbar, Zusatzobjekte werden einmal gebaut)
const GL_COLS = [0xff2bd6, 0x18e6ff, 0xffffff, 0xffe14d];
function digitsSprite() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 48;
  const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(0.62, 0.23, 1); sp.position.set(0, -0.3, 0.55); sp.renderOrder = 9; sp.visible = false;
  sp.userData = { c, g: c.getContext('2d'), tex, last: '' };
  return sp;
}
function paintDigits(sp, text) {
  const u = sp.userData;
  if (u.last === text) return;
  u.last = text;
  const g = u.g;
  g.clearRect(0, 0, 128, 48);
  g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ff2bd6'; g.fillText(text, 66, 26);
  g.fillStyle = '#18e6ff'; g.fillText(text, 62, 22);
  g.fillStyle = '#ffffff'; g.fillText(text, 64, 24);
  u.tex.needsUpdate = true;
}
function ensureGlitch(mesh) {
  const L = mesh.userData.lb;
  if (L.gl) return L.gl;
  const body = mesh.children[0];
  const mk = (col) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const ghosts = [0xff2bd6, 0x18e6ff].map((col) => { const m = new THREE.Mesh(body.geometry, mk(col)); m.renderOrder = 5; m.visible = false; mesh.add(m); return m; });
  // Datenfugen: leuchtende Balken entlang Schaft und Wurfarmen
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xff2bd6, fog: false });
  const seams = new THREE.Group(); seams.visible = false;
  for (const [x, y, z, w, h, d] of [[0, -0.2, 0.082, 0.02, 0.9, 0.01], [0.28, LB_LEN.limbY, 0.06, 0.5, 0.012, 0.012], [-0.28, LB_LEN.limbY, 0.06, 0.5, 0.012, 0.012], [0, -0.3, 0.215, 0.1, 0.34, 0.01]]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), seamMat); s.position.set(x, y, z); seams.add(s);
  }
  mesh.add(seams);
  const pix = new THREE.BoxGeometry(0.035, 0.035, 0.035);
  const parts = [];
  for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(pix, new THREE.MeshBasicMaterial({ color: GL_COLS[i % 4], fog: false })); m.visible = false; m.userData = { life: 0, v: new THREE.Vector3(), shell: i >= 14 }; mesh.add(m); parts.push(m); }
  const digits = digitsSprite(); mesh.add(digits);
  L.gl = { ghosts, seams, seamMat, parts, digits, pulse: 0, t: 0, n: 0, lastShots: -1, lastAt: 0 };
  return L.gl;
}
const MUZZLE = [0, LB_LEN.muzzle, 0.08];
function emitPix(gl, shell) {
  const base = shell ? 14 : 0, cnt = shell ? 10 : 14;
  for (let i = 0; i < cnt; i++) {
    const m = gl.parts[base + ((gl.n + i) % cnt)];
    const u = m.userData;
    if (u.life > 0) continue;
    u.life = shell ? 0.5 : 0.28;
    if (shell) { m.position.set(0.05, -0.1, 0.22); u.v.set(0.5 + Math.random() * 0.5, Math.random() * 0.3 - 0.15, 0.8 + Math.random() * 0.5); m.material.color.setHex(0xffe14d); }
    else { m.position.set(...MUZZLE); u.v.set((Math.random() - 0.5) * 0.9, -1.2 - Math.random() * 1.6, (Math.random() - 0.3) * 0.9); m.material.color.setHex(GL_COLS[(Math.random() * 3) | 0]); }
    m.visible = true; m.scale.setScalar(1);
    if (!shell && i > 5) break;
    if (shell && i > 0) break;
  }
  gl.n++;
}
/** Pro Frame: s = { glitch, shot (Schuss in diesem Frame), text } */
export function updateArmbrustLook(mesh, s, dt) {
  const L = mesh?.userData.lb;
  if (!L) return;
  if (!s.glitch && !L.gl) return;
  const gl = ensureGlitch(mesh);
  const on = !!s.glitch;
  gl.t += dt;
  gl.seams.visible = on; gl.digits.visible = on;
  gl.seamMat.color.setHex(Math.floor(gl.t * 12) % 2 ? 0x18e6ff : 0xff2bd6);
  if (on && s.shot) { gl.pulse = 1; emitPix(gl, false); emitPix(gl, true); }
  gl.pulse = Math.max(0, gl.pulse - dt * 6);
  const j = on ? 0.02 + gl.pulse * 0.05 : 0;
  gl.ghosts.forEach((g, i) => {
    g.visible = on;
    g.position.set((i ? 1 : -1) * (j + Math.sin(gl.t * 31 + i) * 0.006), (Math.random() - 0.5) * 0.01 * on, (i ? -1 : 1) * j * 0.5);
    g.material.opacity = on ? 0.2 + gl.pulse * 0.35 : 0;
  });
  if (on) paintDigits(gl.digits, s.text ?? 'NaN/∞');
  for (const m of gl.parts) {
    const u = m.userData;
    if (u.life <= 0) { if (m.visible) m.visible = false; continue; }
    u.life -= dt;
    if (u.shell) u.v.z -= 4 * dt;
    m.position.addScaledVector(u.v, dt);
    m.scale.setScalar(Math.max(0.2, u.life * 3));
    if (u.life <= 0) m.visible = false;
  }
}

/** opts: { tier, branch } -> Gruppe (ein gemergtes Mesh), userData.twoHand/fx/lb */
export function buildArmbrustLook(tier = 1, branch = null) {
  const top = Math.min(6, Math.max(1, tier));
  const P = new GearParts(), fx = [];
  LOOKS[lbLookKey(top, branch)](P, fx);
  const mat = gearMaterial(1);
  const body = new THREE.Mesh(P.merge(), mat);
  const g = new THREE.Group();
  g.add(body);
  g.userData = { glow: mat, gearGlow: mat.userData.glow, glowBase: top >= 3 ? 0.9 : 0.4, fx, twoHand: { lo: -0.62, hi: -0.4 }, lb: { tier: top, key: lbLookKey(top, branch) } };
  return g;
}
