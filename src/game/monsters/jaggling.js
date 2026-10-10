import { buildRaptor } from './raptor.js';
import { mTrack } from './monster.js';
import { smooth, clamp01, angAbs } from './common.js';

// Jagglinge: small pack raptors. HP 80, circle the hunter, dart in to bite (0.5 s telegraph), retreat. Max 3 alive.
const SC = 0.62;
export const MAX_JAGGLINGE = 3;

const bite = {
  id: 'jaggling_biss', range: [0, 2.6], weight: 1, cooldown: 1.4, telegraph: 0.5, flashParts: ['head'], duration: 1.1,
  hits: [{ t0: 0.58, t1: 0.72, shape: 'sphere', at: [0, 0.9, 1.15], radius: 0.6, dmg: 6, knock: 'flinch' }],
  motion(tau, a) {
    const k = clamp01((tau - 0.5) / 0.1) * 0.6;
    return { x: a.origin.x + a.dir.x * k, z: a.origin.z + a.dir.z * k };
  },
  pose: mTrack([[0, {}], [0.4, { neck: -0.4, head: -10 }], [0.5, { neck: -0.4 }], [0.62, { neck: 0.5, head: 12, bodyPitch: 8 }, 'lin'], [0.9, {}], [1.1, {}]]),
};

// Sprungbiss: crouches (head + body flash), darts up to 6 m at the hunter, bites mid-air.
const dart = {
  id: 'jaggling_sprung', range: [2.2, 8], weight: 3, cooldown: 2.5, telegraph: 0.5, flashParts: ['head', 'body'], duration: 1.5,
  prepare(a) {
    const dx = a.target.x - a.origin.x, dz = a.target.z - a.origin.z, d = Math.hypot(dx, dz) || 1;
    const len = Math.min(6, Math.max(1.8, d - 0.9));
    a.landing = { x: a.origin.x + (dx / d) * len, z: a.origin.z + (dz / d) * len };
    a.dartYaw = Math.atan2(dx, dz);
  },
  hits: [{ t0: 0.6, t1: 0.9, shape: 'sphere', at: [0, 0.75, 0.95], radius: 0.65, dmg: 6, knock: 'flinch' }],
  motion(tau, a) {
    const k = smooth(clamp01((tau - 0.5) / 0.32));
    return {
      x: a.origin.x + (a.landing.x - a.origin.x) * k, z: a.origin.z + (a.landing.z - a.origin.z) * k,
      yaw: a.dartYaw, air: 0.55 * 4 * k * (1 - k),
    };
  },
  pose: mTrack([
    [0, {}], [0.3, { bodyY: -0.35, bodyPitch: 10, legL: 50, legR: 50, neck: -0.35, head: -14 }], [0.5, { bodyY: -0.4, bodyPitch: 12, legL: 55, legR: 55, neck: -0.4, head: -16 }],
    [0.68, { bodyY: 0.05, bodyPitch: -6, legL: -30, legR: -30, neck: 0.5, head: 14 }, 'lin'], [0.95, { bodyY: -0.05, bodyPitch: 6, legL: 20, legR: 20, neck: 0.2, head: 6 }], [1.5, {}],
  ]),
};

/** Spawn up to n Jagglinge around pos (respects the max of 3 alive). Returns the spawned monsters. */
export function spawnPack(ctx, pos, n = 2, { state = 'wander', spread = 3.2, target = null, ambient = false } = {}) {
  // ambient packs (hunt start) live outside the Rudelruf cap of 3 so they never block Jaggo's call
  const active = ctx.monsters ? ctx.monsters.filter((o) => o.alive && o.def.id === 'jaggling' && !o.ambient).length : ctx.countMonsters('jaggling');
  const k = ambient ? n : Math.min(n, MAX_JAGGLINGE - active);
  const out = [];
  const a0 = (ctx.rng ? ctx.rng() : Math.random()) * Math.PI * 2;
  for (let i = 0; i < k; i++) {
    const a = a0 + (i / Math.max(1, k)) * Math.PI * 2;
    const x = pos.x + Math.sin(a) * spread, z = pos.z + Math.cos(a) * spread;
    const m = ctx.spawnMonster('jaggling', { x, z, yaw: a + Math.PI, state });
    if (!m) continue;
    m.home = { x: pos.x, z: pos.z };
    m.ambient = ambient;
    if (target) { m.target = target; m.discovered = true; }
    m.recover = 0.6 + i * 0.25;
    ctx.fx?.spark?.({ x, y: ctx.world.heightAt(x, z) + 0.4, z }, 10, '#a08a60', 4);
    out.push(m);
  }
  return out;
}

