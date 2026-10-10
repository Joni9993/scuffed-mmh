// Optik-Helfer fuer Waffen-Glitches (Plattmacher Frame-Skip, Zwillingsklingen Echo-Input).
// Alles wird einmal erzeugt und wiederverwendet: 4 gemeinsame Materialien, keine Allokation pro Frame/Treffer.
import * as THREE from 'three';

let MATS = null;
function mats() {
  if (!MATS) {
    const mk = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    MATS = { cyan: mk(0x18e6ff, 0.55), magenta: mk(0xff2bd6, 0.55), ghost: mk(0x9fefff, 0.34), ghost2: mk(0xff5ae0, 0.18) };
  }
  return MATS;
}

/** Object3D.clone kopiert userData per JSON (Materialien darin -> Zirkel/Kosten): kurz wegstellen. */
function safeClone(obj) {
  const saved = [];
  obj.traverse((o) => { saved.push(o, o.userData); o.userData = {}; });
  const c = obj.clone(true);
  for (let i = 0; i < saved.length; i += 2) saved[i].userData = saved[i + 1];
  return c;
}
const tint = (obj, mat) => {
  const kill = [];
  obj.traverse((o) => { if (o.isPoints || o.isLine || o.isSprite) kill.push(o); else if (o.isMesh) { o.material = mat; o.castShadow = false; o.renderOrder = 5; } });
  for (const o of kill) o.parent?.remove(o);
  return obj;
};

// ------------------------------------------------------------------ Plattmacher: Doppelkontur an der Klinge
/** Cyan/Magenta-Kopie der Waffe, als Kinder des Waffen-Meshes (einmal pro Mesh). */
export function ensureContour(p) {
  const wm = p.weaponMesh;
  if (!wm || !p.glitch) return null;
  const s = p.glitch;
  const c = s._contour;
  if (c && c.cyan.parent === wm) return c;
  const m = mats();
  const cyan = tint(safeClone(wm), m.cyan), magenta = tint(safeClone(wm), m.magenta);
  cyan.scale.setScalar(1.04); magenta.scale.setScalar(1.04);
  wm.add(cyan, magenta);
  return (s._contour = { cyan, magenta });
}
export function hideContour(p) {
  const c = p.glitch?._contour;
  if (c) c.cyan.visible = c.magenta.visible = false;
}
const JIT = [0, 0.05, -0.03, 0.08, -0.06, 0.02, -0.09, 0.04];
/** Pro Frame NACH dem Rig-Update. Pose "springt" in Stufen (Aufladung), Kontur versetzt sich ruckartig (10 Hz). */
export function stutterFrame(p, mesh, time) {
  const c = ensureContour(p);
  const w = p.weapon;
  const step = Math.floor(time * 10);
  const j = JIT[step & 7], k = JIT[(step * 3 + 1) & 7];
  if (c) {
    c.cyan.visible = c.magenta.visible = true;
    c.cyan.position.set(0.08 + j, 0.02 + k * 0.5, 0); c.cyan.rotation.z = j * 0.6;
    c.magenta.position.set(-0.08 - k, -0.02 - j * 0.5, 0); c.magenta.rotation.z = -k * 0.6;
  }
  if (w?.charging && p.rig) {
    const q = Math.floor(w.chargeT * 9) & 7, a = JIT[q]; // Frame-Sprung: Pose rastet in Stufen
    const J = p.rig.joints;
    if (J?.torso) J.torso.rotation.x += a * 2.2;
    if (J?.armR) J.armR.rotation.x += JIT[(q + 3) & 7] * 3;
    if (p.mesh) p.mesh.position.y += (step & 1) * 0.05;
    if (mesh) mesh.rotation.z = a * 1.5;
  } else if (mesh) mesh.rotation.z = 0;
}

// ------------------------------------------------------------------ Zwillingsklingen: Geister-Pirscher mit Zeitversatz
const CAP = 96;
/**
 * Klon des Rig-Meshes (transparent, gemeinsame Materialien) + Ringpuffer der lokalen Knoten-Transformationen.
 * lags = Verzoegerungen in s (Geist 1 = 0,4 s Echo, Geist 2 = 0,62 s magenta RGB-Spur).
 */
export class GhostTrail {
  constructor(src, scene, lags = [0.4, 0.62]) {
    this.src = src; this.t = 0; this.head = 0; this.n = 0;
    const m = mats();
    this.srcNodes = [];
    src.traverse((o) => this.srcNodes.push(o));
    this.ghosts = lags.map((lag, i) => {
      const root = safeClone(src);
      const nodes = [];
      root.traverse((o) => nodes.push(o)); // vor tint: gleiche Reihenfolge wie die Quelle
      tint(root, i === 0 ? m.ghost : m.ghost2);
      root.visible = false; root.name = 'glitchGhost';
      scene?.add(root);
      return { root, lag, nodes };
    });
    this.pairs = Math.min(this.srcNodes.length, ...this.ghosts.map((g) => g.nodes.length));
    this.stride = 4 + this.pairs * 7;
    this.buf = new Float32Array(CAP * this.stride);
    this.times = new Float32Array(CAP);
  }

  /** Aktuellen Zustand des Quell-Meshes aufzeichnen. */
  record(dt) {
    this.t += dt;
    const i = this.head, o = i * this.stride, b = this.buf, s = this.src;
    b[o] = s.position.x; b[o + 1] = s.position.y; b[o + 2] = s.position.z; b[o + 3] = s.rotation.y;
    let q = o + 4;
    for (let k = 1; k < this.pairs; k++, q += 7) {
      const n = this.srcNodes[k];
      b[q] = n.position.x; b[q + 1] = n.position.y; b[q + 2] = n.position.z;
      b[q + 3] = n.quaternion.x; b[q + 4] = n.quaternion.y; b[q + 5] = n.quaternion.z; b[q + 6] = n.quaternion.w;
    }
    this.times[i] = this.t;
    this.head = (i + 1) % CAP;
    if (this.n < CAP) this.n++;
  }

  /** Geister auf den Zustand von (jetzt - lag) setzen; flick = kurzes Aussetzen. */
  apply(flick = false) {
    for (const g of this.ghosts) {
      const want = this.t - g.lag;
      let idx = -1;
      for (let k = 1; k <= this.n; k++) { // vom neuesten rueckwaerts
        const j = (this.head - k + CAP) % CAP;
        if (this.times[j] <= want) { idx = j; break; }
      }
      if (idx < 0) { g.root.visible = false; continue; }
      const b = this.buf, o = idx * this.stride, r = g.root;
      r.visible = !flick;
      r.position.set(b[o], b[o + 1], b[o + 2]); r.rotation.y = b[o + 3];
      let q = o + 4;
      for (let k = 1; k < this.pairs; k++, q += 7) {
        const n = g.nodes[k];
        n.position.set(b[q], b[q + 1], b[q + 2]); n.quaternion.set(b[q + 3], b[q + 4], b[q + 5], b[q + 6]);
      }
    }
  }
  hide() { for (const g of this.ghosts) g.root.visible = false; this.n = 0; this.head = 0; this.t = 0; }
  dispose() { for (const g of this.ghosts) g.root.parent?.remove(g.root); }
}
