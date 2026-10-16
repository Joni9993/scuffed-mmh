// A squat slag freight train: read the planted shoulder, leave the delayed seams,
// then punish the exhausted head. All danger belongs to deterministic attacks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert } from '../../render/ps1.js';
import { mTrack } from './monster.js';
import { smooth, clamp01, targetBehind } from './common.js';

const R = Math.PI / 180;
const broken = (m, id) => !!m.partById[id]?.broken;
const hasClub = (m) => !broken(m, 'club');
const impact = (m, ctx) => { ctx.fx.shake?.(0.4, 0.3); ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); };

/** Geometry is merged per moving joint / material. No mesh per plate or tooth. */
export function buildFelsengroll() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.position.y = 2.1;
  const nodes = { body }, partMeshes = { body: [], head: [], shoulder: [], club: [], legs: [] };
  const buckets = [];
  const materials = {};
  function joint(id, parent, x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); nodes[id] = g; return g;
  }
  function box(part, parent, color, x, y, z, w, h, d, rx = 0, rz = 0) {
    let bucket = buckets.find((b) => b.parent === parent && b.part === part && b.color === color);
    if (!bucket) { bucket = { parent, part, color, geos: [] }; buckets.push(bucket); }
    const geo = new THREE.BoxGeometry(w, h, d);
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(transform); bucket.geos.push(geo);
  }
  const rock = '#737d85', edge = '#a5aaa0', dark = '#3a454d', slag = '#dca45c';
  box('body', body, rock, 0, 0, 0, 4.4, 2.7, 6.8);
  box('body', body, dark, 0, -0.9, 0.3, 3.6, 0.8, 5.7);
  for (let i = 0; i < 5; i++) {
    box('body', body, edge, 0, 1.45 + (i % 2) * 0.16, 2.3 - i * 1.15, 2.5 - i * 0.17, 0.55, 0.9, -0.14);
    box('body', body, slag, 0.45, 1.76, 2.3 - i * 1.15, 0.12, 0.09, 0.7);
  }
  const shoulder = joint('shoulder', body, 2.2, 0.7, 1.4);
  for (let i = 0; i < 3; i++) box('shoulder', shoulder, edge, i * 0.12, i * 0.46, -i * 0.24, 1.5 + i * 0.2, 0.55, 2.7, 0, -0.22);
  box('body', body, slag, 2.22, 0.35, 1.4, 0.12, 1.25, 1.8); // exposed weak flank under the plates
  for (const sign of [-1, 1]) {
    const wing = joint(sign < 0 ? 'wingL' : 'wingR', body, sign * 1.9, 0.8, -0.5);
    box('body', wing, dark, sign * 1.7, 0, -0.3, 4.4, 0.3, 3.6, 0.12, sign * -0.12);
    for (let i = 0; i < 3; i++) box('body', wing, edge, sign * (0.7 + i * 1.1), 0.2, -0.5 + i * 0.3, 0.25, 0.28, 3.8 - i * 0.7);
    const leg = joint(sign < 0 ? 'legL' : 'legR', body, sign * 1.7, -0.7, -1.6);
    box('legs', leg, rock, 0, -0.5, 0, 1.4, 1.8, 1.7, -0.2);
    box('legs', leg, dark, 0, -1.15, 0.5, 1.5, 0.5, 2.4);
    for (let i = -1; i <= 1; i++) box('legs', leg, edge, i * 0.45, -1.2, 1.7, 0.26, 0.25, 0.8, 0.2);
  }
  const neck = joint('neck', body, 0, 0, 2.5);
  box('body', neck, rock, 0, 0, 0.5, 2.4, 1.9, 2.2);
  const head = joint('head', neck, 0, -0.1, 1.2);
  box('head', head, dark, 0, 0, 0.55, 2.5, 1.5, 2.3);
  box('head', head, rock, 0, -0.1, 1.7, 1.8, 0.95, 1.6, 0.1);
  for (const sign of [-1, 1]) {
    box('head', head, edge, sign * 1.1, 0.7, 0.3, 0.65, 0.7, 1.7, -0.2, sign * 0.3);
    box('head', head, '#ffe6a2', sign * 1.26, 0.2, 0.95, 0.09, 0.25, 0.5);
  }
  const jaw = joint('jaw', head, 0, -0.6, 0.3);
  box('head', jaw, edge, 0, -0.03, 1.0, 1.8, 0.35, 2.4);
  const tail = joint('tail', body, 0, 0, -3.1);
  box('body', tail, rock, 0, 0, -1.4, 1.6, 1.25, 3.4, -0.05);
  const club = joint('club', tail, 0, -0.1, -3.3);
  box('club', club, edge, 0, 0, -0.4, 3.4, 2.0, 2.8, 0.1, 0.12);
  for (let i = -1; i <= 1; i++) box('club', club, slag, i * 0.9, 1.03, -0.4, 0.24, 0.1, 1.9);
  for (const b of buckets) {
    const key = b.part + b.color;
    const mat = materials[key] ??= lambert({ color: b.color });
    const geo = mergeGeometries(b.geos); b.geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geo, mat); b.parent.add(mesh); partMeshes[b.part].push(mesh);
  }
  // Three inexpensive slag discs make the fuses tangible; red marker outlines
  // still show the exact damage footprint. No particles or world effect manager.
  const poolGeo = new THREE.CylinderGeometry(1, 1, 0.06, 8);
  const poolVisuals = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(poolGeo, lambert({ color: '#84613d' }));
    mesh.visible = false; root.add(mesh); return mesh;
  });
  return { root, nodes, partMeshes, extra: { shoulder, club, poolVisuals }, apply(p) {
    body.position.y = 2.1 + p.bodyY;
    body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
    neck.rotation.x = p.neck * 0.3; head.rotation.set(p.head * R, p.headYaw * R, 0);
    jaw.rotation.x = p.jaw * R;
    nodes.legL.rotation.x = p.legL * R; nodes.legR.rotation.x = p.legR * R;
    const wing = Math.abs(p.wing) > 3 ? p.wing * R : p.wing * 0.7;
    nodes.wingL.rotation.z = -0.12 - wing; nodes.wingR.rotation.z = 0.12 + wing;
    tail.rotation.set(p.tailPitch * R, p.tailYaw * R, 0);
  } };
}

