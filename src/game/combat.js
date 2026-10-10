// Damage rules (GDD 3.5). Pure functions, unit-tested.

export const HITSTOP = { none: 0, light: 0.04, medium: 0.07, heavy: 0.12 }; // [W] 'none' for projectiles
export const SHAKE = { none: 0, light: 0.08, medium: 0.18, heavy: 0.34 };
export const CRIT_MUL = 1.25;
export const GLITCH_MUL = 1.5;
export const SAUBER_MUL = 1.15;
export const WEAK_THRESHOLD = 0.9;
export const SLEEP_MUL = 2;

/** Defence: damage reduction = protect / (protect + 80). */
export const protectReduction = (protect) => protect / (protect + 80);

/**
 * Schaden = Waffenkraft x Bewegungswert x Trefferzonen-Faktor x Krit x Bonus + Elementkraft x Elementzonen-Faktor.
 * mv in percent; zone/elemZone are factors (elemZone already /100).
 */
export function calcDamage({ power, mv, zone = 1, crit = false, glitch = false, sauber = false, sauberMul = SAUBER_MUL, extra = 1, elem = 0, elemZone = 0 }) { // [KT] sauberMul per hit (Blankgezogen +20 %)
  const bonus = (glitch ? GLITCH_MUL : 1) * (sauber ? sauberMul : 1) * extra;
  const phys = power * (mv / 100) * zone * (crit ? CRIT_MUL : 1) * bonus;
  const elemDmg = elem * elemZone;
  return { phys, elemDmg, total: phys + elemDmg };
}

/**
 * Resolve one player hit against one monster part.
 * Result contract: `dmg` is the TOTAL damage (physical + element); `elemDmg` is the element share of it, for display/stats only.
 * attacker: {power, critChance, elems:{fire,shock,...}, glitch, sauber, dmgMul}
 * hit: move hit def {mv, blunt, wucht, hitstop}   part: monster part (factor, elem, blunt)
 * opts: {sleeping, zoneOverride}
 */
export function resolvePlayerHit(attacker, hit, part, rng, opts = {}) {
  const zone = opts.zoneOverride ?? part.factor;
  const crit = rng() < (attacker.critChance ?? 0.05);
  let elemSum = 0;
  const elemBy = {}; // [M] per-element damage (Barrotz mud armour breaks on shock)
  for (const [k, v] of Object.entries(attacker.elems || {})) { const e = v * ((part.elem?.[k] ?? 0) / 100); elemSum += e; elemBy[k] = Math.round(e); }
  const dmg = calcDamage({
    power: attacker.power, mv: hit.mv, zone, crit,
    glitch: attacker.glitch, sauber: attacker.sauber, sauberMul: hit.sauberMul,
    extra: (attacker.dmgMul ?? 1) * (opts.sleeping ? SLEEP_MUL : 1),
    elem: elemSum, elemZone: 1,
  });
  const total = Math.max(1, Math.round(dmg.total));
  const weak = zone >= WEAK_THRESHOLD;
  const size = hit.hitstop || 'light';
  return {
    dmg: total, elemDmg: Math.round(dmg.elemDmg), elemBy, crit, weak, zone,
    blunt: (hit.blunt || 0) * (part.blunt === false ? 0 : 1),
    stunEligible: !!part.stunPart,
    wucht: hit.wucht || 0,
    partId: part.id, hitstop: HITSTOP[size], shake: SHAKE[size],
  };
}

/** Hand a resolved hit to the monster (host/solo). In coop a guest sends it over the net instead. */
export function applyMonsterHit(monster, result, ctx) {
  if (ctx?.net?.isGuest) { ctx.net.sendHit(monster, result); return null; }
  return monster.applyDamage(result);
}

/** Pick the best part (highest factor) among overlapping parts. */
export function pickPart(parts) {
  let best = null;
  for (const p of parts) if (!best || p.factor > best.factor) best = p;
  return best;
}
