import * as THREE from 'three';
import { lambert, basic } from '../../render/ps1.js';
import { tex, registerTexture } from '../../render/textures.js';
import { mTrack } from './monster.js';
import { smooth, clamp01, tailSweep, targetBehind } from './common.js';
import { fireballDef } from './mprojectiles.js';
import { wrapAngle } from '../../core/math.js';

const R = Math.PI / 180;
const SC = 1.6;
export const FLY_HEIGHT = 7;

// ---- procedural textures
const speckle = (cols, density = 1) => (g, n, rnd) => {
  g.fillStyle = cols[0]; g.fillRect(0, 0, n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (rnd() > density) continue; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y, 1, 1); }
};
registerTexture('brathalos_scale', (g, n, rnd) => {
  speckle(['#b8321e', '#a82a18', '#c83e24', '#8e2214'])(g, n, rnd);
  g.fillStyle = '#4a1410';
  for (let y = 1; y < n; y += 4) g.fillRect(0, y, n, 1);
  g.fillStyle = '#e8873a';
  for (let i = 0; i < n * 0.6; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 1);
});
registerTexture('brathalos_membrane', (g, n, rnd) => {
  speckle(['#7a1e2a', '#6a1822', '#8a2a34'], 0.9)(g, n, rnd);
  g.fillStyle = '#3a0c14';
  for (let x = 0; x < n; x += 4) g.fillRect(x, 0, 1, n);
  g.fillStyle = '#d06a4a';
  for (let i = 0; i < 5; i++) g.fillRect((rnd() * n) | 0, (rnd() * n) | 0, 1, 2);
});
registerTexture('brathalos_belly', speckle(['#e0b070', '#d0a060', '#ecc080']));
registerTexture('brathalos_horn', speckle(['#3a2a22', '#2e211a', '#4a3a30']));

/**
 * Procedural Brathalos: fire wyvern. Parts: head, wingL, wingR, body (neck, chest, legs, tail root), tail (severable).
 * Pose keys: MREST + wing (flap deg, +up), spread (0 folded .. 1 open), jaw (deg).
 */
