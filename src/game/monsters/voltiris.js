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
// Every attack: big anticipation (crouch / rear back, wings flare or fold, tail counter-swing), a sharp strike frame,
// overshoot / follow-through, then settle into the open (EXPOSE) window and blend out ({} frames at both ends).
const CAST = { bodyPitch: -10, head: -20, neck: -.14, jaw: 55, wing: 50, spread: 1, elbowL: -22, elbowR: -22, foreL: -12, foreR: -12, boiler: 1, tailPitch: 10 };
const SHOT = { bodyPitch: 8, head: 14, neck: .1, jaw: 65, wing: -14, headReach: .4, boiler: .8, foreL: -18, foreR: -18 };
// Coiled spring: low, neck folded back, wings half open, hind legs loaded, tail cocked up.
const COIL = { bodyY: -.6, bodyPitch: 18, head: 40, neck: .3, headReach: -.45, jaw: 70, wing: 56, spread: 1, wingL: 10, wingR: -10, elbowL: -22, elbowR: -22, foreL: 24, foreR: 24, hindL: 36, hindR: 36, kneeL: -18, kneeR: -18, tailPitch: 30, tailCurl: 12, boiler: .8 };
// Lunge: body thrown forward, neck stretched, jaw snapped shut on the target, wings swept back, tail counter-swings down.
const LUNGE = { bodyY: .05, bodyPitch: 22, head: 18, neck: -.12, headReach: .95, jaw: 4, wing: -34, spread: 1, elbowL: 18, elbowR: 18, foreL: -58, foreR: -58, hindL: -22, hindR: -22, tailPitch: -26, boiler: 1 };
const OVER = { bodyY: -.2, bodyPitch: 28, head: 24, neck: .1, headReach: .45, jaw: 34, wing: -46, spread: 1, foreL: -30, foreR: -30, hindL: 14, hindR: 14, tailPitch: -34, boiler: .9 };
const EXPOSE = { bodyY: -.3, bodyPitch: 6, head: 14, jaw: 25, wing: 8, hindL: 14, hindR: 14, boiler: .5 };
const VANISH = { bodyY: .2, bodyPitch: -14, head: -16, jaw: 0, wing: 66, spread: 1, foreL: -40, foreR: -40, hindL: -30, hindR: -30, boiler: 1, tailPitch: 22 };
const LAND = { bodyY: -.55, bodyPitch: 17, head: 30, neck: .2, jaw: 20, wing: -34, spread: 0, foreL: 34, foreR: 34, hindL: 30, hindR: 30, kneeL: -20, kneeR: -20, tailPitch: -14, boiler: .9 };
const FLAP_UP = { wing: 74, spread: 1, elbowL: -38, elbowR: -38, wristL: -14, wristR: -14, foreL: -25, foreR: -25, hindL: -20, hindR: -20, bodyPitch: -10, bodyY: .22, boiler: 1 };
const FLAP_DN = { wing: -40, spread: 1, elbowL: 24, elbowR: 24, wristL: 12, wristR: 12, foreL: -25, foreR: -25, hindL: -20, hindR: -20, bodyPitch: -1, bodyY: -.1, boiler: 1 };
const CRASHED = { bodyY: -.55, bodyPitch: 14, head: 24, jaw: 20, wing: -30, foreL: 30, foreR: 30, boiler: 1 };
// Casting: rear up, wings flared, jaw gaping, head thrown back; each bolt snaps the head forward.
const REAR = { bodyY: .12, bodyPitch: -20, head: -34, neck: -.22, headReach: -.25, jaw: 40, wing: 66, spread: 1, wingL: 8, wingR: -8, elbowL: -34, elbowR: -34, wristL: -18, wristR: -18, foreL: -30, foreR: -30, hindL: 14, hindR: 14, tailPitch: 26, tailCurl: 10, boiler: .8 };
const OPEN = (i) => ({ bodyY: .06, bodyPitch: -8, head: -12, neck: -.06, headReach: 0, jaw: 84, wing: 50, spread: 1, elbowL: -26, elbowR: -26, foreL: -20, foreR: -20, tailPitch: 18, boiler: 1, headYaw: i % 2 ? 8 : -8 });
const SNAP = (i) => ({ bodyY: -.1, bodyPitch: 12 + (i % 2) * 4, head: 16, neck: .12, headReach: .75, jaw: 6, wing: -22 - (i % 2) * 12, spread: 1, wristL: 14, wristR: 14, foreL: -26, foreR: -26, hindL: 12, hindR: 12, tailPitch: -20, boiler: 1, headYaw: i % 2 ? -10 : 10 });
const FOLLOW = { bodyY: -.4, bodyPitch: 18, head: 28, neck: .16, jaw: 24, wing: -38, spread: 1, foreL: 22, foreR: 22, hindL: 22, hindR: 22, tailPitch: -26, boiler: .8 };

