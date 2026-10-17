const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = t => t * t * (3 - 2 * t);

// Most of the cycle bears weight. Only the returning limb folds and clears the
// floor. Distance drives phase: changing speed cannot produce frantic idle steps.
function stride(phase, duty, amplitude) {
  const t = ((phase % 1) + 1) % 1;
  if (t < duty) return { swing: (-1 + 2 * t / duty) * amplitude, lift: 0 };
  const u = (t - duty) / (1 - duty);
  return { swing: (1 - 2 * smooth(u)) * amplitude, lift: Math.sin(Math.PI * u) };
}

/** Four independent load-bearing limbs; the wings breathe above the shoulder. */
export function posePyrosturPresence(m, p) {
  const speed = Math.hypot(m.vel.x, m.vel.z);
  const moving = clamp(speed / 2.4, 0, 1), running = clamp((speed - 4) / 5, 0, 1);
  const cycle = m.gait / TAU * 1.42, duty = .72 - running * .12;
  const amplitude = (20 + running * 9) * moving;
  const frontL = stride(cycle, duty, amplitude), frontR = stride(cycle + .5, duty, amplitude);
  const rearL = stride(cycle + .66 - running * .16, duty, amplitude * .88);
  const rearR = stride(cycle + .16 - running * .16, duty, amplitude * .88);
  const breathe = Math.sin(m.time * 1.7), strain = clamp((m.pressure ?? 0) / 100, 0, 1);
  p.legL = p.legR = 0; // Replace the shared biped leg swing, do not add it twice.
  p.foreL = frontL.swing; p.foreR = frontR.swing;
  p.hindL = rearL.swing; p.hindR = rearR.swing;
  p.foreKneeL = -42 * frontL.lift * moving; p.foreKneeR = -42 * frontR.lift * moving;
  p.foreAnkleL = -p.foreL - p.foreKneeL; p.foreAnkleR = -p.foreR - p.foreKneeR;
  p.kneeL = -48 * rearL.lift * moving; p.kneeR = -48 * rearR.lift * moving;
  p.ankleL = -p.hindL - p.kneeL; p.ankleR = -p.hindR - p.kneeR;
  p.bodyY = breathe * .025 - moving * .04 + Math.cos(cycle * TAU * 2) * .025 * moving;
  p.bodyRoll = Math.sin(cycle * TAU) * .8 * moving;
  p.bodyPitch = running * 3;
  p.wing = 2 + strain * 5 + breathe * 1.1;
  p.wingL = p.wingR = 0; p.elbowL = p.elbowR = 0;
  p.wristL = p.wristR = breathe * 1.5;
  p.boiler = .18 + strain * .7 + breathe * .06;
  p.neck = -.035 + breathe * .012;
  p.head = -2 - breathe * .9; p.jaw = 1 + strain * 3 + (breathe + 1) * .6;
  p.tailYaw = Math.sin(cycle * TAU - 1.2) * 4 * moving + Math.sin(m.time * .65) * 2;
  p.tailCurl = Math.sin(m.time * .7 - 1) * 4;
  const target = m.target?.pos;
  if (target) {
    const dx = target.x - m.pos.x, dz = target.z - m.pos.z;
    const localX = Math.cos(m.rot) * dx - Math.sin(m.rot) * dz;
    const localZ = Math.sin(m.rot) * dx + Math.cos(m.rot) * dz;
    p.headYaw = clamp(Math.atan2(localX, localZ) * 180 / Math.PI, -24, 24);
    p.neckYaw = p.headYaw * .3;
  }
}