export function buildBrathalos({ scale = SC } = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  root.add(g);
  const partMeshes = { head: [], body: [], wingL: [], wingR: [], tail: [] };
  const mats = {};
  const mat = (part, t, opts = {}) => (mats[part + t] ??= lambert({ map: tex(t, { size: 16 }), ...opts }));
  const add = (part, w, h, d, m, parent, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };
  const UP = new THREE.Vector3(0, 0, 1);
  const bone = (part, m, parent, a, b, t) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(t, t, len), m);
    mesh.position.copy(A).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
    parent.add(mesh);
    partMeshes[part].push(mesh);
    return mesh;
  };

  const BASE = 1.85;
  const body = new THREE.Group();
  body.position.y = BASE;
  g.add(body);
  add('body', 1.1, 1.0, 2.3, mat('body', 'brathalos_scale'), body, 0, 0, 0);
  add('body', 0.95, 0.95, 0.9, mat('body', 'brathalos_scale'), body, 0, 0.05, 1.0);
  add('body', 0.85, 0.45, 2.0, mat('body', 'brathalos_belly'), body, 0, -0.42, 0.1);
  for (let i = 0; i < 4; i++) add('body', 0.1, 0.28, 0.3, mat('body', 'brathalos_horn'), body, 0, 0.62, 0.8 - i * 0.6, 0.2); // back spikes

  const neck = new THREE.Group();
  neck.position.set(0, 0.3, 1.25);
  body.add(neck);
  add('body', 0.5, 0.95, 0.5, mat('body', 'brathalos_scale'), neck, 0, 0.4, 0);

  const head = new THREE.Group();
  head.position.set(0, 0.88, 0);
  neck.add(head);
  add('head', 0.58, 0.5, 0.95, mat('head', 'brathalos_scale'), head, 0, 0.05, 0.4);
  add('head', 0.4, 0.3, 0.65, mat('head', 'brathalos_scale'), head, 0, -0.02, 1.0);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.2, 0.15);
  head.add(jaw);
  add('head', 0.42, 0.14, 1.0, mat('head', 'brathalos_belly'), jaw, 0, 0, 0.5);
  const eyeM = basic({ color: '#ffe14d' });
  for (const sx of [1, -1]) add('head', 0.12, 0.12, 0.12, eyeM, head, sx * 0.31, 0.2, 0.55);
  const horns = [];
  for (const sx of [1, -1]) horns.push(add('head', 0.14, 0.14, 0.85, mat('head', 'brathalos_horn'), head, sx * 0.24, 0.4, -0.15, -0.65, sx * 0.25));
  horns.push(add('head', 0.12, 0.12, 0.5, mat('head', 'brathalos_horn'), head, 0, 0.36, 1.1, -0.5));
  const hornStumps = [];
  for (const sx of [1, -1]) { const s = add('head', 0.16, 0.16, 0.2, mat('head', 'brathalos_horn'), head, sx * 0.24, 0.3, -0.02, -0.65); s.visible = false; hornStumps.push(s); }

  // wings: root group (rotation) -> mesh group (mirrored for the right one)
  const wings = {};
  const wingTorn = {};
  for (const [id, sx] of [['wingL', 1], ['wingR', -1]]) {
    const wr = new THREE.Group();
    wr.position.set(sx * 0.55, 0.45, 0.5);
    body.add(wr);
    const wm = new THREE.Group();
    wm.scale.x = sx;
    wr.add(wm);
    const wz = new THREE.Group(); // bones + membrane: squashed along z when folded, shortened when torn
    wm.add(wz);
    const sk = mat(id, 'brathalos_scale');
    const P = { s: [0, 0, 0.2], e: [1.6, 0.05, 0.1], t: [3.3, 0.2, -0.4], o: [2.8, 0, -1.9], m: [1.5, 0, -2.1], i: [0.2, 0, -1.6] };
    bone(id, sk, wz, P.s, P.e, 0.26);
    bone(id, sk, wz, P.e, P.t, 0.17);
    bone(id, sk, wz, P.e, P.o, 0.08);
    bone(id, sk, wz, P.e, P.m, 0.08);
    // membrane (single-sided triangles, shown from both sides)
    const memMat = lambert({ map: tex('brathalos_membrane', { size: 16 }), side: THREE.DoubleSide });
    const tri = [P.s, P.e, P.m, P.e, P.t, P.o, P.e, P.o, P.m, P.s, P.m, P.i];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(tri.flat(), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(tri.flatMap((p) => [p[0] / 3.3 * 2, p[2] / 2.2 * 2]), 2));
    geo.computeVertexNormals();
    const mem = new THREE.Mesh(geo, memMat);
    wz.add(mem);
    partMeshes[id].push(mem);
    wings[id] = { root: wr, mesh: wm, wz, sx };
  }

  const legs = {};
  for (const [name, sx] of [['legL', 1], ['legR', -1]]) {
    const l = new THREE.Group();
    l.position.set(sx * 0.5, -0.45, -0.15);
    body.add(l);
    const m = mat('body', 'brathalos_scale');
    add('body', 0.42, 0.75, 0.55, m, l, 0, -0.3, 0, 0.3);
    add('body', 0.28, 0.75, 0.3, m, l, 0, -0.85, 0.12, -0.3);
    add('body', 0.45, 0.12, 0.7, mat('body', 'brathalos_horn'), l, 0, -1.25, 0.3);
    for (const cx of [-0.14, 0, 0.14]) add('body', 0.07, 0.07, 0.3, mat('body', 'brathalos_belly'), l, cx, -1.22, 0.75);
    legs[name] = l;
  }

  const tail1 = new THREE.Group();
  tail1.position.set(0, -0.05, -1.1);
  body.add(tail1);
  add('body', 0.62, 0.55, 1.5, mat('body', 'brathalos_scale'), tail1, 0, 0, -0.7, -0.05);
  const tail2 = new THREE.Group();
  tail2.position.set(0, 0, -1.45);
  tail1.add(tail2);
  add('tail', 0.46, 0.42, 1.5, mat('tail', 'brathalos_scale'), tail2, 0, 0, -0.7, -0.04);
  const tail3 = new THREE.Group();
  tail3.position.set(0, 0, -1.45);
  tail2.add(tail3);
  add('tail', 0.32, 0.3, 1.4, mat('tail', 'brathalos_scale'), tail3, 0, 0, -0.65);
  for (const sx of [1, -1]) add('tail', 0.1, 0.12, 0.7, mat('tail', 'brathalos_horn'), tail3, sx * 0.16, 0, -1.4, 0, sx * 0.5);
  add('tail', 0.14, 0.7, 0.5, mat('tail', 'brathalos_horn'), tail3, 0, 0.0, -1.4);

  const nodes = { body, neck, head, jaw, tail1, tail2, tail3, legL: legs.legL, legR: legs.legR, wingL: wings.wingL.mesh, wingR: wings.wingR.mesh, root: g };
  return {
    root, nodes, partMeshes,
    extra: { eyeMat: eyeM, horns, hornStumps, wings, tail2, tailBase: tail1, g, scale, tearWing: (id) => { wingTorn[id] = true; } },
    apply(p) {
      body.position.y = BASE + p.bodyY / scale;
      body.rotation.set(p.bodyPitch * R, 0, p.bodyRoll * R);
      neck.rotation.x = 0.45 + p.neck;
      head.rotation.set(-(0.45 + p.neck) + p.head * R, p.headYaw * R, 0);
      jaw.rotation.x = p.jaw * R;
      tail1.rotation.set(p.tailPitch * R, p.tailYaw * R, 0);
      tail2.rotation.set(p.tailPitch * 0.6 * R, p.tailYaw * 0.9 * R, 0);
      tail3.rotation.set(p.tailPitch * 0.4 * R, p.tailYaw * 0.9 * R, 0);
      legs.legL.rotation.x = -p.legL * R;
      legs.legR.rotation.x = -p.legR * R;
      const fold = 1 - p.spread;
      for (const id of ['wingL', 'wingR']) {
        const w = wings[id], torn = wingTorn[id] ? 0.55 : 1;
        const flap = (p.wing * R + 0.1) * w.sx;
        w.root.rotation.set(0, w.sx * fold * 1.3, flap - w.sx * fold * 0.9);
        w.wz.scale.set(torn, 1, 1 - fold * 0.85);
      }
    },
  };
}

