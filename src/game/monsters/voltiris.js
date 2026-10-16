import { mTrack } from './monster.js';
import { buildVoltiris } from './voltirisRig.js';
import { smooth, clamp01, targetBehind } from './common.js';

const cue = (tone) => ({ color: '#8de4df', tone });
const ball = (t, x, z, radius, dmg, knock = 'flinch') => ({ t0: t, t1: t + .13, shape: 'sphere', at: [x, 1, z], radius, dmg, knock });
const line = (t, x, z0, z1, dmg = 38) => ({ t0: t, t1: t + .13, shape: 'capsule', from: [x, 1, z0], to: [x, 1, z1], radius: .85, dmg, knock: 'flinch' });
const pose = (tg, end, charge = {}) => mTrack([[0, {}], [tg * .65, { head: -18, spread: .7, wing: 14, ...charge }], [tg, { head: -18, spread: 1, ...charge }], [tg + .18, { bodyPitch: 12, head: 25, wing: -16 }], [end - .7, { bodyY: -.3, head: 15, spread: .2 }], [end, {}]]);
function move(id, hits, { tg = .85, recovery = 1.35, range = [0, 18], weight = 3, ...rest } = {}) {
  const end = Math.max(...hits.map((h) => h.t1)) + recovery;
  const pulses = [...new Set(hits.map((h) => h.t0))];
  return { id: `voltiris_${id}`, telegraph: tg, tgVar: false, duration: end, range, weight, cooldown: 5, stam: 8, cue: cue('zisch'), markerFromHits: true, flashParts: ['antenna'], audit: [4, 9], hits, pose: pose(tg, end),
    events: pulses.map((t) => ({ t: Math.max(0, t - .15), call: 'pulse', all: true })),
    calls: { pulse(m, ctx) { ctx.bus.emit('sfx', { name: 'windup', pos: m.pos, timbre: 'zisch', f: 760, dur: .15 }); } }, ...rest };
}
const bite = move('prismenbiss', [ball(.7, 0, 3.6, 1.65, 32)], { tg: .7, range: [0, 7], weight: 6, cooldown: 2, flashParts: ['head'] });
const claw = move('fluegelkante', [{ t0: .75, t1: .92, shape: 'capsule', from: [-4, 1, 2], to: [4, 1, 2], radius: 1, dmg: 34 }], { tg: .75, range: [0, 8], flashParts: ['wing'] });
const tail = move('rueckkopplung', [ball(.8, 0, -4.6, 2.8, 38)], { tg: .8, range: [0, 9], noFace: true, weight: (m) => targetBehind(m) ? 9 : 1, flashParts: ['tail'], audit: [2, 5] });
const lattice = move('blitzraster', [-4, 0, 4].map((x) => line(1.25, x, 3, 19, 43)), { tg: 1.25, range: [4, 25], lockedByBreak: 'antenna', weight: 5, cooldown: 10, recovery: 1.9 });
const latticeBroken = move('blitzraster_bruch', [-4, 4].map((x) => line(1.25, x, 3, 19, 43)), { tg: 1.25, range: [4, 25], needsBroken: 'antenna', weight: 5, cooldown: 10, recovery: 1.9 });
// The laser alternates rows. A perpendicular sidestep beats each pulse; the inside flank stays safe.
const zigzag = move('zickzacklaser', [line(1.15, -2.8, 3, 17), line(1.75, 2.8, 3, 17), line(2.35, 0, 4, 19, 46)], { tg: 1.15, phase: 1, range: [5, 26], punishRoll: true, cooldown: 11, recovery: 1.9,
  pose: mTrack([[0, {}], [.8, { spread: 1, headYaw: -22, head: -15, wing: 25 }], [1.15, { spread: 1, headYaw: -22, head: 20 }], [1.5, { spread: 1, headYaw: 22, head: -15, wing: 25 }], [1.75, { spread: 1, headYaw: 22, head: 20 }], [2.1, { spread: 1, headYaw: 0, head: -15, wing: 25 }], [2.35, { spread: 1, head: 25, bodyPitch: 15 }], [3, { bodyY: -.3, wing: -10 }], [4.38, {}]]) });
