// Voltiris, the broken frequency: an evasive duelist. He blinks to 14-20 m, fires in short salvos, charges the
// hunters (0-3, discharge = a lethal but rollable bolt), splits into afterimage echoes and closes the arena in a
// storm cage. Every strike is a deterministic AttackInstance; echoes, lanes and the cage come only from replicated
// attack events (voltirisEchoes.js). Design: docs/VOLTIRIS_ELDER_REWORK.md
import { compileTrack } from '../anim.js';
import { MREST } from './monster.js';
import { smooth, clamp01, targetBehind } from './common.js';
import { localToWorld, yawOf } from '../../core/math.js';
import { buildVoltiris, VOLT_SCALE } from './voltirisRig.js';
import { poseVoltirisPresence } from './voltirisMotion.js';
import { updateVoltirisFx } from './voltirisFx.js';
import { fireballDef } from './mprojectiles.js';
import { VOLT, state, installEchoes, tickVolt, clearVolt, addEcho, addLane, addCharge, liveEchoes, startCage, endCage } from './voltirisEchoes.js';
export { buildVoltiris, VOLT_SCALE } from './voltirisRig.js';
export { VOLT } from './voltirisEchoes.js';

export const VOLTIRIS = {
  COUNTER_DAMAGE: 360, COUNTER_TIME: 4, COUNTER_CD: 12, WING_EXPOSED: 1.4, SPIKE_PCT: .045, SPIKE_WINDOW: 2.5, STICKY_SECS: 3, STICKY_DIST: 5,
  ROLL_HINT: 0,
};
const REST = { ...MREST, bodyYaw: 0, wingL: 0, wingR: 0, elbowL: 0, elbowR: 0, wristL: 0, wristR: 0, tailCurl: 0, neckYaw: 0, headReach: 0, foreL: 0, foreR: 0, hindL: 0, hindR: 0, boiler: 0,
  foreKneeL: 0, foreKneeR: 0, foreAnkleL: 0, foreAnkleR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0 };
const track = (frames) => compileTrack(frames.map(([t, pose, mode]) => {
  const p = { ...REST, ...pose };
  const maxPitch = p.bodyY < -.1 ? 14 : 22, chainPitch = p.bodyPitch + p.neck * 180 / Math.PI;
  p.head = Math.max(-60 - chainPitch, Math.min(p.head, maxPitch - chainPitch));
  return [t, p, mode];
}), REST);
const cue = (tone = 'zisch') => ({ color: '#8de4df', tone });
const ID = (n) => 'voltiris_' + n;

// ---------------------------------------------------------------- geometry helpers
const ball = (t, x, z, radius, dmg, knock = 'flinch', extra) => ({ t0: t, t1: t + .13, shape: 'sphere', at: [x, 1, z], radius, dmg, knock, ...extra });
const line = (t, x0, z0, x1, z1, radius, dmg, knock = 'flinch', end = t + .13, extra) => ({ t0: t, t1: end, shape: 'capsule', from: [x0, 1, z0], to: [x1, 1, z1], radius, dmg, knock, ...extra });
const LT = { charge: true }; // lightning hits load the hunter (+1)
const worldAt = (inst, tau, lx, lz) => { const s = inst.sample(inst.wall(tau)); return localToWorld({}, { x: s.x, y: 0, z: s.z }, s.yaw, lx, 0, lz); };
const prepareAdvance = (max, stop = 3.4) => (a) => { a.len = Math.max(0, Math.min(max, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - stop)); };
const advance = (t, a, start, span) => { const k = smooth(clamp01((t - start) / span)); return { x: a.origin.x + a.dir.x * a.len * k, z: a.origin.z + a.dir.z * a.len * k }; };

// ---------------------------------------------------------------- pose vocabulary: tall, light, wings flared
const CAST = { bodyPitch: -10, head: -20, neck: -.14, jaw: 55, wing: 50, spread: 1, elbowL: -22, elbowR: -22, foreL: -12, foreR: -12, boiler: 1, tailPitch: 10 };
const SHOT = { bodyPitch: 8, head: 14, neck: .1, jaw: 65, wing: -14, headReach: .4, boiler: .8, foreL: -18, foreR: -18 };
const COIL = { bodyY: -.4, bodyPitch: 11, head: 26, neck: .14, jaw: 30, wing: 22, hindL: 26, hindR: 26, tailPitch: -8, boiler: .6 };
const LUNGE = { bodyPitch: 14, head: 24, neck: .2, jaw: 62, wing: -18, foreL: -45, foreR: -45, hindL: 18, hindR: 18, headReach: .6 };
const EXPOSE = { bodyY: -.3, bodyPitch: 6, head: 14, jaw: 25, wing: 8, hindL: 14, hindR: 14, boiler: .5 };
const VANISH = { bodyY: -.3, bodyPitch: 12, head: 22, jaw: 0, wing: -28, spread: 0, boiler: 1, tailPitch: -16 };
const FLAP_UP = { wing: 70, spread: 1, elbowL: -35, elbowR: -35, foreL: -25, foreR: -25, hindL: -20, hindR: -20, bodyPitch: -8, boiler: 1 };
const FLAP_DN = { wing: -36, spread: 1, elbowL: 20, elbowR: 20, foreL: -25, foreR: -25, hindL: -20, hindR: -20, bodyPitch: -2, boiler: 1 };
const CRASHED = { bodyY: -.55, bodyPitch: 14, head: 24, jaw: 20, wing: -30, foreL: 30, foreR: 30, boiler: 1 };

const shootPose = (tg, fireT, end) => track([[0, {}], [tg * .6, { ...CAST, boiler: .7 }], [tg - .02, CAST], [fireT + .06, SHOT], [fireT + .5, EXPOSE], [end - .4, EXPOSE], [end, {}]]);
const meleePose = (tg, hitT, end, wind = COIL, hit = LUNGE) => track([[0, {}], [tg * .6, wind], [hitT - .08, wind], [hitT + .06, hit], [hitT + .5, EXPOSE], [end - .4, EXPOSE], [end, {}]]);
const blinkPose = (tv, ta, end, after = COIL, hitT = null) => track([[0, {}], [tv * .6, { ...COIL, boiler: 1 }], [tv, VANISH], [ta, VANISH], [ta + .18, after], ...(hitT ? [[hitT + .06, LUNGE]] : []), [Math.max(end - .5, (hitT ?? ta) + .3), EXPOSE], [end, {}]]);
// A big cast hovers (wings beat) and opens the antenna crown: the Kurzschluss window.
const hoverPose = (tg, end, extra = []) => track([[0, {}], [.3, { ...CAST, boiler: .6 }], [.6, FLAP_UP], [.9, FLAP_DN], [1.2, FLAP_UP], [tg - .1, { ...CAST, wing: 62, boiler: 1 }], [tg + .1, SHOT], ...extra, [end - .6, EXPOSE], [end, {}]]);

