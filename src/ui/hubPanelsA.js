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
// Layout (fits 568x320 without scrolling to the button): left = tabs + selectable tree/grid (scrolls on its own),
// right = big rotatable preview + pinned info (compare current vs new, costs, "Schmieden").
const TREE = [{ tier: 1, branch: null }, { tier: 2, branch: null }, { tier: 3, branch: 'a' }, { tier: 3, branch: 'b' }, { tier: 4, branch: null },
  { tier: 5, branch: 'k' }, { tier: 5, branch: 'g' }, { tier: 5, branch: 'v' }, { tier: 6, branch: 'v' }];
const BR_LABEL = { a: ' Jaggo', b: ' Barrotz', k: ' Kroll', g: ' Gorgo', v: ' Voltaro' };
const BRANCHED = (t) => t === 3 || t >= 5; // Stufen mit Ast
const nodeKey = (n) => `${n.tier}${n.branch ?? ''}`;

export function createSchmiede(ctx) {
  let tab = 'weapons', wsel = ctx.save.loadout.weapon, psel = null, wnode = null; // wnode = tree node key being looked at
  let pv = null;

  const elemTxt = (o) => Object.entries(o.elems ?? {}).map(([k, v]) => `${k === 'fire' ? 'Feuer' : k === 'shock' ? 'Schock' : k === 'rust' ? 'Rost' : k} ${v}`).join(', ') || '–';
  const statRow = (cur, nxt) => `<div class="stats"><span>Kraft ${nxt.power} ${delta(cur.power, nxt.power)}</span><span>Krit ${Math.round(nxt.crit * 100)}% ${delta(cur.crit * 100, nxt.crit * 100)}</span><span>Element ${elemTxt(nxt)}</span>${nxt.bluntMul ? '<span>Stumpf +30%</span>' : ''}${nxt.partDmgMul ? '<span>Teilbruch +25%</span>' : ''}${nxt.poisonMul ? '<span>Gift-Aufbau +</span>' : ''}</div>`;

  /** tree node state for the selected weapon: 'cur' | 'done' | 'next' | 'far' */
  function nodeState(n, w, opts) {
    if (opts.some((o) => o.tier === n.tier && o.branch === n.branch)) return 'next';
    if (n.tier === w.tier && (!BRANCHED(n.tier) || n.branch === w.branch)) return 'cur';
    if (n.tier === 5 && w.tier === 6) return n.branch === 'v' ? 'done' : 'far';
    if (n.tier < w.tier && (!BRANCHED(n.tier) || (n.tier === 3 && w.tier > 3) || n.branch === w.branch)) return 'done';
    return 'far';
  }
  const curNode = (w) => nodeKey({ tier: w.tier, branch: BRANCHED(w.tier) ? w.branch : null });

  function weaponsView() {
    const s = ctx.save, w = s.weapons[wsel];
    const opts = weaponUpgradeOptions(s, wsel);
    if (!wnode || !TREE.some((n) => nodeKey(n) === wnode)) wnode = opts.length ? nodeKey(opts[0]) : curNode(w);
    const cur = weaponStats(wsel, w.tier, w.branch);
    const chips = `<div class="chips">${WEAPON_ORDER.map((t) => `<button class="tab${t === wsel ? ' on' : ''}" data-a="wsel" data-k="${t}">${WEAPON_TYPES[t].name}<small> ${s.weapons[t].tier}</small></button>`).join('')}</div>`;
    const tree = TREE.map((n) => {
      const st = nodeState(n, w, opts), name = weaponStats(wsel, n.tier, n.branch).name;
      const mark = st === 'cur' ? '★' : st === 'done' ? '✓' : st === 'next' ? '▶' : '·';
      return `<button class="rowbtn tn t${n.tier}${n.branch ? ' br' : ''} ${st}${wnode === nodeKey(n) ? ' sel' : ''}" data-a="wnode" data-k="${nodeKey(n)}"><span class="mk">${mark}</span><span class="nm">${esc(name)}</span><small>St.${n.tier}${n.branch ? BR_LABEL[n.branch] : ''}</small></button>`;
    }).join('');
    // right
    const node = TREE.find((n) => nodeKey(n) === wnode);
    const nst = nodeState(node, w, opts), nxt = weaponStats(wsel, node.tier, node.branch);
    const opt = opts.find((o) => o.tier === node.tier && o.branch === node.branch);
    let act;
    if (nst === 'next') act = `<div class="costs">${costChips(opt.cost, s)}</div><button class="btn small ${opt.ok ? 'go' : 'dis'}" data-a="upg" data-b="${node.branch ?? ''}">Schmieden</button>`;
    else if (nst === 'cur') act = s.loadout.weapon === wsel ? '<button class="btn small on" data-a="noop">Ausgerüstet</button>' : '<button class="btn small go" data-a="equipw">Ausrüsten</button>';
    else if (nst === 'done') act = '<div class="note">Schon überholt.</div>';
    else act = '<div class="note">Erst die Stufe davor schmieden.</div>';
    const info = `<div class="fi-h"><b>${esc(nxt.name)}</b> <small>Stufe ${nxt.tier}${nst === 'cur' ? ' · aktuell' : ''}</small></div>${statRow(cur, nxt)}${act}`;
    return { left: chips + `<div class="tree">${tree}</div>`, info };
  }

  function armorView() {
    const s = ctx.save, lo = s.loadout;
    psel ??= lo.armor.body;
    const grid = SET_ORDER.map((set) => `<div class="arow"><span class="aset">${ARMOR_SETS[set].name}<small> ${ARMOR_SETS[set].prot}</small></span>${SLOTS.map((sl) => {
      const id = pieceId(set, sl), own = s.armorOwned[id], worn = lo.armor[sl] === id;
      return `<button class="acell${own ? ' own' : ''}${worn ? ' worn' : ''}${psel === id ? ' sel' : ''}" data-a="psel" data-k="${id}">${SLOT_NAMES[sl]}${worn ? ' *' : own ? ' +' : ''}</button>`;
    }).join('')}</div>`).join('');
    const p = getPiece(psel), own = s.armorOwned[psel], worn = lo.armor[p.slot] === psel;
    const before = armorProtection(lo.armor), after = armorProtection({ ...lo.armor, [p.slot]: psel });
    const sk0 = armorSkills(lo.armor), sk1 = armorSkills({ ...lo.armor, [p.slot]: psel });
    const ids = [...new Set([...Object.keys(sk0), ...Object.keys(sk1)])];
    const skTxt = ids.length ? ids.map((id) => `<span class="${(sk0[id] ?? 0) === (sk1[id] ?? 0) ? '' : (sk1[id] ?? 0) > (sk0[id] ?? 0) ? 'sk up' : 'sk dn'}">${SKILLS[id].name} ${sk0[id] ?? 0}→${sk1[id] ?? 0}</span>`).join('') : '<span>keine Macken</span>';
    const act = own ? `<button class="btn small${worn ? ' on' : ' go'}" data-a="${worn ? 'noop' : 'wear'}">${worn ? 'Getragen' : 'Anlegen'}</button>`
      : `<div class="costs">${costChips(p.cost, s)}</div><button class="btn small${missing(s, p.cost).length ? ' dis' : ' go'}" data-a="craftp">Schmieden</button>`;
    const info = `<div class="fi-h"><b>${esc(p.name)}</b> <small>${esc(p.setName)} · ${own ? 'im Besitz' : 'neu'}</small></div>
      <div class="stats"><span>Schutz ${before} → ${after} ${delta(before, after)}</span><span>${Math.round(damageReduction(after) * 100)} % weniger Schaden</span></div>
      <div class="stats mk">${skTxt}</div>${act}`;
    return { left: grid, info };
  }

  /** what the preview shows: worn outfit, with the weapon / armor piece that is being looked at */
  function previewGear() {
    const s = ctx.save, g = makeGear(buildLoadout(s));
    if (tab === 'weapons') {
      const n = TREE.find((x) => nodeKey(x) === wnode) ?? { tier: s.weapons[wsel].tier, branch: s.weapons[wsel].branch };
      g.weapon = { type: wsel, tier: n.tier, branch: n.branch };
    } else if (psel) g.armor = { ...g.armor, [getPiece(psel).slot]: psel };
    return makeGear(g);
  }

  return {
    render() {
      const v = tab === 'weapons' ? weaponsView() : armorView();
      return `<div class="fg"><div class="fg-l"><div class="fg-tabs">${tabs(tab, [['weapons', 'Waffen'], ['armor', 'Rüstung']])}</div><div class="fg-scroll">${v.left}</div></div>
        <div class="fg-p">${previewSlot(true)}</div><div class="fg-r"><div class="fg-info">${v.info}</div></div></div>`;
    },
    after(body) {
      body.classList.add('fit');
      const slot = body.querySelector('[data-gpv]'); if (!slot) return;
      pv ??= new GearPreview({ big: true }); pv.set(previewGear()); pv.attach(slot);
    },
    dispose() { pv?.dispose(); pv = null; },
    click(a, d) {
      const s = ctx.save;
      if (a === 'noop') return false;
      if (a === 'tab') { tab = d.k; wnode = null; }
      else if (a === 'wsel') { wsel = d.k; wnode = null; }
      else if (a === 'wnode') wnode = d.k;
      else if (a === 'psel') psel = d.k;
      else if (a === 'equipw') { equipWeapon(s, wsel); ctx.commit(); ctx.toast(`${WEAPON_TYPES[wsel].name} ausgerüstet.`); }
      else if (a === 'upg') {
        const r = upgradeWeapon(s, wsel, d.b || null);
        wnode = null;
        if (r.ok) { ctx.commit(); ctx.toast(`${r.name} geschmiedet!`); } else ctx.toast(reasonText(r), true);
      } else if (a === 'craftp') {
        const r = craftArmor(s, psel);
        if (r.ok) { equipArmor(s, psel); ctx.commit(); ctx.toast(`${r.name} geschmiedet und angelegt.`); } else ctx.toast(reasonText(r), true);
      } else if (a === 'wear') { equipArmor(s, psel); ctx.commit(); ctx.toast('Angelegt.'); }
      return true;
    },
  };
}