const mono = (frames) => { const f = frames.map((x) => x.slice()).sort((a, b) => a[0] - b[0]); return f; };
/** Cast keyframes from `start`: rear back, quiver, then per bolt an open-mouth frame and a snap frame, follow-through, settle. */
function castFrames(start, fires, o = {}) {
  const t0 = fires[0], span = t0 - start, f = [];
  f.push([start + span * .38, { ...REAR, wing: 44, boiler: .6, bodyY: -.12, bodyRoll: o.roll ?? 0 }]);
  f.push([t0 - Math.min(.1, span * .3), { ...REAR, wing: 80, boiler: 1, bodyPitch: -26, head: -42, jaw: 92, headReach: -.35, bodyRoll: o.roll ?? 0 }]);
  fires.forEach((ft, i) => {
    const gap = Math.min(.2, fires[i + 1] !== undefined ? fires[i + 1] - ft : .2);
    f.push([ft - gap * .32, OPEN(i)], [ft + gap * .12, SNAP(i)]);
  });
  const lt = fires.at(-1);
  f.push([lt + .26, FOLLOW], [lt + .62, EXPOSE]);
  return mono(f);
}
// Frames that would run into the final settle are dropped, so the track stays monotone for any duration.
const finish = (frames, end) => track([[0, {}], ...frames.filter((f) => f[0] < end - .4), [end - .35, EXPOSE], [end, {}]]);
const castPose = (fires, end, o) => finish(castFrames(0, fires, o), end);
const strikePose = finish;
const meleeFrames = (tg, hitT, wind = COIL, hit = LUNGE, over = OVER) => [[tg * .35, { ...wind, bodyY: wind.bodyY * .6, headReach: 0 }], [tg - .02, { ...wind, bodyY: wind.bodyY - .06, boiler: 1 }], [hitT - .06, { ...wind, bodyY: wind.bodyY - .1 }], [hitT + .02, hit], [hitT + .22, over], [hitT + .56, EXPOSE]];
const meleePose = (tg, hitT, end, wind, hit, over) => strikePose(meleeFrames(tg, hitT, wind, hit, over), end);
// Blink: crouch, spring up, vanish; reappear in the air and drop into a landing crouch; optionally strike at once.
const blinkFrames = (tv, ta, after = COIL, hitT = null, hit = LUNGE) => {
  const f = [[tv * .45, { ...COIL, bodyY: -.72, boiler: 1, wing: 30 }], [tv, VANISH], [ta - .02, VANISH], [ta + .12, LAND]];
  if (hitT) f.push([hitT - .12, { ...COIL, bodyY: -.7, boiler: 1 }], [hitT + .02, hit], [hitT + .22, OVER], [hitT + .58, EXPOSE]);
  else f.push([ta + .36, after], [ta + .8, EXPOSE]);
  return f;
};
const blinkPose = (tv, ta, end, after = COIL, hitT = null, hit = LUNGE) => finish(blinkFrames(tv, ta, after, hitT, hit), end);
// A big cast hovers (wings beat, body bobs) and opens the antenna crown: the Kurzschluss window.
function hoverFrames(tg, extra = []) {
  const f = [[.2, { ...COIL, wing: 42, bodyY: -.5, boiler: .6 }]];
  let up = true;
  for (let t = .46; t < tg - .22; t += .27, up = !up) f.push([t, up ? FLAP_UP : FLAP_DN]);
  f.push([tg - .1, { ...REAR, wing: 86, bodyY: .3, boiler: 1, jaw: 90, head: -40 }], [tg + .06, { ...SHOT, bodyPitch: 16, jaw: 6, wing: -30, bodyY: -.12, headReach: .8 }], [tg + .36, FOLLOW], ...extra);
  return f;
}
const hoverPose = (tg, end, extra = []) => track([[0, {}], ...hoverFrames(tg, extra).filter((f) => f[0] < end - .65), [end - .6, EXPOSE], [end, {}]]);