// ---------------------------------------------------------------- blinks (teleports with a 0.6 s exit marker)
const BLINK_V = .34, BLINK_A = .6;
/** Pure function of the attack params: where he reappears. 'away' uses params.yaw as the bearing hunter->exit (host picks it). */
function blinker(kind, tv = BLINK_V, ta = BLINK_A) {
  return {
    blink: kind, blinkGap: [tv, ta], noFace: true,
    prepare(a) {
      const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
      a.f0 = yawOf(dx, dz) || a.yaw0;
      if (kind === 'away') { const R = 14 + 6 * a.r(0); a.dest = { x: a.target.x + Math.sin(a.yaw0) * R, z: a.target.z + Math.cos(a.yaw0) * R }; }
      else if (kind === 'behind') a.dest = { x: a.target.x + dx / d * 3.9, z: a.target.z + dz / d * 3.9 };
      else if (kind === 'through') a.dest = { x: a.target.x + dx / d * 5.6, z: a.target.z + dz / d * 5.6 };
      else if (kind === 'cage') a.dest = { x: a.target.x - dx / d * 10, z: a.target.z - dz / d * 10 };
      a.f1 = kind === 'through' ? a.f0 : yawOf(a.target.x - a.dest.x, a.target.z - a.dest.z);
    },
    motion(t, a) { return t >= ta ? { x: a.dest.x, z: a.dest.z, yaw: a.f1 } : { x: a.origin.x, z: a.origin.z, yaw: a.f0 }; },
  };
}
const blinkEvents = (tv = BLINK_V, ta = BLINK_A) => [{ t: 0, call: 'mark', all: true }, { t: tv, call: 'vanish', all: true }, { t: ta, call: 'appear', all: true }];
const exitKey = (m) => `${m.id}:exit`;
const blinkCalls = {
  mark(m, ctx, inst) { const d = inst.dest; ctx.fx.marker?.(exitKey(m), { x: d.x, y: ctx.world.heightAt(d.x, d.z), z: d.z }, 2.6, '#8de4df', false); state(m).exit = true; },
  vanish(m, ctx, inst, age) {
    ctx.bus.emit('sfx', { name: 'glitch', pos: m.pos, vol: .6 });
    ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 4, z: m.pos.z }, 20, '#8de4df', 7);
    addEcho(m, inst.origin.x, inst.origin.z, { age, key: `${inst.key}:echo`, yaw: inst.f0 });
  },
  appear(m, ctx, inst) {
    ctx.fx.clearMarker?.(exitKey(m)); state(m).exit = false;
    const d = inst.dest;
    ctx.bus.emit('sfx', { name: 'glitch', pos: d, vol: .6 });
    ctx.fx.spark?.({ x: d.x, y: m.ctx.world.heightAt(d.x, d.z) + 4, z: d.z }, 24, '#ffffff', 8);
    ctx.fx.shake?.(.12, .15);
  },
};

// ---------------------------------------------------------------- attack factory
const moves = [];
function attack(name, config) {
  const id = ID(name), baseWeight = config.weight ?? 4;
  const def = { id, range: [0, 20], cooldown: 4, telegraph: .7, duration: 2.2, tgVar: false, markerFromHits: true, cue: cue(), flashParts: ['antenna'], audit: [4, 9], vfx: 'bolt', markerLead: .8, ...config,
    weight: (m, d) => {
      const raw = typeof baseWeight === 'function' ? baseWeight(m, d) : baseWeight;
      const recent = m._voltHistory ?? [];
      return raw * (recent.at(-1) === id ? .03 : recent.includes(id) ? .25 : 1);
    },
  };
  def.hits ??= [];
  const base = def.calls ?? {};
  def.calls = { track(m, ctx, inst) { state(m).aim = { x: inst.target.x, z: inst.target.z }; }, impact: impactFx, ...(def.blink ? blinkCalls : {}), ...base };
  const evs = def.events ?? [...new Set(def.hits.map((h) => h.t0))].map((t) => ({ t, call: 'impact', all: true }));
  def.events = [{ t: .01, call: 'track', all: true }, ...(def.blink ? blinkEvents(...def.blinkGap) : []), ...evs];
  def.flashParts = def.flashParts.filter((p) => p === 'antenna' || p === 'head' || p === 'tail' || p === 'wing' || p === 'body');
  for (const h of def.hits) h.group ??= `impact:${h.t0}`;
  moves.push(def); return def;
}
function impactFx(m, ctx) {
  ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
  ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 2, z: m.pos.z }, 12, '#8de4df', 6);
  ctx.fx.shake?.(.16, .18);
}

/** Volley of volt bolts from the mouth: shots [{ delay, rot (rad), side (m), dmg }] at the committed (led) target. */
function volley(m, inst, age, tau, shots) {
  const from = worldAt(inst, tau, 0, 3), y = (inst.origin.y ?? 0) + 6.4;
  const dx = inst.target.x - from.x, dz = inst.target.z - from.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  shots.forEach((s, i) => {
    const c = Math.cos(s.rot ?? 0), sn = Math.sin(s.rot ?? 0), rx = ux * c + uz * sn, rz = -ux * sn + uz * c;
    const aim = { x: from.x + rx * L + -uz * (s.side ?? 0), y: (inst.target.y ?? 0) + 1, z: from.z + rz * L + ux * (s.side ?? 0) };
    const def = fireballDef({ from: { x: from.x, y, z: from.z }, aim, speed: s.speed ?? 27, extra: 12, radius: .65, dmg: s.dmg, key: `${inst.key}:b${i}`, status: null });
    m.projectiles.spawn({ ...def, kind: 'volt', attackId: inst.params.attackId }, age - (s.delay ?? 0));
  });
  m.ctx.fx.clearMarker?.(`${m.id}:aim`); state(m).aimOn = false;
  m.ctx.bus.emit('sfx', { name: 'windup', pos: m.pos, timbre: 'zisch', f: 980, dur: .12 });
}
const aimMark = (m, ctx, inst) => (state(m).aimOn = true) && ctx.fx.marker?.(`${m.id}:aim`, { x: inst.target.x, y: ctx.world.heightAt(inst.target.x, inst.target.z), z: inst.target.z }, 1.5, '#8de4df', false);
const SIDE = { dist: (m) => m.target ? Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) : 10 };
const hugging = (m) => (m._hugT ?? 0) > 1.2;
const echoCount = (m) => liveEchoes(m).length;
// Ranged damage from afar makes the duelist answer in kind: up to 3x weight on bolts, strikes and lanes.
const snipe = (m) => 1 + Math.min(2, (m._snipeT ?? 0) / 3) + Math.min(1, (m._farT ?? 0) / 8);

