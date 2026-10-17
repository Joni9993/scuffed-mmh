// Pyrostur, the furnace elder. Every impact is an animated, deterministic AttackInstance.
import { compileTrack } from '../anim.js';
import { MREST } from './monster.js';
import { smooth, clamp01 } from './common.js';
import { buildPyrostur } from './pyrosturRig.js';
import { updatePyrosturFx } from './pyrosturFx.js';
import { posePyrosturPresence } from './pyrosturMotion.js';
export { buildPyrostur } from './pyrosturRig.js';

const SC = 1.65;
export const PYRO = { COUNTER_DAMAGE: 420, COUNTER_TIME: 3.2, COUNTER_OPEN: .9, COUNTER_CLOSE: 2.9, ERUPTION: 3.2, PRESSURE_MAX: 100 };
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
const hit = (t, at, radius, dmg, knock = 'down') => ({ t0: t, t1: t + .13, shape: 'sphere', at, radius, dmg, knock });
const line = (t, from, to, radius, dmg, end = t + .13) => ({ t0: t, t1: end, shape: 'capsule', from, to, radius, dmg, knock: 'down' });
const impact = (m, ctx) => { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark({ x: m.pos.x, y: m.pos.y + .5, z: m.pos.z }, 12, '#ffab65', 5); ctx.fx.shake(.22, .23); };
const prepareAdvance = (max, stop = 3.6) => (a) => { a.len = Math.max(0, Math.min(max, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - stop)); };
const advance = (t, a, start, span, side = 0) => { const k = smooth(clamp01((t - start) / span)); return { x: a.origin.x + (a.dir.x * a.len + a.dir.z * side) * k, z: a.origin.z + (a.dir.z * a.len - a.dir.x * side) * k }; };
const CROUCH = { bodyY: -.45, bodyPitch: 9, head: 26, neck: .12, wing: 15, elbowL: 10, elbowR: 10, foreL: 0, foreR: 0, hindL: 25, hindR: 25, tailPitch: -10 };
const EXPOSE = { bodyY: -.5, bodyPitch: 6, head: 10, neck: 0, jaw: 35, wing: 12, elbowL: 12, elbowR: 12, foreL: -5, foreR: -5, hindL: 18, hindR: 18 };
// The crown lifts away from the furnace rather than covering the counter target.
const PRESSURE_OPEN = { bodyY: -.3, bodyPitch: -8, head: -18, neck: -.18, jaw: 70, foreL: -10, foreR: -10, wing: 55, boiler: 1 };
const moves = [];
const attack = (name, config) => {
  const id = 'pyrostur_' + name, baseWeight = config.weight ?? 4;
  const def = { id, range: [0, 16], cooldown: 6, telegraph: 1, duration: 3.5, stam: 7, tgVar: false, markerFromHits: true,
    cue: cue(), flashParts: ['head'], audit: [4], vfx: 'slam', ...config,
    weight: (m, d) => {
      const raw = typeof baseWeight === 'function' ? baseWeight(m, d) : baseWeight;
      const recent = m._pyroHistory ?? [];
      return raw * (recent.at(-1) === id ? .03 : recent.includes(id) ? .2 : 1);
    },
  };
  def.events ??= [...new Set(def.hits.map((h) => h.t0))].map((t) => ({ t, call: 'impact', all: true }));
  def.flashParts = def.flashParts.filter((p) => p === 'valve');
  def.markerLead = ['pressure', 'rain', 'breath', 'steam'].includes(def.vfx) ? 1 : .55;
  def.calls = { impact, ...def.calls };
  for (const h of def.hits) h.group = `impact:${h.t0}`;
  moves.push(def); return def;
};
const bite = attack('zange', {
  range: [0, 8], weight: 7, cooldown: 4, telegraph: .85, duration: 2.4, audit: [3, 6], vfx: 'charge',
  prepare: prepareAdvance(3), motion(t, a) { return advance(t, a, .78, .24); },
  hits: [line(.93, [-1.05, 1.3, 3.5], [1.05, 1.3, 4.6], 1.15, 110)],
  pose: track([[0, {}], [.58, { ...CROUCH, head: -20, jaw: 70, neck: -.2, headReach: -.2 }], [.8, { ...CROUCH, head: -20, jaw: 75, neck: -.2 }], [.98, { bodyPitch: 12, head: 28, neck: .3, jaw: 0, headReach: .65, foreL: -30, foreR: -30 }], [1.3, { ...EXPOSE, jaw: 12 }], [1.95, EXPOSE], [2.4, {}]]),
});
const wing = attack('kesselfluegel', {
  range: [0, 5], weight: 6, cooldown: 7, telegraph: 1.05, duration: 2.9, flashParts: ['wingL', 'wingR'], audit: [2, 4],
  // The new elder has separate forelegs: claws drive the ground impact while
  // the wings flare overhead, rather than invisible wing hands striking below.
  hits: [line(1.16, [-2.7, .65, 2.5], [2.7, .65, 2.5], 1.2, 165)],
  pose: track([[0, {}], [.78, { bodyY: .18, bodyPitch: -14, wing: 30, spread: 1, elbowL: -15, elbowR: -15, foreL: -55, foreR: -55 }], [1.04, { bodyY: .22, wing: 35, bodyPitch: -18, foreL: -60, foreR: -60 }], [1.16, { bodyY: -.15, bodyPitch: 8, wing: 12, foreL: 12, foreR: 12 }], [1.65, EXPOSE], [2.4, EXPOSE], [2.9, {}]]),
});
const tail = attack('schlackenschweif', {
  range: [0, 8], weight: 9, noFace: true, cond: behind, duration: 3.6, telegraph: 1.1, flashParts: ['tail'], audit: [0],
  hits: [line(1.22, [0, .85, -2], [0, .85, -6.8], 1.3, 175, 1.65)],
  motion(t, a) { return { yaw: a.yaw0 - 1.1 * smooth(clamp01(t / .95)) + 2.2 * smooth(clamp01((t - 1.15) / .55)) }; },
  pose: track([[0, {}], [.9, { bodyY: -.2, bodyRoll: -15, bodyYaw: -15, tailPitch: -10, tailCurl: -10, wingL: 35, foreL: 30 }], [1.12, { bodyY: -.2, bodyRoll: -15, tailPitch: -12 }], [1.5, { bodyY: -.2, bodyRoll: 17, bodyYaw: 18, tailPitch: -12, wingR: 35, foreR: 35 }], [2, EXPOSE], [3.1, EXPOSE], [3.6, {}]]),
});
const vent = attack('seitenablass', {
  range: [0, 8.5], weight: (m) => 3 + (m.pressure ?? 0) / 20, noFace: true, cond: lateral, cooldown: 9, telegraph: 1.25, duration: 3.7, flashParts: ['valve', 'chest'], lockedByBreak: 'valve', audit: [0], vfx: 'steam',
  hits: [line(1.38, [-2, .9, 0], [-7.4, .9, 0], 1.25, 150), line(1.38, [2, .9, 0], [7.4, .9, 0], 1.25, 150)],
  pose: track([[0, {}], [.9, { ...CROUCH, wing: 45, boiler: .9, bodyRoll: -12, jaw: 20 }], [1.25, { ...CROUCH, wing: 55, boiler: 1, bodyRoll: -12 }], [1.4, { bodyY: -.3, bodyRoll: 16, wing: 20, jaw: 50, head: -12 }], [2, EXPOSE], [3.2, EXPOSE], [3.7, {}]]),
});
const leak = attack('leckablass', {
  range: [0, 7], weight: 5, noFace: true, cond: (m) => lateral(m) && localTarget(m).x > 0, cooldown: 9, telegraph: 1.25, duration: 3.7, flashParts: ['valve'], needsBroken: 'valve', audit: [0], vfx: 'steam',
  hits: [line(1.38, [2, .9, 0], [6.2, .9, 0], 1.15, 105)], pose: vent.pose,
});
const breath = attack('ofenschneise', {
  range: [5, 22], weight: (m, d) => d > 12 ? 9 : 4, cooldown: 9, duration: 4.2, audit: [8, 15, 20], telegraph: 1.4, vfx: 'breath',
  hits: [line(1.5, [0, 1.1, 4.1], [0, .7, 21], 1.55, 195, 2.05)],
  pose: track([[0, {}], [1.05, { bodyPitch: -12, head: -22, jaw: 65, neck: -.14, wing: 25, boiler: 1, foreL: -18, foreR: -18 }], [1.38, { head: -22, jaw: 80, bodyPitch: -12, boiler: 1 }], [1.52, { bodyPitch: 12, head: 19, neck: .18, headReach: .3, jaw: 70, wing: -10 }], [2.03, { head: 23, jaw: 70, bodyPitch: 12, foreL: 28, foreR: 28 }], [2.3, EXPOSE], [3.65, EXPOSE], [4.2, {}]]),
});
const charge = attack('kesselramme', {
  range: [5, 23], weight: (m, d) => d > 9 ? 11 : 5, cooldown: 8, telegraph: 1.25, duration: 3.3, flashParts: ['head', 'chest'], audit: [8, 15, 21], vfx: 'charge',
  prepare: prepareAdvance(19, 1.5), motion(t, a) { return advance(t, a, 1.24, .82); },
  hits: [line(1.3, [-1.1, 1, 2.1], [1.1, 1, 4], 1.35, 210, 2.08), line(1.3, [-.8, 1.1, 4.3], [.8, 1.1, 6], 1.05, 210, 2.08)],
  pose: track([[0, {}], [.9, { ...CROUCH, head: 35, neck: .2, wing: -30, jaw: 10, tailPitch: 15 }], [1.23, { ...CROUCH, head: 35, neck: .2, tailPitch: 18 }], [1.36, { bodyPitch: 16, head: 32, neck: .25, wing: 15, foreL: -45, foreR: -45, hindL: -40, hindR: -40 }], [1.75, { bodyPitch: 8, head: 30, wing: 5, foreL: 40, foreR: 40, hindL: 35, hindR: 35 }], [2.14, { ...EXPOSE, bodyPitch: 18, wing: 45, foreL: 55, foreR: 55 }], [2.85, EXPOSE], [3.3, {}]]),
});
const rain = attack('feuerregen', {
  range: [3, 17], weight: 5, cooldown: 23, phase: 1, telegraph: 1.65, duration: 6.1, stam: 15, flashParts: ['chest', 'wingL', 'wingR'], audit: [6, 11], punishWindow: 2, vfx: 'rain',
  hits: [hit(1.8, [-3.6, .5, 6], 2.3, 185), hit(1.8, [3.6, .5, 6], 2.3, 185), hit(3.05, [0, .5, 11], 2.6, 215), hit(3.05, [-7, .5, 8], 2.3, 185), hit(3.05, [7, .5, 8], 2.3, 185)],
  pose: track([[0, {}], [1.25, { bodyPitch: -22, head: -55, neck: -.3, jaw: 80, wing: 65, spread: 1, elbowL: -40, elbowR: -40, boiler: 1 }], [1.65, { bodyPitch: -22, head: -55, jaw: 80, wing: 65, boiler: 1 }], [1.9, { bodyPitch: -5, head: -28, jaw: 65, wing: -10 }], [2.65, { bodyPitch: -18, head: -50, wing: 50, jaw: 80, boiler: .8 }], [3.12, { ...EXPOSE, wing: -25, jaw: 60 }], [5.5, EXPOSE], [6.1, {}]]),
});
const pressure = attack('ueberdruck', {
  range: [0, 10], weight: (m) => (m.pressure ?? 0) > 78 ? 17 : .25, cooldown: 22, telegraph: 1.8, duration: 6.45, stam: 18, flashParts: ['chest', 'valve'], audit: [4, 8], punishWindow: 2.5, vfx: 'pressure',
  hits: Array.from({ length: 6 }, (_, i) => hit(PYRO.ERUPTION, [Math.sin(i * Math.PI / 3) * 6.3, .7, Math.cos(i * Math.PI / 3) * 6.3], 2.45, 260)),
  events: [{ t: 1.8, call: 'hiss', all: true }, { t: PYRO.ERUPTION, call: 'impact', all: true }],
  calls: { hiss: (m, ctx) => ctx.bus.emit('sfx', { name: 'pyroRoar', pos: m.pos }) },
  pose: track([[0, {}], [.85, { ...PRESSURE_OPEN, wing: 35, boiler: .4, jaw: 30 }], [1.8, { ...PRESSURE_OPEN, elbowL: -20, elbowR: -20 }], [3.1, { ...PRESSURE_OPEN, wing: 60, jaw: 80 }], [3.27, { bodyY: .15, bodyPitch: -14, wing: -35, head: -35, jaw: 80, foreL: -40, foreR: -40 }], [3.65, { ...EXPOSE, jaw: 60 }], [5.85, EXPOSE], [6.45, {}]]),
});
const stomp = attack('notabschaltung', {
  range: [0, 9], weight: 6, cooldown: 11, phase: 2, telegraph: 1.4, duration: 4.7, audit: [4, 7], flashParts: ['chest', 'body'], vfx: 'slam',
  hits: [line(1.53, [-4.6, .6, 2], [4.6, .6, 2], 1.5, 195), line(2.65, [-4.6, .6, 7], [4.6, .6, 7], 1.5, 175)],
  pose: track([[0, {}], [1.15, { bodyY: .4, bodyPitch: -25, head: -20, wing: 65, foreL: -65, foreR: -65, hindL: 25, hindR: 25 }], [1.4, { bodyY: .45, bodyPitch: -25, wing: 65, foreL: -65, foreR: -65 }], [1.56, { ...CROUCH, wing: -40, bodyPitch: 25 }], [2.2, { bodyY: .22, bodyPitch: -15, wing: 40, foreL: -40, foreR: -40 }], [2.68, { ...EXPOSE, bodyPitch: 20, wing: -30 }], [4.1, EXPOSE], [4.7, {}]]),
});
const uppercut = attack('hornbrecher', {
  range: [0, 7], weight: 6, cooldown: 8, telegraph: 1.15, duration: 2.9, audit: [3, 6], flashParts: ['head'], vfx: 'charge',
  prepare: prepareAdvance(2.5), motion(t, a) { return advance(t, a, 1.08, .3); },
  hits: [line(1.17, [-.6, 1.2, 3.3], [-.6, 2.6, 5.9], 1, 195), line(1.17, [.6, 1.2, 3.3], [.6, 2.6, 5.9], 1, 195), line(1.17, [0, 1, 3], [0, 2.5, 4.5], 1.1, 160)],
  pose: track([[0, {}], [.85, { ...CROUCH, bodyY: -.35, head: 25, neck: .15, headReach: -.15, bodyPitch: 12 }], [1.14, { ...CROUCH, bodyY: -.35, head: 25, neck: .15, bodyPitch: 12 }], [1.3, { bodyY: .25, bodyPitch: -10, head: -12, neck: -.05, headReach: .5, foreL: -35, foreR: -35, jaw: 25 }], [1.7, EXPOSE], [2.4, EXPOSE], [2.9, {}]]),
});
const pounces = [-1, 1].map((side) => attack(side < 0 ? 'glutpirsch_links' : 'glutpirsch_rechts', {
  range: [3, 19], weight: (m, d) => (d > 6 ? 9 : 4) * (m.phase > 0 ? 1.4 : 1), cooldown: 10, telegraph: 1.15, duration: 3.7, audit: [5, 10, 16], vfx: 'charge',
  prepare(a) { a.len = Math.max(1.5, Math.min(15, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 2.8)); },
  motion(t, a) {
    const wind = smooth(clamp01(t / .86)), leap = smooth(clamp01((t - 1.12) / .62));
    const offset = side * 3.2 * wind * (1 - leap), fwd = a.len * leap;
    return { x: a.origin.x + a.dir.x * fwd + a.dir.z * offset, z: a.origin.z + a.dir.z * fwd - a.dir.x * offset, air: t > 1.12 && t < 1.74 ? Math.sin(clamp01((t - 1.12) / .62) * Math.PI) * .95 : 0 };
  },
  hits: [line(1.3, [-1.25, .45, 2], [1.25, .45, 4.2], 1.25, 185, 1.78)],
  pose: track([[0, {}], [.72, { ...CROUCH, bodyRoll: side * 20, bodyYaw: side * -20, wingL: side * 35, wingR: side * -35, headYaw: side * -20, tailYaw: side * 35 }], [1.12, { ...CROUCH, bodyRoll: side * 16, tailPitch: 20, head: 25 }], [1.35, { bodyPitch: 10, wing: 45, foreL: -65, foreR: -65, hindL: -45, hindR: -45, tailPitch: 10, jaw: 50 }], [1.76, { ...EXPOSE, bodyPitch: 23, foreL: 65, foreR: 65, wing: -25 }], [3.1, EXPOSE], [3.7, {}]]),
}));
const doubleTail = attack('ambossschweif', {
  range: [0, 8.5], weight: 8, noFace: true, cond: behind, phase: 1, cooldown: 13, telegraph: 1.3, duration: 4.65, audit: [0], flashParts: ['tail'],
  hits: [line(1.42, [0, .6, -2.2], [0, .6, -7], 1.25, 160), line(2.58, [-.8, .6, -3], [.8, .6, -7.3], 1.65, 220)],
  pose: track([[0, {}], [1, { bodyPitch: 8, tailPitch: 65, tailCurl: -20, wing: 30, foreL: 40, foreR: 40 }], [1.3, { bodyPitch: 8, tailPitch: 70, wing: 30 }], [1.45, { bodyPitch: -9, tailPitch: -8, wing: -15 }], [2.2, { bodyPitch: 10, tailPitch: 75, wing: 45, tailCurl: -20 }], [2.6, { bodyPitch: -12, tailPitch: 5, bodyY: -.3, wing: -25 }], [3.05, EXPOSE], [4.1, EXPOSE], [4.65, {}]]),
});
const brake = attack('schlackenbremse', {
  range: [5, 22], weight: 7, cooldown: 14, phase: 1, telegraph: 1.35, duration: 5.15, audit: [8, 14, 20], flashParts: ['head', 'chest'], vfx: 'breath',
  prepare: prepareAdvance(14, 6), motion(t, a) { return advance(t, a, 1.32, .65); },
  hits: [line(1.42, [-1, 1, 2], [1, 1, 3.8], 1.25, 175, 1.97), line(2.85, [-5, .7, 5.3], [5, .7, 5.3], 1.5, 210)],
  pose: track([[0, {}], [1.05, { ...CROUCH, head: 35, tailPitch: 20 }], [1.35, { ...CROUCH, head: 35, tailPitch: 20 }], [1.55, { bodyPitch: 15, head: 30, foreL: -40, foreR: -40, hindL: -40, hindR: -40 }], [2.02, { bodyPitch: -12, wing: 65, head: -20, jaw: 75, foreL: 65, foreR: 65, boiler: 1 }], [2.7, { bodyPitch: -12, head: -20, jaw: 80, wing: 45, boiler: 1 }], [2.9, { bodyPitch: 14, head: 25, jaw: 80, wing: -15 }], [3.25, EXPOSE], [4.55, EXPOSE], [5.15, {}]]),
});
const fan = attack('glutfessel', {
  range: [0, 12], weight: 7, cooldown: 16, phase: 2, telegraph: 1.4, duration: 4.7, audit: [3, 7, 10], flashParts: ['head', 'chest'], vfx: 'breath',
  // A deliberate two-sided fan leaves the central approach open; hugging either wing is punished.
  hits: [line(1.55, [-1.4, 1, 3], [-8, .6, 9], 1.5, 190), line(2.65, [1.4, 1, 3], [8, .6, 9], 1.5, 205)],
  pose: track([[0, {}], [1.1, { ...CROUCH, headYaw: 38, neckYaw: 25, jaw: 75, bodyYaw: 12, boiler: 1 }], [1.4, { headYaw: 40, neckYaw: 25, jaw: 80, boiler: 1 }], [1.58, { headYaw: 40, neckYaw: 25, head: 22, jaw: 80, bodyRoll: -10 }], [2.35, { headYaw: -40, neckYaw: -25, jaw: 80, boiler: 1, wing: 25 }], [2.68, { headYaw: -40, neckYaw: -25, head: 22, jaw: 80, bodyRoll: 10 }], [3, EXPOSE], [4.15, EXPOSE], [4.7, {}]]),
});