// ---------------------------------------------------------------- motion vocabulary (pure functions of the attack params)
const sideOf = (a) => (a.r(0) < .5 ? -1 : 1);
const at = (a, fwd, lat = 0, air = 0) => ({ x: a.origin.x + a.dir.x * fwd + a.dir.z * lat, z: a.origin.z + a.dir.z * fwd - a.dir.x * lat, air });
const ramp = (t, t0, span) => smooth(clamp01((t - t0) / span));
const arc = (t, t0, span) => Math.sin(Math.PI * clamp01((t - t0) / span));
/** Melee step: spring forward (up to a.len), small hop, and a recoil hop back after the strike. */
const strikeMove = (start, span, backAt, back = 1.3, hop = .55) => (t, a) => at(a, a.len * ramp(t, start, span) - back * ramp(t, backAt, .5), 0, hop * arc(t, start - .06, span + .3));
/** Caster: hover with a wing-beat bob, strafe sideways, kick back and hop with every bolt. */
const castMove = (fires, { strafe = 3.4, back = 2.2, hover = 1.2, hop = .9 } = {}) => (t, a) => {
  const f0 = fires[0], fl = fires.at(-1), n = fires.length, sd = sideOf(a);
  let fwd = 0, bump = 0;
  for (const f of fires) { fwd -= back / n * ramp(t, f, .12); bump += .12 * arc(t, f, .2); }
  const env = ramp(t, 0, f0 * .8) * (1 - ramp(t, fl + .05, .5));
  const bob = .24 * Math.sin(t * 11) * ramp(t, .1, .3) * (1 - ramp(t, fl + .1, .4));
  const air = hover * env + bob + hop * arc(t, f0, fl - f0 + .5) + bump;
  return at(a, fwd, sd * strafe * ramp(t, 0, fl + .6), Math.max(0, air));
};

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
    // Spring up into the vanish, reappear high and drop into the landing crouch.
    motion(t, a) {
      const air = t < tv ? 1.4 * Math.sin(Math.PI / 2 * clamp01((t - tv * .45) / (tv * .55))) : t < ta ? 1.4 : 1.4 * (1 - ramp(t, ta, .2));
      return t >= ta ? { x: a.dest.x, z: a.dest.z, yaw: a.f1, air } : { x: a.origin.x, z: a.origin.z, yaw: a.f0, air };
    },
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
  range: [0, 7], weight: (m, d) => (d < 5 ? 7 : 3), cooldown: 2, telegraph: .58, duration: 1.58, audit: [3, 6], flashParts: ['head'],
  prepare: prepareAdvance(3.8, 3.5), motion: strikeMove(.34, .26, .88, 1.5, .5),
  hits: [ball(.66, 0, 3.4, 1.65, 145)],
  pose: meleePose(.58, .66, 1.58),
});
const wingEdge = attack('fluegelkante', {
  range: [0, 7], weight: (m, d) => (d < 5.5 ? 6 : 3), cooldown: 2.5, telegraph: .62, duration: 1.75, audit: [3, 5], flashParts: ['wing'],
  prepare: prepareAdvance(3.5, 2.2), motion: strikeMove(.38, .26, .95, 1.4, .5),
  hits: [line(.74, -4, 2, 4, 2, 1, 155, 'flinch', .88)],
  pose: strikePose([[.2, { ...COIL, bodyPitch: -8, bodyY: -.3, wing: 30, wingL: 40, wingR: -10, bodyRoll: 8, bodyYaw: 8 }], [.5, { ...COIL, wing: 74, spread: 1, wingL: 36, wingR: -36, bodyRoll: -18, bodyYaw: -26, tailYaw: 34, tailPitch: 40, head: 34, headYaw: -22 }], [.68, { ...COIL, wing: 78, spread: 1, wingL: 40, wingR: -40, bodyRoll: -22, bodyYaw: -30, tailYaw: 38, bodyY: -.7 }],
    [.8, { bodyPitch: 14, bodyY: -.1, wing: -38, spread: 1, wingL: -34, wingR: 34, bodyRoll: 20, bodyYaw: 32, tailYaw: -42, tailPitch: -18, head: 22, headYaw: 18, jaw: 50, elbowL: 24, elbowR: 24, foreL: -30, foreR: -30 }],
    [.98, { bodyPitch: 20, bodyY: -.25, wing: -20, bodyRoll: 12, bodyYaw: 20, tailYaw: -20, head: 26 }], [1.32, EXPOSE]], 1.75),
});
const tail = attack('rueckkopplung', {
  range: [0, 9], weight: (m) => (targetBehind(m) ? 9 : 1), cond: (m) => targetBehind(m), noFace: true, cooldown: 3.5, telegraph: .62, duration: 1.7, audit: [2, 5], flashParts: ['tail'],
  motion: (t, a) => at(a, 0, 0, .7 * arc(t, .5, .6)),
  hits: [ball(.72, 0, -4.6, 2.8, 160)],
  pose: strikePose([[.22, { ...COIL, tailPitch: 40, tailYaw: 20, bodyRoll: -6 }], [.52, { ...COIL, bodyY: -.5, tailPitch: 66, tailYaw: 44, tailCurl: -28, bodyRoll: -16, bodyYaw: -26, wing: 62, spread: 1, head: 30, headYaw: 20 }], [.68, { ...COIL, bodyY: -.55, tailPitch: 70, tailYaw: 48, tailCurl: -30, bodyRoll: -18, bodyYaw: -30 }],
    [.8, { bodyPitch: -10, bodyY: .15, tailPitch: -14, tailYaw: -56, tailCurl: 24, bodyRoll: 16, bodyYaw: 30, wing: 34, head: 12, headYaw: -20 }], [.98, { bodyPitch: -4, tailPitch: -6, tailYaw: -22, bodyRoll: 8, bodyYaw: 12, wing: 20 }], [1.3, EXPOSE]], 1.7),
});
const stab = attack('antennenstoss', {
  range: [2, 13], weight: (m, d) => (d < 9 ? 5 : 2), cooldown: 3, telegraph: .62, duration: 1.75, audit: [4, 8], flashParts: ['antenna'],
  prepare: prepareAdvance(2.6, 7), motion: strikeMove(.46, .28, .95, 1.6, .7),
  hits: [line(.75, 0, 2, 0, 11, .85, 150, 'flinch', .88, LT)],
  // Rear back with the crown raised, then spear it forward in one thrust.
  pose: strikePose([[.2, { ...COIL, bodyY: -.35, bodyPitch: -6, head: -24, neck: -.24, headReach: -.4, jaw: 40, wing: 52, spread: 1 }], [.52, { ...REAR, bodyPitch: -26, head: -44, neck: -.3, headReach: -.55, jaw: 60, wing: 70, tailPitch: 36, boiler: 1 }],
    [.68, { ...REAR, bodyPitch: -28, head: -46, headReach: -.6, jaw: 70, wing: 76, bodyY: .2, boiler: 1 }], [.8, { ...LUNGE, bodyPitch: 20, head: 6, neck: -.2, headReach: 1, jaw: 40, wing: -30, tailPitch: -32 }],
    [1, { ...OVER, bodyPitch: 24 }], [1.34, EXPOSE]], 1.75),
});
const D_SHOTS = [{ side: -.55, dmg: 150 }, { side: 0, delay: .17, dmg: 150 }, { side: .55, delay: .34, dmg: 150 }];
const double = attack('doppelblitz', {
  range: [6, 32], weight: (m, d) => (d > 12 ? 12 : 4) * snipe(m), lead: 1.15, cooldown: 2.2, telegraph: .6, duration: 1.8, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .6, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    fire(m, ctx, inst, age) { volley(m, inst, age, .6, D_SHOTS); },
  },
  motion: castMove([.6, .77, .94], { strafe: 3.6, back: 2.2, hover: 1.1 }),
  pose: castPose([.6, .77, .94], 1.8, { roll: -6 }),
});
const F_SHOTS = [-.34, -.17, 0, .17, .34].map((rot, i) => ({ rot, delay: i * .08, dmg: 125 }));
const fan = attack('faecherblitz', {
  range: [6, 30], weight: (m, d) => (d > 10 ? 7 : 3) * snipe(m), lead: 1.1, cooldown: 2.8, telegraph: .66, duration: 1.9, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .66, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    fire(m, ctx, inst, age) { volley(m, inst, age, .66, F_SHOTS); },
  },
  motion: castMove([.66, .74, .82, .9, .98], { strafe: 3.2, back: 2.6, hover: 1.4 }),
  pose: castPose([.66, .74, .82, .9, .98], 1.9, { roll: 6 }),
});
// Rapid salvo: six bolts, 0.15 s apart, along the hunter's path with a spread; keep moving or roll the stream.
const SALVO_AT = [0, 1, 2, 3, 4, 5].map((i) => .64 + i * .15);
const S_SHOTS = [0, 1, 2, 3, 4, 5].map((i) => ({ rot: [-.1, .09, -.05, .13, -.12, .03][i], side: (i - 2.5) * .75, delay: i * .15, dmg: 100, speed: 29 }));
const salvo = attack('blitzsalve', {
  range: [6, 32], weight: (m, d) => (d > 10 ? 10 : 3) * snipe(m), lead: 1.3, cooldown: 3.2, telegraph: .64, duration: 2.3, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .64, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    fire(m, ctx, inst, age) { volley(m, inst, age, .64, S_SHOTS); },
  },
  motion: castMove(SALVO_AT, { strafe: 4, back: 3.2, hover: 1.5, hop: 1 }),
  pose: castPose(SALVO_AT, 2.3, { roll: -8 }),
});
// Full circle of the wings: hugging his flanks or tail is never free.
const whirl = attack('fluegelwirbel', {
  range: [0, 6.5], weight: (m) => (hugging(m) ? 9 : 4), noFace: true, cooldown: 4, telegraph: .64, duration: 2.1, audit: [0, 3], flashParts: ['wing'],
  motion(t, a) { return { yaw: a.yaw0 - .6 * ramp(t, 0, .55) + (Math.PI * 2 + .6) * ramp(t, .6, .55), air: .7 * arc(t, .5, .8) }; },
  hits: [line(.68, 0, 1.4, 0, 5.8, 1.2, 150, 'flinch', 1.14)],
  pose: strikePose([[.25, { ...COIL, wing: 44, spread: 1, bodyRoll: -8, bodyYaw: -10 }], [.56, { ...COIL, bodyY: -.7, wing: 78, spread: 1, wingL: 24, wingR: -24, bodyRoll: -22, bodyYaw: -24, tailYaw: 30, tailCurl: 24 }],
    [.8, { bodyY: .05, bodyPitch: 4, bodyRoll: 20, wing: 62, spread: 1, wingL: -20, wingR: 20, elbowL: -20, elbowR: -20, tailYaw: -40, tailCurl: -26, head: 10, jaw: 50 }], [1.1, { bodyY: -.1, bodyRoll: 26, wing: 56, spread: 1, tailYaw: -30, bodyYaw: 20, jaw: 60 }],
    [1.3, { ...OVER, bodyRoll: -12, bodyYaw: -14 }], [1.64, EXPOSE]], 2.1),
});