// ======================================================= Angriffe
const BEAK_HEIGHT = 3.2;

// ---- 1. Feuerspucke: Kopf zieht zurück, Maul glüht 0,6 s, Feuerball (28 + Brennen); Rotglut: 3er-Fächer
const FIRE_SPEED = 18;
const feuer = {
  id: 'brathalos_feuer', range: [4.5, 30], weight: 5, cooldown: 5, telegraph: 0.6, flashParts: ['head'], duration: 1.9, hits: [], // damage comes from the fireball projectile
  events: [{ t: 0.75, call: 'spit', all: true }],
  calls: {
    spit(m, ctx, inst, age = 0) {
      const o = inst.origin, yaw = inst.yaw0;
      const from = { x: o.x + Math.sin(yaw) * 3.2, y: o.y + BEAK_HEIGHT, z: o.z + Math.cos(yaw) * 3.2 };
      const aim = { x: inst.target.x, y: inst.target.y + 1.0, z: inst.target.z };
      const fan = inst.rage ? [-0.3, 0, 0.3] : [0];
      const base = Math.atan2(aim.x - from.x, aim.z - from.z);
      const hd = Math.hypot(aim.x - from.x, aim.z - from.z);
      fan.forEach((da, i) => {
        const a = base + da;
        const a2 = { x: from.x + Math.sin(a) * hd, y: aim.y, z: from.z + Math.cos(a) * hd };
        m.projectiles.spawn(fireballDef({ from, aim: a2, speed: FIRE_SPEED, key: `${inst.key}:f${i}` }), age);
      });
      ctx.fx.spark(from, 16, '#ff8a20', 5);
      ctx.bus.emit('sfx', { name: 'roar', pos: from, low: true });
    },
  },
  pose: mTrack([
    [0, {}], [0.4, { neck: -0.55, head: -22, jaw: 28, bodyPitch: -8, bodyY: 0.08, tailPitch: 8 }], [0.6, { neck: -0.65, head: -26, jaw: 34, bodyPitch: -10 }],
    [0.78, { neck: 0.4, head: 14, jaw: 6, bodyPitch: 6 }, 'lin'], [1.2, { neck: 0.15, head: 4, jaw: 4 }], [1.9, {}],
  ]),
};

