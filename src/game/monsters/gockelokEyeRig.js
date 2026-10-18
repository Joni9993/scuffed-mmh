import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, basic } from '../../render/ps1.js';

// "Auge des Glitch": Gockelok's true form. Lives inside the rooster rig's scaled
// group (1 unit = def.scale m, floor y=0, facing +z). ~6.5 units (≈14 m) tall:
// a hovering eyeball with broken shell lids, orbiting ring fragments, a root
// trunk and CPU-bent tendrils (one mesh) planted in the floor. Rooster remnants
// (torn comb as a brow, hackle collar, sickle feathers, spur blades) are accents.
// Named anchors carry the rooster's hurtbox nodes in eye form (see gockelokRig.js).
export const EYE_R = 1.6, EYE_Y = 3.85;
const D = Math.PI / 180, TAU = Math.PI * 2, cl = (v, a, b) => v < a ? a : v > b ? b : v;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const sm = (x) => { x = cl(x, 0, 1); return x * x * (3 - 2 * x); };
const T = (geo, { s, r, p } = {}) => { if (s) geo.scale(...s); if (r) { geo.rotateX(r[0] || 0); geo.rotateY(r[1] || 0); geo.rotateZ(r[2] || 0); } if (p) geo.translate(...p); return geo; };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _bn = new THREE.Vector3(), _t = new THREE.Vector3(), _w = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), XA = new THREE.Vector3(1, 0, 0), ZA = new THREE.Vector3(0, 0, 1);
const bez = (P, s, o) => { const u = 1 - s; return o.set(0, 0, 0).addScaledVector(P[0], u * u * u).addScaledVector(P[1], 3 * u * u * s).addScaledVector(P[2], 3 * u * s * s).addScaledVector(P[3], s * s * s); };
const bezT = (P, s, o) => { const u = 1 - s; return o.set(0, 0, 0).addScaledVector(P[0], -3 * u * u).addScaledVector(P[1], 3 * u * u - 6 * u * s).addScaledVector(P[2], 6 * u * s - 3 * s * s).addScaledVector(P[3], 3 * s * s).normalize(); };

// Tendrils: from = attach point in core space, tip = floor point in rig space.
const TD = [
  { id: 'trunk', from: [0, -.8, 0], tip: [0, 0, -.1], r0: .42, r1: .85, kind: 'trunk', rib: 1 },
  { id: 'legL', from: [.85, -.95, .25], tip: [2.8, 0, .7], r0: .3, r1: .12, rib: 1 },
  { id: 'legR', from: [-.85, -.95, .25], tip: [-2.8, 0, .7], r0: .3, r1: .12, rib: 1 },
  { id: 'spurL', from: [.55, -.85, .8], tip: [1.35, .3, 2.7], r0: .24, r1: .1 },
  { id: 'spurR', from: [-.55, -.85, .8], tip: [-1.35, .3, 2.7], r0: .24, r1: .1 },
  { id: 'rearL', from: [.6, -.9, -.6], tip: [2.2, 0, -2.5], r0: .26, r1: .1, rib: 1 },
  { id: 'rearR', from: [-.6, -.9, -.6], tip: [-2.2, 0, -2.5], r0: .26, r1: .1, rib: 1 },
  { id: 'tail', from: [0, -.6, -1.05], tip: [0, .9, -4.1], r0: .32, r1: .14, kind: 'tail', rib: 1 },
];
const SIDES = 5, SEG = 8, quad = [0, 1, 2, 3].map(() => new THREE.Vector3());