// ---------------------------------------------------------------- mobility: blink and strike
const blinkHit = attack('blinkhieb', {
  ...blinker('behind', .34, .6), range: [7, 30], weight: (m, d) => (d > 9 ? 2.4 : 1.4), lead: .5, cooldown: 9, telegraph: .6, duration: 1.95, audit: [8, 14, 20], flashParts: ['antenna'],
  hits: [ball(.92, 0, 3.4, 1.7, 160, 'flinch', LT)],
  pose: blinkPose(.34, .6, 1.95, COIL, .92),
});
const through = attack('phasenstich', {
  ...blinker('through', .45, .7), range: [7, 26], weight: (m, d) => (d > 9 ? 2 : 1.2), lead: .4, cooldown: 9, telegraph: .7, duration: 2.15, audit: [8, 14, 20], flashParts: ['head'],
  hits: [line(1.1, 0, -9, 0, 1.5, 1.15, 150, 'down', 1.23, LT)],
  pose: blinkPose(.45, .7, 2.15, LUNGE, 1.1, { ...LUNGE, bodyPitch: 26, headReach: 1.1, wing: -42 }),
});
const R_AT = [1, 1.17];
const retreat = attack('rueckzugsblink', {
  ...blinker('away', BLINK_V, BLINK_A), range: [0, 11], weight: (m, d) => 3 + (hugging(m) ? 6 : 0) + (m.phase >= 2 ? 2 : 0), cond: (m) => SIDE.dist(m) < 11, cooldown: 5, telegraph: .62, duration: 2.05, audit: [3, 6, 9], flashParts: ['antenna'], lead: .6,
  events: [{ t: .05, call: 'aim', all: true }, { t: 1, call: 'fire', all: true }],
  calls: { aim: aimMark, fire(m, ctx, inst, age) { volley(m, inst, age, 1, [{ side: -.4, dmg: 140 }, { side: .4, delay: .17, dmg: 140 }]); } },
  pose: track([[0, {}], [BLINK_V * .45, { ...COIL, bodyY: -.72, boiler: 1, wing: 30 }], [BLINK_V, VANISH], [BLINK_A - .02, VANISH], [BLINK_A + .1, LAND], ...castFrames(BLINK_A + .1, R_AT).filter((f) => f[0] < 2.05 - .4), [2.05 - .35, EXPOSE], [2.05, {}]]),
});
// Pure relocation: used after salvos, against huggers and after big damage spikes.
const blink = attack('blink', {
  ...blinker('away'), internal: true, noTeach: true, range: [0, 400], weight: 0, cooldown: 0, telegraph: BLINK_A, duration: 1.3, audit: undefined, hits: [], vfx: 'blink',
  pose: blinkPose(BLINK_V, BLINK_A, 1.3, COIL),
});