const elements = { fire: 0, shock: 15, water: 25 };
export const pyrostur = {
  id: 'pyrostur', name: 'Pyrostur', hp: 22000, scale: SC, bodyRadius: 2.2,
  cueParts: ['chest', 'valve'], cueIntensity: .35,
  walk: 4.4, run: 8.2, turn: 1.5, detect: 34, prefer: 3.5,
  drops: ['pyrostur_schuppe', 'pyrostur_kesselsack', 'pyrostur_fluegel', 'pyrostur_rubin'],
  poseDefaults: REST, locomotionPose: posePyrosturPresence,
  build: buildPyrostur, stamina: true, flinchDmg: 1800, chainMax: 2, teachAttack: uppercut.id,
  recoverAfter: () => .6,
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
  chains: {
    [bite.id]: [{ atk: uppercut.id, w: 5, cond: (m) => m.phase > 0 }, { atk: wing.id, w: 2 }, { atk: null, w: 5 }],
    [uppercut.id]: [{ atk: bite.id, w: 6, cond: (m) => m.phase > 0 }, { atk: null, w: 5 }],
    [charge.id]: [{ atk: wing.id, w: 3 }, { atk: wing.id, w: 5, cond: (m) => m.phase > 0 }, { atk: uppercut.id, w: 8, cond: (m) => m.phase >= 2 }, { atk: null, w: 5 }],
    [pounces[0].id]: [{ atk: bite.id, w: 3 }, { atk: bite.id, w: 4, cond: (m) => m.phase > 0 }, { atk: pounces[1].id, w: 9, cond: (m) => m.phase >= 2 }, { atk: null, w: 4 }],
    [pounces[1].id]: [{ atk: uppercut.id, w: 3 }, { atk: uppercut.id, w: 4, cond: (m) => m.phase > 0 }, { atk: pounces[0].id, w: 9, cond: (m) => m.phase >= 2 }, { atk: null, w: 4 }],
    [wing.id]: [{ atk: vent.id, w: 2, cond: (m) => m.phase > 0 }, { atk: leak.id, w: 2, cond: (m) => m.phase > 0 }, { atk: null, w: 5 }],
  },
  phases: [
    { at: .72, name: 'JAGDDRUCK — Der Kessel geht auf Pirsch', cue: cue(), special: rain.id, enter(m) { m.pressure = 75; } },
    { at: .38, name: 'KERNBRUCH — Sicherheitsventile versagen', cue: cue(), special: pressure.id, enter(m) { m.pressure = 100; } },
  ],
  init(m) {
    m.pressure = 20; m.boilerCounter = 0; m._pyroHistory = []; m._pyroCounterCd = 0;
    for (const key of Object.keys(REST)) { m.pose[key] ??= REST[key]; m._tgt[key] ??= REST[key]; }
  },
  tick(m, dt) {
    updatePyrosturFx(m);
    const a = m.attack, tau = a?.inst.sample(a.t).tau ?? 0;
    const counter = a?.id === pressure.id && tau >= PYRO.COUNTER_OPEN && tau < PYRO.COUNTER_CLOSE;
    if (m.extra.coreMat) m.extra.coreMat.color.set(counter ? '#fff3b0' : m.phase >= 2 ? '#f56338' : '#ff9d49');
    if (m.extra.needle) { m.extra.needle.rotation.z = -.7 + (m.pressure ?? 0) / 100 * 1.4; m.extra.needle.visible = !m.partById.valve.broken; }
    if (m.extra.pipe) m.extra.pipe.visible = !m.partById.valve.broken;
    const chest = m.partById.chest;
    const recovering = a && [rain.id, pressure.id, stomp.id, brake.id].includes(a.id) && tau > Math.max(...a.inst.def.hits.map((h) => h.t1)) + .1;
    // An actually overlapping exposed core takes priority over neighbouring
    // crown/foreleg armour in wide weapon sweeps and the bow's clustered volley.
    chest.factor = (counter ? 1.2 : chest.broken || recovering ? 1.05 : chest.baseFactor) + (m._fb ?? 0);
    if (m.nodes.core) m.nodes.core.scale.x = chest.broken ? 1.65 : 1;
    for (const id of ['wingL', 'wingR']) if (m.extra.wings?.[id]) m.extra.wings[id].scale.x = m.partById[id].broken ? .64 : 1;
    if (!m.authority) return;
    m._pyroCounterCd = Math.max(0, (m._pyroCounterCd ?? 0) - dt);
    if (!counter) m.boilerCounter = 0;
    if (m.state === 'combat' && !m.tired && !a) m.pressure = Math.min(100, m.pressure + dt * (m.partById.valve.broken ? 1.5 : m.phase >= 2 ? 7 : 4.5));
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
    }
  },
  onDamage(m, res) {
    if (!m.authority || res.partId !== 'chest' || m.attack?.id !== pressure.id || m._pyroCounterCd > 0) return;
    const tau = m.attack.inst.sample(m.attack.t).tau;
    if (tau < PYRO.COUNTER_OPEN || tau >= PYRO.COUNTER_CLOSE) return;
    m.boilerCounter += res.dmg;
    if (m.boilerCounter >= PYRO.COUNTER_DAMAGE * Math.sqrt(Math.max(1, m.maxHp / pyrostur.hp))) {
      m._interrupt(); m._chainBreak(); m.queued = null; m.pressure = 0; m.boilerCounter = 0; m._pyroCounterCd = 18;
      m.stagT = Math.max(m.stagT, PYRO.COUNTER_TIME); m.recover = Math.max(m.recover, PYRO.COUNTER_TIME);
      m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
    }
  },
  onBreak(m, part) {
    if (part.id === 'chest') { part.factor = 1.05; m.pressure = 0; m.stagT = Math.max(m.stagT, PYRO.COUNTER_TIME); m.recover = Math.max(m.recover, PYRO.COUNTER_TIME); }
    if (part.id === 'valve') { m.pressure = Math.max(0, m.pressure - 45); part.factor = 1; }
    if (part.id === 'wingL' || part.id === 'wingR') { m.cds[rain.id] = Math.max(m.cds[rain.id] ?? 0, 12); for (const p of pounces) m.cds[p.id] = Math.max(m.cds[p.id] ?? 0, 8); part.factor = .85; }
  },
  onAttackEnd(m, id) {
    if (!id.startsWith('pyrostur_')) return;
    if (m.authority) {
      m._pyroHistory = [...(m._pyroHistory ?? []), id].slice(-4);
      const venting = [pressure.id, rain.id, vent.id, leak.id, breath.id, fan.id, brake.id].includes(id);
      m.pressure = Math.max(0, Math.min(100, (m.pressure ?? 0) + (venting ? -50 : m.phase >= 2 ? 16 : 11)));
      // Signatures always finish with a real opening, never an immediate branch.
      if ([pressure.id, rain.id, stomp.id, brake.id, doubleTail.id, fan.id].includes(id)) m.chainNext = null;
    }
  },
  speedFactor: (m) => (m.partById.wingL.broken || m.partById.wingR.broken ? .9 : 1),
  snapExtra: (m) => ({ pressure: Math.round(m.pressure ?? 0) }),
};
