// Pure weapon stat data (GDD 8.1). tier = 1..4 (branch picks for tier 3 are added by the meta agent).
export const WEAPON_TYPES = {
  gs: { name: 'Plattmacher', tiers: [
    { name: 'Rostplatte', power: 80, crit: 0.05, elems: {} },
    { name: 'Knochenplatte', power: 100, crit: 0.05, elems: {} },
    { name: 'Jaggo-Hackbeil', power: 120, crit: 0.05, elems: {} },
    { name: 'Brathalos-Glutplatte', power: 140, crit: 0.05, elems: { fire: 25 } },
  ] },
  db: { name: 'Zwillingsklingen', tiers: [
    { name: 'Rostklingen', power: 70, crit: 0.05, elems: {} },
    { name: 'Knochenkrallen', power: 88, crit: 0.05, elems: {} },
    { name: 'Jaggo-Zähne', power: 105, crit: 0.15, elems: {} },
    { name: 'Brathalos-Glühkrallen', power: 122, crit: 0.05, elems: { fire: 20 } },
  ] },
  bow: { name: 'Spannbogen', tiers: [
    { name: 'Ast-Bogen', power: 72, crit: 0.05, elems: {} },
    { name: 'Knochensehne', power: 90, crit: 0.05, elems: {} },
    { name: 'Jaggo-Kammbogen', power: 108, crit: 0.15, elems: {} },
    { name: 'Brathalos-Schwingbogen', power: 130, crit: 0.05, elems: {} },
  ] },
};
export function weaponStats(type, tier = 1) {
  const t = WEAPON_TYPES[type];
  return { type, typeName: t.name, ...t.tiers[Math.min(tier, t.tiers.length) - 1] };
}
