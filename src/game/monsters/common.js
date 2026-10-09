// Small helpers shared by the Brocken definitions.
export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Smallest absolute angle between two yaws. */
export const angAbs = (a, b) => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

/** Target is behind the monster (needed for tail attacks; those start without turning around first). */
export function targetBehind(m, minAngle = 1.7) {
  const t = m.target;
  if (!t) return false;
  return angAbs(m.rot, Math.atan2(t.pos.x - m.pos.x, t.pos.z - m.pos.z)) > minAngle;
}

/**
 * Tail sweep: the body spins `sweep` rad while the tail capsule (fixed behind the monster) whips through the half circle.
 * Deterministic: direction from the attack seed (a.r(0)).
 */
export function tailSweep({ id, range = [0, 7.5], weight = 4, cooldown = 4, telegraph = 0.6, dmg, len = 7, radius = 1, sweep = 2.6, pose, flashParts = ['tail'], cond, y = 1.1, duration = 1.9, t0 = 0.62, t1 = 1.1 }) {
  return {
    id, range, weight, cooldown, telegraph, flashParts, duration, noFace: true, cond,
    marker: { at: 'self', radius: len }, markerUntil: telegraph + 0.2,
    hits: [{ t0, t1, shape: 'capsule', from: [0, y, -1.6], to: [0, y, -len], radius, dmg, knock: 'flinch' }],
    motion(tau, a) {
      const sign = a.r(0) < 0.5 ? 1 : -1;
      return { yaw: a.yaw0 + sign * sweep * smooth(clamp01((tau - (t0 - 0.12)) / (t1 - t0 + 0.12))) };
    },
    pose,
  };
}
