// Station panels A: Schmiede, Truhe, Krämerladen.  Each: create(ctx) -> { render() -> html, click(act, dataset) }
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats } from '../data/weapons.js';
import { ARMOR_SETS, SET_ORDER, SLOTS, SLOT_NAMES, SKILLS, pieceId, getPiece } from '../data/armor.js';
import { ITEMS, ITEM_IDS } from '../data/items.js';
import { RECIPES, RECIPE_ORDER } from '../data/recipes.js';
import { missing } from '../meta/inventory.js';
import { upgradeWeapon, weaponUpgradeOptions, craftArmor, equipArmor, equipWeapon, craftItem, setBarItem, barMoveFront } from '../meta/crafting.js';
import { armorProtection, armorSkills, damageReduction, skillEffects, buildLoadout } from '../meta/loadout.js';
import { GearPreview, previewSlot } from './gearPreview.js'; // [G]
import { makeGear } from '../data/gearlook.js'; // [G]
import { SHOP_STOCK, buy, sell, sellPrice } from '../meta/shop.js';
import { esc, costChips, delta, reasonText, itemDetail } from './hubKit.js';
import { iconHtml } from './hubIcons.js';

const tabs = (cur, list) => `<div class="tabs">${list.map(([k, n]) => `<button class="tab${k === cur ? ' on' : ''}" data-a="tab" data-k="${k}">${n}</button>`).join('')}</div>`;

