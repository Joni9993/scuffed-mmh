// Pyrostur, the furnace elder: an apex predator built on pressure and fire.
// Every impact is an animated, deterministic AttackInstance; lingering fire and shock rings
// come only from replicated attack events (pyrosturHazards.js). Design: docs/PYROSTUR_ELDER_REWORK.md
import { compileTrack } from '../anim.js';
import { MREST } from './monster.js';
import { smooth, clamp01 } from './common.js';
import { localToWorld, angleDiff, yawOf } from '../../core/math.js';
import { buildPyrostur } from './pyrosturRig.js';
import { updatePyrosturFx } from './pyrosturFx.js';
import { posePyrosturPresence } from './pyrosturMotion.js';
import { addScorch, addRing, tickHazards, GLUTBRAND, SCALD } from './pyrosturHazards.js';
export { buildPyrostur } from './pyrosturRig.js';

const SC = 1.65;
export const PYRO = {
  COUNTER_DAMAGE: 420, COUNTER_TIME: 3.2, COUNTER_OPEN: .9, COUNTER_CLOSE: 2.9, ERUPTION: 3.2, PRESSURE_MAX: 100,
  // Glutrausch: at full pressure he hunts faster and chains harder until he must vent.
  OVERHEAT_SECS: 16, OVERHEAT_TEMPO: 1.15, CRASH_TIME: 4,
};
const REST = { ...MREST, bodyYaw: 0, wingL: 0, wingR: 0, elbowL: 0, elbowR: 0, wristL: 0, wristR: 0, tailCurl: 0, neckYaw: 0, headReach: 0, foreL: 0, foreR: 0, hindL: 0, hindR: 0, boiler: 0,
  foreKneeL: 0, foreKneeR: 0, foreAnkleL: 0, foreAnkleR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0 };
// Every key exists from frame zero; empty recovery frames genuinely return to rest.
const track = (frames) => compileTrack(frames.map(([t, pose, mode]) => {
  const p = { ...REST, ...pose };
  // Limit the complete neck chain: the crown clears the floor and an upward
  // roar extends the neck without folding the skull backwards through its spine.
  const maxPitch = p.bodyY < -.1 ? 14 : 22;
  const chainPitch = p.bodyPitch + p.neck * 180 / Math.PI;
  p.head = Math.max(-60 - chainPitch, Math.min(p.head, maxPitch - chainPitch));
  return [t, p, mode];
}), REST);
const cue = (tone = 'brumm') => ({ color: '#ffad62', tone });
const localTarget = (m) => {
  const p = m.target?.pos; if (!p) return { x: 0, z: 1, d: 1 };
  const x = p.x - m.pos.x, z = p.z - m.pos.z;
  return { x: Math.cos(m.rot) * x - Math.sin(m.rot) * z, z: Math.sin(m.rot) * x + Math.cos(m.rot) * z, d: Math.hypot(x, z) };
};
const lateral = (m) => { const p = localTarget(m); return Math.abs(p.x) > p.d * .62; };
const behind = (m) => localTarget(m).z < 0;
const front = (m) => !behind(m) && !lateral(m);
const hot = (m) => (m?.overheat ?? 0) > 0;
// Replicated: tempoMul > 1 is only ever sent while overheated, so guests know it too.
const hotInst = (inst) => (inst.params.tempoMul ?? 1) > 1.05;
const hit = (t, at, radius, dmg, knock = 'down', extra) => ({ t0: t, t1: t + .13, shape: 'sphere', at, radius, dmg, knock, ...extra });
const line = (t, from, to, radius, dmg, end = t + .13, extra) => ({ t0: t, t1: end, shape: 'capsule', from, to, radius, dmg, knock: 'down', ...extra });
const FIRE = { status: GLUTBRAND };
const impact = (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + .5, z: m.pos.z }, 12, '#ffab65', 5); ctx.fx.shake(.22, .23); };
const quake = (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.bus.emit('sfx', { name: 'pyroRoar', pos: m.pos }); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + .5, z: m.pos.z }, 30, '#ff7a2a', 9); ctx.fx.shake(.5, .45); };
const prepareAdvance = (max, stop = 3.6, min = 0) => (a) => { a.len = Math.max(min, Math.min(max, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - stop)); };
const advance = (t, a, start, span, side = 0) => { const k = smooth(clamp01((t - start) / span)); return { x: a.origin.x + (a.dir.x * a.len + a.dir.z * side) * k, z: a.origin.z + (a.dir.z * a.len - a.dir.x * side) * k }; };
/** World point of a monster-local offset at attack time tau (pure: params only). */
const worldAt = (inst, tau, lx, lz) => { const s = inst.sample(inst.wall(tau)); return localToWorld({}, { x: s.x, y: 0, z: s.z }, s.yaw, lx, 0, lz); };
/** `all` event call: scorch the ground at monster-local points sampled at tau. */
const scorchCall = (tau, points, opts = {}) => (m, ctx, inst, age) => {
  for (const [lx, lz, r] of points) { const w = worldAt(inst, tau, lx, lz); addScorch(m, w.x, w.z, { ...opts, r: r ?? opts.r, age, key: `${inst.key}:s${lx},${lz}` }); }
};

const CROUCH = { bodyY: -.45, bodyPitch: 9, head: 26, neck: .12, wing: 15, elbowL: 10, elbowR: 10, foreL: 0, foreR: 0, hindL: 25, hindR: 25, tailPitch: -10 };
const EXPOSE = { bodyY: -.5, bodyPitch: 6, head: 10, neck: 0, jaw: 35, wing: 12, elbowL: 12, elbowR: 12, foreL: -5, foreR: -5, hindL: 18, hindR: 18 };
// Predator vocabulary: a low coiled spring, a spread airborne strike, a planted landing.
const COIL = { bodyY: -.58, bodyPitch: 13, head: 30, neck: .16, jaw: 25, wing: 22, elbowL: 15, elbowR: 15, foreL: 12, foreR: 12, hindL: 32, hindR: 32, tailPitch: 22 };
const LEAP = { bodyY: .1, bodyPitch: -8, head: 14, neck: -.05, jaw: 62, wing: 62, spread: 1, elbowL: -30, elbowR: -30, foreL: -72, foreR: -72, hindL: -50, hindR: -50, tailPitch: 4 };
const LAND = { bodyY: -.42, bodyPitch: 15, head: 20, neck: .1, jaw: 30, wing: -22, foreL: 38, foreR: 38, hindL: 22, hindR: 22, tailPitch: -6 };
const FLAP_UP = { wing: 78, spread: 1, elbowL: -38, elbowR: -38, wristL: -12, wristR: -12, foreL: -30, foreR: -30, hindL: -25, hindR: -25, bodyPitch: -10 };
const FLAP_DOWN = { wing: -42, spread: 1, elbowL: 22, elbowR: 22, wristL: 10, wristR: 10, foreL: -30, foreR: -30, hindL: -25, hindR: -25, bodyPitch: -4 };
// The crown lifts away from the furnace rather than covering the counter target.
const PRESSURE_OPEN = { bodyY: -.3, bodyPitch: -8, head: -18, neck: -.18, jaw: 70, foreL: -10, foreR: -10, wing: 55, boiler: 1 };

