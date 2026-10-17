import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';
import { dragonSurface } from '../../render/dragonSurface.js';

export const FELS_SCALE = 1.85;
const BODY_Y = 1.3;
const D = Math.PI / 180;
const SIDES = [[1, 'L'], [-1, 'R']];
const C = { hide: '#4e4641', muscle: '#664a38', armor: '#2a2930', edge: '#8a7765', bone: '#cdbb9b', membrane: '#352a29', panel: '#4b372d', hot: '#ff7a1c', core: '#ffd264' };
const HOT_DIM = new THREE.Color('#c4500f'), HOT_BRIGHT = new THREE.Color('#ffa535');
const CORE_DIM = new THREE.Color('#e8a040'), CORE_BRIGHT = new THREE.Color('#fff0a8');

/** Erdbeben- & Schlacke-Elder: low, heavy basalt quadruped. Same articulation contract as buildPyrostur. */
export function buildFelsengroll() {
  const root = new THREE.Group(), scale = new THREE.Group(); root.add(scale); scale.scale.setScalar(FELS_SCALE);
  const nodes = {}, batches = new Map(), materials = new Map();
  const partMeshes = Object.fromEntries(['body', 'chest', 'head', 'valve', 'wingL', 'wingR', 'tail', 'shoulder', 'club'].map(k => [k, []]));
  function joint(id, parent, x, y, z) { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); nodes[id] = n; return n; }
  function geo(part, parent, color, g, pos = [0, 0, 0], stretch = [1, 1, 1], rot = [0, 0, 0], glow = false) {
    glow ||= color === C.hot || color === C.core;
    const surface = [C.hide, C.muscle].includes(color) ? 'scale' : [C.membrane, C.panel].includes(color) ? 'leather' : 'plain';
    const mk = glow ? `${part}/${color}/true` : `${part}/${surface}`;
    const key = `${parent.uuid}/${mk}`;
    if (!materials.has(mk)) {
      const mat = glow ? basic({ color, side: THREE.DoubleSide }) : lambert({ color: '#ffffff', vertexColors: true, flatShading: true, side: THREE.DoubleSide });
      if (!glow && surface !== 'plain') dragonSurface(mat, surface === 'leather');
      mat.userData.ps1.uSnapDetail.value = 2; materials.set(mk, mat);
    }
    const g2 = g.index ? g.toNonIndexed() : g;
    g2.deleteAttribute('uv');
    if (!glow) {
      const tint = new THREE.Color(color), colors = new Float32Array(g2.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
      g2.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    g2.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...stretch)));
    if (g2 !== g) g.dispose();
    if (!batches.has(key)) batches.set(key, { parent, part, mat: materials.get(mk), list: [] });
    batches.get(key).list.push(g2);
  }
  function loft(part, n, color, rings, sides = 8) {
    const v = [];
    const p = (r, i) => { const a = (i % sides) / sides * Math.PI * 2; return [r[0] + Math.sin(a) * r[3], r[1] + Math.cos(a) * r[4], r[2]]; };
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < sides; i++) v.push(...p(rings[k], i), ...p(rings[k + 1], i), ...p(rings[k], i + 1), ...p(rings[k], i + 1), ...p(rings[k + 1], i), ...p(rings[k + 1], i + 1));
    for (const [idx, reverse] of [[0, false], [rings.length - 1, true]]) for (let i = 1; i < sides - 1; i++) v.push(...p(rings[idx], 0), ...p(rings[idx], reverse ? i + 1 : i), ...p(rings[idx], reverse ? i : i + 1));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); geo(part, n, color, g);
  }
  function bone(part, n, color, a, b, r0, r1 = .01, sides = 7) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), delta = vb.clone().sub(va);
    const g = new THREE.CylinderGeometry(r1, r0, delta.length(), sides); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
    geo(part, n, color, g, va.add(vb).multiplyScalar(.5).toArray());
  }
  const plate = (part, n, color, pos, size, rot = [0, 0, 0]) => geo(part, n, color, new THREE.OctahedronGeometry(1), pos, size, rot);
  // Hexagonal basalt column: the slab language of this monster.
  const col = (part, n, color, pos, size, rot = [0, 0, 0]) => geo(part, n, color, new THREE.CylinderGeometry(1, 1, 1, 6), pos, size, rot);
  function horn(part, n, color, points, radius) { for (let i = 0; i < points.length - 1; i++) bone(part, n, Array.isArray(color) ? color[Math.min(i, color.length - 1)] : color, points[i], points[i + 1], radius * (1 - i / (points.length - 1)), i === points.length - 2 ? .006 : radius * (1 - (i + 1) / (points.length - 1))); }
  function sail(part, n, a, b, c, color) {
    const mid = a.map((v, i) => (v + b[i] + c[i]) / 3 + (i === 1 ? .1 : 0));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...mid, ...b, ...c, ...mid, ...c, ...a, ...mid], 3)); g.computeVertexNormals(); geo(part, n, color, g);
  }

  // ---- body: wide, flat, heavy barrel
  const body = joint('body', scale, 0, BODY_Y, 0);
  loft('body', body, C.hide, [[0, -.12, -2, .55, .5], [0, -.05, -1.3, 1.15, .78], [0, .08, -.35, 1.55, .95], [0, .14, .6, 1.62, 1.0], [0, .02, 1.4, 1.15, .8]]);
  for (const [s] of SIDES) {
    loft('body', body, C.muscle, [[s * 1, -.1, -1.2, .4, .5], [s * 1.35, -.05, -.2, .45, .72], [s * 1.38, .05, .7, .5, .78], [s * 1.0, -.05, 1.3, .3, .5]]);
    // Stacked basalt flank slabs separated by glowing slag seams.
    for (let i = 0; i < 6; i++) {
      const z = 1.05 - i * .45, w = 1.5 - Math.abs(i - 2) * .06;
      col('body', body, C.armor, [s * w, .42 - i * .02, z], [.38, .5, .27], [0, s * .2, s * 1.1 + .15]);
      col('body', body, C.edge, [s * (w + .2), .12 - i * .02, z + .02], [.2, .32, .2], [0, s * .1, s * 1.2]);
      bone('body', body, C.hot, [s * (w + .05), .75, z - .22], [s * (w + .3), -.3, z - .22], .09, .06, 4);
    }
  }
  // Back: broad plated saddle with glowing cracks between the slabs.
  for (let i = 0; i < 8; i++) {
    const z = 1.2 - i * .38, wx = .95 - Math.abs(i - 3) * .05;
    col('body', body, C.armor, [0, .95 - i * .02, z], [wx, .2 + (i % 2) * .05, .17], [0, .1 * (i % 3 - 1), 0]);
    col('body', body, C.edge, [0, 1.13 - i * .02, z + .02], [wx * .55, .09, .12]);
    bone('body', body, C.hot, [-wx * 1.0, 1.06 - i * .02, z - .19], [wx * 1.0, 1.06 - i * .02, z - .19], .08, .08, 4);
    plate('body', body, C.armor, [0, 1.32 - i * .03, z], [.16, .26, .2]);
  }
  // Left shoulder: modest basalt cap so the right side reads as the broken-off heavy part.
  for (let i = 0; i < 2; i++) col('body', body, C.armor, [1.35 + i * .06, .88 + i * .17, .55 - i * .1], [.55 - i * .1, .24, .5 - i * .08], [0, .3 * i, .25]);

  const chest = joint('chest', body, 0, -.3, 1.2);
  loft('chest', chest, C.hide, [[0, -.05, -.2, .82, .6], [0, .02, .25, .88, .64], [0, 0, .55, .55, .5]]);
  for (const [s] of SIDES) for (let i = 0; i < 4; i++) {
    col('chest', chest, C.armor, [s * .5, -.32 + i * .24, .38], [.3, .14, .17], [Math.PI / 2, 0, s * .25]);
    bone('chest', chest, C.hot, [s * .1, -.34 + i * .24, .58], [s * .78, -.26 + i * .22, .38], .05, .02, 5);
  }
  const core = joint('core', chest, 0, .02, .62);
  plate('chest', core, C.core, [0, 0, 0], [.2, .5, .06]);
  const coreMat = materials.get(`chest/${C.core}/true`);

  // Small slag vent replaces the boiler pipe, keeping the valve anchor.
  const valve = joint('valve', body, 1.05, .75, -.35), pipe = joint('pipe', valve, 0, 0, 0), needle = joint('needle', valve, .1, .2, .05);
  col('valve', pipe, C.armor, [0, .15, 0], [.3, .3, .3]);
  col('valve', pipe, C.edge, [0, .36, 0], [.24, .1, .24]);
  bone('valve', pipe, C.hot, [0, .3, 0], [0, .46, 0], .17, .12, 6);
  plate('valve', pipe, C.core, [.1, .38, .05], [.05, .2, .05]);

  // Flank vents sit on the slag seams.
  const ventAnchors = [];
  for (const [s, suffix] of SIDES) for (let i = 0; i < 4; i++) {
    const x = s * (1.55 + (i % 2) * .1), z = 1.0 - i * .5, y = .3 - (i % 2) * .08;
    ventAnchors.push(joint(`vent${suffix}${i}`, body, x, y, z - .22));
  }
  for (let i = 0; i < 2; i++) ventAnchors.push(joint(`ventBack${i}`, body, 0, 1.1, .6 - i * 1.2));

  // ---- right shoulder: huge stacked asymmetric basalt plates (breakable)
  const shoulder = joint('shoulder', body, -1.3, .8, .4);
  col('shoulder', shoulder, C.armor, [-.1, .1, 0], [.95, .33, .8], [0, .3, -.4]);
  col('shoulder', shoulder, C.edge, [-.2, .08, .1], [.72, .1, .62], [0, .3, -.4]);
  col('shoulder', shoulder, C.armor, [-.28, .46, -.1], [.82, .3, .66], [.08, -.4, -.6]);
  col('shoulder', shoulder, C.hide, [-.4, .78, -.18], [.62, .27, .52], [-.1, .2, -.78]);
  col('shoulder', shoulder, C.armor, [-.55, 1.06, -.3], [.46, .24, .4], [.12, -.6, -.95]);
  col('shoulder', shoulder, C.edge, [-.62, 1.28, -.34], [.26, .13, .24], [0, .1, -1.0]);
  for (const [y, w, r] of [[.28, .86, .3], [.62, .76, .25], [.92, .56, .2]]) bone('shoulder', shoulder, C.hot, [-.05 - w * .35, y, .52 - r], [-.1 + w * .32, y - .02, .52 - r - .08], .1, .07, 4);
  bone('shoulder', shoulder, C.hot, [-.8, .1, -.05], [-.95, .55, -.35], .09, .06, 4);
  horn('shoulder', shoulder, [C.armor, C.edge], [[-.75, .5, 0], [-1.25, .9, .1], [-1.7, 1.55, .12]], .3);
  horn('shoulder', shoulder, C.armor, [[-.2, 1.0, -.4], [-.35, 1.65, -.55], [-.3, 2.15, -.7]], .22);
  plate('shoulder', shoulder, C.armor, [-.9, .3, -.5], [.4, .5, .35], [0, 0, .5]);

  // ---- neck + ram skull
  const neck = joint('neck', body, 0, .2, 1.3);
  loft('body', neck, C.muscle, [[0, .0, -.2, .85, .72], [0, .22, .25, .75, .68], [0, .32, .8, .66, .58], [0, .25, 1.3, .6, .5]]);
  for (let i = 0; i < 4; i++) {
    const z = i * .3;
    if (i % 2 === 0) col('body', neck, C.armor, [0, .8 - i * .06, z], [.6 - i * .05, .2, .15]);
    bone('body', neck, C.hot, [-.4, .7 - i * .06, z - .13], [.4, .7 - i * .06, z - .13], .03, .03, 4);
  }
  const head = joint('head', neck, 0, .3, 1.2);
  loft('head', head, C.muscle, [[0, 0, -.5, .65, .55], [0, .05, 0, .88, .62], [0, -.03, .6, .72, .46], [0, -.1, 1.1, .6, .34], [0, -.16, 1.42, .5, .27]]);
  loft('head', head, C.armor, [[0, .38, -.45, .6, .22], [0, .5, .05, .82, .24], [0, .38, .65, .62, .17], [0, .2, 1.2, .52, .1], [0, .08, 1.45, .44, .07]]);
  col('head', head, C.edge, [0, .5, .3], [.5, .1, .6], [0, 0, 0]);
  col('head', head, C.armor, [0, .1, 1.5], [.55, .32, .1], [Math.PI / 2, 0, 0]); // blunt ram boss
  bone('head', head, C.hot, [-.4, .5, .0], [.4, .5, .0], .04, .04, 4);
  for (const [s] of SIDES) {
    // Crown horns sweep out and curl DOWN past the cheeks.
    horn('head', head, [C.edge, C.armor, C.armor, C.edge], [[s * .6, .38, -.15], [s * 1.15, .55, -.4], [s * 1.6, .25, -.7], [s * 1.62, -.4, -.7], [s * 1.35, -.95, -.45]], .34);
    plate('head', head, C.edge, [s * .66, .42, .5], [.25, .12, .45], [0, s * .15, 0]);
    plate('head', head, C.hot, [s * .6, .3, .74], [.09, .08, .3], [0, s * .2, 0]);
    plate('head', head, C.core, [s * .64, .3, .86], [.045, .05, .13], [0, s * .2, 0]);
    for (let i = 0; i < 5; i++) bone('head', head, C.bone, [s * (.45 - i * .035), -.22, .35 + i * .22], [s * (.43 - i * .03), -.42, .38 + i * .22], .05, .006, 5);
    bone('head', head, C.hot, [s * .62, .05, .6], [s * .5, .0, 1.2], .035, .02, 4); // slag seam along snout
  }
  const jaw = joint('jaw', head, 0, -.28, -.02);
  loft('head', jaw, C.edge, [[0, 0, -.3, .55, .17], [0, -.1, .4, .68, .22], [0, -.16, 1.05, .56, .2], [0, -.12, 1.45, .44, .14]]);
  col('head', jaw, C.bone, [0, -.34, 1.38], [.55, .28, .32], [0.2, 0, 0]); // heavy chin ram
  for (const [s] of SIDES) {
    horn('head', jaw, C.edge, [[s * .45, -.3, 1.4], [s * .55, -.7, 1.55], [s * .52, -.98, 1.5]], .13);
    for (let i = 0; i < 5; i++) bone('head', jaw, C.bone, [s * (.5 - i * .04), .0, .35 + i * .24], [s * (.47 - i * .035), .17, .35 + i * .24], .05, .006, 5);
  }

  // ---- compact armoured wings
  const wings = {}, innerSails = [];
  for (const [s, suffix] of SIDES) {
    const id = 'wing' + suffix, w = joint(id, body, s * .95, .8, .3); wings[id] = w;
    bone(id, w, C.muscle, [0, 0, 0], [s * .95, .55, -.25], .38, .25);
    col(id, w, C.armor, [s * .45, .42, -.1], [.45, .22, .4], [0, 0, -s * .5]);
    const elbow = joint('elbow' + suffix, w, s * .95, .55, -.25);
    bone(id, elbow, C.muscle, [0, 0, 0], [s * 1.2, .08, -.25], .26, .17);
    col(id, elbow, C.armor, [s * .5, .2, -.12], [.34, .15, .28], [0, 0, -s * .3]);
    const wrist = joint('wrist' + suffix, elbow, s * 1.2, .08, -.25);
    horn(id, wrist, [C.edge, C.armor], [[0, 0, 0], [s * .12, .35, .1], [s * .2, .6, .4]], .2);
    plate(id, wrist, C.armor, [0, .05, 0], [.28, .22, .3]);
    const tips = [[s * 1.7, .05, -.9], [s * 1.35, -.2, -2.3], [s * .65, -.32, -3.1], [-s * .55, -.35, -2.8]];
    const base = [-s * 1.2, -.4, -1.4];
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i], knuckle = [tip[0] * .56, tip[1] + .12, tip[2] * .48];
      horn(id, wrist, C.hide, [[0, 0, 0], knuckle, tip], .15 - i * .018);
      col(id, wrist, C.armor, knuckle.map((v, k) => v * (k === 1 ? 1 : .8)), [.17, .11, .22 + i * .02], [0, 0, 0]);
      if (i > 0) {
        const prior = tips[i - 1], notch = [(tip[0] + prior[0]) * .49, (tip[1] + prior[1]) * .5 + .03, (tip[2] + prior[2]) * .44];
        sail(id, wrist, [0, 0, 0], prior, notch, i % 2 ? C.panel : C.membrane);
        sail(id, wrist, [0, 0, 0], notch, tip, i % 2 ? C.membrane : C.panel);
        bone(id, wrist, C.hot, [0, .03, 0], tip.map(v => v * .66), .022, .006, 4);
      }
    }
    sail(id, wrist, [0, 0, 0], tips.at(-1), base, C.membrane);
    const innerGeometry = new THREE.BufferGeometry();
    innerGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(81), 3).setUsage(THREE.DynamicDrawUsage));
    innerGeometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(81), 3).setUsage(THREE.DynamicDrawUsage));
    const innerTint = new THREE.Color(C.membrane), innerColors = new Float32Array(27 * 3);
    for (let i = 0; i < innerColors.length; i += 3) { innerColors[i] = innerTint.r; innerColors[i + 1] = innerTint.g; innerColors[i + 2] = innerTint.b; }
    innerGeometry.setAttribute('color', new THREE.BufferAttribute(innerColors, 3));
    const innerMesh = new THREE.Mesh(innerGeometry, materials.get(`${id}/leather`));
    innerMesh.frustumCulled = false; body.add(innerMesh); partMeshes[id].push(innerMesh);
    innerSails.push({ s, w, elbow, wrist, geometry: innerGeometry, tip: tips.at(-1), points: Array.from({ length: 5 }, () => new THREE.Vector3()), center: new THREE.Vector3(), matrix: new THREE.Matrix4() });

    // ---- short, thick pillar legs with heavy claws
    const fore = joint('foreleg' + suffix, body, s * 1.2, -.1, .85);
    bone('body', fore, C.muscle, [0, 0, 0], [s * .1, -.5, .1], .66, .42);
    col('body', fore, C.armor, [s * .1, -.12, .06], [.58, .5, .5], [0, s * .3, 0]);
    col('body', fore, C.edge, [s * .45, -.15, .15], [.2, .36, .25], [0, 0, s * .15]);
    const ef = joint('elbowFore' + suffix, fore, s * .1, -.5, .1);
    bone('body', ef, C.hide, [0, 0, 0], [-s * .02, -.5, .08], .42, .32);
    col('body', ef, C.armor, [s * .02, -.22, .1], [.4, .36, .38], [0, s * .2, 0]);
    const af = joint('ankleFore' + suffix, ef, -s * .02, -.5, .08);
    const hind = joint('leg' + suffix, body, s * 1.1, -.1, -1.15);
    bone('body', hind, C.muscle, [0, 0, 0], [s * .1, -.45, -.15], .72, .44);
    col('body', hind, C.armor, [s * .1, -.12, -.05], [.62, .45, .56], [0, s * .3, 0]);
    col('body', hind, C.edge, [s * .52, -.12, -.04], [.2, .34, .26], [0, 0, s * .15]);
    const knee = joint('knee' + suffix, hind, s * .1, -.45, -.15);
    bone('body', knee, C.hide, [0, 0, 0], [-s * .02, -.55, .25], .44, .32);
    col('body', knee, C.armor, [s * .02, -.2, -.05], [.38, .3, .36]);
    horn('body', knee, C.armor, [[s * .1, -.05, -.25], [s * .22, .1, -.5], [s * .28, .2, -.76]], .15);
    const ankle = joint('ankle' + suffix, knee, -s * .02, -.55, .25);
    for (const foot of [af, ankle]) {
      loft('body', foot, C.hide, [[0, -.05, -.22, .3, .11], [0, -.06, .15, .5, .11], [0, -.06, .5, .44, .08]]);
      for (let i = -1; i <= 1; i++) horn('body', foot, C.bone, [[i * .3, -.05, .3], [i * .38, -.06, .66], [i * .38, -.13, .95]], .15);
    }
  }

  // ---- tail with oversized crystalline slag club
  const tail = joint('tail', body, 0, -.1, -1.7);
  loft('tail', tail, C.hide, [[0, 0, .25, .9, .72], [0, -.1, -.8, .7, .58], [0, -.15, -1.7, .5, .44]]);
  const tailMid = joint('tailMid', tail, 0, -.15, -1.7);
  loft('tail', tailMid, C.hide, [[0, 0, .1, .5, .44], [0, -.05, -.85, .4, .36], [0, -.08, -1.7, .3, .28]]);
  const tailTip = joint('tailTip', tailMid, 0, -.08, -1.7);
  loft('tail', tailTip, C.hide, [[0, 0, .1, .3, .28], [0, -.02, -.8, .26, .24], [0, -.03, -1.55, .3, .28]]);
  for (const [n, len, width] of [[tail, 1.7, .6], [tailMid, 1.7, .4], [tailTip, 1.5, .28]]) for (let i = 0; i < 4; i++) {
    col('tail', n, C.armor, [0, width * .9, -i * len / 4 - .1], [width * .9, .17, .22]);
    if (n === tail) bone('tail', n, C.hot, [-width * .7, width * .95, -i * len / 4 - .3], [width * .7, width * .95, -i * len / 4 - .3], .028, .028, 4);
    for (const [s] of SIDES) col('tail', n, C.edge, [s * width * .95, 0, -i * len / 4 - .1], [width * .3, width * .35, .2], [0, 0, s * 1.2]);
  }
  const club = joint('club', tailTip, 0, 0, -1.6);
  // Armoured collar, then a cluster of molten crystals growing out of obsidian.
  col('club', club, C.armor, [0, 0, -.2], [.48, .48, .3], [Math.PI / 2, 0, 0]);
  plate('club', club, C.armor, [0, 0, -.9], [.95, .85, .95]);
  plate('club', club, C.edge, [0, .25, -.9], [.75, .6, .75], [.2, .6, 0]);
  const spikes = [[0, 1, -.9, 1.35], [.8, .55, -.7, 1.0], [-.8, .55, -.7, 1.0], [.7, -.6, -1.1, .9], [-.7, -.6, -1.1, .9], [0, .1, -1.9, 1.0], [.5, .8, -1.5, .9], [-.5, .8, -1.5, .9], [0, -.9, -.8, .8]];
  for (const [x, y, z, len] of spikes) {
    const d = new THREE.Vector3(x, y, z + .9).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const e = new THREE.Euler().setFromQuaternion(q);
    plate('club', club, C.hot, [x * .6, y * .6, z * .7 - .2], [.26, len * .85, .26], [e.x, e.y, e.z]);
    plate('club', club, C.armor, [x * .55, y * .55, z * .7 - .2], [.27, len * .5, .27], [e.x, e.y, e.z]);
  }
  plate('club', club, C.core, [0, .1, -.95], [.32, .5, .32]);
  bone('club', club, C.hot, [0, 0, -.1], [0, 0, -.5], .3, .38, 6);
  club.scale.setScalar(1.3);

  for (const b of batches.values()) { const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat); b.parent.add(mesh); partMeshes[b.part].push(mesh); for (const g of b.list) g.dispose(); }
  const seamMats = [...materials].filter(([k]) => k.endsWith(`/${C.hot}/true`)).map(([, m]) => m);
  const coreMats = [...materials].filter(([k]) => k.endsWith(`/${C.core}/true`)).map(([, m]) => m);
  const v = (p, k) => Number.isFinite(p[k]) ? p[k] : 0;
  const contactMatrix = new THREE.Matrix4(), contactPoint = new THREE.Vector3();
  const footBounds = new Map();
  for (const suffix of ['L', 'R']) for (const id of ['ankleFore', 'ankle']) {
    const foot = nodes[id + suffix], box = new THREE.Box3();
    for (const mesh of foot.children) if (mesh.isMesh) { mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox); }
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push([x, y, z]);
    footBounds.set(foot, corners);
  }
  function apply(p = {}) {
    const k = n => v(p, n);
    body.position.y = BODY_Y + k('bodyY'); body.rotation.set(k('bodyPitch') * D, k('bodyYaw') * D, k('bodyRoll') * D);
    neck.rotation.set(k('neck') - .3 + k('neckLift') * D, k('neckYaw') * D, 0);
    head.position.z = 1.2 + k('headReach'); head.rotation.set((k('head') + 10) * D, k('headYaw') * D, 0); jaw.rotation.x = k('jaw') * D;
    tail.rotation.set(k('tailPitch') * D, k('tailYaw') * D, 0); tailMid.rotation.y = k('tailCurl') * D; tailTip.rotation.y = k('tailCurl') * D * .7;
    for (const [s, suffix] of SIDES) {
      const fold = Math.max(0, Math.min(1, k('wingFold'))), w = wings['wing' + suffix];
      w.rotation.set(-.06, -s * (.15 + k('spread') * .12 + fold * .25), s * (10 + k('wing') * .68 + k('wing' + suffix) * .68) * D);
      nodes['elbow' + suffix].rotation.set(0, s * (.12 + fold * .5), s * k('elbow' + suffix) * D * .65);
      nodes['wrist' + suffix].rotation.set(k('wrist' + suffix) * D, s * fold * .38, 0);
      const f = nodes['foreleg' + suffix], ef = nodes['elbowFore' + suffix], af = nodes['ankleFore' + suffix], h = nodes['leg' + suffix], kn = nodes['knee' + suffix], an = nodes['ankle' + suffix];
      f.rotation.set(k('fore' + suffix) * D, 0, s * k('foreSplay' + suffix) * D); ef.rotation.set(k('foreKnee' + suffix) * D, 0, 0); af.rotation.set(k('foreAnkle' + suffix) * D, 0, 0);
      h.rotation.set((k('leg' + suffix) + k('hind' + suffix)) * D, 0, 0); kn.rotation.set(k('knee' + suffix) * D, 0, 0); an.rotation.set(k('ankle' + suffix) * D, 0, 0);
      if (Math.abs(k('bodyRoll')) < 45 && k('bodyY') > -.85) for (const [upper, knee, ankle] of [[f, ef, af], [h, kn, an]]) {
        for (let i = 0; i < 34; i++) {
          body.updateMatrix(); upper.updateMatrix(); knee.updateMatrix(); ankle.updateMatrix();
          contactMatrix.copy(body.matrix).multiply(upper.matrix).multiply(knee.matrix).multiply(ankle.matrix);
          let floor = Infinity;
          for (const point of footBounds.get(ankle)) { contactPoint.fromArray(point).applyMatrix4(contactMatrix); floor = Math.min(floor, contactPoint.y); }
          if (floor >= -.015) break;
          knee.rotation.x -= 5 * D; ankle.rotation.set(-body.rotation.x - upper.rotation.x - knee.rotation.x, 0, -body.rotation.z - upper.rotation.z);
        }
      }
    }
    for (const sl of innerSails) {
      const { s, w, elbow, wrist, points, center, matrix, geometry, tip } = sl;
      w.updateMatrix(); elbow.updateMatrix(); wrist.updateMatrix();
      points[0].set(s * 1.0, .72, .3);
      matrix.copy(w.matrix).multiply(elbow.matrix);
      points[1].set(0, 0, 0).applyMatrix4(matrix);
      matrix.multiply(wrist.matrix);
      points[2].set(0, 0, 0).applyMatrix4(matrix);
      points[3].fromArray(tip).applyMatrix4(matrix);
      points[4].set(s * .95, -.1, -1.5);
      const positions = geometry.attributes.position; let vertex = 0;
      for (const tri of [[0, 1, 4], [1, 2, 4], [2, 3, 4]]) {
        center.copy(points[tri[0]]).add(points[tri[1]]).add(points[tri[2]]).multiplyScalar(1 / 3); center.y += .07;
        for (let j = 0; j < 3; j++) for (const point of [points[tri[j]], points[tri[(j + 1) % 3]], center]) positions.setXYZ(vertex++, point.x, point.y, point.z);
      }
      positions.needsUpdate = true; geometry.computeVertexNormals();
    }
    const g = Math.max(0, Math.min(1, k('boiler')));
    chest.scale.setScalar(1 + g * .06);
    for (const m of seamMats) m.color.lerpColors(HOT_DIM, HOT_BRIGHT, g);
    for (const m of coreMats) m.color.lerpColors(CORE_DIM, CORE_BRIGHT, g);
  }
  apply();
  return { root, nodes, partMeshes, apply, extra: { pipe, needle, shoulder, club, coreMat, ventAnchors, wings, poolVisuals: [] } };
}
