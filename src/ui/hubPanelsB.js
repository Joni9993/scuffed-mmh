// Station panels B: Kochtopf, Auftragsbrett, Spiegel, Optionen.
import { MUTATORS, MUTATOR_ORDER, MAX_MUTATORS, cleanMutatorIds, resolveMods, rewardLabel } from '../data/mutators.js';
import { FOODS, FOOD_ORDER } from '../data/foods.js';
import { questList } from '../data/quests.js';
import { registerFieldStudy, getBestTime, FIELDSTUDY_ID } from '../meta/fieldstudy.js';
import { MAX_TIER, isTierQuest, tierInfo, tierQuestIds, WEEKLY_BONUS, splitterForWin, WEEKLY_TIER, SPLITTER_FACTOR, cleanPostGlitch } from '../data/glitchTiers.js';
import { tierUnlocked, tierClearedOf, bestTime, monstersClearedAt } from '../meta/endgame.js';
import { weeklyQuest } from '../meta/weekly.js';
import { monsters } from '../game/monsters/index.js';
import { cookMeal } from '../meta/crafting.js';
import { missing } from '../meta/inventory.js';
import { questLock, isKeyQuest, rankProgress, questById } from '../meta/progression.js';
import { buildLoadout } from '../meta/loadout.js';
import { installHtml, bindInstall, onInstallChange } from './install.js';
import { PLAYER_COLORS, cleanName, importCode, exportCode, SAVE_KEY } from '../meta/save.js';
import { settings, saveSettings, nextRes, normDmgMode, nextDmgMode } from '../core/settings.js';
import { sfx } from '../audio/sfx.js';
import { music } from '../audio/music.js';
import { deathlog, prettyAttack } from '../meta/deathlog.js';
import { openTouchEditor } from './touchEditor.js';
import { esc, costChips, reasonText } from './hubKit.js';
import { iconHtml } from './hubIcons.js';
import { GearPreview, previewSlot } from './gearPreview.js';
import { BESTIARY, CONDITIONS, KIND_LABEL, ELEM_NOTES, unlockedEntries, nextUnlock, weaknessOf } from '../data/compendium.js';
import { partTactic } from '../data/partTactics.js';
import { makeGear } from '../data/gearlook.js';

const tabs = (cur, list, glow = {}) => `<div class="tabs">${list.map(([k, n]) => `<button class="tab${k === cur ? ' on' : ''}${glow[k] ? ' glow' : ''}" data-a="tab" data-k="${k}">${n}</button>`).join('')}</div>`;

// ============================================================ Kochtopf
export function createKochtopf(ctx) {
  return {
    render() {
      const s = ctx.save;
      const cur = s.meal ? FOODS[s.meal] : null;
      return `<div class="note">Brösel: „Eine Mahlzeit pro Jagd. Ich koche nicht für Nimmersatte.“</div>
        <div class="card">${cur ? `Im Bauch für die nächste Jagd: <b>${esc(cur.name)}</b> <small>${esc(cur.desc)}</small>` : 'Noch nichts gekocht.'}</div>` +
        FOOD_ORDER.map((id) => {
          const f = FOODS[id], ok = !s.meal && !missing(s, f.cost).length;
          return `<div class="row rc"><span class="nm"><b>${esc(f.name)}</b><br><small>${esc(f.desc)}</small></span><span class="costs">${costChips(f.cost, s)}</span>
            <button class="btn small${ok ? ' go' : ' dis'}" data-a="cook" data-k="${id}">Kochen</button></div>`;
        }).join('');
    },
    click(a, d) {
      if (a !== 'cook') return;
      const r = cookMeal(ctx.save, d.k);
      if (r.ok) { ctx.commit(); ctx.toast(`${FOODS[d.k].name} gekocht. Zum Mitnehmen.`); } else ctx.toast(reasonText(r), true);
    },
  };
}

// ============================================================ Auftragsbrett
/**
 * Default (solo) board adapter: Posten -> Bereit -> start the hunt. A net/town agent passes its own adapter:
 *  { getPosted() -> [{id, quest, host, members:[{name, ready, me}], joined, mine}], post(questId), join(postId),
 *    setReady(bool), unpost?(), onChange(fn) -> unsubscribe }
 */
