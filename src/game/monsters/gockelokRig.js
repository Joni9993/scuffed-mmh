import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';

export function buildGockelok({ scale = 2.2 } = {}) {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g); g.scale.setScalar(scale);
  const nodes = { root: g }, partMeshes = {};
  const joint = (name, parent, x, y, z) => { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); return (nodes[name] = n); };
  const box = (a, size, pos, rz = 0, rx = 0) => { const v = new THREE.BoxGeometry(...size); v.rotateZ(rz); v.rotateX(rx); v.translate(...pos); a.push(v); };
  const part = (name, parent, color, fn, unlit = false) => { const a = []; fn(a); const mesh = new THREE.Mesh(mergeGeometries(a), (unlit ? basic : lambert)({ color })); a.forEach((v) => v.dispose()); parent.add(mesh); (partMeshes[name] ??= []).push(mesh); return mesh; };
  const body = joint('body', g, 0, 1.35, 0);
  part('body', body, '#d6c49b', (a) => { box(a, [1.1, 1.1, 1.25], [0, .12, .05]); box(a, [.9, .85, .7], [0, .38, .58], 0, -.2); box(a, [.8, .65, .7], [0, -.2, -.6]); for (let i = 0; i < 4; i++) box(a, [1.04 - i * .08, .08, .25], [0, .5 - i * .22, .75]); });
  const neck = joint('neck', body, 0, .5, .55);
  part('body', neck, '#c9a84e', (a) => { box(a, [.55, 1.1, .55], [0, .45, 0], 0, -.18); for (let i = 0; i < 3; i++) box(a, [.72 - i * .1, .18, .7 - i * .1], [0, i * .24, .04]); });
  const head = joint('head', neck, 0, .92, .15);
  part('head', head, '#f2d393', (a) => { box(a, [.62, .55, .65], [0, 0, .13]); box(a, [.35, .2, .55], [0, -.08, .63]); });
  part('head', head, '#e2b32e', (a) => box(a, [.38, .2, .4], [0, -.12, .8]));
  part('head', head, '#ffffff', (a) => { for (const s of [-1, 1]) box(a, [.09, .27, .28], [s * .32, .1, .27]); }, true);
  part('head', head, '#131722', (a) => { for (const s of [-1, 1]) box(a, [.1, .16, .1], [s * .35, .1, .36]); }, true);
  const comb = joint('comb', head, 0, .24, 0);
  part('comb', comb, '#ce3948', (a) => { box(a, [.17, .24, .7], [0, .05, 0]); for (let i = 0; i < 4; i++) box(a, [.19, .3 + i * .045, .17], [0, .24 + i * .025, -.28 + i * .19], -.13 * (i - 1)); });
  const wattle = joint('wattle', head, 0, -.3, .35);
  part('head', wattle, '#b82e50', (a) => { box(a, [.18, .55, .18], [-.12, -.2, .05], -.15); box(a, [.18, .47, .18], [.12, -.18, .05], .15); });
  for (const [name, s] of [['wingL', 1], ['wingR', -1]]) {
    const wing = joint(name, body, s * .55, .35, -.1);
    part('wing', wing, '#566778', (a) => { box(a, [.25, .6, .85], [s * .1, -.25, -.1], s * -.1); for (let i = 0; i < 5; i++) box(a, [.15, .24, .8 + i * .07], [s * .15, -.35 - i * .07, -.3 - i * .12], s * .12, .2); });
  }
  for (const [name, s] of [['legL', 1], ['legR', -1]]) {
    const leg = joint(name, body, s * .38, -.45, .05);
    part('legs', leg, '#e2bd37', (a) => { box(a, [.2, .75, .2], [0, -.3, 0], 0, -.15); box(a, [.18, .45, .18], [0, -.7, .05], 0, .2); for (let i = -1; i <= 1; i++) box(a, [.1, .1, .6], [i * .16, -.85, .28], 0, 0); });
    const spur = joint(name === 'legL' ? 'spurL' : 'spurR', leg, 0, -.45, -.1);
    part('spur', spur, '#f1efcf', (a) => box(a, [.17, .15, .7], [0, 0, -.27], 0, -.25));
  }
  const tail = joint('tail', body, 0, .25, -.65);
  part('tail', tail, '#365d67', (a) => { for (let i = -2; i <= 2; i++) { box(a, [.2, 1.1 - Math.abs(i) * .15, .25], [i * .19, .35, -.45 - Math.abs(i) * .08], i * -.2, -.55); box(a, [.21, .25, .7], [i * .18, .78, -.9], i * -.2, -.3); } });
  const eggs = [-1, 0, 1].map(() => { const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.38), lambert({ color: '#d2f0d1' })); mesh.visible = false; g.add(mesh); return mesh; });
  return { root, nodes, partMeshes, extra: { scale, comb, eggs, spurL: nodes.spurL, spurR: nodes.spurR }, apply(p) {
    const r = Math.PI / 180; body.position.y = 1.35 + p.bodyY / scale; body.rotation.set(p.bodyPitch * r, 0, p.bodyRoll * r);
    // A tall rooster must actually bring its beak to the ground when pecking.
    // Compress the neck and lean forward: comb/head hurtboxes follow these joints,
    // giving every melee weapon a real opening after the sprint stumble as well.
    const peck = Math.min(1, Math.max(0, p.neck / .6)) * Math.min(1, Math.max(0, p.head / 30));
    const stumble = Math.min(1, Math.max(0, (p.bodyPitch - 25) / 15)) * Math.min(1, Math.max(0, p.head / 25));
    const lower = Math.max(peck, stumble * .68);
    neck.position.set(0, .5 - lower * .9, .55 + lower * .5);
    head.position.set(0, .92 - lower * .55, .15 + lower * .35);
    neck.rotation.x = p.neck; neck.scale.set(1 + p.spread * .4, 1 + p.spread * .12, 1 + p.spread * .4); head.rotation.set(p.head * r, p.headYaw * r, 0);
    comb.rotation.z = p.headYaw * r * .8 + p.bodyRoll * r * .6; wattle.rotation.x = -p.head * r * .5;
    nodes.wingL.rotation.z = -.2 + p.wing * r; nodes.wingR.rotation.z = .2 - p.wing * r;
    nodes.legL.rotation.x = -p.legL * r; nodes.legR.rotation.x = -p.legR * r; tail.rotation.set(p.tailPitch * r, p.tailYaw * r, 0);
  } };
}