const moves = [];
const attack = (name, config) => {
  const id = 'pyrostur_' + name, baseWeight = config.weight ?? 4;
  const def = { id, range: [0, 16], cooldown: 4, telegraph: .8, duration: 2.2, stam: 5, tgVar: false, markerFromHits: true,
    cue: cue(), flashParts: ['head'], audit: [4], vfx: 'slam', ...config,
    weight: (m, d) => {
      const raw = typeof baseWeight === 'function' ? baseWeight(m, d) : baseWeight;
      const recent = m._pyroHistory ?? [];
      return raw * (recent.at(-1) === id ? .03 : recent.includes(id) ? .2 : 1);
    },
  };
  def.events ??= [...new Set(def.hits.map((h) => h.t0))].map((t) => ({ t, call: 'impact', all: true }));
  def.flashParts = def.flashParts.filter((p) => p === 'valve');
  def.markerLead = ['pressure', 'rain', 'breath', 'steam', 'dive'].includes(def.vfx) ? 1 : .55;
  def.calls = { impact, quake, ...def.calls };
  for (const h of def.hits) h.group ??= `impact:${h.t0}`;
  moves.push(def); return def;
};

// ---------------------------------------------------------------- quick predator strikes
const bite = attack('zange', {
  range: [0, 7], weight: 7, cond: front, cooldown: 2.5, telegraph: .62, duration: 1.55, audit: [3, 6], vfx: 'charge',
  prepare: prepareAdvance(3.5), motion(t, a) { return advance(t, a, .48, .2); },
  // A light, fast jaw snap only flinches: the follow-up is the real threat.
  hits: [line(.66, [-1.05, 1.3, 3.5], [1.05, 1.3, 4.6], 1.15, 115, .8, { knock: 'flinch' })],
  pose: track([[0, {}], [.4, { ...CROUCH, head: -20, jaw: 72, neck: -.2, headReach: -.25 }], [.6, { ...CROUCH, head: -20, jaw: 78, neck: -.2 }], [.7, { bodyPitch: 12, head: 28, neck: .3, jaw: 0, headReach: .7, foreL: -30, foreR: -30 }], [.95, { bodyPitch: 6, head: 12, jaw: 14 }], [1.55, {}]]),
});
const uppercut = attack('hornbrecher', {
  range: [0, 6.5], weight: 5, cond: front, cooldown: 4, telegraph: .78, duration: 1.95, audit: [3, 6], vfx: 'charge',
  prepare: prepareAdvance(3), motion(t, a) { return advance(t, a, .7, .25); },
  hits: [line(.8, [-.6, 1.2, 3.3], [-.6, 2.6, 5.9], 1, 180), line(.8, [.6, 1.2, 3.3], [.6, 2.6, 5.9], 1, 180), line(.8, [0, 1, 3], [0, 2.5, 4.5], 1.1, 150)],
  pose: track([[0, {}], [.55, { ...CROUCH, bodyY: -.38, head: 26, neck: .15, headReach: -.15, bodyPitch: 13 }], [.77, { ...CROUCH, bodyY: -.38, head: 26, neck: .15, bodyPitch: 13 }], [.9, { bodyY: .25, bodyPitch: -10, head: -12, neck: -.05, headReach: .5, foreL: -35, foreR: -35, jaw: 25 }], [1.3, { ...EXPOSE, bodyY: -.25 }], [1.95, {}]]),
});
// Full 360° scythe of the tail: hugging the elder anywhere is never free.
const scythe = attack('sichelschweif', {
  range: [0, 7.5], weight: (m) => (behind(m) || lateral(m) ? 8 : 2.5), noFace: true, cooldown: 4, telegraph: .7, duration: 1.95, audit: [0, 3], flashParts: ['tail'],
  motion(t, a) { return { yaw: a.yaw0 - .55 * smooth(clamp01(t / .6)) + (Math.PI * 2 + .55) * smooth(clamp01((t - .7) / .45)) }; },
  hits: [line(.72, [0, .85, -1.8], [0, .75, -7.4], 1.25, 160, 1.14)],
  pose: track([[0, {}], [.6, { ...CROUCH, bodyRoll: -14, bodyYaw: -12, tailYaw: 34, tailCurl: -16, wing: 28, foreL: 20 }], [.9, { bodyY: -.25, bodyRoll: 12, tailYaw: -28, tailPitch: -8, wing: 42, spread: 1 }], [1.15, { bodyY: -.3, bodyRoll: 16, tailYaw: -12, wing: 30 }], [1.45, { ...EXPOSE, bodyY: -.3 }], [1.95, {}]]),
});
// Nargacuga-style hunting leap. Chains into itself and re-aims on every hop.
const leap = attack('glutsprung', {
  range: [4, 20], weight: (m, d) => (d > 7 ? 9 : 5) * (1 + m.phase * .3), cooldown: 3, telegraph: .6, duration: 1.9, audit: [6, 12, 18], vfx: 'charge', stam: 6,
  prepare: prepareAdvance(15, 2.2, 2),
  motion(t, a) {
    const k = smooth(clamp01((t - .6) / .45)), sway = -.45 * Math.sin(clamp01(t / .6) * Math.PI);
    const fwd = a.len * k + sway;
    return { x: a.origin.x + a.dir.x * fwd, z: a.origin.z + a.dir.z * fwd, air: t > .6 && t < 1.05 ? Math.sin((t - .6) / .45 * Math.PI) * Math.min(2.6, 1 + a.len * .12) : 0 };
  },
  hits: [hit(1.0, [0, .5, 2.4], 2.1, 170), line(1.0, [-1.3, .5, 1.5], [1.3, .5, 3.6], 1.1, 170)],
  events: [{ t: 1.0, call: 'impact', all: true }, { t: 1.02, call: 'scorch', all: true }],
  calls: { scorch: scorchCall(1.02, [[0, 2.6]], { r: 1.9, secs: 5 }) },
  pose: track([[0, {}], [.5, COIL], [.6, { ...COIL, bodyY: -.62 }], [.78, LEAP], [.98, { ...LEAP, foreL: -40, foreR: -40, bodyPitch: 6 }], [1.06, LAND], [1.35, { ...LAND, bodyY: -.25, jaw: 15 }], [1.9, {}]]),
});
// Sidestep to cut the angle, re-aim at the hunter and bite from the flank.
const flank = attack('flankensatz', {
  range: [1.5, 9], weight: (m) => 4 + m.phase * 2, cond: front, cooldown: 4, telegraph: .55, duration: 1.75, audit: [3, 6, 8], vfx: 'charge',
  prepare(a) {
    a.side = a.r(0) < .5 ? -1 : 1;
    a.p1 = { x: a.origin.x + a.dir.z * a.side * 5 + a.dir.x * .8, z: a.origin.z - a.dir.x * a.side * 5 + a.dir.z * .8 };
    a.yaw1 = yawOf(a.target.x - a.p1.x, a.target.z - a.p1.z);
    a.len2 = Math.max(0, Math.min(4, Math.hypot(a.target.x - a.p1.x, a.target.z - a.p1.z) - 3.2));
  },
  motion(t, a) {
    const k1 = smooth(clamp01(t / .42)), k2 = smooth(clamp01((t - .56) / .18));
    const yaw = a.yaw0 + angleDiff(a.yaw0, a.yaw1) * smooth(clamp01(t / .5));
    return { x: a.origin.x + (a.p1.x - a.origin.x) * k1 + Math.sin(a.yaw1) * a.len2 * k2, z: a.origin.z + (a.p1.z - a.origin.z) * k1 + Math.cos(a.yaw1) * a.len2 * k2, yaw, air: Math.sin(k1 * Math.PI) * .55 };
  },
  hits: [line(.7, [-1.1, 1.2, 3.3], [1.1, 1.2, 4.5], 1.2, 150, .84), line(.7, [0, .6, 1.5], [0, .6, 4], 1, 150, .84)],
  pose: track([[0, {}], [.2, { ...COIL, bodyRoll: 18, wingL: 30, wingR: -20, tailYaw: 30 }], [.42, { ...LAND, bodyRoll: -10, jaw: 55, head: -10 }], [.56, { ...CROUCH, jaw: 75, head: -20, neck: -.2 }], [.72, { bodyPitch: 12, head: 28, neck: .3, jaw: 0, headReach: .7, foreL: -40, foreR: -40 }], [1.05, { ...EXPOSE, bodyY: -.25 }], [1.75, {}]]),
});
// Rathalos-style backhop that creates space and torches the spot the hunter stood on.
const backhop = attack('rueckzugsglut', {
  range: [0, 7.5], weight: (m) => 3 + m.phase * 1.5 + (m._hugT > 2.5 ? 4 : 0), cond: front, cooldown: 6, telegraph: .85, duration: 2.2, audit: [3, 7], vfx: 'breath', stam: 6,
  motion(t, a) {
    const k = smooth(clamp01(t / .55));
    return { x: a.origin.x - a.dir.x * 7 * k, z: a.origin.z - a.dir.z * 7 * k, air: t < .55 ? Math.sin(t / .55 * Math.PI) * 1.6 : 0 };
  },
  hits: [line(.85, [0, 1.3, 3], [0, .7, 11], 1.4, 160, 1.05, FIRE), hit(.85, [0, .5, 10], 2.6, 160, 'down', { t1: 1.1, ...FIRE })],
  events: [{ t: .55, call: 'impact', all: true }, { t: .9, call: 'scorch', all: true }],
  calls: { scorch: scorchCall(.9, [[0, 10, 2.7], [0, 6.2, 1.8]], { secs: 8 }) },
  pose: track([[0, {}], [.18, { ...COIL, bodyPitch: -6, wing: 50 }], [.38, { ...FLAP_DOWN, bodyY: .2, jaw: 40, head: -10 }], [.56, { ...LAND, bodyPitch: -6, jaw: 50 }], [.8, { bodyPitch: -12, head: -22, jaw: 80, neck: -.14, boiler: 1, wing: 30 }], [.92, { bodyPitch: 12, head: 19, neck: .18, headReach: .3, jaw: 75, wing: -10 }], [1.15, { head: 20, jaw: 60, bodyPitch: 10 }], [1.6, { ...EXPOSE, bodyY: -.3 }], [2.2, {}]]),
});

