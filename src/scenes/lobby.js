import * as THREE from 'three';
import '../ui/lobby.css';
import { session, createHuntChannel } from '../net/session.js';
import { getQuestBoard } from '../net/questboard.js';
import { normalizeCode, isValidCode, MAX_PLAYERS, ERR } from '../net/protocol.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { quests } from '../data/quests.js';
import { sfx } from '../audio/sfx.js';
import { shareJoinLink } from '../meta/sharelink.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const wname = (t) => WEAPON_TYPES[t]?.name ?? t;

/**
 * TEMPORÄR / DEBUG: Raum-Ansicht ohne Stadt. Zeigt Raumcode, Mitglieder, Auftragsbrett (aufgeben / beitreten / bereit).
 * Die begehbare Stadt ersetzt diese Szene; sie benutzt dieselbe `session` + `getQuestBoard(session)`.
 * URL: ?scene=lobby&mode=host | &mode=join&code=ABCD.   app.goto('lobby', { mode:'host'|'join', code?, quest, loadout })
 * Wenn ein Auftrag startet: app.goto('hunt', { quest, seed, net: HuntChannel, players, playerId, slot, … }).
 */
export const lobbyScene = {
  enter(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.err = '';
    this.busy = '';
    this.offs = [];
    const lo = opts.loadout;
    if (lo || opts.name || opts.weapon) {
      session.setProfile({ name: String(lo?.name ?? opts.name ?? session.profile.name).slice(0, 12), weapon: lo?.weapon?.type ?? opts.weapon ?? session.profile.weapon, tier: lo?.weapon?.tier ?? opts.tier ?? 1 });
    }
    if (session.profile.name === 'Pirscher') session.setProfile({ name: `Pirscher${Math.floor(Math.random() * 90 + 10)}` });
    this.questId = opts.quest ?? 'jaggo';
    this.board = getQuestBoard(session);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#120d1c');
    this.cam = new THREE.PerspectiveCamera(50, app.renderer.aspect, 0.1, 50);
    this._onResize = (a) => { this.cam.aspect = a; this.cam.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);

    this.el = document.createElement('div');
    this.el.className = 'screen';
    app.ui.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));

    this.offs.push(this.board.onChange(() => this._render()));
    this.offs.push(session.on('members', () => this._render()));
    this.offs.push(session.on('closed', ({ reason }) => { this.err = reason; this._render(); }));
    this.offs.push(this.board.onStart((st) => this._begin(st)));

    if (opts.mode === 'host') this._host();
    else if (opts.mode === 'join' && isValidCode(normalizeCode(opts.code))) this._join(normalizeCode(opts.code));
    else this._render();
  },

  async _host() {
    this.busy = 'Raum wird erstellt…'; this._render();
    try { await session.host(); this.err = ''; } catch (e) { this.err = e.message || ERR.server; }
    this.busy = ''; this._render();
  },
  async _join(code) {
    this.busy = `Raum ${code}…`; this._render();
    try { await session.join(code); this.err = ''; } catch (e) { this.err = e.message || ERR.server; }
    this.busy = ''; this._render();
  },

  _render() {
    if (!this.el) return;
    const typed = this.el.querySelector('input')?.value ?? this.opts.code ?? '';
    const connected = session.role !== 'solo';
    const posts = this.board.getPosted();
    const mine = posts.find((p) => p.joined);
    const members = session.members;
    const rows = members.map((m) => `<div class="row ${m.you ? 'me' : ''}"><span class="nm" style="color:${m.color}">${esc(m.name)}${m.id === 'p0' ? ' ★' : ''}</span><span class="wp">${esc(wname(m.weapon))}</span><span></span></div>`).join('');
    const postRows = posts.map((p) => `<div class="row ${p.joined ? 'me' : ''}"><span class="nm">${esc(quests[p.questId]?.name ?? p.questId)} · ${esc(p.hostName)}</span><span class="wp">${p.members.map((m) => `${esc(m.name)}${m.ready ? ' OK' : ''}`).join(', ')}</span>${p.joined ? '<span></span>' : p.full ? '<span></span>' : `<button class="btn small" data-a="join" data-id="${p.postId}">+</button>`}</div>`).join('') || '<div class="row empty"><span class="nm">kein Auftrag ausgehängt</span><span></span><span></span></div>';
    this.el.innerHTML = `<div class="panel ui-hit lobby">
      <div class="col"><h2>${connected ? 'Raumcode' : 'Eigenes Rostnest'}</h2>
        ${connected ? `<div class="code" data-code>${session.code}</div><button class="btn small" data-a="copy">Code kopieren</button> <button class="btn small" data-a="share">Link teilen</button>`
          : `<button class="btn red" data-a="host">Hosten</button>
             <input class="codein ui-hit" maxlength="4" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="ABCD" aria-label="Raumcode" value="${esc(typed)}">
             <button class="btn" data-a="join-code">Beitreten</button>`}
        <div class="err">${esc(this.busy || this.err)}</div></div>
      <div><h2>Pirscher (${members.length}/${MAX_PLAYERS})</h2><div class="list">${rows}</div>
        <h2 style="margin-top:1.4vmin">Auftragsbrett</h2><div class="list">${postRows}</div>
        <div class="actions">
          ${mine ? `<button class="btn red" data-a="ready">${mine.ready ? 'Nicht bereit' : 'Bereit'}</button><button class="btn small" data-a="leavepost">Auftrag verlassen</button>`
            : `<button class="btn red" data-a="post">Auftrag aufgeben</button>`}
          <button class="btn small" data-a="back">${connected ? 'Raum verlassen' : 'Zurück'}</button></div></div></div>`;
    const inp = this.el.querySelector('input');
    if (inp) {
      inp.addEventListener('input', () => { inp.value = normalizeCode(inp.value); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._click({ target: { dataset: { a: 'join-code' } } }); });
    }
  },

  _click(e) {
    const a = e.target.dataset?.a;
    if (!a) return;
    sfx.unlock?.(); sfx.play?.('ui');
    switch (a) {
      case 'host': this._host(); break;
      case 'join-code': {
        const code = normalizeCode(this.el.querySelector('input')?.value);
        if (!isValidCode(code)) { this.err = ERR.badCode; this._render(); break; }
        this._join(code);
        break;
      }
      case 'share': { const b = e.target; shareJoinLink(session.code).then((r) => { b.textContent = r === 'shared' ? 'Geteilt!' : r === 'copied' ? 'Link kopiert!' : 'Ging nicht'; }); break; }
      case 'copy': navigator.clipboard?.writeText?.(session.code ?? '').catch?.(() => {}); e.target.textContent = 'Kopiert!'; break;
      case 'post': this.board.post(this.questId); break;
      case 'join': this.board.join(e.target.dataset.id); break;
      case 'ready': this.board.setReady(!this.board.myPost()?.ready); break;
      case 'leavepost': this.board.leavePost(); break;
      case 'back': session.leave(); try { this.app.goto('hub'); } catch { this.app.goto('title'); } break;
    }
  },

  /** Auftrag startet: Jagd mit dem Poster als Jagd-Host, Verkehr nur zwischen den Teilnehmern. */
  _begin(st) {
    this.handedOff = true;
    const board = this.board;
    const channel = createHuntChannel(session, { hostId: st.hostId, members: st.members, onDispose: () => board.returned() });
    const players = st.members.map((id, slot) => { const m = session.member(id); return { id, name: m?.name ?? id, weapon: m?.weapon ?? 'gs', tier: m?.tier ?? 1, gear: m?.gear, slot }; });
    const slot = st.members.indexOf(session.myId);
    const o = this.opts;
    this.app.goto('hunt', {
      quest: st.questId, seed: st.seed, net: channel, players, playerId: session.myId, slot: Math.max(0, slot),
      name: session.profile.name, weapon: session.profile.weapon, tier: session.profile.tier, loadout: o.loadout, coop: true,
      god: o.god, nofx: o.nofx, aggro: st.hostId === session.myId ? o.aggro : false,
    });
  },

  exit() {
    for (const f of this.offs) f();
    this.app.renderer.onResize.delete(this._onResize);
    this.el.remove();
    this.el = null;
  },
  update() {},
  render() { this.app.renderer.render(this.scene, this.cam); },
};
