// Item bonuses are separate from equipment, so changing gear cannot stack or erase them.
export function itemDamageMul(player, hit) {
  const buffs = player.itemBuffs;
  const shell = buffs?.shell?.t > 0 ? 1 - buffs.shell.reduction : 1;
  const frost = hit.element === 'fire' && buffs?.frost?.t > 0 ? 1 - buffs.frost.reduction : 1;
  return shell * frost;
}

export function itemPartMul(player) {
  return player.itemBuffs?.breaker?.t > 0 ? player.itemBuffs.breaker.partMul : 1;
}

export function inRuneAnchor(player, hunt = player.ctx) {
  if (player.alive === false) return false;
  return (hunt?.runeZones ?? []).some((z) => z.active &&
    Math.abs(player.pos.y - z.y) <= 2.5 && Math.hypot(player.pos.x - z.x, player.pos.z - z.z) <= z.r);
}

export function itemBuffText(player) {
  const names = { shell: 'Muschelpanzer', frost: 'Frostschutz', breaker: 'Splitterharz' };
  return Object.entries(player.itemBuffs ?? {}).filter(([, b]) => b.t > 0)
    .map(([k, b]) => `${names[k] ?? k} ${Math.ceil(b.t)}s`)
    .concat(inRuneAnchor(player) ? ['Runenanker'] : []).join(' · ');
}

export function isSurveyed(monster, hunt) {
  return !monster.minor && (hunt.surveyZones ?? []).some((z) => z.active &&
    Math.hypot(monster.pos.x - z.x, monster.pos.z - z.z) <= z.r);
}