// ---------------------------------------------------------------- body control
const wing = attack('kesselfluegel', {
  range: [0, 5.5], weight: 4, cooldown: 5, telegraph: .85, duration: 2.05, audit: [2, 4],
  // Separate forelegs: claws drive the ground impact while the wings flare overhead.
  hits: [line(.95, [-2.7, .65, 2.5], [2.7, .65, 2.5], 1.2, 165)],
  pose: track([[0, {}], [.6, { bodyY: .18, bodyPitch: -14, wing: 30, spread: 1, elbowL: -15, elbowR: -15, foreL: -55, foreR: -55 }], [.84, { bodyY: .22, wing: 35, bodyPitch: -18, foreL: -60, foreR: -60 }], [.96, { bodyY: -.15, bodyPitch: 8, wing: 12, foreL: 12, foreR: 12 }], [1.4, EXPOSE], [2.05, {}]]),
});
const tail = attack('schlackenschweif', {
  range: [0, 8], weight: 6, noFace: true, cond: behind, cooldown: 4, duration: 2.3, telegraph: .82, flashParts: ['tail'], audit: [0],
  hits: [line(.84, [0, .85, -2], [0, .85, -6.8], 1.3, 175, 1.25)],
  motion(t, a) { return { yaw: a.yaw0 - 1.1 * smooth(clamp01(t / .7)) + 2.2 * smooth(clamp01((t - .8) / .45)) }; },
  pose: track([[0, {}], [.65, { bodyY: -.2, bodyRoll: -15, bodyYaw: -15, tailPitch: -10, tailCurl: -10, wingL: 35, foreL: 30 }], [.8, { bodyY: -.2, bodyRoll: -15, tailPitch: -12 }], [1.15, { bodyY: -.2, bodyRoll: 17, bodyYaw: 18, tailPitch: -12, wingR: 35, foreR: 35 }], [1.6, EXPOSE], [2.3, {}]]),
});
const vent = attack('seitenablass', {
  range: [0, 8.5], weight: (m) => 3 + (m.pressure ?? 0) / 25, noFace: true, cond: lateral, cooldown: 6, telegraph: .9, duration: 2.35, flashParts: ['valve', 'chest'], lockedByBreak: 'valve', audit: [0], vfx: 'steam',
  hits: [line(.95, [-2, .9, 0], [-7.4, .9, 0], 1.25, 150, 1.12, { status: SCALD }), line(.95, [2, .9, 0], [7.4, .9, 0], 1.25, 150, 1.12, { status: SCALD })],
  pose: track([[0, {}], [.6, { ...CROUCH, wing: 45, boiler: .9, bodyRoll: -12, jaw: 20 }], [.88, { ...CROUCH, wing: 55, boiler: 1, bodyRoll: -12 }], [1, { bodyY: -.3, bodyRoll: 16, wing: 20, jaw: 50, head: -12 }], [1.6, EXPOSE], [2.35, {}]]),
});
const leak = attack('leckablass', {
  range: [0, 7], weight: 5, noFace: true, cond: (m) => lateral(m) && localTarget(m).x > 0, cooldown: 6, telegraph: .9, duration: 2.35, flashParts: ['valve'], needsBroken: 'valve', audit: [0], vfx: 'steam',
  hits: [line(.95, [2, .9, 0], [6.2, .9, 0], 1.15, 105, 1.12, { status: SCALD })], pose: vent.pose,
});
const breath = attack('ofenschneise', {
  range: [6, 22], weight: (m, d) => d > 11 ? 6 : 3, cooldown: 6, duration: 2.75, audit: [8, 15, 20], telegraph: 1, vfx: 'breath',
  hits: [line(1.05, [0, 1.1, 4.1], [0, .7, 21], 1.55, 195, 1.55, FIRE)],
  events: [{ t: 1.05, call: 'impact', all: true }, { t: 1.2, call: 'scorch', all: true }],
  calls: { scorch: scorchCall(1.2, [[0, 8], [0, 13], [0, 18]], { r: 2, secs: 7 }) },
  pose: track([[0, {}], [.7, { bodyPitch: -12, head: -22, jaw: 65, neck: -.14, wing: 25, boiler: 1, foreL: -18, foreR: -18 }], [.98, { head: -22, jaw: 80, bodyPitch: -12, boiler: 1 }], [1.08, { bodyPitch: 12, head: 19, neck: .18, headReach: .3, jaw: 70, wing: -10 }], [1.55, { head: 23, jaw: 70, bodyPitch: 12, foreL: 28, foreR: 28 }], [2.05, EXPOSE], [2.75, {}]]),
});
// Beam sweep: roll through the flame wall or get behind it. Both edges stay burning.
const whip = attack('flammenpeitsche', {
  range: [3, 15], weight: 6, phase: 1, cooldown: 9, telegraph: 1, duration: 2.95, audit: [6, 10, 14], vfx: 'breath', stam: 9,
  motion(t, a) { return { yaw: a.yaw0 - 1.2 * smooth(clamp01(t / .9)) + 2.4 * clamp01((t - 1) / .9) }; },
  hits: [line(1, [0, 1.1, 3.2], [0, .6, 15.5], 1.4, 185, 1.9, { ...FIRE, noCollapse: true, fpSamples: 16 })],
  events: [{ t: 1, call: 'impact', all: true }, { t: 1.15, call: 'edgeA', all: true }, { t: 1.5, call: 'edgeB', all: true }, { t: 1.85, call: 'edgeC', all: true }],
  calls: { edgeA: scorchCall(1.15, [[0, 12]], { r: 2.1 }), edgeB: scorchCall(1.5, [[0, 12]], { r: 2.1 }), edgeC: scorchCall(1.85, [[0, 12]], { r: 2.1 }) },
  pose: track([[0, {}], [.7, { ...CROUCH, head: -18, jaw: 70, neck: -.14, boiler: 1, bodyRoll: -8, headYaw: -18 }], [.98, { bodyPitch: -10, head: -20, jaw: 82, boiler: 1, headYaw: -20 }], [1.08, { bodyPitch: 10, head: 18, neck: .16, headReach: .3, jaw: 75, headYaw: -10, wing: 20 }], [1.5, { bodyPitch: 10, head: 18, jaw: 78, headYaw: 6, bodyRoll: 6, wing: 25 }], [1.9, { bodyPitch: 10, head: 18, jaw: 72, headYaw: 16, bodyRoll: 10 }], [2.3, EXPOSE], [2.95, {}]]),
});
const charge = attack('kesselramme', {
  range: [7, 24], weight: (m, d) => (d > 12 ? 9 : 4) * (1 + (m._farT ?? 0) / 3), cooldown: 5, telegraph: .95, duration: 2.6, flashParts: ['head', 'chest'], audit: [8, 15, 21], vfx: 'charge',
  prepare: prepareAdvance(19, 1.5), motion(t, a) { return advance(t, a, .94, .72); },
  hits: [line(1, [-1.1, 1, 2.1], [1.1, 1, 4], 1.35, 200, 1.68), line(1, [-.8, 1.1, 4.3], [.8, 1.1, 6], 1.05, 200, 1.68)],
  // Overheated, the furnace leaves a burning wake along the whole charge path.
  events: [{ t: 1, call: 'impact', all: true }, { t: 1.7, call: 'wake', all: true }],
  calls: { wake(m, ctx, inst, age) { if (!hotInst(inst)) return; for (const f of [.25, .55, .85]) { const s = inst.sample(inst.wall(.94 + .72 * f)); addScorch(m, s.x, s.z, { r: 1.9, secs: 6, age, key: `${inst.key}:w${f}` }); } } },
  pose: track([[0, {}], [.65, { ...CROUCH, head: 35, neck: .2, wing: -30, jaw: 10, tailPitch: 15 }], [.93, { ...CROUCH, head: 35, neck: .2, tailPitch: 18 }], [1.05, { bodyPitch: 16, head: 32, neck: .25, wing: 15, foreL: -45, foreR: -45, hindL: -40, hindR: -40 }], [1.35, { bodyPitch: 8, head: 30, wing: 5, foreL: 40, foreR: 40, hindL: 35, hindR: 35 }], [1.72, { ...EXPOSE, bodyPitch: 18, wing: 45, foreL: 55, foreR: 55 }], [2.6, {}]]),
});
const pounces = [-1, 1].map((side) => attack(side < 0 ? 'glutpirsch_links' : 'glutpirsch_rechts', {
  range: [4, 19], weight: (m, d) => (d > 7 ? 6 : 3) * (m.phase > 0 ? 1.3 : 1), cooldown: 6, telegraph: .8, duration: 2.5, audit: [5, 10, 16], vfx: 'charge',
  prepare(a) { a.len = Math.max(1.5, Math.min(15, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 2.8)); },
  motion(t, a) {
    const wind = smooth(clamp01(t / .6)), jump = smooth(clamp01((t - .8) / .5));
    const offset = side * 3.2 * wind * (1 - jump), fwd = a.len * jump;
    return { x: a.origin.x + a.dir.x * fwd + a.dir.z * offset, z: a.origin.z + a.dir.z * fwd - a.dir.x * offset, air: t > .8 && t < 1.3 ? Math.sin(clamp01((t - .8) / .5) * Math.PI) * .95 : 0 };
  },
  hits: [line(.95, [-1.25, .45, 2], [1.25, .45, 4.2], 1.25, 180, 1.34)],
  pose: track([[0, {}], [.5, { ...CROUCH, bodyRoll: side * 20, bodyYaw: side * -20, wingL: side * 35, wingR: side * -35, headYaw: side * -20, tailYaw: side * 35 }], [.8, { ...CROUCH, bodyRoll: side * 16, tailPitch: 20, head: 25 }], [1, { bodyPitch: 10, wing: 45, foreL: -65, foreR: -65, hindL: -45, hindR: -45, tailPitch: 10, jaw: 50 }], [1.34, { ...EXPOSE, bodyPitch: 23, foreL: 65, foreR: 65, wing: -25 }], [2.5, {}]]),
}));
const doubleTail = attack('ambossschweif', {
  range: [0, 8.5], weight: 6, noFace: true, cond: behind, phase: 1, cooldown: 8, telegraph: .95, duration: 3.2, audit: [0], flashParts: ['tail'],
  hits: [line(1.02, [0, .6, -2.2], [0, .6, -7], 1.25, 160), line(1.9, [-.8, .6, -3], [.8, .6, -7.3], 1.65, 210)],
  pose: track([[0, {}], [.72, { bodyPitch: 8, tailPitch: 65, tailCurl: -20, wing: 30, foreL: 40, foreR: 40 }], [.94, { bodyPitch: 8, tailPitch: 70, wing: 30 }], [1.05, { bodyPitch: -9, tailPitch: -8, wing: -15 }], [1.6, { bodyPitch: 10, tailPitch: 75, wing: 45, tailCurl: -20 }], [1.92, { bodyPitch: -12, tailPitch: 5, bodyY: -.3, wing: -25 }], [2.5, EXPOSE], [3.2, {}]]),
});
const brake = attack('schlackenbremse', {
  range: [6, 22], weight: 5, cooldown: 9, phase: 1, telegraph: 1, duration: 3.6, audit: [8, 14, 20], flashParts: ['head', 'chest'], vfx: 'breath',
  prepare: prepareAdvance(14, 6), motion(t, a) { return advance(t, a, .98, .55); },
  hits: [line(1.05, [-1, 1, 2], [1, 1, 3.8], 1.25, 175, 1.5), line(2.15, [-5, .7, 5.3], [5, .7, 5.3], 1.5, 210, 2.28, FIRE)],
  pose: track([[0, {}], [.75, { ...CROUCH, head: 35, tailPitch: 20 }], [.99, { ...CROUCH, head: 35, tailPitch: 20 }], [1.15, { bodyPitch: 15, head: 30, foreL: -40, foreR: -40, hindL: -40, hindR: -40 }], [1.55, { bodyPitch: -12, wing: 65, head: -20, jaw: 75, foreL: 65, foreR: 65, boiler: 1 }], [2.02, { bodyPitch: -12, head: -20, jaw: 80, wing: 45, boiler: 1 }], [2.2, { bodyPitch: 14, head: 25, jaw: 80, wing: -15 }], [2.8, EXPOSE], [3.6, {}]]),
});
const fan = attack('glutfessel', {
  range: [0, 12], weight: 5, cooldown: 10, phase: 2, telegraph: 1, duration: 3.4, audit: [3, 7, 10], flashParts: ['head', 'chest'], vfx: 'breath',
  // A deliberate two-sided fan leaves the central approach open; hugging either wing is punished.
  hits: [line(1.1, [-1.4, 1, 3], [-8, .6, 9], 1.5, 190, 1.23, FIRE), line(1.95, [1.4, 1, 3], [8, .6, 9], 1.5, 200, 2.08, FIRE)],
  pose: track([[0, {}], [.75, { ...CROUCH, headYaw: 38, neckYaw: 25, jaw: 75, bodyYaw: 12, boiler: 1 }], [.98, { headYaw: 40, neckYaw: 25, jaw: 80, boiler: 1 }], [1.12, { headYaw: 40, neckYaw: 25, head: 22, jaw: 80, bodyRoll: -10 }], [1.7, { headYaw: -40, neckYaw: -25, jaw: 80, boiler: 1, wing: 25 }], [1.97, { headYaw: -40, neckYaw: -25, head: 22, jaw: 80, bodyRoll: 10 }], [2.6, EXPOSE], [3.4, {}]]),
});
const stomp = attack('notabschaltung', {
  range: [0, 9], weight: 4, cooldown: 8, phase: 2, telegraph: 1, duration: 3.35, audit: [4, 7], flashParts: ['chest', 'body'], vfx: 'slam',
  hits: [line(1.1, [-4.6, .6, 2], [4.6, .6, 2], 1.5, 195), line(1.95, [-4.6, .6, 7], [4.6, .6, 7], 1.5, 175)],
  pose: track([[0, {}], [.8, { bodyY: .4, bodyPitch: -25, head: -20, wing: 65, foreL: -65, foreR: -65, hindL: 25, hindR: 25 }], [.98, { bodyY: .45, bodyPitch: -25, wing: 65, foreL: -65, foreR: -65 }], [1.12, { ...CROUCH, wing: -40, bodyPitch: 25 }], [1.6, { bodyY: .22, bodyPitch: -15, wing: 40, foreL: -40, foreR: -40 }], [1.98, { ...EXPOSE, bodyPitch: 20, wing: -30 }], [3.35, {}]]),
});
// Anti-camping: magma bombs on the hunter's spot and the escape lanes around it.
const BOMBS = 5;
const salvo = attack('schlackensalve', {
  range: [8, 32], weight: (m, d) => (d > 14 ? 7 : 3) * (1 + (m._farT ?? 0) / 2.5), cooldown: 8, telegraph: .95, duration: 2.6, audit: [10, 18, 26], vfx: 'breath', stam: 7,
  hits: [],
  events: [{ t: .95, call: 'spit', all: true }],
  calls: {
    spit(m, ctx, inst, age) {
      const from = worldAt(inst, .95, 0, 3.4);
      for (let i = 0; i < BOMBS; i++) {
        const ang = inst.r(i) * Math.PI * 2, dist = i === 0 ? 0 : 3.2 + inst.r(i + 5) * 2.4;
        const to = { x: inst.target.x + Math.sin(ang) * dist, y: inst.target.y ?? 0, z: inst.target.z + Math.cos(ang) * dist };
        const dur = .85 + i * .14;
        m.projectiles.spawn({ kind: 'magma', mode: 'impact', from: { x: from.x, y: (inst.origin.y ?? 0) + 3.2, z: from.z }, to, dur, arc: 7, radius: .6, splash: 2.1, hold: .2, dmg: 150, knock: 'down', status: GLUTBRAND, key: `${inst.key}:b${i}`, attackId: inst.params.attackId }, age);
        addScorch(m, to.x, to.z, { r: 1.9, secs: 6, age: age - dur, key: `${inst.key}:bs${i}` });
      }
      ctx.bus.emit('sfx', { name: 'pyroFlame', pos: m.pos });
    },
  },
  pose: track([[0, {}], [.65, { bodyPitch: -18, head: -40, neck: -.25, jaw: 70, wing: 35, boiler: 1, foreL: -14, foreR: -14 }], [.93, { bodyPitch: -20, head: -45, jaw: 82, boiler: 1, wing: 40 }], [1.02, { bodyPitch: 6, head: 10, neck: .12, jaw: 75, headReach: .35, wing: -12 }], [1.4, { bodyPitch: -10, head: -25, jaw: 70, boiler: .6 }], [1.9, EXPOSE], [2.6, {}]]),
});