// ---- 2a. Aufflug: duckt sich, Flügel spreizen, Abheben (Flug-Zustand beginnt am Ende)
const aufflug = {
  // Take-off cadence is driven by m.flyCd (see `tick`): one take-off every ~30-45 s (21-33 s of ground time + flight), picked sooner when the hunter is far away / in Rotglut.
  id: 'brathalos_aufflug', range: [0, 40], cooldown: 0, telegraph: 0.6, flashParts: ['wingL', 'wingR'], duration: 1.8,
  weight: (m, dist) => (dist > 14 ? 5 : dist > 8 ? 3 : 1.5) + (m.rage ? 1.5 : 0),
  cond: (m) => m.flyCd <= 0 && !m.partById.wingL.broken && !m.partById.wingR.broken && !m.blind,
  hits: [],
  events: [{ t: 0.7, call: 'dust', all: true }],
  calls: { dust(m) { m.ctx.fx.spark({ x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z }, 22, '#a08a60', 6); m.ctx.fx.shake(0.15, 0.4); } },
  motion(tau) { return { air: FLY_HEIGHT * smooth(clamp01((tau - 0.65) / 1.0)) }; },
  pose: mTrack([
    [0, {}], [0.3, { bodyY: -0.35, legL: 45, legR: 45, spread: 0.6, wing: -20, bodyPitch: 6 }], [0.6, { bodyY: -0.45, spread: 1, wing: -30, legL: 50, legR: 50 }],
    [0.8, { bodyY: 0.2, spread: 1, wing: 45, legL: -10, legR: -10, bodyPitch: -6 }], [1.2, { spread: 1, wing: 0, legL: 40, legR: 40, bodyPitch: -8, bodyY: 0.3 }], [1.8, { spread: 1, wing: 30, bodyPitch: -8, legL: 40, legR: 40 }],
  ]),
};

// ---- 2b. Krallensturz (nur aus dem Flug): Schatten auf dem Ziel 0,9 s, Sturzflug 26 Schaden + Gift
const sturz = {
  id: 'brathalos_sturz', range: [0, 60], weight: 0, internal: true, cooldown: 0, telegraph: 0.9, flashParts: ['body', 'wingL', 'wingR'], duration: 2.7,
  marker: { at: 'target', radius: 3.2 }, markerUntil: 1.55,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const stop = Math.max(0, d - 1.6); // claws reach the target point
    a.landing = { x: a.origin.x + (dx / d) * stop, z: a.origin.z + (dz / d) * stop };
    a.diveYaw = Math.atan2(dx, dz);
    a.turn = wrapAngle(a.diveYaw - a.yaw0);
  },
  hits: [{ t0: 1.18, t1: 1.55, shape: 'sphere', at: [0, 0.8, 1.9], radius: 2.2, dmg: 26, knock: 'down', status: { type: 'poison' } }],
  events: [{ t: 1.35, call: 'impact', all: true }],
  calls: { impact(m) { m.ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * 1.8, y: m.pos.y + 0.3, z: m.pos.z + Math.cos(m.rot) * 1.8 }, 26, '#a08a60', 7); m.ctx.fx.shake(0.45, 0.3); } },
  motion(tau, a) {
    const yaw = a.yaw0 + a.turn * smooth(clamp01(tau / 0.7));
    const k = clamp01((tau - 0.9) / 0.45);
    const e = k * k;
    return {
      x: a.origin.x + (a.landing.x - a.origin.x) * smooth(k), z: a.origin.z + (a.landing.z - a.origin.z) * smooth(k),
      yaw, air: FLY_HEIGHT * (1 - e) + (tau < 0.9 ? Math.sin(tau * 5) * 0.2 : 0),
    };
  },
  pose: mTrack([
    [0, { spread: 1, wing: 20, legL: 45, legR: 45, bodyPitch: -8, bodyY: 0.3 }], [0.5, { spread: 1, wing: 45, bodyPitch: -22, legL: 70, legR: 70, neck: -0.2 }],
    [0.9, { spread: 1, wing: 55, bodyPitch: -28, legL: 85, legR: 85, head: -10 }], [1.1, { spread: 0.9, wing: -20, bodyPitch: 34, legL: -40, legR: -40, neck: 0.4, head: 14 }, 'lin'],
    [1.4, { spread: 0.8, wing: 0, bodyPitch: 14, legL: -20, legR: -20, bodyY: -0.2 }], [1.9, { spread: 0.4, wing: 10, bodyPitch: 0, legL: 10, legR: 10, bodyY: -0.1 }], [2.7, {}],
  ]),
};

