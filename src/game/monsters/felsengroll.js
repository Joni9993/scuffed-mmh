// Felsengroll, the fortress elder: armoured, territorial, quake rhythm, basalt pillars.
// Every impact is an animated, deterministic AttackInstance; lingering slag, quake rings and pillars
// come only from replicated attack events. Design: docs/FELSENGROLL_ELDER_REWORK.md
import { compileTrack } from '../anim.js';
import { MREST } from './monster.js';
import { smooth, clamp01 } from './common.js';
import { localToWorld, angleDiff, yawOf } from '../../core/math.js';
import { buildFelsengroll, FELS_SCALE } from './felsengrollRig.js';
import { poseFelsengrollPresence } from './felsengrollMotion.js';
import { updateFelsengrollFx } from './felsengrollFx.js';
import { addScorch, addRing, tickHazards } from './pyrosturHazards.js';
import { addPillar, smashPillars, smashAlong, breakPillar, pillarsTouching, covered, tickPillars } from './felsengrollPillars.js';
export { buildFelsengroll, FELS_SCALE } from './felsengrollRig.js';

export const FEL = {
  WORLD_CD: 80, // Weltenbruch repeats ~every 80 s from the second state on (2-3 per hunt)
  ARMOR_MAX: 100, ARMOR_REGEN: 3, ARMOR_REGEN_LAVA: 6, ARMOR_OPEN: 30, ARMOR_FACTOR: .55,
  CRASH_TIME: 3.5, CRASH_ARMOR: 60, EXPOSED_SECS: 8, EXPOSED_FACTOR: 1.6, BODY: 2.9,
};
const REST = { ...MREST, bodyYaw: 0, wingL: 0, wingR: 0, wingFold: 0, elbowL: 0, elbowR: 0, wristL: 0, wristR: 0, tailCurl: 0, neckYaw: 0, headReach: 0, foreL: 0, foreR: 0, hindL: 0, hindR: 0, boiler: 0,
  foreKneeL: 0, foreKneeR: 0, foreAnkleL: 0, foreAnkleR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0 };
const track = (frames) => compileTrack(frames.map(([t, pose, mode]) => {
  const p = { ...REST, ...pose };
  const maxPitch = p.bodyY < -.1 ? 14 : 22;
  const chainPitch = p.bodyPitch + p.neck * 180 / Math.PI;
  p.head = Math.max(-60 - chainPitch, Math.min(p.head, maxPitch - chainPitch));
  return [t, p, mode];
}), REST);
const cue = () => ({ color: '#e3a553', tone: 'droehn' });
const localTarget = (m) => {
  const p = m.target?.pos; if (!p) return { x: 0, z: 1, d: 1 };
  const x = p.x - m.pos.x, z = p.z - m.pos.z;
  return { x: Math.cos(m.rot) * x - Math.sin(m.rot) * z, z: Math.sin(m.rot) * x + Math.cos(m.rot) * z, d: Math.hypot(x, z) };
};
const lateral = (m) => { const p = localTarget(m); return Math.abs(p.x) > p.d * .62; };
const behind = (m) => localTarget(m).z < 0;
const front = (m) => !behind(m) && !lateral(m);
const broken = (m, id) => !!m.partById[id]?.broken;
const hasClub = (m) => !broken(m, 'club');
/** Replicated through tempoMul: only the last state (Lavaader) ever sends > 1. */
const lavaInst = (inst) => (inst.params.tempoMul ?? 1) > 1.05;
const hit = (t, at, radius, dmg, knock = 'down', extra) => ({ t0: t, t1: t + .13, shape: 'sphere', at, radius, dmg, knock, ...extra });
const line = (t, from, to, radius, dmg, end = t + .13, extra) => ({ t0: t, t1: end, shape: 'capsule', from, to, radius, dmg, knock: 'down', ...extra });
const impact = (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + .5, z: m.pos.z }, 12, '#b49a78', 5); ctx.fx.shake(.28, .25); };
const quakeFx = (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + .5, z: m.pos.z }, 30, '#c9a46a', 9); ctx.fx.shake(.6, .5); };
const prepareAdvance = (max, stop = 3.6, min = 0) => (a) => { a.len = Math.max(min, Math.min(max, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - stop)); };
const advance = (t, a, start, span, side = 0) => { const k = smooth(clamp01((t - start) / span)); return { x: a.origin.x + (a.dir.x * a.len + a.dir.z * side) * k, z: a.origin.z + (a.dir.z * a.len - a.dir.x * side) * k }; };
const worldAt = (inst, tau, lx, lz) => { const s = inst.sample(inst.wall(tau)); return localToWorld({}, { x: s.x, y: 0, z: s.z }, s.yaw, lx, 0, lz); };

/** Aimed moves turn on the spot during the telegraph and then travel straight at where the hunter WAS (no lead). */
const aim = (len) => (a) => {
  const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz);
  a.yaw1 = d > .1 ? yawOf(dx, dz) : a.yaw0; a.dir1 = { x: Math.sin(a.yaw1), z: Math.cos(a.yaw1) };
  a.len = len ? len(d) : 0;
};
const aimYaw = (t, a, span = .6) => a.yaw0 + angleDiff(a.yaw0, a.yaw1) * smooth(clamp01(t / span));
const slide = (a, k) => ({ x: a.origin.x + a.dir1.x * a.len * k, z: a.origin.z + a.dir1.z * a.len * k });

// ---- hazards
const SLAG = { kind: 'slag', status: { type: 'mud', t: 4 }, dmg: 18, secs: 2.6, r: 2.3, blast: { r: 2.3, dmg: 190, knock: 'down', attackId: 'felsengroll_sprengschlacke' }, attackId: 'felsengroll_schlacke' };
const slagAt = (m, x, z, age, key, extra) => addScorch(m, x, z, { ...SLAG, ...extra, age, key });
const slagCall = (tau, points, opts = {}) => (m, ctx, inst, age) => {
  for (const [lx, lz, r] of points) { const w = worldAt(inst, tau, lx, lz); slagAt(m, w.x, w.z, age, `${inst.key}:s${lx},${lz}`, { ...opts, r: r ?? opts.r ?? SLAG.r, blast: { ...SLAG.blast, r: r ?? opts.r ?? SLAG.r } }); }
};
const quakeRing = (m, x, z, age, key, o = {}) => addRing(m, x, z, { r0: 6.5, rMax: 24, speed: 15, status: null, knock: 'down', attackId: 'felsengroll_bebenwelle', kind: 'quake', ...o, dmg: Math.round((o.dmg ?? 140) * HEAVY), age, key });
const ringCall = (tau, lx, lz, o) => (m, ctx, inst, age) => { const w = worldAt(inst, tau, lx, lz); quakeRing(m, w.x, w.z, age, `${inst.key}:ring${tau}`, o); quakeFx(m, ctx); };
/** Pillar + (Lavaader) a slag pool just outside it. */
function raise(m, inst, w, age, key, outward = 1) {
  if (!addPillar(m, w.x, w.z, { age, key })) return;
  if (lavaInst(inst)) { const l = Math.hypot(w.x - inst.origin.x, w.z - inst.origin.z) || 1; slagAt(m, w.x + (w.x - inst.origin.x) / l * 3.4 * outward, w.z + (w.z - inst.origin.z) / l * 3.4 * outward, age, `${key}:lava`, { r: 1.8, secs: 3.2 }); }
}

