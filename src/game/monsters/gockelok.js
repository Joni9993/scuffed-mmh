import { mTrack } from './monster.js';
import { buildGockelok } from './gockelokRig.js';
import { smooth, clamp01, targetBehind } from './common.js';
import { spendStamina } from '../vitals.js';

const ball = (t, x, z, r, dmg, knock = 'flinch') => ({ t0: t, t1: t + .12, shape: 'sphere', at: [x, 1, z], radius: r, dmg, knock });
const common = { range: [0, 12], weight: 4, cooldown: 5, stam: 9, markerFromHits: true, audit: [4, 8], cue: { color: '#f4d36e', tone: 'knurr' }, tgVar: false };
const attack = (id, tg, hits, recovery = 1.4, rest = {}) => {
  const duration = Math.max(...hits.map((h) => h.t1)) + recovery;
  return { ...common, id: `gockelok_${id}`, telegraph: tg, duration, hits, flashParts: ['head'],
    pose: mTrack([[0, {}], [tg * .7, { bodyPitch: -12, neck: -.3, head: -20, wing: 18 }], [tg, { bodyPitch: -12, neck: -.3, head: -20 }], [tg + .12, { bodyPitch: 16, head: 35, neck: .5 }], [duration - .7, { bodyY: -.35, head: 12 }], [duration, {}]]), ...rest };
};
const peckHits = Array.from({ length: 5 }, (_, i) => ball(.85 + i * .16, 0, 3.3, 1.65, i === 4 ? 31 : 18));
const peck = attack('maschinenpicken', .85, peckHits, 1.5, { range: [0, 8], cooldown: 4, weight: 7,
  pose: mTrack([[0, {}], [.55, { neck: -.35, head: -24, bodyPitch: -10 }], ...Array.from({ length: 10 }, (_, i) => [.85 + i * .08, { neck: i % 2 ? -.3 : .7, head: i % 2 ? -20 : 35, bodyPitch: i % 2 ? -8 : 14 }]), [2, { bodyPitch: 10, head: 20 }], [3.11, {}]]),
});
function shout(broken = false) {
  const h = { ...ball(1.45, 0, 0, broken ? 10 : 15, broken ? 24 : 36), staminaDrain: broken ? 20 : 45 };
  return attack(broken ? 'kikeriki_heiser' : 'kikeriki', 1.45, [h], 2.1, {
    range: [0, 21], cooldown: 16, audit: [4, 12], flashParts: ['comb'], cue: { color: '#f4d36e', tone: 'droehn' }, ...(broken ? { needsBroken: 'comb' } : { lockedByBreak: 'comb' }),
    pose: mTrack([[0, {}], [.7, { head: -35, neck: -.4, spread: .65, bodyPitch: -10 }], [1.4, { head: -45, neck: -.5, spread: 1, wing: 25 }], [1.6, { head: -50, spread: 1, wing: 45, bodyPitch: -15 }], [2.4, { head: 20, spread: .2, bodyY: -.3 }], [3.67, {}]]),
  });
}
// Three committed landing points, each followed by three short shrapnel spokes.
// All impacts live inside AttackInstance; no host-only, unmarked delayed world damage.
export const EGG_LANDINGS = [[-4, 9], [0, 8], [4, 9]];
const eggHits = EGG_LANDINGS.flatMap(([x, z], i) => {
  const t = 1.35 + i * .36;
  return [ball(t, x, z, 2.2, 37), ...Array.from({ length: 3 }, (_, j) => {
    const angle = j * Math.PI * 2 / 3;
    return { t0: t + .24, t1: t + .36, shape: 'capsule', from: [x + Math.sin(angle) * 1.8, 1, z + Math.cos(angle) * 1.8], to: [x + Math.sin(angle) * 4, 1, z + Math.cos(angle) * 4], radius: .55, dmg: 23, knock: 'flinch' };
  })];
});
const eggs = attack('flatterartillerie', 1.35, eggHits, 2, {
  range: [6, 14], audit: [8, 12], cooldown: 12, weight: (m, d) => d > 8 ? 7 : 3, flashParts: ['wing'],
  events: EGG_LANDINGS.map((_, i) => ({ t: 1.35 + i * .36, call: 'crack', all: true })),
  calls: { crack(m, ctx) { ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); } },
  pose: mTrack([[0, {}], [.6, { bodyY: -.25, wing: 45, legL: 25, legR: 25 }], [1.1, { bodyY: .45, wing: -65, legL: -25, legR: -25 }], [1.8, { wing: 55, head: -25 }], [2.5, { bodyY: -.4, wing: 15 }], [4.55, {}]]),
});
function spin(broken = false) {
  const hits = [ball(.9, 0, 0, broken ? 3.5 : 5.3, broken ? 36 : 48, 'down')];
  if (!broken) hits.push(ball(1.25, 0, 0, 5.3, 32));
  return attack(broken ? 'spornwirbel_bruch' : 'spornwirbel', .9, hits, 1.8, {
    range: [0, broken ? 3.8 : 5.5], audit: [3, 5], cooldown: 8, flashParts: ['spur'], ...(broken ? { needsBroken: 'spur' } : { lockedByBreak: 'spur' }),
    motion(t, a) { return { yaw: a.yaw0 + Math.PI * 2 * smooth(clamp01((t - .7) / (broken ? .35 : .65))) }; },
    pose: mTrack([[0, {}], [.6, { legL: 75, wing: 35, bodyRoll: -18 }], [.9, { legL: -65, legR: -30, wing: 65, bodyRoll: 18 }], [1.4, { bodyRoll: -12, legR: 50, wing: 35 }], [3.17, {}]]),
  });
}
const sprintPoints = [[0, 0], [0, 8], [-6, 16], [4, 24]];
const sprintTimes = [1.05, 1.85, 2.65];
const sprint = attack('kopflosersprint', 1.05, sprintTimes.map((t) => ({ t0: t, t1: t + .34, shape: 'sphere', at: [0, 1, 1.7], radius: 1.65, dmg: 42, knock: 'down' })), 2.25, {
  range: [5, 34], phase: 1, cooldown: 14, weight: 6, audit: [8, 16], flashParts: ['legs'],
  motion(t, a) {
    let x = 0, z = 0, yaw = a.yaw0;
    for (let i = 0; i < 3; i++) {
      const k = clamp01((t - sprintTimes[i]) / .34), from = sprintPoints[i], to = sprintPoints[i + 1];
      x += (to[0] - from[0]) * k; z += (to[1] - from[1]) * k;
      if (t >= sprintTimes[i] - .3) yaw = a.yaw0 + Math.atan2(to[0] - from[0], to[1] - from[1]);
    }
    const s = Math.sin(a.yaw0), c = Math.cos(a.yaw0);
    return { x: a.origin.x + x * c + z * s, z: a.origin.z - x * s + z * c, yaw };
  },
  pose: mTrack([[0, {}], [.7, { head: 28, neck: .3, wing: 40, bodyPitch: 15 }], [1.05, { legL: 65, legR: -65, headYaw: -25, wing: 55 }], [1.45, { legL: -65, legR: 65, headYaw: 25 }], [1.85, { legL: 65, legR: -65, headYaw: -30 }], [2.25, { legL: -65, legR: 65, headYaw: 30 }], [2.65, { legL: 65, legR: -65 }], [3.08, { bodyY: -.75, bodyPitch: 45, head: 38, legL: -50, legR: 70, wing: 65 }], [4.5, { bodyY: -.75, bodyPitch: 40, head: 25, wing: 40 }], [5.24, {}]]),
});
const stomp = attack('stelzentritt', .75, [ball(.75, -1.5, 1.8, 1.7, 34), ball(1.35, 1.5, 1.8, 1.7, 36)], 1.5, { range: [0, 7], cooldown: 4, flashParts: ['legs'], pose: mTrack([[0, {}], [.5, { legL: 80, bodyRoll: -12 }], [.75, { legL: -20, bodyRoll: 8 }], [1.1, { legR: 80, bodyRoll: 12 }], [1.35, { legR: -20, bodyRoll: -8 }], [2.97, {}]]) });
const beak = attack('schnabelbohrer', .8, [ball(.8, 0, 3.6, 1.35, 43, 'down')], 1.5, {
  range: [4, 18], cooldown: 5, weight: 5, audit: [6, 12],
  prepare(a) { a.length = Math.min(15, Math.max(0, Math.hypot(a.target.x - a.origin.x, a.target.z - a.origin.z) - 3.6)); },
  motion(t, a) { const k = smooth(clamp01((t - .6) / .2)); return { x: a.origin.x + Math.sin(a.yaw0) * a.length * k, z: a.origin.z + Math.cos(a.yaw0) * a.length * k }; },
});
const dust = attack('staubbad', 1.2, [ball(1.2, -3.2, -1.5, 2.3, 39), ball(1.8, 3.2, -1.5, 2.3, 39)], 1.7, { range: [0, 10], noFace: true, cooldown: 9, flashParts: ['wing'], pose: mTrack([[0, {}], [.75, { bodyY: -.6, wing: 60, bodyRoll: -15 }], [1.2, { bodyRoll: 30, wing: -40 }], [1.8, { bodyRoll: -30, wing: 55 }], [2.4, { bodyY: -.4, wing: 25 }], [3.62, {}]]) });
const finale = attack('letzterweckruf', 1.35, [ball(1.35, 0, 4.8, 3, 48, 'down'), ball(2.1, -5, 5, 2, 33), ball(2.1, 5, 5, 2, 33)], 2, { range: [0, 17], phase: 2, cooldown: 15, weight: 5, audit: [4, 8], flashParts: ['comb', 'legs'], pose: mTrack([[0, {}], [.8, { head: -40, spread: 1, wing: 60, legL: 30, legR: 30 }], [1.35, { head: 40, spread: .3, neck: .6, bodyPitch: 24 }], [2.1, { wing: -60, bodyPitch: 15 }], [2.7, { bodyY: -.55, head: 25, wing: 20 }], [4.22, {}]]) });
// Read positioning and repeated dodges, never the hunter's next input.
dust.weight = (m) => targetBehind(m) ? 8 : 1;
dust.cond = (m) => targetBehind(m);
stomp.range = [0, 4];
peck.prepare = (a) => { a.length = Math.min(4.7, Math.max(0, Math.hypot(a.target.x-a.origin.x,a.target.z-a.origin.z)-3.3)); };
peck.motion = (t, a) => { const k=smooth(clamp01((t-.3)/.45));return {x:a.origin.x+Math.sin(a.yaw0)*a.length*k,z:a.origin.z+Math.cos(a.yaw0)*a.length*k}; };
finale.punishRoll = true;
finale.range = [0, 8];
// Only chain-capable footwork gets a shorter return. The final chain exit still
// adds recoverAfter, while the rooster's signatures retain their long punish windows.
for (const a of [peck, stomp, beak, dust]) a.duration = Math.max(...a.hits.map((h) => h.t1)) + .8;
const attacks = [peck, shout(), shout(true), eggs, spin(), spin(true), sprint, stomp, beak, dust, finale];
const elem = { fire: 15, shock: 15, ice: 15, water: 15, blast: 20 };
export const gockelok = {
  id: 'gockelok', name: 'Gockelok, der Ur-Hahn', hp: 28000, scale: 2.2, bodyRadius: 1.8,
  walk: 4.5, run: 12, turn: 2.5, detect: 45, prefer: 3.3, speedFactor: () => 1.35, stamina: true, flinchDmg: 1600,
  build: () => buildGockelok(), attacks: Object.fromEntries(attacks.map((a) => [a.id, a])), teachAttack: peck.id,
  parts: [
    { id: 'comb', label: 'Wackelkamm', factor: 1.15, breakHp: 2400, elem, spheres: [{ node: 'head', offset: [0, .25, .1], r: .55 }] },
    { id: 'head', label: 'Irres Hühnerhirn', factor: 1.2, blunt: true, stunPart: true, elem, spheres: [{ node: 'head', offset: [0, 0, .4], r: .55 }] },
    { id: 'spur', label: 'Ur-Sporne', factor: 1, breakHp: 2300, elem, spheres: [{ node: 'spurL', offset: [0, 0, -.2], r: .45 }, { node: 'spurR', offset: [0, 0, -.2], r: .45 }] },
    { id: 'legs', label: 'Gelbe Stelzen', factor: .95, elem, spheres: [{ node: 'legL', offset: [0, -.55, .1], r: .42 }, { node: 'legR', offset: [0, -.55, .1], r: .42 }] },
    { id: 'body', label: 'Übertriebene Brust', factor: .75, elem, spheres: [{ node: 'body', offset: [0, .1, .3], r: .8 }, { node: 'neck', offset: [0, .3, 0], r: .4 }] },
    { id: 'wing', label: 'Glitch-Federn', factor: .8, elem, spheres: [{ node: 'wingL', offset: [0, -.25, -.2], r: .6 }, { node: 'wingR', offset: [0, -.25, -.2], r: .6 }] },
    { id: 'tail', label: 'Prachtgefieder', factor: .85, elem, spheres: [{ node: 'tail', offset: [0, .4, -.5], r: .65 }] },
  ],
  phases: [{ at: .7, name: 'KOPFLOSER FEIERABEND', cue: common.cue, special: sprint.id }, { at: .32, name: 'DER LETZTE WECKRUF', cue: common.cue, special: finale.id }],
  chainMax: 2, recoverAfter: () => 1.05,
  chains: {
    [peck.id]: [{ atk: stomp.id, w: 4 }, { atk: beak.id, w: 9, cond: (m) => m.phase >= 2 }, { atk: null, w: 2 }],
    [stomp.id]: [{ atk: beak.id, w: 5 }, { atk: null, w: 2 }],
    [eggs.id]: [{ atk: beak.id, w: 3 }, { atk: null, w: 3 }],
    [beak.id]: [{ atk: peck.id, w: 5 }, { atk: 'gockelok_spornwirbel', w: 7, cond: (m) => m.phase >= 2 }, { atk: 'gockelok_spornwirbel_bruch', w: 7, cond: (m) => m.phase >= 2 }, { atk: null, w: 2 }],
    [dust.id]: [{ atk: 'gockelok_spornwirbel', w: 2 }, { atk: 'gockelok_spornwirbel_bruch', w: 2 }, { atk: null, w: 4 }],
  },
  onHitPlayer(m, player, h) { if (h.hit.staminaDrain && player.v) spendStamina(player.v, h.hit.staminaDrain); },
  onAttackEnd(m, id) { if (id === sprint.id) { m.chainNext = null; m.recover = Math.max(m.recover, 1.8); } },
  tick(m) {
    const a = m.attack, active = a?.id === eggs.id, tau = active ? a.inst.tau(a.t) : -1;
    for (let i = 0; i < 3; i++) {
      const e = m.extra.eggs[i], impact = 1.35 + i * .36, start = .65 + i * .25, k = clamp01((tau - start) / (impact - start));
      e.visible = active && tau >= start && tau < impact;
      const [x, z] = EGG_LANDINGS[i], sc = m.def.scale;
      e.position.set(x * k / sc, (1 + (1 - k) * 4 + 5 * 4 * k * (1 - k)) / sc, z * k / sc); e.rotation.x = k * 8;
    }
  },
  onBreak(m, p) {
    if (p.id === 'comb') m.extra.comb.scale.y = .25;
    if (p.id === 'spur') { m.extra.spurL.scale.z = .2; m.extra.spurR.scale.z = .2; }
  },
  onGlitchCounter(m, id) {
    if (!['gockelok_kikeriki', 'gockelok_kikeriki_heiser', sprint.id, finale.id].includes(id)) return;
    m._interrupt(); m.chainNext = null; m.queued = null; m.recover = Math.max(m.recover, 1.9);
  },
};