// ---------------------------------------------------------------- quick strikes
const bite = attack('prismenbiss', {
  range: [0, 7], weight: (m, d) => (d < 5 ? 7 : 3), cooldown: 2.5, telegraph: .62, duration: 2.05, audit: [3, 6], flashParts: ['head'],
  prepare: prepareAdvance(3.8, 3.5), motion(t, a) { return advance(t, a, .4, .22); },
  hits: [ball(.7, 0, 3.4, 1.65, 135)],
  pose: meleePose(.62, .7, 2.05),
});
const wingEdge = attack('fluegelkante', {
  range: [0, 7], weight: (m, d) => (d < 5.5 ? 6 : 3), cooldown: 3, telegraph: .7, duration: 2.15, audit: [3, 5], flashParts: ['wing'],
  prepare: prepareAdvance(3.5, 2.2), motion(t, a) { return advance(t, a, .45, .22); },
  hits: [line(.78, -4, 2, 4, 2, 1, 145, 'flinch', .92)],
  pose: track([[0, {}], [.5, { ...COIL, wing: 60, spread: 1, bodyRoll: -10 }], [.7, { ...COIL, wing: 62, bodyRoll: -12 }], [.84, { bodyPitch: 10, wing: -30, bodyRoll: 14, head: 20 }], [1.3, EXPOSE], [1.7, EXPOSE], [2.15, {}]]),
});
const tail = attack('rueckkopplung', {
  range: [0, 9], weight: (m) => (targetBehind(m) ? 9 : 1), cond: (m) => targetBehind(m), noFace: true, cooldown: 4, telegraph: .72, duration: 2.1, audit: [2, 5], flashParts: ['tail'],
  hits: [ball(.8, 0, -4.6, 2.8, 150)],
  pose: track([[0, {}], [.55, { ...COIL, tailPitch: 60, tailYaw: 25, bodyRoll: -8 }], [.76, { ...COIL, tailPitch: 55, tailYaw: 28 }], [.9, { bodyPitch: -6, tailPitch: -12, tailYaw: -25, wing: 30 }], [1.4, EXPOSE], [1.7, EXPOSE], [2.1, {}]]),
});
const stab = attack('antennenstoss', {
  range: [2, 13], weight: (m, d) => (d < 9 ? 5 : 2), cooldown: 4, telegraph: .72, duration: 2.15, audit: [4, 8], flashParts: ['antenna'],
  hits: [line(.85, 0, 2, 0, 11, .85, 140, 'flinch', .98, LT)],
  pose: meleePose(.72, .85, 2.15, { ...COIL, head: -10, neck: -.1 }),
});
const double = attack('doppelblitz', {
  range: [6, 32], weight: (m, d) => (d > 12 ? 9 : 4) * snipe(m), lead: 1.15, cooldown: 3, telegraph: .66, duration: 2.1, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .66, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    fire(m, ctx, inst, age) { volley(m, inst, age, .66, [{ side: -.45, dmg: 155 }, { side: .45, delay: .2, dmg: 155 }]); },
  },
  pose: shootPose(.66, .66, 2.1),
});
const fan = attack('faecherblitz', {
  range: [6, 30], weight: (m, d) => (d > 10 ? 5 : 3) * snipe(m), lead: 1.1, cooldown: 4, telegraph: .75, duration: 2.25, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .75, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    fire(m, ctx, inst, age) { volley(m, inst, age, .75, [{ rot: -.2, dmg: 145 }, { rot: 0, dmg: 145, delay: .05 }, { rot: .2, dmg: 145, delay: .1 }]); },
  },
  pose: shootPose(.75, .75, 2.25),
});
// Full circle of the wings: hugging his flanks or tail is never free.
const whirl = attack('fluegelwirbel', {
  range: [0, 6.5], weight: (m) => (hugging(m) ? 9 : 4), noFace: true, cooldown: 5, telegraph: .72, duration: 2.45, audit: [0, 3], flashParts: ['wing'],
  motion(t, a) { return { yaw: a.yaw0 - .5 * smooth(clamp01(t / .6)) + (Math.PI * 2 + .5) * smooth(clamp01((t - .7) / .55)) }; },
  hits: [line(.76, 0, 1.4, 0, 5.8, 1.2, 140, 'flinch', 1.22)],
  pose: track([[0, {}], [.6, { ...COIL, wing: 70, spread: 1, bodyRoll: -14, bodyYaw: -12 }], [.9, { bodyY: -.2, bodyRoll: 14, wing: 40, spread: 1 }], [1.3, EXPOSE], [1.9, EXPOSE], [2.45, {}]]),
});

// ---------------------------------------------------------------- mobility: blink and strike
const blinkHit = attack('blinkhieb', {
  ...blinker('behind', .38, .66), range: [7, 30], weight: (m, d) => (d > 9 ? 2 : 1.2), lead: .5, cooldown: 12, telegraph: .66, duration: 2.5, audit: [8, 14, 20], flashParts: ['antenna'],
  hits: [ball(1.22, 0, 3.4, 1.7, 150, 'flinch', LT)],
  pose: blinkPose(.38, .66, 2.5, COIL, 1.22),
});
const through = attack('phasenstich', {
  ...blinker('through', .5, .78), range: [7, 26], weight: (m, d) => (d > 9 ? 1.6 : 1), lead: .4, cooldown: 12, telegraph: .78, duration: 2.65, audit: [8, 14, 20], flashParts: ['head'],
  hits: [line(1.3, 0, -9, 0, 1.5, 1.15, 150, 'down', 1.43, LT)],
  pose: blinkPose(.5, .78, 2.65, LUNGE, 1.3),
});
const retreat = attack('rueckzugsblink', {
  ...blinker('away', BLINK_V, BLINK_A), range: [0, 11], weight: (m, d) => 3 + (hugging(m) ? 6 : 0) + (m.phase >= 2 ? 2 : 0), cond: (m) => SIDE.dist(m) < 11, cooldown: 6, telegraph: .66, duration: 2.4, audit: [3, 6, 9], flashParts: ['antenna'], lead: .6,
  events: [{ t: .05, call: 'aim', all: true }, { t: 1.12, call: 'fire', all: true }],
  calls: { aim: aimMark, fire(m, ctx, inst, age) { volley(m, inst, age, 1.12, [{ dmg: 155 }]); } },
  pose: blinkPose(BLINK_V, BLINK_A, 2.4, CAST),
});
// Pure relocation: used after salvos, against huggers and after big damage spikes.
const blink = attack('blink', {
  ...blinker('away'), internal: true, noTeach: true, range: [0, 400], weight: 0, cooldown: 0, telegraph: BLINK_A, duration: 1.6, audit: undefined, hits: [], vfx: 'blink',
  pose: blinkPose(BLINK_V, BLINK_A, 1.6, COIL),
});

