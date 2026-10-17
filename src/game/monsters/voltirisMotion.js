const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => t * t * (3 - 2 * t);

// Short ground contact, quick snappy return: a light, springy strider.
function stride(phase, duty, amplitude) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { swing: (-1 + 2 * t / duty) * amplitude, lift: 0 };
  const u = (t - duty) / (1 - duty);
  return { swing: (1 - 2 * smooth(u)) * amplitude, lift: Math.sin(Math.PI * u) };
}

/** Voltiris: tall agile duelist. Hovering wing flutter, darting head, veins breathe with charge. */
export function poseVoltirisPresence(m, p) {
  const speed = Math.hypot(m.vel?.x ?? 0, m.vel?.z ?? 0), time = m.time ?? 0;
  const moving = clamp(speed / 2.4, 0, 1), running = clamp((speed - 4) / 5, 0, 1);
  const cycle = (m.gait ?? 0) / TAU * 1.7, duty = .66 - running * .1;
  const amplitude = (11 + running * 5) * moving;
  const frontL = stride(cycle, duty, amplitude), frontR = stride(cycle + .5, duty, amplitude);
  const rearL = stride(cycle + .62 - running * .12, duty, amplitude * .92);
  const rearR = stride(cycle + .12 - running * .12, duty, amplitude * .92);
  const breathe = Math.sin(time * 2.1), flutter = Math.sin(time * 9.5) * .6 + Math.sin(time * 14.3 + 1) * .4;
  p.legL = p.legR = 0;
  p.foreL = frontL.swing; p.foreR = frontR.swing;
  p.hindL = rearL.swing; p.hindR = rearR.swing;
  p.foreKneeL = -30 * frontL.lift * moving; p.foreKneeR = -30 * frontR.lift * moving;
  p.foreAnkleL = -p.foreL - p.foreKneeL; p.foreAnkleR = -p.foreR - p.foreKneeR;
  p.kneeL = -36 * rearL.lift * moving; p.kneeR = -36 * rearR.lift * moving;
  p.ankleL = -p.hindL - p.kneeL; p.ankleR = -p.hindR - p.kneeR;
  // Springy bob: two bounces per cycle, light lean into the run, small side sway.
  p.bodyY = breathe * .03 - moving * .08 + Math.abs(Math.sin(cycle * TAU)) * .07 * moving;
  p.bodyRoll = Math.sin(cycle * TAU) * 1.6 * moving;
  p.bodyPitch = 1 + running * 5 + Math.sin(cycle * TAU * 2) * 1.1 * moving;
  // Hovering flutter: quick small beats, independent per wing, stronger when charged.
  const charge = clamp(m.charge ?? m.extra?.glow ?? .3, 0, 1);
  p.wing = 4 + charge * 5 + flutter * (2.2 + charge * 2.5);
  p.wingL = Math.sin(time * 11 + .8) * 2; p.wingR = Math.sin(time * 12.3 + 2) * 2.4;
  p.elbowL = flutter * 3; p.elbowR = -flutter * 3.4;
  p.wristL = Math.sin(time * 9 + 1) * 3; p.wristR = Math.sin(time * 10 + .3) * 3.4;
  p.boiler = clamp(.18 + charge * .75 + breathe * .05 + Math.max(0, Math.sin(time * 13)) * charge * .12, 0, 1);
  p.neck = -.02 + breathe * .02;
  // Head darts: quick glances with a held fixation between them.
  const dart = Math.floor(time * 1.3), glance = (hashf(dart) - .5) * 14, hold = smooth(clamp((time * 1.3 - dart) * 5, 0, 1));
  p.head = -3 - breathe * 1.2 + Math.sin(time * 5.3) * .8; p.jaw = .8 + charge * 3 + (breathe + 1) * .6;
  p.headYaw = glance * hold * (m.target ? .35 : 1); p.neckYaw = p.headYaw * .3;
  p.tailYaw = Math.sin(cycle * TAU - 1.2) * 7 * moving + Math.sin(time * 1.1) * 3;
  p.tailPitch = Math.sin(time * .9) * 2 + moving * 3;
  p.tailCurl = Math.sin(time * 1.3 - 1) * 8;
  const target = m.target?.pos;
  if (target && m.pos) {
    const dx = target.x - m.pos.x, dz = target.z - m.pos.z;
    const localX = Math.cos(m.rot ?? 0) * dx - Math.sin(m.rot ?? 0) * dz;
    const localZ = Math.sin(m.rot ?? 0) * dx + Math.cos(m.rot ?? 0) * dz;
    p.headYaw = clamp(clamp(Math.atan2(localX, localZ) * 180 / Math.PI, -30, 30) + p.headYaw, -36, 36);
    p.neckYaw = p.headYaw * .3;
  }
}
function hashf(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