// ---- pose vocabulary: low, wide, heavy
const CROUCH = { bodyY: -.5, bodyPitch: 8, head: 22, neck: .1, wing: 8, hindL: 20, hindR: 20, tailPitch: -8 };
const EXPOSE = { bodyY: -.55, bodyPitch: 6, head: 16, neck: 0, jaw: 22, wing: 6, foreL: -4, foreR: -4, hindL: 14, hindR: 14, boiler: 1 };
const REAR = { bodyY: .2, bodyPitch: -20, head: -14, neck: -.1, jaw: 25, wing: 24, foreL: -58, foreR: -58, hindL: 14, hindR: 14, tailPitch: 8 };
const SLAM = { bodyY: -.5, bodyPitch: 14, head: 24, neck: .1, jaw: 12, wing: -8, foreL: 40, foreR: 40, hindL: 18, hindR: 18 };
const TUCK = { bodyY: -.62, bodyPitch: 30, head: 36, neck: .22, jaw: 0, wing: -18, wingFold: 1, foreL: -46, foreR: -46, hindL: -42, hindR: -42, tailCurl: 30, tailPitch: -24, boiler: .6 };
const LEAP = { bodyY: .05, bodyPitch: -10, head: 12, neck: -.05, jaw: 40, wing: 40, spread: 1, foreL: -60, foreR: -60, hindL: -42, hindR: -42, tailPitch: 6 };
const LAND = { bodyY: -.5, bodyPitch: 14, head: 22, neck: .1, jaw: 20, wing: -14, foreL: 38, foreR: 38, hindL: 22, hindR: 22 };

// Fortress hits land at the top of the Pyrostur damage scale.
const HEAVY = 1.15;
const moves = [];
const attack = (name, config) => {
  const id = 'felsengroll_' + name, baseWeight = config.weight ?? 4;
  const def = { id, range: [0, 16], cooldown: 4, telegraph: .8, duration: 2.4, stam: 5, tgVar: false, markerFromHits: true,
    cue: cue(), flashParts: ['head'], audit: [4], vfx: 'slam', ...config,
    weight: (m, d) => {
      const raw = typeof baseWeight === 'function' ? baseWeight(m, d) : baseWeight;
      const recent = m._felsHistory ?? [];
      return raw * (recent.at(-1) === id ? .03 : recent.includes(id) ? .2 : 1);
    },
  };
  def.events ??= [...new Set(def.hits.map((h) => h.t0))].map((t) => ({ t, call: 'impact', all: true }));
  def.flashParts = def.flashParts.filter((p) => p === 'valve');
  def.markerLead = ['rain', 'meteor', 'welt', 'quake', 'pillar'].includes(def.vfx) ? 1 : .55;
  def.calls = { impact, quake: quakeFx, ...def.calls };
  for (const h of def.hits) { h.group ??= `impact:${h.t0}`; h.dmg = Math.round(h.dmg * HEAVY); }
  moves.push(def); return def;
};

// ---------------------------------------------------------------- quick melee: the wall bites back
const bite = attack('biss', {
  range: [0, 10], weight: 7, cond: front, cooldown: 2.5, telegraph: .65, duration: 1.95, audit: [5, 8], vfx: 'charge',
  prepare: prepareAdvance(3.2), motion(t, a) { return advance(t, a, .5, .22); },
  hits: [line(.72, [-1.1, 1.5, 5.4], [1.1, 1.3, 9], 1.6, 150, .86, { knock: 'flinch' })],
  pose: track([[0, {}], [.45, { ...CROUCH, head: -18, jaw: 70, neck: -.2, headReach: -.2 }], [.62, { ...CROUCH, head: -18, jaw: 76, neck: -.2 }], [.74, { bodyPitch: 12, head: 26, neck: .3, jaw: 0, headReach: .7, foreL: -26, foreR: -26 }], [1.0, { bodyPitch: 5, head: 12, jaw: 12 }], [1.95, {}]]),
});
const doubleBite = attack('doppelbiss', {
  range: [0, 10], weight: 5, cond: front, cooldown: 4, telegraph: .62, duration: 2.5, audit: [5, 8], vfx: 'charge',
  prepare: prepareAdvance(3.2), motion(t, a) { return advance(t, a, .46, .2); },
  hits: [line(.7, [-1.1, 1.5, 5.4], [1.1, 1.3, 8.8], 1.5, 120, .84, { knock: 'flinch' }), line(1.14, [-1.2, 1.4, 5.6], [1.2, 1.2, 9.4], 1.65, 170, 1.28)],
  pose: track([[0, {}], [.42, { ...CROUCH, head: -18, jaw: 72, neck: -.2 }], [.7, { bodyPitch: 12, head: 26, neck: .3, jaw: 0, headReach: .7 }], [.9, { ...CROUCH, head: -22, jaw: 80, neck: -.24 }], [1.14, { bodyPitch: 14, head: 28, neck: .3, jaw: 0, headReach: .85, foreL: -30, foreR: -30 }], [1.7, { ...EXPOSE, bodyY: -.3 }], [2.5, {}]]),
});
const shoulder = attack('schulterstoss', {
  range: [0, 11], weight: 5, cond: front, cooldown: 4, telegraph: .78, duration: 2.5, flashParts: ['shoulder'], audit: [4, 7], vfx: 'charge',
  prepare: prepareAdvance(4.5, 2.6), motion(t, a) { return advance(t, a, .62, .3); },
  hits: [line(.86, [-2.6, 1.7, 1], [-1, 1.7, 6.6], 2.1, 190, 1.02)],
  pose: track([[0, {}], [.55, { ...CROUCH, bodyRoll: -16, bodyY: -.35 }], [.8, { ...CROUCH, bodyRoll: -20, bodyY: -.38 }], [.92, { bodyRoll: 18, bodyPitch: 10, bodyY: -.3, head: 12 }], [1.4, { ...EXPOSE, bodyY: -.3 }], [2.5, {}]]),
});
const rake = attack('scharren', {
  range: [0, 10], weight: 5, cond: front, cooldown: 4, telegraph: .62, duration: 2.35, audit: [4, 7], vfx: 'slam',
  hits: [line(.68, [-1.9, .5, 3], [-1.9, .5, 8.6], 1.35, 120, .8, { knock: 'flinch' }), line(1.0, [1.9, .5, 3], [1.9, .5, 8.6], 1.35, 120, 1.12, { knock: 'flinch' })],
  pose: track([[0, {}], [.45, { ...CROUCH, foreL: -55, bodyRoll: 6 }], [.68, { ...CROUCH, foreL: 42, bodyRoll: -4 }], [.8, { ...CROUCH, foreR: -55, bodyRoll: -6 }], [1.0, { ...CROUCH, foreR: 42 }], [1.5, { ...EXPOSE, bodyY: -.3 }], [2.35, {}]]),
});
const fist = attack('felsfaust', {
  range: [0, 9], weight: 4, cond: front, cooldown: 6, telegraph: .88, duration: 2.7, audit: [5], vfx: 'slam',
  hits: [hit(1.0, [0, .7, 5.6], 2.7, 230), hit(1.0, [-2.6, .7, 4.4], 2.0, 200), hit(1.0, [2.6, .7, 4.4], 2.0, 200)],
  pose: track([[0, {}], [.7, REAR], [.9, { ...REAR, bodyPitch: -26 }], [1.02, SLAM], [1.6, { ...EXPOSE, bodyY: -.45 }], [2.7, {}]]),
});
const head = attack('kopfnuss', {
  range: [0, 8], weight: 4, cond: front, cooldown: 4, telegraph: .75, duration: 2.3, audit: [4, 7], vfx: 'charge',
  prepare: prepareAdvance(3, 2.8), motion(t, a) { return advance(t, a, .64, .2); },
  hits: [line(.84, [-.6, 1.2, 4.2], [-.6, 3.2, 7.2], 1.2, 190, .98), line(.84, [.6, 1.2, 4.2], [.6, 3.2, 7.2], 1.2, 190, .98)],
  pose: track([[0, {}], [.55, { ...CROUCH, head: 30, neck: .16, headReach: -.15, bodyY: -.55 }], [.8, { ...CROUCH, head: 30, neck: .16, bodyY: -.58 }], [.9, { bodyY: .15, bodyPitch: -12, head: -26, neck: -.1, headReach: .55, foreL: -30, foreR: -30, jaw: 25 }], [1.4, { ...EXPOSE, bodyY: -.3 }], [2.3, {}]]),
});
const wingSlam = attack('fluegelschlag', {
  range: [0, 8], weight: (m) => (lateral(m) || behind(m) ? 6 : 2) + (m._hugT > 2.5 ? 4 : 0), noFace: true, cooldown: 5, telegraph: .85, duration: 2.5, flashParts: [], audit: [3, 6], vfx: 'slam',
  hits: [line(1.0, [-6.2, .9, 0.5], [6.2, .9, 0.5], 1.9, 170)],
  pose: track([[0, {}], [.65, { bodyY: .12, bodyPitch: -8, wing: 66, spread: 1, elbowL: -34, elbowR: -34, foreL: -35, foreR: -35 }], [.95, { bodyY: .15, wing: 70, spread: 1 }], [1.06, { bodyY: -.35, bodyPitch: 8, wing: -40, spread: 1, foreL: 20, foreR: 20 }], [1.6, EXPOSE], [2.5, {}]]),
});
// Fast club swing: seeks hunters that hug the flank or the tail.
const clubWhip = attack('keulenpeitsche', {
  range: [0, 16], weight: (m) => (behind(m) || lateral(m) ? 9 : 1.5), noFace: true, cond: hasClub, lockedByBreak: 'club', cooldown: 3.5, telegraph: .68, duration: 2.15, flashParts: [], audit: [0, 8], vfx: 'slam',
  motion(t, a) { return { yaw: a.yaw0 - .85 * smooth(clamp01(t / .6)) + 1.7 * smooth(clamp01((t - .68) / .4)) }; },
  hits: [line(.74, [0, 1.3, -5], [0, 1.3, -14.5], 2, 190, 1.15)],
  pose: track([[0, {}], [.6, { ...CROUCH, bodyRoll: -8, tailYaw: 40, tailCurl: -14 }], [.9, { bodyY: -.3, bodyRoll: 8, tailYaw: -34, tailPitch: -6 }], [1.4, { ...EXPOSE, bodyY: -.35 }], [2.15, {}]]),
});
const stump = attack('stummel', {
  range: [0, 9], weight: 6, needsBroken: 'club', noFace: true, cooldown: 3, telegraph: .8, duration: 2.4, audit: [0], vfx: 'slam',
  motion(t, a) { return { yaw: a.yaw0 - .8 * smooth(clamp01(t / .6)) + 1.6 * smooth(clamp01((t - .7) / .4)) }; },
  hits: [line(.84, [0, 1.1, -2.5], [0, 1.1, -7.2], 1.7, 130, 1.2)],
  pose: track([[0, {}], [.65, { ...CROUCH, tailYaw: 30, bodyRoll: -8 }], [.95, { bodyY: -.3, tailYaw: -30, bodyRoll: 8 }], [1.4, EXPOSE], [2.4, {}]]),
});
// Stomp: the front ground jumps and a quake ring runs out across the whole arena.
const stomper = attack('stampfer', {
  range: [0, 28], weight: (m, d) => (d > 14 ? 14 : d > 9 ? 9 : 3) * (1 + (m._farT ?? 0) / 3), cooldown: 4, telegraph: .8, duration: 2.5, audit: [5, 10], vfx: 'quake',
  hits: [hit(.9, [0, .7, 6], 3.0, 150)],
  events: [{ t: .9, call: 'impact', all: true }, { t: 1.5, call: 'ring', all: true }],
  calls: { ring: ringCall(1.5, 0, 3.5, { r0: 6.5, rMax: 26, speed: 15, dmg: 185 }) },
  pose: track([[0, {}], [.65, { ...REAR, bodyPitch: -17 }], [.88, { ...REAR, bodyPitch: -21 }], [.98, SLAM], [1.5, { ...EXPOSE, bodyY: -.4 }], [2.5, {}]]),
});