// ---------------------------------------------------------------- control: lanes, lasers, sprint, storms
const LANES = [-6.5, 0, 6.5];
const laneCall = (tau, xs) => (m, ctx, inst, age) => {
  for (const x of xs) { const a = worldAt(inst, tau, x, 3), b = worldAt(inst, tau, x, 19); addLane(m, a.x, a.z, b.x, b.z, { age, key: `${inst.key}:l${x}` }); }
  ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
};
// Big casts hover: antenna or core damage in this window shorts him out (Kurzschluss). The wing beats bob the body.
const hover = (tg, h = 2.4) => (t) => { const k = smooth(clamp01((t - .2) / .5)) * (1 - smooth(clamp01((t - (tg - .22)) / .22))); return h * k + .22 * k * Math.sin(t * 10.5); };
const rasterHover = hover(1.5);
const raster = attack('blitzraster', {
  range: [5, 28], weight: (m, d) => (d > 11 ? 5 : 3) * snipe(m), cooldown: 9, telegraph: 1.5, duration: 3.75, audit: [5, 9], lockedByBreak: 'antenna', punishWindow: 2, shortWindow: [.45, 1.42], vfx: 'raster', markerLead: 1.2, lead: 1.2,
  motion(t) { return { air: rasterHover(t) }; },
  hits: LANES.map((x) => line(1.5, x, 3, x, 19, .85, 190, 'flinch', 1.63, LT)),
  events: [{ t: 1.5, call: 'lanes', all: true }],
  calls: { lanes: laneCall(1.52, LANES) },
  pose: hoverPose(1.5, 3.75),
});
const rasterBroken = attack('blitzraster_bruch', {
  range: [5, 28], weight: (m, d) => (d > 11 ? 5 : 3) * snipe(m), cooldown: 9, telegraph: 1.5, duration: 3.75, audit: [5, 9], needsBroken: 'antenna', punishWindow: 2, shortWindow: [.45, 1.42], vfx: 'raster', markerLead: 1.2, lead: 1.2,
  motion(t) { return { air: rasterHover(t) }; },
  hits: [-6.5, 6.5].map((x) => line(1.5, x, 3, x, 19, .85, 190, 'flinch', 1.63, LT)),
  events: [{ t: 1.5, call: 'lanes', all: true }],
  calls: { lanes: laneCall(1.52, [-6.5, 6.5]) },
  pose: hoverPose(1.5, 3.75),
});
const zigHover = hover(1.4);
const zigzag = attack('zickzacklaser', {
  range: [5, 26], phase: 1, weight: (m, d) => (d > 10 ? 5 : 3) * snipe(m), cooldown: 10, telegraph: 1.4, duration: 4.85, audit: [6, 12], punishWindow: 2, shortWindow: [.45, 1.32], vfx: 'laser', markerLead: 1.2, lead: .3, punishRoll: true,
  motion(t) { return { air: zigHover(t) }; },
  hits: [line(1.4, -3.2, 3, -3.2, 18, .85, 180, 'flinch', 1.53, LT), line(2, 3.2, 3, 3.2, 18, .85, 180, 'flinch', 2.13, LT), line(2.6, 0, 4, 0, 20, .85, 190, 'down', 2.73, LT)],
  pose: track([[0, {}], [.2, { ...COIL, wing: 42, bodyY: -.5 }], [.46, FLAP_UP], [.73, FLAP_DN], [1, FLAP_UP], [1.24, { ...REAR, headYaw: -30, neckYaw: -14, bodyRoll: 12, wing: 84, bodyY: .3, head: -36 }], [1.5, { ...SHOT, headYaw: -30, neckYaw: -14, bodyRoll: -10, bodyPitch: 16, jaw: 6, headReach: .8 }],
    [1.78, { ...REAR, headYaw: 30, neckYaw: 14, bodyRoll: -12, wing: 80 }], [2.1, { ...SHOT, headYaw: 30, neckYaw: 14, bodyRoll: 10, bodyPitch: 16, jaw: 6, headReach: .8 }], [2.38, { ...REAR, headYaw: 0, bodyPitch: -30, head: -44, wing: 88, bodyY: .35 }],
    [2.7, { ...SHOT, bodyPitch: 20, jaw: 4, headReach: 1, wing: -36 }], [3.1, CRASHED], [4.1, EXPOSE], [4.85, {}]]),
});
const sprint = attack('bahnsprint', {
  range: [8, 26], weight: (m, d) => (d > 11 ? 2.4 : 1.4) * snipe(m), cooldown: 9, telegraph: .8, duration: 2.5, audit: [8, 14, 20], flashParts: ['antenna'], lead: .3,
  prepare(a) { const d = Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z); a.len = Math.max(0, Math.min(18, d - 3.2)); },
  motion(t, a) { const k = smooth(clamp01((t - .68) / .28)); return { x: a.origin.x + a.dir.x * a.len * k, z: a.origin.z + a.dir.z * a.len * k, air: .5 * arc(t, .66, .5) }; },
  hits: [line(.81, 0, 1.2, 0, 4.8, 1.3, 150, 'down', 1.04, LT)],
  events: [{ t: .68, call: 'dash', all: true }, { t: 1, call: 'lane', all: true }],
  calls: {
    dash(m, ctx) { ctx.bus.emit('sfx', { name: 'swing', pos: m.pos, heavy: true }); ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 3, z: m.pos.z }, 16, '#8de4df', 7); },
    lane(m, ctx, inst, age) { const a = worldAt(inst, .66, 0, 0), b = worldAt(inst, 1.04, 0, 0); if (Math.hypot(b.x - a.x, b.z - a.z) > 3) addLane(m, a.x, a.z, b.x, b.z, { age, key: `${inst.key}:sprint` }); },
  },
  pose: strikePose([[.2, { ...COIL, bodyY: -.5, wing: 44, spread: 1 }], [.5, { ...COIL, bodyY: -.75, wing: 66, spread: 1, bodyPitch: 24, head: 46, hindL: 42, hindR: 42, foreL: 30, foreR: 30, tailPitch: 40, boiler: 1 }], [.66, { ...COIL, bodyY: -.8, bodyPitch: 26, boiler: 1 }],
    [.82, { ...LUNGE, bodyPitch: 28, wing: -50, headReach: 1.1, hindL: -40, hindR: -40, tailPitch: -34 }], [1.06, { ...LUNGE, bodyPitch: 12, bodyY: -.2, wing: -30, foreL: -30, foreR: -30 }], [1.3, { ...OVER, bodyPitch: 30, foreL: 40, foreR: 40, bodyY: -.45 }], [1.64, EXPOSE]], 2.5),
});
const STORM = [ball(1.6, 0, 6, 2.25, 185, 'flinch', LT), ball(2.9, 0, 6, 2.25, 195, 'flinch', LT), ...[-1, 1].flatMap((s) => [ball(1.6, s * 4.4, 5, 2.25, 185, 'flinch', LT), ball(2.25, s * 7.4, 10, 2.25, 185, 'flinch', LT), ball(2.9, s * 4.4, 15, 2.25, 195, 'flinch', LT)])];
const stormHover = hover(1.6);
const stormExtra = [[2.1, { ...REAR, wing: 82, bodyY: .35 }], [2.4, CAST], [2.8, { ...REAR, bodyPitch: -30, wing: 88, bodyY: .4, bodyRoll: 8 }], [3.1, { ...SHOT, bodyPitch: 20, jaw: 4, headReach: 1 }], [3.6, CRASHED]];
const storm = attack('prismensturm', {
  range: [0, 26], phase: 1, weight: (m, d) => (d > 10 ? 4 : 3), cooldown: 14, telegraph: 1.6, duration: 5.15, audit: [4, 10], lockedByBreak: 'antenna', punishWindow: 2, shortWindow: [.5, 1.52], vfx: 'storm', markerLead: 1.3,
  motion(t) { return { air: stormHover(t) }; },
  hits: STORM,
  pose: hoverPose(1.6, 5.15, stormExtra),
});
const stormBroken = attack('prismensturm_bruch', {
  range: [0, 26], phase: 1, weight: (m, d) => (d > 10 ? 4 : 3), cooldown: 14, telegraph: 1.6, duration: 5.15, audit: [4, 10], needsBroken: 'antenna', punishWindow: 2, shortWindow: [.5, 1.52], vfx: 'storm', markerLead: 1.3,
  motion(t) { return { air: stormHover(t) }; },
  hits: STORM.filter((h) => h.at[0] > 0).map((h) => ({ ...h })),
  pose: hoverPose(1.6, 5.15, stormExtra),
});
// Echoes fire from the sides while the original fires: shatter them (+charge) or read which one is real.
const SERIES_AT = [.95, 1.12];
const series = attack('nachbildserie', {
  range: [6, 30], weight: (m, d) => (d > 10 ? 3 : 2), lead: .7, cooldown: 12, telegraph: .85, duration: 2.7, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .85, call: 'spawn', all: true }, { t: .95, call: 'fire', all: true }],
  calls: {
    aim: aimMark,
    spawn(m, ctx, inst, age) {
      const spots = [[-7.5, 3], [7.5, 3], [0, -6.5]].slice(0, m.phase >= 1 ? 3 : 2);
      spots.forEach(([lx, lz], i) => { const w = worldAt(inst, .85, lx, lz); addEcho(m, w.x, w.z, { age, key: `${inst.key}:s${i}`, yaw: inst.yaw0, offset: -.5 + i * .5, volleys: [.9 + i * .4, 2.7 + i * .4, 4.5 + i * .4] }); });
      ctx.bus.emit('sfx', { name: 'glitch', pos: m.pos, vol: .7 });
    },
    fire(m, ctx, inst, age) { volley(m, inst, age, .95, [{ dmg: 135 }, { side: .5, delay: .17, dmg: 135 }]); },
  },
  motion: castMove(SERIES_AT, { strafe: 2.4, back: 1.8, hover: 1.2 }),
  pose: castPose(SERIES_AT, 2.7, { roll: 5 }),
});
// Chain lightning: the original and every afterimage fire in turn at the committed point.
const CHAIN_AT = [.7, .87];
const chain = attack('kettenblitz', {
  range: [8, 30], weight: (m, d) => (echoCount(m) > 0 ? (d > 11 ? 6 : 4) * snipe(m) : 0), cond: (m) => echoCount(m) > 0, lead: .6, cooldown: 7, telegraph: .7, duration: 2.3, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .05, call: 'aim', all: true }, { t: .7, call: 'hop', all: true }],
  calls: {
    aim: aimMark,
    hop(m, ctx, inst, age) {
      volley(m, inst, age, .7, [{ dmg: 145 }, { side: .5, delay: .17, dmg: 145 }]);
      liveEchoes(m).forEach((e, i) => {
        const gy = ctx.world.heightAt(e.x, e.z), from = { x: e.x, y: gy + 2.2, z: e.z };
        const def = fireballDef({ from, aim: { x: inst.target.x, y: (inst.target.y ?? 0) + 1, z: inst.target.z }, speed: 26, extra: 10, radius: .65, dmg: Math.round(VOLT.ECHO_BOLT * VOLT.ECHO_MUL), key: `${inst.key}:c${i}`, status: null });
        m.projectiles.spawn({ ...def, kind: 'volt', attackId: inst.params.attackId }, age - .18 * (i + 1));
      });
    },
  },
  motion: castMove(CHAIN_AT, { strafe: 3, back: 2, hover: 1.3 }),
  pose: castPose(CHAIN_AT, 2.3, { roll: -5 }),
});
// Ground strikes: one on the hunter, two on the sidesteps, each marked on the floor.
const strike = attack('gewitterschlag', {
  range: [6, 34], weight: (m, d) => (d > 12 ? 6 : 3) * snipe(m), lead: 1.6, cooldown: 6, telegraph: .8, duration: 2.2, audit: [8, 16, 24], flashParts: ['antenna'],
  events: [{ t: .8, call: 'bolts', all: true }],
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
  // Call the storm down: rise on the wings, head thrown back, then slam everything forward.
  motion: (t, a) => at(a, -1.6 * ramp(t, .8, .4), sideOf(a) * 2 * ramp(t, 0, .9), Math.max(0, 1.3 * ramp(t, 0, .8) * (1 - ramp(t, .8, .45)) + .5 * arc(t, .8, .6) + .24 * Math.sin(t * 11) * ramp(t, .1, .3) * (1 - ramp(t, .9, .4)))),
  pose: strikePose([[.22, { ...REAR, wing: 50, bodyY: -.1 }], [.52, { ...REAR, wing: 86, bodyPitch: -30, head: -46, jaw: 92, bodyY: .35, headReach: -.4, boiler: 1 }], [.74, { ...REAR, wing: 90, bodyPitch: -32, head: -48, bodyY: .4, boiler: 1 }],
    [.86, { bodyPitch: 26, bodyY: -.25, head: 22, jaw: 8, headReach: .9, wing: -52, spread: 1, foreL: 36, foreR: 36, hindL: 24, hindR: 24, tailPitch: -34, boiler: 1 }], [1.08, { ...FOLLOW, bodyPitch: 20, wing: -30 }], [1.5, EXPOSE]], 2.2),
});