// ---------------------------------------------------------------- signatures: big threat, earned opening
const rain = attack('feuerregen', {
  range: [3, 17], weight: 4, cooldown: 20, phase: 1, telegraph: 1.3, duration: 4.7, stam: 12, flashParts: ['chest', 'wingL', 'wingR'], audit: [6, 11], punishWindow: 1.8, vfx: 'rain',
  hits: [hit(1.4, [-3.6, .5, 6], 2.3, 185, 'down', FIRE), hit(1.4, [3.6, .5, 6], 2.3, 185, 'down', FIRE), hit(2.4, [0, .5, 11], 2.6, 215, 'down', FIRE), hit(2.4, [-7, .5, 8], 2.3, 185, 'down', FIRE), hit(2.4, [7, .5, 8], 2.3, 185, 'down', FIRE)],
  // Only the outer wave keeps burning: the gap in front and the escape lanes stay usable.
  events: [{ t: 1.4, call: 'impact', all: true }, { t: 2.4, call: 'impact', all: true }, { t: 2.42, call: 'scorchB', all: true }],
  calls: { scorchB: scorchCall(2.42, [[-7, 8], [7, 8]], { r: 2 }) },
  pose: track([[0, {}], [1, { bodyPitch: -22, head: -55, neck: -.3, jaw: 80, wing: 65, spread: 1, elbowL: -40, elbowR: -40, boiler: 1 }], [1.28, { bodyPitch: -22, head: -55, jaw: 80, wing: 65, boiler: 1 }], [1.5, { bodyPitch: -5, head: -28, jaw: 65, wing: -10 }], [2.05, { bodyPitch: -18, head: -50, wing: 50, jaw: 80, boiler: .8 }], [2.5, { ...EXPOSE, wing: -25, jaw: 60 }], [4.1, EXPOSE], [4.7, {}]]),
});
// Aerial apex: climbs out of reach, crosses the arena and dives onto the marked spot.
// One roll clears the impact disc; the outer shock ring and fire crown punish hunters
// who fled far instead of staying close for the landing opening.
const DIVE = 2.3;
const comet = attack('kometensturz', {
  range: [0, 34], weight: (m, d) => (d > 12 ? 4 : 1.5) * (1 + (m._farT ?? 0) / 3), cooldown: 24, phase: 1, telegraph: DIVE, duration: 5, stam: 12, flashParts: ['chest', 'wingL', 'wingR'], audit: [0, 8, 16], punishWindow: 2.4, vfx: 'dive', noFace: true,
  motion(t, a) {
    const k = smooth(clamp01((t - .55) / 1.55));
    const air = t < 2.05 ? 10 * smooth(clamp01((t - .3) / .9)) : 10 * (1 - smooth(clamp01((t - 2.05) / (DIVE - 2.05))));
    const travel = a.target ? yawOf(a.target.x - a.origin.x, a.target.z - a.origin.z) : a.yaw0;
    const yaw = a.yaw0 + angleDiff(a.yaw0, travel) * smooth(clamp01((t - .3) / .6));
    return { x: a.origin.x + (a.target.x - a.origin.x) * k, z: a.origin.z + (a.target.z - a.origin.z) * k, yaw, air: t >= DIVE ? 0 : air };
  },
  hits: [hit(DIVE - .02, [0, .5, 0], 3.6, 230, 'down', { t1: DIVE + .14, ...FIRE })],
  events: [{ t: .35, call: 'liftoff', all: true }, { t: DIVE, call: 'landing', all: true }],
  calls: {
    liftoff: (m, ctx) => { ctx.bus.emit('sfx', { name: 'pyroRoar', pos: m.pos }); ctx.fx.shake(.18, .3); },
    landing(m, ctx, inst, age) {
      quake(m, ctx);
      const at = inst.sample(inst.wall(DIVE));
      addRing(m, at.x, at.z, { r0: 8, rMax: 20, speed: 16, dmg: 160, age, key: `${inst.key}:ring` });
      for (let i = 0; i < 6; i++) addScorch(m, at.x + Math.sin(i * Math.PI / 3) * 9.2, at.z + Math.cos(i * Math.PI / 3) * 9.2, { r: 1.8, secs: 7, age, key: `${inst.key}:c${i}` });
    },
  },
  pose: track([[0, {}], [.3, { ...COIL, wing: 40 }], [.5, { ...FLAP_DOWN, jaw: 50 }], [.75, FLAP_UP], [1, FLAP_DOWN], [1.25, FLAP_UP], [1.5, FLAP_DOWN], [1.75, { ...FLAP_UP, jaw: 60, boiler: 1 }], [2.05, { ...LEAP, bodyPitch: 28, head: 30, wing: 70, spread: 1, foreL: -20, foreR: -20, boiler: 1 }], [DIVE, { ...LAND, bodyY: -.55 }], [2.8, { ...EXPOSE, bodyY: -.6, wing: -30 }], [4.4, EXPOSE], [5, {}]]),
});
const pressure = attack('ueberdruck', {
  // Never rolled by chance: Glutrausch ends with it (or with Sonnenbruch in the last state).
  range: [0, 40], weight: 0, cooldown: 18, telegraph: 1.8, duration: 6.45, stam: 14, flashParts: ['chest', 'valve'], audit: [4, 8], punishWindow: 2.5, vfx: 'pressure', noFace: true,
  hits: Array.from({ length: 6 }, (_, i) => hit(PYRO.ERUPTION, [Math.sin(i * Math.PI / 3) * 6.3, .7, Math.cos(i * Math.PI / 3) * 6.3], 2.45, 260, 'down', FIRE)),
  events: [{ t: 1.8, call: 'hiss', all: true }, { t: PYRO.ERUPTION, call: 'blast', all: true }],
  calls: {
    hiss: (m, ctx) => ctx.bus.emit('sfx', { name: 'pyroRoar', pos: m.pos }),
    // The inner pocket stays safe; everybody who ran away has to roll the outer wave.
    blast(m, ctx, inst, age) { impact(m, ctx); addRing(m, inst.origin.x, inst.origin.z, { r0: 8.8, rMax: 22, speed: 15, dmg: 150, age: age - .1, key: `${inst.key}:ring` }); },
  },
  pose: track([[0, {}], [.85, { ...PRESSURE_OPEN, wing: 35, boiler: .4, jaw: 30 }], [1.8, { ...PRESSURE_OPEN, elbowL: -20, elbowR: -20 }], [3.1, { ...PRESSURE_OPEN, wing: 60, jaw: 80 }], [3.27, { bodyY: .15, bodyPitch: -14, wing: -35, head: -35, jaw: 80, foreL: -40, foreR: -40 }], [3.65, { ...EXPOSE, jaw: 60 }], [5.85, EXPOSE], [6.45, {}]]),
});
// Ultimate of the last state: a hovering supernova followed by three rolling shock rings.
// Not counterable; surviving it gives the longest opening of the fight.
const NOVA = 2.4;
const nova = attack('sonnenbruch', {
  range: [0, 40], weight: 0, cooldown: 45, phase: 2, telegraph: NOVA, duration: 6.3, stam: 16, flashParts: ['chest', 'valve'], audit: [0, 6, 12, 20], punishWindow: 3.2, vfx: 'nova', noFace: true,
  motion(t, a) { return { air: t < NOVA ? 3.6 * smooth(clamp01((t - .3) / 1.7)) : 3.6 * (1 - smooth(clamp01((t - NOVA - .25) / .3))) }; },
  hits: [hit(NOVA, [0, -3.1, 0], 7.5, 290, 'down', { t1: NOVA + .15, ...FIRE })],
  events: [{ t: .3, call: 'hiss', all: true }, { t: NOVA, call: 'nova', all: true }, { t: NOVA + .55, call: 'impact', all: true }],
  calls: {
    hiss: (m, ctx) => { ctx.bus.emit('sfx', { name: 'pyroPressure', pos: m.pos }); ctx.bus.emit('sfx', { name: 'pyroRoar', pos: m.pos }); },
    nova(m, ctx, inst, age) {
      quake(m, ctx); ctx.fx.flash?.('rgba(255,200,120,.55)', .5);
      for (let i = 0; i < 3; i++) addRing(m, inst.origin.x, inst.origin.z, { r0: 7.5, rMax: 28, speed: 14, dmg: 175, age: age - i * .42, key: `${inst.key}:r${i}` });
    },
  },
  pose: track([[0, {}], [.3, { ...PRESSURE_OPEN, wing: 30 }], [1.2, { ...FLAP_UP, jaw: 60, boiler: 1, head: -30, neck: -.2 }], [1.6, { ...FLAP_DOWN, jaw: 70, boiler: 1 }], [2.05, { ...PRESSURE_OPEN, wing: 80, spread: 1, elbowL: -40, elbowR: -40, jaw: 85, bodyPitch: -16 }], [NOVA, { ...PRESSURE_OPEN, wing: 85, spread: 1, jaw: 85 }], [NOVA + .2, { bodyPitch: 10, wing: -40, jaw: 60, head: 10 }], [NOVA + .6, { ...EXPOSE, bodyY: -.62, wing: -35, jaw: 50 }], [5.7, EXPOSE], [6.3, {}]]),
});