// ---------------------------------------------------------------- mobility: the rock rolls
// Curled boulder: turns on the spot while telegraphing, then rolls straight along that lane.
// No lead: reversing or a sideways roll escapes. Up to three self-chained curves, each re-aimed at the hunter's CURRENT spot.
const ROLL = { t0: .9, span: 1.1 };
const roll = attack('rollangriff', {
  range: [4, 30], weight: (m, d) => (d > 12 ? 10 : d > 7 ? 7 : 3) * (1 + (m._farT ?? 0) / 4), cooldown: 6, telegraph: .8, duration: 3.0, audit: [8, 14], stam: 8, vfx: 'roll', noFace: true,
  crash: [ROLL.t0, ROLL.t0 + ROLL.span + .05],
  prepare: aim((d) => Math.max(6, Math.min(22, d + 2.5))),
  motion(t, a) { return { ...slide(a, smooth(clamp01((t - ROLL.t0) / ROLL.span))), yaw: aimYaw(t, a) }; },
  hits: [hit(ROLL.t0 + .02, [0, 1.4, .4], 3.0, 200, 'down', { t1: ROLL.t0 + ROLL.span + .05, fpSamples: 14 }), hit(ROLL.t0 + .02, [0, 1.5, 2.8], 2.3, 200, 'down', { t1: ROLL.t0 + ROLL.span + .05, fpSamples: 14, group: 'roll' })],
  events: [{ t: ROLL.t0 + .02, call: 'impact', all: true }, { t: ROLL.t0 + ROLL.span + .05, call: 'ring', all: true }],
  calls: { ring: ringCall(ROLL.t0 + ROLL.span + .05, 0, 0, { r0: 7, rMax: 22, speed: 15, dmg: 150 }) },
  pose: track([[0, {}], [.45, { ...CROUCH, bodyY: -.55, tailCurl: 12 }], [.72, TUCK], [ROLL.t0, { ...TUCK, bodyPitch: 36 }], [ROLL.t0 + ROLL.span, { ...TUCK, bodyPitch: 28 }], [2.15, { ...CROUCH, bodyY: -.5 }], [2.5, EXPOSE], [3.0, {}]]),
});
roll.hits[0].group = 'roll';
const hop = attack('sprungstampf', {
  range: [5, 22], weight: (m, d) => (d > 10 ? 6 : 4) * (1 + m.phase * .2), cooldown: 5, telegraph: .75, duration: 2.7, audit: [7, 12], vfx: 'quake', noFace: true,
  prepare: aim((d) => Math.max(2, Math.min(17, d - 3.2))),
  motion(t, a) {
    const k = smooth(clamp01((t - .75) / .5));
    return { ...slide(a, k), yaw: aimYaw(t, a, .55), air: t > .75 && t < 1.25 ? Math.sin((t - .75) / .5 * Math.PI) * Math.min(3.4, 1.4 + a.len * .12) : 0 };
  },
  hits: [hit(1.25, [0, .5, 3.2], 3.4, 220), line(1.25, [-2.6, .5, 1.5], [2.6, .5, 4.5], 1.5, 200)],
  events: [{ t: 1.25, call: 'impact', all: true }, { t: 1.27, call: 'ring', all: true }],
  calls: { ring: ringCall(1.27, 0, 0, { r0: 7, rMax: 24, speed: 15, dmg: 160 }) },
  pose: track([[0, {}], [.5, { ...CROUCH, bodyY: -.62, bodyPitch: 12, hindL: 34, hindR: 34 }], [.74, { ...CROUCH, bodyY: -.66 }], [.9, LEAP], [1.2, { ...LEAP, foreL: -30, foreR: -30, bodyPitch: 4 }], [1.3, LAND], [1.7, { ...EXPOSE, bodyY: -.4 }], [2.7, {}]]),
});
const kickback = attack('rueckstoss', {
  range: [0, 9], weight: (m) => 3 + (m._hugT > 2.5 ? 5 : 0), cond: front, cooldown: 6, telegraph: .8, duration: 2.8, audit: [3, 6], vfx: 'slam',
  motion(t, a) { const k = smooth(clamp01(t / .6)); return { x: a.origin.x - a.dir.x * 7 * k, z: a.origin.z - a.dir.z * 7 * k, air: t < .6 ? Math.sin(t / .6 * Math.PI) * 1.8 : 0 }; },
  hits: [line(.92, [-1.2, .8, 3], [-8.4, .8, 9.5], 1.7, 160, 1.06), line(.92, [1.2, .8, 3], [8.4, .8, 9.5], 1.7, 160, 1.06)],
  events: [{ t: .6, call: 'impact', all: true }, { t: .92, call: 'impact', all: true }],
  pose: track([[0, {}], [.2, { ...CROUCH, bodyY: -.6, tailYaw: 30 }], [.4, { ...LEAP, bodyPitch: 8 }], [.62, LAND], [.82, { ...CROUCH, tailYaw: -45, bodyRoll: 8 }], [.95, { bodyY: -.3, tailYaw: 55, bodyRoll: -10, bodyPitch: 6 }], [1.5, { ...EXPOSE, bodyY: -.35 }], [2.8, {}]]),
});
const charge = attack('ramme', {
  range: [8, 28], weight: (m, d) => (d > 12 ? 7 : 3.5) * (1 + (m._farT ?? 0) / 4), cooldown: 6, telegraph: .95, duration: 3.1, flashParts: [], audit: [9, 16], vfx: 'charge', noFace: true,
  crash: [1.0, 1.8],
  prepare: aim((d) => Math.max(2, Math.min(20, d - 1.5))),
  motion(t, a) { return { ...slide(a, smooth(clamp01((t - .95) / .8))), yaw: aimYaw(t, a, .7) }; },
  hits: [line(1.0, [-1.5, 1.6, 2], [1.5, 1.6, 5], 2.4, 210, 1.78, { fpSamples: 12 }), line(1.0, [-1.2, 1.2, 5], [1.2, 1.2, 7], 1.6, 210, 1.78, { fpSamples: 12 })],
  events: [{ t: 1.0, call: 'impact', all: true }, { t: 1.8, call: 'impact', all: true }, { t: 1.82, call: 'ring', all: true }],
  calls: { ring: ringCall(1.82, 0, 5, { r0: 7, rMax: 24, speed: 15, dmg: 150 }) },
  pose: track([[0, {}], [.7, { ...CROUCH, head: 34, neck: .2, wing: -24, tailPitch: 12 }], [.94, { ...CROUCH, head: 34, neck: .2, tailPitch: 16 }], [1.08, { bodyPitch: 16, head: 32, neck: .25, foreL: -45, foreR: -45, hindL: -40, hindR: -40 }], [1.4, { bodyPitch: 8, head: 30, foreL: 40, foreR: 40, hindL: 35, hindR: 35 }], [1.85, { ...EXPOSE, bodyPitch: 16, foreL: 40, foreR: 40 }], [3.1, {}]]),
});

