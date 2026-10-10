// Station panels B: Kochtopf, Auftragsbrett, Spiegel, Optionen.
import { MUTATORS, MUTATOR_ORDER, MAX_MUTATORS, resolveMods, rewardLabel } from '../data/mutators.js';
import { FOODS, FOOD_ORDER } from '../data/foods.js';
import { questList } from '../data/quests.js';
import { registerFieldStudy, getBestTime, FIELDSTUDY_ID } from '../meta/fieldstudy.js';
import { monsters } from '../game/monsters/index.js';
import { cookMeal } from '../meta/crafting.js';
import { missing } from '../meta/inventory.js';
import { questLock, isKeyQuest, rankProgress, questById } from '../meta/progression.js';
import { buildLoadout } from '../meta/loadout.js';
import { installHtml, bindInstall, onInstallChange } from './install.js';
import { PLAYER_COLORS, cleanName, importCode, exportCode, SAVE_KEY } from '../meta/save.js';
import { settings, saveSettings, nextRes } from '../core/settings.js';
import { sfx } from '../audio/sfx.js';
import { music } from '../audio/music.js';
import { deathlog, prettyAttack } from '../meta/deathlog.js';
import { esc, costChips, reasonText } from './hubKit.js';
import { iconHtml } from './hubIcons.js';
import { GearPreview, previewSlot } from './gearPreview.js';
import { makeGear } from '../data/gearlook.js';

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
    post(questId, mutators = []) { post = { id: 'local', quest: questId, mutators, host: name(), members: [{ name: name(), ready: false, me: true }], joined: true, mine: true }; emit(); },
    join() {},
    unpost() { post = null; emit(); },
    setReady(b) {
      if (!post) return;
      post.members[0].ready = !!b; emit();
      if (b && post.members.length === 1) start(post.quest, post.mutators);
    },
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function startSolo(app, store, questId, mutators = []) {
  const save = store.get();
  app.goto('hunt', { quest: questId, mutators, loadout: buildLoadout(save), name: save.name, seed: (Math.random() * 1e9) | 0 });
}

