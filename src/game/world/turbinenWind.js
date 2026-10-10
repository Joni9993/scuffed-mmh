// Turbinenkrone (Rostwerke Zone 4): Windboeen. Rein deterministisch aus Hunt-Seed + Hunt-Zeit (Koop: alle Clients identisch).
// Zyklus k: Dauer 8-14 s, am Ende liegt die Boee (2-3 s); davor WIND_WARN s Ankuendigung. Schub ~2,5 m/s, kein Schaden.
import { createRng } from '../../core/rng.js';

export const WIND_ZONE = 4;
export const WIND_SPEED = 2.5; // m/s Schub
export const WIND_WARN = 1.0; // s Ankuendigung (>= 0,8 s)
export const WIND_RAMP = 0.3; // s Ein-/Ausblenden der Boee

const hash01 = (seed, k, salt) => createRng((Math.imul(seed | 0, 2654435761) ^ Math.imul(k + 1, 40503) ^ Math.imul(salt, 9973)) >>> 0)();

/** Zyklus k: { start, gustStart, end, dur, ang } (Zeit in s ab Jagdbeginn). */
export function createWindSchedule(seed = 1) {
  const cycles = [];
  const cycle = (k) => {
    while (cycles.length <= k) {
      const i = cycles.length, start = i ? cycles[i - 1].end : 0;
      const period = 8 + hash01(seed, i, 1) * 6, dur = 2 + hash01(seed, i, 2);
      cycles.push({ start, end: start + period, gustStart: start + period - dur, dur, ang: hash01(seed, i, 3) * Math.PI * 2 });
    }
    return cycles[k];
  };
  /** -> { warn 0..1 (Ankuendigung), gust 0..1 (Staerke), dx, dz, active } */
  let hint = 0;
  function at(t) {
    t = Math.max(0, t);
    let k = hint;
    if (cycle(k).start > t) k = 0;
    while (cycle(k).end <= t) k++;
    hint = k;
    const c = cycle(k), dx = Math.cos(c.ang), dz = Math.sin(c.ang);
    const tg = t - c.gustStart;
    let warn = 0, gust = 0;
    if (tg < 0) warn = tg > -WIND_WARN ? 1 + tg / WIND_WARN : 0;
    else gust = Math.min(1, tg / WIND_RAMP, (c.dur - tg) / WIND_RAMP);
    return { warn, gust: Math.max(0, gust), dx, dz, active: gust > 0, cycle: k };
  }
  return { at, cycle };
}

/** Schub (m/s-Vektor) fuer einen Pirscher; null wenn nicht betroffen (nicht Zone 4, windImmune, keine Boee). */
export function windPush(state, player, zoneAt) {
  if (!state || state.gust <= 0 || !player || player.windImmune || player.alive === false) return null;
  if (zoneAt(player.pos.x, player.pos.z) !== WIND_ZONE) return null;
  return { x: state.dx * WIND_SPEED * state.gust, z: state.dz * WIND_SPEED * state.gust };
}