// ---------------------------------------------------------------- signatures: punish, earn the opening
// Klebe-Strafe: queued after >3 s under 5 m, always followed by a blink away.
const nova = attack('statiknova', {
  range: [0, 7], weight: 0, cond: () => false, noFace: true, cooldown: 12, telegraph: .6, duration: 2.9, audit: [1.5, 3.5], flashParts: ['body'], punishWindow: 1.6, vfx: 'nova',
  hits: [ball(.62, 0, 0, 5, 170, 'down', LT)],
  events: [{ t: .62, call: 'nova', all: true }],
  calls: { nova(m, ctx) { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); ctx.fx.spark?.({ x: m.pos.x, y: m.pos.y + 1.5, z: m.pos.z }, 36, '#8de4df', 10); ctx.fx.shake?.(.35, .3); ctx.fx.ring?.({ x: m.pos.x, y: m.pos.y, z: m.pos.z }, 1, 5.4, { color: '#8de4df', life: .35 }); } },
  motion: (t) => ({ air: .9 * arc(t, .55, .7) }),
  pose: track([[0, {}], [.22, { ...COIL, bodyY: -.7, wing: 60, spread: 1, boiler: 1, bodyPitch: 24 }], [.54, { ...COIL, bodyY: -.85, wing: 84, spread: 1, wingL: 14, wingR: -14, boiler: 1, head: 48, jaw: 90, tailPitch: 44 }], [.7, { bodyPitch: -22, wing: -46, spread: 1, head: -26, neck: -.2, jaw: 90, bodyY: .3, boiler: 1, foreL: -50, foreR: -50, hindL: -30, hindR: -30, tailPitch: -20 }], [1.05, { ...FOLLOW, bodyPitch: 16 }], [1.5, EXPOSE], [2.3, EXPOSE], [2.9, {}]]),
});
const collapse = attack('kernbruch', {
  range: [0, 10], phase: 2, weight: (m, d) => (d < 7 ? 4 : 1), noFace: true, cooldown: 15, telegraph: 1.35, duration: 4, audit: [3, 5], flashParts: ['body'], punishWindow: 2, vfx: 'nova', markerLead: 1.2,
  prepare: prepareAdvance(6, 0.5), motion(t, a) { return advance(t, a, .6, .5); },
  hits: [ball(1.45, 0, 0, 5.6, 220, 'down', LT)],
  pose: track([[0, {}], [.4, { ...COIL, bodyY: -.6, wing: 60, spread: 1, boiler: 1 }], [1, { ...COIL, bodyY: -.85, wing: 86, spread: 1, wingL: 14, wingR: -14, boiler: 1, bodyPitch: 24, head: 48, tailPitch: 44 }], [1.35, { ...COIL, bodyY: -.9, boiler: 1, bodyRoll: 6 }], [1.5, { bodyPitch: -24, wing: -48, spread: 1, head: -24, jaw: 90, bodyY: .35, boiler: 1, foreL: -50, foreR: -50, tailPitch: -24 }], [1.9, { ...FOLLOW, bodyPitch: 20 }], [2.3, CRASHED], [3.5, EXPOSE], [4, {}]]),
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
  pose: track([[0, {}], [.17, { ...COIL, bodyY: -.72, boiler: 1 }], [.38, VANISH], [.64, VANISH], [.8, LAND], [1, FLAP_UP], [1.27, FLAP_DN], [1.54, FLAP_UP], [CAGE_TG - .1, { ...REAR, wing: 88, bodyY: .35 }], [CAGE_TG + .2, { ...CAST, wing: 76, boiler: 1, bodyPitch: -18 }], [CAGE_END - .4, { ...FLAP_DN, boiler: 1 }], [CAGE_END + .3, CRASHED], [CAGE_END + 1, { ...CRASHED, wing: -36 }], [CAGE_DUR - .6, EXPOSE], [CAGE_DUR, {}]]),
});