export function createLocalBoard({ name, start }) {
  let post = null;
  const subs = new Set();
  const emit = () => subs.forEach((f) => f());
  return {
    getPosted: () => (post ? [post] : []),
    post(questId, mutators = [], extra = {}) { const rules = cleanPostGlitch(questId, { ...extra, mutators }, cleanMutatorIds); post = { id: 'local', quest: questId, ...rules, host: name(), members: [{ name: name(), ready: false, me: true }], joined: true, mine: true }; emit(); },
    join() {},
    unpost() { post = null; emit(); },
    setReady(b) {
      if (!post) return;
      post.members[0].ready = !!b; emit();
      if (b && post.members.length === 1) start(post.quest, post.mutators, { tier: post.tier, weekly: post.weekly });
    },
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function startSolo(app, store, questId, mutators = [], extra = {}) {
  const save = store.get();
  app.goto('hunt', { quest: questId, mutators, glitchTier: extra.tier ?? 0, weekly: extra.weekly ?? null, loadout: buildLoadout(save), name: save.name, seed: (Math.random() * 1e9) | 0 });
}

// Aufbau: oben (falls vorhanden) dein Auftrag bzw. offene Aufträge im Raum, darunter Reiter Jagd | Rotglut | Sammeln | ★ Woche.
// Links die Liste (kompakt, gesperrte zusammengefasst), rechts der gewählte Auftrag mit Mutatoren und „Posten".
const QB_TABS = [['hunt', 'Jagd'], ['rot', 'Rotglut'], ['gather', 'Sammeln'], ['week', '★ Woche']];
const qCat = (q) => (q.id === FIELDSTUDY_ID || q.id === 'wochenglitch' ? 'week' : q.gather ? 'gather' : q.variant ? 'rot' : 'hunt');
const mName = (id) => (id ? monsters[id]?.name ?? id : null);

export function createBrett(ctx) {
  const adapter = ctx.adapter ?? createLocalBoard({ name: () => ctx.save.name, start: (q, mu, extra) => { ctx.close(); startSolo(ctx.app, ctx.store, q, mu, extra); } });
  const unsub = adapter.onChange?.(() => ctx.rerender());
  let sel = null, info = null, tab = null, mutOpen = false, showLocked = false;
  const chosen = []; // 0-2 Mutatoren fuer den naechsten Posten
  const mutHtml = (ids) => ids.map((i) => MUTATORS[i]).filter(Boolean).map((m) => `${esc(m.name)}${rewardLabel(m) ? ` (${rewardLabel(m)})` : ''}`).join(' · ');
  const allQuests = () => [weeklyQuest(), registerFieldStudy(), ...questList()];
  const tierSel = {}; // Brocken -> zuletzt gewählte Glitch-Stufe (nur Sitzung)
  const rulesHtml = (ids, label) => `<div class="qmut"><small>${label} · Antippen für die Wirkung</small>${ids.map(id => MUTATORS[id]).filter(Boolean).map(m => `<details><summary>${esc(m.name)}</summary><p>${esc(m.desc)}</p></details>`).join('')}</div>`;
  /** gewählte Stufe: 0 ... freigeschaltet (nie mehr als der Spielstand erlaubt) */
  const tierOf = (s, q) => (isTierQuest(q) ? Math.max(0, Math.min(tierUnlocked(s, q.monster), tierSel[q.monster] ?? 0)) : 0);
  const isOpen = (s, q) => !questLock(s, q) && (!q.monster || !!monsters[q.monster]);

  /** Standard: der nächste offene Rang-Auftrag, sonst der erste offene Auftrag im Reiter. */
  function pickDefault(s) {
    const key = questList().find((q) => isKeyQuest(q, s) && isOpen(s, q));
    if (!tab) tab = key ? qCat(key) : 'hunt';
    const list = allQuests().filter((q) => qCat(q) === tab);
    if (!list.some((q) => q.id === sel)) sel = (key && qCat(key) === tab ? key : list.find((q) => isOpen(s, q)) ?? list[0])?.id ?? null;
  }

  function listHtml(s) {
    const list = allQuests().filter((q) => qCat(q) === tab);
    const open = list.filter((q) => isOpen(s, q)), locked = list.filter((q) => !isOpen(s, q));
    const row = (q) => {
      const ok = isOpen(s, q), key = isKeyQuest(q, s), done = s.clears[q.id] ?? 0;
      return `<button class="rowbtn qrow${q.id === sel ? ' sel' : ''}${ok ? '' : ' lock'}${key && ok ? ' key' : ''}" data-a="qsel" data-k="${q.id}">
        <span class="nm">${key ? '<i class="qk">RANG</i> ' : ''}${esc(q.name)}${done ? ` <small class="qd">✓${done}</small>` : ''}<br><small>${ok ? esc(mName(q.monster) ?? 'Sammelauftrag') + (isTierQuest(q) && tierClearedOf(s, q.monster) ? ` · Glitch ${tierClearedOf(s, q.monster)}` : q.id === 'wochenglitch' && s.glitch?.weekly === q.weekly ? ' · diese Woche ✓' : '') : questLock(s, q) ? (questLock(s, q).reason === 'rp' ? `noch ${questLock(s, q).need} RP` : `ab JR ${questLock(s, q).need}`) : 'kommt noch'}</small></span>
        <span class="chip ok">${iconHtml('schrott')}${q.reward}</span></button>`;
    };
    let html = open.map(row).join('');
    if (locked.length) {
      html += showLocked || !open.length ? locked.map(row).join('')
        : `${row(locked[0])}${locked.length > 1 ? `<button class="rowbtn qmore" data-a="qlocked">+ ${locked.length - 1} weitere gesperrte zeigen</button>` : ''}`;
    }
    return html || '<div class="note">Hier gibt es noch nichts.</div>';
  }

  function detailHtml(s) {
    const q = allQuests().find((x) => x.id === sel);
    if (!q) return '<div class="note">Wähle links einen Auftrag.</div>';
    const isFs = q.id === FIELDSTUDY_ID, lock = questLock(s, q), ok = isOpen(s, q), key = isKeyQuest(q, s);
    const isWk = q.id === 'wochenglitch', tierQ = isTierQuest(q), tier = tierOf(s, q);
    const fixed = q.mutators?.length ? q.mutators : null;
    const head = `<div class="fi-h"><b>${esc(q.name)}</b>${mName(q.monster) ? ` <small>· ${esc(mName(q.monster))}</small>` : ''}</div>
      <div class="qchips"><span class="chip ok">${iconHtml('schrott')}${isWk ? q.reward : Math.round(q.reward * (tier ? tierInfo(tier).payMul : 1))}</span>${q.rp ? `<span class="chip">+${isWk ? q.rp : Math.round(q.rp * (tier ? tierInfo(tier).payMul : 1))} RP</span>` : ''}${key ? `<span class="chip qkey">Rang-Auftrag → JR ${q.jrUp}</span>` : ''}${s.clears[q.id] ? `<span class="chip">✓ ${s.clears[q.id]}×</span>` : ''}${bestTime(s, q, tier) ? `<span class="chip">⏱ ${mmss(bestTime(s, q, tier))}</span>` : ''}</div>`;
    if (!ok) return `${head}<div class="note">${esc(q.desc)}</div><div class="qlockmsg">${!lock ? 'Dieser Brocken ist noch nicht im Rostnest angekommen.' : lock.reason === 'rp' ? `Gesperrt: noch ${lock.need} RP sammeln.` : `Gesperrt: Jägerrang ${lock.need} nötig.`}</div>`;
    if (mutOpen && !fixed && !tier) { // Mutator-Auswahl ersetzt kurz die Beschreibung
      const tiles = MUTATOR_ORDER.map((id) => { const m = MUTATORS[id], on = chosen.includes(id);
        return `<button class="mtile${on ? ' on' : ''}" aria-pressed="${on}" data-a="mut" data-k="${id}"><span class="mt-n">${on ? '✓ ' : ''}${esc(m.name)}</span><span class="mt-r">${esc(rewardLabel(m))}</span></button>`; }).join('');
      const focus = info ?? chosen[chosen.length - 1];
      return `<div class="fi-h"><b>Mutatoren</b> <small>${chosen.length}/${MAX_MUTATORS}${chosen.length ? ' · ' + esc(rewardLabel(resolveMods(chosen))) : ''}</small></div>
        <div class="muts">${tiles}</div><div class="mt-info">${focus && MUTATORS[focus] ? `<b>${esc(MUTATORS[focus].name)}:</b> ${esc(MUTATORS[focus].desc)}` : 'Antippen: Wirkung erscheint hier. Mehr Risiko, mehr Beute.'}</div>
        <div class="qact"><button class="btn small" data-a="mutclr">Keine</button><button class="btn small go" data-a="mutdone">Fertig</button></div>`;
    }
    // Glitch-Stufe (nur echte Brocken-Jagden): Stepper 0-10, gesperrte Stufen sichtbar, feste Mutatoren der Stufe in der Zeile darunter
    let tierRow = '';
    if (tierQ) {
      const un = tierUnlocked(s, q.monster), ti = tierInfo(tier);
      const sub = !un ? 'Erst diesen Brocken besiegen.' : tier === 0 ? `Frei bis Stufe ${un}. Normaler Auftrag.` : `+${Math.round((ti.matMul - 1) * 100)} % Beute, Schrott &amp; RP +${Math.round((ti.payMul - 1) * 100)} % · ◆${splitterForWin(tier)}`;
      tierRow = `<div class="qtier${un ? '' : ' lock'}"><button class="sm" data-a="tdn" data-k="${q.monster}" aria-label="Stufe runter"${tier <= 0 ? ' disabled' : ''}>−</button>
        <span class="qt-n"><b>Glitch-Stufe ${tier}${tier === MAX_TIER ? ' (Max)' : ''}</b><small>${sub}</small></span>
        <button class="sm${un > tierClearedOf(s, q.monster) && tier < un ? ' glow' : ''}" data-a="tup" data-k="${q.monster}" aria-label="Stufe hoch"${tier >= un ? ' disabled' : ''}>+</button></div>`;
    }
    const wkInfo = isWk ? `<div class="note">Erster Sieg der Woche: +${WEEKLY_BONUS} Splitter extra. Sonst ◆${splitterForWin(WEEKLY_TIER)} pro Sieg.${s.glitch?.weekly === q.weekly ? ' Diese Woche schon geholt.' : ''}</div>` : '';
    const mutLine = isWk ? rulesHtml(q.mutators, 'Wochen-Mutatoren')
      : tier ? rulesHtml(tierInfo(tier).mutators, `Stufe ${tier} · ${tierInfo(tier).mutators.length} Mutatoren`)
      : fixed ? rulesHtml(fixed, 'Feste Mutatoren')
      : `<button class="qmut tapline" data-a="mutopen"><small>Mutatoren:</small> ${chosen.length ? mutHtml(chosen) : 'keine'} <b>✎</b></button>`;
    const fsLine = isFs ? `<div class="note">Bestzeit diese Woche: ${getBestTime(q.fieldStudy) ? mmss(getBestTime(q.fieldStudy)) : '–'}</div>` : '';
    const mine = adapter.getPosted().find((p) => p.joined);
    return `${head}<div class="qdesc">${esc(q.desc)}</div>${fsLine}${wkInfo}${tierRow}${mutLine}
      <div class="qact">${mine ? '<small>Du hast schon einen Auftrag offen (oben).</small>' : `<button class="btn small go" data-a="post" data-k="${q.id}">Posten</button>`}</div>`;
  }

  function postedHtml() {
    const posted = adapter.getPosted();
    const mine = posted.find((p) => p.joined), others = mine ? [] : posted;
    const one = (p) => {
      const q = allQuests().find((x) => x.id === p.quest);
      const me = p.members.find((m) => m.me), alone = p.members.length <= 1;
      const mu = p.mutators?.length ? p.mutators : q?.mutators ?? [];
      const title = `${esc(q?.name ?? p.quest)}${p.tier > 0 ? ` · Glitch ${p.tier}` : p.weekly ? ' · Wochen-Glitch' : ''}`;
      return `<div class="qpost${p.joined ? ' mine' : ''}"><div class="nm"><b>${title}</b> <small>von ${esc(p.host)} · ${p.members.map((m) => `${esc(m.name)}${m.ready ? ' ✓' : ''}`).join(', ')}</small>${mu.length ? `<details class="qpost-rules"><summary>${mu.length} Modifikatoren · Wirkung anzeigen</summary>${rulesHtml(mu, 'Aktive Regeln')}</details>` : ''}</div>
        ${p.joined ? `${p.mine ? '<button class="btn small" data-a="unpost">Zurückziehen</button>' : ''}<button class="btn small go" data-a="ready" data-k="${p.id}" data-r="${me?.ready ? 0 : 1}">${me?.ready ? 'Nicht bereit' : alone ? 'Los!' : 'Bereit'}</button>`
          : `<button class="btn small go" data-a="join" data-k="${p.id}">Beitreten</button>`}</div>`;
    };
    if (mine) return `<div class="qtop">${one(mine)}</div>`;
    return others.length ? `<div class="qtop"><div class="sub">Offen im Raum</div>${others.map(one).join('')}</div>` : '';
  }

  return {
    dispose() { unsub?.(); },
    render() {
      const s = ctx.save;
      pickDefault(s);
      const glow = { [qCat(questList().find((q) => isKeyQuest(q, s) && isOpen(s, q)) ?? { id: '-' })]: true };
      return `${postedHtml()}<div class="qhead">${tabs(tab, QB_TABS, glow)}<small class="qrank">${rankLine(s)}</small></div>
        <div class="qb"><div class="qlist">${listHtml(s)}</div><div class="qdet">${detailHtml(s)}</div></div>`;
    },
    click(a, d) {
      if (a === 'tab') { tab = d.k; sel = null; mutOpen = false; showLocked = false; return true; }
      if (a === 'qsel') { sel = d.k; mutOpen = false; return true; }
      if (a === 'qlocked') { showLocked = true; return true; }
      if (a === 'mutopen') { mutOpen = true; return true; }
      if (a === 'mutdone') { mutOpen = false; return true; }
      if (a === 'mutclr') { chosen.length = 0; info = null; return true; }
      if (a === 'mut') { info = d.k; const i = chosen.indexOf(d.k); if (i >= 0) chosen.splice(i, 1); else { if (chosen.length >= MAX_MUTATORS) chosen.shift(); chosen.push(d.k); } return true; }
      if (a === 'tup' || a === 'tdn') { const cur = Math.min(tierUnlocked(ctx.save, d.k), tierSel[d.k] ?? 0); tierSel[d.k] = Math.max(0, Math.min(tierUnlocked(ctx.save, d.k), cur + (a === 'tup' ? 1 : -1))); return true; }
      if (a === 'post') {
        const q = allQuests().find((x) => x.id === d.k), t = q ? tierOf(ctx.save, q) : 0;
        if (q?.id === 'wochenglitch') adapter.post(q.baseId, [...q.mutators], { weekly: q.weekly }); // Basis-Auftrag + Wochenschlüssel: Gäste brauchen kein Datum
        else if (t > 0) adapter.post(d.k, [], { tier: t }); // Mutatoren kommen aus der Stufentabelle (Host bereinigt)
        else adapter.post(d.k, q?.mutators?.length ? [] : [...chosen]); // feste Mutatoren stecken im Auftrag
        return true;
      }
      if (a === 'join') { adapter.join(d.k); return true; }
      if (a === 'unpost') { adapter.unpost?.(); return true; }
      if (a === 'ready') { adapter.setReady(d.r === '1'); return true; }
      return false;
    },
  };
}

function rankLine(s) {
  const { next, rp } = rankProgress(s);
  const sp = ` · ◆ ${s.glitch?.splitter ?? 0} Splitter`;
  if (!next) return `JR ${s.jr} · RP ${rp} (Höchstrang)${sp}`;
  const k = next.keys.map((id) => questById(id).name).join(' oder ');
  return `JR ${s.jr} · RP ${rp}/${next.rp} · nächster Rang: ${esc(k)}${sp}`;
}

// ============================================================ Spiegel (Aussehen + Erfolge)
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hhmm = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);

export function createSpiegel(ctx) {
  let tab = 'look', pv = null, bookSel = 'zustaende';

  // ---- Brocken-Kompendium: Feldnotizen, wachsen mit jedem Kampf (save.fights)
  const fightsOf = (id) => ctx.save.fights?.[id] ?? 0;
  const newCount = (b) => Math.max(0, unlockedEntries(b, fightsOf(b.id)).length - (ctx.save.bookSeen?.[b.id] ?? 0));
  const bookNew = () => BESTIARY.reduce((n, b) => n + newCount(b), 0);
  function bookView() {
    const chip = (k, label, dot) => `<button class="tab${k === bookSel ? ' on' : ''}" data-a="book" data-k="${k}">${label}${dot ? ' <b style="color:#ffd84a">●</b>' : ''}</button>`;
    const chips = `<div class="tabs" style="flex-wrap:wrap">${chip('zustaende', 'Zustände')}${BESTIARY.map((b) => chip(b.id, fightsOf(b.id) ? esc(b.name.split(' ')[0]) : '???', newCount(b) > 0)).join('')}</div>`;
    let body;
    if (bookSel === 'zustaende') {
      const grp = (who, title) => `<div class="sub">${title}</div>${CONDITIONS.filter((c) => c.who === who).map((c) => `<div class="row srow"><span class="nm"><b>${esc(c.name)}</b><br><small>${esc(c.text)}</small></span></div>`).join('')}`;
      body = `<div class="note">„Was dich umbringt, sollte man kennen. Was den Brocken umbringt, erst recht.“ – Notizbuch, Seite 1</div>${grp('du', 'Was dich erwischt')}${grp('brocken', 'Was du dem Brocken antust')}`;
    } else {
      const b = BESTIARY.find((x) => x.id === bookSel), f = fightsOf(b.id), list = unlockedEntries(b, f), seen = ctx.save.bookSeen?.[b.id] ?? 0, nx = nextUnlock(b, f);
      if (!f) body = `<div class="note">Noch keine Begegnung. Die Seite ist leer, bis auf einen Kaffeefleck.</div>`;
      else {
        body = `<div class="fi-h"><b>${esc(b.name)}</b> <small>${esc(b.title)} · ${esc(b.where)} · ${f} ${f === 1 ? 'Kampf' : 'Kämpfe'} · ${ctx.save.kills?.[b.id] ?? 0} erlegt</small></div>
          <div class="note">${esc(b.intro)}</div>${weakHtml(b)}
          ${list.map((e, i) => `<div class="row srow"><span class="nm"><b>${esc(e.name)}</b> <small>${KIND_LABEL[e.kind]}${i >= seen ? ' · <b style="color:#ffd84a">NEU</b>' : ''}</small><br><small>${esc(e.text)}</small></span></div>`).join('')}
          ${nx ? `<div class="note">${b.entries.length - list.length} Seiten noch leer. Nächste Notiz nach ${nx === 1 ? 'dem nächsten Kampf' : `${nx} weiteren Kämpfen`}.</div>` : '<div class="note">Seite voll. Mehr gibt es über diesen Brocken nicht zu wissen – außer, wie man ihn schneller erlegt.</div>'}`;
      }
    }
    return `<div class="fg-tabs">${tabsHtml()}</div>${chips}${body}`;
  }
  // Schwachstellen-Kasten (aus den Trefferzonen berechnet)
  function weakHtml(b) {
    const def = monsters[b.id];
    const tactics = (def?.parts ?? []).filter(p => p.breakHp).map(p => `<br><small><b>${esc(p.label)}:</b> ${esc(partTactic({ def }, p).before)}</small>`).join('');
    const w = weaknessOf(monsters[b.id]), st = (n) => (n ? '★'.repeat(n) + '☆'.repeat(3 - n) : '✗');
    const el = w.elems.map((e) => `<span class="chip${e.stars >= 2 ? ' ok' : ''}">${e.name} ${st(e.stars)}</span>`).join(' ');
    const best = w.elems.filter((e) => e.stars > 0).sort((a, c) => c.value - a.value)[0];
    const line = (k, v) => (v.length ? `<br><small><b>${k}:</b> ${esc(v.join(', '))}</small>` : '');
    return `<div class="row srow"><span class="nm"><b>Schwachstellen</b> <small>Elemente</small> ${el}
      ${best ? `<br><small>Am meisten zieht <b>${best.name}</b> – ${best.where.length >= 4 ? 'wirkt fast überall' : 'vor allem an: ' + esc(best.where.join(', '))}.</small>` : '<br><small>Elemente prallen ab – hier zählt rohe Kraft.</small>'}
      ${ELEM_NOTES[b.id] ? `<br><small>${esc(ELEM_NOTES[b.id])}</small>` : ''}
      ${line('Weiche Stellen', w.soft)}${line('Zäh (wenig Schaden)', w.hard)}${line('Brechbar', w.breakable)}${line('Stumpf betäubt an', w.stun)}
      <br><small>Gift und Rost wirken bei jedem Brocken (Status-Aufbau).</small>${tactics ? `<br><small><b>Teilbruch-Plan</b></small>${tactics}` : ''}</span></div>`;
  }
  const markSeen = (id) => { const b = BESTIARY.find((x) => x.id === id); if (!b) return; const n = unlockedEntries(b, fightsOf(id)).length; if ((ctx.save.bookSeen?.[id] ?? 0) < n) { ctx.save.bookSeen = { ...(ctx.save.bookSeen ?? {}), [id]: n }; return true; } return false; };

  function look() {
    const s = ctx.save;
    return `<div class="fg two"><div class="fg-l"><div class="fg-tabs">${tabsHtml()}</div><div class="fg-scroll">
        <div class="note">„Na, wer ist denn das?“ – der Spiegel, zerkratzt, aber ehrlich.</div>
        <div class="row"><label class="nm" for="st-name">Name</label><input id="st-name" class="inp" maxlength="12" value="${esc(s.name)}" autocomplete="off"></div>
        <div class="sub">Farbe <small>(Vorschau live, Figur drehen per Wischen)</small></div><div class="swatches">${PLAYER_COLORS.map((c) => `<button class="sw${c === s.color ? ' on' : ''}" style="background:${c}" data-a="color" data-k="${c}" aria-label="Farbe"></button>`).join('')}</div>
        </div></div>
      <div class="fg-p">${previewSlot(true)}<div class="fi-h pn" style="color:${s.color}"><b>${esc(s.name)}</b> <small>JR ${s.jr}</small></div></div></div>`;
  }

  function deathHtml() {
    const top = deathlog.top(5);
    const list = top.length ? top.map((e) => `<div class="row srow"><span class="nm"><b>${esc(prettyAttack(e.a))}</b><br><small>${esc(monsters[e.m]?.name ?? e.m)}${e.q ? ` · davon ${e.q}× schnell (Kette/kurze Vorwarnung)` : ''}</small></span><span class="num">${e.n}× umgekippt</span></div>`).join('') : '<div class="note">Noch kein KO. Respekt.</div>';
    return `<div class="sub">Tod-Log</div><div class="note">Woran du am häufigsten umkippst – hilft uns, unfaire Angriffe zu finden.</div>${list}<div class="row"><button class="btn small" data-a="dlexport">Exportieren</button></div>`;
  }

  function statsView() {
    const s = ctx.save, st = s.stats;
    const tile = (k, v) => `<div class="stile"><b>${v}</b><small>${k}</small></div>`;
    const tiles = [['Jagden', st.hunts], ['Siege', st.wins], ['Niederlagen', st.fails], ['KOs', st.kos], ['Zerlegt', st.carves], ['Hergestellt', st.crafted], ['Glitch-Konter', st.glitch], ['Spielzeit', hhmm(st.playtime)]];
    const rows = questList().map((q) => {
      const kills = q.monster ? (s.kills[q.monster] ?? 0) : (s.clears[q.id] ?? 0);
      const best = s.best[q.id];
      return `<div class="row srow"><span class="nm"><b>${esc(q.name)}</b><br><small>${q.monster ? esc(monsters[q.monster]?.name ?? q.monster) + ' besiegt' : 'Abgeschlossen'}</small></span><span class="num">×${kills}</span><span class="chip ${best ? 'ok' : ''}">${best ? mmss(best) : '–:––'}</span></div>`;
    }).join('');
    return `<div class="fg-tabs">${tabsHtml()}</div><div class="stile-grid">${tiles.map(([k, v]) => tile(k, v)).join('')}</div>
      <div class="sub">Brocken &amp; Bestzeiten</div>${rows}${deathHtml()}`;
  }

  // ---- Glitch-Stufen: Splitter, geschaffte Stufen, Bestzeiten je Brocken x Stufe (N = normaler Auftrag)
  function glitchView() {
    const s = ctx.save, tile = (k, v) => `<div class="stile"><b>${v}</b><small>${k}</small></div>`, mons = tierQuestIds().map((id) => questById(id));
    const tiles = [['Glitch-Splitter', `◆ ${s.glitch?.splitter ?? 0}`], ['Stufe 5 geschafft', `${monstersClearedAt(s, 5)}/${mons.length}`], ['Stufe 10 geschafft', `${monstersClearedAt(s, 10)}/${mons.length}`], ['Wochen-Glitch', s.glitch?.weekly === weeklyQuest().weekly ? 'geholt' : 'offen']];
    const rows = mons.map((q) => {
      const cl = tierClearedOf(s, q.monster), un = tierUnlocked(s, q.monster);
      const cells = Array.from({ length: MAX_TIER + 1 }, (_, t) => { const b = bestTime(s, q, t); return `<span class="gt${b ? ' on' : t <= un ? ' open' : ''}"><i>${t === 0 ? 'N' : 'S' + t}</i>${b ? mmss(b) : t <= un ? '·' : 'zu'}</span>`; }).join('');
      return `<div class="row srow gr"><span class="nm"><b>${esc(mName(q.monster) ?? q.monster)}</b> <small>${un ? `geschafft bis Stufe ${cl}${cl >= MAX_TIER ? ' (Max)' : ''}` : 'noch nicht besiegt'}</small></span><div class="gtimes">${cells}</div></div>`;
    }).join('');
    return `<div class="fg-tabs">${tabsHtml()}</div><div class="stile-grid">${tiles.map(([k, v]) => tile(k, v)).join('')}</div>
      <div class="sub">Bestzeiten je Brocken &amp; Glitch-Stufe</div>${rows}
      <div class="note">Splitter: jeder Sieg auf Glitch-Stufe gibt Stufe × ${SPLITTER_FACTOR}, dazu der Wochen-Glitch. Ausgeben in der Schmiede: Übertaktung.</div>`;
  }

  const tabsHtml = () => `<div class="tabs">${[['look', 'Aussehen'], ['stats', 'Erfolge'], ['glitch', 'Glitch ◆'], ['book', `Kompendium${bookNew() ? ' ●' : ''}`]].map(([k, n]) => `<button class="tab${k === tab ? ' on' : ''}" data-a="tab" data-k="${k}">${n}</button>`).join('')}</div>`;

  return {
    render: () => (tab === 'look' ? look() : tab === 'book' ? bookView() : tab === 'glitch' ? glitchView() : statsView()),
    after(body) {
      body.classList.toggle('fit', tab === 'look');
      const slot = body.querySelector('[data-gpv]');
      if (!slot) { pv?.dispose(); pv = null; return; }
      if (pv?.dead) pv = null;
      pv ??= new GearPreview({ big: true });
      pv.set(makeGear(buildLoadout(ctx.save)));
      pv.attach(slot);
    },
    dispose() { pv?.dispose(); pv = null; if (tab === 'book' && markSeen(bookSel)) ctx.commit(); },
    input(e) {
      if (e.target.id !== 'st-name') return false;
      ctx.save.nameSet = true;
      ctx.save.name = cleanName(e.target.value || 'Pirscher');
      ctx.commit();
      return false; // do not re-render while typing
    },
    click(a, d) {
      if (a === 'color') { ctx.save.color = d.k; ctx.commit(); } else if (a === 'tab') { if (tab === 'book' && d.k !== 'book' && markSeen(bookSel)) ctx.commit(); tab = d.k; }
      else if (a === 'book') { const prev = bookSel; bookSel = d.k; if (prev !== d.k && markSeen(prev)) ctx.commit(); } // NEU verschwindet, sobald man die Seite verlässt
      else if (a === 'dlexport') { try { navigator.clipboard?.writeText(deathlog.exportText((id) => monsters[id]?.name ?? id)); ctx.toast('Tod-Log kopiert.'); } catch { ctx.toast('Kopieren ging nicht.', true); } }
    },
  };
}

// ============================================================ Optionen
export function createOptionen(ctx) {
  let code = '', confirm = false;
  let closeEditor = null;
  let off = null;
  return {
    after(body) { bindInstall(body); if (!off) off = onInstallChange(() => ctx.rerender()); },
    dispose() { closeEditor?.(); off?.(); off = null; },
    render() {
      const on = (b) => (b ? 'an' : 'aus');
      return `<div class="row"><span class="nm">Auflösung</span><button class="btn small" data-a="res">${settings.autoRes ? 'Auto' : settings.res + ' px'}</button></div>
        <div class="row"><span class="nm">Scanlines</span><button class="btn small" data-a="scan">${on(settings.scanlines)}</button></div>
        <div class="row"><span class="nm">Schadenszahlen</span><button class="btn small" data-a="dmg">${{ all: 'Alle', own: 'Eigene', off: 'Aus' }[normDmgMode(settings.dmgNumbers)]}</button></div>
        <div class="row"><span class="nm">Eigene Treffer betonen</span><button class="btn small" data-a="clarity">${on(settings.combatClarity)}</button></div>
        <div class="row"><span class="nm">Ruhigere Bildschirm-Effekte</span><button class="btn small" data-a="calm">${on(settings.calmEffects)}</button></div>
        <div class="row"><span class="nm">Hinweise bei blockierten Eingaben</span><button class="btn small" data-a="feedback">${on(settings.inputFeedback)}</button></div>
        <div class="row"><span class="nm">Steuerungs-Tipps in der Jagd</span><button class="btn small" data-a="tips">${on(!settings.tipsSeen)}</button></div>
        <div class="row"><span class="nm">Kamera-Abstand</span><span class="seg">${[['N', 'nah'], ['M', 'mittel'], ['W', 'weit']].map(([k, l]) => `<button class="btn small ${settings.camDist === k ? 'on' : ''}" data-a="camd" data-v="${k}">${l}</button>`).join('')}</span></div>
        <div class="sub">Layout (Touch)</div>
        <div class="row"><span class="nm">Tasten verschieben & Deckkraft</span><button class="btn small" data-a="touchEdit">Anpassen</button></div>
        <div class="row"><span class="nm">Tastengröße</span><span class="seg">${['S', 'M', 'L'].map((k) => `<button class="btn small ${settings.btnSize === k ? 'on' : ''}" data-a="bsz" data-v="${k}">${k}</button>`).join('')}</span></div>
        <div class="row"><span class="nm">Linkshänder (spiegeln)</span><button class="btn small" data-a="lefty">${on(settings.leftHand)}</button></div>
        <div class="row"><span class="nm">Joystick</span><button class="btn small" data-a="stk">${settings.stickMode === 'fixed' ? 'bleibt fest' : 'folgt Daumen'}</button></div>
        <div class="row"><span class="nm">Vibration</span><button class="btn small" data-a="hap">${on(settings.haptics)}</button></div>
        <div class="note">Lock: tippen = an/aus. Lock-Taste hoch/runter wischen = nächster/voriger Körperteil (Taste F/V, Pad: R3).</div>
        <div class="row"><span class="nm">Musik</span><button class="btn small" data-a="mus">${on(settings.musicOn !== false)}</button></div>
        <div class="row"><span class="nm">Musik-Lautstärke</span><span class="seg">${[0, 25, 50, 75, 100].map((k) => `<button class="btn small ${Math.round((settings.musicVolume ?? 0.5) * 100) === k ? 'on' : ''}" data-a="musv" data-v="${k}">${k}</button>`).join('')}</span></div>
        <div class="row"><span class="nm">Lautstärke</span><input id="st-vol" class="inp rng" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></div>
        ${ctx.adapter?.hunt ? '' : `<div class="sub">Spielstand-Code (Schutz gegen gelöschten Browserspeicher)</div>
        <textarea id="st-code" class="inp code" rows="3" placeholder="Code hier einfügen" spellcheck="false">${esc(code)}</textarea>
        <div class="row"><button class="btn small" data-a="export">Exportieren</button><button class="btn small go" data-a="import">Importieren</button><button class="btn small" data-a="copy">Kopieren</button></div>
        <div class="row"><button class="btn small ${confirm ? 'red' : ''}" data-a="reset">${confirm ? 'Wirklich alles löschen?' : 'Spielstand löschen'}</button></div>`}
        <div class="sub">App installieren</div><div class="inst">${installHtml()}</div>
        <div class="note">Speicherschlüssel: ${SAVE_KEY}</div>`;
    },
    input(e) {
      if (e.target.id === 'st-vol') { sfx.setVolume(Number(e.target.value)); saveSettings(); }
      if (e.target.id === 'st-code') code = e.target.value;
      return false;
    },
    click(a, ds) {
      const app = ctx.app;
      if (a === 'touchEdit') { closeEditor = openTouchEditor(app); return false; }
      if (ctx.adapter?.hunt && (a === 'import' || a === 'reset' || a === 'export' || a === 'copy')) return false; // never touch the save mid-hunt
      if (a !== 'reset') confirm = false;
      if (a === 'res') { // Auto -> 360 -> 480 -> 640 -> 800 -> Auto
        if (settings.autoRes) { settings.autoRes = false; app.renderer.setResolution(360); }
        else if (settings.res < 800) app.renderer.setResolution(nextRes(settings.res));
        else { settings.autoRes = true; app.renderer.setResolution(640); }
        saveSettings();
      }
      else if (a === 'tips') { settings.tipsSeen = !settings.tipsSeen; settings.tipsShown = 0; saveSettings(); }
      else if (a === 'scan') { settings.scanlines = !settings.scanlines; document.body.classList.toggle('scan', settings.scanlines); saveSettings(); }
      else if (a === 'bsz') { settings.btnSize = ds?.v === 'S' || ds?.v === 'L' ? ds.v : 'M'; saveSettings(); app.touch?.relayout(); }
      else if (a === 'mus') { settings.musicOn = settings.musicOn === false; saveSettings(); music.refresh(); }
      else if (a === 'musv') { settings.musicVolume = Math.max(0, Math.min(100, Number(ds?.v) || 0)) / 100; saveSettings(); music.refresh(); }
      else if (a === 'camd') { settings.camDist = ['N', 'W'].includes(ds?.v) ? ds.v : 'M'; saveSettings(); }
      else if (a === 'stk') { settings.stickMode = settings.stickMode === 'fixed' ? 'follow' : 'fixed'; saveSettings(); }
      else if (a === 'lefty') { settings.leftHand = !settings.leftHand; saveSettings(); app.touch?.relayout(); }
      else if (a === 'hap') { settings.haptics = !settings.haptics; saveSettings(); if (settings.haptics) navigator.vibrate?.(15); }
      else if (a === 'dmg') { settings.dmgNumbers = nextDmgMode(settings.dmgNumbers); saveSettings(); }
      else if (a === 'clarity') { settings.combatClarity = !settings.combatClarity; saveSettings(); }
      else if (a === 'calm') { settings.calmEffects = !settings.calmEffects; document.body.classList.toggle('calm-effects', settings.calmEffects); saveSettings(); }
      else if (a === 'feedback') { settings.inputFeedback = !settings.inputFeedback; saveSettings(); }
      else if (a === 'export') { code = exportCode(ctx.save); ctx.toast('Code erzeugt. Gut aufbewahren.'); }
      else if (a === 'copy') { try { navigator.clipboard?.writeText(code || exportCode(ctx.save)); ctx.toast('Kopiert.'); } catch { ctx.toast('Kopieren ging nicht – markiere den Code.', true); } }
      else if (a === 'import') {
        const r = importCode(code);
        if (r.ok) { ctx.store.set(r.save); code = ''; ctx.toast('Spielstand geladen.'); } else ctx.toast(r.error, true);
      } else if (a === 'reset') {
        if (!confirm) confirm = true;
        else { ctx.store.reset(); confirm = false; ctx.toast('Alles weg. Frisch angefangen.'); }
      }
    },
  };
}