// ---------------------------------------------------------------- control: lanes, lasers, sprint, storms
const LANES = [-6.5, 0, 6.5];
const laneCall = (tau, xs) => (m, ctx, inst, age) => {
  for (const x of xs) { const a = worldAt(inst, tau, x, 3), b = worldAt(inst, tau, x, 19); addLane(m, a.x, a.z, b.x, b.z, { age, key: `${inst.key}:l${x}` }); }
  ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
};
// Big casts hover: antenna or core damage in this window shorts him out (Kurzschluss).
const hover = (tg, h = 2.4) => (t) => h * smooth(clamp01((t - .2) / .5)) * (1 - smooth(clamp01((t - (tg - .22)) / .22)));
const rasterHover = hover(1.5);
const raster = attack('blitzraster', {
  range: [5, 28], weight: (m, d) => (d > 11 ? 5 : 3) * snipe(m), cooldown: 10, telegraph: 1.5, duration: 3.9, audit: [5, 9], lockedByBreak: 'antenna', punishWindow: 2, shortWindow: [.45, 1.42], vfx: 'raster', markerLead: 1.2, lead: 1.2,
  motion(t) { return { air: rasterHover(t) }; },
  hits: LANES.map((x) => line(1.5, x, 3, x, 19, .85, 190, 'flinch', 1.63, LT)),
  events: [{ t: 1.5, call: 'lanes', all: true }],
  calls: { lanes: laneCall(1.52, LANES) },
  pose: hoverPose(1.5, 3.9),
});
const rasterBroken = attack('blitzraster_bruch', {
  range: [5, 28], weight: (m, d) => (d > 11 ? 5 : 3) * snipe(m), cooldown: 10, telegraph: 1.5, duration: 3.9, audit: [5, 9], needsBroken: 'antenna', punishWindow: 2, shortWindow: [.45, 1.42], vfx: 'raster', markerLead: 1.2, lead: 1.2,
  motion(t) { return { air: rasterHover(t) }; },
  hits: [-6.5, 6.5].map((x) => line(1.5, x, 3, x, 19, .85, 190, 'flinch', 1.63, LT)),
  events: [{ t: 1.5, call: 'lanes', all: true }],
  calls: { lanes: laneCall(1.52, [-6.5, 6.5]) },
  pose: hoverPose(1.5, 3.9),
});
const zigHover = hover(1.4);
const zigzag = attack('zickzacklaser', {
  range: [5, 26], phase: 1, weight: (m, d) => (d > 10 ? 5 : 3) * snipe(m), cooldown: 11, telegraph: 1.4, duration: 4.8, audit: [6, 12], punishWindow: 2, shortWindow: [.45, 1.32], vfx: 'laser', markerLead: 1.2, lead: .3, punishRoll: true,
  motion(t) { return { air: zigHover(t) }; },
  hits: [line(1.4, -3.2, 3, -3.2, 18, .85, 180, 'flinch', 1.53, LT), line(2, 3.2, 3, 3.2, 18, .85, 180, 'flinch', 2.13, LT), line(2.6, 0, 4, 0, 20, .85, 190, 'down', 2.73, LT)],
  pose: track([[0, {}], [.3, { ...CAST, boiler: .6 }], [.6, FLAP_UP], [.9, FLAP_DN], [1.28, { ...CAST, headYaw: -22, wing: 62 }], [1.5, { ...SHOT, headYaw: -22 }], [1.9, { ...CAST, headYaw: 22 }], [2.1, { ...SHOT, headYaw: 22 }], [2.5, { ...CAST, headYaw: 0 }], [2.7, { ...SHOT, bodyPitch: 14 }], [3.2, CRASHED], [4.2, EXPOSE], [4.8, {}]]),
});
const sprint = attack('bahnsprint', {
  range: [8, 26], weight: (m, d) => (d > 11 ? 2 : 1.2) * snipe(m), cooldown: 12, telegraph: .85, duration: 2.7, audit: [8, 14, 20], flashParts: ['antenna'], lead: .3,
  prepare(a) { const d = Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z); a.len = Math.max(0, Math.min(18, d - 3.2)); },
  motion(t, a) { const k = smooth(clamp01((t - .72) / .28)); return { x: a.origin.x + a.dir.x * a.len * k, z: a.origin.z + a.dir.z * a.len * k }; },
  hits: [line(.85, 0, 1.2, 0, 4.8, 1.3, 150, 'down', 1.08, LT)],
  events: [{ t: .72, call: 'dash', all: true }, { t: 1.04, call: 'lane', all: true }],
  calls: {
    dash(m, ctx) { ctx.bus.emit('sfx', { name: 'swing', pos: m.pos, heavy: true }); ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 3, z: m.pos.z }, 16, '#8de4df', 7); },
    lane(m, ctx, inst, age) { const a = worldAt(inst, .7, 0, 0), b = worldAt(inst, 1.08, 0, 0); if (Math.hypot(b.x - a.x, b.z - a.z) > 3) addLane(m, a.x, a.z, b.x, b.z, { age, key: `${inst.key}:sprint` }); },
  },
  pose: track([[0, {}], [.55, { ...COIL, bodyY: -.55, wing: 40, spread: 1 }], [.74, { ...COIL, bodyY: -.6 }], [.86, { ...LUNGE, bodyPitch: 20, wing: 35 }], [1.1, { ...LUNGE, bodyPitch: 6 }], [1.6, EXPOSE], [2.2, EXPOSE], [2.7, {}]]),
});
const STORM = [ball(1.6, 0, 6, 2.25, 185, 'flinch', LT), ball(2.9, 0, 6, 2.25, 195, 'flinch', LT), ...[-1, 1].flatMap((s) => [ball(1.6, s * 4.4, 5, 2.25, 185, 'flinch', LT), ball(2.25, s * 7.4, 10, 2.25, 185, 'flinch', LT), ball(2.9, s * 4.4, 15, 2.25, 195, 'flinch', LT)])];
const stormHover = hover(1.6);
const storm = attack('prismensturm', {
  range: [0, 26], phase: 1, weight: (m, d) => (d > 10 ? 4 : 3), cooldown: 16, telegraph: 1.6, duration: 5.1, audit: [4, 10], lockedByBreak: 'antenna', punishWindow: 2, shortWindow: [.5, 1.52], vfx: 'storm', markerLead: 1.3,
  motion(t) { return { air: stormHover(t) }; },
  hits: STORM,
  pose: hoverPose(1.6, 5.1, [[2.4, CAST], [3.1, SHOT], [3.6, CRASHED]]),
});
const stormBroken = attack('prismensturm_bruch', {
  range: [0, 26], phase: 1, weight: (m, d) => (d > 10 ? 4 : 3), cooldown: 16, telegraph: 1.6, duration: 5.1, audit: [4, 10], needsBroken: 'antenna', punishWindow: 2, shortWindow: [.5, 1.52], vfx: 'storm', markerLead: 1.3,
  motion(t) { return { air: stormHover(t) }; },
  hits: STORM.filter((h) => h.at[0] > 0).map((h) => ({ ...h })),
  pose: hoverPose(1.6, 5.1, [[2.4, CAST], [3.1, SHOT], [3.6, CRASHED]]),
});
// Echoes bite from the sides while the original fires: shatter them (+charge) or read which one is real.
const series = attack('nachbildserie', {
  range: [6, 30], weight: (m, d) => (d > 10 ? 3 : 2), lead: .7, cooldown: 14, telegraph: .95, duration: 3, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .95, call: 'spawn', all: true }, { t: 1.05, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    spawn(m, ctx, inst, age) {
      const spots = [[-7.5, 3], [7.5, 3], [0, -6.5]].slice(0, m.phase >= 1 ? 3 : 2);
      spots.forEach(([lx, lz], i) => { const w = worldAt(inst, .95, lx, lz); addEcho(m, w.x, w.z, { age, key: `${inst.key}:s${i}`, yaw: inst.yaw0, offset: -.5 + i * .55, volleys: [.9 + i * .45] }); });
      ctx.bus.emit('sfx', { name: 'glitch', pos: m.pos, vol: .7 });
    },
    fire(m, ctx, inst, age) { volley(m, inst, age, 1.05, [{ dmg: 135 }]); },
  },
  pose: shootPose(.95, 1.05, 3),
});
// Chain lightning: the original and every afterimage fire in turn at the committed point.
const chain = attack('kettenblitz', {
  range: [8, 30], weight: (m, d) => (echoCount(m) > 0 ? (d > 11 ? 5 : 3) * snipe(m) : 0), cond: (m) => echoCount(m) > 0, lead: .6, cooldown: 9, telegraph: .8, duration: 2.7, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .8, call: 'hop', all: true }],
  calls: {
    aim: aimMark,
    hop(m, ctx, inst, age) {
      volley(m, inst, age, .8, [{ dmg: 145 }]);
      liveEchoes(m).forEach((e, i) => {
        const gy = ctx.world.heightAt(e.x, e.z), from = { x: e.x, y: gy + 2.2, z: e.z };
        const def = fireballDef({ from, aim: { x: inst.target.x, y: (inst.target.y ?? 0) + 1, z: inst.target.z }, speed: 26, extra: 10, radius: .65, dmg: Math.round(VOLT.ECHO_BOLT * VOLT.ECHO_MUL), key: `${inst.key}:c${i}`, status: null });
        m.projectiles.spawn({ ...def, kind: 'volt', attackId: inst.params.attackId }, age - .22 * (i + 1));
      });
    },
  },
  pose: shootPose(.8, .8, 2.7),
});
// Ground strikes: one on the hunter, two on the sidesteps, each marked on the floor.
const strike = attack('gewitterschlag', {
  range: [6, 34], weight: (m, d) => (d > 12 ? 6 : 3) * snipe(m), lead: 1.6, cooldown: 7, telegraph: .9, duration: 2.7, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .9, call: 'bolts', all: true }],
  calls: {
    bolts(m, ctx, inst, age) {
      const T = inst.target, dx = T.x - inst.origin.x, dz = T.z - inst.origin.z, l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
      [[0, 0], [5.4, .3], [-5.4, .6]].forEach(([side, delay], i) => {
        const to = { x: T.x + px * side, y: T.y ?? 0, z: T.z + pz * side }, dur = .95 + delay;
        m.projectiles.spawn({ kind: 'volt', mode: 'impact', from: { x: m.pos.x, y: m.pos.y + 6.4, z: m.pos.z }, to, dur, arc: 11, radius: .5, splash: 2.3, hold: .2, dmg: 175, knock: 'down', key: `${inst.key}:g${i}`, attackId: inst.params.attackId }, age);
      });
      ctx.bus.emit('sfx', { name: 'windup', pos: m.pos, timbre: 'zisch', f: 760, dur: .18 });
    },
  },
  pose: shootPose(.9, .9, 2.7),
});

