import * as THREE from 'three';
import { lambert } from './ps1.js';
import { tex } from './textures.js';
import { Parts } from './vcolor.js'; // also registers the 'grain' texture

// [G] Gear-Optik helpers (GDD 8.6), reusable by every weapon/armor builder (e.g. the katana):
//  - GearParts: vertex-coloured Parts with a per-vertex `glow` (0..1) that lights the vertex colour from within
//  - gearMaterial(): lit PS1 material that turns `glow` into emissive light (one extra uniform, no extra draw call)
//  - bar()/spike()/tri(): oriented primitives between two points (horns, spikes, wing membranes)
//  - GearEmitter: ONE pooled THREE.Points per rig for embers / aura / element particles (fire, shock, poison)

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class GearParts extends Parts {
  /** at.glow (0..1) = share of the vertex colour that glows on its own. */
  add(geo, color, at = {}) {
    super.add(geo, color, at);
    const n = geo.attributes.position.count;
    geo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(n).fill(at.glow ?? 0), 1));
    return this;
  }
}

/** Lit vertex-colour material whose `glow` attribute adds self-illumination. material.userData.glow.value scales it (pulse). */
export function gearMaterial(strength = 1) {
  const mat = lambert({ vertexColors: true, map: tex('grain', { size: 16 }) });
  const uGlow = { value: strength };
  mat.userData.glow = uGlow;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uGearGlow = uGlow;
    sh.vertexShader = 'attribute float glow; varying float vGlow;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = glow;');
    sh.fragmentShader = 'varying float vGlow; uniform float uGearGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vGlow * uGearGlow * 1.6;');
  };
  mat.customProgramCacheKey = () => 'ps1gear';
  return mat;
}

function orient(a, b, at) {
  _a.set(...a); _b.set(...b);
  const len = _a.distanceTo(_b);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_up, _b);
  _e.setFromQuaternion(_q, 'YXZ');
  return { len, at: { ...at, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: _e.x, ry: _e.y, rz: _e.z } };
}
/** Tapered 4-sided bar from point a (radius r0) to point b (radius r1). */
export function bar(P, a, b, r0, r1, color, at = {}) {
  const o = orient(a, b, at);
  return P.add(new THREE.CylinderGeometry(r1, r0, o.len, 4, 1), color, o.at);
}
/** Pyramid with its base centred on `a` and its tip on `b`. */
export function spike(P, a, b, r, color, at = {}) {
  const o = orient(a, b, at);
  return P.add(new THREE.ConeGeometry(r, o.len, 4, 1), color, o.at);
}
/** Double-sided flat triangle (wing membranes). */
export function tri(P, a, b, c, color, at = {}) {
  const g = new THREE.BufferGeometry();
  const n = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a))).normalize();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c, ...a, ...b, ...c]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z]), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(12), 2));
  g.setIndex([0, 1, 2, 3, 5, 4]);
  return P.add(g, color, at);
}

// ------------------------------------------------------------ particles
const KINDS = {
  ember: { cols: ['#ff8a2a', '#ffd060', '#ff5a1a'], life: [0.9, 1.5], up: [0.7, 1.3], spread: 0.3 },
  fire: { cols: ['#ff7a1a', '#ffc040', '#ff4a10'], life: [0.45, 0.8], up: [0.5, 1.1], spread: 0.35 },
  shock: { cols: ['#8fe8ff', '#ffffff', '#4ab8ff'], life: [0.2, 0.38], up: [0, 0], spread: 1.5 },
  poison: { cols: ['#7aff4a', '#3aa82a', '#b8ff7a'], life: [0.8, 1.3], up: [0.25, 0.6], spread: 0.15 },
  aura: { cols: ['#ff8a2a', '#ff3a1a', '#ffd060'], life: [1.0, 1.5], up: [0.8, 1.4], spread: 0.1, ring: 0.62 },
};
const _c = new THREE.Color(), _w = new THREE.Vector3();
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Pooled particles for one rig: positions live in the rig root's local space (cheap, follows the hunter).
 * sources: [{ kind:'ember'|'fire'|'shock'|'poison'|'aura', rate (per s), at:[x,y,z] | obj:Object3D + off:[x,y,z], cols? }]
 */
export class GearEmitter {
  constructor(root, max = 28) {
    this.root = root; this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.sources = [];
    root.add(this.points);
  }
  setSources(list) {
    this.sources = list.map((s) => ({ ...s, acc: Math.random() }));
    this.points.visible = this.sources.length > 0;
    if (!this.sources.length) { this.life.fill(0); this.col.fill(0); this.points.geometry.attributes.color.needsUpdate = true; }
  }
  #spawn(s) {
    let i = -1;
    for (let k = 0; k < this.max; k++) if (this.life[k] <= 0) { i = k; break; }
    if (i < 0) return;
    const K = KINDS[s.kind] ?? KINDS.ember;
    if (s.obj) { s.obj.getWorldPosition(_w); if (s.off) _w.add(_a.set(...s.off).applyQuaternion(s.obj.getWorldQuaternion(_q))); this.root.worldToLocal(_w); } else _w.set(...s.at);
    let x = _w.x + rnd(-0.06, 0.06), y = _w.y + rnd(-0.06, 0.06), z = _w.z + rnd(-0.06, 0.06);
    let vx = rnd(-K.spread, K.spread), vz = rnd(-K.spread, K.spread);
    if (K.ring) { const a = Math.random() * 6.283; x = Math.cos(a) * K.ring; z = Math.sin(a) * K.ring; y = rnd(0.1, 1.4); vx = -Math.sin(a) * 0.5; vz = Math.cos(a) * 0.5; }
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = rnd(K.up[0], K.up[1]); this.vel[i * 3 + 2] = vz;
    if (s.kind === 'shock') { this.vel[i * 3 + 1] = rnd(-1, 1); }
    this.maxLife[i] = this.life[i] = rnd(K.life[0], K.life[1]);
    _c.set((s.cols ?? K.cols)[(Math.random() * (s.cols ?? K.cols).length) | 0]);
    this.base[i * 3] = _c.r; this.base[i * 3 + 1] = _c.g; this.base[i * 3 + 2] = _c.b;
  }
  update(dt) {
    if (!this.points.visible) return;
    for (const s of this.sources) { s.acc += s.rate * dt; while (s.acc >= 1) { s.acc -= 1; this.#spawn(s); } }
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      for (let j = 0; j < 3; j++) { this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt; this.col[i * 3 + j] = this.base[i * 3 + j] * k; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
  dispose() { this.root.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
}
