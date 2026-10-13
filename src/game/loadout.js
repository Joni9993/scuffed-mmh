// Apply a loadout (weapon stats, armor, Macken, food) to a Player. Uses only public Player fields:
// protect, flinkfuss, stats, dmgMul, v.maxHp/maxStamina, resist, itemSpeed; wraps takeHit for Dickschädel / Hitzefell.
import { weaponStats } from '../data/weapons.js';
import { armorProtection, armorSkills, skillEffects, foodEffects } from '../meta/loadout.js';

const EISEN_T = { burn: 10, poison: 12, verwirrt: 3, itemlock: 1 }; // Standarddauern der Zustände, die Eisenmagen kürzt

export function applyLoadout(player, lo, { reapply = false } = {}) {
  const w = lo.weapon;
  const stats = weaponStats(w.type, w.tier, w.branch);
  const skills = armorSkills(lo.armor);
  const sk = skillEffects(skills);
  const food = foodEffects(lo.food);

  stats.crit += sk.crit;
  player.stats = stats;
  player.weaponTier = w.tier; player.weaponBranch = w.branch;
  if (w.branch && player.def.tierMesh) player.rebuildWeaponMesh(w.tier, w.branch); // [KT] branch-specific mesh (katana)
  player.protect = Math.round(armorProtection(lo.armor) * sk.protectMul); // Panzerhaut
  player.flinkfuss = sk.flinkfuss;
  player.skills = skills;
  player.dmgMul = 1 + food.atk;
  player.resist = { fire: Math.min(0.9, sk.fireResist), shock: Math.min(0.9, sk.shockResist), status: food.resist };
  player.suctionImmune = sk.suctionImmune; player.windImmune = sk.windImmune; // Wühler (Gorgo-Sog / Turbinen-Wind lesen das)
  player.counterBuff = sk.counterBuff; // Überladung: { atk, dur } nach Glitch-Konter (hunt.js wendet an)
  player.itemSpeed = food.itemSpeed;

  const v = player.v;
  // absolute (base + bonus), so the camp chest can re-apply a changed set without stacking
  player._baseMaxStamina ??= v.maxStamina; player._baseMaxHp ??= v.maxHp;
  v.maxStamina = player._baseMaxStamina + sk.maxStamina + food.maxStamina + (player.grillStamina ?? 0); // Grillsteak bleibt beim Truhen-Wechsel erhalten
  v.maxHp = player._baseMaxHp + food.maxHp + (player.grillHp ?? 0);
  player.mealId = lo.food ?? null; // HUD: Essens-Buff sichtbar machen
  player.foodHp = food.maxHp + (player.grillHp ?? 0); player.foodStamina = food.maxStamina + (player.grillStamina ?? 0);
  if (reapply) { v.stamina = Math.min(v.stamina, v.maxStamina); v.hp = Math.min(v.hp, v.maxHp); } // no free heal at the chest
  else { v.stamina = v.maxStamina; v.hp = v.maxHp; }
  player._sk = sk; // read by the takeHit wrapper below (stays current when the set changes)

  if (!player._loadoutWrapped) {
    player._loadoutWrapped = true;
    const orig = player.takeHit.bind(player);
    player.takeHit = (h) => {
      const sk = player._sk;
      let knock = h.knock ?? 'flinch';
      if (knock === 'down' && sk.downImmune) knock = sk.flinchImmune ? 'none' : 'flinch';
      if (knock === 'flinch' && sk.flinchImmune) knock = 'none';
      let dmgMul = h.dmgMul ?? 1;
      if (h.element === 'fire' && player.resist.fire) dmgMul *= 1 - player.resist.fire;
      if (h.element === 'shock' && player.resist.shock) dmgMul *= 1 - player.resist.shock; // Erdung
      return orig({ ...h, knock, dmgMul });
    };
    // status (burn/poison/mud) shortened by Pilzpfanne
    const addStatus = player.addStatus?.bind(player);
    if (addStatus) {
      player.addStatus = (type, opts = {}) => {
        const r = player.resist;
        if (type === 'blend') { // Macke Blendschutz: -0,3 s Weiss und -0,3 s Betaeubung je Stufe (Stufe 3: Weiss 0,1 s, keine Betaeubung)
          const cut = player._sk.blendCut ?? 0;
          return addStatus(type, { ...opts, white: Math.max(0.1, 1 - cut), stun: 1 - cut < 0.15 ? 0 : Math.max(0.2, (opts.stun ?? 1) - cut) }); // opts.stun: Blendax 2 s Betäubung
        }
        if (type === 'schleim' && player._sk.schleimFuse > 0) opts = { ...opts, t: (opts.t ?? 2) + player._sk.schleimFuse }; // Schleimhaut: Zündschnur länger
        if (player._sk.eisenCut > 0 && EISEN_T[type]) opts = { ...opts, t: (opts.t ?? EISEN_T[type]) * (1 - player._sk.eisenCut) }; // Eisenmagen: Dauer -15 % je Stufe
        if ((type === 'rust' || type === 'rost') && opts.t && player._sk.rustDurMul < 1) opts = { ...opts, t: opts.t * player._sk.rustDurMul }; // Panzerhaut
        const k = (type === 'burn' ? 1 - r.fire : 1) * (type === 'burn' || type === 'poison' ? 1 - r.status : 1);
        return addStatus(type, opts.t ? { ...opts, t: opts.t * k } : opts);
      };
    }
  }
  return { stats, skills, effects: sk, food };
}