// ---------------------------------------------------------------- AI glue
const SIGNATURES = [pressure.id, rain.id, stomp.id, brake.id, doubleTail.id, fan.id, comet.id, nova.id];
const VENTING = new Set([pressure.id, nova.id, rain.id, vent.id, leak.id, breath.id, fan.id, brake.id, whip.id, salvo.id, backhop.id]);
const EXPOSED = [rain.id, pressure.id, stomp.id, brake.id, comet.id, nova.id];
// Chain option builder: base weight, more in later states and while overheated.
const press = (atk, w, cond) => [
  { atk, w, cond }, { atk, w: w * .6, cond: (m, d) => m.phase >= 1 && (!cond || cond(m, d)) },
  { atk, w: w * .8, cond: (m, d) => m.phase >= 2 && (!cond || cond(m, d)) }, { atk, w: w * 1.2, cond: (m, d) => hot(m) && (!cond || cond(m, d)) },
];
const ahead = (m) => front(m);
const elements = { fire: 0, shock: 15, water: 25 };
export const pyrostur = {
  id: 'pyrostur', name: 'Pyrostur', hp: 22000, scale: SC, bodyRadius: 2.2,
  cueParts: ['chest', 'valve'], cueIntensity: .35,
  walk: 5.2, run: 10.5, turn: 2.3, detect: 34, prefer: 3.5,
  drops: ['pyrostur_schuppe', 'pyrostur_kesselsack', 'pyrostur_fluegel', 'pyrostur_rubin'],
  poseDefaults: REST, locomotionPose: posePyrosturPresence,
  build: buildPyrostur, stamina: true, flinchDmg: 1800, chainMax: 3, teachAttack: leap.id,
  recoverAfter: (m) => (hot(m) ? .12 : [.5, .32, .2][m?.phase ?? 0] ?? .2),
  attackTempo: (m) => (hot(m) ? PYRO.OVERHEAT_TEMPO : 1),
  parts: [
    { id: 'head', label: 'Ofenschnauze', factor: 1.05, stunPart: true, elem: elements, spheres: [{ node: 'head', offset: [0, 0, .55], r: .68 }, { node: 'head', offset: [.57, .55, -.75], r: .38 }, { node: 'head', offset: [-.57, .55, -.75], r: .38 }] },
    { id: 'chest', label: 'Brustbalg', factor: .65, breakHp: 1800, elem: elements, spheres: [{ node: 'chest', offset: [0, 0, .25], r: .8 }] },
    { id: 'valve', label: 'Überdruckventil', factor: .8, breakHp: 1000, elem: elements, spheres: [{ node: 'valve', offset: [.3, .1, 0], r: .5 }] },
    { id: 'wingL', label: 'Kesselflügel links', factor: .55, breakHp: 1400, elem: elements, spheres: [{ node: 'wingL', offset: [.45, -.12, .3], r: .6 }, { node: 'elbowL', offset: [.5, -.18, .3], r: .5 }, { node: 'wristL', offset: [0, -.35, .1], r: .5 }] },
    { id: 'wingR', label: 'Kesselflügel rechts', factor: .55, breakHp: 1400, elem: elements, spheres: [{ node: 'wingR', offset: [-.45, -.12, .3], r: .6 }, { node: 'elbowR', offset: [-.5, -.18, .3], r: .5 }, { node: 'wristR', offset: [0, -.35, .1], r: .5 }] },
    { id: 'tail', label: 'Schlackenschweif', factor: .55, elem: elements, spheres: [{ node: 'tail', offset: [0, -.05, -.7], r: .5 }, { node: 'tailMid', offset: [0, -.04, -.7], r: .4 }, { node: 'tailTip', offset: [0, .04, -.6], r: .5 }] },
    { id: 'body', label: 'Kesselrumpf', factor: .42, elem: elements, spheres: [{ node: 'body', offset: [0, 0, -.5], r: .9 }, { node: 'forelegL', offset: [0, -.45, .1], r: .5 }, { node: 'forelegR', offset: [0, -.45, .1], r: .5 }, { node: 'legL', offset: [0, -.6, 0], r: .5 }, { node: 'legR', offset: [0, -.6, 0], r: .5 }] },
  ],
  attacks: Object.fromEntries(moves.map((a) => [a.id, a])),
  // Predator strings: every link re-reads the hunter's current position at its own start.
  chains: {
    [bite.id]: [...press(uppercut.id, 4, ahead), ...press(scythe.id, 2), ...press(flank.id, 2, ahead), ...press(bite.id, 2, ahead), { atk: null, w: 6 }],
    [uppercut.id]: [...press(leap.id, 3), ...press(bite.id, 3, ahead), ...press(backhop.id, 2, ahead), { atk: null, w: 6 }],
    [scythe.id]: [...press(backhop.id, 3, ahead), ...press(leap.id, 3), ...press(bite.id, 2, ahead), { atk: null, w: 6 }],
    [leap.id]: [{ atk: leap.id, w: 3 }, { atk: leap.id, w: 6, cond: (m) => m.phase >= 1 }, { atk: leap.id, w: 4, cond: hot }, ...press(bite.id, 3, ahead), ...press(scythe.id, 2), ...press(backhop.id, 2, ahead), { atk: null, w: 6 }],
    [flank.id]: [...press(bite.id, 3, ahead), ...press(scythe.id, 3), ...press(uppercut.id, 2, ahead), { atk: null, w: 6 }],
    [backhop.id]: [...press(leap.id, 5), ...press(charge.id, 3), ...press(salvo.id, 2), { atk: null, w: 5 }],
    [charge.id]: [...press(wing.id, 2), ...press(uppercut.id, 3, ahead), ...press(scythe.id, 2), ...press(backhop.id, 2, ahead), { atk: null, w: 6 }],
    [pounces[0].id]: [...press(bite.id, 3, ahead), ...press(pounces[1].id, 3), ...press(leap.id, 2), { atk: null, w: 6 }],
    [pounces[1].id]: [...press(uppercut.id, 3, ahead), ...press(pounces[0].id, 3), ...press(leap.id, 2), { atk: null, w: 6 }],
    [wing.id]: [...press(vent.id, 2), ...press(leak.id, 2), ...press(flank.id, 2, ahead), ...press(scythe.id, 2), { atk: null, w: 6 }],
    [tail.id]: [...press(scythe.id, 2), ...press(backhop.id, 2, ahead), { atk: null, w: 6 }],
    [breath.id]: [...press(leap.id, 3), ...press(charge.id, 2), { atk: null, w: 6 }],
    [whip.id]: [...press(leap.id, 3), { atk: null, w: 6 }],
    [salvo.id]: [...press(charge.id, 3), ...press(leap.id, 3), { atk: null, w: 6 }],
  },
  phases: [
    { at: .72, name: 'JAGDDRUCK — Der Kessel erhebt sich', cue: cue(), special: comet.id, enter(m) { m.pressure = Math.max(m.pressure ?? 0, 75); } },
    { at: .38, name: 'KERNBRUCH — Sonnenbruch', cue: cue(), special: nova.id, enter(m) { m.overheat = 0; m.pressure = 100; } },
  ],
  init(m) {
    m.pressure = 20; m.boilerCounter = 0; m._pyroHistory = []; m._pyroCounterCd = 0; m.overheat = 0; m._farT = 0; m._hugT = 0;
    for (const key of Object.keys(REST)) { m.pose[key] ??= REST[key]; m._tgt[key] ??= REST[key]; }
  },
  tick(m, dt) {
    tickHazards(m);
    updatePyrosturFx(m);
    const a = m.attack, tau = a?.inst.sample(a.t).tau ?? 0;
    // An interrupted aerial attack (wing break, flinch) drops him; he never stays hanging.
    if (!a && m.air > 0 && m.alive) { m.air = Math.max(0, m.air - 16 * dt); m.pos.y = (m.ctx.world?.heightAt?.(m.pos.x, m.pos.z) ?? 0) + m.air; }
    const counter = a?.id === pressure.id && tau >= PYRO.COUNTER_OPEN && tau < PYRO.COUNTER_CLOSE;
    if (m.extra.coreMat) m.extra.coreMat.color.set(counter ? '#fff3b0' : hot(m) ? '#ffe070' : m.phase >= 2 ? '#f56338' : '#ff9d49');
    if (m.extra.needle) { m.extra.needle.rotation.z = -.7 + (m.pressure ?? 0) / 100 * 1.4; m.extra.needle.visible = !m.partById.valve.broken; }
    if (m.extra.pipe) m.extra.pipe.visible = !m.partById.valve.broken;
    const chest = m.partById.chest;
    const recovering = a && EXPOSED.includes(a.id) && tau > Math.max(...a.inst.def.hits.map((h) => h.t1)) + .1;
    // An actually overlapping exposed core takes priority over neighbouring
    // crown/foreleg armour in wide weapon sweeps and the bow's clustered volley.
    chest.factor = (counter ? 1.2 : chest.broken || recovering ? 1.05 : chest.baseFactor) + (m._fb ?? 0);
    if (m.nodes.core) m.nodes.core.scale.x = chest.broken ? 1.65 : 1;
    for (const id of ['wingL', 'wingR']) if (m.extra.wings?.[id]) m.extra.wings[id].scale.x = m.partById[id].broken ? .64 : 1;
    if (!m.authority) return;
    m._pyroCounterCd = Math.max(0, (m._pyroCounterCd ?? 0) - dt);
    if (!counter) m.boilerCounter = 0;
    if (m.state !== 'combat') return;
    // Position memory for the hunting AI: campers draw salvos/dives, huggers draw backhops.
    const d = m.target ? Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) : 0;
    m._farT = d > 13 ? (m._farT ?? 0) + dt : Math.max(0, (m._farT ?? 0) - dt * 2);
    m._hugT = d < 4.5 ? (m._hugT ?? 0) + dt : Math.max(0, (m._hugT ?? 0) - dt * 2);
    if (hot(m)) {
      m.pressure = 100;
      m.overheat = Math.max(0, m.overheat - dt);
      if (m.overheat <= 0) m._ventDue = true;
      else return;
    }
    // Glutrausch must end in a vent: the counterable overpressure, or the supernova late on.
    // Re-queued until it actually runs, so an interrupted telegraph cannot skip it.
    const venting = a && (a.id === pressure.id || a.id === nova.id);
    if (m._ventDue) {
      if (!venting && !m.queued && !m.phaseSpecial) m.queued = m.phase >= 2 && (m.cds[nova.id] ?? 0) <= 0 ? nova.id : pressure.id;
      return;
    }
    if (!m.tired && !a) m.pressure = Math.min(100, m.pressure + dt * (m.partById.valve.broken ? 1.5 : m.phase >= 2 ? 7 : 4.5));
    if (m.pressure >= 100 && !venting && !m.queued && !m.phaseSpecial && m.phaseT <= 0) {
      m.overheat = PYRO.OVERHEAT_SECS;
      m.ctx.bus.emit('sfx', { name: 'pyroRoar', pos: m.pos });
      m.ctx.fx.number?.({ x: m.pos.x, y: m.pos.y + SC * 3, z: m.pos.z }, 'GLUTRAUSCH!', 'weak');
      m.ctx.fx.shake?.(.25, .35);
      m.ctx.bus.emit('pyroOverheat', { monster: m, on: true });
    }
  },
  poseHook(m, p) {
    for (const key of Object.keys(REST)) if (!Number.isFinite(p[key])) p[key] = REST[key];
    if (!m.attack) {
      if (m.state === 'dead' || m.sleeping || m.stunT > 0 || m.trapped || m.blind) return;
      if (m.state === 'notice' || m.state === 'enrage') {
        const rise = Math.sin(Math.min(1, m.stateT / 1.4) * Math.PI);
        p.wing = 12 + rise * 24; p.elbowL = p.elbowR = -rise * 12;
        p.jaw = rise * 65; p.boiler = rise; p.foreL = p.foreR = -rise * 15;
        return;
      }
      if (m.stagT > 0 || m.tired) { p.bodyY = -.5; p.head = 10; p.neck = 0; p.foreL = p.foreR = -5; p.wing = 8; return; }
      // Overheated: low, coiled hunting stance with the furnace wide open.
      if (hot(m)) { p.bodyY -= .12; p.bodyPitch += 4; p.jaw += 10; p.boiler = 1; p.wing += 6; }
    }
  },
  onHitPlayer(m, p, h) {
    // Success feeds the furnace: a predator that lands hits snowballs toward Glutrausch.
    if (m.authority && !hot(m) && h.dmg > 0) m.pressure = Math.min(100, (m.pressure ?? 0) + 6);
  },
  onRage(m, on) { if (on && m.authority) m.pressure = Math.min(100, (m.pressure ?? 0) + 35); },
  onDamage(m, res) {
    if (!m.authority || res.partId !== 'chest' || m.attack?.id !== pressure.id || m._pyroCounterCd > 0) return;
    const tau = m.attack.inst.sample(m.attack.t).tau;
    if (tau < PYRO.COUNTER_OPEN || tau >= PYRO.COUNTER_CLOSE) return;
    m.boilerCounter += res.dmg;
    if (m.boilerCounter >= PYRO.COUNTER_DAMAGE * Math.sqrt(Math.max(1, m.maxHp / pyrostur.hp))) {
      m._interrupt(); m._chainBreak(); m.queued = null; m.pressure = 0; m.overheat = 0; m._ventDue = false; m.boilerCounter = 0; m._pyroCounterCd = 18;
      m.stagT = Math.max(m.stagT, PYRO.COUNTER_TIME); m.recover = Math.max(m.recover, PYRO.COUNTER_TIME);
      m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
    }
  },
  onBreak(m, part) {
    if (part.id === 'chest') { part.factor = 1.05; m.pressure = 0; m.overheat = 0; m._ventDue = false; if (SIGNATURES.includes(m.queued)) m.queued = null; m.stagT = Math.max(m.stagT, PYRO.COUNTER_TIME); m.recover = Math.max(m.recover, PYRO.COUNTER_TIME); }
    if (part.id === 'valve') { m.pressure = Math.max(0, m.pressure - 45); part.factor = 1; }
    if (part.id === 'wingL' || part.id === 'wingR') {
      // Broken wing mid-flight: he crashes out of the sky.
      if (m.air > 1) { m.stagT = Math.max(m.stagT, PYRO.CRASH_TIME); m.recover = Math.max(m.recover, PYRO.CRASH_TIME); }
      for (const id of [rain.id, comet.id]) m.cds[id] = Math.max(m.cds[id] ?? 0, 14);
      for (const p of [...pounces, leap]) m.cds[p.id] = Math.max(m.cds[p.id] ?? 0, 5);
      part.factor = .85;
    }
  },
  onAttackEnd(m, id) {
    if (!id.startsWith('pyrostur_')) return;
    if (m.authority) {
      m._pyroHistory = [...(m._pyroHistory ?? []), id].slice(-4);
      if (id === pressure.id || id === nova.id) {
        m.overheat = 0; m._ventDue = false; m.pressure = id === nova.id ? 35 : 0;
        m.ctx.bus.emit('pyroOverheat', { monster: m, on: false });
      } else if (!hot(m)) m.pressure = Math.max(0, Math.min(100, (m.pressure ?? 0) + (VENTING.has(id) ? -30 : m.phase >= 2 ? 14 : 10)));
      // Signatures always finish with a real opening, never an immediate branch.
      if (SIGNATURES.includes(id)) m.chainNext = null;
    }
  },
  speedFactor: (m) => (m.partById.wingL.broken || m.partById.wingR.broken ? .9 : 1),
  snapExtra: (m) => ({ pressure: Math.round(m.pressure ?? 0), overheat: Math.round((m.overheat ?? 0) * 10) / 10 }),
};
