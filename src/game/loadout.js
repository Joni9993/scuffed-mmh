// Apply a loadout (weapon stats, armor, Macken, food) to a Player. Uses only public Player fields:
// protect, flinkfuss, stats, dmgMul, v.maxHp/maxStamina, resist, itemSpeed; wraps takeHit for Dickschädel / Hitzefell.
import { weaponStats } from '../data/weapons.js';
import { armorProtection, armorSkills, skillEffects, foodEffects } from '../meta/loadout.js';

export function applyLoadout(player, lo) {
  const w = lo.weapon;
  const stats = weaponStats(w.type, w.tier, w.branch);
  const skills = armorSkills(lo.armor);
  const sk = skillEffects(skills);
  const food = foodEffects(lo.food);

  stats.crit += sk.crit;
  player.stats = stats;
  player.weaponTier = w.tier; player.weaponBranch = w.branch;
  player.protect = armorProtection(lo.armor);
  player.flinkfuss = sk.flinkfuss;
  player.skills = skills;
  player.dmgMul = 1 + food.atk;
  player.resist = { fire: Math.min(0.9, sk.fireResist), status: food.resist };
  player.itemSpeed = food.itemSpeed;

  const v = player.v;
  v.maxStamina += sk.maxStamina + food.maxStamina;
  v.stamina = v.maxStamina;
  v.maxHp += food.maxHp;
  v.hp = v.maxHp;

  if (!player._loadoutWrapped) {
    player._loadoutWrapped = true;
    const orig = player.takeHit.bind(player);
    player.takeHit = (h) => {
      let knock = h.knock ?? 'flinch';
      if (knock === 'down' && sk.downImmune) knock = sk.flinchImmune ? 'none' : 'flinch';
      if (knock === 'flinch' && sk.flinchImmune) knock = 'none';
      let dmgMul = h.dmgMul ?? 1;
      if (h.element === 'fire' && player.resist.fire) dmgMul *= 1 - player.resist.fire;
      return orig({ ...h, knock, dmgMul });
    };
    // status (burn/poison/mud) shortened by Pilzpfanne
    const addStatus = player.addStatus?.bind(player);
    if (addStatus) {
      player.addStatus = (type, opts = {}) => {
        const r = player.resist;
        const k = (type === 'burn' ? 1 - r.fire : 1) * (type === 'burn' || type === 'poison' ? 1 - r.status : 1);
        return addStatus(type, opts.t ? { ...opts, t: opts.t * k } : opts);
      };
    }
  }
  return { stats, skills, effects: sk, food };
}