// ---------------------------------------------------------------- AI glue
const SIGNATURES = [raster.id, rasterBroken.id, zigzag.id, storm.id, stormBroken.id, collapse.id, cage.id, nova.id];
const RELOCATING = new Set([blink.id, blinkHit.id, through.id, retreat.id, cage.id]);
const BIG = new Set([raster.id, rasterBroken.id, zigzag.id, storm.id, stormBroken.id, cage.id]);
// Salvo links: base weight, a touch more in later states (the last state blinks and loads faster).
const link = (atk, w, cond) => [{ atk, w, cond }, { atk, w: w * .6, cond: (m, d) => m.phase >= 1 && (!cond || cond(m, d)) }];
const close = (m, d) => d < 9;
const far = (m, d) => d > 8;
const END = (w) => ({ atk: null, w });

export const voltiris = {
  id: 'voltiris', name: 'Voltiris, die gebrochene Frequenz', hp: 23000, scale: VOLT_SCALE, bodyRadius: 2.1,
  cueParts: ['antenna'], cueIntensity: .3,
  walk: 4.6, run: 10, turn: 2.4, detect: 40, prefer: 15.5, predator: true, flinchDmg: 1500, chainMax: 4, teachAttack: double.id,
  drops: ['voltiris_flimmerfeder', 'voltiris_horn', 'voltiris_antenne', 'voltiris_kristall'],
  poseDefaults: REST, locomotionPose: poseVoltirisPresence,
  build: () => buildVoltiris(),
  attacks: Object.fromEntries(moves.map((a) => [a.id, a])),
  recoverAfter: (m) => [.36, .28, .22][m?.phase ?? 0] ?? .22,
  attackTempo: (m) => [1.08, 1.12, 1.16][m.phase] ?? 1.16,
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
  // Salvos: up to 4 quick strikes or bolt volleys (0.55-0.8 s telegraph), then a blink (queued in onAttackEnd).
  chains: {
    [bite.id]: [...link(wingEdge.id, 7, close), ...link(whirl.id, 4, close), ...link(stab.id, 3), ...link(retreat.id, 3, close), END(.6)],
    [wingEdge.id]: [...link(bite.id, 6, close), ...link(stab.id, 4), ...link(whirl.id, 3, close), ...link(retreat.id, 3, close), END(.6)],
    [tail.id]: [...link(whirl.id, 5), ...link(bite.id, 4, close), ...link(retreat.id, 4), END(.6)],
    [whirl.id]: [...link(retreat.id, 4), ...link(stab.id, 4), ...link(bite.id, 3, close), END(.6)],
    [stab.id]: [...link(double.id, 5, far), ...link(salvo.id, 4, far), ...link(bite.id, 4, close), ...link(retreat.id, 3, close), END(.6)],
    [double.id]: [...link(salvo.id, 6, far), ...link(fan.id, 5, far), ...link(strike.id, 4, far), ...link(stab.id, 2), ...link(chain.id, 4, (m) => echoCount(m) > 0), END(.8)],
    [fan.id]: [...link(salvo.id, 5, far), ...link(double.id, 4, far), ...link(strike.id, 4, far), ...link(blinkHit.id, 4, far), END(.8)],
    [salvo.id]: [...link(fan.id, 4, far), ...link(double.id, 4, far), ...link(blinkHit.id, 4, far), ...link(strike.id, 3, far), ...link(chain.id, 4, (m) => echoCount(m) > 0), END(.8)],
    [strike.id]: [...link(double.id, 5, far), ...link(salvo.id, 4, far), ...link(fan.id, 3, far), ...link(through.id, 3, far), END(.8)],
    [chain.id]: [...link(salvo.id, 4, far), ...link(double.id, 4, far), ...link(blinkHit.id, 4, far), END(.8)],
    [blinkHit.id]: [...link(bite.id, 9, close), ...link(wingEdge.id, 6, close), ...link(whirl.id, 3, close), ...link(stab.id, 3), END(.3)],
    [through.id]: [...link(tail.id, 5), ...link(bite.id, 5, close), ...link(wingEdge.id, 3, close), ...link(double.id, 3, far), END(.6)],
    [sprint.id]: [...link(bite.id, 6, close), ...link(wingEdge.id, 4, close), ...link(whirl.id, 3, close), ...link(retreat.id, 3, close), END(.6)],
    [series.id]: [...link(salvo.id, 3, far), ...link(double.id, 3, far), END(3)],
    [raster.id]: [...link(through.id, 3, far), END(4)],
    [rasterBroken.id]: [...link(through.id, 3, far), END(4)],
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
    else if (m._idleT > 1 && d < 10 && m.recover <= 0) { m.queued = blink.id; m._idleT = 0; }
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
    // The relocation blink hands straight over to the next volley or strike from its new angle.
    if (id === blink.id) m.recover = Math.min(m.recover, .14);
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