const others = (m) => m.ctx.monsters.filter((o) => o !== m && o.alive && o.def.id === 'jaggling');

export const jaggling = {
  id: 'jaggling',
  name: 'Jaggling',
  minor: true,
  hp: 80,
  scale: SC,
  bodyRadius: 0.6,
  walk: 2.4, run: 6.6, detect: 22, prefer: 1.4, noticeTime: 0.5,
  drops: ['jaggling_schuppe'],
  parts: [
    { id: 'head', label: 'Kopf', factor: 1.0, elem: {}, lock: false, spheres: [{ node: 'head', offset: [0, 0.05, 0.4], r: 0.55 }] },
    { id: 'body', label: 'Körper', factor: 0.8, elem: {}, spheres: [{ node: 'body', offset: [0, 0, 0.2], r: 0.9 }, { node: 'legL', offset: [0, -0.5, 0.1], r: 0.6 }] },
  ],
  attacks: { jaggling_biss: bite, jaggling_sprung: dart },
  build: () => buildRaptor({ scale: SC, skin: 'scale', crest: false }),
  homeWander: true, // wander around the pack's home instead of the Brocken routes
  /** ambient packs give up the chase when the hunter is far away */
  tick(m, dt) {
    if (!m.ambient || !m.authority || m.state !== 'combat' || !m.target) return;
    const t = m.target;
    if (Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z) > 38) { m.target = null; m.attack = null; m.discovered = false; m.setState('wander'); m.wanderTo = null; m.wanderT = 1; }
  },
  init(m) { m.jx = { dartCd: 1.2 + m.rng() * 2, retreatT: 0, dir: m.rng() < 0.5 ? 1 : -1 }; },
  recoverAfter: () => 0.25,
  onAttackEnd(m) { m.jx.retreatT = 0.9 + m.rng() * 0.8; m.jx.dartCd = 1.8 + m.rng() * 2.4; },
  /**
   * Pack AI: circle the hunter at 5-7 m (each Jaggling on its own slot), dart in one or two at a time, retreat afterwards.
   * Returns true: the base combat logic is skipped.
   */
  combat(m, dt) {
    const t = m.target;
    const jx = m.jx;
    const dx = t.pos.x - m.pos.x, dz = t.pos.z - m.pos.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const pack = [m, ...others(m)].sort((a, b) => (a.id < b.id ? -1 : 1));
    const idx = pack.indexOf(m), n = pack.length;
    if (jx.retreatT > 0) {
      jx.retreatT -= dt;
      if (dist < 7) { m._moveToward(dt, -dx, -dz, m.def.run * 0.9, 6); return true; }
    }
    jx.dartCd -= dt;
    m.recover -= dt;
    // close quarters: plain bite
    if (dist < 2.1 && (m.cds.jaggling_biss ?? 0) <= 0 && m.recover <= 0 && angAbs(m.rot, want) < 0.5) { m.beginAttack('jaggling_biss'); return true; }
    const darters = others(m).filter((o) => o.attack).length;
    if (jx.dartCd <= 0 && darters < 2 && dist > 2.2 && dist < 9 && m.recover <= 0) {
      if (angAbs(m.rot, want) > 0.3) { m._faceTarget(dt, 7); m._brake(dt); return true; }
      m.beginAttack('jaggling_sprung');
      return true;
    }
    // circle on own slot
    const R = 5.6 + (idx % 2) * 1.6;
    const ang = m.time * 0.5 * jx.dir + (idx / n) * Math.PI * 2;
    const gx = t.pos.x + Math.cos(ang) * R, gz = t.pos.z + Math.sin(ang) * R;
    const gd = Math.hypot(gx - m.pos.x, gz - m.pos.z);
    if (gd > 1.2) m._navTo(dt, gx, gz, m.def.run * Math.min(1, 0.45 + gd * 0.12), 6);
    else { m._faceTarget(dt, 6); m._brake(dt); }
    return true;
  },
};
