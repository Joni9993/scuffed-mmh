// Gemeinsame Bausteine der Kurven-Überarbeitung (docs/KURVE.md, Okt 2026). Nur Verhalten, keine HP/Schadens-Multiplikatoren.
import { wrapAngle } from '../../core/math.js';

/**
 * Kürzt das Keuchen beim Eintritt in die Erschöpfung (das Framework würfelt 4-6 s). Pro Frame in def.tick aufrufen; wirkt nur beim Host,
 * weil nur dort der Timer läuft. `skip` = true lässt ein bewusst langes Fenster (z. B. nach dem Urknall) in Ruhe.
 */
export function capTired(m, secs, skip = false) {
  if (m.tired) {
    if (!m._tiredOn) { m._tiredOn = true; if (!skip) m.tiredT = Math.min(m.tiredT, secs); }
  } else m._tiredOn = false;
}

/** Geglättete Pirscher-Geschwindigkeit m._tv (Teleports/Respawn rausgefiltert) fürs Vorhalten. Pro Frame in def.tick aufrufen. */
export function trackTarget(m, dt) {
  const tp = m.target?.pos, tv = (m._tv ??= { x: 0, z: 0 });
  if (tp && m._tp && m._tpId === m.target.id && dt > 0) {
    let vx = (tp.x - m._tp.x) / dt, vz = (tp.z - m._tp.z) / dt;
    if (Math.hypot(vx, vz) > 14) vx = vz = 0;
    const k = 1 - Math.exp(-dt * 6); tv.x += (vx - tv.x) * k; tv.z += (vz - tv.z) * k;
  }
  if (tp) { m._tp = { x: tp.x, z: tp.z }; m._tpId = m.target.id; }
}

/**
 * def.aimTarget-Baustein: Ziel + Geschwindigkeit * lead (max. `cap` m). Mit def.aimYaw dreht der Angriff bis 0,6 rad zur Laufrichtung nach.
 * Das Ergebnis reist als Startparameter mit (host-autoritativ, Gäste bleiben deterministisch). Umkehren oder Rollen entkommt weiterhin.
 */
export function leadAim(m, def, tgt, cap = 8) {
  const lead = def.lead ?? 0, v = m._tv;
  if (!lead || !v) return null;
  let ox = v.x * lead, oz = v.z * lead;
  const l = Math.hypot(ox, oz);
  if (l > cap) { ox *= cap / l; oz *= cap / l; }
  const pos = { x: tgt.pos.x + ox, y: tgt.pos.y, z: tgt.pos.z + oz };
  if (!def.aimYaw) return { pos };
  const turn = Math.max(-0.6, Math.min(0.6, wrapAngle(Math.atan2(pos.x - m.pos.x, pos.z - m.pos.z) - m.rot)));
  return { pos, yaw: m.rot + turn };
}

/**
 * Hagel (Fernkampf-Strafe): `n` Aufschlag-Geschosse (mode 'impact') im hohen Bogen auf die Stelle, an der der Pirscher gleich steht (`lead`), das erste mittig,
 * die anderen im Ring `ring` [min, max] m darum. Aufschlagmarker rot, Splash trifft nur im Aufschlag. Der Zufall (Ringwinkel/-radius) kommt aus dem Angriffs-Seed.
 * `from(m, inst)` -> Abwurfpunkt (Standard: 3,2 m vor dem Brocken, 3,2 m hoch). Rest (range, weight, telegraph, duration, pose, cue, audit ...) kommt aus `rest`.
 */
export function hagel({ n = 4, t0 = 0.95, step = 0.25, dmg = 24, splash = 2.2, dur = 0.8, arc = 6, ring = [1.8, 3.4], lead = 0.8, kind = 'magma', status, from, ...rest }) {
  const call = (i) => (m, ctx, inst, age = 0) => {
    const o = inst.origin, yaw = inst.yaw0;
    const src = from ? from(m, inst) : { x: o.x + Math.sin(yaw) * 3.2, y: o.y + 3.2, z: o.z + Math.cos(yaw) * 3.2 };
    const a = inst.r(i) * 6.28, d = i === 0 ? 0 : ring[0] + inst.r(i + 4) * (ring[1] - ring[0]);
    const to = { x: inst.target.x + Math.sin(a) * d, y: 0, z: inst.target.z + Math.cos(a) * d };
    to.y = ctx.world.heightAt(to.x, to.z);
    m.projectiles.spawn({ kind, mode: 'impact', from: src, to, dur, arc, radius: 0.5, splash, hold: 0.2, dmg, knock: 'flinch', status, key: `${inst.key}:g${i}`, attackId: inst.params.attackId }, age);
    ctx.fx.spark(src, 10, '#ff5a20', 5);
    ctx.bus.emit('sfx', { name: 'roar', pos: src, low: true });
  };
  const idx = Array.from({ length: n }, (_, i) => i);
  return {
    hits: [], lead, ...rest,
    events: idx.map((i) => ({ t: t0 + i * step, call: 'g' + i, all: true })),
    calls: Object.fromEntries(idx.map((i) => ['g' + i, call(i)])),
  };
}
