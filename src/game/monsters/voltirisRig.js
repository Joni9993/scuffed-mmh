import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';

// One merged mesh per articulated part: the silhouette carries the detail, not particles.
export function buildVoltiris({ scale = 2 } = {}) {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); g.scale.setScalar(scale);
  const nodes = { root: g }, partMeshes = {}, buckets = [];
  const joint = (name, parent, x, y, z) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); return (nodes[name] = n); };
  const block = (list, size, at, rot = [0, 0, 0]) => {
    const geo = new THREE.BoxGeometry(...size); geo.rotateX(rot[0]); geo.rotateY(rot[1]); geo.rotateZ(rot[2]); geo.translate(...at); list.push(geo);
  };
  const part = (id, parent, color, fn, glow = false) => {
    const list = []; fn(list); const geo = mergeGeometries(list); list.forEach((v) => v.dispose());
    const mesh = new THREE.Mesh(geo, (glow ? basic : lambert)({ color })); parent.add(mesh); (partMeshes[id] ??= []).push(mesh); buckets.push(mesh); return mesh;
  };
  const body = joint('body', g, 0, 1.05, 0);
  part('body', body, '#394d70', (a) => { block(a, [1.05, .9, 2.3], [0, .1, -.1]); block(a, [.78, .65, 1.1], [0, .45, .7]); block(a, [.65, .2, 2], [0, -.37, 0]); });
  const neck = joint('neck', body, 0, .35, 1.05), head = joint('head', neck, 0, .2, .6);
  part('head', head, '#91b6c7', (a) => { block(a, [.6, .45, .8], [0, 0, .2]); block(a, [.35, .24, .7], [0, -.12, .72]); });
  part('head', head, '#ffe999', (a) => { for (const s of [-1, 1]) block(a, [.08, .12, .2], [s * .31, .12, .4]); }, true);
  const antenna = joint('antenna', head, 0, .2, 0);
  part('antenna', antenna, '#75ecd9', (a) => { for (const s of [-1, 0, 1]) { block(a, [.065, .9 + .3 * (s === 0), .065], [s * .27, .48, -.08], [-.22, 0, -s * .25]); block(a, [.18, .09, .22], [s * .4, .98, -.2]); } });
  const wingL = joint('wingL', body, .6, .45, .25), wingR = joint('wingR', body, -.6, .45, .25);
  for (const [node, s, long] of [[wingL, 1, 1.2], [wingR, -1, .85]]) {
    part('wing', node, s > 0 ? '#7cced0' : '#b19bd6', (a) => {
      for (let i = 0; i < 4; i++) block(a, [.6 * long, .09, 1.8 - i * .3], [s * (.3 + i * .5) * long, .15 + i * .1, -.25 - i * .24], [0, s * .28, s * .1]);
      block(a, [2.3 * long, .12, .18], [s * 1.1 * long, .32, .45], [0, .1 * s, .1 * s]);
    });
  }
  for (const [name, s] of [['legL', 1], ['legR', -1]]) {
    const leg = joint(name, body, s * .55, -.1, -.5);
    part('legs', leg, '#61758a', (a) => { block(a, [.35, .8, .42], [0, -.3, 0]); block(a, [.25, .45, .25], [0, -.7, .12]); block(a, [.45, .12, .7], [0, -.9, .3]); });
  }
  const tail = joint('tail', body, 0, .05, -1.15);
  part('tail', tail, '#5c879a', (a) => { for (let i = 0; i < 4; i++) block(a, [.4 - i * .07, .3 - i * .04, .8], [0, i * .1, -.35 - i * .65], [-.1, 0, 0]); });
  // Deliberately incomplete wireframe echoes. Only the solid, yellow-eyed animal is real.
  const echoes = [-1, 1].map((s) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 3.5), basic({ color: '#77b6da', wireframe: true, transparent: true, opacity: .22, depthWrite: false })); mesh.position.set(s * 3.1, 1.2, -.7); mesh.visible = false; g.add(mesh); return mesh; });
  return { root, nodes, partMeshes, extra: { scale, antenna, wingL, wingR, echoes }, apply(p) {
    const r = Math.PI / 180; body.position.y = 1.05 + p.bodyY / scale; body.rotation.set(p.bodyPitch * r, 0, p.bodyRoll * r);
    neck.rotation.x = p.neck; head.rotation.set(p.head * r, p.headYaw * r, 0);
    wingL.rotation.z = .18 + p.wing * r + p.spread * .45; wingR.rotation.z = -.18 - p.wing * r - p.spread * .45;
    nodes.legL.rotation.x = -p.legL * r; nodes.legR.rotation.x = -p.legR * r; tail.rotation.set(p.tailPitch * r, p.tailYaw * r, 0);
  } };
}