const sphere = (t, x, z, radius, dmg, extra = {}) => ({ t0: t, t1: t + 0.12, shape: 'sphere', at: [x, 0.8, z], radius, dmg, knock: 'down', ...extra });
const capsule = (t, x, z, xx, zz, radius, dmg) => ({ t0: t, t1: t + 0.13, shape: 'capsule', from: [x, 0.9, z], to: [xx, 0.9, zz], radius, dmg, knock: 'down' });
function attack(id, { hits, telegraph = 1.15, duration, flashParts = ['head'], pose, ...opts }) {
  return { id: `felsengroll_${id}`, range: [0, 19], weight: 4, cooldown: 6, telegraph, duration,
    flashParts, markerFromHits: true, stam: 9, cue: { color: '#e3a553', tone: 'droehn' },
    events: [{ t: hits[0].t0, call: 'impact', all: true }], calls: { impact },
    hits, pose: mTrack(pose), ...opts };
}
const bite = attack('biss', { range: [0, 8], audit: [5, 7], telegraph: 0.8, duration: 2.3,
  hits: [capsule(0.85, 0, 2.4, 0, 6.4, 1.3, 40)],
  pose: [[0, {}], [0.6, { head: -24, jaw: 35, neck: -0.3 }], [0.8, { head: -24, jaw: 35 }], [0.94, { head: 25, jaw: 2, bodyPitch: 6 }], [1.4, { head: 20 }], [2.3, {}]],
});
const shoulder = attack('schulter', { range: [0, 7], audit: [4, 7], duration: 2.8, flashParts: ['shoulder'],
  hits: [capsule(1.2, 2, 0, 2, 5.5, 1.8, 48)],
  weight: (m) => broken(m, 'shoulder') ? 1 : 5,
  pose: [[0, {}], [0.8, { bodyRoll: -20, bodyY: -0.3, head: -8 }], [1.15, { bodyRoll: -20 }], [1.35, { bodyRoll: 24, bodyPitch: 10 }], [1.8, { bodyY: -0.3, head: 20 }], [2.8, {}]],
});
const quake = attack('beben', { range: [1, 15], audit: [4, 8, 12], duration: 4.5, cooldown: 11,
  hits: [sphere(1.2, 0, 4, 2.5, 44), sphere(1.7, 0, 8, 2.5, 44), sphere(2.2, 0, 12, 2.5, 44)],
  pose: [[0, {}], [0.8, { bodyPitch: -20, head: -25, wing: 0.8 }], [1.15, { bodyPitch: -20, wing: 0.8 }], [1.3, { bodyPitch: 15, bodyY: -0.6, head: 30 }], [2.2, { head: 32, bodyY: -0.5 }], [4.5, {}]],
});
quake.events.push({ t: 1.7, call: 'impact', all: true }, { t: 2.2, call: 'impact', all: true });
// Finale: the fault forks outwards after the central seams. Read the extra
// held shoulder pose; moving inward beats the fork, standing far out does not.
const fault = { ...quake, id: 'felsengroll_bruchlinie', duration: 5.4, weight: 9,
  cond: (m) => m.phase >= 2,
  hits: [...quake.hits, sphere(2.9, -8.5, 8, 2.5, 46), sphere(2.9, 8.5, 8, 2.5, 46)],
  events: [...quake.events, { t: 2.9, call: 'impact', all: true }],
  pose: mTrack([[0, {}], [0.8, { bodyPitch: -20, wing: 0.8, head: -25 }], [1.15, { bodyPitch: -20, wing: 0.8 }],
    [1.3, { bodyPitch: 15, bodyY: -0.5 }], [2.2, { bodyRoll: -16, head: -20 }], [2.75, { bodyRoll: -16, head: -20 }],
    [3, { bodyRoll: 18, bodyY: -0.6, head: 30 }], [4.1, { bodyY: -0.6, head: 30 }], [5.4, {}]]),
};
quake.cond = (m) => m.phase < 2;
// Each glowing seam has its own fuse. The central lane between side pools stays open.
const pools = attack('schlacke', { range: [9, 17], audit: [11, 15], telegraph: 1.3, duration: 6.7, cooldown: 14,
  hits: [sphere(2.0, -6, 9, 2.1, 46, { t1: 3.7 }), sphere(2.0, 6, 9, 2.1, 46, { t1: 3.7 }), sphere(3.0, 0, 14, 2.2, 48, { t1: 4.7 })],
  pose: [[0, {}], [1, { head: -22, jaw: 32, neck: -0.3 }], [1.3, { head: -22, jaw: 32 }], [1.7, { head: 25, jaw: 45, bodyPitch: 8 }], [3, { head: 15, jaw: 12 }], [6.7, {}]],
});
pools.weight = (m) => m.phase >= 1 ? 8 : 2;
pools.events.push({ t: 3, call: 'impact', all: true }, { t: 4.7, call: 'impact', all: true });
const club = attack('keule', { range: [0, 10], audit: [5, 8], duration: 3.9, flashParts: ['club'], cond: hasClub,
  hits: [capsule(1.2, -5.7, 1.5, 4.9, 4.8, 1.4, 44), capsule(2.1, -7.4, 6.3, 7.4, 6.3, 1.25, 48)],
  weight: (m) => targetBehind(m) ? 10 : 4,
  pose: [[0, {}], [0.8, { tailYaw: -85, tailPitch: 20, bodyRoll: -8 }], [1.15, { tailYaw: -85, tailPitch: 20 }], [1.4, { tailYaw: 95, bodyRoll: 12 }], [1.9, { tailYaw: 95, tailPitch: 28 }], [2.2, { tailYaw: -100, tailPitch: -12 }], [2.7, { bodyY: -0.3, head: 20 }], [3.9, {}]],
});
const stump = attack('stummel', { range: [0, 6], audit: [3], telegraph: 0.85, duration: 2.5, cond: (m) => !hasClub(m), flashParts: ['body'],
  hits: [capsule(0.9, -2.6, 0, 2.6, 2, 1.3, 28)],
  pose: [[0, {}], [0.7, { tailYaw: -45, bodyRoll: -10 }], [1, { tailYaw: 55, bodyRoll: 14 }], [2.5, {}]],
});
const rake = attack('scharren', { range: [0, 10], audit: [5, 8], telegraph: 0.9, duration: 2.7, flashParts: ['legs'],
  // Two claws intercept a circling hunter; don't spend an entire turn scratching
  // empty lanes beside a hunter who has planted in the central safe pocket.
  cond: (m) => Math.abs((m.target?.vel?.x ?? 0) * Math.cos(m.rot) - (m.target?.vel?.z ?? 0) * Math.sin(m.rot)) > 0.8,
  hits: [capsule(1.0, -2, 2.5, -2, 7.4, 1.1, 36), capsule(1.3, 2, 2.5, 2, 7.4, 1.1, 36)],
  pose: [[0, {}], [0.8, { legL: -45, legR: -30, bodyPitch: -8 }], [1.1, { legL: 45, head: 20 }], [1.4, { legR: 45, bodyPitch: 10 }], [2.7, {}]],
});
const ram = attack('ramme', { range: [7, 22], audit: [9, 16], duration: 3.4, cooldown: 8, flashParts: ['shoulder', 'head'],
  hits: [capsule(1.2, 0, 1.5, 0, 5, 1.8, 50)],
  prepare(a) { a.travel = Math.min(14, Math.max(3, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 3)); },
  motion(t, a) { const k = smooth(clamp01((t - 1.15) / 0.5)); return { x: a.origin.x + a.dir.x * a.travel * k, z: a.origin.z + a.dir.z * a.travel * k }; },
  // Hit remains active throughout the committed charge, one hit per hunter.
  pose: [[0, {}], [0.8, { bodyPitch: 14, head: -10, wing: -0.2 }], [1.15, { bodyPitch: 14 }], [1.7, { bodyPitch: 22, head: 25 }], [2.2, { bodyY: -0.4, head: 30 }], [3.4, {}]],
});
ram.hits[0].t1 = 1.65;
const meteor = attack('meteor', { range: [0, 18], audit: [8, 16], telegraph: 1.45, duration: 4.8, cooldown: 16, stam: 18,
  weight: (m) => m.phase >= 2 ? 14 : m.phase >= 1 ? 8 : 2, flashParts: ['body', 'shoulder'],
  hits: [sphere(1.9, 0, 0, 4.4, 65)],
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz), k = Math.min(1, 15 / (d || 1));
    a.landing = { x: a.origin.x + dx * k, y: a.origin.y, z: a.origin.z + dz * k };
  },
  motion(t, a) { const k = smooth(clamp01((t - 1.45) / 0.45)); return { x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k, air: Math.sin(Math.PI * clamp01((t - 1.45) / 0.45)) * 4 }; },
  pose: [[0, {}], [1, { bodyY: -0.7, wing: 1, head: -20 }], [1.45, { bodyY: -0.7, wing: 1 }], [1.7, { bodyPitch: 22, wing: 1.5 }], [1.95, { bodyY: -0.85, head: 35, wing: -0.2 }], [3.3, { bodyY: -0.75, head: 32, jaw: 25 }], [4.8, {}]],
});

