// [L] Cheap animated animal models: ONE SkinnedMesh (one draw call) per animal.
// Boxes are merged into a single geometry with per-box vertex colours; every box is rigidly bound to one bone.
// Bones are plain Object3D hierarchy nodes, so monster defs can use them as `nodes` (hurtboxes, pose) like the rigid models.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';

const _c = new THREE.Color();

/**
 * spec = {
 *   map: 'texture name', size: 16,
 *   bones: [{ n:'body', p:null|'parentName', at:[x,y,z] (local to parent) }],
 *   boxes: [{ b:'bone', s:[w,h,d], at:[x,y,z] (relative to the bone), c:'#hex', rx?, ry?, rz? (rad) }],
 *   pad: bounding sphere radius padding
 * }
 * -> { root (Group containing the SkinnedMesh), mesh, nodes:{boneName: Bone}, material }
 */
export function buildSkinned(spec) {
  const bones = [], byName = {}, world = {};
  for (const d of spec.bones) {
    const b = new THREE.Bone();
    b.name = d.n;
    b.position.set(d.at[0], d.at[1], d.at[2]);
    byName[d.n] = b;
    bones.push(b);
    const pw = d.p ? world[d.p] : [0, 0, 0];
    world[d.n] = [pw[0] + d.at[0], pw[1] + d.at[1], pw[2] + d.at[2]];
    if (d.p) byName[d.p].add(b);
  }
  const geos = [];
  for (const bx of spec.boxes) {
    const g = new THREE.BoxGeometry(bx.s[0], bx.s[1], bx.s[2]);
    if (bx.rx || bx.ry || bx.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(bx.rx ?? 0, bx.ry ?? 0, bx.rz ?? 0)));
    const w = world[bx.b];
    g.translate(w[0] + bx.at[0], w[1] + bx.at[1], w[2] + bx.at[2]);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    _c.set(bx.c ?? '#ffffff');
    const idx = bones.indexOf(byName[bx.b]);
    const nrm = g.attributes.normal;
    for (let i = 0; i < n; i++) {
      const k = nrm.getY(i) > 0.5 ? 1.12 : nrm.getY(i) < -0.5 ? 0.78 : 1; // baked top/bottom shading (PS1 look)
      col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      si[i * 4] = idx; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(g);
  }
  const geo = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += spec.pad ?? 0.6;
  const material = lambert({ map: tex(spec.map, { size: spec.size ?? 16 }), vertexColors: true });
  const mesh = new THREE.SkinnedMesh(geo, material);
  const root = new THREE.Group();
  mesh.add(bones[0]);
  root.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.boundingSphere = geo.boundingSphere.clone();
  return { root, mesh, nodes: byName, material };
}
