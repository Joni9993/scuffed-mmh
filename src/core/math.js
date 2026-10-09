export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
/** Frame-rate independent exponential smoothing factor. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
};
export const angleDiff = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));
export const stepAngle = (a, b, maxStep) => a + clamp(angleDiff(a, b), -maxStep, maxStep);
/** Yaw convention: forward(yaw) = (sin yaw, 0, cos yaw); model faces local +z. */
export const yawOf = (dx, dz) => Math.atan2(dx, dz);
export const fwd = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
export const dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
/** local (lx right-ish axis, ly up, lz forward) -> world, around pos with yaw. out is {x,y,z}. */
export function localToWorld(out, pos, yaw, lx, ly, lz) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  out.x = pos.x + lx * c + lz * s;
  out.y = pos.y + ly;
  out.z = pos.z - lx * s + lz * c;
  return out;
}
