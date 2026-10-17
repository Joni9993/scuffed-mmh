const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => t * t * (3 - 2 * t);

// Heavier than Pyrostur: long weight-bearing phase, slow swing, hard footfalls.
function stride(phase, duty, amplitude) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { swing: (-1 + 2 * t / duty) * amplitude, lift: 0 };
  const u = (t - duty) / (1 - duty);
  return { swing: (1 - 2 * smooth(u)) * amplitude, lift: Math.sin(Math.PI * u) };
}

/** Four pillar legs, low stance, stomp shake; seams breathe with the quake meter. */
export function poseFelsengrollPresence(m, p) {
  const speed = Math.hypot(m.vel.x, m.vel.z);
  const moving = clamp(speed / 2.4, 0, 1), running = clamp((speed - 4) / 5, 0, 1);
  const cycle = m.gait / TAU * 1.0, duty = .78 - running * .1;
  const amplitude = (15 + running * 7) * moving;
  const frontL = stride(cycle, duty, amplitude), frontR = stride(cycle + .5, duty, amplitude);
  const rearL = stride(cycle + .7 - running * .15, duty, amplitude * .85);
  const rearR = stride(cycle + .2 - running * .15, duty, amplitude * .85);
  const breathe = Math.sin(m.time * 1.2), quake = clamp((m.quake ?? 0) / 100, 0, 1);
  p.legL = p.legR = 0;
  p.foreL = frontL.swing; p.foreR = frontR.swing;
  p.hindL = rearL.swing; p.hindR = rearR.swing;
  p.foreKneeL = -34 * frontL.lift * moving; p.foreKneeR = -34 * frontR.lift * moving;
  p.foreAnkleL = -p.foreL - p.foreKneeL; p.foreAnkleR = -p.foreR - p.foreKneeR;
  p.kneeL = -40 * rearL.lift * moving; p.kneeR = -40 * rearR.lift * moving;
  p.ankleL = -p.hindL - p.kneeL; p.ankleR = -p.hindR - p.kneeR;
  // Stomp: body drops on each footfall pair, then heaves up; rolls hard onto the planted side.
  const stomp = Math.abs(Math.sin(cycle * TAU)) ;
  p.bodyY = breathe * .03 - .06 - moving * .1 - stomp * .05 * moving + Math.cos(cycle * TAU * 2) * .03 * moving;
  p.bodyRoll = Math.sin(cycle * TAU) * 2.2 * moving;
  p.bodyPitch = 1 + running * 3.5 + Math.sin(cycle * TAU * 2) * .8 * moving;
  p.wing = 1 + quake * 3 + breathe * .8;
  p.wingL = p.wingR = 0; p.elbowL = p.elbowR = 0;
  p.wristL = p.wristR = breathe * 1;
  p.boiler = .28 + quake * .6 + breathe * .08;
  p.neck = -.03 + breathe * .01;
  p.head = -1 - breathe * .7; p.jaw = .5 + quake * 3 + (breathe + 1) * .5;
  p.tailYaw = Math.sin(cycle * TAU - 1.2) * 5 * moving + Math.sin(m.time * .5) * 2;
  p.tailCurl = Math.sin(m.time * .55 - 1) * 3;
  const target = m.target?.pos;
  if (target) {
    const dx = target.x - m.pos.x, dz = target.z - m.pos.z;
    const localX = Math.cos(m.rot) * dx - Math.sin(m.rot) * dz;
    const localZ = Math.sin(m.rot) * dx + Math.cos(m.rot) * dz;
    p.headYaw = clamp(Math.atan2(localX, localZ) * 180 / Math.PI, -20, 20);
    p.neckYaw = p.headYaw * .3;
  }
}
