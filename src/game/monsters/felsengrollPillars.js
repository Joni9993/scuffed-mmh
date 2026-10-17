// Felsengroll's basalt pillars: terrain entities owned by the monster (m.extra.pillars).
// They appear ONLY from replicated `all` attack events (so host and guests build the same list),
// give hard cover against quake rings, boulder impacts and slag blasts, and are the crash target
// of his own rolls. Smashing and ramming are deterministic from the attack timeline too.
export const PILLAR = { R: 1.3, SECS: 25, MAX: 6, HEIGHT: 6.2, RISE: .4, ARM: .3 };

const list = (m) => (m.extra.pillars ??= []);
export const pillarLive = (p, time) => !p.dead && time >= p.t0 && time <= p.t1;

/** Raise a pillar at world x/z. `age` = seconds the spawning event fired late; `key` makes replays idempotent. */
export function addPillar(m, x, z, { age = 0, key, r = PILLAR.R, secs = PILLAR.SECS } = {}) {
  const ps = list(m), k = key ?? `fp-${ps.length}-${x.toFixed(1)}-${z.toFixed(1)}`;
  if (ps.some((p) => p.key === k)) return null;
  const now = m.time - age, p = { x, z, r, t0: now, t1: now + secs, key: k, dead: false, deadAt: 0 };
  ps.push(p);
  // The arena never floods: the oldest column crumbles first.
  while (ps.filter((q) => !q.dead).length > PILLAR.MAX) { const old = ps.find((q) => !q.dead); old.dead = true; old.deadAt = m.time; }
  return p;
}

export function breakPillar(m, p, quiet = false) {
  if (p.dead) return;
  p.dead = true; p.deadAt = m.time;
  if (quiet) return;
  const ctx = m.ctx, y = (ctx.world?.heightAt?.(p.x, p.z) ?? 0) + 1.2;
  ctx.fx?.spark?.({ x: p.x, y, z: p.z }, 22, '#9a8f80', 6);
  ctx.fx?.shake?.(.2, .2);
  ctx.bus?.emit('sfx', { name: 'heavy', pos: { x: p.x, y, z: p.z } });
}

/** Shatter every live pillar whose column touches the disc (x, z, r). Returns the number destroyed. */
export function smashPillars(m, x, z, r) {
  let n = 0;
  for (const p of list(m)) if (pillarLive(p, m.time) && Math.hypot(p.x - x, p.z - z) <= r + p.r) { breakPillar(m, p); n++; }
  return n;
}
/** Shatter pillars close to a world line segment (a spoke of the Weltenbruch). */
export function smashAlong(m, ax, az, bx, bz, r) {
  let n = 0;
  for (const p of list(m)) if (pillarLive(p, m.time) && segDist(p.x, p.z, ax, az, bx, bz) <= r + p.r) { breakPillar(m, p); n++; }
  return n;
}

export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const k = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * k), pz - (az + dz * k));
}

/** Hard cover: a standing pillar lies on the segment from the impact centre to the hunter. */
export function covered(m, from, pos) {
  const ps = m.extra.pillars; if (!ps?.length) return false;
  for (const p of ps) {
    if (!pillarLive(p, m.time) || m.time < p.t0 + PILLAR.ARM) continue;
    if (segDist(p.x, p.z, from.x, from.z, pos.x, pos.z) < p.r + .25) return true;
  }
  return false;
}

/** Live pillars that a body circle at (x, z) with radius `body` overlaps. */
export function pillarsTouching(m, x, z, body) {
  const out = [];
  for (const p of m.extra.pillars ?? []) if (pillarLive(p, m.time) && m.time >= p.t0 + .5 && Math.hypot(p.x - x, p.z - z) < body + p.r) out.push(p);
  return out;
}

/** Pillars a straight roll from (ox, oz) along (dx, dz) for `len` metres would hit. Used for the warning glow. */
export function pillarsOnPath(m, ox, oz, dx, dz, len, body) {
  const out = [];
  for (const p of m.extra.pillars ?? []) if (pillarLive(p, m.time) && segDist(p.x, p.z, ox, oz, ox + dx * len, oz + dz * len) < body + p.r) out.push(p);
  return out;
}

export function tickPillars(m) {
  const ps = m.extra.pillars; if (!ps) return;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    if (!m.alive) { ps.length = 0; return; }
    if (m.time > p.t1 + 1 || (p.dead && m.time - p.deadAt > 1.2)) ps.splice(i, 1);
  }
}
