// Station panels B: Kochtopf, Auftragsbrett, Spiegel, Optionen.
import { FOODS, FOOD_ORDER } from '../data/foods.js';
import { questList } from '../data/quests.js';
import { monsters } from '../game/monsters/index.js';
import { cookMeal } from '../meta/crafting.js';
import { missing } from '../meta/inventory.js';
import { questUnlocked } from '../meta/progression.js';
import { buildLoadout } from '../meta/loadout.js';
import { PLAYER_COLORS, cleanName, importCode, exportCode, SAVE_KEY } from '../meta/save.js';
import { settings, saveSettings } from '../core/settings.js';
import { sfx } from '../audio/sfx.js';
import { esc, costChips, reasonText } from './hubKit.js';
import { iconHtml } from './hubIcons.js';

// ============================================================ Kochtopf
export function createKochtopf(ctx) {
  return {
    render() {
      const s = ctx.save;
      const cur = s.meal ? FOODS[s.meal] : null;
      return `<div class="note">Brodel: „Eine Mahlzeit pro Jagd. Ich koche nicht für Nimmersatte.“</div>
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
    post(questId) { post = { id: 'local', quest: questId, host: name(), members: [{ name: name(), ready: false, me: true }], joined: true, mine: true }; emit(); },
    join() {},
    unpost() { post = null; emit(); },
    setReady(b) {
      if (!post) return;
      post.members[0].ready = !!b; emit();
      if (b && post.members.length === 1) start(post.quest);
    },
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

export function startSolo(app, store, questId) {
  const save = store.get();
  app.goto('hunt', { quest: questId, loadout: buildLoadout(save), name: save.name, seed: (Math.random() * 1e9) | 0 });
}

export function createBrett(ctx) {
  const adapter = ctx.adapter ?? createLocalBoard({ name: () => ctx.save.name, start: (q) => { ctx.close(); startSolo(ctx.app, ctx.store, q); } });
  const unsub = adapter.onChange?.(() => ctx.rerender());
  let sel = null;
  return {
    dispose() { unsub?.(); },
    render() {
      const s = ctx.save;
      const list = questList().map((q) => {
        const open = questUnlocked(s, q), avail = !q.monster || !!monsters[q.monster];
        const done = s.clears[q.id] ?? 0;
        return `<div class="row quest${open && avail ? '' : ' lock'}${sel === q.id ? ' sel' : ''}" data-a="qsel" data-k="${q.id}">
          <span class="nm"><b>${esc(q.name)}</b>${done ? ` <small>✓${done}</small>` : ''}<br><small>${open ? (avail ? esc(q.desc) : 'Dieser Brocken ist noch nicht im Rostnest angekommen.') : `Jägerrang ${q.jr} nötig.`}</small></span>
          <span class="chip ok">${iconHtml('schrott')}${q.reward}</span>
          ${open && avail ? `<button class="btn small go" data-a="post" data-k="${q.id}">Posten</button>` : '<span class="lockm">gesperrt</span>'}</div>`;
      }).join('');
      const posted = adapter.getPosted();
      const postedHtml = posted.length ? posted.map((p) => {
        const q = questList().find((x) => x.id === p.quest);
        const me = p.members.find((m) => m.me);
        const alone = p.members.length <= 1;
        return `<div class="card post"><b>${esc(q?.name ?? p.quest)}</b> <small>von ${esc(p.host)}</small>
          <div class="note">${p.members.map((m) => `${esc(m.name)}${m.ready ? ' ✓' : ''}`).join(' · ')}</div>
          ${p.joined ? `<button class="btn small go" data-a="ready" data-k="${p.id}" data-r="${me?.ready ? 0 : 1}">${me?.ready ? 'Nicht bereit' : alone ? 'Los!' : 'Bereit'}</button>${p.mine ? `<button class="btn small" data-a="unpost">Zurückziehen</button>` : ''}`
          : `<button class="btn small go" data-a="join" data-k="${p.id}">Beitreten</button>`}</div>`;
      }).join('') : '<div class="note">Niemand hat etwas gepostet. Sei der Erste.</div>';
      return `<div class="sub">Aufträge · Jägerrang ${s.jr}</div>${list}<div class="sub">Gepostete Aufträge</div>${postedHtml}`;
    },
    click(a, d) {
      if (a === 'qsel') { sel = d.k; return true; }
      if (a === 'post') { adapter.post(d.k); return true; }
      if (a === 'join') { adapter.join(d.k); return true; }
      if (a === 'unpost') { adapter.unpost?.(); return true; }
      if (a === 'ready') { adapter.setReady(d.r === '1'); return true; }
      return false;
    },
  };
}

// ============================================================ Spiegel (Name + Farbe)
export function createSpiegel(ctx) {
  return {
    render() {
      const s = ctx.save;
      return `<div class="note">„Na, wer ist denn das?“ – der Spiegel, zerkratzt, aber ehrlich.</div>
        <div class="row"><label class="nm" for="st-name">Name</label><input id="st-name" class="inp" maxlength="12" value="${esc(s.name)}" autocomplete="off"></div>
        <div class="sub">Farbe</div><div class="swatches">${PLAYER_COLORS.map((c) => `<button class="sw${c === s.color ? ' on' : ''}" style="background:${c}" data-a="color" data-k="${c}" aria-label="Farbe"></button>`).join('')}</div>
        <div class="card" style="color:${s.color}"><b>${esc(s.name)}</b> <small>Jägerrang ${s.jr}</small></div>`;
    },
    input(e) {
      if (e.target.id !== 'st-name') return false;
      ctx.save.nameSet = true;
      ctx.save.name = cleanName(e.target.value || 'Pirscher');
      ctx.commit();
      return false; // do not re-render while typing
    },
    click(a, d) {
      if (a === 'color') { ctx.save.color = d.k; ctx.commit(); }
    },
  };
}

// ============================================================ Optionen
export function createOptionen(ctx) {
  let code = '', confirm = false;
  return {
    render() {
      const on = (b) => (b ? 'an' : 'aus');
      return `<div class="row"><span class="nm">Auflösung</span><button class="btn small" data-a="res">${settings.res} px</button></div>
        <div class="row"><span class="nm">Scanlines</span><button class="btn small" data-a="scan">${on(settings.scanlines)}</button></div>
        <div class="row"><span class="nm">Schadenszahlen</span><button class="btn small" data-a="dmg">${on(settings.dmgNumbers)}</button></div>
        <div class="row"><span class="nm">Lautstärke</span><input id="st-vol" class="inp rng" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></div>
        <div class="sub">Spielstand-Code (Schutz gegen gelöschten Browserspeicher)</div>
        <textarea id="st-code" class="inp code" rows="3" placeholder="Code hier einfügen" spellcheck="false">${esc(code)}</textarea>
        <div class="row"><button class="btn small" data-a="export">Exportieren</button><button class="btn small go" data-a="import">Importieren</button><button class="btn small" data-a="copy">Kopieren</button></div>
        <div class="row"><button class="btn small ${confirm ? 'red' : ''}" data-a="reset">${confirm ? 'Wirklich alles löschen?' : 'Spielstand löschen'}</button></div>
        <div class="note">Speicherschlüssel: ${SAVE_KEY}</div>`;
    },
    input(e) {
      if (e.target.id === 'st-vol') { sfx.setVolume(Number(e.target.value)); saveSettings(); }
      if (e.target.id === 'st-code') code = e.target.value;
      return false;
    },
    click(a) {
      const app = ctx.app;
      if (a !== 'reset') confirm = false;
      if (a === 'res') { app.renderer.setResolution(settings.res === 480 ? 360 : 480); saveSettings(); }
      else if (a === 'scan') { settings.scanlines = !settings.scanlines; document.body.classList.toggle('scan', settings.scanlines); saveSettings(); }
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
