// Small DOM helpers shared by the station panels.
import { ITEMS } from '../data/items.js';
import { iconHtml } from './hubIcons.js';

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** cost = { schrott?, itemId: n } -> chips "icon have/need" (red when short) */
export function costChips(cost, save) {
  return Object.entries(cost).map(([id, need]) => {
    const have = id === 'schrott' ? save.schrott : (save.box[id] ?? 0);
    const ok = have >= need;
    const ico = iconHtml(id === 'schrott' ? 'schrott' : id);
    const name = id === 'schrott' ? 'Schrott' : ITEMS[id]?.name ?? id;
    return `<span class="chip ${ok ? 'ok' : 'no'}" title="${esc(name)}">${ico}<span class="nm">${esc(name)}</span> ${have}/${need}</span>`;
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
