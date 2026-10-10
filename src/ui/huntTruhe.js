// Camp chest panel (in a hunt). ctx.adapter = HuntChest (src/meta/huntChest.js). Changes only the hunt inventory / gear;
// the save is written at hunt end. Reuses the Truhe panel look (rows, chips, arow/acell).
import { ITEMS, ITEM_IDS, isCarryable, itemName } from '../data/items.js';
import { RECIPES, RECIPE_ORDER } from '../data/recipes.js';
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats } from '../data/weapons.js';
import { SLOTS, SLOT_NAMES, SKILLS, getPiece } from '../data/armor.js';
import { armorProtection, armorSkills, damageReduction } from '../meta/loadout.js';
import { esc } from './hubKit.js';
import { iconHtml } from './hubIcons.js';

const tabs = (cur, list) => `<div class="tabs">${list.map(([k, n]) => `<button class="tab${k === cur ? ' on' : ''}" data-a="tab" data-k="${k}">${n}</button>`).join('')}</div>`;
const REASON = {
  none: 'Nichts mehr in der Truhe.', carry_full: 'Du trägst schon das Maximum.', bar_full: 'Item-Leiste voll (8).', unknown: 'Geht nicht.',
  not_carried: 'Das trägst du nicht aus der Truhe.', mats: 'Dir fehlt Material.', full: 'Die Truhe ist voll (99).', combat: 'Nicht im Kampf! Waffe wechseln geht nur im Ruhezustand.', not_owned: 'Gehört dir nicht.',
};

export function createHuntTruhe(ctx) {
  const ch = ctx.adapter;
  let tab = 'take', slotSel = null;

  const cost = (cst) => Object.entries(cst).map(([id, need]) => {
    const have = ch.stock(id), ok = have >= need;
    return `<span class="chip ${ok ? 'ok' : 'no'}" title="${esc(itemName(id))}">${iconHtml(id)}<span class="nm">${esc(itemName(id))}</span> ${have}/${need}</span>`;
  }).join('');

  function take() {
    const ids = ITEM_IDS.filter((id) => isCarryable(id) && (ch.stock(id) > 0 || (ch.inv.brought[id] ?? 0) > 0));
    const rows = ids.map((id) => {
      const it = ITEMS[id], n = ch.carried(id);
      return `<div class="row"><span class="nm">${iconHtml(id)} ${esc(it.name)} <small>Truhe ${ch.stock(id)} · dabei ${n}/${it.max}</small></span>
        <button class="sm" data-a="back" data-k="${id}">-</button><b class="num">${n}</b><button class="sm" data-a="take" data-k="${id}">+</button><button class="sm" data-a="takemax" data-k="${id}">max</button></div>`;
    }).join('');
    return `<div class="sub">Mitnehmen (max. pro Item wie sonst, Leiste max. 8)</div>${rows || '<div class="note">Keine Verbrauchsgegenstände in der Truhe. Unter „Basteln“ gibt es welche.</div>'}
      <div class="note">Was du hier mitnimmst, wird nach der Jagd wie üblich abgezogen, wenn du es verbrauchst. Zurücklegen geht nur mit Truheninhalt.</div>`;
  }

  function craft() {
    return RECIPE_ORDER.map((id) => {
      const r = RECIPES[id], ok = ch.canCraft(id).ok;
      return `<div class="row rc"><span class="nm">${iconHtml(id)} <b>${esc(ITEMS[id].name)}</b>${r.out > 1 ? ` ×${r.out}` : ''} <small>(Truhe ${ch.stock(id)})</small></span>
        <span class="costs">${cost(r.cost)}</span><button class="btn small${ok ? ' go' : ' dis'}" data-a="craft" data-k="${id}">Herstellen</button></div>`;
    }).join('') + '<div class="note">Hergestelltes liegt in der Truhe. Mit „Mitnehmen“ packst du es ein. Material aus dieser Jagd kommt erst danach in die Truhe.</div>';
  }

  function gear() {
    const lo = ch.loadout(), combat = ch.hooks.inCombat?.();
    const prot = armorProtection(lo.armor), sk = armorSkills(lo.armor);
    const skillTxt = Object.entries(sk).map(([id, l]) => `${SKILLS[id].name} ${l}`).join(' · ') || 'keine Macken';
    const weap = WEAPON_ORDER.filter((t) => ch.weaponState(t)).map((t) => {
      const st = weaponStats(t, ch.weaponState(t).tier, ch.weaponState(t).branch);
      return `<button class="tab${t === lo.weapon.type ? ' on' : ''}${combat && t !== lo.weapon.type ? ' dis' : ''}" data-a="wpn" data-k="${t}">${esc(st.name)}</button>`;
    }).join('');
    const slots = SLOTS.map((sl) => {
      const cur = lo.armor[sl], owned = ch.ownedArmor(sl);
      return `<div class="arow"><span class="aset">${SLOT_NAMES[sl]}</span>${slotSel === sl
        ? owned.map((id) => `<button class="acell own${id === cur ? ' worn' : ''}" data-a="wear" data-k="${id}">${esc(getPiece(id).name)}</button>`).join('')
        : `<button class="acell own worn" data-a="slot" data-k="${sl}">${esc(getPiece(cur).name)} ▾</button>`}</div>`;
    }).join('');
    return `<div class="sub">Waffe ${combat ? '<small>(gesperrt: im Kampf)</small>' : ''}</div><div class="chips">${weap}</div>
      <div class="sub">Rüstung · Schutz ${prot} (${Math.round(damageReduction(prot) * 100)} %)</div>${slots}<div class="note">${esc(skillTxt)}</div>
      <div class="note">Gilt sofort. Nach der Jagd bleibt es so ausgerüstet.</div>`;
  }

  const msg = (r, okText) => (r.ok ? ctx.toast(okText) : ctx.toast(REASON[r.reason] ?? 'Geht nicht.', true));

  return {
    render: () => tabs(tab, [['take', 'Mitnehmen'], ['craft', 'Basteln'], ['gear', 'Ausrüstung']]) + (tab === 'take' ? take() : tab === 'craft' ? craft() : gear()),
    click(a, d) {
      switch (a) {
        case 'tab': tab = d.k; slotSel = null; break;
        case 'take': msg(ch.take(d.k, 1), `${itemName(d.k)} eingepackt.`); break;
        case 'takemax': msg(ch.takeMax(d.k), `${itemName(d.k)} eingepackt.`); break;
        case 'back': msg(ch.putBack(d.k, 1), `${itemName(d.k)} zurückgelegt.`); break;
        case 'craft': { const r = ch.craft(d.k); msg(r, `${itemName(d.k)} ×${r.n} hergestellt.`); break; }
        case 'wpn': { const r = ch.setWeapon(d.k); if (!r.same) msg(r, `${WEAPON_TYPES[d.k].name} in der Hand.`); break; }
        case 'slot': slotSel = d.k; break;
        case 'wear': { const r = ch.setArmor(d.k); slotSel = null; if (!r.same) msg(r, 'Angelegt.'); break; }
        default: break;
      }
    },
  };
}
