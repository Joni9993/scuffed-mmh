// Station panels A: Schmiede, Truhe, Krämerladen.  Each: create(ctx) -> { render() -> html, click(act, dataset) }
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats } from '../data/weapons.js';
import { ARMOR_SETS, SET_ORDER, SLOTS, SLOT_NAMES, SKILLS, pieceId, getPiece } from '../data/armor.js';
import { ITEMS, ITEM_IDS } from '../data/items.js';
import { RECIPES, RECIPE_ORDER } from '../data/recipes.js';
import { missing } from '../meta/inventory.js';
import { upgradeWeapon, weaponUpgradeOptions, craftArmor, equipArmor, equipWeapon, craftItem, setBarItem, barMoveFront, ownedWeaponList, buildNewWeapon, swapWeapon, scrapWeapon, scrapValue, canCraftArmor, canUpgradeWeapon, NEW_WEAPON_COST, equipWeaponState } from '../meta/crafting.js';
import { armorProtection, armorSkills, damageReduction, skillEffects, buildLoadout } from '../meta/loadout.js';
import { GearPreview, previewSlot } from './gearPreview.js'; // [G]
import { makeGear } from '../data/gearlook.js'; // [G]
import { SHOP_STOCK, buy, sell, sellPrice } from '../meta/shop.js';
import { esc, costChips, delta, reasonText, itemDetail, weaponTag, pieceSkillsHtml } from './hubKit.js';
import { iconHtml } from './hubIcons.js';

const tabs = (cur, list, glow = {}) => `<div class="tabs">${list.map(([k, n]) => `<button class="tab${k === cur ? ' on' : ''}${glow[k] ? ' glow' : ''}" data-a="tab" data-k="${k}">${n}</button>`).join('')}</div>`;

// ============================================================ Schmiede
// Layout (fits 568x320 without scrolling to the button): left = tabs + selectable tree/grid (scrolls on its own),
// right = big rotatable preview + pinned info (compare current vs new, costs, "Schmieden").
const TREE = [{ tier: 1, branch: null }, { tier: 2, branch: null }, { tier: 3, branch: 'a' }, { tier: 3, branch: 'b' }, { tier: 4, branch: null },
  { tier: 5, branch: 'k' }, { tier: 5, branch: 'g' }, { tier: 5, branch: 'v' }, { tier: 6, branch: 'v' }, { tier: 6, branch: 'x' }, { tier: 7, branch: null }];
const BR_LABEL = { a: ' Jaggo', b: ' Barrotz', k: ' Kroll', g: ' Gorgo', v: ' Voltaro', x: ' Krachfaust' };
const BRANCHED = (t) => t === 3 || t === 5 || t === 6; // Stufe7 führt beide finalen Äste zusammen.
const nodeKey = (n) => `${n.tier}${n.branch ?? ''}`;

