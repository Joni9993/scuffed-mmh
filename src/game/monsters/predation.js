// [L] Predation: Jaggo / Brathalos (def.predator) sometimes hunt a Mampfer while wandering, then eat it ("fressen", ~6 s).
// Eating is an attack window: any hit ends it (and counts as a sneak hit, see Hunt.playerHit).
import { stepAngle, yawOf } from '../../core/math.js';

export const EAT_TIME = 6;
export const FIRST_CD = [20, 45];

/** Called from Monster._wander. Returns true when it handled this step's movement. */
export function predationTick(m, dt) {
  if (!m.def.predator || !m.authority) return false;
  const p = (m.pred ??= { cd: m.rng.range(FIRST_CD[0], FIRST_CD[1]), prey: null, t: 0 });
  if (p.prey) {
    const pr = p.prey;
    if (!pr.alive) { p.prey = null; return false; }
    p.t += dt;
    const dx = pr.pos.x - m.pos.x, dz = pr.pos.z - m.pos.z, d = Math.hypot(dx, dz);
    if (d < 2.4 + pr.bodyRadius) {
      pr.applyDamage({ dmg: 99999, partId: 'body', elemDmg: 0, blunt: 0, attackerId: 'pred', from: { x: m.pos.x, z: m.pos.z } });
      m.eatAt = { x: pr.pos.x, z: pr.pos.z };
      m.eatT = EAT_TIME;
      m.rot = yawOf(dx, dz);
      m.vel.set(0, 0, 0);
      p.prey = null; p.cd = m.rng.range(45, 90);
      m.setState('fressen');
      return true;
    }
    if (p.t > 16) { p.prey = null; p.cd = 20; return false; }
    m._navTo(dt, pr.pos.x, pr.pos.z, m.def.run * 1.05, 4 * (m.def.turn ?? 1));
    return true;
  }
  p.cd -= dt;
  if (p.cd > 0) return false;
  let best = null, bd = 55;
  for (const o of m.ctx.monsters) {
    if (!o.alive || !o.def.prey) continue;
    const d = Math.hypot(o.pos.x - m.pos.x, o.pos.z - m.pos.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (best) { p.prey = best; p.t = 0; } else p.cd = 6;
  return false;
}

/** state 'fressen' step (authority) */
export function eatTick(m, dt) {
  m.eatT -= dt;
  m._brake(dt);
  if (m.eatAt) m.rot = stepAngle(m.rot, yawOf(m.eatAt.x - m.pos.x, m.eatAt.z - m.pos.z), 2 * dt);
  if (m.eatT <= 0) endEating(m);
}

export function endEating(m, alert = false) {
  m.eatAt = null;
  if (alert) { m.discovered = true; m.setState('notice'); } else { m.wanderTo = null; m.wanderT = 2; m.setState('wander'); }
}