// ---- 3. Flügelböe: Wind schiebt 3 m zurück, kein Schaden, unterbricht Aufladen
const boee = {
  id: 'brathalos_boee', range: [0, 10], weight: 3, cooldown: 7, telegraph: 0.8, flashParts: ['wingL', 'wingR'], duration: 2.0,
  marker: { at: 'self', radius: 7 }, markerUntil: 1.05,
  hits: [{ t0: 1.0, t1: 1.12, shape: 'sphere', at: [0, 1.2, 3.8], radius: 4.8, dmg: 0, knock: 'push', push: 3 }],
  events: [{ t: 1.0, call: 'gust', all: true }],
  calls: {
    gust(m, ctx) {
      for (let i = 0; i < 3; i++) ctx.fx.spark({ x: m.pos.x + Math.sin(m.rot) * (2 + i * 1.6), y: m.pos.y + 0.5, z: m.pos.z + Math.cos(m.rot) * (2 + i * 1.6) }, 10, '#d8d0b0', 8);
      ctx.fx.shake(0.2, 0.3);
      ctx.bus.emit('sfx', { name: 'swing', pos: m.pos, heavy: true });
    },
  },
  pose: mTrack([
    [0, {}], [0.4, { spread: 1, wing: 55, bodyPitch: -10, bodyY: 0.1, neck: -0.2 }], [0.75, { spread: 1, wing: 70, bodyPitch: -14, bodyY: 0.2 }],
    [0.98, { spread: 1, wing: -45, bodyPitch: 8, bodyY: -0.1 }, 'lin'], [1.25, { spread: 1, wing: 55, bodyPitch: -8 }], [1.5, { spread: 1, wing: -30, bodyPitch: 6 }], [2.0, {}],
  ]),
};

// ---- 4. Schwanzhieb: 180° hinten, 20 Schaden
const schwanz = tailSweep({
  id: 'brathalos_schwanz', range: [0, 9], weight: 8, cooldown: 3, telegraph: 0.6, dmg: 20, len: 8.4, radius: 1.0, sweep: Math.PI * 0.95, y: 1.3, duration: 1.9, t0: 0.66, t1: 1.12,
  cond: (m) => targetBehind(m, 1.6),
  pose: mTrack([
    [0, {}], [0.5, { tailYaw: 60, tailPitch: -6, bodyY: -0.08, bodyPitch: 3 }], [0.62, { tailYaw: 60 }], [0.82, { tailYaw: -60 }, 'lin'], [1.15, { tailYaw: -60 }], [1.9, {}],
  ]),
});

