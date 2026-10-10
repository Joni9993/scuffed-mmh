import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert, basic } from './ps1.js';
import { registerTexture, tex } from './textures.js';

// Vertex-coloured, merged geometry helpers (few draw calls): used by the town and the merged hunter rig.
registerTexture('grain', (g, n, rnd) => {
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, n, n);
  const cols = ['#ffffff', '#e4e4e4', '#d4d4d4', '#ececec'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (rnd() < 0.55) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
});

let _lit = null, _glow = null;
/** Shared lit vertex-colour material (PS1 snapped, grain texture). */
export function vcLit() { return (_lit ??= lambert({ vertexColors: true, map: tex('grain', { size: 16 }) })); }
/** Shared unlit vertex-colour material (flames, lanterns, glow). */
export function vcGlow() { return (_glow ??= basic({ vertexColors: true })); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

/** Collects coloured primitives, transforms them into place and merges them into ONE geometry. */
export class Parts {
  constructor() { this.geos = []; }
  /** Add an indexed geometry with a flat colour. at = {x,y,z,rx,ry,rz,sx,sy,sz} */
  add(geo, color, at = {}) {
    _e.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0, 'YXZ');
    _q.setFromEuler(_e);
    _p.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
    _s.set(at.sx ?? 1, at.sy ?? 1, at.sz ?? 1);
    geo.applyMatrix4(_m.compose(_p, _q, _s));
    const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.geos.push(geo);
    return this;
  }
  box(w, h, d, color, at) { return this.add(new THREE.BoxGeometry(w, h, d), color, at); }
  /** Box whose BOTTOM sits at at.y. */
  slab(w, h, d, color, at = {}) { return this.box(w, h, d, color, { ...at, y: (at.y ?? 0) + h / 2 }); }
  cyl(rt, rb, h, seg, color, at) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, at); }
  cone(r, h, seg, color, at) { return this.add(new THREE.ConeGeometry(r, h, seg), color, at); }
  plane(w, h, color, at) { return this.add(new THREE.PlaneGeometry(w, h), color, at); }
  sphere(r, ws, hs, color, at) { return this.add(new THREE.SphereGeometry(r, ws, hs), color, at); }
  get empty() { return this.geos.length === 0; }
  merge() { return mergeGeometries(this.geos, false); }
  mesh(material = vcLit()) { return new THREE.Mesh(this.merge(), material); }
}
