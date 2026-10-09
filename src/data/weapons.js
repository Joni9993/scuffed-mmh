// Pure weapon stat data (GDD 8.1). tier = 1..4. Tier 3 has two branches ('a' = Jaggo, 'b' = Barrotz);
// tiers[2] itself equals branch 'a', so the phase-1 API `weaponStats(type, tier)` keeps working.
// Extra stat fields (optional, read by weapons/combat code if they care): bluntMul (stumpf+), poisonMul (Gift-Aufbau +).
export const WEAPON_TYPES = {
  gs: { name: 'Plattmacher', tiers: [
    { name: 'Rostplatte', power: 80, crit: 0.05, elems: {} },
    { name: 'Knochenplatte', power: 100, crit: 0.05, elems: {} },
    { name: 'Jaggo-Hackbeil', power: 120, crit: 0.05, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Hackbeil', power: 120, crit: 0.05, elems: {} },
      { id: 'b', name: 'Barrotz-Brecher', power: 128, crit: 0.05, elems: {}, bluntMul: 1.3 },
    ] },
    { name: 'Brathalos-Glutplatte', power: 140, crit: 0.05, elems: { fire: 25 } },
  ] },
  db: { name: 'Zwillingsklingen', tiers: [
    { name: 'Rostklingen', power: 70, crit: 0.05, elems: {} },
    { name: 'Knochenkrallen', power: 88, crit: 0.05, elems: {} },
    { name: 'Jaggo-Zähne', power: 105, crit: 0.15, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Zähne', power: 105, crit: 0.15, elems: {} },
      { id: 'b', name: 'Schlammsauger', power: 100, crit: 0.05, elems: { shock: 14 } },
    ] },
    { name: 'Brathalos-Glühkrallen', power: 122, crit: 0.05, elems: { fire: 20 } },
  ] },
  bow: { name: 'Spannbogen', tiers: [
    { name: 'Ast-Bogen', power: 72, crit: 0.05, elems: {} },
    { name: 'Knochensehne', power: 90, crit: 0.05, elems: {} },
    { name: 'Jaggo-Kammbogen', power: 108, crit: 0.15, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Kammbogen', power: 108, crit: 0.15, elems: {} },
      { id: 'b', name: 'Barrotz-Prellbogen', power: 112, crit: 0.05, elems: { shock: 12 } },
    ] },
    { name: 'Brathalos-Schwingbogen', power: 130, crit: 0.05, elems: {}, poisonMul: 1.5 },
  ] },
};
export const WEAPON_ORDER = ['gs', 'db', 'bow'];

/** Stats of (type, tier, branch). branch only matters at tier 3 (default 'a'). */
export function weaponStats(type, tier = 1, branch = null) {
  const t = WEAPON_TYPES[type];
  const idx = Math.min(Math.max(1, tier), t.tiers.length) - 1;
  const base = t.tiers[idx];
  let stats = base;
  if (base.branches) stats = base.branches.find((b) => b.id === (branch ?? 'a')) ?? base.branches[0];
  const { branches, ...rest } = base; // eslint-disable-line no-unused-vars
  const { id, ...own } = stats; // eslint-disable-line no-unused-vars
  return { type, typeName: t.name, tier: idx + 1, branch: base.branches ? (id ?? 'a') : null, ...rest, ...own, elems: { ...(own.elems ?? {}) } };
}

// ---- Upgrade costs (Schmiede). `schrott` + material counts. Tier 4 may come from either tier-3 branch.
export const WEAPON_UPGRADES = {
  2: { cost: { schrott: 200, altknochen: 3, schrotterz: 2 } },
  3: {
    gs: { a: { cost: { schrott: 400, jaggo_schuppe: 4, jaggo_fell: 2, schrotterz: 3 } }, b: { cost: { schrott: 500, barrotz_kruste: 4, barrotz_platte: 1, schrotterz: 3 } } },
    db: { a: { cost: { schrott: 400, jaggo_schuppe: 3, jaggo_fell: 3, jaggo_kamm: 1 } }, b: { cost: { schrott: 500, barrotz_kruste: 3, barrotz_schwanzleder: 2, schrotterz: 2 } } },
    bow: { a: { cost: { schrott: 400, jaggo_kamm: 1, jaggo_schuppe: 3, jaggo_fell: 2 } }, b: { cost: { schrott: 500, barrotz_platte: 1, barrotz_kruste: 3, barrotz_schwanzleder: 1 } } },
  },
  4: { cost: { schrott: 800, brathalos_schuppe: 4, brathalos_membran: 2, glutsack: 1, glimmstein: 2 } },
};

/** What can this weapon become next? -> [{tier, branch, name, cost, stats}] (0 entries when maxed). */
export function upgradeOptions(type, tier, branch = null) {
  if (tier >= 4) return [];
  const next = tier + 1;
  if (next === 2) return [{ tier: 2, branch: null, name: weaponStats(type, 2).name, cost: WEAPON_UPGRADES[2].cost, stats: weaponStats(type, 2) }];
  if (next === 3) {
    return ['a', 'b'].map((b) => ({ tier: 3, branch: b, name: weaponStats(type, 3, b).name, cost: WEAPON_UPGRADES[3][type][b].cost, stats: weaponStats(type, 3, b) }));
  }
  return [{ tier: 4, branch: null, name: weaponStats(type, 4).name, cost: WEAPON_UPGRADES[4].cost, stats: weaponStats(type, 4) }];
}