// ---- 5. Rotglut-Brüllen: hält Pirscher im 9-m-Radius 1 s fest (Rolle im richtigen Moment = Glitch-Konter)
const bruellen = {
  id: 'brathalos_bruellen', range: [0, 99], weight: 0, internal: true, cooldown: 0, telegraph: 0.8, flashParts: ['head'], duration: 2.4,
  marker: { at: 'self', radius: 9 }, markerUntil: 1.15,
  hits: [{ t0: 1.0, t1: 1.1, shape: 'sphere', at: [0, 0.8, 0], radius: 9, dmg: 0, knock: 'pin' }],
  pose: mTrack([
    [0, {}], [0.6, { neck: -0.7, head: -45, jaw: 40, bodyPitch: -14, bodyY: 0.15, spread: 0.7, wing: 25 }], [1.0, { neck: -0.75, head: -50, jaw: 45, bodyPitch: -16, spread: 0.8, wing: 30 }],
    [1.9, { neck: -0.7, head: -45, jaw: 40, spread: 0.7, wing: 20 }], [2.4, {}],
  ]),
};

// ======================================================= Teile
function severTail(m) {
  const part = m.partById.tail;
  part.gone = true;
  const { tail2, g, scale } = m.extra;
  const pos = tail2.getWorldPosition(new THREE.Vector3());
  tail2.visible = false;
  // dropped tail: a carvable object lying in the world (P agent carves it via the tailSevered event)
  const drop = new THREE.Group();
  const clone = tail2.clone(true);
  clone.visible = true;
  clone.position.set(0, 0, 0);
  clone.rotation.set(0, 0, 0);
  clone.scale.setScalar(1);
  clone.traverse((o) => { if (o.material) o.material = lambert({ map: o.material.map }); }); // own materials: no part flash / jitter
  const wrap = new THREE.Group();
  wrap.scale.setScalar(scale);
  wrap.add(clone);
  drop.add(wrap);
  const gy = m.ctx.world.heightAt(pos.x, pos.z);
  drop.position.set(pos.x, gy + 0.35 * scale, pos.z);
  drop.rotation.y = m.rot + Math.PI * 0.12;
  m.ctx.scene?.add(drop);
  m.severedTail = { pos: { x: pos.x, y: gy, z: pos.z }, mesh: drop, carved: false };
  m.ctx.fx.spark(pos, 30, '#c03020', 7);
  m.ctx.bus.emit('tailSevered', { monster: m, pos: { x: pos.x, y: gy, z: pos.z }, mesh: drop });
}

