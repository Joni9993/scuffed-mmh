import { createPyrosturFx, groundContacts, furnacePresence, hazardsFx, L, ASH } from './pyrosturFx.js';
import { PILLAR, pillarLive, pillarsOnPath } from './felsengrollPillars.js';

// Felsengroll's look rides on Pyrostur's two bounded batches (vent cinders, slag fields, quake walls come
// from the shared hazard renderer with kind tints). Added here: basalt pillars, roll dust, spoke eruptions.
// Everything is a pure function of the monster clock and the committed attack: no timers, no pools.
const DUST = [.5, .43, .34], DUST_TOP = [.72, .64, .5], BASALT = [.17, .16, .17], BASALT_TOP = [.42, .39, .37], SEAM = [1, .55, .12], AMBER = [1, .7, .25];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const mix = (out, a, b, k) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };
const ROLLERS = new Set(['felsengroll_rollangriff', 'felsengroll_ramme']);

/** Four-sided spire (dust column / rock tooth) standing on world point (x, y, z). */
function spire(fx, b, x, y, z, r, h, base, tip) {
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + .4, a1 = (i + 1) * Math.PI / 2 + .4;
    b.tri(L(fx, 0, x + Math.sin(a0) * r, y, z + Math.cos(a0) * r), L(fx, 1, x + Math.sin(a1) * r, y, z + Math.cos(a1) * r), L(fx, 2, x, y + h, z), base, tip);
  }
}

/** Same spire in monster-local coordinates (attack shapes are monster-local). */
function spireL(b, x, y, z, r, h, base, tip) {
  for (let i = 0; i < 4; i++) {
    const a0 = i * Math.PI / 2 + .4, a1 = (i + 1) * Math.PI / 2 + .4;
    b.tri([x + Math.sin(a0) * r, y, z + Math.cos(a0) * r], [x + Math.sin(a1) * r, y, z + Math.cos(a1) * r], [x, y + h, z], base, tip);
  }
}

/** Hexagonal basalt column: broken, uneven crown; seams glow while a roll is lined up on it. */
function pillarFx(m, fx, p, time, glowing) {
  const world = m.ctx.world, b = fx.debris, gy = (world?.heightAt?.(p.x, p.z) ?? 0) - .1;
  const rise = clamp01((time - p.t0) / PILLAR.RISE), fall = p.dead ? clamp01(1 - (time - p.deadAt) / .5) : clamp01((p.t1 - time) / 1);
  const h = PILLAR.HEIGHT * (1 - (1 - rise) ** 3) * fall;
  if (h <= .05) return;
  const hot = glowing ? .5 + .5 * Math.sin(time * 16) : 0;
  const N = 6, R = p.r * (1 + (1 - rise) * .4);
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2 + p.x, a1 = (i + 1) / N * Math.PI * 2 + p.x;
    const h0 = h * (.82 + .18 * Math.sin(i * 2.7 + p.z)), h1 = h * (.82 + .18 * Math.sin((i + 1) * 2.7 + p.z));
    const x0 = p.x + Math.sin(a0) * R, z0 = p.z + Math.cos(a0) * R, x1 = p.x + Math.sin(a1) * R, z1 = p.z + Math.cos(a1) * R;
    const tx0 = p.x + Math.sin(a0) * R * .72, tz0 = p.z + Math.cos(a0) * R * .72, tx1 = p.x + Math.sin(a1) * R * .72, tz1 = p.z + Math.cos(a1) * R * .72;
    const side = i % 2 ? .75 : 1;
    const bc = mix(fx.c[0], BASALT, SEAM, hot * .55 * side), tc = mix(fx.c[1], BASALT_TOP, AMBER, hot * .9);
    b.tri(L(fx, 0, x0, gy, z0), L(fx, 1, x1, gy, z1), L(fx, 2, tx1, gy + h1, tz1), bc, tc);
    b.tri(L(fx, 0, x0, gy, z0), L(fx, 1, tx1, gy + h1, tz1), L(fx, 2, tx0, gy + h0, tz0), bc, tc);
    b.tri(L(fx, 0, tx0, gy + h0, tz0), L(fx, 1, tx1, gy + h1, tz1), L(fx, 2, p.x + Math.sin(i) * .15, gy + h * (.9 + .1 * (i % 3)), p.z), tc, mix(fx.c[2], BASALT_TOP, DUST_TOP, .4 + hot * .3));
  }
  if (time - p.t0 < .55) { // break-through dust
    const k = (time - p.t0) / .55;
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + p.z; spire(fx, b, p.x + Math.sin(a) * R * 1.5, gy, p.z + Math.cos(a) * R * 1.5, .5, 1.6 * (1 - k) + .2, DUST, DUST_TOP); }
  }
}

