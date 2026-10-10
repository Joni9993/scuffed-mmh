// Pure weapon stat data (GDD 8.1). tier = 1..6 (5 = Rostwerke-Äste k/g/v, 6 = nur v). Tier 3 has two branches ('a' = Jaggo, 'b' = Barrotz);
// tiers[2] itself equals branch 'a', so the phase-1 API `weaponStats(type, tier)` keeps working.
// Extra stat fields (optional, read by weapons/combat code if they care): bluntMul (stumpf+), poisonMul (Gift-Aufbau +), partDmgMul (Teil-HP-Schaden, Kroll-Ast).
export const WEAPON_TYPES = {
  gs: { name: 'Plattmacher', tiers: [
    { name: 'Rostplatte', power: 80, crit: 0.05, elems: {} },
    { name: 'Knochenplatte', power: 100, crit: 0.05, elems: {} },
    { name: 'Jaggo-Hackbeil', power: 120, crit: 0.05, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Hackbeil', power: 120, crit: 0.05, elems: {} },
      { id: 'b', name: 'Barrotz-Brecher', power: 128, crit: 0.05, elems: {}, bluntMul: 1.3 },
    ] },
    { name: 'Brathalos-Glutplatte', power: 140, crit: 0.05, elems: { fire: 25 } },
    // Stufe 5 (Rostwerke): k = Kroll (Rost, Teilbruch), g = Gorgo (Feuer/Schlacke, Krit), v = Voltaro (Schock). Stufe 6 nur v.
    { name: 'Kesselbrecher', power: 160, crit: 0.05, elems: {}, branches: [
      { id: 'k', name: 'Kesselbrecher', power: 158, crit: 0.05, elems: { rust: 24 }, partDmgMul: 1.25 },
      { id: 'g', name: 'Schlackenwalze', power: 160, crit: 0.15, elems: { fire: 26 } },
      { id: 'v', name: 'Funkenhammer', power: 164, crit: 0.05, elems: { shock: 28 } },
    ] },
    { name: 'Funkenfürst-Plattmacher', power: 188, crit: 0.05, elems: { shock: 40 }, branches: [
      { id: 'v', name: 'Funkenfürst-Plattmacher', power: 188, crit: 0.05, elems: { shock: 40 } },
    ] },
  ] },
  db: { name: 'Zwillingsklingen', tiers: [
    { name: 'Rostklingen', power: 70, crit: 0.05, elems: {} },
    { name: 'Knochenkrallen', power: 88, crit: 0.05, elems: {} },
    { name: 'Jaggo-Zähne', power: 105, crit: 0.15, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Zähne', power: 105, crit: 0.15, elems: {} },
      { id: 'b', name: 'Schlammsauger', power: 100, crit: 0.05, elems: { shock: 14 } },
    ] },
    { name: 'Brathalos-Glühkrallen', power: 122, crit: 0.05, elems: { fire: 20 } },
    { name: 'Scherenzangen', power: 138, crit: 0.05, elems: {}, branches: [
      { id: 'k', name: 'Scherenzangen', power: 136, crit: 0.05, elems: { rust: 20 }, partDmgMul: 1.25 },
      { id: 'g', name: 'Schlackezähne', power: 138, crit: 0.15, elems: { fire: 22 } },
      { id: 'v', name: 'Spulenklingen', power: 142, crit: 0.05, elems: { shock: 24 } },
    ] },
    { name: 'Funkenfürst-Zwillinge', power: 164, crit: 0.05, elems: { shock: 34 }, branches: [
      { id: 'v', name: 'Funkenfürst-Zwillinge', power: 164, crit: 0.05, elems: { shock: 34 } },
    ] },
  ] },
  bow: { name: 'Spannbogen', tiers: [
    { name: 'Ast-Bogen', power: 72, crit: 0.05, elems: {} },
    { name: 'Knochensehne', power: 90, crit: 0.05, elems: {} },
    { name: 'Jaggo-Kammbogen', power: 108, crit: 0.15, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Kammbogen', power: 108, crit: 0.15, elems: {} },
      { id: 'b', name: 'Barrotz-Prellbogen', power: 112, crit: 0.05, elems: { shock: 12 } },
    ] },
    { name: 'Brathalos-Schwingbogen', power: 130, crit: 0.05, elems: {}, poisonMul: 1.5 },
    { name: 'Kessel-Spannbogen', power: 150, crit: 0.05, elems: {}, branches: [
      { id: 'k', name: 'Kessel-Spannbogen', power: 148, crit: 0.05, elems: { rust: 18 }, partDmgMul: 1.25, poisonMul: 1.5 },
      { id: 'g', name: 'Wurmgrat-Bogen', power: 150, crit: 0.15, elems: { fire: 20 }, poisonMul: 1.5 },
      { id: 'v', name: 'Spulenbogen', power: 154, crit: 0.05, elems: { shock: 22 }, poisonMul: 1.5 },
    ] },
    { name: 'Funkenfürst-Bogen', power: 178, crit: 0.05, elems: { shock: 32 }, poisonMul: 1.5, branches: [
      { id: 'v', name: 'Funkenfürst-Bogen', power: 178, crit: 0.05, elems: { shock: 32 }, poisonMul: 1.5 },
    ] },
  ] },
  // [KT] Katana (GDD 4.4): Zweig a = Jaggo-Reißzahn (Krit 15 %), Zweig b = Barrotz-Schlickschneide (Schock 14)
  kt: { name: 'Katana', tiers: [
    { name: 'Rostkatana', power: 78, crit: 0.05, elems: {} },
    { name: 'Knochenkatana', power: 96, crit: 0.05, elems: {} },
    { name: 'Jaggo-Reißzahn', power: 112, crit: 0.15, elems: {}, branches: [
      { id: 'a', name: 'Jaggo-Reißzahn', power: 112, crit: 0.15, elems: {} },
      { id: 'b', name: 'Barrotz-Schlickschneide', power: 110, crit: 0.05, elems: { shock: 14 } },
    ] },
    { name: 'Brathalos-Glutkatana', power: 128, crit: 0.05, elems: { fire: 22 } },
    { name: 'Panzerschnitt', power: 144, crit: 0.05, elems: {}, branches: [
      { id: 'k', name: 'Panzerschnitt', power: 142, crit: 0.05, elems: { rust: 18 }, partDmgMul: 1.25 },
      { id: 'g', name: 'Glutwurm-Katana', power: 144, crit: 0.15, elems: { fire: 20 } },
      { id: 'v', name: 'Blitzkatana', power: 148, crit: 0.05, elems: { shock: 22 } },
    ] },
    { name: 'Funkenfürst-Katana', power: 170, crit: 0.05, elems: { shock: 32 }, branches: [
      { id: 'v', name: 'Funkenfürst-Katana', power: 170, crit: 0.05, elems: { shock: 32 } },
    ] },
  ] },
};
export const WEAPON_ORDER = ['gs', 'db', 'bow', 'kt'];

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
    kt: { a: { cost: { schrott: 400, jaggo_schuppe: 3, jaggo_fell: 2, jaggo_kamm: 1, schrotterz: 2 } }, b: { cost: { schrott: 500, barrotz_kruste: 3, barrotz_platte: 1, barrotz_schwanzleder: 1, schrotterz: 2 } } }, // [KT]
  },
  4: { cost: { schrott: 800, brathalos_schuppe: 4, brathalos_membran: 2, glutsack: 1, glimmstein: 2 } },
  // Stufe 5 (aus Stufe 4): Ast k = Kroll, g = Gorgo, v = Voltaro. Stufe 6 nur aus v (Voltaro-Herz).
  5: {
    gs: { k: { cost: { schrott: 1200, kroll_panzer: 5, kroll_schere: 2, kroll_auge: 1, kupferdraht: 4 } }, g: { cost: { schrott: 1200, gorgo_segment: 5, gorgo_zahn: 2, gorgo_kern: 1, schlacke: 6 } }, v: { cost: { schrott: 1500, voltaro_kamm: 1, voltaro_spule: 4, voltaro_fell: 3, funkenstein: 2 } } },
    db: { k: { cost: { schrott: 1200, kroll_panzer: 3, kroll_schere: 4, kroll_auge: 1, kupferdraht: 4 } }, g: { cost: { schrott: 1200, gorgo_segment: 3, gorgo_zahn: 4, gorgo_kern: 1, schlacke: 6 } }, v: { cost: { schrott: 1500, voltaro_kamm: 1, voltaro_spule: 3, voltaro_fell: 4, funkenstein: 2 } } },
    bow: { k: { cost: { schrott: 1200, kroll_panzer: 3, kroll_schere: 2, kroll_auge: 3, kupferdraht: 4 } }, g: { cost: { schrott: 1200, gorgo_segment: 4, gorgo_zahn: 3, gorgo_kern: 1, schlacke: 6 } }, v: { cost: { schrott: 1500, voltaro_kamm: 2, voltaro_spule: 3, voltaro_fell: 3, funkenstein: 2 } } },
    kt: { k: { cost: { schrott: 1200, kroll_panzer: 4, kroll_schere: 3, kroll_auge: 2, kupferdraht: 4 } }, g: { cost: { schrott: 1200, gorgo_segment: 4, gorgo_zahn: 3, gorgo_kern: 1, schlacke: 6 } }, v: { cost: { schrott: 1500, voltaro_kamm: 1, voltaro_spule: 4, voltaro_fell: 3, funkenstein: 2 } } },
  },
  6: {
    gs: { cost: { schrott: 2500, voltaro_herz: 1, voltaro_spule: 4, voltaro_kamm: 2, funkenstein: 3 } },
    db: { cost: { schrott: 2500, voltaro_herz: 1, voltaro_spule: 3, voltaro_fell: 3, funkenstein: 3 } },
    bow: { cost: { schrott: 2500, voltaro_herz: 1, voltaro_spule: 3, voltaro_kamm: 2, funkenstein: 3 } },
    kt: { cost: { schrott: 2500, voltaro_herz: 1, voltaro_spule: 4, voltaro_fell: 2, funkenstein: 3 } },
  },
};
export const MAX_WEAPON_TIER = 6;
export const TIER5_BRANCHES = ['k', 'g', 'v'];