export function createBrett(ctx) {
  const adapter = ctx.adapter ?? createLocalBoard({ name: () => ctx.save.name, start: (q, mu) => { ctx.close(); startSolo(ctx.app, ctx.store, q, mu); } });
  const unsub = adapter.onChange?.(() => ctx.rerender());
  let sel = null, info = null;
  const chosen = []; // 0-2 Mutatoren fuer den naechsten Posten
  const mutHtml = (ids) => ids.map((i) => MUTATORS[i]).filter(Boolean).map((m) => `${esc(m.name)}${rewardLabel(m) ? ` (${rewardLabel(m)})` : ''}`).join(' · ');
  return {
    dispose() { unsub?.(); },
    render() {
      const s = ctx.save;
      const fs = registerFieldStudy(), fsBest = getBestTime(fs.fieldStudy);
      const list = [fs, ...questList()].map((q) => {
        const isFs = q.id === FIELDSTUDY_ID;
        const lock = questLock(s, q), open = !lock, key = isKeyQuest(q, s), avail = !q.monster || !!monsters[q.monster];
        const done = s.clears[q.id] ?? 0;
        return `<div class="row quest${open && avail ? '' : ' lock'}${sel === q.id ? ' sel' : ''}${isFs ? ' fieldstudy' : ''}"${isFs ? ' style="border:1px solid #ffd040;background:rgba(255,208,64,.12)"' : ''} data-a="qsel" data-k="${q.id}">
          <span class="nm">${isFs ? '<small>★ Wochenauftrag</small><br>' : ''}<b>${esc(q.name)}</b>${key ? ` <small class="keyq" style="color:#ffd040">Rang-Auftrag → JR ${q.jrUp}</small>` : ''} ${isFs ? `<small>(${esc(q.monster)})</small>` : ''}${done ? ` <small>✓${done}</small>` : ''}<br><small>${open ? (avail ? esc(q.desc) + (isFs ? ` Mutatoren: ${mutHtml(q.mutators)}. Bestzeit: ${fsBest ? mmss(fsBest) : '–'}` : '') : 'Dieser Brocken ist noch nicht im Rostnest angekommen.') : lock.reason === 'rp' ? `Noch ${lock.need} RP.` : `Jägerrang ${lock.need} nötig.`}</small></span>
          <span class="chip ok">${iconHtml('schrott')}${q.reward}</span>${q.rp ? `<span class="chip">+${q.rp} RP</span>` : ''}
          ${open && avail ? `<button class="btn small go" data-a="post" data-k="${q.id}">Posten</button>` : '<span class="lockm">gesperrt</span>'}</div>`;
      }).join('');
      const posted = adapter.getPosted();
      const postedHtml = posted.length ? posted.map((p) => {
        const q = [registerFieldStudy(), ...questList()].find((x) => x.id === p.quest);
        const me = p.members.find((m) => m.me);
        const alone = p.members.length <= 1;
        return `<div class="card post"><b>${esc(q?.name ?? p.quest)}</b> <small>von ${esc(p.host)}</small>
          ${(p.mutators?.length || q?.mutators?.length) ? `<div class="note">Mutatoren: ${mutHtml(p.mutators?.length ? p.mutators : q.mutators)}</div>` : ''}<div class="note">${p.members.map((m) => `${esc(m.name)}${m.ready ? ' ✓' : ''}`).join(' · ')}</div>
          ${p.joined ? `<button class="btn small go" data-a="ready" data-k="${p.id}" data-r="${me?.ready ? 0 : 1}">${me?.ready ? 'Nicht bereit' : alone ? 'Los!' : 'Bereit'}</button>${p.mine ? `<button class="btn small" data-a="unpost">Zurückziehen</button>` : ''}`
          : `<button class="btn small go" data-a="join" data-k="${p.id}">Beitreten</button>`}</div>`;
      }).join('') : '<div class="note">Niemand hat etwas gepostet. Sei der Erste.</div>';
      const chips = MUTATOR_ORDER.map((id) => { const m = MUTATORS[id], on = chosen.includes(id);
        return `<button class="mtile${on ? ' on' : ''}" aria-pressed="${on}" data-a="mut" data-k="${id}"><span class="mt-n">${on ? '✓ ' : ''}${esc(m.name)}</span><span class="mt-r">${esc(rewardLabel(m))}</span></button>`; }).join('');
      const focus = info ?? chosen[chosen.length - 1];
      const infoLine = `<div class="mt-info">${focus && MUTATORS[focus] ? `<b>${esc(MUTATORS[focus].name)}:</b> ${esc(MUTATORS[focus].desc)}` : 'Tippe einen Mutator an: Wirkung und Bonus erscheinen hier.'}</div>`;
      const mb = `<div class="sub">Mutatoren (optional) <small>${chosen.length}/${MAX_MUTATORS} gewählt${chosen.length ? ' · ' + esc(rewardLabel(resolveMods(chosen))) : ''}</small></div><div class="muts">${chips}</div>${infoLine}`;
      const pb = `<div class="sub">Gepostete Aufträge</div>${postedHtml}`, qb = `<div class="sub">Aufträge · ${rankLine(s)}</div>${list}${mb}`;
      return posted.length ? pb + qb : qb + pb; // posts first once something is posted
    },
    click(a, d) {
      if (a === 'qsel') { sel = d.k; return true; }
      if (a === 'mut') { info = d.k; const i = chosen.indexOf(d.k); if (i >= 0) chosen.splice(i, 1); else { if (chosen.length >= MAX_MUTATORS) chosen.shift(); chosen.push(d.k); } return true; }
      if (a === 'post') { adapter.post(d.k, d.k === FIELDSTUDY_ID ? [] : [...chosen]); return true; } // Feldstudie: feste Mutatoren stecken im Auftrag
      if (a === 'join') { adapter.join(d.k); return true; }
      if (a === 'unpost') { adapter.unpost?.(); return true; }
      if (a === 'ready') { adapter.setReady(d.r === '1'); return true; }
      return false;
    },
  };
}

