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

/** Squared distance between two segments (Ericson). Allocation-free (hot path: monster hits vs hunter capsules). */
export function distSqSegmentSegment(p1, q1, p2, q2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) { s = t = 0; }
  else if (a <= 1e-9) { s = 0; t = f / e; t = t < 0 ? 0 : t > 1 ? 1 : t; }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, denom = a * e - b * b;
      s = denom > 1e-9 ? (b * f - c * e) / denom : 0;
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = -c / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
      else if (t > 1) { t = 1; s = (b - c) / a; s = s < 0 ? 0 : s > 1 ? 1 : s; }
    }
  }
  const dx = p1.x + d1x * s - (p2.x + d2x * t), dy = p1.y + d1y * s - (p2.y + d2y * t), dz = p1.z + d1z * s - (p2.z + d2z * t);
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
