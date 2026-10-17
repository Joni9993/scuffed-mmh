import { batch } from './pyrosturFx.js';
import { state, laneLive, beamAngles, cageRadius, cageLive, VOLT } from './voltirisEchoes.js';

// Voltiris draws only from committed state: lanes, echoes and the cage are lists built from replicated `all`
// events; nothing here creates damage, timers or network decisions. One bounded batch (6000 tris) plus up to
// three wireframe echo groups parented to the monster root. Headless simulations (no scene) draw nothing.
const CAP = 18000;
const TEAL = [.35, .85, .82], BRIGHT = [.9, 1, 1], DEEP = [.05, .25, .35], GOLD = [1, .95, .6];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function create(m) {
  const fx = { b: batch('voltiris-current', CAP), echoes: new Map(), c: Math.cos(0), s: 0, hum: 0 };
  m.mesh.add(fx.b.mesh);
  return fx;
}
/** World point -> monster-root local coordinates (the batch is a child of the root). */
function local(fx, m, x, y, z, out) {
  const dx = x - m.pos.x, dz = z - m.pos.z;
  out[0] = fx.c * dx - fx.s * dz; out[1] = y - m.pos.y; out[2] = fx.s * dx + fx.c * dz;
  return out;
}
const P = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
function tri(fx, m, a, b, c, col, mid = col) {
  fx.b.tri(local(fx, m, a[0], a[1], a[2], P[0]), local(fx, m, b[0], b[1], b[2], P[1]), local(fx, m, c[0], c[1], c[2], P[2]), col, mid);
}
const ground = (m, x, z) => m.ctx.world?.heightAt?.(x, z) ?? 0;

/** A jittery ribbon of lightning along a world segment; `w` half width, `lift` height above ground. */
function ribbon(fx, m, ax, az, bx, bz, w, time, col, core, lift = .12, seg = 9, seed = 0) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
  let px = ax, pz = az;
  for (let i = 1; i <= seg; i++) {
    const f = i / seg, jit = i === seg ? 0 : Math.sin(f * 31 + time * 22 + seed) * w * .55;
    const x = ax + dx * f + nx * jit, z = az + dz * f + nz * jit;
    const y0 = ground(m, px, pz) + lift, y1 = ground(m, x, z) + lift;
    tri(fx, m, [px + nx * w, y0, pz + nz * w], [px - nx * w, y0, pz - nz * w], [x, y1 + .05, z], col, core);
    tri(fx, m, [px + nx * w, y0, pz + nz * w], [x, y1 + .05, z], [x + nx * w, y1, z + nz * w], col, core);
    px = x; pz = z;
  }
}

function lanes(fx, m, v, time) {
  for (const l of v.lanes) {
    if (time > l.t1 + .3) continue;
    const warm = clamp01(1 - (l.t0 - time) / VOLT.LANE_IGNITE), live = laneLive(l, time), fade = live ? clamp01((l.t1 - time) / .5) : 0;
    if (!live) { ribbon(fx, m, l.ax, l.az, l.bx, l.bz, .12 + .1 * warm, time, DEEP, TEAL, .1, 6, 0); continue; } // thin warning thread before ignition
    ribbon(fx, m, l.ax, l.az, l.bx, l.bz, l.r * (.7 + .3 * fade), time, DEEP, TEAL, .1, 12, l.ax);
    ribbon(fx, m, l.ax, l.az, l.bx, l.bz, l.r * .35 * fade + .05, time + .1, TEAL, BRIGHT, .2, 12, l.az);
  }
}

function cage(fx, m, v, time) {
  const c = v.cage; if (!cageLive(c, time)) return;
  const R = cageRadius(c, time), armed = time >= c.t0 + VOLT.CAGE_ARM, N = 48, h = 3 + Math.sin(time * 9) * .4;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, mid = (a0 + a1) / 2;
    const x0 = c.cx + Math.sin(a0) * R, z0 = c.cz + Math.cos(a0) * R, x1 = c.cx + Math.sin(a1) * R, z1 = c.cz + Math.cos(a1) * R;
    const hh = h * (.5 + .5 * Math.sin(i * 1.7 + time * 6)) * (armed ? 1 : .35);
    tri(fx, m, [x0, ground(m, x0, z0), z0], [x1, ground(m, x1, z1), z1], [c.cx + Math.sin(mid) * R, ground(m, x0, z0) + hh + .4, c.cz + Math.cos(mid) * R], DEEP, armed ? BRIGHT : TEAL);
  }
  const angles = beamAngles(c, time);
  for (const [n, a] of angles.entries()) {
    const ex = c.cx + Math.sin(a) * VOLT.BEAM_LEN, ez = c.cz + Math.cos(a) * VOLT.BEAM_LEN;
    if (!armed) { ribbon(fx, m, c.cx, c.cz, ex, ez, .1, time, DEEP, GOLD, .4, 5, n); continue; } // the starting angle, thin and dim
    ribbon(fx, m, c.cx, c.cz, ex, ez, VOLT.BEAM_R * .9, time, DEEP, TEAL, .9, 14, n);
    ribbon(fx, m, c.cx, c.cz, ex, ez, VOLT.BEAM_R * .35, time + .2, TEAL, BRIGHT, 1.0, 14, n + 3);
  }
}

function echoes(fx, m, v, time) {
  const seen = new Set();
  for (const e of v.echoes) {
    const live = !e.dead && time >= e.t0 && time <= e.t1, dying = e.dead && time - e.deadAt < .35;
    if (!live && !dying) continue;
    seen.add(e.slot);
    let g = fx.echoes.get(e.slot);
    if (!g) { g = m.extra.makeEcho(); m.mesh.add(g); fx.echoes.set(e.slot, g); }
    g.visible = true;
    local(fx, m, e.x, ground(m, e.x, e.z), e.z, g.position);
    g.rotation.y = (e.yaw ?? 0) - m.rot;
    const mat = g.children[0]?.material, fade = clamp01((e.t1 - time) / 1.2) * clamp01((time - e.t0) / .3);
    const next = e.shots.find((s) => !s.fired), charging = next && time > next.at - VOLT.ECHO_TELE;
    if (mat) { mat.opacity = dying ? .5 * (1 - (time - e.deadAt) / .35) : (.18 + .1 * Math.sin(time * 9 + e.slot)) * fade + (charging ? .3 : 0); mat.color.set(charging ? '#ffffff' : '#8fe8ff'); }
    g.scale.setScalar(dying ? 1 + (time - e.deadAt) * 2 : 1);
  }
  for (const [slot, g] of fx.echoes) if (!seen.has(slot)) g.visible = false;
}

export function updateVoltirisFx(m) {
  if (!m.ctx.scene) return;
  const fx = (m.extra.voltFx ??= create(m)), v = state(m), time = m.time ?? 0;
  fx.c = Math.cos(m.rot); fx.s = Math.sin(m.rot); // local = Ry(-rot) * (world - pos)
  fx.b.reset();
  if (m.alive) { lanes(fx, m, v, time); if (v.cage) cage(fx, m, v, time); echoes(fx, m, v, time); }
  else for (const g of fx.echoes.values()) g.visible = false;
  fx.b.finish();
  // The real body has its own voice: a thin electric hum, twice as fast while charged up.
  if (m.alive && m.state === 'combat' && time - fx.hum > 2.4) { fx.hum = time; m.ctx.bus.emit('sfx', { name: 'windup', pos: m.pos, timbre: 'zisch', f: 340, dur: .22 }); }
}
