// Cinema migration: one host decision, one replayable attack, no per-frame network path.
import { mTrack } from './monster.js';
import { clamp01, smooth } from './common.js';

export const MIGRATION = 'apex_migration';
export const apexMigration = {
  id: MIGRATION, internal: true, noTeach: true, tgVar: false, range: [0, 400], weight: 0,
  telegraph: 6.85, duration: 8.6, cooldown: 0, stam: 0, ignoreTerrain: true,
  markerFromHits: true, markerLead: 3, flashParts: ['body'], audit: [4, 8],
  cue: { color: '#b8d8e8', tone: 'droehn' },
  prepare(a) { a.landing = { x: a.target.x, z: a.target.z }; },
  motion(t, a) {
    const travel = smooth(clamp01((t - 1) / 2.8));
    const up = smooth(clamp01(t / 1.0)), down = smooth(clamp01((t - 6.05) / 0.8));
    return {
      x: a.origin.x + (a.target.x - a.origin.x) * travel,
      z: a.origin.z + (a.target.z - a.origin.z) * travel,
      groundY: a.origin.y + (a.target.y - a.origin.y) * travel,
      air: 25 * up * (1 - down),
    };
  },
  hits: [{ t0: 6.85, t1: 6.98, shape: 'sphere', at: [0, 0.8, 0], radius: 7, dmg: 46, knock: 'down' }],
  events: [{ t: 0.4, call: 'lift', all: true }, { t: 6.85, call: 'land', all: true }],
  calls: {
    lift(m, ctx) { ctx.bus.emit('sfx', { name: 'swing', pos: m.pos, heavy: true }); },
    land(m, ctx) {
      ctx.fx.spark?.(m.pos, 22, '#b8c0d0', 6);
      ctx.fx.shake?.(0.45, 0.35);
      ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos });
    },
  },
  pose: mTrack([[0, {}], [0.5, { bodyY: -0.3, spread: 1, wing: -30 }],
    [1.1, { spread: 1, wing: 45, bodyPitch: -10, legL: 40, legR: 40 }],
    [6, { spread: 1, wing: 25, bodyPitch: -8, legL: 40, legR: 40 }],
    [6.6, { spread: 0.7, wing: -25, bodyPitch: 28 }],
    [6.85, { spread: 0.7, bodyY: -0.5, bodyPitch: 12 }], [8.6, {}]]),
};

function depart(m, destination, rest = false) {
  if (Math.hypot(destination.x - m.pos.x, destination.z - m.pos.z) < 10) return false;
  m.apexRest = rest;
  m.apexClock = 0;
  m.chain = m.chainNext = null;
  m.setState('fly');
  m.beginAttack(MIGRATION, {
    targetPos: { ...destination, y: m.ctx.world.heightAt(destination.x, destination.z) },
    rage: false, tgMul: 1, tempoMul: 1,
  });
  return true;
}

/** Compose, rather than replace, each dragon's own pressure/state/pose hooks. */
export function withApexFlight(def, zones) {
  const hooks = { init: def.init, tick: def.tick, combat: def.combat, onAttackEnd: def.onAttackEnd, poseHook: def.poseHook };
  def.apexZones = zones;
  def.fly ??= { height: 25, dropDamage: 650 };
  def.attacks = { ...def.attacks, [MIGRATION]: apexMigration };
  def.init = (m) => { hooks.init?.(m); m.apexClock = 0; m.apexZone = 0; };
  def.tick = (m, dt) => {
    hooks.tick?.(m, dt);
    if (m.authority && m.state === 'combat' && !m.tired) m.apexClock += dt;
  };
  def.combat = (m, dt) => {
    // Stay grounded for well over 75% of combat; never steal a break/chain counter-window.
    if (m.authority && m.ctx.world.id === 'glitchgrat' && m.apexClock >= 65 && m.recover <= 0 &&
        !m.chainNext && !m.queued && !m.phaseT && !m.tired) {
      const current = m.ctx.world.zoneAt(m.pos.x, m.pos.z);
      const next = zones[(Math.max(0, zones.indexOf(current)) + 1) % zones.length];
      const dest = m.ctx.world.layout.nests[next];
      if (depart(m, dest)) {
        m.apexZone = next;
        m.ctx.bus.emit('zoneFlight', { monster: m, zone: next });
        return true;
      }
    }
    return hooks.combat?.(m, dt);
  };
  def.flee = (m) => {
    if (m.ctx.world.id !== 'glitchgrat') return false;
    return depart(m, m.ctx.world.nestFor(def.id), true);
  };
  def.onAttackEnd = (m, id, inst) => {
    if (id !== MIGRATION) return hooks.onAttackEnd?.(m, id, inst);
    m.air = 0;
    if (m.authority) {
      m._landOnGround();
      m.fleeing = false;
      m.setState(m.apexRest ? 'sleep' : 'combat');
      m.recover = 1.8;
    }
    m.apexRest = false;
  };
  def.poseHook = (m, pose) => {
    hooks.poseHook?.(m, pose);
    if (m.attack?.id === MIGRATION && m.air > 1) pose.wing = (pose.wing ?? 0) + Math.sin(m.time * 8) * 30;
  };
  return def;
}