// ============================================================ Schmiede
export function createSchmiede(ctx) {
  let tab = 'weapons', wsel = ctx.save.loadout.weapon, psel = null, wopt = null; // [G] wopt = upgrade option shown in the preview
  let pv = null;

  const statRow = (cur, nxt) => {
    const el = (o) => Object.entries(o.elems ?? {}).map(([k, v]) => `${k === 'fire' ? 'Feuer' : k === 'shock' ? 'Schock' : k} ${v}`).join(', ') || '–';
    return `<div class="stats"><span>Kraft ${nxt.power} ${delta(cur.power, nxt.power)}</span><span>Krit ${Math.round(nxt.crit * 100)}% ${delta(cur.crit * 100, nxt.crit * 100)}</span><span>Element ${el(nxt)}</span>${nxt.bluntMul ? '<span>Stumpf +30%</span>' : ''}${nxt.poisonMul ? '<span>Gift-Aufbau +</span>' : ''}</div>`;
  };

  function weapons() {
    const s = ctx.save;
    const w = s.weapons[wsel];
    const cur = weaponStats(wsel, w.tier, w.branch);
    const opts = weaponUpgradeOptions(s, wsel);
    return `<div class="chips">${WEAPON_ORDER.map((t) => `<button class="tab${t === wsel ? ' on' : ''}" data-a="wsel" data-k="${t}">${WEAPON_TYPES[t].name}<small> St.${s.weapons[t].tier}</small></button>`).join('')}</div>
      <div class="card"><b>${esc(cur.name)}</b> <small>Stufe ${cur.tier}${cur.branch && cur.tier >= 3 ? ` / Ast ${cur.branch === 'a' ? 'Jaggo' : 'Barrotz'}` : ''}</small>
        ${statRow(cur, cur)}
        <button class="btn small${s.loadout.weapon === wsel ? ' on' : ''}" data-a="equipw">${s.loadout.weapon === wsel ? 'Ausgerüstet' : 'Ausrüsten'}</button></div>
      ${opts.length ? `<div class="sub">${opts.length > 1 ? 'Wähle einen Ast (Stufe 4 geht aus beiden):' : 'Nächste Stufe:'} <small>(antippen = Vorschau)</small></div>` : '<div class="sub">Höchste Stufe erreicht. Mehr Waffe gibt es nicht.</div>'}
      ${opts.map((o) => `<div class="card up${wopt && wopt.tier === o.tier && wopt.branch === o.branch ? ' sel' : ''}" data-a="wprev" data-t="${o.tier}" data-b="${o.branch ?? ''}"><b>${esc(o.name)}</b> <small>Stufe ${o.tier}</small>${statRow(cur, o.stats)}
        <div class="costs">${costChips(o.cost, s)}</div>
        <button class="btn small${o.ok ? ' go' : ' dis'}" data-a="upg" data-b="${o.branch ?? ''}">Schmieden</button></div>`).join('')}`;
  }

  function armor() {
    const s = ctx.save;
    const grid = SET_ORDER.map((set) => `<div class="arow"><span class="aset">${ARMOR_SETS[set].name}<small> ${ARMOR_SETS[set].prot}</small></span>${SLOTS.map((sl) => {
      const id = pieceId(set, sl), own = s.armorOwned[id], worn = s.loadout.armor[sl] === id;
      return `<button class="acell${own ? ' own' : ''}${worn ? ' worn' : ''}${psel === id ? ' sel' : ''}" data-a="psel" data-k="${id}">${SLOT_NAMES[sl]}${worn ? ' *' : own ? ' +' : ''}</button>`;
    }).join('')}</div>`).join('');
    let detail = '<div class="sub">Tippe ein Teil an.</div>';
    if (psel) {
      const p = getPiece(psel), own = s.armorOwned[psel], worn = s.loadout.armor[p.slot] === psel;
      const sk = Object.entries(p.skills).map(([id, l]) => `${SKILLS[id].name} +${l}`).join(', ') || 'keine Macken';
      detail = `<div class="card"><b>${esc(p.name)}</b> <small>${esc(p.setName)} · Schutz ${p.prot} · ${esc(sk)}</small>
        ${own ? `<div class="sub">Im Besitz.</div><button class="btn small${worn ? ' on' : ' go'}" data-a="wear">${worn ? 'Getragen' : 'Anlegen'}</button>`
          : `<div class="costs">${costChips(p.cost, s)}</div><button class="btn small${missing(s, p.cost).length ? ' dis' : ' go'}" data-a="craftp">Schmieden</button>`}</div>`;
    }
    const prot = armorProtection(s.loadout.armor);
    return `<div class="sub">Schutz gesamt ${prot} (${Math.round(damageReduction(prot) * 100)} % weniger Schaden)</div>${grid}${detail}`;
  }

  /** [G] what the preview shows: worn outfit, with the weapon / armor piece that is being looked at */
  function previewGear() {
    const s = ctx.save, g = makeGear(buildLoadout(s));
    if (tab === 'weapons') {
      const w = s.weapons[wsel];
      g.weapon = wopt ? { type: wsel, tier: wopt.tier, branch: wopt.branch } : { type: wsel, tier: w.tier, branch: w.branch };
    } else if (psel) g.armor = { ...g.armor, [getPiece(psel).slot]: psel };
    return makeGear(g);
  }

  return {
    render: () => `<div class="gpv-row">${previewSlot()}<div class="gpv-main">${tabs(tab, [['weapons', 'Waffen'], ['armor', 'Rüstung']])}${tab === 'weapons' ? weapons() : armor()}</div></div>`,
    after(body) { const slot = body.querySelector('[data-gpv]'); if (!slot) return; pv ??= new GearPreview(); pv.set(previewGear()); pv.attach(slot); },
    dispose() { pv?.dispose(); pv = null; },
    click(a, d) {
      const s = ctx.save;
      if (a === 'tab') { tab = d.k; wopt = null; }
      else if (a === 'wsel') { wsel = d.k; wopt = null; }
      else if (a === 'wprev') wopt = wopt && wopt.tier === Number(d.t) && wopt.branch === (d.b || null) ? null : { tier: Number(d.t), branch: d.b || null };
      else if (a === 'psel') psel = d.k;
      else if (a === 'equipw') { equipWeapon(s, wsel); ctx.commit(); ctx.toast(`${WEAPON_TYPES[wsel].name} ausgerüstet.`); }
      else if (a === 'upg') {
        wopt = null;
        const r = upgradeWeapon(s, wsel, d.b || null);
        if (r.ok) { ctx.commit(); ctx.toast(`${r.name} geschmiedet!`); } else ctx.toast(reasonText(r), true);
      } else if (a === 'craftp') {
        const r = craftArmor(s, psel);
        if (r.ok) { equipArmor(s, psel); ctx.commit(); ctx.toast(`${r.name} geschmiedet und angelegt.`); } else ctx.toast(reasonText(r), true);
      } else if (a === 'wear') { equipArmor(s, psel); ctx.commit(); ctx.toast('Angelegt.'); }
    },
  };
}

