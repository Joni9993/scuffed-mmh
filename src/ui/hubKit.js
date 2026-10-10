// Small DOM helpers shared by the station panels.
import { ITEMS } from '../data/items.js';
import { iconHtml } from './hubIcons.js';
import { RECIPES, RECIPE_ORDER } from '../data/recipes.js';
import { ARMOR_PIECES } from '../data/armor.js';
import { WEAPON_ORDER, WEAPON_UPGRADES, weaponStats } from '../data/weapons.js';
import { FOODS, FOOD_ORDER } from '../data/foods.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** cost = { schrott?, itemId: n } -> chips "icon have/need" (red when short) */
export function costChips(cost, save, tap = false) {
  return Object.entries(cost).map(([id, need]) => {
    const have = id === 'schrott' ? save.schrott : (save.box[id] ?? 0);
    const ok = have >= need;
    const ico = iconHtml(id === 'schrott' ? 'schrott' : id);
    const name = id === 'schrott' ? 'Schrott' : ITEMS[id]?.name ?? id;
    const tp = tap && id !== 'schrott';
    return `<span class="chip ${ok ? 'ok' : 'no'}${tp ? ' tap' : ''}" title="${esc(name)}"${tp ? ` data-a="info" data-k="${id}"` : ''}>${ico}<span class="nm">${esc(name)}</span> ${have}/${need}</span>`;
  }).join('');
}

/** "+20" / "-5" / "=" with colour class */
export function delta(a, b, unit = '') {
  const d = Math.round((b - a) * 100) / 100;
  if (!d) return `<span class="dl eq">=</span>`;
  return `<span class="dl ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}${unit}</span>`;
}

export function el(tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export const REASONS = {
  mats: 'Dir fehlt Material.', schrott: 'Zu wenig Schrott.', full: 'Die Truhe ist voll (99).', owned: 'Hast du schon.', maxed: 'Mehr geht nicht.',
  branch: 'Wähle einen Ast.', has_meal: 'Du hast schon gegessen.', bar_full: 'Item-Leiste voll (8).', locked: 'Noch gesperrt.', not_owned: 'Gehört dir nicht.',
  none: 'Nichts da.', unknown: 'Unbekannt.',
};
export const reasonText = (r) => REASONS[r.reason] ?? 'Geht nicht.';

/** Where is an item used? -> [{ label, names: [..] }] (recipes, weapon upgrades, armor, meals). Cached. */
let usesIdx = null;
function buildUses() {
  const u = {}, add = (id, label, name) => { const m = (u[id] ??= {}); (m[label] ??= new Set()).add(name); };
  for (const rid of RECIPE_ORDER) for (const id of Object.keys(RECIPES[rid].cost)) add(id, 'Basteln', ITEMS[rid]?.name ?? rid);
  const wl = (type, tier, branch) => weaponStats(type, tier, branch).name;
  for (const type of WEAPON_ORDER) {
    for (const id of Object.keys(WEAPON_UPGRADES[2].cost)) if (id !== 'schrott') add(id, 'Waffen', wl(type, 2));
    for (const b of ['a', 'b']) for (const id of Object.keys(WEAPON_UPGRADES[3][type][b].cost)) if (id !== 'schrott') add(id, 'Waffen', wl(type, 3, b));
    for (const id of Object.keys(WEAPON_UPGRADES[4].cost)) if (id !== 'schrott') add(id, 'Waffen', wl(type, 4));
  }
  for (const p of Object.values(ARMOR_PIECES)) for (const id of Object.keys(p.cost ?? {})) if (id !== 'schrott') add(id, 'Rüstung', p.setName);
  for (const fid of FOOD_ORDER) for (const id of Object.keys(FOODS[fid].cost)) if (id !== 'schrott') add(id, 'Kochtopf', FOODS[fid].name);
  return u;
}
export function itemUses(id) {
  usesIdx ??= buildUses();
  return Object.entries(usesIdx[id] ?? {}).map(([label, set]) => ({ label, names: [...set] }));
}

/** Item detail card (name, kind, description/effect, owned, sell value, carry max). `actions` = extra html (buy/sell buttons). */
export function itemDetail(id, save, actions = '') {
  const it = ITEMS[id];
  if (!it) return '<div class="note">Tippe einen Gegenstand an.</div>';
  const kind = it.kind === 'material' ? 'Material' : it.kind === 'ammo' ? 'Munition' : 'Verbrauchbar';
  const own = save.box[id] ?? 0;
  const facts = [`<span>Im Besitz <b>×${own}</b></span>`, `<span>Wert ${iconHtml('schrott')}${Math.floor(it.baseValue * 0.4)} <small>(Verkauf)</small></span>`];
  if (it.kind !== 'material') facts.push(`<span>Max. dabei <b>${it.max}</b></span>`);
  if (it.time) facts.push(`<span>Dauer ${it.time} s</span>`);
  const uses = itemUses(id);
  const rec = RECIPES[id];
  const recHtml = rec ? `<div class="idet-u"><b>Herstellung:</b> <span>${Object.entries(rec.cost).map(([k, n]) => `${n}× ${esc(ITEMS[k]?.name ?? k)}`).join(' + ')}${rec.out > 1 ? ` (ergibt ${rec.out})` : ''}</span></div>` : '';
  const usesHtml = recHtml + (uses.length ? `<div class="idet-u"><b>Wofür?</b> ${uses.map((x) => `<span>${x.label}: ${x.names.map(esc).join(', ')}</span>`).join('')}</div>`
    : it.kind === 'material' ? '<div class="idet-u"><b>Wofür?</b> <span>Nur zum Verkaufen.</span></div>' : '');
  return `<div class="idet"><div class="idet-h">${iconHtml(id)}<b>${esc(it.name)}</b><small>${kind}</small></div>
    <div class="idet-d">${esc(it.desc)}</div><div class="idet-f">${facts.join('')}</div>${usesHtml}${actions}</div>`;
}