export const felsengroll = {
  id: 'felsengroll', name: 'Felsengroll', hp: 24000, scale: 1, bodyRadius: 3.2,
  walk: 3.4, run: 6.4, detect: 40, prefer: 4.5, turn: 1.2, apexZones: [3, 2, 1],
  drops: ['felsengroll_panzer', 'felsengroll_schlacke', 'felsengroll_schweif', 'felsengroll_kern'],
  recoverAfter: () => 1.05, stamina: true, flinchDmg: true, chainMax: 2, teachAttack: quake.id,
  glitchSpots: ['shoulder', 'club'],
  parts: [
    { id: 'head', label: 'Schlackeschädel', factor: 1.05, stunPart: true, blunt: true, spheres: [{ node: 'head', offset: [0, 0, 1], r: 1.7 }] },
    { id: 'shoulder', label: 'Schulterplatten', factor: 0.55, breakHp: 1600, spheres: [{ node: 'shoulder', offset: [0, 0.4, 0], r: 1.8 }] },
    { id: 'club', label: 'Schweifkeule', factor: 0.8, breakHp: 1300, spheres: [{ node: 'club', offset: [0, 0, -0.4], r: 1.8 }] },
    { id: 'body', label: 'Schlackeleib', factor: 0.7, spheres: [{ node: 'body', offset: [0, 0, 0], r: 2.7 }] },
    { id: 'legs', label: 'Stampfer', factor: 0.85, spheres: [{ node: 'legL', offset: [0, -0.7, 0], r: 1.1 }, { node: 'legR', offset: [0, -0.7, 0], r: 1.1 }] },
  ].map((p) => ({ elem: { fire: 20, shock: 0, blast: 25 }, ...p })),
  attacks: Object.fromEntries([bite, shoulder, quake, fault, pools, club, stump, rake, ram, meteor].map((a) => [a.id, a])),
  chains: {
    [bite.id]: [{ atk: shoulder.id, w: 3 }, { atk: rake.id, w: 2 }],
    [shoulder.id]: [{ atk: club.id, w: 3 }, { atk: stump.id, w: 3 }],
    [ram.id]: [{ atk: quake.id, w: 4 }, { atk: fault.id, w: 4 }, { atk: null, w: 1 }],
    [pools.id]: [{ atk: meteor.id, w: 3, cond: (m) => m.phase >= 1 }, { atk: quake.id, w: 2 }, { atk: fault.id, w: 3 }],
  },
  phases: [
    { at: 0.65, name: 'Flüssiger Berg', cue: { color: '#e3a553', tone: 'droehn' }, special: pools.id },
    { at: 0.3, name: 'Der letzte Erdrutsch', cue: { color: '#ffe0a0', tone: 'droehn' }, special: fault.id, enter(m) { m.cds[meteor.id] = 0; m.cds[fault.id] = 0; } },
  ],
  build: buildFelsengroll,
  onBreak(m, part) {
    if (part.id === 'shoulder') { part.factor = 1.3; m.extra.shoulder.visible = false; }
    if (part.id === 'club') { m.extra.club.visible = false; m.chainNext = null; }
  },
  hitDmgMul: (m, hit) => broken(m, 'shoulder') && hit === shoulder.hits[0] ? 0.65 : 1,
  onGlitchCounter(m, id) {
    if (id !== meteor.id) return;
    m._interrupt(); m.chainNext = null; m.queued = null; m.stunT = Math.max(m.stunT, 2.5); m.recover = 1.5;
  },
  poseHook(m, p) {
    if (!m.attack && m.phase >= 2) { p.head += 7; p.bodyY -= 0.12; }
    // Retain break visuals when a late guest snapshot updates part state.
    m.extra.shoulder.visible = !broken(m, 'shoulder'); m.extra.club.visible = !broken(m, 'club');
    const tau = m.attack?.id === pools.id ? m.attack.inst.sample(m.attack.t).tau : -1;
    m.extra.poolVisuals.forEach((mesh, i) => {
      const h = pools.hits[i]; mesh.visible = tau >= 1.3 && tau <= h.t1;
      if (!mesh.visible) return;
      const x = h.at[0], z = h.at[2], c = Math.cos(m.rot), s = Math.sin(m.rot);
      const gy = m.ctx.world.heightAt(m.pos.x + c * x + s * z, m.pos.z - s * x + c * z);
      mesh.position.set(x, gy - m.pos.y + 0.05, z); mesh.scale.set(h.radius, 1, h.radius);
      const heat = tau >= h.t0 ? 0.4 : 0.08 + 0.22 * (0.5 + 0.5 * Math.sin((tau - 1.3) * 9));
      mesh.material.emissive.setRGB(heat, heat * 0.45, 0.015);
    });
  },
};