export function createSchmiede(ctx) {
  let tab = 'weapons', wsel = ctx.save.loadout.weapon, psel = null, wnode = null; // wnode = tree node key being looked at
  let pv = null, keepScroll = 0, host = null, typeOpen = false, scrollSel = true; // keepScroll: Scrollposition der linken Liste über Re-Render; scrollSel: gewählten Knoten ins Bild holen

  const elemTxt = (o) => Object.entries(o.elems ?? {}).map(([k, v]) => `${k === 'fire' ? 'Feuer' : k === 'shock' ? 'Schock' : k === 'rust' ? 'Rost' : k === 'blast' ? 'Sprengung' : k} ${v}`).join(', ') || '–';
  const statRow = (cur, nxt) => `<div class="stats"><span>Kraft ${nxt.power} ${delta(cur.power, nxt.power)}</span><span>Krit ${Math.round(nxt.crit * 100)}% ${delta(cur.crit * 100, nxt.crit * 100)}</span><span>Element ${elemTxt(nxt)}</span>${nxt.bluntMul ? '<span>Stumpf +30%</span>' : ''}${nxt.partDmgMul ? '<span>Teilbruch +25%</span>' : ''}${nxt.poisonMul ? '<span>Gift-Aufbau +</span>' : ''}${nxt.elems?.blast ? '<span>Treffer laden auf, ab 100 knallt es</span>' : ''}</div>${nxt.desc ? `<div class="note">${esc(nxt.desc)}</div>` : ''}`;

  /** tree node state for the selected weapon: 'cur' | 'done' | 'next' | 'far' */
  function nodeState(n, w, opts) {
    if (opts.some((o) => o.tier === n.tier && o.branch === n.branch)) return 'next';
    if (n.tier === w.tier && (!BRANCHED(n.tier) || n.branch === w.branch)) return 'cur';
    if (w.tier === 7 && n.tier < 7) return 'done';
    if (n.tier === 5 && w.tier === 6) return w.branch === 'x' ? 'done' : n.branch === 'v' ? 'done' : 'far'; // Ast x kommt aus jedem Stufe-5-Ast
    if (n.tier === 6 && w.tier === 6) return 'far'; // der andere Stufe-6-Ast (Wahl ist endgültig)
    if (n.tier < w.tier && (!BRANCHED(n.tier) || (n.tier === 3 && w.tier > 3) || n.branch === w.branch)) return 'done';
    return 'far';
  }
  const curNode = (w) => nodeKey({ tier: w.tier, branch: BRANCHED(w.tier) ? w.branch : null });

  function weaponsView() {
    const s = ctx.save, w = s.weapons[wsel];
    const opts = weaponUpgradeOptions(s, wsel);
    if (!wnode || !TREE.some((n) => nodeKey(n) === wnode)) wnode = opts.length ? nodeKey(opts[0]) : curNode(w);
    const cur = weaponStats(wsel, w.tier, w.branch);
    // Waffenart: eine Zeile (◀ Name ▶), Antippen des Namens klappt das Raster aller Arten auf – der Baum bleibt sichtbar
    const i = WEAPON_ORDER.indexOf(wsel), anyUp = WEAPON_ORDER.some((t) => t !== wsel && canUpgradeWeapon(s, t));
    const pager = `<div class="wpager"><button class="sm" data-a="wstep" data-k="-1" aria-label="Vorige Waffenart">◀</button>
      <button class="tab wpick${typeOpen ? ' on' : ''}${anyUp && !typeOpen ? ' glow' : ''}" data-a="wtypes"><b>${esc(WEAPON_TYPES[wsel].name)}</b>&nbsp;<small>${i + 1}/${WEAPON_ORDER.length} ▾</small></button>
      <button class="sm" data-a="wstep" data-k="1" aria-label="Nächste Waffenart">▶</button></div>`;
    if (typeOpen) {
      const grid = `<div class="chips wtypes">${WEAPON_ORDER.map((t) => `<button class="tab${t === wsel ? ' on' : ''}${canUpgradeWeapon(s, t) ? ' glow' : ''}" data-a="wsel" data-k="${t}">${WEAPON_TYPES[t].name}<small> St.${s.weapons[t].tier}</small></button>`).join('')}</div><div class="note">Leuchtend = jetzt schmiedbar.</div>`;
      return { top: pager, left: grid, info: `<div class="fi-h"><b>Waffenart wählen</b></div><div class="note">Tippe links eine Waffenart an. Danach siehst du ihren Baum.</div>` };
    }
    const nodeBtn = (n) => {
      const st = nodeState(n, w, opts), name = weaponStats(wsel, n.tier, n.branch).name;
      const mark = st === 'cur' ? '★' : st === 'done' ? '✓' : st === 'next' ? '▶' : '·';
      return `<button class="rowbtn tn ${st}${st === 'next' && opts.find((o) => o.tier === n.tier && o.branch === n.branch)?.ok ? ' glow' : ''}${wnode === nodeKey(n) ? ' sel' : ''}" data-a="wnode" data-k="${nodeKey(n)}"><span class="mk">${mark}</span><span class="nm">${esc(name)}${n.branch && BRANCHED(n.tier) ? `<br><small>${BR_LABEL[n.branch].trim()}</small>` : ''}</span></button>`;
    };
    // eine Zeile pro Stufe, Äste nebeneinander
    const tiers = [...new Set(TREE.map((n) => n.tier))];
    const tree = tiers.map((t) => { const ns = TREE.filter((n) => n.tier === t); return `<div class="trow"><span class="tlv">${t}</span><div class="tcells c${ns.length}">${ns.map(nodeBtn).join('')}</div></div>`; }).join('');
    // right
    const node = TREE.find((n) => nodeKey(n) === wnode);
    const nst = nodeState(node, w, opts), nxt = weaponStats(wsel, node.tier, node.branch);
    const opt = opts.find((o) => o.tier === node.tier && o.branch === node.branch);
    let act;
    if (nst === 'next') act = `<div class="costs">${costChips(opt.cost, s)}</div><button class="btn small ${opt.ok ? 'go glow' : 'dis'}" data-a="upg" data-b="${node.branch ?? ''}">Schmieden</button>`;
    else if (nst === 'cur') act = s.loadout.weapon === wsel ? '<button class="btn small on" data-a="noop">Ausgerüstet</button>' : '<button class="btn small go" data-a="equipw">Ausrüsten</button>';
    else if (nst === 'done') act = '<div class="note">Schon überholt.</div>';
    else act = '<div class="note">Erst die Stufe davor schmieden.</div>';
    const info = `<div class="fi-h"><b>${esc(nxt.name)}</b> <small>Stufe ${nxt.tier}${nst === 'cur' ? ' · aktuell' : ''}</small></div>${statRow(cur, nxt)}${act}`;
    // Waffenlager dieses Typs: weitere Exemplare (z. B. anderes Element), Tauschen = diese wird aktiv (Baum + Tragen), Neue Stufe 1 bauen
    const store = ownedWeaponList(s, wsel).filter((x) => !x.active);
    const lager = `<div class="sub">Deine ${esc(WEAPON_TYPES[wsel].name)}-Waffen <small>· ★ = aktiv (Baum oben)</small></div>
      <div class="row srow"><span class="nm"><b>★ ${esc(cur.name)}</b><br><small>${esc(weaponTag(cur, w.tier))}</small></span></div>
      ${store.map((x) => { const st = weaponStats(x.type, x.tier, x.branch); return `<div class="row srow"><span class="nm"><b>${esc(st.name)}</b><br><small>${esc(weaponTag(st, x.tier))}</small></span><button class="sm" data-a="wswap" data-i="${x.idx}">Nehmen</button><button class="sm" data-a="wscrap" data-i="${x.idx}" title="Verschrotten">Schrott +${scrapValue(x)}</button></div>`; }).join('')}
      <div class="note">Anderes Element/Ast? Neue Stufe-1-Waffe bauen und eigenen Ast schmieden – die aktive kommt ins Lager.</div>
      <div class="row"><span class="costs">${costChips(NEW_WEAPON_COST, s, true)}</span><button class="btn small go" data-a="wnew">Neu bauen</button></div>`;
    return { top: pager, left: `<div class="tree">${tree}</div>` + lager, info };
  }

  function armorView() {
    const s = ctx.save, lo = s.loadout;
    psel ??= lo.armor.body;
    const grid = SET_ORDER.map((set) => `<div class="arow"><span class="aset">${ARMOR_SETS[set].name}<small> ${ARMOR_SETS[set].prot}</small></span>${SLOTS.map((sl) => {
      const id = pieceId(set, sl), own = s.armorOwned[id], worn = lo.armor[sl] === id;
      return `<button class="acell${own ? ' own' : ''}${worn ? ' worn' : ''}${!own && canCraftArmor(s, id).ok ? ' glow' : ''}${psel === id ? ' sel' : ''}" data-a="psel" data-k="${id}">${SLOT_NAMES[sl]}${worn ? ' *' : own ? ' +' : ''}</button>`;
    }).join('')}</div>`).join('');
    const p = getPiece(psel), own = s.armorOwned[psel], worn = lo.armor[p.slot] === psel;
    const before = armorProtection(lo.armor), after = armorProtection({ ...lo.armor, [p.slot]: psel });
    const sk0 = armorSkills(lo.armor), sk1 = armorSkills({ ...lo.armor, [p.slot]: psel });
    const ids = [...new Set([...Object.keys(sk0), ...Object.keys(sk1)])];
    const skTxt = ids.length ? ids.map((id) => `<span class="${(sk0[id] ?? 0) === (sk1[id] ?? 0) ? '' : (sk1[id] ?? 0) > (sk0[id] ?? 0) ? 'sk up' : 'sk dn'}">${SKILLS[id].name} ${sk0[id] ?? 0}→${sk1[id] ?? 0}</span>`).join('') : '<span>keine Macken</span>';
    const act = own ? `<button class="btn small${worn ? ' on' : ' go'}" data-a="${worn ? 'noop' : 'wear'}">${worn ? 'Getragen' : 'Anlegen'}</button>`
      : `<div class="costs">${costChips(p.cost, s)}</div><button class="btn small${canCraftArmor(s, psel).ok ? ' go glow' : ' dis'}" data-a="craftp">Schmieden</button>`;
    const info = `<div class="fi-h"><b>${esc(p.name)}</b> <small>${esc(p.setName)} · ${own ? 'im Besitz' : 'neu'}</small></div>
      <div class="stats"><span>Schutz ${before} → ${after} ${delta(before, after)}</span><span>${Math.round(damageReduction(after) * 100)} % weniger Schaden</span></div>
      <div class="stats mk">${skTxt}</div>${pieceSkillsHtml(psel, lo.armor)}${act}`;
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
      return `<div class="fg"><div class="fg-l"><div class="fg-tabs">${tabs(tab, [['weapons', 'Waffen'], ['armor', 'Rüstung']], { weapons: WEAPON_ORDER.some((t) => canUpgradeWeapon(ctx.save, t)), armor: SET_ORDER.some((set) => SLOTS.some((sl) => canCraftArmor(ctx.save, pieceId(set, sl)).ok)) })}</div>${v.top ?? ''}<div class="fg-scroll">${v.left}</div></div>
        <div class="fg-p">${previewSlot(true)}</div><div class="fg-r"><div class="fg-info">${v.info}</div></div></div>`;
    },
    after(body) {
      host = body;
      const sc = body.querySelector('.fg-scroll'); if (sc) sc.scrollTop = keepScroll;
      if (sc && scrollSel) { const n = sc.querySelector('.tn.sel'); if (n) sc.scrollTop = Math.max(0, n.offsetTop - sc.offsetTop - sc.clientHeight / 2 + n.offsetHeight / 2); }
      scrollSel = false;
      body.classList.add('fit');
      const slot = body.querySelector('[data-gpv]'); if (!slot) return;
      pv ??= new GearPreview({ big: true }); pv.set(previewGear()); pv.attach(slot);
    },
    dispose() { pv?.dispose(); pv = null; },
    click(a, d) {
      const s = ctx.save;
      if (a === 'noop') return false;
      keepScroll = host?.querySelector('.fg-scroll')?.scrollTop ?? 0; // Re-Render ersetzt die Liste -> Position merken
      if (a === 'tab') { tab = d.k; wnode = null; keepScroll = 0; typeOpen = false; scrollSel = true; }
      else if (a === 'wsel') { wsel = d.k; wnode = null; keepScroll = 0; typeOpen = false; scrollSel = true; }
      else if (a === 'wtypes') { typeOpen = !typeOpen; keepScroll = 0; scrollSel = !typeOpen; }
      else if (a === 'wstep') { const n = WEAPON_ORDER.length; wsel = WEAPON_ORDER[(WEAPON_ORDER.indexOf(wsel) + Number(d.k) + n) % n]; wnode = null; keepScroll = 0; typeOpen = false; scrollSel = true; }
      else if (a === 'wnode') wnode = d.k;
      else if (a === 'psel') psel = d.k;
      else if (a === 'equipw') { equipWeapon(s, wsel); ctx.commit(); ctx.toast(`${WEAPON_TYPES[wsel].name} ausgerüstet.`); }
      else if (a === 'wnew') { const r = buildNewWeapon(s, wsel); wnode = null; if (r.ok) { ctx.commit(); ctx.toast(`${r.name} gebaut und ausgerüstet. Die alte liegt im Lager.`); } else ctx.toast(reasonText(r), true); }
      else if (a === 'wswap') { const r = swapWeapon(s, Number(d.i)); wnode = null; if (r.ok) { ctx.commit(); ctx.toast(`${r.name} ausgerüstet.`); } else ctx.toast(reasonText(r), true); }
      else if (a === 'wscrap') { const r = scrapWeapon(s, Number(d.i)); if (r.ok) { ctx.commit(); ctx.toast(`${r.name} verschrottet (+${r.schrott} Schrott).`); } else ctx.toast(reasonText(r), true); }
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
// Reiter: Ausrüstung (Slot links → Vorschau → Auswahl rechts, Werte mit Vergleich) | Item-Leiste | Vorrat | Basteln
const T_SLOTS = ['weapon', ...SLOTS];
const T_SLOT_NAME = { weapon: 'Waffe', ...SLOT_NAMES };
export function createTruhe(ctx) {
  let tab = 'gear', info = null, slotSel = 'weapon', pop = null, itemSel = null; // pop = item id whose detail card is open (craft tab)
  let pv = null; // [G] rotating preview of what you wear (updates live when you change gear)

  const curWeapon = (s) => { const t = s.loadout.weapon, w = s.weapons[t]; return weaponStats(t, w.tier, w.branch); };
  function gear() {
    const s = ctx.save, lo = s.loadout;
    const prot = armorProtection(lo.armor), sk = armorSkills(lo.armor), fx = skillEffects(sk);
    const cw = curWeapon(s);
    const slotBtn = (sl) => {
      const nm = sl === 'weapon' ? cw.name : getPiece(lo.armor[sl]).name;
      const sub = sl === 'weapon' ? `${cw.typeName} · ${weaponTag(cw, cw.tier)}` : `Schutz ${getPiece(lo.armor[sl]).prot}`;
      return `<button class="rowbtn tslot${slotSel === sl ? ' sel' : ''}" data-a="slot" data-k="${sl}"><span class="ts-k">${T_SLOT_NAME[sl]}</span><span class="nm"><b>${esc(nm)}</b><br><small>${esc(sub)}</small></span><span class="ts-a">›</span></button>`;
    };
    const skills = Object.entries(sk).map(([id, l]) => `<span title="${esc(SKILLS[id].desc(l))}">${esc(SKILLS[id].name)} ${l}</span>`).join('') || '<span>keine Macken</span>';
    const left = `${T_SLOTS.map(slotBtn).join('')}
      <div class="tsum"><span><b>Schutz ${prot}</b> <small>(${Math.round(damageReduction(prot) * 100)} % weniger Schaden)</small></span><div class="stats mk">${skills}${fx.flinchImmune ? '<span>kein Zucken</span>' : ''}</div></div>`;
    return `<div class="fg tr"><div class="fg-l"><div class="fg-scroll">${left}</div></div><div class="fg-p">${previewSlot(true)}</div>
      <div class="fg-r"><div class="sub tr-h">${T_SLOT_NAME[slotSel]} wählen</div><div class="fg-scroll">${slotSel === 'weapon' ? weaponChoices(s) : armorChoices(s, slotSel)}</div></div></div>`;
  }
  function weaponChoices(s) {
    const lo = s.loadout, cw = curWeapon(s), all = ownedWeaponList(s);
    return WEAPON_ORDER.map((t) => {
      const rows = all.filter((x) => x.type === t).map((x) => {
        const st = weaponStats(x.type, x.tier, x.branch), on = x.active && t === lo.weapon;
        const cmp = on ? '<small class="tr-on">getragen</small>' : t === lo.weapon ? `<small>Kraft ${st.power} ${delta(cw.power, st.power)}</small>` : `<small>Kraft ${st.power}</small>`;
        return `<button class="rowbtn tch${on ? ' sel' : ''}" data-a="${on ? 'noop' : x.active ? 'equipw' : 'wswap'}" data-k="${t}" data-i="${x.idx}"><span class="nm">${esc(st.name)}<br><small>${esc(weaponTag(st, x.tier))}${x.active ? '' : ' · Lager'}</small></span>${cmp}</button>`;
      }).join('');
      return `<div class="tgrp">${esc(WEAPON_TYPES[t].name)}</div>${rows}`;
    }).join('');
  }
  function armorChoices(s, sl) {
    const lo = s.loadout, cur = lo.armor[sl], p0 = armorProtection(lo.armor);
    const owned = Object.keys(s.armorOwned).filter((id) => getPiece(id)?.slot === sl).sort((a, b) => getPiece(b).prot - getPiece(a).prot);
    return owned.map((id) => {
      const p = getPiece(id), on = id === cur, p1 = armorProtection({ ...lo.armor, [sl]: id });
      return `<div class="tch2${on ? ' on' : ''}"><button class="rowbtn tch${on ? ' sel' : ''}" data-a="${on ? 'noop' : 'wear'}" data-k="${id}"><span class="nm">${esc(p.name)}<br><small>${esc(p.setName)}</small></span><small>${on ? '<span class="tr-on">getragen</span>' : `Schutz ${p1} ${delta(p0, p1)}`}</small></button>
        <div class="tch-sk">${pieceSkillsHtml(id, lo.armor)}</div></div>`;
    }).join('') || '<div class="note">Noch nichts. In der Schmiede gibt es Rüstung.</div>';
  }

  function itemsTab() {
    const s = ctx.save, lo = s.loadout;
    const cons = ITEM_IDS.filter((id) => ITEMS[id].kind !== 'material' && (s.box[id] ?? 0) > 0);
    const barN = (id) => lo.items.find((e) => e.id === id)?.n ?? 0;
    if (!cons.includes(itemSel)) itemSel = lo.items[0]?.id ?? cons[0] ?? null;
    const bar = Array.from({ length: 8 }, (_, i) => {
      const e = lo.items[i];
      return e ? `<button class="slot full${e.id === itemSel ? ' sel' : ''}" data-a="isel" data-k="${e.id}" title="${esc(ITEMS[e.id].name)}">${iconHtml(e.id)}<b>${e.n}</b></button>` : '<span class="slot"></span>';
    }).join('');
    if (!cons.length) return `<div class="bar8">${bar}</div><div class="note">Keine Verbrauchsgegenstände in der Truhe. Unter „Basteln“ gibt es welche. Pro Jagd gibt es 2 Flickbrausen gratis.</div>`;
    const grid = cons.map((id) => `<button class="cell${id === itemSel ? ' sel' : ''}${barN(id) ? ' inbar' : ''}" data-a="isel" data-k="${id}">${iconHtml(id)}<span>${esc(ITEMS[id].name)}</span><b>${barN(id)}/${s.box[id] ?? 0}</b></button>`).join('');
    const id = itemSel, n = barN(id), slotIdx = lo.items.findIndex((e) => e.id === id);
    const act = `<div class="idet-a tbar-ctl"><button class="sm" data-a="bar-" data-k="${id}">−</button><b class="num">${n}</b><button class="sm" data-a="bar+" data-k="${id}">+</button><button class="sm" data-a="barmax" data-k="${id}">max</button>
      ${slotIdx > 0 ? `<button class="btn small" data-a="front" data-i="${slotIdx}">Nach vorn</button>` : ''}${n ? `<button class="btn small" data-a="bar0" data-k="${id}">Raus</button>` : ''}</div>`;
    return `<div class="split"><div class="list"><div class="sub">Item-Leiste <small>(max. 8, links = zuerst)</small></div><div class="bar8">${bar}</div>
      <div class="sub">In der Truhe <small>(mitgenommen/gesamt)</small></div><div class="grid">${grid}</div></div>
      <div class="detail">${itemDetail(id, s, act)}</div></div>`;
  }

  function stock() {
    const s = ctx.save;
    const ids = ITEM_IDS.filter((id) => (s.box[id] ?? 0) > 0);
    if (!ids.length) return '<div class="note">Die Truhe ist leer. Geh jagen, sammeln, zerlegen.</div>';
    if (!ids.includes(info)) info = ids[0];
    const cell = (id) => `<button class="cell${info === id ? ' sel' : ''}" data-a="info" data-k="${id}">${iconHtml(id)}<span>${esc(ITEMS[id].name)}</span><b>${s.box[id]}</b></button>`;
    const cons = ids.filter((id) => ITEMS[id].kind !== 'material'), mats = ids.filter((id) => ITEMS[id].kind === 'material');
    return `<div class="split"><div class="list">${cons.length ? `<div class="sub">Verbrauch</div><div class="grid">${cons.map(cell).join('')}</div>` : ''}${mats.length ? `<div class="sub">Material</div><div class="grid">${mats.map(cell).join('')}</div>` : ''}</div>
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

  /** what the preview shows: worn outfit */
  return {
    render: () => tabs(tab, [['gear', 'Ausrüstung'], ['items', 'Item-Leiste'], ['stock', 'Vorrat'], ['craft', 'Basteln']]) + (tab === 'gear' ? gear() : tab === 'items' ? itemsTab() : tab === 'stock' ? stock() : craft())
      + (pop && tab === 'craft' ? `<div class="pop" data-a="popx"><div class="pop-c" data-a="noop">${itemDetail(pop, ctx.save, '<div class="idet-a"><button class="btn small" data-a="popx">Schließen</button></div>')}</div></div>` : ''),
    after(body) {
      body.classList.toggle('trfit', tab === 'gear');
      const slot = body.querySelector('[data-gpv]'); if (!slot) return;
      pv ??= new GearPreview({ big: true }); pv.set(makeGear(buildLoadout(ctx.save))); pv.attach(slot);
    },
    dispose() { pv?.dispose(); pv = null; },
    click(a, d) {
      const s = ctx.save, lo = s.loadout;
      switch (a) {
        case 'tab': tab = d.k; pop = null; break;
        case 'noop': return false;
        case 'popx': pop = null; break;
        case 'equipw': equipWeapon(s, d.k); ctx.commit(); break;
        case 'wswap': swapWeapon(s, Number(d.i)); ctx.commit(); break;
        case 'slot': slotSel = d.k; break;
        case 'wear': equipArmor(s, d.k); ctx.commit(); break;
        case 'info': if (tab === 'stock') info = d.k; else pop = d.k; break;
        case 'isel': itemSel = d.k; break;
        case 'front': barMoveFront(s, Number(d.i)); ctx.commit(); break;
        case 'bar+': case 'bar-': case 'barmax': case 'bar0': {
          const cur = lo.items.find((e) => e.id === d.k)?.n ?? 0;
          const r = setBarItem(s, d.k, a === 'bar+' ? cur + 1 : a === 'bar-' ? cur - 1 : a === 'bar0' ? 0 : 99);
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