// ============================================================ Truhe
export function createTruhe(ctx) {
  let tab = 'gear', info = null, slotSel = null, pop = null; // pop = item id whose detail card is open (gear/craft tabs; the stock tab has a permanent detail pane)
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
      ${cons.length ? cons.map((id) => `<div class="row">${iconHtml(id)}<span class="nm tap" data-a="info" data-k="${id}">${esc(ITEMS[id].name)} <small>Vorrat ${s.box[id]} · ?</small></span>
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
      return `<div class="row rc"><span class="nm tap" data-a="info" data-k="${id}">${iconHtml(id)} <b>${esc(ITEMS[id].name)}</b>${r.out > 1 ? ` ×${r.out}` : ''} <small>(${s.box[id] ?? 0})</small></span>
        <span class="costs">${costChips(r.cost, s, true)}</span><button class="btn small${ok ? ' go' : ' dis'}" data-a="craft" data-k="${id}">Herstellen</button></div>`;
    }).join('') + '<div class="note">Sprudelwasser wird nur gesammelt, nicht gebastelt.</div>';
  }

  return {
    render: () => tabs(tab, [['gear', 'Ausrüstung'], ['stock', 'Vorrat'], ['craft', 'Basteln']]) + (tab === 'gear' ? `<div class="gpv-row">${previewSlot()}<div class="gpv-main">${gear()}</div></div>` : tab === 'stock' ? stock() : craft())
      + (pop && tab !== 'stock' ? `<div class="pop" data-a="popx"><div class="pop-c" data-a="noop">${itemDetail(pop, ctx.save, '<div class="idet-a"><button class="btn small" data-a="popx">Schließen</button></div>')}</div></div>` : ''),
    after(body) { const slot = body.querySelector('[data-gpv]'); if (!slot) return; pv ??= new GearPreview(); pv.set(makeGear(buildLoadout(ctx.save))); pv.attach(slot); },
    dispose() { pv?.dispose(); pv = null; },
    click(a, d) {
      const s = ctx.save, lo = s.loadout;
      switch (a) {
        case 'tab': tab = d.k; pop = null; break;
        case 'noop': return false;
        case 'popx': pop = null; break;
        case 'equipw': equipWeapon(s, d.k); ctx.commit(); break;
        case 'slot': slotSel = d.k; break;
        case 'wear': equipArmor(s, d.k); slotSel = null; ctx.commit(); break;
        case 'info': if (tab === 'stock') info = d.k; else pop = d.k; break;
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
