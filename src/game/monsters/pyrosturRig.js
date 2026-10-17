import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';

export const PYRO_SCALE = 1.65;
const D = Math.PI / 180;
const SIDES = [[1, 'L'], [-1, 'R']];
const C = { hide: '#77717a', armor: '#3d3c4b', rim: '#a59a9b', bone: '#edd0a0', ember: '#ffad42', skin: '#a56653' };

/** Articulated low-poly elder. Decorations batch per joint/part/material, never per scale. */
export function buildPyrostur() {
  const root = new THREE.Group(), scale = new THREE.Group(); root.add(scale); scale.scale.setScalar(PYRO_SCALE);
  const nodes = {}, batches = new Map(), materials = new Map();
  const partMeshes = Object.fromEntries(['body', 'chest', 'head', 'valve', 'wingL', 'wingR', 'tail'].map(k => [k, []]));
  function joint(id, parent, x, y, z) { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); nodes[id] = n; return n; }
  function geo(part, parent, color, g, pos = [0, 0, 0], stretch = [1, 1, 1], rot = [0, 0, 0], glow = false) {
    glow ||= color === C.ember;
    const key = `${parent.uuid}/${part}/${color}/${glow}`, materialKey = `${part}/${color}/${glow}`;
    if (!materials.has(materialKey)) {
      const mat = glow ? basic({ color, side: THREE.DoubleSide }) : lambert({ color, flatShading: true, side: THREE.DoubleSide });
      // Preserve the PS1 snap, with enough definition for eyes, teeth and horn contours on a phone.
      mat.userData.ps1.uSnapDetail.value = 1.7;
      materials.set(materialKey, mat);
    }
    const source = g.index ? g.toNonIndexed() : g;
    source.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...stretch)));
    if (source !== g) g.dispose();
    if (!batches.has(key)) batches.set(key, { parent, part, mat: materials.get(materialKey), list: [] });
    batches.get(key).list.push(source);
  }
  const flesh = (part, n, color, pos, size) => geo(part, n, color, new THREE.SphereGeometry(1, 8, 5), pos, size);
  function bone(part, n, color, a, b, r0, r1 = .01) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), delta = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
    const g = new THREE.CylinderGeometry(r1, r0, delta.length(), 6); g.applyQuaternion(q);
    geo(part, n, color, g, va.add(vb).multiplyScalar(.5).toArray());
  }
  function plate(part, n, color, pos, size, rot = [0, 0, 0]) {
    geo(part, n, color, new THREE.OctahedronGeometry(1), pos, size, rot);
  }
  function membrane(part, n, points) {
    // Two sewn panels with irregular trailing edges; no transparent sorting/render pass.
    const vertices = [];
    for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals();
    geo(part, n, C.skin, g);
  }
  const body = joint('body', scale, 0, 1.55, 0);
  flesh('body', body, C.hide, [0, 0, -.12], [.94, .83, 1.65]);
  flesh('body', body, C.hide, [0, .3, .68], [1.27, 1.06, 1.08]);
  flesh('body', body, C.hide, [0, -.12, -1.13], [.63, .59, .82]);
  // Overlapping basalt cuirass rather than a cylindrical appliance.
  for (let i = 0; i < 6; i++) {
    const z = 1 - i * .48, width = 1.05 - i * .08;
    plate('body', body, C.armor, [0, .65, z], [width, .34, .5]);
    plate('body', body, C.rim, [0, .86, z + .08], [width * .79, .075, .32]);
    bone('body', body, C.armor, [0, .7, z], [0, 1.28 - i * .06, z - .23], .24);
    for (const s of [-1, 1]) plate('body', body, C.armor, [s * width * .7, .28, z], [.35, .5, .48], [0, 0, -s * .6]);
  }
  const chest = joint('chest', body, 0, -.3, 1.05);
  flesh('chest', chest, C.ember, [0, 0, .21], [.65, .61, .42]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++)
    bone('chest', chest, C.armor, [s * .18, -.42 + i * .25, .56], [s * .64, -.35 + i * .2, .12], .1, .14);
  const core = joint('core', chest, 0, 0, .6);
  flesh('chest', core, C.ember, [0, 0, 0], [.15, .46, .08]);
  const coreMat = materials.get(`chest/${C.ember}/true`);
  const valve = joint('valve', body, 1.0, -.5, .65);
  flesh('valve', valve, C.bone, [0, 0, 0], [.24, .26, .28]);
  const pipe = joint('pipe', valve, 0, 0, 0);
  bone('valve', pipe, C.armor, [0, .02, 0], [.25, .55, -.2], .23, .18);
  bone('valve', pipe, C.armor, [.25, .55, -.2], [.55, .65, -.35], .18, .15);
  const needle = joint('needle', valve, .25, .13, .25);
  bone('valve', needle, C.ember, [0, 0, 0], [0, .34, 0], .045, .015);
  const neck = joint('neck', body, 0, .05, 1.25);
  flesh('body', neck, C.hide, [0, -.01, .4], [.66, .61, .8]);
  for (const s of [-1, 1]) plate('body', neck, C.armor, [s * .42, .3, .35], [.38, .47, .8], [0, 0, s * .2]);
  const head = joint('head', neck, 0, -.05, .95);
  flesh('head', head, C.hide, [0, .03, .18], [.76, .56, .78]);
  flesh('head', head, C.armor, [0, -.05, .88], [.47, .3, .62]);
  plate('head', head, C.armor, [0, .37, .33], [.6, .2, .85]);
  for (const s of [-1, 1]) {
    // Forward, outward and then inward hooked horns produce the unmistakable heavy silhouette.
    bone('head', head, C.bone, [s * .5, .26, -.2], [s * 1.13, .86, .48], .37, .29);
    bone('head', head, C.bone, [s * 1.13, .86, .48], [s * 1.4, .71, 1.56], .29, .17);
    bone('head', head, C.bone, [s * 1.4, .71, 1.56], [s * .99, .4, 2.6], .17, .005);
    plate('head', head, C.bone, [s * .61, -.01, .09], [.32, .37, .77]);
    plate('head', head, C.armor, [s * .64, .1, .5], [.13, .19, .36]);
    plate('head', head, C.ember, [s * .74, .1, .56], [.065, .08, .28]);
    plate('head', head, C.bone, [s * .64, .29, .5], [.22, .16, .42], [0, 0, s * -.3]);
    for (let i = 0; i < 5; i++) bone('head', head, C.bone, [s * .35, -.22, .35 + i * .2], [s * .33, -.45, .4 + i * .2], .065);
  }
  const jaw = joint('jaw', head, 0, -.28, .1);
  flesh('head', jaw, C.armor, [0, -.08, .68], [.4, .18, .85]);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) bone('head', jaw, C.bone, [s * .3, .02, .42 + i * .23], [s * .29, .22, .42 + i * .23], .055);

  const wings = {};
  for (const [id, s, suffix] of [['wingL', 1, 'L'], ['wingR', -1, 'R']]) {
    const w = joint(id, body, s * .85, .25, .4); wings[id] = w;
    flesh(id, w, C.hide, [s * .32, -.02, .08], [.76, .67, .72]);
    bone(id, w, C.armor, [0, 0, 0], [s * 1.1, -.35, .8], .32, .2);
    plate(id, w, C.armor, [s * .35, .34, -.1], [.64, .6, .72]);
    plate(id, w, C.rim, [s * .35, .7, -.04], [.48, .08, .59]);
    const elbow = joint('elbow' + suffix, w, s * 1.1, -.35, .8);
    bone(id, elbow, C.armor, [0, 0, 0], [s * 1.1, -.4, .65], .22, .13);
    const wrist = joint('wrist' + suffix, elbow, s * 1.1, -.4, .65);
    // Long finger spars frame a torn, angular sail; the arm ends in a grounded hunting claw.
    for (const [dx, dz] of [[1.7, -1.6], [1.15, -2.3], [.45, -2.6]])
      bone(id, wrist, C.armor, [0, 0, 0], [s * dx, .25, dz], .1, .025);
    membrane(id, wrist, [[0, 0, 0], [s * 1.7, .25, -1.6], [s * 1.1, .12, -1.42], [s * 1.15, .25, -2.3], [s * .65, .12, -2.05], [s * .45, .25, -2.6], [-s * .65, .12, -1.7]]);
    for (let i = 0; i < 3; i++) bone(id, wrist, C.armor, [s * (i - 1) * .16, -.05, 0], [s * (i - 1) * .21, -.99, .36], .1, .01);
    const leg = joint('leg' + suffix, body, s * .72, -.5, -.85);
    flesh('body', leg, C.hide, [0, -.22, -.12], [.47, .5, .64]);
    bone('body', leg, C.armor, [0, -.25, -.13], [0, -.55, -.05], .25, .19);
    const knee = joint('knee' + suffix, leg, 0, -.55, -.05);
    bone('body', knee, C.armor, [0, 0, 0], [0, -.35, .43], .19, .13);
    const ankle = joint('ankle' + suffix, knee, 0, -.35, .43);
    flesh('body', ankle, C.armor, [0, 0, 0], [.36, .15, .57]);
    for (let i = 0; i < 3; i++) bone('body', ankle, C.armor, [-.23 + i * .23, -.03, .24], [-.27 + i * .27, -.14, .64], .12, .015);
  }
  const tail = joint('tail', body, 0, -.1, -1.4);
  bone('tail', tail, C.hide, [0, 0, 0], [0, -.15, -1.5], .48, .3);
  const tailMid = joint('tailMid', tail, 0, -.15, -1.5);
  bone('tail', tailMid, C.hide, [0, 0, 0], [0, -.08, -1.45], .3, .16);
  const tailTip = joint('tailTip', tailMid, 0, -.08, -1.45);
  bone('tail', tailTip, C.armor, [0, 0, 0], [0, .08, -1.15], .18, .01);
  plate('tail', tailTip, C.armor, [0, .05, -.6], [.95, .22, 1.0]);
  plate('tail', tailTip, C.ember, [0, .06, -.65], [.77, .24, .1]);
  for (let i = 0; i < 4; i++) plate('tail', tail, C.hide, [0, .23, -.2 - i * .33], [.38 - i * .04, .3, .3]);
  for (const b of batches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat); b.parent.add(mesh); partMeshes[b.part].push(mesh);
    for (const g of b.list) g.dispose();
  }
  const v = (p, k) => Number.isFinite(p[k]) ? p[k] : 0;
  // Contact is solved in model space. World elevation/network interpolation never changes a pose.
  const contactMatrix = new THREE.Matrix4(), contactPoint = new THREE.Vector3();
  function clawFloor(suffix) {
    const w = wings['wing' + suffix], e = nodes['elbow' + suffix], wrist = nodes['wrist' + suffix];
    w.updateMatrix(); e.updateMatrix(); wrist.updateMatrix();
    contactMatrix.copy(scale.matrix).multiply(body.matrix).multiply(w.matrix).multiply(e.matrix).multiply(wrist.matrix);
    let floor = Infinity;
    for (let i = -1; i <= 1; i++) {
      contactPoint.set(i * .21, -.99, .36).applyMatrix4(contactMatrix);
      floor = Math.min(floor, contactPoint.y);
    }
    return floor;
  }
  function hindFloor(suffix) {
    const leg = nodes['leg' + suffix], knee = nodes['knee' + suffix], ankle = nodes['ankle' + suffix];
    leg.updateMatrix(); knee.updateMatrix(); ankle.updateMatrix();
    contactMatrix.copy(scale.matrix).multiply(body.matrix).multiply(leg.matrix).multiply(knee.matrix).multiply(ankle.matrix);
    let floor = Infinity;
    for (let i = -1; i <= 1; i++) {
      contactPoint.set(i * .27, -.14, .64).applyMatrix4(contactMatrix); floor = Math.min(floor, contactPoint.y);
      contactPoint.set(i * .27, -.15, -.19).applyMatrix4(contactMatrix); floor = Math.min(floor, contactPoint.y);
    }
    return floor;
  }
  function apply(p = {}) {
    const k = name => v(p, name);
    body.position.y = 1.55 + k('bodyY'); body.rotation.set(k('bodyPitch') * D, k('bodyYaw') * D, k('bodyRoll') * D);
    neck.rotation.set(k('neck'), k('neckYaw') * D, 0);
    head.position.z = .95 + k('headReach'); head.rotation.set(k('head') * D, k('headYaw') * D, 0); jaw.rotation.x = k('jaw') * D;
    tail.rotation.set(k('tailPitch') * D, k('tailYaw') * D, 0);
    tailMid.rotation.y = k('tailCurl') * D; tailTip.rotation.y = k('tailCurl') * D * .7;
    for (const [s, suffix] of SIDES) {
      const w = wings['wing' + suffix];
      w.rotation.set((k('fore' + suffix)) * D, -s * k('spread') * .3, s * (k('wing') + k('wing' + suffix)) * D);
      nodes['elbow' + suffix].rotation.z = s * k('elbow' + suffix) * D;
      nodes['wrist' + suffix].rotation.set(k('wrist' + suffix) * D, 0, 0);
      nodes['leg' + suffix].rotation.x = (k('leg' + suffix) + k('hind' + suffix)) * D;
      nodes['knee' + suffix].rotation.x = 0;
      nodes['ankle' + suffix].rotation.set(0, 0, 0);
    }
    chest.scale.setScalar(1 + k('boiler') * .12);
    if (Math.abs(k('bodyRoll')) < 50 && k('bodyY') > -.8) {
      scale.updateMatrix(); body.updateMatrix();
      for (const [s, suffix] of SIDES) {
        // A small shoulder adjustment preserves authored anticipation and ground contact on banks.
        for (let step = 0; step < 6 && clawFloor(suffix) < -.02; step++) wings['wing' + suffix].rotation.z += s * 5 * D;
        const knee = nodes['knee' + suffix], ankle = nodes['ankle' + suffix], leg = nodes['leg' + suffix];
        if (hindFloor(suffix) < -.02) {
          // A crouch folds the hock, while the ankle counter-rotates to keep the sole level.
          // Positive body height (flight/rear-up) and already lifted feet keep their authored motion.
          for (let step = 0; step < 20 && hindFloor(suffix) < -.02; step++) {
            knee.rotation.x -= 5 * D;
            ankle.rotation.set(-body.rotation.x - leg.rotation.x - knee.rotation.x, 0, -body.rotation.z);
          }
        }
      }
    }
  }
  apply();
  return { root, nodes, partMeshes, apply, extra: { pipe, needle, coreMat, wings } };
}
