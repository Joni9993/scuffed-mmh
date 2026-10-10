import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex } from '../../render/textures.js';

const R = Math.PI / 180;

/**
 * Procedural raptor model (Jaggo / Jagglinge). Returns { root, apply(pose), nodes, partMeshes, extra }.
 * Part ids: head, body, legs, tail. Every part owns its materials so it can flash / jitter on its own.
 * Pose keys: see MREST in monster.js.
 */
export function buildRaptor({ scale = 1.3, skin = 'scale', crest = true, eye = '#ffe14d' } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { head: [], body: [], legs: [], tail: [] };
  const mats = {};
  const mat = (part, tx, opts = {}) => {
    const k = part + tx;
    if (!mats[k]) mats[k] = lambert({ map: tex(tx, { size: 16 }), ...opts });
    return mats[k];
  };
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };

  const body = new THREE.Group();
  body.position.y = 1.6;
  g.add(body);
  add('body', 1, 1, 2, mat('body', skin), body, 0, 0, 0);
  add('body', 0.8, 0.5, 1.4, mat('body', 'belly'), body, 0, -0.4, 0.1);
  for (const sx of [1, -1]) add('body', 0.15, 0.5, 0.15, mat('body', skin), body, sx * 0.5, -0.1, 0.9, 0.9);

  const neck = new THREE.Group();
  neck.position.set(0, 0.35, 0.85);
  body.add(neck);
  add('body', 0.5, 0.65, 0.5, mat('body', skin), neck, 0, 0.3, 0);

  const head = new THREE.Group();
  head.position.set(0, 0.62, 0);
  neck.add(head);
  add('head', 0.6, 0.5, 1.0, mat('head', skin), head, 0, 0.05, 0.4);
  add('head', 0.5, 0.18, 0.8, mat('head', 'belly'), head, 0, -0.25, 0.4, 0.2);
  const eyeM = basic({ color: eye });
  for (const sx of [1, -1]) add('head', 0.12, 0.12, 0.12, eyeM, head, sx * 0.31, 0.12, 0.5);
  let crestMesh = null, stump = null;
  if (crest) {
    crestMesh = new THREE.Mesh(new THREE.CircleGeometry(1.1, 6, Math.PI * 0.1, Math.PI * 0.8), mat('head', 'crest', { side: THREE.DoubleSide }));
    crestMesh.position.set(0, 0.1, -0.2);
    head.add(crestMesh);
    partMeshes.head.push(crestMesh);
    stump = add('head', 0.5, 0.18, 0.14, mat('head', 'crest'), head, 0, 0.2, -0.2);
    stump.visible = false;
  }

  const legs = {};
  for (const [name, sx] of [['legL', 1], ['legR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.45, -0.5, -0.2);
    body.add(l);
    const m = mat('legs', skin);
    add('legs', 0.35, 0.7, 0.5, m, l, 0, -0.35, 0.05, 0.35);
    add('legs', 0.25, 0.65, 0.25, m, l, 0, -0.8, 0.15, -0.3);
    add('legs', 0.3, 0.12, 0.55, mat('legs', 'bone'), l, 0, -1.05, 0.3);
    legs[name] = l;
  }

  const tail1 = new THREE.Group();
  tail1.position.set(0, -0.1, -1.0);
  body.add(tail1);
  add('tail', 0.55, 0.55, 1.6, mat('tail', skin), tail1, 0, 0, -0.8, -0.1);
  const tail2 = new THREE.Group();
  tail2.position.set(0, 0, -1.6);
  tail1.add(tail2);
  add('tail', 0.3, 0.3, 1.4, mat('tail', skin), tail2, 0, 0, -0.7, -0.1);

  const nodes = { body, neck, head, tail1, tail2, legL: legs.legL, legR: legs.legR, root: g };
  return {
    root, nodes, partMeshes, extra: { crest: crestMesh, stump, eyeMat: eyeM, tail2, scale }, // tail2/scale: Schwanz abtrennen (Jaggo)
    apply(p) {
      body.position.y = 1.6 + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.7 + p.neck;
      head.rotation.set(-(0.7 + p.neck) + p.head * R, p.headYaw * R, 0);
      tail1.rotation.set(p.tailPitch * R, p.tailYaw * R, 0);
      tail2.rotation.set(p.tailPitch * 0.5 * R, p.tailYaw * 0.8 * R, 0);
      legs.legL.rotation.x = -p.legL * R;
      legs.legR.rotation.x = -p.legR * R;
    },
  };
}
