// Pyrostur's battlefield control: lingering scorched ground and expanding shock rings.
// Both are spawned only from `all` attack events, i.e. from replicated attack params,
// so host and guests build the same list. Every client resolves damage against its
// LOCAL hunters only, exactly like monster melee hits. Rolls keep their i-frames.

export const SCORCH = { MAX: 14, IGNITE: .35, TICK: .5, DMG: 26, RADIUS: 2.2, SECS: 7 };
export const RING = { WIDTH: 1, SPEED: 15 };
// Pyrostur burns hotter than ordinary fire: twice the DoT, longer, still never lethal.
export const GLUTBRAND = { type: 'burn', t: 12, rolls: 3, dps: 5.5 };
export const SCALD = { type: 'burn', t: 6, rolls: 2, dps: 4 };

const state = (m) => (m.extra.hazards ??= { scorch: [], rings: [], seq: 0 });

/** Burning ground at world x/z. `age` = seconds the spawning event fired late (replay). */
export function addScorch(m, x, z, { r = SCORCH.RADIUS, secs = SCORCH.SECS, age = 0, key } = {}) {
  const h = state(m), now = m.time - age;
  h.scorch.push({ x, z, r, t0: now + SCORCH.IGNITE, t1: now + SCORCH.IGNITE + secs, key: key ?? `pyro-scorch-${h.seq++}`, next: new Map() });
  // Old fires go out first: the arena stays contested, never fully flooded.
  while (h.scorch.length > SCORCH.MAX) h.scorch.shift();
}

/** A ring that grows from `r0` at `speed` m/s up to `rMax`; one hit per hunter. */
export function addRing(m, x, z, { r0 = 1.5, rMax = 16, speed = RING.SPEED, width = RING.WIDTH, dmg = 170, age = 0, key, status = GLUTBRAND, knock = 'down' }) {
  const h = state(m);
  h.rings.push({ x, z, r0, rMax, speed, width, dmg, status, knock, t0: m.time - age, key: key ?? `pyro-ring-${h.seq++}`, hit: new Set() });
}

export const ringRadius = (ring, time) => ring.r0 + Math.max(0, time - ring.t0) * ring.speed;
export const scorchLive = (s, time) => time >= s.t0 && time <= s.t1;

export function clearHazards(m) {
  const h = m.extra.hazards; if (!h) return;
  for (const ring of h.rings) m.ctx.fx?.clearMarker?.(ring.key);
  h.scorch.length = 0; h.rings.length = 0;
}

/** Per-frame on every client: expire, resolve damage on local hunters, update ring markers. */
export function tickHazards(m) {
  const h = m.extra.hazards; if (!h) return;
  const ctx = m.ctx, time = m.time;
  if (!m.alive) { clearHazards(m); return; }
  for (let i = h.scorch.length - 1; i >= 0; i--) {
    const s = h.scorch[i];
    if (time > s.t1) { h.scorch.splice(i, 1); continue; }
    if (time < s.t0) continue;
    for (const p of ctx.players) {
      if (!p.local || !p.alive || p.state === 'ko') continue;
      if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) > s.r + .3) continue;
      const next = s.next.get(p.id) ?? 0;
      if (time < next) continue;
      s.next.set(p.id, time + SCORCH.TICK);
      const res = p.takeHit({ dmg: SCORCH.DMG * (m.dmgMul ?? 1), knock: 'none', key: `${s.key}|${p.id}|${Math.floor(time / SCORCH.TICK)}`, sourcePos: { x: s.x, y: p.pos.y, z: s.z }, attackId: 'pyrostur_glutboden', monster: m, noPerfect: true, status: GLUTBRAND });
      if (res === 'hit') ctx.fx?.flash?.('rgba(255,90,20,.28)', .25);
    }
  }
  for (let i = h.rings.length - 1; i >= 0; i--) {
    const ring = h.rings[i], r = ringRadius(ring, time);
    if (time < ring.t0) continue;
    if (r > ring.rMax) { ctx.fx?.clearMarker?.(ring.key); h.rings.splice(i, 1); continue; }
    ctx.fx?.marker?.(ring.key, { x: ring.x, y: m.pos.y - (m.air ?? 0), z: ring.z }, r, '#ff4a1a', false);
    for (const p of ctx.players) {
      if (!p.local || !p.alive || ring.hit.has(p.id)) continue;
      const d = Math.hypot(p.pos.x - ring.x, p.pos.z - ring.z);
      // Hunters inside the start radius met the blast itself; the wave only runs away from them.
      if (d < ring.r0 || Math.abs(d - r) > ring.width + (p.radius ?? .4)) continue;
      const res = p.takeHit({ dmg: ring.dmg * (m.dmgMul ?? 1), knock: ring.knock, key: `${ring.key}|${p.id}`, sourcePos: { x: ring.x, y: p.pos.y, z: ring.z }, attackId: 'pyrostur_druckwelle', monster: m, status: ring.status });
      if (res === 'hit' || res === 'block' || res === 'perfect') ring.hit.add(p.id);
      if (res === 'hit') ctx.bus.emit('sfx', { name: 'monsterHit', pos: p.pos });
    }
  }
}