// ============================================================ Truhe
export function createTruhe(ctx) {
  let tab = 'gear', info = null, slotSel = null;
  let pv = null; // [G] rotating preview of what you wear (updates live when you change gear)

  function gear() {
    const s = ctx.save, lo = s.loadout;
    const w = s.weapons[lo.weapon];
    const prot = armorProtection(lo.armor), sk = armorSkills(lo.armor), fx = skillEffects(sk);
    const skillTxt = Object.entries(sk).map(([id, l]) => `${SKILLS[id].name} ${l} (${SKILLS[id].desc(l)})`).join(' · ') || 'keine Macken';
    const weap = WEAPON_ORDER.map((t) => `<button class="tab${t === lo.weapon ? ' on' : ''}" data-a="equipw" data-k="${t}">${esc(weaponStats(t, s.weapons[t].tier, s.weapons[t].branch).name)}</button>`).join('');
    const slots = SLOTS.map((sl) => {
      const cur = lo.armor[sl];
      const owned = Object.keys(s.armorOwned).filter((id) => getPiece(id)?.slot === sl);
      return `<div class="arow"><span class="aset">${SLOT_NAMES[sl]}</span>${slotSel === sl ? owned.map((id) => `<button class="acell own${id === cur ? ' worn' : ''}" data-a="wear" data-k="${id}">${esc(getPiece(id).name)}</button>`).join('')
        : `<button class="acell own worn" data-a="slot" data-k="${sl}">${esc(getPiece(cur).name)} ▾</button>`}</div>`;
    }).join('');
    const cons = ITEM_IDS.filter((id) => ITEMS[id].kind !== 'material' && (s.box[id] ?? 0) > 0);
    const barN = (id) => lo.items.find((e) => e.id === id)?.n ?? 0;
    const bar = Array.from({ length: 8 }, (_, i) => {
      const e = lo.items[i];
      return e ? `<button class="slot full" data-a="front" data-i="${i}" title="${esc(ITEMS[e.id].name)}">${iconHtml(e.id)}<b>${e.n}</b></button>` : '<span class="slot"></span>';
    }).join('');
    return `<div class="sub">Waffe</div><div class="chips">${weap}</div>
      <div class="sub">Rüstung · Schutz ${prot} (${Math.round(damageReduction(prot) * 100)} %)</div>${slots}<div class="note">${esc(skillTxt)}${fx.flinchImmune ? ' · kein Zucken' : ''}</div>
      <div class="sub">Item-Leiste (max. 8 · Tippen = nach vorn)</div><div class="bar8">${bar}</div>
      ${cons.length ? cons.map((id) => `<div class="row">${iconHtml(id)}<span class="nm">${esc(ITEMS[id].name)} <small>Vorrat ${s.box[id]}</small></span>
        <button class="sm" data-a="bar-" data-k="${id}">-</button><b class="num">${barN(id)}</b><button class="sm" data-a="bar+" data-k="${id}">+</button><button class="sm" data-a="barmax" data-k="${id}">max</button></div>`).join('')
        : '<div class="note">Keine Verbrauchsgegenstände in der Truhe. Unter „Basteln“ gibt es welche. Pro Jagd gibt es 2 Flickbrausen gratis.</div>'}
      <div class="note">Gewählte Waffe: Stufe ${w.tier}</div>`;
  }

  function stock() {
    const s = ctx.save;
    const ids = ITEM_IDS.filter((id) => (s.box[id] ?? 0) > 0);
    if (!ids.length) return '<div class="note">Die Truhe ist leer. Geh jagen, sammeln, zerlegen.</div>';
    if (!ids.includes(info)) info = ids[0];
    return `<div class="split"><div class="list"><div class="grid">${ids.map((id) => `<button class="cell${info === id ? ' sel' : ''}" data-a="info" data-k="${id}">${iconHtml(id)}<span>${esc(ITEMS[id].name)}</span><b>${s.box[id]}</b></button>`).join('')}</div></div>
      <div class="detail">${itemDetail(info, s)}</div></div>`;
  }

  function craft() {
    const s = ctx.save;
    return RECIPE_ORDER.map((id) => {
      const r = RECIPES[id], ok = !missing(s, r.cost).length;
      return `<div class="row rc"><span class="nm">${iconHtml(id)} <b>${esc(ITEMS[id].name)}</b>${r.out > 1 ? ` ×${r.out}` : ''} <small>(${s.box[id] ?? 0})</small></span>
        <span class="costs">${costChips(r.cost, s)}</span><button class="btn small${ok ? ' go' : ' dis'}" data-a="craft" data-k="${id}">Herstellen</button></div>`;
    }).join('') + '<div class="note">Sprudelwasser wird nur gesammelt, nicht gebastelt.</div>';
  }

  return {
    render: () => tabs(tab, [['gear', 'Ausrüstung'], ['stock', 'Vorrat'], ['craft', 'Basteln']]) + (tab === 'gear' ? `<div class="gpv-row">${previewSlot()}<div class="gpv-main">${gear()}</div></div>` : tab === 'stock' ? stock() : craft()),
    after(body) { const slot = body.querySelector('[data-gpv]'); if (!slot) return; pv ??= new GearPreview(); pv.set(makeGear(buildLoadout(ctx.save))); pv.attach(slot); },
    dispose() { pv?.dispose(); pv = null; },
    click(a, d) {
      const s = ctx.save, lo = s.loadout;
      switch (a) {
        case 'tab': tab = d.k; break;
        case 'equipw': equipWeapon(s, d.k); ctx.commit(); break;
        case 'slot': slotSel = d.k; break;
        case 'wear': equipArmor(s, d.k); slotSel = null; ctx.commit(); break;
        case 'info': info = d.k; break;
        case 'front': barMoveFront(s, Number(d.i)); ctx.commit(); break;
        case 'bar+': case 'bar-': case 'barmax': {
          const cur = lo.items.find((e) => e.id === d.k)?.n ?? 0;
          const r = setBarItem(s, d.k, a === 'bar+' ? cur + 1 : a === 'bar-' ? cur - 1 : 99);
          if (!r.ok) ctx.toast(reasonText(r), true);
          ctx.commit();
          break;
        }
        case 'craft': {
          const r = craftItem(s, d.k);
          if (r.ok) {
            const def = ITEMS[d.k];
            if (def.kind !== 'material') { const cur = lo.items.find((e) => e.id === d.k)?.n ?? 0; setBarItem(s, d.k, cur + r.n); } // convenience: straight into the bar
            ctx.commit(); ctx.toast(`${def.name} ×${r.n} hergestellt.`);
          } else ctx.toast(reasonText(r), true);
          break;
        }
        default: break;
      }
    },
  };
}