// ---------------------------------------------------------------- control: quakes, slag, boulders, pillars
const LINE = [[5, 1.0], [9, 1.2], [13, 1.4], [17, 1.6], [21, 1.8]];
const rift = attack('beben', {
  range: [3, 26], weight: (m, d) => (d > 12 ? 7 : 4) * (1 + (m._farT ?? 0) / 4), cooldown: 7, telegraph: 1.0, duration: 3.9, audit: [5, 7], vfx: 'quake', noFace: true,
  prepare: aim(), motion(t, a) { return { yaw: aimYaw(t, a, .7) }; },
  hits: LINE.map(([z, t]) => hit(t, [0, .5, z], 2.2, 150)),
  events: [...LINE.map(([, t]) => ({ t, call: 'impact', all: true })), { t: 2.4, call: 'ring', all: true }, { t: 2.0, call: 'tail', all: true }],
  // Lavaader: the seam leaves a slag pool at its far end.
  calls: { ring: ringCall(2.4, 0, 0, { r0: 8, rMax: 26, speed: 15, dmg: 160 }), tail(m, ctx, inst, age) { if (!lavaInst(inst)) return; const w = worldAt(inst, 2.0, 0, 23); slagAt(m, w.x, w.z, age, `${inst.key}:tail`); } },
  pose: track([[0, {}], [.8, { ...REAR, bodyPitch: -22 }], [1.0, { ...REAR, bodyPitch: -24 }], [1.1, SLAM], [2.1, { ...SLAM, bodyY: -.55, head: 30 }], [2.6, { ...EXPOSE, bodyY: -.45 }], [3.9, {}]]),
});
const FORK = [[8.5, 5, 2.0], [-8.5, 5, 2.0]];
const fault = attack('bruchlinie', {
  range: [4, 24], weight: (m) => 5 + m.phase, phase: 1, cooldown: 9, telegraph: 1.05, duration: 4.5, audit: [5, 9], vfx: 'quake', noFace: true,
  prepare: aim(), motion(t, a) { return { yaw: aimYaw(t, a, .7) }; },
  hits: [[5, 1.1], [9, 1.3], [13, 1.5], [17, 1.7]].map(([z, t]) => hit(t, [0, .5, z], 2.2, 150)).concat(
    [[8, 12, 1.95], [11, 17, 2.15], [14, 22, 2.35]].flatMap(([x, z, t]) => [hit(t, [x * .8, .5, z * .7], 2.2, 150), hit(t, [-x * .8, .5, z * .7], 2.2, 150)])),
  events: [...[1.1, 1.3, 1.5, 1.7, 1.95, 2.15, 2.35].map((t) => ({ t, call: 'impact', all: true })), { t: 2.4, call: 'slag', all: true }],
  // The fork ends bubble up as slag: leaving the lanes sideways costs time.
  calls: { slag: slagCall(2.4, [[8.6, 14.5], [-8.6, 14.5]], { r: 2.1 }) },
  pose: track([[0, {}], [.85, { ...REAR, bodyPitch: -22, bodyRoll: -6 }], [1.05, { ...REAR, bodyPitch: -24 }], [1.15, SLAM], [1.95, { ...SLAM, bodyRoll: 10, head: 30 }], [2.4, { ...SLAM, bodyRoll: -10 }], [3.0, { ...EXPOSE, bodyY: -.45 }], [4.5, {}]]),
});
const SPIT = 3;
const spit = attack('schlackespucke', {
  range: [8, 26], weight: (m, d) => (d > 12 ? 7 : 4) * (1 + (m._farT ?? 0) / 4), cooldown: 8, telegraph: 1.0, duration: 3.7, audit: [10, 16], vfx: 'quake', hits: [],
  events: [{ t: 1.0, call: 'spit', all: true }],
  calls: {
    // One bomb on the hunter, two on the escape lanes. Each bomb leaves slag with a fuse.
    spit(m, ctx, inst, age) {
      const from = worldAt(inst, 1.0, 0, 4.2), T = inst.target;
      const dx = T.x - from.x, dz = T.z - from.z, l = Math.hypot(dx, dz) || 1, px = dz / l, pz = -dx / l;
      const spots = [[0, 0], [5.6, 0], [-5.6, 0]];
      for (let i = 0; i < SPIT; i++) {
        const to = { x: T.x + px * spots[i][0], y: T.y ?? 0, z: T.z + pz * spots[i][0] }, dur = 1.0 + i * .18;
        m.projectiles.spawn({ kind: 'magma', mode: 'impact', from: { x: from.x, y: (inst.origin.y ?? 0) + 3.4, z: from.z }, to, dur, arc: 9, radius: .6, splash: 1.9, hold: .2, dmg: 120, knock: 'down', key: `${inst.key}:b${i}`, attackId: inst.params.attackId }, age);
        slagAt(m, to.x, to.z, age - dur, `${inst.key}:sp${i}`);
      }
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
    },
  },
  pose: track([[0, {}], [.7, { bodyPitch: -14, head: -34, neck: -.22, jaw: 70, wing: 24, boiler: 1 }], [.97, { bodyPitch: -16, head: -40, jaw: 82, boiler: 1 }], [1.06, { bodyPitch: 8, head: 14, neck: .12, jaw: 70, headReach: .4 }], [1.5, { bodyPitch: -4, head: -4, jaw: 40 }], [2.1, EXPOSE], [3.7, {}]]),
});
// Club hurls three boulders in high arcs onto FIXED points: the hunter's spot and both sidesteps.
const hurl = attack('felswurf', {
  range: [8, 34], weight: (m, d) => (d > 12 ? 7 : 3) * (1 + (m._farT ?? 0) / 3), cond: hasClub, lockedByBreak: 'club', cooldown: 7, telegraph: .9, duration: 2.9, audit: [10, 18, 28], vfx: 'quake', stam: 6, hits: [],
  events: [{ t: .9, call: 'throw', all: true }],
  calls: {
    throw(m, ctx, inst, age) {
      const from = worldAt(inst, .9, 0, -10), T = inst.target;
      const dx = T.x - m.pos.x, dz = T.z - m.pos.z, l = Math.hypot(dx, dz) || 1, px = dz / l, pz = -dx / l;
      [[0, 1.3], [4.6, 1.5], [-4.6, 1.7]].forEach(([side, dur], i) => {
        const to = { x: T.x + px * side, y: T.y ?? 0, z: T.z + pz * side };
        m.projectiles.spawn({ kind: 'rock', mode: 'impact', from: { x: from.x, y: (inst.origin.y ?? 0) + 4.5, z: from.z }, to, dur, arc: 14, radius: .6, splash: 2.2, hold: .2, dmg: 170, knock: 'down', key: `${inst.key}:r${i}`, attackId: inst.params.attackId }, age);
      });
      ctx.bus.emit('sfx', { name: 'swing', pos: m.pos, heavy: true });
    },
  },
  pose: track([[0, {}], [.65, { ...CROUCH, tailYaw: 50, tailPitch: 32, bodyRoll: -6 }], [.86, { ...CROUCH, tailYaw: 55, tailPitch: 38 }], [.98, { bodyPitch: 10, tailYaw: -20, tailPitch: -8, bodyRoll: 6 }], [1.5, { ...EXPOSE, bodyY: -.35 }], [2.9, {}]]),
});
// Pillars break through the ground in an arc, leaving a centre lane open: cover and crash targets.
const PILLARS = [[-62, 1.0], [-24, 1.22], [24, 1.44], [62, 1.66]].map(([deg, t]) => ({ lx: Math.sin(deg * Math.PI / 180) * 10.5, lz: Math.cos(deg * Math.PI / 180) * 10.5, t }));
const pillarsMove = attack('saeulenbruch', {
  range: [0, 30], weight: (m, d) => (m.extra.pillars?.filter((p) => !p.dead).length ?? 0) < 3 ? (d > 8 ? 6 : 4) : .8, cooldown: 12, telegraph: 1.0, duration: 3.6, audit: [6, 12], vfx: 'pillar', noFace: true,
  prepare: aim(), motion(t, a) { return { yaw: aimYaw(t, a, .7) }; },
  hits: PILLARS.map((p) => hit(p.t, [p.lx, .6, p.lz], 2.3, 150)),
  events: PILLARS.flatMap((p, i) => [{ t: p.t, call: 'impact', all: true }, { t: p.t + .01, call: 'raise' + i, all: true }]),
  calls: Object.fromEntries(PILLARS.map((p, i) => ['raise' + i, (m, ctx, inst, age) => raise(m, inst, worldAt(inst, p.t + .01, p.lx, p.lz), age, `${inst.key}:p${i}`)])),
  pose: track([[0, {}], [.8, { ...REAR, bodyPitch: -20 }], [1.0, { ...REAR, bodyPitch: -22 }], [1.1, SLAM], [1.8, { ...SLAM, bodyY: -.55 }], [2.2, EXPOSE], [3.6, {}]]),
});
// 360 degree club double spin: both passes smash every pillar in reach.
const SPIN = (Math.PI * 2);
const whirl = attack('keulenwirbel', {
  range: [0, 16], weight: (m) => 3 + (m._hugT > 2 ? 4 : 0) + (behind(m) ? 3 : 0), cond: hasClub, lockedByBreak: 'club', noFace: true, cooldown: 9, telegraph: .85, duration: 4.6, punishWindow: 1.6, audit: [11, 0], vfx: 'slam',
  motion(t, a) { return { yaw: a.yaw0 - .4 * smooth(clamp01(t / .7)) + (SPIN + .4) * smooth(clamp01((t - .8) / .55)) - SPIN * smooth(clamp01((t - 1.7) / .5)) }; },
  hits: [line(.88, [0, 1.3, -5], [0, 1.3, -14.5], 2, 200, 1.36), line(1.78, [0, 1.3, -5], [0, 1.3, -10.5], 2.1, 230, 2.2)],
  events: [{ t: .88, call: 'impact', all: true }, { t: .9, call: 'smash', all: true }, { t: 1.78, call: 'impact', all: true }, { t: 1.8, call: 'smash', all: true }],
  calls: { smash(m, ctx, inst) { const w = worldAt(inst, .9, 0, 0); smashPillars(m, w.x, w.z, 16); } },
  pose: track([[0, {}], [.7, { ...CROUCH, tailYaw: 55, tailPitch: 20, bodyRoll: -8 }], [1.0, { bodyY: -.3, tailYaw: -50, tailPitch: 10, bodyRoll: 10, wing: 20 }], [1.5, { bodyY: -.3, tailYaw: 40, tailPitch: 12, bodyRoll: -8 }], [1.9, { bodyY: -.3, tailYaw: -50, bodyRoll: 10 }], [2.5, { ...EXPOSE, bodyY: -.45 }], [4.6, {}]]),
});
const hail = attack('geroellhagel', {
  range: [4, 18], weight: 4, phase: 1, cooldown: 14, telegraph: 1.25, duration: 4.7, flashParts: [], audit: [6, 11], punishWindow: 1.8, vfx: 'rain', noFace: true,
  hits: [hit(1.5, [-4, .5, 6.5], 2.4, 190), hit(1.5, [4, .5, 6.5], 2.4, 190), hit(2.5, [0, .5, 11], 2.6, 210), hit(2.5, [-8, .5, 8], 2.4, 190), hit(2.5, [8, .5, 8], 2.4, 190)],
  events: [{ t: 1.5, call: 'impact', all: true }, { t: 2.5, call: 'impact', all: true }, { t: 2.52, call: 'slag', all: true }],
  calls: { slag: slagCall(2.52, [[-8, 8], [8, 8]], { r: 2.1 }) },
  pose: track([[0, {}], [1.0, { ...REAR, bodyPitch: -26, head: -30, wing: 50, spread: 1 }], [1.3, { ...REAR, bodyPitch: -26, wing: 55 }], [1.55, { ...SLAM, wing: -20 }], [2.1, { ...REAR, bodyPitch: -22 }], [2.55, { ...SLAM, wing: -20 }], [3.0, { ...EXPOSE, bodyY: -.45 }], [4.7, {}]]),
});