const surge = move('antennenstoss', [line(.85, 0, 2, 9, 36)], { tg: .85, range: [2, 12], cooldown: 4, weight: 5 });
const stormHits = [ball(1.3, 0, 6, 2.25, 43), ball(2.6, 0, 6, 2.25, 47), ...[-1, 1].flatMap((s) => [ball(1.3, s * 4, 5, 2.25, 43), ball(1.95, s * 7, 10, 2.25, 43), ball(2.6, s * 4, 15, 2.25, 47)])];
const storm = move('prismensturm', stormHits, { tg: 1.3, range: [0, 26], phase: 1, cooldown: 16, recovery: 2, lockedByBreak: 'antenna', weight: 4 });
const stormBroken = move('prismensturm_bruch', stormHits.filter((h) => h.at[0] > 0), { tg: 1.3, range: [0, 26], phase: 1, cooldown: 16, recovery: 2, needsBroken: 'antenna' });
function echo(short = false) {
  const hits = [ball(.95, 0, 6, 1.7, 35), ball(1.55, -3, 8, 1.7, 35), ball(2.15, 3, 11, 2, 46)].slice(0, short ? 2 : 3);
  return move(short ? 'nachbild_bruch' : 'nachbildserie', hits, { tg: .95, range: [2, 20], cooldown: 8, recovery: 1.9, ...(short ? { needsBroken: 'wing' } : { lockedByBreak: 'wing', weight: 4 }), flashParts: ['wing'] });
}
const dash = move('phasenstich', [ball(.9, 0, 3, 1.5, 41)], {
  tg: .9, range: [6, 24], cooldown: 7, audit: [8, 15], flashParts: ['head'],
  prepare(a) { a.length = Math.max(0, Math.min(15, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 3)); },
  motion(t, a) { const k = smooth(clamp01((t - .7) / .2)); return { x: a.origin.x + Math.sin(a.yaw0) * a.length * k, z: a.origin.z + Math.cos(a.yaw0) * a.length * k }; },
});
const collapse = move('kernbruch', [ball(1.35, 0, 0, 5.8, 52, 'down')], { tg: 1.35, phase: 2, range: [0, 12], cooldown: 15, recovery: 2.2, flashParts: ['body'], audit: [3, 5] });
// Close to the committed target before short attacks instead of spending turns swiping empty air.
for (const [a, reach, cap] of [[bite, 3.6, 4], [claw, 2, 4], [collapse, 0, 6]]) {
  a.prepare = (inst) => { inst.length = Math.min(cap, Math.max(0, Math.hypot(inst.target.x-inst.origin.x,inst.target.z-inst.origin.z)-reach)); };
  a.motion = (t, inst) => { const k = smooth(clamp01((t-a.telegraph*.45)/(a.telegraph*.45))); return {x:inst.origin.x+Math.sin(inst.yaw0)*inst.length*k,z:inst.origin.z+Math.cos(inst.yaw0)*inst.length*k}; };
}
tail.cond = (m) => targetBehind(m);
claw.range = [0, 6]; collapse.range = [0, 10];
const attacks = [bite, claw, tail, lattice, latticeBroken, zigzag, surge, storm, stormBroken, echo(), echo(true), dash, collapse];
const elem = { shock: 0, fire: 20, ice: 20, water: 10 };
export const voltiris = {
  id: 'voltiris', name: 'Voltiris, die gebrochene Frequenz', hp: 23000, scale: 2, bodyRadius: 2.1,
  walk: 4, run: 10, turn: 1.8, detect: 40, prefer: 3.5, predator: true, stamina: true, flinchDmg: 1300,
  build: () => buildVoltiris(), attacks: Object.fromEntries(attacks.map((a) => [a.id, a])), teachAttack: bite.id,
  parts: [
    { id: 'antenna', label: 'Antennenkrone', factor: 1.05, breakHp: 2100, elem, spheres: [{ node: 'head', offset: [0, .45, .1], r: .65 }] },
    { id: 'head', label: 'Prismenkopf', factor: 1.15, blunt: true, stunPart: true, elem, spheres: [{ node: 'head', offset: [0, 0, .4], r: .6 }] },
    { id: 'wing', label: 'Prismaflügel', factor: .9, breakHp: 2700, elem, spheres: [{ node: 'wingL', offset: [.8, 0, 0], r: .8 }, { node: 'wingR', offset: [-.8, 0, 0], r: .8 }] },
    { id: 'body', label: 'Frequenzkern', factor: .75, elem, spheres: [{ node: 'body', offset: [0, 0, .3], r: .85 }, { node: 'body', offset: [0, 0, -.7], r: .7 }] },
    { id: 'legs', label: 'Läufe', factor: .85, elem, spheres: [{ node: 'legL', offset: [0, -.5, .1], r: .5 }, { node: 'legR', offset: [0, -.5, .1], r: .5 }] },
    { id: 'tail', label: 'Datenschweif', factor: .85, elem, spheres: [{ node: 'tail', offset: [0, .1, -1], r: .55 }] },
  ],
  phases: [{ at: .68, name: 'PRISMEN-GEWITTER', cue: cue('schrill'), special: zigzag.id }, { at: .3, name: 'LETZTES SIGNAL', cue: cue('droehn'), special: collapse.id }],
  chainMax: 2, recoverAfter: () => 1.05,
  chains: {
    [bite.id]: [{ atk: claw.id, w: 3 }, { atk: null, w: 2 }],
    [claw.id]: [{ atk: surge.id, w: 2 }, { atk: null, w: 2 }],
    [lattice.id]: [{ atk: dash.id, w: 3 }, { atk: null, w: 3 }],
    [latticeBroken.id]: [{ atk: dash.id, w: 3 }, { atk: null, w: 3 }],
    [dash.id]: [{ atk: tail.id, w: 3 }, { atk: null, w: 3 }],
    voltiris_nachbildserie: [{ atk: zigzag.id, w: 3 }, { atk: null, w: 3 }],
    [zigzag.id]: [{ atk: surge.id, w: 2 }, { atk: null, w: 3 }],
  },
  tick(m) { const echoing = m.attack?.id?.startsWith('voltiris_nachbild') && !m.partById.wing.broken; for (const e of m.extra.echoes) e.visible = !!echoing; },
  onBreak(m, part) {
    if (part.id === 'antenna') m.extra.antenna.scale.y = .25;
    if (part.id === 'wing') { m.extra.wingL.scale.x = .6; m.extra.wingR.scale.x = .6; for (const e of m.extra.echoes) e.visible = false; }
  },
  onGlitchCounter(m, id) {
    if (![lattice.id, latticeBroken.id, zigzag.id, storm.id, stormBroken.id].includes(id)) return;
    m._interrupt(); m.chainNext = null; m.queued = null; m.recover = Math.max(m.recover, 1.8);
  },
};
