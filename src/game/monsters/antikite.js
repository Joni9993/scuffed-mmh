// Anti-Kite-Helfer (docs/ANTIKITE.md): Vorhalt auf die Laufrichtung + Aufschlag-Salven um den Zielpunkt.
// Alles deterministisch aus den Startparametern (inst.target = targetPos, inst.r(i) = Seed-Würfe): Host und Gäste sehen dieselben Würfe.

/** Zielpunkt mit Vorhalt: wohin läuft der Pirscher in `t` Sekunden (gedeckelt auf `cap` m)? */
export function leadPos(tgt, t, k = 0.9, cap = 7) {
  const vx = tgt.vel?.x ?? 0, vz = tgt.vel?.z ?? 0;
  const lx = vx * t * k, lz = vz * t * k, l = Math.hypot(lx, lz), c = Math.min(1, cap / (l || 1));
  return { x: tgt.pos.x + lx * c, y: tgt.pos.y, z: tgt.pos.z + lz * c };
}

/** def.aimTarget-Hook: Angriffe mit `lead: Sekunden` zielen auf die Laufrichtung (Ergebnis reist als targetPos in den Netz-Parametern mit). */
export const aimLead = (m, ad, tgt) => (ad?.lead && tgt ? { pos: leadPos(tgt, ad.lead) } : null);

/**
 * Salve von Aufschlag-Würfen (Projektil-Definition `make`, z. B. geroellDef/glitchDef) um den Zielpunkt.
 * spots: [[seitlich, weiter, extraDauer], ...] relativ zu inst.target (weiter = in Wurfrichtung, vom Brocken weg).
 */
export function lobSalve(m, ctx, inst, age, { make, from, spots, dur = 1.0, arc = 5, splash = 1.6, dmg = 12, knock = 'flinch' }) {
  const t = inst.target, dx = t.x - from.x, dz = t.z - from.z, d = Math.hypot(dx, dz) || 1, fx = dx / d, fz = dz / d;
  const base = typeof dur === 'function' ? dur(d) : dur;
  spots.forEach(([sx, sz, extra = 0], i) => {
    const tx = t.x + fz * sx + fx * sz, tz = t.z - fx * sx + fz * sz;
    const to = { x: tx, y: ctx.world.heightAt(tx, tz), z: tz };
    m.projectiles.spawn({ ...make({ from, to, dur: base + extra, arc, splash, dmg, knock, key: `${inst.key}:l${i}` }), attackId: inst.params.attackId }, age);
  });
}

/** Wurfstartpunkt vor dem Maul/den Fäusten des Brockens (Welt), Höhe `h` über dem Boden. */
export const throwFrom = (inst, fwd = 1.6, h = 2.0) => ({ x: inst.origin.x + Math.sin(inst.yaw0) * fwd, y: inst.origin.y + h, z: inst.origin.z + Math.cos(inst.yaw0) * fwd });
