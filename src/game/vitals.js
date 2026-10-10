// Pure player-vitals rules (HP / Prellung / Puste / Rolle-i-Frames). Unit-tested.

export const VIT = {
  hp: 100, stamina: 100,
  staminaRegen: 30, staminaRegenDelay: 0.4, exhaustTime: 1.2,
  sprintCost: 15, rollCost: 22, chargeCost: 12, rauschCost: 10,
  bruiseShare: 0.5, bruiseRegen: 2, bruiseDelay: 3,
};

export const ROLL = {
  duration: 0.5, dist: 4.5,
  iStart: 0.06, iEnd: 0.30, perfectWindow: 0.10,
  flinkfussPerLevel: 0.04,
};

export const HIT_REACTION = { flinch: 0.3, down: 1.0, downRollAt: 0.4, getupInvuln: 0.5, pin: 1.0 };

export function createVitals({ maxHp = VIT.hp, maxStamina = VIT.stamina } = {}) {
  return {
    maxHp, hp: maxHp, bruise: 0, sinceHit: 99,
    maxStamina, stamina: maxStamina, sinceSpend: 99, exhaust: 0, costMul: 1,
  };
}

/** Damage lowers HP; 50 % of it becomes recoverable Prellung (capped so hp+bruise <= maxHp). */
export function damageVitals(v, dmg) {
  const d = Math.max(0, dmg);
  v.hp = Math.max(0, v.hp - d);
  v.bruise = Math.min(v.bruise + d * VIT.bruiseShare, v.maxHp - v.hp);
  v.sinceHit = 0;
  return v.hp;
}

/** Prellung regenerates 2 HP/s into real HP once 3 s passed without a hit. */
export function tickPrellung(v, dt) {
  v.sinceHit += dt;
  if (v.hp <= 0 || v.bruise <= 0 || v.sinceHit < VIT.bruiseDelay) return 0;
  const heal = Math.min(v.bruise, VIT.bruiseRegen * dt, Math.max(0, v.maxHp - v.hp));
  v.hp += heal;
  v.bruise -= heal;
  return heal;
}

export function healVitals(v, hp, healBruise = false) {
  v.hp = Math.min(v.maxHp, v.hp + hp);
  if (healBruise) v.bruise = 0;
  v.bruise = Math.min(v.bruise, v.maxHp - v.hp);
}

/** Spend Puste. Reaching 0 triggers 1.2 s "Außer Puste". Returns true if stamina is now empty. */
export function spendStamina(v, amount) {
  v.stamina -= amount * v.costMul;
  v.sinceSpend = 0;
  if (v.stamina <= 0) { v.stamina = 0; v.exhaust = VIT.exhaustTime; return true; }
  return false;
}

/** Regen 30/s after 0.4 s pause; blocked while exhausted. */
export function tickStamina(v, dt) {
  v.sinceSpend += dt;
  if (v.exhaust > 0) { v.exhaust = Math.max(0, v.exhaust - dt); return; }
  if (v.sinceSpend >= VIT.staminaRegenDelay && v.stamina < v.maxStamina) {
    v.stamina = Math.min(v.maxStamina, v.stamina + VIT.staminaRegen * (v.regenMul ?? 1) * dt);
  }
}

export const canRoll = (v) => v.exhaust <= 0 && v.stamina > 0;
export const canSprint = (v) => v.exhaust <= 0 && v.stamina > 0;

/**
 * Roll timeline. t = seconds since roll start. extend = Flinkfuß bonus in seconds.
 * phase: 'startup' | 'perfect' | 'safe' | 'recovery' | 'done'. invuln = phase is perfect|safe.
 */
export function rollPhase(t, extend = 0) {
  if (t < ROLL.iStart) return { phase: 'startup', invuln: false };
  if (t <= ROLL.iStart + ROLL.perfectWindow) return { phase: 'perfect', invuln: true };
  if (t <= ROLL.iEnd + extend) return { phase: 'safe', invuln: true };
  if (t < ROLL.duration) return { phase: 'recovery', invuln: false };
  return { phase: 'done', invuln: false };
}

/** Roll displacement speed (m/s) at time t: ease-out, integrates to ROLL.dist over duration. */
export function rollSpeed(t) {
  const k = Math.max(0, 1 - t / ROLL.duration);
  return (2 * ROLL.dist / ROLL.duration) * k;
}