export function buildEyeForm(g, partMeshes) {
  const root = new THREE.Group(); root.name = 'Auge des Glitch'; g.add(root);
  // Few draw calls: everything that moves together is one mesh, colors ride in vertex colors.
  const C = new THREE.Color();
  const prep = (v, color) => { const x = v.index ? v.toNonIndexed() : v; if (x !== v) v.dispose(); x.deleteAttribute('uv'); C.set(color); const n = x.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = C.r; c[i * 3 + 1] = C.g; c[i * 3 + 2] = C.b; } x.setAttribute('color', new THREE.BufferAttribute(c, 3)); return x; };
  const mesh = (parent, partId, color, geos, { unlit = false, side, flat = false, tint = '#ffffff' } = {}) => {
    const list = geos.map((v) => Array.isArray(v) ? prep(v[0], v[1]) : prep(v, color));
    const opts = { color: tint, vertexColors: true }; if (side) opts.side = side; if (flat && !unlit) opts.flatShading = true;
    const m = new THREE.Mesh(mergeGeometries(list), (unlit ? basic : lambert)(opts)); list.forEach((v) => v.dispose());
    parent.add(m); if (partId) (partMeshes[partId] ??= []).push(m); return m;
  };
  const anchor = (parent, x = 0, y = 0, z = 0) => { const a = new THREE.Group(); a.position.set(x, y, z); parent.add(a); return a; };
  const DS = THREE.DoubleSide, SHELL = '#3a4656', MAG = '#e04bd8', CYAN = '#6ff1e8';

  // ---- core eyeball (sclera + scanline bands)
  const core = anchor(root, 0, EYE_Y, 0);
  const sclera = mesh(core, 'head', '#d3dcd4', [new THREE.IcosahedronGeometry(EYE_R, 2), [T(new THREE.TorusGeometry(EYE_R * 1.015, .03, 3, 28), { r: [1.2, 0, .3] }), MAG], [T(new THREE.TorusGeometry(EYE_R * 1.015, .03, 3, 28), { r: [1.9, .7, 0] }), MAG]], { flat: true });
  const look = anchor(core);
  const cap = (r, t0, t1, seg = 16) => T(new THREE.SphereGeometry(r, seg, 3, 0, TAU, t0, t1 - t0), { r: [Math.PI / 2, 0, 0] });
  // iris: white vertex colors tinted by material color (cyan idle, hot pink on telegraph)
  const iris = mesh(look, null, '#ffffff', [cap(EYE_R * 1.012, 0, .68), ...[cap(EYE_R * 1.02, .62, .69), cap(EYE_R * 1.02, .3, .36), ...Array.from({ length: 10 }, (_, i) => new THREE.BoxGeometry(.035, .3, .03).translate(0, .52, 0).rotateZ(i * TAU / 10).translate(0, 0, EYE_R))].map((v) => [v, '#1d3c44'])], { unlit: true, tint: '#5ff0e6' });
  const pupil = anchor(look, 0, 0, EYE_R * 1.012 + .04);
  mesh(pupil, 'head', '#04060d', [T(new THREE.CylinderGeometry(.4, .4, .06, 12), { r: [Math.PI / 2, 0, 0] })], { unlit: true });
  const headA = anchor(look, 0, 0, EYE_R + .05);
  const bodyA = anchor(core, 0, -.15, .3);

  // ---- broken shell: upper lid carries the torn comb as a brow (blinks); static lower shell,
  // crown spikes and rooster remnants (hackle collar round the trunk, sickle feathers off the back)
  const lidU = anchor(core);
  const frag = (t0, t1, n, k) => Array.from({ length: n }, (_, i) => new THREE.SphereGeometry(EYE_R * (1.07 + .08 * hash(i * 3 + k)), 4, 3, i * TAU / n + hash(i + k) * .25, TAU / n - .22 - hash(i * 7 + k) * .2, t0, t1 - t0));
  const combGeo = Array.from({ length: 5 }, (_, i) => { const th = .2 + i * .14, h = .55 + (i % 2) * .25 + (i === 2 ? .3 : 0); return [T(new THREE.BoxGeometry(.2, h, .34), { p: [0, h / 2, 0], r: [th, 0, (i - 2) * .12] }).translate(0, EYE_R * 1.05 * Math.cos(th), EYE_R * 1.05 * Math.sin(th)), '#8a2b37']; });
  const lidUm = mesh(lidU, 'comb', SHELL, [...frag(0, .86, 6, 1), ...combGeo], { side: DS, flat: true });
  const shell = mesh(core, 'body', SHELL, [...frag(2.3, Math.PI, 5, 4),
    ...Array.from({ length: 9 }, (_, i) => { const ph = i * TAU / 9 + .3, th = i === 0 ? 0 : .45 + hash(i) * .5, len = i === 0 ? 1.6 : .7 + hash(i * 5) * .9; return [T(new THREE.ConeGeometry(.24, len, 4), { p: [0, EYE_R * .9 + len / 2, 0], r: [th, ph, 0] }), '#43385e']; }),
    ...Array.from({ length: 14 }, (_, i) => [T(new THREE.ConeGeometry(.14, .9, 3), { p: [0, -.45, 0], r: [Math.PI - .5, i * TAU / 14, 0] }).translate(0, -EYE_R * .78, 0), '#9d7440']),
    ...Array.from({ length: 5 }, (_, i) => [T(new THREE.BoxGeometry(.18, 1.8 - Math.abs(i - 2) * .25, .3), { p: [0, .9, 0], r: [-.75 - Math.abs(i - 2) * .1, 0, (i - 2) * .32] }).translate((i - 2) * .2, .5, -EYE_R * .92), '#365d67'])], { side: DS, flat: true });

  // ---- shell blades (part "wing"): broken lid plates hanging from the core sides, cyan edge
  const hinge = {}, wingA = {}, wingMats = [];
  for (const [name, s] of [['wingL', 1], ['wingR', -1]]) {
    const h = anchor(core, s * EYE_R * .82, -.25, -.15); hinge[name] = h;
    wingMats.push(mesh(h, 'wing', '#46707c', [T(new THREE.BoxGeometry(.18, 2.4, 1.1), { p: [0, -1.2, 0] }), T(new THREE.BoxGeometry(.16, 1.7, .8), { p: [0, -.9, 0], r: [0, s * .35, 0] }).translate(s * .22, 0, .55),
      ...Array.from({ length: 4 }, (_, i) => [T(new THREE.ConeGeometry(.13, 1 + i * .15, 3), { r: [Math.PI, 0, s * .15] }).translate(s * .06, -2.45 - i * .08, -.45 + i * .3), '#344a50']),
      [T(new THREE.BoxGeometry(.07, 2.3, .07), { p: [s * .1, -1.15, .57] }), CYAN]], { side: DS, flat: true }).material);
    wingA[name] = anchor(h, s * .15, -1.9, .1);
  }

  // ---- orbiting ring fragments: shell arcs + cyan data arcs share one spin, shards orbit the other way
  const ringJ = anchor(root, 0, EYE_Y, 0), rings = [];
  const arcs = (r, n, skip, size, k, tilt) => Array.from({ length: n }, (_, i) => i).filter((i) => !skip.includes(i)).map((i) => {
    const a = i * TAU / n + hash(i + k) * .1, chord = 2 * r * Math.sin(Math.PI / n) * .88;
    return T(new THREE.BoxGeometry(chord, size[0], size[1]), { r: [0, -(a + Math.PI / 2), 0], p: [Math.cos(a) * r, (hash(i * 9 + k) - .5) * .25, Math.sin(a) * r] }).rotateX(tilt);
  });
  for (const [tilt, geos, speed] of [
    [[.35, 0, .15], [...arcs(2.65, 14, [3, 4, 9], [.24, .16], 1, 0), ...arcs(2.3, 18, [2, 7, 8, 13], [.13, .13], 2, -.8).map((v) => [v, CYAN])], .35],
    [[.1, 0, -.12], Array.from({ length: 12 }, (_, i) => { const a = i * TAU / 12; return T(new THREE.TetrahedronGeometry(.22 + hash(i) * .25), { r: [i, i * .7, 0], p: [Math.cos(a) * 3.25, (hash(i * 4) - .5) * 1.4, Math.sin(a) * 3.25] }); }), -.18],
  ]) {
    const tg = anchor(ringJ); tg.rotation.set(...tilt); const m = mesh(tg, null, rings.length ? '#6a4fa0' : '#4d5d70', geos, { flat: true }); rings.push({ tg, m, tilt, speed });
  }

  // ---- tendrils (+ spur blades) and data ribbons: CPU-bent, one mesh each
  const bladeGeo = prep(T(new THREE.ConeGeometry(.2, 1.4, 4), { r: [Math.PI / 2, 0, 0], p: [0, 0, .5] }), '#efe8c8'), bladeP = bladeGeo.attributes.position.array, BN = bladeGeo.attributes.position.count;
  const tubeV = TD.length * SEG * SIDES * 6, tubeN = tubeV + 2 * BN, ribN = TD.filter((d) => d.rib).length * SEG * 6;
  const dyn = (n) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), 7.5); return geo; };
  const mk = (geo, partId, mat) => { const m = new THREE.Mesh(geo, mat); root.add(m); if (partId) (partMeshes[partId] ??= []).push(m); return m; };
  const tubeGeo = dyn(tubeN), tc = new Float32Array(tubeN * 3);
  for (let i = 0; i < tubeN; i++) { C.set(i < tubeV ? '#3b3160' : '#efe8c8'); tc[i * 3] = C.r; tc[i * 3 + 1] = C.g; tc[i * 3 + 2] = C.b; }
  tubeGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const tube = mk(tubeGeo, 'legs', lambert({ color: '#ffffff', vertexColors: true, flatShading: true }));
  (partMeshes.spur ??= []).push(tube);
  const ribbon = mk(dyn(ribN), null, basic({ color: MAG, side: DS }));
  const ten = TD.map((d) => ({ ...d, from: new THREE.Vector3(...d.from), P: [0, 1, 2, 3].map(() => new THREE.Vector3()), rings: Array.from({ length: SEG + 1 }, () => Array.from({ length: SIDES }, () => new THREE.Vector3())) }));
  const tA = Object.fromEntries(['neck', 'seam', 'legL', 'legR', 'spurL', 'spurR', 'tail'].map((k) => [k, anchor(root)]));
  const seam = mesh(tA.seam, 'seam', '#75f4e8', [T(new THREE.BoxGeometry(.2, .9, .12), { r: [0, 0, .35], p: [0, .25, 0] }), T(new THREE.BoxGeometry(.2, .8, .12), { r: [0, 0, -.4], p: [.05, -.45, 0] }), T(new THREE.BoxGeometry(.6, .1, .12), { p: [-.2, 0, .02] })], { unlit: true });
  const bladeM = new THREE.Matrix4(), bladeQ = new THREE.Quaternion(), bladeS = new THREE.Vector3();

  const irisBase = new THREE.Color('#5ff0e6'), irisHot = new THREE.Color('#ff4f7b'), irisSeam = new THREE.Color('#ff3fd8');
  const jitMats = [lidUm.material, shell.material, sclera.material, ...rings.map((r) => r.m.material), tube.material, ...wingMats];

  function writeTendrils(t, p, spurBroken) {
    const pos = tube.geometry.attributes.position.array, rp = ribbon.geometry.attributes.position.array; let vi = 0, ri = 0;
    const lift = (v) => cl(v * D, -1, 1.2);
    ten.forEach((d, i) => {
      const [P0, P1, P2, P3] = d.P;
      P0.copy(d.from).applyMatrix4(core.matrix);
      P3.set(...TD[i].tip);
      const sway = Math.sin(t * 1.3 + i * 1.7), sway2 = Math.sin(t * 1.7 + i * 2.3);
      if (d.id === 'legL' || d.id === 'legR') { const l = lift(d.id === 'legL' ? p.legL : p.legR); P3.y += Math.max(0, l) * 1.8; P3.z += -l * .8 + .2 * sway2; P3.x *= 1 - Math.max(0, l) * .2; }
      if (d.id === 'spurL' || d.id === 'spurR') { const cock = Math.max(0, -p.neck) * 2 + Math.max(0, -p.bodyPitch) * .04, lunge = Math.max(0, p.neck) * 1.3 + Math.max(0, p.bodyPitch) * .035; P3.y += cock; P3.z += lunge - cock * .4; P3.x += Math.sin(t * 2 + i) * .1; }
      if (d.kind === 'tail') { P3.x += cl(p.tailYaw * .03, -1.5, 1.5) + sway * .5; P3.y += cl(p.tailPitch * .03, -.8, 1.5) + Math.sin(t * 2.1) * .35; }
      P3.y = Math.max(P3.y, d.kind === 'trunk' ? 0 : .12);
      const out = _a.copy(P0).sub(core.position).setY(0); if (out.lengthSq() < 1e-4) out.set(0, 0, 1); out.normalize();
      if (d.kind === 'trunk') { P1.copy(P0).add(_b.set(sway * .1, -.7, p.neck * .4)); P2.copy(P3).add(_b.set(0, .9, 0)); }
      else if (d.kind === 'tail') { P1.copy(P0).add(_b.set(0, -.9, -.7)); P2.set(P3.x * .4 + sway * .3, .05, -3); }
      else { P1.copy(P0).addScaledVector(out, .7).add(_b.set(sway * .12, -.55, 0)); P2.lerpVectors(P0, P3, .72).setY(P3.y + .25 + sway2 * .08); }
      // rings along the curve
      for (let j = 0; j <= SEG; j++) {
        const s = j / SEG; bez(d.P, s, _c); bezT(d.P, s, _t);
        _n.crossVectors(_t, UP); if (_n.lengthSq() < .01) _n.crossVectors(_t, XA); _n.normalize(); _bn.crossVectors(_n, _t);
        const r = (d.r0 + (d.r1 - d.r0) * s) * (1 + .16 * Math.sin(s * 9 - t * 4 + i));
        for (let k = 0; k < SIDES; k++) { const a = k * TAU / SIDES; d.rings[j][k].copy(_c).addScaledVector(_n, Math.cos(a) * r).addScaledVector(_bn, Math.sin(a) * r); }
        if (d.rib && j < SEG) {
          // spiralling flat data ribbon riding on the tendril surface
          for (const [q, jj] of [[0, j], [2, j + 1]]) {
            const ss = jj / SEG; bez(d.P, ss, _c); bezT(d.P, ss, _t);
            _n.crossVectors(_t, UP); if (_n.lengthSq() < .01) _n.crossVectors(_t, XA); _n.normalize(); _bn.crossVectors(_n, _t);
            const ph = jj * .9 + t * 2.2 + i, rr = (d.r0 + (d.r1 - d.r0) * ss) * 1.22;
            _w.copy(_n).multiplyScalar(Math.cos(ph)).addScaledVector(_bn, Math.sin(ph));
            _c.addScaledVector(_w, rr); _w.cross(_t).multiplyScalar(.1 + rr * .12);
            quad[q].copy(_c).add(_w); quad[q + 1].copy(_c).sub(_w);
          }
          for (const v of [quad[0], quad[1], quad[3], quad[0], quad[3], quad[2]]) { rp[ri++] = v.x; rp[ri++] = v.y; rp[ri++] = v.z; }
        }
      }
      for (let j = 0; j < SEG; j++) for (let k = 0; k < SIDES; k++) {
        const k1 = (k + 1) % SIDES, v00 = d.rings[j][k], v01 = d.rings[j][k1], v10 = d.rings[j + 1][k], v11 = d.rings[j + 1][k1];
        for (const v of [v00, v01, v11, v00, v11, v10]) { pos[vi++] = v.x; pos[vi++] = v.y; pos[vi++] = v.z; }
      }
      // anchors for hurtbox nodes
      const at = (key, s, dx = 0, dy = 0, dz = 0) => { bez(d.P, s, tA[key].position); tA[key].position.x += dx; tA[key].position.y += dy; tA[key].position.z += dz; };
      if (d.kind === 'trunk') { at('neck', .5); const s = .62, r = (d.r0 + (d.r1 - d.r0) * s); at('seam', s, 0, 0, r * .95); }
      else if (d.id === 'legL' || d.id === 'legR') at(d.id, .84, 0, .28, 0);
      else if (d.id === 'spurL' || d.id === 'spurR') {
        at(d.id, 1); bezT(d.P, 1, _t); _t.y = Math.max(_t.y, -.1); _t.normalize(); bladeQ.setFromUnitVectors(ZA, _t);
        bladeM.compose(tA[d.id].position, bladeQ, bladeS.set(1, 1, spurBroken ? .35 : 1));
        let o = (tubeV + (d.id === 'spurL' ? 0 : BN)) * 3;
        for (let q = 0; q < BN; q++) { _w.fromArray(bladeP, q * 3).applyMatrix4(bladeM); pos[o++] = _w.x; pos[o++] = _w.y; pos[o++] = _w.z; }
      }
      else if (d.kind === 'tail') at('tail', .72);
    });
    tube.geometry.attributes.position.needsUpdate = true; tube.geometry.computeVertexNormals();
    ribbon.geometry.attributes.position.needsUpdate = true;
  }

  function update(p, extra, st = {}) {
    const t = extra.time ?? 0, atk = extra.attackId ?? null, tau = extra.attackTau ?? 0, phase = extra.phase ?? 0;
    const step = Math.floor(t * 12), gl = hash(step) < .1 + .05 * phase + (atk ? .12 : 0) + (extra.seamOpen ? .2 : 0);
    const jx = gl ? (hash(step + .37) - .5) * .6 : 0, tele = !!atk && tau < .9;
    // hover + crash: bodyY sinks the whole eye (stun opening / slam attacks put the pupil in melee reach)
    const drop = cl(-p.bodyY, 0, .7) * 3.6;
    core.position.set(gl ? jx * .15 : 0, Math.max(EYE_R + .2, EYE_Y + Math.sin(t * 1.1) * .12 - drop), cl(p.bodyPitch * .025, -.4, .6) + p.neck * .3);
    core.rotation.set(cl(p.bodyPitch * D * .7, -.5, .6), Math.sin(t * .5) * .08, p.bodyRoll * D * .6);
    const sacc = Math.floor(t * 2.3);
    look.rotation.set(cl(p.head * D * .8, -.6, .75) + (hash(sacc) - .5) * .1, cl(p.headYaw * D, -.6, .6) + (hash(sacc + 9) - .5) * .16, 0);
    // pupil: heartbeat pulse, slit on telegraph, blown wide on impact, torn when the seam is open
    const beat = Math.pow(Math.max(0, Math.sin(t * 2.4)), 6) * .25, slit = Math.max(tele ? 1 - tau / .9 * .3 : 0, cl(-p.head / 28, 0, 1));
    let px = (1 + beat + cl(p.head / 35, 0, 1) * .35) * (1 - slit * .72), py = (1 + beat) * (1 + slit * .3);
    if (extra.seamOpen) { px *= 1.3 + hash(step + 3) * .5; py *= .8 + hash(step + 5) * .5; }
    pupil.scale.set(px, py, 1);
    iris.material.color.copy(extra.seamOpen && step % 2 ? irisSeam : tele && step % 2 ? irisHot : irisBase);
    look.position.x = atk === 'gockelok_frames' && tau > 1.2 ? (step % 2 ? .12 : -.12) : gl ? jx * .25 : 0; // frame-skip double image
    // lids: blink, flare open in attacks, droop when crashed
    const bt = t % 5.3, blink = bt < .2 ? Math.sin(bt / .2 * Math.PI) : 0, open = cl(p.wing * D, 0, 1) * .3, droop = !atk && p.bodyY < -.3 ? .35 : 0;
    lidU.rotation.set(.05 + blink * .8 - open + droop, 0, 0);
    lidU.position.x = gl && hash(step + 1) < .5 ? jx * .4 : 0; shell.position.x = gl && hash(step + 2) < .5 ? -jx * .3 : 0;
    // shell blades
    for (const [name, s] of [['wingL', 1], ['wingR', -1]]) {
      const broken = name === 'wingL' && st.wingBroken, h = hinge[name];
      h.rotation.set(Math.sin(t * .9 + s) * .06 - Math.max(0, -p.wing) * D * .5 + (broken ? .3 : 0), s * -.2, s * (.35 + cl(p.wing * D * .6, -.45, .9) + Math.sin(t * 1.4 + s) * .04) - (broken ? s * .3 : 0));
    }
    // rings: idle orbit, attack-specific choreography
    let spin = t, ringS = 1 + p.spread * .12, flat = 0, ry = 0;
    if (atk === 'gockelok_frames') spin = Math.floor(t * 6) / 6;
    if (atk === 'gockelok_rollback') spin = t - tau * 3.5;
    if (atk === 'gockelok_raumbruch') { flat = sm(tau / 2) * (1 - sm((tau - 3.6) / .6)); ringS *= 1 + flat * .6; }
    if (atk === 'gockelok_absturz') ringS *= tau < 2 ? 1 - sm(tau / 2) * .55 : tau < 3.4 ? .45 + sm((tau - 2) / .4) * 1.25 : 1.7 - sm((tau - 3.4) / 1.5) * .7;
    if (atk === 'gockelok_fehlerkaskade') ry = -Math.abs(Math.sin(tau * 5)) * .6;
    ringJ.position.copy(core.position); ringJ.scale.setScalar(ringS);
    rings.forEach((r, i) => {
      r.tg.rotation.set(r.tilt[0] * (1 - flat), 0, r.tilt[2] * (1 - flat));
      r.m.rotation.y = spin * r.speed * (1 + phase * .25) + (gl && hash(step + i * 3) < .4 ? .3 : 0);
      r.m.position.set(gl && hash(step + i) < .35 ? jx : 0, i === 1 ? ry : 0, 0);
    });
    for (const m of jitMats) { const u = m.userData?.ps1?.uJit; if (u) u.value = gl ? .05 : 0; }
    seam.visible = !!extra.seamOpen;
    root.updateMatrix(); core.updateMatrix();
    writeTendrils(t, p, !!st.spurBroken);
  }

  return { group: root, update, anchors: { body: bodyA, head: headA, neck: tA.neck, seam: tA.seam, wingL: wingA.wingL, wingR: wingA.wingR, legL: tA.legL, legR: tA.legR, spurL: tA.spurL, spurR: tA.spurR, tail: tA.tail } };
}