// ============================================================ Krämerladen
export function createLaden(ctx) {
  let tab = 'buy', selBuy = 0, selSell = null;
  const sellIds = () => ITEM_IDS.filter((id) => (ctx.save.box[id] ?? 0) > 0 && sellPrice(id) > 0);
  const buyTab = () => {
    const s = ctx.save;
    const list = SHOP_STOCK.map((e, i) => {
      const lock = s.jr < e.jr;
      return `<button class="rowbtn${i === selBuy ? ' sel' : ''}${lock ? ' lock' : ''}" data-a="pick" data-k="${i}">${iconHtml(e.id)}<span class="nm">${esc(ITEMS[e.id].name)}${e.n > 1 ? ` ×${e.n}` : ''} <small>(${s.box[e.id] ?? 0})</small></span>
        ${lock ? `<small>JR ${e.jr}</small>` : `<span class="chip ${s.schrott >= e.price ? 'ok' : 'no'}">${iconHtml('schrott')}${e.price}</span>`}</button>`;
    }).join('');
    const e = SHOP_STOCK[selBuy];
    const lock = s.jr < e.jr, can = !lock && s.schrott >= e.price;
    const act = `<div class="idet-a"><span class="chip ${can || lock ? 'ok' : 'no'}">${iconHtml('schrott')}${e.price}${e.n > 1 ? ` für ${e.n}` : ''}</span>
      ${lock ? `<small>Ab Jägerrang ${e.jr}</small>` : `<button class="btn small${can ? ' go' : ' dis'}" data-a="buy" data-k="${selBuy}">Kaufen</button>`}</div>`;
    return { list, detail: itemDetail(e.id, s, act) };
  };
  const sellTab = () => {
    const s = ctx.save, ids = sellIds();
    if (!ids.length) return { list: '<div class="note">Du hast nichts zu verkaufen. Kiesel guckt enttäuscht.</div>', detail: '' };
    if (!ids.includes(selSell)) selSell = ids[0];
    const list = ids.map((id) => `<button class="rowbtn${id === selSell ? ' sel' : ''}" data-a="pick" data-k="${id}">${iconHtml(id)}<span class="nm">${esc(ITEMS[id].name)} <small>×${s.box[id]}</small></span><span class="chip ok">${iconHtml('schrott')}${sellPrice(id)}</span></button>`).join('');
    const act = `<div class="idet-a"><span class="chip ok">${iconHtml('schrott')}${sellPrice(selSell)} pro Stück</span>
      <button class="btn small go" data-a="sell1" data-k="${selSell}">1 verkaufen</button><button class="btn small" data-a="sellall" data-k="${selSell}">Alle (${s.box[selSell]})</button></div>`;
    return { list, detail: itemDetail(selSell, s, act) };
  };
  return {
    render() {
      const t = tab === 'buy' ? buyTab() : sellTab();
      return `<div class="split"><div class="list"><div class="note">Kiesel: „Ich kaufe alles. Für 40 %. Das ist Fairness, nur anders.“</div>${tabs(tab, [['buy', 'Kaufen'], ['sell', 'Verkaufen']])}${t.list}</div>
        <div class="detail">${t.detail}</div></div>`;
    },
    click(a, d) {
      const s = ctx.save;
      if (a === 'tab') tab = d.k;
      else if (a === 'pick') { if (tab === 'buy') selBuy = Number(d.k); else selSell = d.k; }
      else if (a === 'buy') { const r = buy(s, Number(d.k)); if (r.ok) { ctx.commit(); ctx.toast(`${ITEMS[r.id].name} ×${r.n} gekauft.`); } else ctx.toast(reasonText(r), true); }
      else if (a === 'sell1' || a === 'sellall') { const r = sell(s, d.k, a === 'sell1' ? 1 : 99); if (r.ok) { ctx.commit(); ctx.toast(`+${r.gain} Schrott.`); } else ctx.toast(reasonText(r), true); }
    },
  };
}
