import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';
import { dragonSurface } from '../../render/dragonSurface.js';

/** Tall, slender lightning duelist: the opposite silhouette of Felsengroll (low, wide) and Pyrostur (heavy). */
export const VOLT_SCALE = 1.65;
const D = Math.PI / 180;
const SIDES = [[1, 'L'], [-1, 'R']];
// Dark graphite hide, cyan conductive veins, yellow-white eyes, cyan->white prism glass.
const C = { hide: '#2e3a5c', muscle: '#40527f', armor: '#131a2c', edge: '#5b86c4', bone: '#c4d8e4', membrane: '#1b2c3c', panel: '#223a4e',
  hot: '#27d3ee', core: '#e8ffff', eye: '#ffe36a' };
const HOT_DIM = new THREE.Color('#0d6a84'), HOT_BRIGHT = new THREE.Color('#52f2ff');
const CORE_DIM = new THREE.Color('#6fd0e4'), CORE_BRIGHT = new THREE.Color('#ffffff');
const GLOW = new Set([C.hot, C.core, C.eye]);
const PR_DEEP = new THREE.Color('#0b86a6'), PR_MID = new THREE.Color('#5fe2f2'), PR_WHITE = new THREE.Color('#f4ffff');
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export function buildVoltiris() {
  const root = new THREE.Group(), scale = new THREE.Group(); root.add(scale); scale.scale.setScalar(VOLT_SCALE);
  const nodes = {}, batches = new Map(), materials = new Map(), prisms = new Map();
  const partMeshes = Object.fromEntries(['body', 'chest', 'head', 'antenna', 'valve', 'wingL', 'wingR', 'wing', 'legs', 'tail'].map(k => [k, []]));
  function joint(id, parent, x, y, z) { const n = new THREE.Group(); n.position.set(x, y, z); parent.add(n); nodes[id] = n; return n; }
  function geo(part, parent, color, g, pos = [0, 0, 0], stretch = [1, 1, 1], rot = [0, 0, 0]) {
    const glow = GLOW.has(color);
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
    if (!batches.has(key)) batches.set(key, { parent, part, mat: materials.get(mk), glow, surface, list: [] });
    batches.get(key).list.push(g2);
  }
  function loft(part, n, color, rings, sides = 7, fat = 1.32) {
    const v = [];
    const p = (r, i) => { const a = (i % sides) / sides * Math.PI * 2; return [r[0] + Math.sin(a) * r[3] * fat, r[1] + Math.cos(a) * r[4] * fat, r[2]]; };
    for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < sides; i++) v.push(...p(rings[k], i), ...p(rings[k + 1], i), ...p(rings[k], i + 1), ...p(rings[k], i + 1), ...p(rings[k + 1], i), ...p(rings[k + 1], i + 1));
    for (const [idx, reverse] of [[0, false], [rings.length - 1, true]]) for (let i = 1; i < sides - 1; i++) v.push(...p(rings[idx], 0), ...p(rings[idx], reverse ? i + 1 : i), ...p(rings[idx], reverse ? i : i + 1));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); geo(part, n, color, g);
  }
  function bone(part, n, color, a, b, r0, r1 = .01, sides = 5) {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), delta = vb.clone().sub(va);
    if (r0 > .05) { r0 *= 1.28; r1 *= r1 > .05 ? 1.28 : 1; } const g = new THREE.CylinderGeometry(r1, r0, delta.length(), sides); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
    geo(part, n, color, g, va.add(vb).multiplyScalar(.5).toArray());
  }
  const plate = (part, n, color, pos, size, rot = [0, 0, 0]) => geo(part, n, color, new THREE.OctahedronGeometry(1), pos, size, rot);
  function horn(part, n, color, points, radius, sides = 5) { for (let i = 0; i < points.length - 1; i++) bone(part, n, Array.isArray(color) ? color[Math.min(i, color.length - 1)] : color, points[i], points[i + 1], radius * (1 - i / (points.length - 1)), i === points.length - 2 ? .006 : radius * (1 - (i + 1) / (points.length - 1)), sides); }
  // Lightning-bolt polyline of glowing vein segments.
  function zig(part, n, color, a, b, amp, steps, r, axis = 0) {
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, p = a.map((v, k) => v + (b[k] - v) * t);
      if (i < steps) p[axis] += (i % 2 ? 1 : -1) * amp;
      bone(part, n, color, prev, p, r, r * .8, 4); prev = p;
    }
  }
  // Faceted translucent prism triangle: split in four, glints jitter per facet, colour ramps cyan -> white by radius.
  let seed = 1;
  function prismTri(part, parent, a, b, c, R, wire = false) {
    const mid = (p, q, up) => p.map((v, k) => (v + q[k]) / 2 + (k === 1 ? up : 0));
    const ab = mid(a, b, (hash(seed++) - .5) * .12), bc = mid(b, c, (hash(seed++) - .5) * .12), ca = mid(c, a, (hash(seed++) - .5) * .12);
    if (!prisms.has(parent.uuid)) prisms.set(parent.uuid, { parent, part, wire, pos: [], col: [] });
    const rec = prisms.get(parent.uuid), tmp = new THREE.Color();
    for (const tri of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) {
      const j = .62 + hash(seed++) * .6;
      for (const p of tri) {
        const t = Math.min(1, Math.hypot(...p) / R);
        if (t < .5) tmp.lerpColors(PR_DEEP, PR_MID, t * 2); else tmp.lerpColors(PR_MID, PR_WHITE, (t - .5) * 2);
        tmp.multiplyScalar(j); rec.pos.push(...p); rec.col.push(tmp.r, tmp.g, tmp.b);
      }
    }
  }

  // Calibrated at the end so the lowest toe rests on the floor.
  const body = joint('body', scale, 0, 3, 0);
  // ---- slender torso, keel chest, glowing core
  loft('body', body, C.hide, [[0, -.05, -1.35, .17, .22], [0, 0, -.75, .3, .36], [0, .05, -.1, .37, .43], [0, .1, .5, .38, .46], [0, .08, 1.0, .26, .34]]);
  loft('body', body, C.muscle, [[0, .0, -.5, .31, .26], [0, .06, .15, .39, .33], [0, .08, .75, .33, .3]], 6);
  for (const [s] of SIDES) {
    for (let i = 0; i < 5; i++) {
      const z = .75 - i * .36;
      plate('body', body, C.armor, [s * (.34 - i * .02), .36 - i * .02, z], [.12, .22, .26], [0, s * .2, -s * .5]);
      plate('body', body, C.edge, [s * (.43 - i * .02), .2 - i * .02, z], [.05, .15, .22], [0, 0, -s * .5]);
    }
    zig('body', body, C.hot, [s * .42, .38, .85], [s * .46, -.28, -.7], .07, 7, .02);
    zig('body', body, C.hot, [s * .31, .45, .6], [s * .33, .1, -.9], .06, 6, .014);
  }
  for (let i = 0; i < 6; i++) { const z = .85 - i * .42; horn('body', body, C.armor, [[0, .45 - i * .012, z], [0, .75 + (i % 2) * .16 - i * .02, z - .22], [0, .93 + (i % 2) * .2 - i * .03, z - .5]], .1); }
  bone('body', body, C.hot, [0, .5, .9], [0, .5, -1.0], .02, .02, 4);
  const chest = joint('chest', body, 0, -.14, .82);
  loft('chest', chest, C.hide, [[0, -.02, -.12, .33, .42], [0, 0, .22, .35, .48], [0, -.1, .52, .17, .3]], 6);
  for (const [s] of SIDES) for (let i = 0; i < 3; i++) {
    plate('chest', chest, C.armor, [s * .26, -.22 + i * .2, .26], [.1, .13, .2], [0, -s * .3, s * .3]);
    bone('chest', chest, C.hot, [s * .06, -.2 + i * .2, .5], [s * .3, -.14 + i * .17, .38], .018, .01, 4);
  }
  const core = joint('core', chest, 0, 0, .52); plate('chest', core, C.core, [0, 0, 0], [.07, .3, .05]); plate('chest', core, C.core, [0, 0, 0], [.2, .07, .045]);
  const coreMat = materials.get(`chest/${C.core}/true`);
  // Dorsal capacitor shard stands in for the breakable valve.
  const valve = joint('valve', body, -.4, .32, .05), pipe = joint('pipe', valve, 0, 0, 0), needle = joint('needle', valve, .05, .2, .04);
  horn('valve', pipe, C.armor, [[0, 0, 0], [-.1, .35, -.1], [-.14, .6, -.2]], .1); bone('valve', pipe, C.hot, [-.08, .3, -.09], [-.13, .55, -.18], .045, .02, 4);
  plate('valve', needle, C.core, [0, .1, 0], [.025, .13, .025]);
  const ventAnchors = [];
  for (let i = 0; i < 4; i++) ventAnchors.push(joint(`ventBack${i}`, body, 0, .6 + (i % 2) * .15, .8 - i * .55));
  for (const [s, suffix] of SIDES) { for (let i = 0; i < 3; i++) ventAnchors.push(joint(`vent${suffix}${i}`, body, s * (.46 - i * .03), .15 + (i === 0 ? .3 : 0), .55 - i * .6)); }

  // ---- long thin neck, blade skull, antenna crown
  const neck = joint('neck', body, 0, .22, .98);
  loft('body', neck, C.muscle, [[0, -.02, -.12, .23, .26], [0, .5, .08, .16, .2], [0, 1.05, .32, .12, .15], [0, 1.55, .78, .11, .13]], 6);
  for (let i = 0; i < 5; i++) {
    const t = i / 4, y = 0.15 + t * 1.4, z = .0 + t * .72 + t * t * .1;
    plate('body', neck, C.armor, [0, y + .12, z - .03], [.07, .12, .17], [-.3 + t * .1, 0, 0]);
    for (const [s] of SIDES) plate('body', neck, C.edge, [s * (.17 - t * .05), y, z + .02], [.04, .15, .12], [0, 0, -s * .4]);
  }
  zig('body', neck, C.hot, [0, .0, .14], [0, 1.5, .96], .04, 8, .014, 0);
  const head = joint('head', neck, 0, 1.58, .78);
  loft('head', head, C.muscle, [[0, 0, -.36, .2, .21], [0, .02, -.02, .27, .24], [0, -.02, .42, .18, .15], [0, -.09, .95, .09, .08], [0, -.12, 1.28, .04, .05]]);
  loft('head', head, C.armor, [[0, .16, -.3, .17, .09], [0, .21, .08, .21, .09], [0, .08, .62, .1, .05], [0, -.03, 1.22, .035, .03]], 6);
  for (const [s] of SIDES) {
    // Swept cheek blades and a swept back skull blade frame the narrow face.
    horn('head', head, [C.edge, C.armor], [[s * .2, .08, -.15], [s * .42, .1, -.55], [s * .6, .06, -1.0]], .1);
    horn('head', head, C.armor, [[s * .15, .17, -.28], [s * .2, .38, -.78], [s * .14, .5, -1.25]], .06);
    plate('head', head, C.eye, [s * .205, .075, .32], [.025, .045, .2], [0, s * .1, 0]);
    plate('head', head, C.eye, [s * .12, .1, .5], [.03, .028, .09], [0, -s * .3, 0]);
    plate('head', head, C.armor, [s * .22, .02, .1], [.06, .12, .32], [0, s * .1, 0]);
    for (let i = 0; i < 4; i++) bone('head', head, C.bone, [s * (.15 - i * .02), -.12, .35 + i * .15], [s * (.14 - i * .02), -.24, .37 + i * .15], .025, .004, 4);
    bone('head', head, C.hot, [s * .1, .22, -.05], [s * .06, .05, .75], .016, .01, 4);
  }
  const jaw = joint('jaw', head, 0, -.17, -.02);
  loft('head', jaw, C.armor, [[0, 0, -.12, .15, .06], [0, -.04, .35, .15, .06], [0, -.07, .85, .07, .035], [0, -.06, 1.15, .03, .025]], 5);
  for (const [s] of SIDES) for (let i = 0; i < 3; i++) bone('head', jaw, C.bone, [s * (.11 - i * .015), 0, .3 + i * .2], [s * (.1 - i * .015), .1, .31 + i * .2], .02, .004, 4);
  // Antenna crown: five thin masts of different height, forked crossbars and glowing tips.
  const antenna = joint('antenna', head, 0, .2, -.3);
  const masts = [[0, 1.55, -.45, 0], [.2, 1.25, -.38, .38], [-.2, 1.25, -.38, -.38], [.36, .8, -.28, .75], [-.36, .8, -.28, -.75]];
  for (const [x, h, z, lean] of masts) {
    horn('antenna', antenna, C.edge, [[x * .3, 0, 0], [x * .75, h * .5, z * .45], [x + Math.sin(lean) * .15, h, z]], .07, 4);
    plate('antenna', antenna, C.core, [x + Math.sin(lean) * .15, h + .1, z], [.06, .16, .06]);
    bone('antenna', antenna, C.hot, [x * .65, h * .36, z * .3], [x * .9, h * .7, z * .7], .014, .01, 3);
    bone('antenna', antenna, C.edge, [x * .85, h * .62, z * .62], [x * .85 + (lean >= 0 ? .16 : -.16), h * .72, z * .62 - .07], .014, .006, 3);
  }

  // ---- asymmetric prism wings (left larger)
  const wings = {}, wingBase = { L: 58, R: 48 };
  for (const [s, suffix] of SIDES) {
    const id = 'wing' + suffix, k = s > 0 ? 1.2 : .84, w = joint(id, body, s * .36, .58, .45); wings[id] = w;
    const E = [s * 1.0 * k, .3, -.1];
    bone(id, w, C.muscle, [0, 0, 0], E, .15, .09);
    plate(id, w, C.armor, [s * .25, .12, -.02], [.24, .14, .24], [0, 0, -s * .35]);
    const elbow = joint('elbow' + suffix, w, ...E);
    const Wr = [s * 1.2 * k, .12, -.25];
    bone(id, elbow, C.muscle, [0, 0, 0], Wr, .09, .06);
    const wrist = joint('wrist' + suffix, elbow, ...Wr);
    const T = [[1.55, .55, -.25], [1.95, .25, -1.4], [1.65, -.05, -2.65], [.95, -.28, -3.5], [-.1, -.38, -3.75]].map(p => [s * p[0] * k, p[1] * (s > 0 ? 1 : .8), p[2] * k]);
    const tips = s > 0 ? T : [T[0], T[1], T[3], T[4]];
    const R = 3.8 * k;
    const notch = (a, b) => [(a[0] + b[0]) * .39, (a[1] + b[1]) * .5 - .04, (a[2] + b[2]) * .39];
    bone(id, wrist, C.edge, [0, 0, 0], tips[0], .06, .02);
    prismTri(id, wrist, [0, 0, 0], tips[0], Wr.map(v => -v), R, true);
    for (let i = 0; i < tips.length; i++) {
      bone(id, wrist, C.armor, [0, 0, 0], tips[i], .055, .008);
      bone(id, wrist, C.hot, [0, .03, 0], tips[i].map(v => v * .82), .014, .006, 4);
      if (i < tips.length - 1) {
        const n = notch(tips[i], tips[i + 1]);
        prismTri(id, wrist, [0, 0, 0], tips[i], n, R, true); prismTri(id, wrist, [0, 0, 0], n, tips[i + 1], R, true);
        // Glitch sliver: a displaced, sheared copy of the panel edge.
        const o = [s * .22, .26 + i * .04, .14 * (i % 2 ? -1 : 1)];
        const a = tips[i].map((v, q) => v * .45 + o[q]), b = tips[i].map((v, q) => v * .92 + o[q]);
        prismTri(id, wrist, a, b, [b[0] + s * .05, b[1] + .03, b[2] - .38 * k], R);
      }
    }
    // Trailing membrane panel from the last spar back to the flank.
    const base = [-s * .5 * k, -.3, -2.4 * k];
    prismTri(id, wrist, [0, 0, 0], tips.at(-1), base, R, true);
    // Inner shoulder panel is carried by the upper arm.
    prismTri(id, w, [0, 0, 0], E, [s * .45 * k, -.28, -1.5 * k], R, false);
  }

  // ---- long thin digitigrade legs
  const foot = (n, s) => {
    loft('legs', n, C.hide, [[0, -.04, -.1, .085, .055], [0, -.045, .14, .17, .055], [0, -.045, .55, .1, .04]], 5, 1.2);
    for (let i = -1; i <= 1; i++) horn('legs', n, C.bone, [[i * .1, -.04, .4], [i * .12, -.05, .75], [i * .12, -.1, 1.0]], .05, 4);
  };
  for (const [s, suffix] of SIDES) {
    const fore = joint('foreleg' + suffix, body, s * .3, -.05, .7);
    bone('legs', fore, C.muscle, [0, 0, 0], [s * .03, -1.0, .16], .17, .1);
    plate('legs', fore, C.armor, [s * .08, -.22, .06], [.1, .32, .2], [0, 0, -s * .15]);
    zig('legs', fore, C.hot, [s * .15, -.05, .12], [s * .13, -.9, .22], .03, 5, .012);
    const ef = joint('elbowFore' + suffix, fore, s * .03, -1.0, .16);
    bone('legs', ef, C.hide, [0, 0, 0], [-s * .02, -1.2, -.12], .1, .06);
    horn('legs', ef, C.armor, [[0, -.02, -.05], [s * .03, .1, -.28], [s * .04, .2, -.52]], .06, 4);
    plate('legs', ef, C.edge, [0, -.4, -.04], [.04, .3, .08]);
    const af = joint('ankleFore' + suffix, ef, -s * .02, -1.2, -.12); foot(af, s);
    const hind = joint('leg' + suffix, body, s * .3, -.15, -.95);
    bone('legs', hind, C.muscle, [0, 0, 0], [s * .05, -1.0, -.35], .23, .12);
    plate('legs', hind, C.armor, [s * .1, -.22, -.1], [.12, .36, .26], [0, 0, -s * .15]);
    plate('legs', hind, C.edge, [s * .2, -.2, -.1], [.04, .28, .2]);
    zig('legs', hind, C.hot, [s * .2, -.05, -.05], [s * .12, -.9, -.32], .035, 5, .013);
    const knee = joint('knee' + suffix, hind, s * .05, -1.0, -.35);
    bone('legs', knee, C.hide, [0, 0, 0], [-s * .03, -1.1, .5], .12, .065);
    horn('legs', knee, C.armor, [[0, 0, -.06], [s * .02, .05, -.34], [s * .03, .14, -.6]], .08, 4);
    const ankle = joint('ankle' + suffix, knee, -s * .03, -1.1, .5); foot(ankle, s);
  }

  // ---- long whip tail ending in a forked prism blade
  const tail = joint('tail', body, 0, -.05, -1.25);
  loft('tail', tail, C.hide, [[0, 0, .15, .2, .22], [0, -.05, -.75, .15, .17], [0, -.1, -1.6, .1, .11]], 6, 1.15);
  const tailMid = joint('tailMid', tail, 0, -.1, -1.6);
  loft('tail', tailMid, C.hide, [[0, 0, .1, .1, .11], [0, -.03, -.9, .08, .085], [0, -.05, -1.75, .06, .065]], 5, 1.25);
  const tailTip = joint('tailTip', tailMid, 0, -.05, -1.75);
  loft('tail', tailTip, C.hide, [[0, 0, .1, .06, .065], [0, -.01, -.9, .045, .05], [0, 0, -1.7, .03, .03]], 5, 1.25);
  for (const [n, len, wd] of [[tail, 1.6, .2], [tailMid, 1.75, .09]]) for (let i = 0; i < 4; i++) {
    plate('tail', n, C.armor, [0, wd * .95, -i * len / 4 - .1], [wd * .5, .08 + wd * .1, .2]);
    if (n === tail) bone('tail', n, C.hot, [-wd * .5, wd * .6, -i * len / 4 - .15], [wd * .5, wd * .6, -i * len / 4 - .3], .016, .012, 4);
  }
  bone('tail', tailTip, C.edge, [0, 0, -.2], [0, .03, -1.9], .03, .006, 4);
  for (const [s, len] of [[1, 1.0], [-1, .75]]) {
    const o = [0, 0, -1.7], p = (x, y, z) => [o[0] + s * x * len, o[1] + y, o[2] - z * len];
    const a = p(.0, 0, 0), b = p(.28, .12, .45), c = p(.62, .25, 1.2), d = p(.06, -.06, .75);
    horn('tail', tailTip, C.armor, [a, b, c], .045, 4);
    prismTri('tail', tailTip, a, b, d, 1.6, false); prismTri('tail', tailTip, b, c, d, 1.6, false);
    plate('tail', tailTip, C.core, c.map((v, q) => q === 2 ? v + .05 : v), [.03, .05, .06]);
  }

  // ---- bake batches
  for (const b of batches.values()) {
    const mesh = new THREE.Mesh(mergeGeometries(b.list), b.mat); mesh.userData.glow = b.glow; mesh.userData.surface = b.surface; b.parent.add(mesh);
    partMeshes[b.part].push(mesh); if (b.part.startsWith('wing')) partMeshes.wing.push(mesh);
    for (const g of b.list) g.dispose();
  }
  const prismMat = basic({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: .8, depthWrite: false });
  prismMat.userData.ps1.uSnapDetail.value = 2;
  const wireMat = basic({ color: '#bffaff', wireframe: true, transparent: true, opacity: .4, depthWrite: false });
  for (const r of prisms.values()) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(r.col, 3)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, prismMat); mesh.userData.prism = true; r.parent.add(mesh); partMeshes[r.part].push(mesh); if (r.part.startsWith('wing')) partMeshes.wing.push(mesh);
    if (r.wire) { const wm = new THREE.Mesh(g, wireMat); wm.userData.glow = true; r.parent.add(wm); partMeshes[r.part].push(wm); if (r.part.startsWith('wing')) partMeshes.wing.push(wm); }
  }
  const seamMats = [...materials].filter(([k]) => k.endsWith(`/${C.hot}/true`)).map(([, m]) => m);
  const coreMats = [...materials].filter(([k]) => k.endsWith(`/${C.core}/true`)).map(([, m]) => m);

  const v = (p, k) => Number.isFinite(p[k]) ? p[k] : 0;
  const contactMatrix = new THREE.Matrix4(), contactPoint = new THREE.Vector3();
  const footBounds = new Map();
  for (const suffix of ['L', 'R']) for (const id of ['ankleFore', 'ankle']) {
    const f = nodes[id + suffix], box = new THREE.Box3();
    for (const mesh of f.children) if (mesh.isMesh) { mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox); }
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push([x, y, z]);
    footBounds.set(f, corners);
  }
  const chainFloor = (upper, knee, ankle) => {
    body.updateMatrix(); upper.updateMatrix(); knee.updateMatrix(); ankle.updateMatrix();
    contactMatrix.copy(body.matrix).multiply(upper.matrix).multiply(knee.matrix).multiply(ankle.matrix);
    let floor = Infinity;
    for (const point of footBounds.get(ankle)) { contactPoint.fromArray(point).applyMatrix4(contactMatrix); floor = Math.min(floor, contactPoint.y); }
    return floor;
  };
  const legChains = () => SIDES.flatMap(([, s]) => [[nodes['foreleg' + s], nodes['elbowFore' + s], nodes['ankleFore' + s]], [nodes['leg' + s], nodes['knee' + s], nodes['ankle' + s]]]);
  // Ground calibration: all joints at rest, body Y chosen so the lowest toe sits a hair above the floor.
  body.position.y = 3; body.rotation.set(0, 0, 0);
  let lowest = Infinity; for (const [u, kn, an] of legChains()) lowest = Math.min(lowest, chainFloor(u, kn, an));
  const BODY_Y = 3 - lowest + .005;

  function apply(p = {}) {
    const k = n => v(p, n);
    body.position.y = BODY_Y + k('bodyY'); body.rotation.set(k('bodyPitch') * D, k('bodyYaw') * D, k('bodyRoll') * D);
    neck.rotation.set(k('neck') + k('neckLift') * D, k('neckYaw') * D, 0);
    head.position.z = .78 + k('headReach'); head.rotation.set(k('head') * D, k('headYaw') * D, 0); jaw.rotation.x = k('jaw') * D;
    tail.rotation.set(k('tailPitch') * D, k('tailYaw') * D, 0); tailMid.rotation.y = k('tailCurl') * D; tailTip.rotation.y = k('tailCurl') * D * .7;
    for (const [s, suffix] of SIDES) {
      const fold = Math.max(0, Math.min(1, k('wingFold'))), w = wings['wing' + suffix];
      w.rotation.set(-.06, -s * (.15 + k('spread') * .12 + fold * .25), s * (wingBase[suffix] + k('wing') * .68 + k('wing' + suffix) * .68) * D);
      nodes['elbow' + suffix].rotation.set(0, s * (.12 + fold * .5), s * k('elbow' + suffix) * D * .65);
      nodes['wrist' + suffix].rotation.set(k('wrist' + suffix) * D, s * fold * .38, 0);
      const f = nodes['foreleg' + suffix], ef = nodes['elbowFore' + suffix], af = nodes['ankleFore' + suffix], h = nodes['leg' + suffix], kn = nodes['knee' + suffix], an = nodes['ankle' + suffix];
      f.rotation.set(k('fore' + suffix) * D, 0, s * k('foreSplay' + suffix) * D); ef.rotation.set(k('foreKnee' + suffix) * D, 0, 0); af.rotation.set(k('foreAnkle' + suffix) * D, 0, 0);
      h.rotation.set((k('leg' + suffix) + k('hind' + suffix)) * D, 0, 0); kn.rotation.set(k('knee' + suffix) * D, 0, 0); an.rotation.set(k('ankle' + suffix) * D, 0, 0);
      // Deterministic hock folding if a pose would push a toe through the floor.
      if (Math.abs(k('bodyRoll')) < 45 && k('bodyY') > -1.4) for (const [upper, knee, ankle] of [[f, ef, af], [h, kn, an]]) {
        for (let i = 0; i < 34; i++) {
          if (chainFloor(upper, knee, ankle) >= -.015) break;
          knee.rotation.x -= 5 * D; ankle.rotation.set(-body.rotation.x - upper.rotation.x - knee.rotation.x, 0, -body.rotation.z - upper.rotation.z);
        }
      }
    }
    const g = Math.max(0, Math.min(1, k('boiler')));
    chest.scale.setScalar(1 + g * .06);
    for (const m of seamMats) m.color.lerpColors(HOT_DIM, HOT_BRIGHT, g);
    for (const m of coreMats) m.color.lerpColors(CORE_DIM, CORE_BRIGHT, g);
  }
  apply();

  // ---- echo: wireframe, eyeless silhouette copies assembled from the rest-pose hide and prism meshes (<= 6 meshes).
  root.updateMatrixWorld(true);
  const echoParts = { core: [], legs: [], wingL: [], wingR: [], tail: [], antenna: [] };
  const part2echo = (part) => part === 'wingL' || part === 'wingR' || part === 'antenna' || part === 'legs' || part === 'tail' ? part : 'core';
  for (const [part, list] of Object.entries(partMeshes)) {
    if (part === 'wing') continue;
    for (const mesh of list) {
      if (mesh.userData.glow || mesh.material === wireMat) continue;
      if (part === 'valve' || (mesh.userData.surface === 'plain' && part !== 'antenna' && !String(part).startsWith('wing') && part !== 'tail')) continue;
      const g = mesh.geometry.clone(); g.applyMatrix4(mesh.matrixWorld);
      const out = new THREE.BufferGeometry(); out.setAttribute('position', g.attributes.position); echoParts[part2echo(part)].push(out);
    }
  }
  const echoGeos = Object.entries(echoParts).filter(([, l]) => l.length).map(([name, l]) => [name, mergeGeometries(l)]);
  let echoTris = 0; for (const [, g] of echoGeos) echoTris += g.attributes.position.count / 3;
  function makeEcho() {
    const grp = new THREE.Group(), m = basic({ color: '#8fe8ff', wireframe: true, transparent: true, opacity: .2, depthWrite: false });
    for (const [name, g] of echoGeos) { const mesh = new THREE.Mesh(g, m); mesh.name = 'echo-' + name; mesh.frustumCulled = false; grp.add(mesh); }
    grp.userData.tris = echoTris; return grp;
  }
  return { root, nodes, partMeshes, apply, extra: { pipe, needle, antenna, coreMat, ventAnchors, wings, makeEcho, echoGeometry: makeEcho, wingL: wings.wingL, wingR: wings.wingR } };
}