// ---------------------------------------------------------------- signatures
// Meteor: a heavy leap to 9 m, a landing on the marked spot. One roll clears the disc; the quake ring starts outside it
// and a pillar crown rises around the crater.
const DIVE = 2.1;
const CROWN = [0, 1, 2, 3].map((i) => ({ lx: Math.sin(Math.PI / 4 + i * Math.PI / 2) * 10.4, lz: Math.cos(Math.PI / 4 + i * Math.PI / 2) * 10.4 }));
const meteor = attack('meteor', {
  range: [0, 36], weight: (m, d) => (d > 10 ? 4 : 2) * (1 + (m._farT ?? 0) / 3), cooldown: 22, phase: 1, telegraph: DIVE, duration: 5.2, stam: 12, flashParts: [], audit: [0, 8, 16], punishWindow: 2.2, vfx: 'meteor', noFace: true,
  motion(t, a) {
    const k = smooth(clamp01((t - .6) / 1.5));
    const air = t < 1.5 ? 9 * smooth(clamp01((t - .3) / 1.0)) : 9 * (1 - smooth(clamp01((t - 1.5) / (DIVE - 1.5))));
    const travel = a.target ? yawOf(a.target.x - a.origin.x, a.target.z - a.origin.z) : a.yaw0;
    const yaw = a.yaw0 + angleDiff(a.yaw0, travel) * smooth(clamp01((t - .3) / .6));
    return { x: a.origin.x + (a.target.x - a.origin.x) * k, z: a.origin.z + (a.target.z - a.origin.z) * k, yaw, air: t >= DIVE ? 0 : air };
  },
  hits: [hit(DIVE - .02, [0, .5, 0], 3.7, 260, 'down', { t1: DIVE + .14 })].concat(CROWN.map((c) => hit(DIVE + .2, [c.lx, .6, c.lz], 1.9, 130))),
  events: [{ t: .35, call: 'liftoff', all: true }, { t: DIVE, call: 'landing', all: true }, { t: DIVE + .21, call: 'crown', all: true }],
  calls: {
    liftoff: (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.shake(.2, .3); },
    landing(m, ctx, inst, age) {
      quakeFx(m, ctx);
      const at = inst.sample(inst.wall(DIVE));
      quakeRing(m, at.x, at.z, age, `${inst.key}:ring`, { r0: 8, rMax: 24, speed: 16, dmg: 170 });
    },
    crown(m, ctx, inst, age) { CROWN.forEach((c, i) => raise(m, inst, worldAt(inst, DIVE + .21, c.lx, c.lz), age, `${inst.key}:c${i}`)); },
  },
  pose: track([[0, {}], [.3, { ...CROUCH, bodyY: -.65, hindL: 36, hindR: 36 }], [.6, LEAP], [1.5, { ...LEAP, bodyPitch: 20, head: 24, wing: 50, spread: 1 }], [DIVE, { ...LAND, bodyY: -.6 }], [2.6, { ...EXPOSE, bodyY: -.65 }], [4.6, EXPOSE], [5.2, {}]]),
});
// Ultimate of the last state. He buries himself; the arena splits into spokes that erupt in a rotating
// sequence (two laps, the second offset), pillars shield but shatter, and the crater collapses into slag.
const SPOKES = 6, LAP1 = 2.6, LAP2 = 5.4, STEP = .45, COLLAPSE = 8.5;
const spokeDef = [];
for (const [lap, base, off] of [[0, LAP1, 0], [1, LAP2, Math.PI / SPOKES]]) for (let i = 0; i < SPOKES; i++) {
  const ang = off + i * Math.PI * 2 / SPOKES, t = base + i * STEP;
  spokeDef.push({ ang, t, a: [Math.sin(ang) * 6.5, Math.cos(ang) * 6.5], b: [Math.sin(ang) * 28, Math.cos(ang) * 28], lap });
}
const worldBreak = attack('weltenbruch', {
  range: [0, 40], weight: 0, cooldown: FEL.WORLD_CD, phase: 1, telegraph: LAP1, duration: 13.2, stam: 16, flashParts: [], audit: [0, 3], punishWindow: 3.4, vfx: 'welt', noFace: true,
  hits: spokeDef.map((s) => line(s.t, [s.a[0], .6, s.a[1]], [s.b[0], .6, s.b[1]], 3.2, 230, s.t + .2, { fpSamples: 2 })).concat([hit(COLLAPSE, [0, .8, 0], 6.2, 300, 'down', { t1: COLLAPSE + .15 })]),
  events: [{ t: .4, call: 'dig', all: true }, ...spokeDef.flatMap((s, i) => [{ t: s.t, call: 'impact', all: true }, { t: s.t + .02, call: 'smash' + i, all: true }]), { t: COLLAPSE, call: 'collapse', all: true }, { t: COLLAPSE + .05, call: 'crown', all: true }],
  calls: {
    dig: (m, ctx) => { quakeFx(m, ctx); ctx.fx.flash?.('rgba(200,150,80,.35)', .4); },
    ...Object.fromEntries(spokeDef.map((s, i) => ['smash' + i, (m, ctx, inst) => {
      const a = worldAt(inst, s.t, s.a[0], s.a[1]), b = worldAt(inst, s.t, s.b[0], s.b[1]);
      smashAlong(m, a.x, a.z, b.x, b.z, 3.2);
    }])),
    collapse(m, ctx, inst) { quakeFx(m, ctx); smashPillars(m, inst.origin.x, inst.origin.z, 7); ctx.fx.flash?.('rgba(255,200,120,.5)', .4); },
    crown: slagCall(COLLAPSE + .05, Array.from({ length: 6 }, (_, i) => [Math.sin(i * Math.PI / 3) * 9, Math.cos(i * Math.PI / 3) * 9, 2.2]), { secs: 3.4 }),
  },
  pose: track([[0, {}], [.5, { ...CROUCH, bodyY: -1.1, wing: 20 }], [1.5, { bodyY: -2.4, bodyPitch: 6, head: 28, wing: -10, wingFold: 1, boiler: 1 }], [COLLAPSE - .4, { bodyY: -2.4, bodyPitch: 6, head: 28, wingFold: 1, boiler: 1 }], [COLLAPSE, { bodyY: .4, bodyPitch: -22, head: -30, jaw: 80, wing: 60, foreL: -50, foreR: -50, boiler: 1 }], [COLLAPSE + .3, { ...SLAM, wing: -30 }], [COLLAPSE + .8, { ...EXPOSE, bodyY: -.65 }], [12.6, EXPOSE], [13.2, {}]]),
});