export function updateFelsengrollFx(m) {
  if (!m.ctx.scene) return; // headless simulations draw nothing
  const fx = m.extra.felsFx ??= createPyrosturFx(m.mesh);
  fx.flame.reset(); fx.debris.reset();
  groundContacts(m, fx);
  const time = m.time ?? 0;
  if (m.alive) {
    furnacePresence(m, fx); hazardsFx(m, fx);
    // A roll or ram aimed at a pillar lights it: the crash target is readable.
    const a = m.attack, inst = a?.inst;
    let lit = null;
    if (inst && ROLLERS.has(inst.def.id) && inst.dir1 && inst.tau(a.t) < (inst.def.crash?.[1] ?? 0)) {
      lit = pillarsOnPath(m, inst.origin.x, inst.origin.z, inst.dir1.x, inst.dir1.z, inst.len, 2.9);
    }
    for (const p of m.extra.pillars ?? []) if (pillarLive(p, time) || (p.dead && time - p.deadAt < .5)) pillarFx(m, fx, p, time, !!lit?.includes(p));
    if (a && inst) attackFx(m, fx, a, inst, time);
  }
  fx.flame.finish(); fx.debris.finish();
}

function attackFx(m, fx, a, inst, time) {
  const kind = inst.def.vfx, tau = inst.tau(a.t), b = fx.debris;
  if (fx.attack !== inst) { fx.attack = inst; fx.sounded = false; }
  if (ROLLERS.has(inst.def.id)) { // dust trail behind the curled body
    const [t0, t1] = inst.def.crash;
    if (tau >= t0 - .1 && tau <= t1 + .5) {
      const k = clamp01((tau - t0 + .1) / .3);
      for (let i = 0; i < 9; i++) {
        const age = (i + (time * 6 % 1)) / 9, z = -3.2 - age * 9, x = Math.sin(i * 2.3 + time * 5) * 2.4 * (.4 + age);
        const gx = x, gz = z, h = (1.2 + age * 2.4) * (1 - age) * k, r = (.7 + age * 1.8) * k;
        b.tri([gx - r, .15, gz], [gx + r, .15, gz], [gx, .15 + h, gz - r * .6], DUST, DUST_TOP);
        b.tri([gx, .15, gz - r], [gx, .15, gz + r], [gx + r * .3, .15 + h * .8, gz], DUST, DUST_TOP);
      }
    }
  }
  if (kind === 'meteor' && (m.air ?? 0) > 1) { // falling rock debris under the leaping body
    const kk = clamp01(m.air / 9);
    for (let i = 0; i < 8; i++) { const a2 = i * 0.785 + time * 2, rr = 2 + (i % 3) * 1.2; spireL(b, Math.sin(a2) * rr, -m.air + .1, Math.cos(a2) * rr - 1, .4, 1.2 * kk, ASH, DUST_TOP); }
  }
  if (kind === 'welt' && tau < 2.4) { // the ground cracks open around the buried body
    const k = clamp01(tau / 2.4);
    for (let i = 0; i < 12; i++) { const ang = i * Math.PI / 6, r = 7 + (i % 3) * 3; spireL(b, Math.sin(ang) * r, .05, Math.cos(ang) * r, .5 + k, .8 + k * 1.6 + .3 * Math.sin(time * 9 + i), SEAM, AMBER); }
  }
  for (const [i, h] of (inst.def.hits ?? []).entries()) {
    if (tau < h.t0 - (kind === 'welt' ? .5 : .0) || tau > h.t1 + .3) continue;
    const age = Math.max(0, (tau - h.t0) / .42);
    if (!fx.sounded && tau >= h.t0) { fx.sounded = true; m.ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); }
    if (kind === 'welt' && h.shape === 'capsule') { // spoke eruption: a row of rock teeth along the lane
      const lift = tau < h.t0 ? clamp01(1 - (h.t0 - tau) / .5) * .25 : 1 - clamp01((tau - h.t0) / .5) * .5;
      for (let j = 0; j <= 9; j++) {
        const f = j / 9, x = h.from[0] + (h.to[0] - h.from[0]) * f, z = h.from[2] + (h.to[2] - h.from[2]) * f;
        spireL(b, x, .05, z, 1.1, (2.6 + Math.sin(j * 3 + time * 11)) * lift, tau < h.t0 ? SEAM : DUST, tau < h.t0 ? AMBER : DUST_TOP);
      }
      continue;
    }
    if (h.shape === 'capsule') {
      const from = h.from, to = h.to;
      b.tri(from, to, [(from[0] + to[0]) * .5, (from[1] + to[1]) * .5 + .4, (from[2] + to[2]) * .5], ASH, DUST_TOP);
    }
    const at = h.at ?? h.to;
    for (let j = 0; j < 6; j++) {
      const ang = j * 1.047 + i, reach = h.radius * (1 + age);
      const x = at[0] + Math.sin(ang) * reach, z = at[2] + Math.cos(ang) * reach;
      b.tri([x, .08, z], [x + .22, .12, z + .22], [x, (kind === 'pillar' ? 2.2 : .9) * Math.max(.1, 1 - age), z], DUST, DUST_TOP);
    }
  }
}