export const brathalos = {
  id: 'brathalos',
  name: 'Brathalos',
  hp: 12000,
  scale: SC,
  bodyRadius: 1.7,
  walk: 2.6, run: 6.2, detect: 32, prefer: 6, turn: 0.85,
  drops: ['brathalos_schuppe', 'brathalos_membran', 'glutsack', 'brathalos_rubin'],
  fly: { height: FLY_HEIGHT, minT: 4, maxT: 8, gapMin: 21, gapMax: 33, firstGap: 18, attack: 'brathalos_sturz', radius: 11, speed: 9, angSpeed: 0.5, dropDamage: 250 },
  rageAttack: 'brathalos_bruellen',
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, breakHp: 700, jitter: 0.07, elem: { fire: 0, shock: 25 }, blunt: true, stunPart: true,
      spheres: [{ node: 'head', offset: [0, 0.08, 0.6], r: 0.58 }] },
    { id: 'wingL', label: 'Linker Flügel', factor: 0.8, breakHp: 600, jitter: 0.06, elem: { fire: 0, shock: 20 }, blunt: false,
      spheres: [{ node: 'wingL', offset: [0.9, 0.1, -0.6], r: 0.78 }, { node: 'wingL', offset: [2.1, 0.12, -0.8], r: 0.78 }, { node: 'wingL', offset: [3.0, 0.18, -0.9], r: 0.62 }] },
    { id: 'wingR', label: 'Rechter Flügel', factor: 0.8, breakHp: 600, jitter: 0.06, elem: { fire: 0, shock: 20 }, blunt: false,
      spheres: [{ node: 'wingR', offset: [0.9, 0.1, -0.6], r: 0.78 }, { node: 'wingR', offset: [2.1, 0.12, -0.8], r: 0.78 }, { node: 'wingR', offset: [3.0, 0.18, -0.9], r: 0.62 }] },
    { id: 'body', label: 'Körper', factor: 0.6, elem: { fire: 0, shock: 10 },
      spheres: [{ node: 'body', offset: [0, 0, 0.55], r: 0.85 }, { node: 'body', offset: [0, 0, -0.5], r: 0.8 }, { node: 'neck', offset: [0, 0.4, 0], r: 0.42 }, { node: 'legL', offset: [0, -0.8, 0.15], r: 0.5 }, { node: 'legR', offset: [0, -0.8, 0.15], r: 0.5 }] },
    { id: 'tail', label: 'Schwanz', factor: 0.7, breakHp: 900, jitter: 0.06, elem: { fire: 0, shock: 10 }, blunt: false,
      spheres: [{ node: 'tail2', offset: [0, 0, -0.7], r: 0.5 }, { node: 'tail3', offset: [0, 0, -0.5], r: 0.42 }, { node: 'tail3', offset: [0, 0, -1.2], r: 0.42 }] },
  ],
  attacks: { brathalos_feuer: feuer, brathalos_aufflug: aufflug, brathalos_sturz: sturz, brathalos_boee: boee, brathalos_schwanz: schwanz, brathalos_bruellen: bruellen },
  build: () => buildBrathalos({ scale: SC }),
  deadPose: { bodyY: -1.1, bodyRoll: 75, head: 20, neck: -0.3, legL: 40, legR: -30, spread: 0.5, wing: -40 },
  onBreak(m, part) {
    if (part.id === 'head') {
      for (const h of m.extra.horns) h.visible = false;
      for (const s of m.extra.hornStumps) s.visible = true;
    } else if (part.id === 'wingL' || part.id === 'wingR') {
      m.extra.tearWing(part.id);
      // a hurt wing grounds him for good: out of the sky now
      if (m.state === 'fly') m._startFall(4);
    } else if (part.id === 'tail') {
      severTail(m);
    }
  },
  onAttackEnd(m, id) {
    if (id === 'brathalos_aufflug') m.beginFly();
    else if (id === 'brathalos_sturz') { m.air = 0; m.setState('combat'); m.recover = 0.9; }
  },
  init(m) { m.flyCd = m.def.fly.firstGap; m._wasUp = false; },
  /** Flight cadence: the gap timer only runs on the ground; a fresh 21-33 s ground gap is rolled each time he comes down. */
  tick(m, dt) {
    const up = m.flying || m.attack?.id === 'brathalos_aufflug';
    if (up) m._wasUp = true;
    else if (m._wasUp) {
      m._wasUp = false;
      if (m.authority) { const f = m.def.fly; m.flyCd = f.gapMin + m.rng() * (f.gapMax - f.gapMin); }
    } else if (m.state === 'combat' || m.state === 'enrage') m.flyCd -= dt;
  },
  onRage(m, on) { m.extra.eyeMat?.color.set(on ? '#ff3020' : '#ffe14d'); },
  poseHook(m, t) {
    if (m.state === 'dead') return;
    if (m.state === 'fly' && !m.attack) {
      Object.assign(t, { spread: 1, legL: 45, legR: 45, bodyPitch: -7, bodyY: 0.3, neck: -0.1, tailPitch: 6, bodyRoll: Math.sin(m.flyAng * 1) * 0 });
      t.wing = 8;
    } else if (m.state === 'fall') {
      Object.assign(t, { spread: 1, bodyPitch: 20, legL: 40, legR: -40, head: 25, bodyRoll: Math.sin(m.time * 6) * 30 });
      t.wing = 20;
    }
    // wing beats while airborne
    if (m.air > 0.8 && t.spread > 0.5 && !(m.attack && m.attack.inst.def.id === 'brathalos_boee')) t.wing = (t.wing ?? 0) + Math.sin(m.time * (m.state === 'fall' ? 18 : 8.5)) * 36;
  },
  snapExtra: (m) => ({ tailGone: !!m.severedTail }),
};