/** What can this weapon become next? -> [{tier, branch, name, cost, stats}] (0 entries when maxed). */
export function upgradeOptions(type, tier, branch = null) {
  if (tier >= 6) return [];
  const next = tier + 1;
  if (next === 2) return [{ tier: 2, branch: null, name: weaponStats(type, 2).name, cost: WEAPON_UPGRADES[2].cost, stats: weaponStats(type, 2) }];
  if (next === 3) {
    return ['a', 'b'].map((b) => ({ tier: 3, branch: b, name: weaponStats(type, 3, b).name, cost: WEAPON_UPGRADES[3][type][b].cost, stats: weaponStats(type, 3, b) }));
  }
  if (next === 5) return TIER5_BRANCHES.map((b) => ({ tier: 5, branch: b, name: weaponStats(type, 5, b).name, cost: WEAPON_UPGRADES[5][type][b].cost, stats: weaponStats(type, 5, b) }));
  if (next === 6) return branch === 'v' ? [{ tier: 6, branch: 'v', name: weaponStats(type, 6, 'v').name, cost: WEAPON_UPGRADES[6][type].cost, stats: weaponStats(type, 6, 'v') }] : [];
  return [{ tier: 4, branch: null, name: weaponStats(type, 4).name, cost: WEAPON_UPGRADES[4].cost, stats: weaponStats(type, 4) }];
}