// ---------------------------------------------------------------- signatures: punish, earn the opening
// Klebe-Strafe: queued after >3 s under 5 m, always followed by a blink away.
const nova = attack('statiknova', {
  range: [0, 7], weight: 0, cond: () => false, noFace: true, cooldown: 12, telegraph: .6, duration: 2.8, audit: [1.5, 3.5], flashParts: ['body'], punishWindow: 1.6, vfx: 'nova',
  hits: [ball(.62, 0, 0, 5, 170, 'down', LT)],
  events: [{ t: .62, call: 'nova', all: true }],
  calls: { nova(m, ctx) { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 1.5, z: m.pos.z }, 36, '#8de4df', 10); ctx.fx.shake?.(.35, .3); ctx.fx.ring?.({ x: m.pos.x, y: m.pos.y, z: m.pos.z }, 1, 5.4, { color: '#8de4df', life: .35 }); } },
  pose: track([[0, {}], [.3, { ...COIL, bodyY: -.55, wing: 50, spread: 1, boiler: 1 }], [.58, { ...COIL, bodyY: -.6, wing: 60, boiler: 1 }], [.7, { bodyPitch: -16, wing: -40, head: -20, jaw: 70, bodyY: .1, boiler: 1 }], [1.4, EXPOSE], [2.3, EXPOSE], [2.8, {}]]),
});
const collapse = attack('kernbruch', {
  range: [0, 10], phase: 2, weight: (m, d) => (d < 7 ? 4 : 1), noFace: true, cooldown: 15, telegraph: 1.35, duration: 4, audit: [3, 5], flashParts: ['body'], punishWindow: 2, vfx: 'nova', markerLead: 1.2,
  prepare: prepareAdvance(6, 0.5), motion(t, a) { return advance(t, a, .6, .5); },
  hits: [ball(1.45, 0, 0, 5.6, 220, 'down', LT)],
  pose: track([[0, {}], [.7, { ...COIL, bodyY: -.5, wing: 55, spread: 1, boiler: 1 }], [1.35, { ...COIL, bodyY: -.6, boiler: 1 }], [1.5, { bodyPitch: -14, wing: -40, head: -22, jaw: 80, boiler: 1 }], [2.3, CRASHED], [3.5, EXPOSE], [4, {}]]),
});
// Gewitterkäfig: a shrinking wall and two counter-rotating lighthouse beams. He hovers in the centre until
// the cage ends, then crashes and lies open for 3 s. Entities live in voltirisEchoes.js (events `cage`/`crash`).
const CAGE_TG = 1.8, CAGE_END = CAGE_TG + VOLT.CAGE_HOLD, CAGE_DUR = CAGE_END + .5 + VOLT.CRASH_TIME;
const cage = attack('gewitterkaefig', {
  ...blinker('cage', .38, .66), range: [0, 400], phase: 2, weight: 0, cond: () => false, cooldown: 80, telegraph: CAGE_TG, duration: CAGE_DUR, audit: undefined, punishWindow: VOLT.CRASH_TIME, shortWindow: [.9, 1.75], vfx: 'cage', flashParts: ['antenna'],
  motion(t, a) {
    const base = t >= .66 ? { x: a.dest.x, z: a.dest.z, yaw: a.f1 } : { x: a.origin.x, z: a.origin.z, yaw: a.f0 };
    const up = smooth(clamp01((t - .8) / .7)), down = smooth(clamp01((t - CAGE_END) / .35));
    return { ...base, air: 2.6 * up * (1 - down) };
  },
  hits: [],
  events: [{ t: CAGE_TG, call: 'cage', all: true }, { t: CAGE_END, call: 'crash', all: true }],
  calls: {
    cage(m, ctx, inst, age) {
      const c = inst.dest;
      startCage(m, c.x, c.z, { age, speed: inst.speed, th0: yawOf(inst.target.x - c.x, inst.target.z - c.z) + .35, key: inst.key });
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.shake?.(.4, .5); ctx.fx.flash?.('rgba(141,228,223,.35)', .4);
      ctx.bus.emit('voltCage', { monster: m, on: true });
    },
    crash(m, ctx) {
      endCage(m);
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 2, z: m.pos.z }, 40, '#8de4df', 10); ctx.fx.shake?.(.5, .4);
      m.exposedT = Math.max(m.exposedT ?? 0, VOLT.CRASH_TIME);
      ctx.bus.emit('voltCage', { monster: m, on: false });
    },
  },
  pose: track([[0, {}], [.3, { ...COIL, boiler: 1 }], [.38, VANISH], [.66, VANISH], [.9, FLAP_UP], [1.2, FLAP_DN], [1.5, FLAP_UP], [CAGE_TG - .1, { ...CAST, wing: 66 }], [CAGE_TG + .2, { ...CAST, wing: 70, boiler: 1 }], [CAGE_END - .4, { ...FLAP_DN, boiler: 1 }], [CAGE_END + .3, CRASHED], [CAGE_END + 1, { ...CRASHED, wing: -36 }], [CAGE_DUR - .6, EXPOSE], [CAGE_DUR, {}]]),
});

