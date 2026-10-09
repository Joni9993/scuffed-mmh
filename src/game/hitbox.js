// Sphere / capsule overlap tests on plain {x,y,z} objects (pure, unit-tested).

export const sphere = (x, y, z, r) => ({ type: 'sphere', x, y, z, r });
export const capsule = (a, b, r) => ({ type: 'capsule', a, b, r });

export function distSqPointSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

/** Squared distance between two segments (Ericson). */
export function distSqSegmentSegment(p1, q1, p2, q2) {
  const d1 = { x: q1.x - p1.x, y: q1.y - p1.y, z: q1.z - p1.z };
  const d2 = { x: q2.x - p2.x, y: q2.y - p2.y, z: q2.z - p2.z };
  const r = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
  const dot = (u, v) => u.x * v.x + u.y * v.y + u.z * v.z;
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = clamp01(f / e); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) { t = 0; s = clamp01(-c / a); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp01(-c / a); }
      else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
    }
  }
  const c1 = { x: p1.x + d1.x * s, y: p1.y + d1.y * s, z: p1.z + d1.z * s };
  const c2 = { x: p2.x + d2.x * t, y: p2.y + d2.y * t, z: p2.z + d2.z * t };
  const dx = c1.x - c2.x, dy = c1.y - c2.y, dz = c1.z - c2.z;
  return dx * dx + dy * dy + dz * dz;
}

export function sphereSphere(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, r = a.r + b.r;
  return dx * dx + dy * dy + dz * dz <= r * r;
}
export function capsuleSphere(c, s) {
  const r = c.r + s.r;
  return distSqPointSegment(s, c.a, c.b) <= r * r;
}
export function capsuleCapsule(c1, c2) {
  const r = c1.r + c2.r;
  return distSqSegmentSegment(c1.a, c1.b, c2.a, c2.b) <= r * r;
}

/** Generic overlap for sphere/capsule shapes. */
export function overlap(s1, s2) {
  if (s1.type === 'sphere') return s2.type === 'sphere' ? sphereSphere(s1, s2) : capsuleSphere(s2, s1);
  return s2.type === 'sphere' ? capsuleSphere(s1, s2) : capsuleCapsule(s1, s2);
}

/** Player body hurtbox: upright capsule. */
export function playerCapsule(pos, radius = 0.4, height = 1.7) {
  return capsule({ x: pos.x, y: pos.y + radius, z: pos.z }, { x: pos.x, y: pos.y + height - radius, z: pos.z }, radius);
}
