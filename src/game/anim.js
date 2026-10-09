// Procedural pose animation: keyframe tracks -> pose objects. Pure (no THREE).
//
// Pose keys (degrees unless noted). Limbs positive = swing FORWARD/up, arz/alz positive = outward.
//  py (m, pelvis height offset)  prx (body pitch, + = forward)  pry (body yaw twist)
//  tx torso lean (+ fwd)  ty torso twist (+ toward character's left)  tz torso side lean
//  hx head pitch  hy head yaw
//  arx arz (right arm)  alx alz (left arm)   sw (weapon pitch relative to right arm)
//  lrx rrx (left / right leg)
// Blade pitch angle (0 = down, 90 = forward, 180 = up) = arx + sw.

export const REST = {
  py: 0, prx: 0, pry: 0, tx: 3, ty: 0, tz: 0, hx: 0, hy: 0,
  arx: 25, arz: 8, sw: 155, alx: -12, alz: 9, lrx: 0, rrx: 0,
};

const ss = (t) => t * t * (3 - 2 * t);

/** frames: [[t, partialPose, 'lin'?], ...] sorted by t. Unspecified keys carry over from the previous frame. */
export function compileTrack(frames, base = REST) {
  let cur = { ...base };
  return frames.map(([t, p, mode]) => {
    cur = { ...cur, ...p };
    return { t, pose: cur, lin: mode === 'lin' };
  });
}

export function sampleTrack(track, t, out = {}) {
  if (t <= track[0].t) return Object.assign(out, track[0].pose);
  for (let i = 1; i < track.length; i++) {
    const b = track[i];
    if (t <= b.t) {
      const a = track[i - 1];
      let k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      if (!b.lin) k = ss(k);
      for (const key in b.pose) out[key] = a.pose[key] + (b.pose[key] - a.pose[key]) * k;
      return out;
    }
  }
  return Object.assign(out, track[track.length - 1].pose);
}

export function blend(a, b, k, out = {}) {
  for (const key in a) out[key] = a[key] + ((b[key] ?? a[key]) - a[key]) * k;
  return out;
}