// ---------------------------------------------------------------- AI glue
const SIGNATURES = [raster.id, rasterBroken.id, zigzag.id, storm.id, stormBroken.id, collapse.id, cage.id, nova.id];
const RELOCATING = new Set([blink.id, blinkHit.id, through.id, retreat.id, cage.id]);
const BIG = new Set([raster.id, rasterBroken.id, zigzag.id, storm.id, stormBroken.id, cage.id]);
// Salvo links: base weight, a touch more in later states (the last state blinks and loads faster).
const link = (atk, w, cond) => [{ atk, w, cond }, { atk, w: w * .5, cond: (m, d) => m.phase >= 1 && (!cond || cond(m, d)) }];
const close = (m, d) => d < 9;
const far = (m, d) => d > 8;
const END = (w) => ({ atk: null, w });

export const voltiris = {
  id: 'voltiris', name: 'Voltiris, die gebrochene Frequenz', hp: 23000, scale: VOLT_SCALE, bodyRadius: 2.1,
  cueParts: ['antenna'], cueIntensity: .3,
  walk: 4.6, run: 10, turn: 2.4, detect: 40, prefer: 15.5, predator: true, flinchDmg: 1500, chainMax: 2, teachAttack: double.id,
  drops: ['voltiris_flimmerfeder', 'voltiris_horn', 'voltiris_antenne', 'voltiris_kristall'],
  poseDefaults: REST, locomotionPose: poseVoltirisPresence,
  build: () => buildVoltiris(),
  attacks: Object.fromEntries(moves.map((a) => [a.id, a])),
  recoverAfter: (m) => [.66, .56, .5][m?.phase ?? 0] ?? .5,
  attackTempo: (m) => (m.phase >= 2 ? 1.08 : 1),
  // Duelist aim: lead the hunter's running line, and pick blink exits 14-20 m from him, offset sideways.
  aimTarget(m, def, tgt) {
    if (def.blink === 'away') {
      const bearing = Math.atan2(m.pos.x - tgt.pos.x, m.pos.z - tgt.pos.z), side = m.rng() < .5 ? -1 : 1, world = m.ctx.world;
      const tries = [[.75 * side, 1], [1.15 * side, 1], [.75 * -side, 1], [1.15 * -side, 1], [1.9 * side, 1], [Math.PI, 1], [.4 * side, 1]];
      let best = null, bestScore = Infinity;
      for (const [off] of tries) {
        const yaw = bearing + off;
        let worst = 0;
        for (const R of [14, 17, 20]) { const q = { x: tgt.pos.x + Math.sin(yaw) * R, y: 0, z: tgt.pos.z + Math.cos(yaw) * R }, ox = q.x, oz = q.z; world.collide?.(q, m.bodyRadius * .5); worst = Math.max(worst, Math.hypot(q.x - ox, q.z - oz)); }
        if (worst < bestScore - 1e-6) { bestScore = worst; best = yaw; }
        if (worst < .6) break;
      }
      return { pos: { x: tgt.pos.x, y: tgt.pos.y, z: tgt.pos.z }, yaw: best ?? bearing };
    }
    const lead = def.lead ?? 0, v = m._tv;
    if (!lead || !v) return null;
    let ox = v.x * lead, oz = v.z * lead;
    const l = Math.hypot(ox, oz), cap = 8;
    if (l > cap) { ox *= cap / l; oz *= cap / l; }
    return { pos: { x: tgt.pos.x + ox, y: tgt.pos.y, z: tgt.pos.z + oz } };
  },
  parts: [
    { id: 'antenna', label: 'Antennenkrone', factor: 1.05, breakHp: 2100, spheres: [{ node: 'antenna', offset: [0, 1.1, .1], r: .8 }, { node: 'antenna', offset: [0, 1.9, .1], r: .6 }] },
    { id: 'head', label: 'Prismenkopf', factor: 1.15, blunt: true, stunPart: true, spheres: [{ node: 'head', offset: [0, 0, .45], r: .75 }] },
    { id: 'wing', label: 'Prismaflügel', factor: .9, breakHp: 2700, spheres: [{ node: 'wingL', offset: [.9, -.5, .2], r: .95 }, { node: 'elbowL', offset: [.4, 0, .2], r: .65 }, { node: 'wristL', offset: [0, 0, 0], r: .6 }, { node: 'wingR', offset: [-.9, -.5, .2], r: .95 }, { node: 'elbowR', offset: [-.4, 0, .2], r: .65 }, { node: 'wristR', offset: [0, 0, 0], r: .6 }] },
    { id: 'body', label: 'Frequenzkern', factor: .8, spheres: [{ node: 'chest', offset: [0, -.3, .2], r: .95 }, { node: 'body', offset: [0, -.2, -.5], r: .95 }] },
    { id: 'legs', label: 'Läufe', factor: .85, spheres: [{ node: 'kneeL', offset: [0, -.2, 0], r: .6 }, { node: 'kneeR', offset: [0, -.2, 0], r: .6 }, { node: 'ankleForeL', offset: [0, .3, .2], r: .6 }, { node: 'ankleForeR', offset: [0, .3, .2], r: .6 }, { node: 'ankleL', offset: [0, .3, .2], r: .6 }, { node: 'ankleR', offset: [0, .3, .2], r: .6 }] },
    { id: 'tail', label: 'Datenschweif', factor: .85, spheres: [{ node: 'tail', offset: [0, 0, -.8], r: .65 }, { node: 'tailMid', offset: [0, 0, -.8], r: .55 }] },
  ].map((p) => ({ elem: elements(), ...p })),
  // Salvos: 2-3 quick strikes (0.55-0.8 s telegraph), then a blink (queued in onAttackEnd).
  chains: {
    [bite.id]: [...link(wingEdge.id, 5, close), ...link(whirl.id, 3, close), ...link(retreat.id, 3, close), END(1)],
    [wingEdge.id]: [...link(bite.id, 4, close), ...link(stab.id, 3), ...link(retreat.id, 3, close), END(1)],
    [tail.id]: [...link(whirl.id, 4), ...link(retreat.id, 4), END(1)],
    [whirl.id]: [...link(retreat.id, 4), ...link(stab.id, 3), END(1)],
    [stab.id]: [...link(double.id, 4, far), ...link(bite.id, 3, close), ...link(retreat.id, 3, close), END(1)],
    [double.id]: [...link(fan.id, 5, far), ...link(strike.id, 4, far), ...link(stab.id, 2), ...link(chain.id, 3, (m) => echoCount(m) > 0), END(1.5)],
    [fan.id]: [...link(double.id, 4, far), ...link(strike.id, 4, far), ...link(blinkHit.id, 3, far), END(1.5)],
    [strike.id]: [...link(double.id, 4, far), ...link(fan.id, 3, far), ...link(through.id, 3, far), END(1.5)],
    [chain.id]: [...link(double.id, 4, far), ...link(blinkHit.id, 3, far), END(1.5)],
    [blinkHit.id]: [...link(bite.id, 5, close), ...link(whirl.id, 3, close), ...link(wingEdge.id, 3, close), END(1)],
    [through.id]: [...link(tail.id, 4), ...link(bite.id, 3, close), ...link(double.id, 3, far), END(1.5)],
    [sprint.id]: [...link(bite.id, 5, close), ...link(wingEdge.id, 3, close), ...link(retreat.id, 3, close), END(1)],
    [series.id]: [...link(double.id, 3, far), END(4)],
    [raster.id]: [...link(through.id, 3, far), END(5)],
    [rasterBroken.id]: [...link(through.id, 3, far), END(5)],
    [nova.id]: [{ atk: blink.id, w: 1 }],
    [collapse.id]: [END(1)],
  },
  phases: [
    { at: .68, name: 'PRISMEN-GEWITTER — Drei Nachbilder', cue: cue('schrill'), special: zigzag.id },
    { at: .30, name: 'LETZTES SIGNAL — Gewitterkäfig', cue: cue('droehn'), special: cage.id, enter(m) { m.cds[cage.id] = 0; } },
  ],
  init(m) {
    for (const key of Object.keys(REST)) { m.pose[key] ??= REST[key]; m._tgt[key] ??= REST[key]; }
    m._voltHistory = []; m._salvoN = 0; m._hugT = 0; m._farT = 0; m._kurzCd = 0; m.kurz = 0; m.exposedT = 0; m._burst = []; m._spikeBlink = false; m._spikeCd = 0;
    installEchoes(m);
  },
  tick(m, dt) {
    const v = state(m), a = m.attack, tau = a?.inst.sample(a.t).tau ?? 0;
    tickVolt(m, dt);
    updateVoltirisFx(m);
    // Blink gap: invisible and untouchable between vanishing and reappearing.
    const gapDef = a?.inst.def.blinkGap, gap = !!gapDef && m.alive && tau >= gapDef[0] && tau < gapDef[1];
    if (gap !== v.gap) { v.gap = gap; if (m.mesh) m.mesh.visible = !gap && !m.culled; if (m.shadow) m.shadow.visible = !gap && !m.culled; }
    if (!a && v.exit) { m.ctx.fx.clearMarker?.(exitKey(m)); v.exit = false; }
    if (!a && v.aimOn) { m.ctx.fx.clearMarker?.(`${m.id}:aim`); v.aimOn = false; }
    if (!m.alive) { clearVolt(m); m.ctx.fx.clearMarker?.(`${m.id}:aim`); return; }
    // A big cast that is interrupted (counter, break, flinch) drops him; he never stays hanging.
    if (!a && m.air > 0) { m.air = Math.max(0, m.air - 16 * dt); m.pos.y = (m.ctx.world?.heightAt?.(m.pos.x, m.pos.z) ?? 0) + m.air; }
    m.exposedT = Math.max(0, (m.exposedT ?? 0) - dt);
    const wing = m.partById.wing;
    wing.factor = wing.baseFactor * (m.exposedT > 0 ? VOLTIRIS.WING_EXPOSED : 1) + (m._fb ?? 0);
    const counter = a && BIG.has(a.id) && a.inst.def.shortWindow && tau >= a.inst.def.shortWindow[0] && tau < a.inst.def.shortWindow[1];
    if (m.extra.coreMat) m.extra.coreMat.color.set(counter ? '#fff3b0' : m.exposedT > 0 ? '#ff9a6a' : m.phase >= 2 ? '#ff7ad9' : '#7fe8ff');
    if (!m.authority) return;
    m._kurzCd = Math.max(0, m._kurzCd - dt); m._spikeCd = Math.max(0, m._spikeCd - dt); m._snipeT = Math.max(0, (m._snipeT ?? 0) - dt * .5);
    if (!counter) m.kurz = 0;
    if (m.state !== 'combat') return;
    // Position memory: huggers draw the Klebe-Strafe, campers draw bolts and lanes.
    const d = m.target ? Math.hypot(m.target.pos.x - m.pos.x, m.target.pos.z - m.pos.z) : 0;
    m._hugT = d < VOLTIRIS.STICKY_DIST ? (m._hugT ?? 0) + dt : Math.max(0, (m._hugT ?? 0) - dt * 2);
    m._farT = d > 12 ? (m._farT ?? 0) + dt : Math.max(0, (m._farT ?? 0) - dt * 2);
    // Smoothed hunter velocity for leading the aim (respawns/teleports are clamped out).
    const tp = m.target?.pos, tv = (m._tv ??= { x: 0, z: 0 });
    if (tp && m._tp && m._tpId === m.target.id && dt > 0) {
      let vx = (tp.x - m._tp.x) / dt, vz = (tp.z - m._tp.z) / dt;
      if (Math.hypot(vx, vz) > 14) vx = vz = 0;
      const k = 1 - Math.exp(-dt * 6); tv.x += (vx - tv.x) * k; tv.z += (vz - tv.z) * k;
    }
    if (tp) { m._tp = { x: tp.x, z: tp.z }; m._tpId = m.target.id; }
    m._idleT = a ? 0 : (m._idleT ?? 0) + dt;
    if (a || m.queued || m.chainNext || m.phaseSpecial || m.phaseT > 0 || m.stagT > 0 || m.stunT > 0) return;
    // Scripted decisions (host only; guests learn them from the attack start).
    if (m.phase >= 2 && (m.cds[cage.id] ?? 0) <= 0) m.queued = cage.id;
    else if ((m._hugT ?? 0) > VOLTIRIS.STICKY_SECS && (m.cds[nova.id] ?? 0) <= 0 && d < 6.5) { m.queued = nova.id; m._hugT = 0; }
    else if (m._spikeBlink && m._spikeCd <= 0) { m._spikeBlink = false; m._spikeCd = 7; m.queued = blink.id; }
    // No strike available and the hunter is on top of him: the duelist slips away instead of shuffling about.
    else if (m._idleT > 1.3 && d < 10 && m.recover <= 0) { m.queued = blink.id; m._idleT = 0; }
  },
  poseHook(m, p) {
    for (const key of Object.keys(REST)) if (!Number.isFinite(p[key])) p[key] = REST[key];
    // Hunters charged up make his core burn: a readable ambient cue of who is about to be discharged.
    const charged = m.ctx.players.reduce((n, pl) => Math.max(n, pl.voltCharge?.n ?? 0), 0);
    if (!m.attack) {
      if (m.state === 'dead' || m.sleeping || m.stunT > 0 || m.trapped || m.blind) return;
      if (m.state === 'notice' || m.state === 'enrage') {
        const rise = Math.sin(Math.min(1, m.stateT / 1.4) * Math.PI);
        p.wing = 12 + rise * 40; p.spread = rise; p.jaw = rise * 60; p.boiler = rise; p.head -= rise * 20;
        return;
      }
      if (m.stagT > 0) { Object.assign(p, { bodyY: -.55, bodyPitch: 14, head: 24, jaw: 20, wing: -30, foreL: 30, foreR: 30, boiler: 1 }); return; }
      p.boiler = Math.max(p.boiler, .3 + charged * .2);
    }
    if (m.extra.antenna) m.extra.antenna.scale.y = m.partById.antenna.broken ? .25 : 1;
    for (const id of ['wingL', 'wingR']) if (m.extra[id]) m.extra[id].scale.x = m.partById.wing.broken ? .6 : 1;
  },
  onHitPlayer(m, p, h) { if (h.hit?.charge && h.dmg > 0) addCharge(m, p, 1, 'strike'); },
  onProjectileHit(m, p, def) { if (def.charge !== false && def.dmg > 0) addCharge(m, p, 1, 'bolt'); },
  onDamage(m, res) {
    if (!m.authority || res.dmg <= 0) return;
    const shooter = m.ctx.players.find((p) => p.id === res.attackerId) ?? m.target;
    if (shooter && Math.hypot(shooter.pos.x - m.pos.x, shooter.pos.z - m.pos.z) > 8.5) m._snipeT = Math.min(9, (m._snipeT ?? 0) + res.dmg / 120);
    // Damage spikes make him blink after the current strike.
    m._burst = (m._burst ?? []).filter((e) => m.time - e.t < VOLTIRIS.SPIKE_WINDOW); m._burst.push({ t: m.time, d: res.dmg });
    if (m._burst.reduce((s, e) => s + e.d, 0) >= m.maxHp * VOLTIRIS.SPIKE_PCT) { m._spikeBlink = true; m._burst = []; }
    // Kurzschluss: antenna or core damage while a big cast hovers shorts him out.
    const a = m.attack;
    if (!a || (res.partId !== 'antenna' && res.partId !== 'body') || !BIG.has(a.id) || m._kurzCd > 0) return;
    const w = a.inst.def.shortWindow, tau = a.inst.sample(a.t).tau;
    if (!w || tau < w[0] || tau >= w[1]) return;
    m.kurz = (m.kurz ?? 0) + res.dmg;
    if (m.kurz >= VOLTIRIS.COUNTER_DAMAGE * Math.sqrt(Math.max(1, m.maxHp / voltiris.hp))) {
      m._interrupt(); m._chainBreak(); m.queued = null; m.kurz = 0; m._kurzCd = VOLTIRIS.COUNTER_CD; m._salvoN = 0;
      m.stagT = Math.max(m.stagT, VOLTIRIS.COUNTER_TIME); m.recover = Math.max(m.recover, VOLTIRIS.COUNTER_TIME); m.exposedT = VOLTIRIS.COUNTER_TIME;
      m.ctx.bus.emit('sfx', { name: 'break', pos: m.pos });
      m.ctx.fx.number?.({ x: m.pos.x, y: m.pos.y + 8, z: m.pos.z }, 'KURZSCHLUSS!', 'weak');
      m.ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 4, z: m.pos.z }, 40, '#fff3b0', 9);
      m.ctx.bus.emit('voltShort', { monster: m });
    }
  },
  onBreak(m, part) {
    if (part.id === 'antenna') { if (m.extra.antenna) m.extra.antenna.scale.y = .25; part.factor = 1; m.queued = null; }
    if (part.id === 'wing') {
      for (const id of ['wingL', 'wingR']) if (m.extra[id]) m.extra[id].scale.x = .6;
      // A broken wing mid-hover drops him out of the sky.
      if (m.air > 1) { m.stagT = Math.max(m.stagT, 3); m.recover = Math.max(m.recover, 3); }
      part.factor = .85;
    }
  },
  onGlitchCounter(m, id) {
    if (!BIG.has(id)) return;
    m._interrupt(); m.chainNext = null; m.queued = null; m.recover = Math.max(m.recover, 1.8);
  },
  onAttackEnd(m, id) {
    if (!id.startsWith('voltiris_')) return;
    if (!m.authority) return;
    m._voltHistory = [...(m._voltHistory ?? []), id].slice(-4);
    if (SIGNATURES.includes(id)) m.chainNext = id === nova.id ? m.chainNext : null;
    if (RELOCATING.has(id) || SIGNATURES.includes(id)) { m._salvoN = 0; return; }
    m._salvoN++;
    // The salvo is over (no further link): 2-3 strikes, then a blink to a fresh angle.
    if (!m.chainNext && m.state === 'combat') {
      m.queued = blink.id;
      m._salvoN = 0;
    }
  },
  speedFactor: (m) => (m.partById.wing.broken ? .9 : 1),
  snapExtra: (m) => ({ exposedT: Math.round((m.exposedT ?? 0) * 10) / 10 }),
};
function elements() { return { shock: 0, fire: 20, ice: 20, water: 10 }; }