// ---------------------------------------------------------------- AI glue
const SIGNATURES = [meteor.id, worldBreak.id, whirl.id, hail.id];
const ROLLERS = [roll.id, charge.id];
const press = (atk, w, cond) => [
  { atk, w, cond }, { atk, w: w * .7, cond: (m, d) => m.phase >= 1 && (!cond || cond(m, d)) },
  { atk, w: w * .8, cond: (m, d) => m.phase >= 2 && (!cond || cond(m, d)) },
];
const rolling = (m) => (m._rollRun ?? 0) < 2;
const ahead = (m) => front(m);
const elements = { fire: 20, shock: 0, blast: 25 };
const BROKEN = { shoulder: 1.3, club: 1 };
const factorOf = (m, part) => {
  let f = part.broken ? (BROKEN[part.id] ?? Math.max(0, part.baseFactor - .1)) : part.baseFactor;
  if (part.id !== 'head') {
    if ((m._exposedT ?? 0) > 0 && (part.id === 'chest' || part.id === 'body')) f *= FEL.EXPOSED_FACTOR;
    else if ((m.armor ?? FEL.ARMOR_MAX) >= FEL.ARMOR_OPEN && !part.broken) f *= FEL.ARMOR_FACTOR;
  }
  return f + (m._fb ?? 0);
};
/** Crash (host decision): he tumbles, loses armour and shows his core. */
export function crash(m) {
  m._interrupt(); m._chainBreak(); m.queued = null;
  m.stagT = Math.max(m.stagT, FEL.CRASH_TIME); m.recover = Math.max(m.recover, FEL.CRASH_TIME);
  m.armor = Math.max(0, (m.armor ?? FEL.ARMOR_MAX) - FEL.CRASH_ARMOR); m._exposedT = FEL.EXPOSED_SECS; m._crashT = FEL.CRASH_TIME;
  m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
  m.ctx.fx.number?.({ x: m.pos.x, y: m.pos.y + FELS_SCALE * 3, z: m.pos.z }, 'KERN BLOSS!', 'weak');
  m.ctx.fx.shake?.(.5, .5);
}
export const felsengroll = {
  id: 'felsengroll', name: 'Felsengroll', hp: 24000, scale: FELS_SCALE, bodyRadius: 3,
  cueParts: ['chest', 'valve'], cueIntensity: .35,
  walk: 3.8, run: 6.5, turn: 1.8, detect: 40, prefer: 8, apexZones: [3, 2, 1],
  drops: ['felsengroll_panzer', 'felsengroll_schlacke', 'felsengroll_schweif', 'felsengroll_kern'],
  poseDefaults: REST, locomotionPose: poseFelsengrollPresence,
  build: buildFelsengroll, stamina: true, flinchDmg: 1e9, chainMax: 3, teachAttack: roll.id,
  glitchSpots: ['shoulder', 'club'],
  recoverAfter: (m) => [1.6, 1.45, 1.7][m?.phase ?? 0] ?? 1.1, // Kurve Okt 2026: war 2,3 / 2,1 / 2,5 (Ketten brachen zu oft ab: null-Gewicht 16 -> 8); Rhythmus bleibt schwer (~15/min, Pyrostur ~21)
  attackTempo: (m) => (m.phase >= 2 ? 1.08 : 1),
  cover: (m, from, p) => covered(m, from, p.pos),
  parts: [
    { id: 'head', label: 'Schlackeschädel', factor: 1.1, stunPart: true, blunt: true, spheres: [{ node: 'head', offset: [0, 0, .6], r: .78 }, { node: 'head', offset: [0, -.05, 1.6], r: .68 }] },
    { id: 'chest', label: 'Kernbrust', factor: .85, spheres: [{ node: 'chest', offset: [0, 0, .25], r: .85 }] },
    { id: 'shoulder', label: 'Schulterplatten', factor: .8, breakHp: 1600, spheres: [{ node: 'shoulder', offset: [-.7, .4, 0], r: 1.0 }, { node: 'shoulder', offset: [-.45, 1.1, -.3], r: .8 }] },
    { id: 'club', label: 'Schweifkeule', factor: .9, breakHp: 1300, spheres: [{ node: 'club', offset: [0, 0, -.6], r: 1.25 }] },
    { id: 'wingL', label: 'Basaltflügel links', factor: .7, spheres: [{ node: 'wingL', offset: [.45, -.12, .3], r: .6 }, { node: 'wristL', offset: [0, -.35, .1], r: .5 }] },
    { id: 'wingR', label: 'Basaltflügel rechts', factor: .7, spheres: [{ node: 'wingR', offset: [-.45, -.12, .3], r: .6 }, { node: 'wristR', offset: [0, -.35, .1], r: .5 }] },
    { id: 'body', label: 'Schlackeleib', factor: .8, spheres: [{ node: 'body', offset: [0, 0, -.5], r: 1.2 }, { node: 'tail', offset: [0, -.05, -.7], r: .6 }] },
    { id: 'legs', label: 'Stampfer', factor: .85, spheres: [{ node: 'forelegL', offset: [0, -.45, .1], r: .55 }, { node: 'forelegR', offset: [0, -.45, .1], r: .55 }, { node: 'legL', offset: [0, -.6, 0], r: .55 }, { node: 'legR', offset: [0, -.6, 0], r: .55 }] },
  ].map((p) => ({ elem: elements, ...p })),
  attacks: Object.fromEntries(moves.map((a) => [a.id, a])),
  chains: {
    [bite.id]: [...press(doubleBite.id, 3, ahead), ...press(shoulder.id, 3, ahead), ...press(fist.id, 2, ahead), ...press(head.id, 2, ahead), { atk: null, w: 8 }],
    [doubleBite.id]: [...press(shoulder.id, 3, ahead), ...press(clubWhip.id, 2), ...press(kickback.id, 2, ahead), { atk: null, w: 8 }],
    [shoulder.id]: [...press(clubWhip.id, 3), ...press(rake.id, 2, ahead), ...press(stomper.id, 2), { atk: null, w: 8 }],
    [rake.id]: [...press(bite.id, 3, ahead), ...press(fist.id, 2, ahead), ...press(head.id, 2, ahead), { atk: null, w: 8 }],
    [fist.id]: [...press(kickback.id, 3, ahead), ...press(stomper.id, 3), { atk: null, w: 8 }],
    [head.id]: [...press(bite.id, 2, ahead), ...press(rake.id, 2, ahead), { atk: null, w: 8 }],
    [clubWhip.id]: [...press(stomper.id, 3), ...press(roll.id, 3), ...press(kickback.id, 2, ahead), { atk: null, w: 8 }],
    [wingSlam.id]: [...press(clubWhip.id, 3), ...press(rake.id, 2, ahead), { atk: null, w: 8 }],
    [stomper.id]: [...press(hop.id, 3), ...press(rift.id, 2), ...press(roll.id, 3), { atk: null, w: 8 }],
    // Up to three rolling curves, each re-aimed at where the hunter is NOW.
    [roll.id]: [{ atk: roll.id, w: 7, cond: rolling }, { atk: roll.id, w: 4, cond: (m) => rolling(m) && m.phase >= 1 }, ...press(fist.id, 3, ahead), ...press(wingSlam.id, 2), ...press(stomper.id, 2), { atk: null, w: 5 }],
    [hop.id]: [...press(bite.id, 3, ahead), ...press(rake.id, 2, ahead), ...press(roll.id, 3), { atk: null, w: 8 }],
    [kickback.id]: [...press(stomper.id, 3), ...press(rift.id, 3), ...press(hurl.id, 2), ...press(spit.id, 2), { atk: null, w: 8 }],
    [charge.id]: [...press(head.id, 3, ahead), ...press(shoulder.id, 2, ahead), ...press(stomper.id, 2), { atk: null, w: 8 }],
    [rift.id]: [...press(roll.id, 3), ...press(hop.id, 2), ...press(stomper.id, 2), { atk: null, w: 8 }],
    [fault.id]: [...press(roll.id, 3), { atk: null, w: 8 }],
    [spit.id]: [...press(roll.id, 3), ...press(hurl.id, 2), ...press(rift.id, 2), { atk: null, w: 8 }],
    [hurl.id]: [...press(roll.id, 3), ...press(stomper.id, 2), { atk: null, w: 8 }],
    // Fresh pillars are bait and cover at once: he follows up with a roll or a quake ring at the shooter.
    [pillarsMove.id]: [...press(roll.id, 4), ...press(stomper.id, 2), { atk: stomper.id, w: 6, cond: (m, d) => d > 9 }, { atk: null, w: 8 }],
  },
  phases: [
    { at: .65, name: 'FLÜSSIGER BERG — Der Fels erwacht', cue: cue(), special: worldBreak.id, enter(m) { m.armor = FEL.ARMOR_MAX; m.cds[meteor.id] = 0; } },
    { at: .3, name: 'LAVAADER — Der letzte Erdrutsch', cue: cue(), special: worldBreak.id, enter(m) { m.armor = FEL.ARMOR_MAX; m.cds[meteor.id] = 0; } },
  ],
  init(m) {
    m.armor = FEL.ARMOR_MAX; m._exposedT = 0; m._crashT = 0; m._felsHistory = []; m._farT = 0; m._hugT = 0; m._rollRun = 0; m._rolling = false;
    for (const key of Object.keys(REST)) { m.pose[key] ??= REST[key]; m._tgt[key] ??= REST[key]; }
  },
  tick(m, dt) {
    tickHazards(m);
    tickPillars(m);
    updateFelsengrollFx(m);
    const a = m.attack;
    if (!a && m.air > 0 && m.alive) { m.air = Math.max(0, m.air - 16 * dt); m.pos.y = (m.ctx.world?.heightAt?.(m.pos.x, m.pos.z) ?? 0) + m.air; }
    // Part factors follow the armour: armoured plates, open seams below 30, bare core while exposed.
    for (const part of m.parts) part.factor = factorOf(m, part);
    m.pressure = Math.max(0, 100 - (m.armor ?? FEL.ARMOR_MAX)); // drives the vent glow of the shared furnace fx
    // Rolls and the ram smash into pillars: deterministic on every client, the consequences are the host's.
    const crashes = a && ROLLERS.includes(a.id) ? a.inst.def.crash : null;
    m._rolling = !!crashes;
    if (crashes) {
      const tau = a.inst.sample(a.t).tau;
      if (tau >= crashes[0] && tau <= crashes[1]) {
        const touched = pillarsTouching(m, m.pos.x, m.pos.z, FEL.BODY);
        if (touched.length) { for (const p of touched) breakPillar(m, p); if (m.authority) crash(m); }
      }
    }
    if (!m.authority) return;
    m._exposedT = Math.max(0, (m._exposedT ?? 0) - dt);
    m._crashT = Math.max(0, (m._crashT ?? 0) - dt);
    if (!a && m.stagT <= 0 && m.state === 'combat') m.armor = Math.min(FEL.ARMOR_MAX, (m.armor ?? 0) + dt * (m.phase >= 2 ? FEL.ARMOR_REGEN_LAVA : FEL.ARMOR_REGEN));
    if (m.state !== 'combat') return;
    const d = m.target ? Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) : 0;
    m._farT = d > 12 ? (m._farT ?? 0) + dt : Math.max(0, (m._farT ?? 0) - dt * 2);
    m._hugT = d < 5 ? (m._hugT ?? 0) + dt : Math.max(0, (m._hugT ?? 0) - dt * 2);
    // The fortress fight needs its terrain: pillars are guaranteed, never left to the dice.
    // Weltenbruch is his signature: both state changes plus a timed repeat (2-3 per hunt).
    if (a || m.queued || m.chainNext || m.phaseSpecial || m.phaseT > 0 || m.tired) return;
    const live = m.extra.pillars?.filter((p) => !p.dead).length ?? 0;
    if (m.phase >= 1 && (m.cds[worldBreak.id] ?? 0) <= 0) m.queued = worldBreak.id;
    else if (live < 2 && (m.cds[pillarsMove.id] ?? 0) <= 0 && (m._combatT ?? 0) > 3) m.queued = pillarsMove.id;
  },
  poseHook(m, p) {
    for (const key of Object.keys(REST)) if (!Number.isFinite(p[key])) p[key] = REST[key];
    const open = (m.armor ?? FEL.ARMOR_MAX) < FEL.ARMOR_OPEN || (m._exposedT ?? 0) > 0;
    if (!m.attack) {
      if (m.state === 'dead' || m.sleeping || m.stunT > 0 || m.trapped || m.blind) return;
      if (m.state === 'notice' || m.state === 'enrage') {
        const rise = Math.sin(Math.min(1, m.stateT / 1.4) * Math.PI);
        p.bodyPitch = -rise * 16; p.wing = 8 + rise * 20; p.jaw = rise * 55; p.boiler = rise; p.foreL = p.foreR = -rise * 24;
        return;
      }
      if ((m._crashT ?? 0) > 0) { p.bodyY = -.5; p.bodyRoll = 62; p.bodyPitch = 12; p.head = 20; p.foreL = -50; p.foreR = 20; p.hindL = -30; p.hindR = 30; p.wing = 30; p.boiler = 1; return; }
      if (m.stagT > 0 || m.tired) { p.bodyY = -.55; p.head = 16; p.neck = 0; p.foreL = p.foreR = -4; p.wing = 6; p.boiler = 1; return; }
    }
    if (open) p.boiler = 1;
    if (m.extra.shoulder) m.extra.shoulder.visible = !broken(m, 'shoulder');
    if (m.extra.club) m.extra.club.visible = !broken(m, 'club');
  },
  onDamage(m, res) {
    if (m.authority && res.dmg > 0) m.armor = Math.max(0, (m.armor ?? FEL.ARMOR_MAX) - res.dmg * .012);
  },
  onBreak(m, part) {
    part.factor = factorOf(m, part);
    if (part.id === 'shoulder') {
      if (m.extra.shoulder) m.extra.shoulder.visible = false;
      m.armor = Math.max(0, (m.armor ?? 0) - 20);
      // A plate torn off mid-roll throws him over.
      if (m._rolling && m.authority) crash(m);
    }
    if (part.id === 'club') {
      if (m.extra.club) m.extra.club.visible = false;
      m.chainNext = null; m.armor = Math.max(0, (m.armor ?? 0) - 15);
    }
  },
  hitDmgMul: (m, h) => (broken(m, 'shoulder') && h === shoulder.hits[0] ? .65 : 1),
  onGlitchCounter(m, id) {
    if (id !== meteor.id) return;
    m._interrupt(); m.chainNext = null; m.queued = null; m.stunT = Math.max(m.stunT, 2.5); m.recover = 1.5;
  },
  onAttackEnd(m, id) {
    if (!id.startsWith('felsengroll_')) return;
    if (!m.authority) return;
    m._felsHistory = [...(m._felsHistory ?? []), id].slice(-4);
    m._rollRun = id === roll.id && m.chainNext ? (m._rollRun ?? 0) + 1 : 0;
    if (SIGNATURES.includes(id)) m.chainNext = null;
    if (id === worldBreak.id) m.armor = 40;
  },
  snapExtra: (m) => ({ armor: Math.round(m.armor ?? 0), exposed: Math.round((m._exposedT ?? 0) * 10) / 10 }),
};