function rankLine(s) {
  const { next, rp } = rankProgress(s);
  if (!next) return `JR ${s.jr} · RP ${rp} (Höchstrang)`;
  const k = next.keys.map((id) => questById(id).name).join(' oder ');
  return `JR ${s.jr} · RP ${rp}/${next.rp} – nächster Rang: ${esc(k)} besiegen`;
}

// ============================================================ Spiegel (Aussehen + Erfolge)
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hhmm = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min`);

export function createSpiegel(ctx) {
  let tab = 'look', pv = null;

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

  const tabsHtml = () => `<div class="tabs">${[['look', 'Aussehen'], ['stats', 'Erfolge']].map(([k, n]) => `<button class="tab${k === tab ? ' on' : ''}" data-a="tab" data-k="${k}">${n}</button>`).join('')}</div>`;

  return {
    render: () => (tab === 'look' ? look() : statsView()),
    after(body) {
      body.classList.toggle('fit', tab === 'look');
      const slot = body.querySelector('[data-gpv]');
      if (!slot) { pv?.dispose(); pv = null; return; }
      if (pv?.dead) pv = null;
      pv ??= new GearPreview({ big: true });
      pv.set(makeGear(buildLoadout(ctx.save)));
      pv.attach(slot);
    },
    dispose() { pv?.dispose(); pv = null; },
    input(e) {
      if (e.target.id !== 'st-name') return false;
      ctx.save.nameSet = true;
      ctx.save.name = cleanName(e.target.value || 'Pirscher');
      ctx.commit();
      return false; // do not re-render while typing
    },
    click(a, d) {
      if (a === 'color') { ctx.save.color = d.k; ctx.commit(); } else if (a === 'tab') tab = d.k;
      else if (a === 'dlexport') { try { navigator.clipboard?.writeText(deathlog.exportText((id) => monsters[id]?.name ?? id)); ctx.toast('Tod-Log kopiert.'); } catch { ctx.toast('Kopieren ging nicht.', true); } }
    },
  };
}

// ============================================================ Optionen
export function createOptionen(ctx) {
  let code = '', confirm = false;
  let off = null;
  return {
    after(body) { bindInstall(body); if (!off) off = onInstallChange(() => ctx.rerender()); },
    dispose() { off?.(); off = null; },
    render() {
      const on = (b) => (b ? 'an' : 'aus');
      return `<div class="row"><span class="nm">Auflösung</span><button class="btn small" data-a="res">${settings.autoRes ? 'Auto' : settings.res + ' px'}</button></div>
        <div class="row"><span class="nm">Scanlines</span><button class="btn small" data-a="scan">${on(settings.scanlines)}</button></div>
        <div class="row"><span class="nm">Schadenszahlen</span><button class="btn small" data-a="dmg">${on(settings.dmgNumbers)}</button></div>
        <div class="row"><span class="nm">Steuerungs-Tipps in der Jagd</span><button class="btn small" data-a="tips">${on(!settings.tipsSeen)}</button></div>
        <div class="sub">Layout (Touch)</div>
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
      else if (a === 'stk') { settings.stickMode = settings.stickMode === 'fixed' ? 'follow' : 'fixed'; saveSettings(); }
      else if (a === 'lefty') { settings.leftHand = !settings.leftHand; saveSettings(); app.touch?.relayout(); }
      else if (a === 'hap') { settings.haptics = !settings.haptics; saveSettings(); if (settings.haptics) navigator.vibrate?.(15); }
      else if (a === 'dmg') { settings.dmgNumbers = !settings.dmgNumbers; saveSettings(); }
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
