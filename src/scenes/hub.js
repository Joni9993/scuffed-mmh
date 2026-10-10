import * as THREE from 'three';
import { music } from '../audio/music.js';
import { shareJoinLink } from '../meta/sharelink.js';
import { createBus } from '../core/events.js';
import { createCameraRig } from '../render/camera.js';
import { Player } from '../game/player.js';
import { buildHunterRig } from '../game/rig.js';
import { mountOnBack } from '../game/gear/backMount.js';
import { createTown } from '../game/town/world.js';
import { labelSprite } from '../game/town/npc.js';
import { SPAWNS, pickStation, stationById } from '../game/town/layout.js';
import { FLOW, flowStart, flowNext, resetLifecycle } from '../game/town/flow.js';
import { EMOTES, EMOTE_SECS, emoteWire, emoteText } from '../game/town/emotes.js';
import { createTownHud } from '../ui/townHud.js';
import { saveStore, PLAYER_COLORS } from '../meta/save.js';
import { buildLoadout } from '../meta/loadout.js';
import { makeGear, encodeGear, decodeGear } from '../data/gearlook.js'; // [G]
import { openStation, closeStation, isStationOpen } from '../ui/stations.js';
import { session, createHuntChannel } from '../net/session.js';
import { getQuestBoard } from '../net/questboard.js';
import { Presence } from '../net/presence.js';
import { normalizeCode, isValidCode, ERR } from '../net/protocol.js';
import { settings } from '../core/settings.js';
import { sfx } from '../audio/sfx.js';
import '../ui/hub.css';

// [T] Rostnest: the walkable 3D town (replaces the temporary menu hub). Panels come from ui/stations.js.

/** Survives scene changes: are we inside the town session (coming back from a hunt)? */
export const townState = { entered: false, mode: 'solo' };

const IDLE = { down: false, pressed: false, released: false, heldMs: 0, lastHeldMs: 0 };
const ZERO = { x: 0, y: 0 };
const NOFX = { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} };

/** Player-facing input: movement + roll only; attacks/lock/items are idle. Everything is zero while `blocked()`. */
function townInput(input, blocked) {
  return {
    get move() { return blocked() ? ZERO : input.move; },
    get sprint() { return !blocked() && input.sprint; },
    b: { attack: IDLE, special: IDLE, lock: IDLE, lockNext: IDLE, lockPrev: IDLE, item: IDLE, itemNext: IDLE, itemPrev: IDLE, context: IDLE, menu: IDLE, get roll() { return blocked() ? IDLE : input.b.roll; } },
    takeSlot: () => -1,
    takeCamera: () => input.takeCamera(),
  };
}

/** Town look for a Player: merged rig in the member colour, neutral pose, weapon on the back. */
function townify(p, color) {
  if (color || !p._townRig) {
    p.rig = buildHunterRig({ merged: true, color: color ?? p.gear?.color ?? '#5ad8ff', gear: p.gear }); // [G] armor + weapon tier looks
    p.mesh = p.rig.root;
    p._townRig = true;
  }
  mountWeapon(p);
}
function mountWeapon(p) {
  const base = Object.getPrototypeOf(p.def) !== Object.prototype && p.def._town ? Object.getPrototypeOf(p.def) : p.def;
  p.def = Object.assign(Object.create(base), { rest: {}, updateMesh: undefined, rollOverride: undefined, speedMul: undefined, hand: undefined, sprintArx: undefined, _town: true });
  p.rig.swapWeapon(null);
  if (p.backSlot) p.backSlot.parent?.remove(p.backSlot);
  p.backSlot = mountOnBack(p.rig, p.weaponMesh, p.weaponId); // real mesh at scale 1, per-weapon back socket
}

export const hubScene = {
  enter(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.t = 0;
    music.setScene('hub');
    this.offs = [];
    this.err = '';
    this.members = new Map(); // remote id -> { player, tag, bubble, bubbleT, lastN }
    this.colors = new Map();
    this.emoteN = 0; this.emoteUntil = 0; this.emoteId = 0;
    this.menuEl = null; this.choiceEl = null;
    resetLifecycle(this); // hubScene is a singleton: exit() sets dead/starting, enter() must clear them
    this.busyPrev = new Set();
    this.prevMembers = null;
    this.lastCalls = 0;

    const fresh = !!opts.fresh;
    if (fresh) { townState.entered = false; session.leave(); townState.mode = 'solo'; }
    const mode = opts.mode === 'host' || opts.mode === 'join' || opts.mode === 'solo' ? opts.mode : null;
    const save = saveStore.get();
    if (opts.name && !save.nameSet) save.name = String(opts.name).slice(0, 12); // debug URL ?name=

    // ---- world + player
    this.world = createTown();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.world.env.background);
    this.scene.fog = new THREE.Fog(this.world.env.fog.color, this.world.env.fog.near, this.world.env.fog.far);
    this.scene.add(this.world.mesh);
    this.camera = new THREE.PerspectiveCamera(60, app.renderer.aspect, 0.1, 260);
    this.rig = createCameraRig(this.camera, (x, z) => this.world.heightAt(x, z));
    this._onResize = (a) => { this.camera.aspect = a; this.camera.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);

    this.bus = createBus();
    this.detachSfx = sfx.attach(this);
    this.ctx = {
      world: this.world, monsters: [], players: [], bus: this.bus, fx: NOFX, rng: Math.random,
      input: townInput(app.input, () => this.blocked()), get cameraYaw() { return hubScene.rig.yaw; },
      respawn() {}, playerHit() {},
    };
    this.cameraYaw = 0;
    const lo = save.loadout.weapon;
    const gear0 = makeGear(buildLoadout(save)); // [G] what the town shows (armor per slot, weapon tier/branch, colour)
    const p = new Player({ id: 'me', name: save.name, weapon: lo, tier: save.weapons[lo]?.tier ?? 1, branch: save.weapons[lo]?.branch ?? null, gear: gear0, ctx: this.ctx });
    this._gearCode = encodeGear(gear0, Math.max(0, PLAYER_COLORS.indexOf(save.color)));
    this.player = p;
    townify(p, save.color);
    this.colors.set('applied', save.color);
    this.scene.add(p.mesh, p.rig.shadow);
    this.spawn(0);
    this.rig.snap(p.pos, p.rot);
    this.colors.set(session.myId, save.color);

    // ---- net + board
    this.board = getQuestBoard(session);
    this.presence = new Presence(session);
    this.offs.push(this.board.onStart((st) => this.beginHunt(st)));
    this.offs.push(this.board.onChange(() => this.onBoardChange()));
    this.offs.push(session.on('members', () => this.onMembers()));
    this.offs.push(session.on('peer-leave', ({ name }) => this.toast(`${name} ist gegangen`)));
    this.offs.push(session.on('closed', ({ reason }) => { townState.mode = 'solo'; this.toast(reason, 5000); this.refreshRoom(); }));
    if (this.board.state.busy.has(session.myId)) this.board.returned();
    this.busyPrev = new Set(this.board.state.busy);
    this.panelAdapter = this.makePanelAdapter();

    // ---- HUD
    document.body.classList.add('town');
    document.body.classList.toggle('scan', settings.scanlines && !opts.nofx);
    this.hud = createTownHud(app.ui, {
      onMenu: () => this.toggleMenu(),
      onEmote: (i) => this.emote(i),
      onShare: () => { shareJoinLink(session.code).then((r) => this.toast(r === 'shared' ? 'Link geteilt' : r === 'copied' ? 'Link kopiert' : 'Teilen ging nicht')); },
      onCopy: () => { try { navigator.clipboard?.writeText?.(session.code ?? ''); } catch { /* no clipboard */ } this.toast('Code kopiert'); },
    });
    this.syncProfile();

    // ---- flow
    const wasEntered = townState.entered;
    if (townState.entered && townState.mode === 'room' && session.role === 'solo') { townState.mode = 'solo'; this.toast(ERR.roomClosed, 5000); }
    this.flow = flowStart({ nameSet: !!save.nameSet, entered: wasEntered && !fresh, mode });
    this.enterFlow(mode, opts.code);
    this.api = this.makeApi();
  },

  // ---------------------------------------------------------------- flow / overlays
  enterFlow(mode, code) {
    const app = this.app;
    if (this.flow === FLOW.NAME) {
      app.touch.setVisible(false);
      openStation('spiegel', app, { onClose: () => { const s = saveStore.get(); s.nameSet = true; saveStore.flush(); this.syncProfile(); this.go('nameDone'); } });
    } else if (this.flow === FLOW.CHOICE) this.showChoice();
    else if (this.flow === FLOW.CONNECTING) this.connect(mode, code);
    else this.startTown();
  },
  go(ev) {
    this.flow = flowNext(this.flow, ev);
    this.choiceEl?.remove(); this.choiceEl = null;
    if (this.flow === FLOW.CHOICE) this.showChoice();
    else if (this.flow === FLOW.JOIN) this.showChoice(true);
    else if (this.flow === FLOW.TOWN) this.startTown();
  },
  showChoice(joinPrompt = false, busy = '') {
    this.choiceEl?.remove();
    this.app.touch.setVisible(false);
    this.hud.setVisible(false);
    const el = document.createElement('div');
    el.className = 'screen';
    const err = esc(busy || this.err);
    el.innerHTML = joinPrompt
      ? `<div class="panel ui-hit town-panel"><h2>Rostnest beitreten</h2>
          <input class="codein ui-hit" maxlength="4" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="ABCD" aria-label="Raumcode">
          <div class="err">${err}</div>
          <button class="btn red" data-a="go">Los</button><button class="btn small" data-a="back">Zurück</button></div>`
      : `<div class="panel ui-hit town-panel"><h2>Rostnest</h2>
          <button class="btn red" data-a="host">Eigenes Rostnest</button>
          <button class="btn" data-a="joinPrompt">Rostnest beitreten</button>
          <button class="btn small" data-a="solo">Solo</button>
          <div class="err">${err}</div></div>`;
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      sfx.unlock(); sfx.play('ui');
      this.err = '';
      if (a === 'solo') { townState.mode = 'solo'; this.go('solo'); }
      else if (a === 'host') { this.flow = flowNext(this.flow, 'host'); this.connect('host'); }
      else if (a === 'joinPrompt') this.go('joinPrompt');
      else if (a === 'back') this.go('back');
      else if (a === 'go') this.tryJoin(el.querySelector('input').value);
    });
    const inp = el.querySelector('input');
    if (inp) {
      inp.addEventListener('input', () => { inp.value = normalizeCode(inp.value); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.tryJoin(inp.value); });
    }
    this.app.ui.appendChild(el);
    this.choiceEl = el;
  },
  tryJoin(raw) {
    const code = normalizeCode(raw);
    if (!isValidCode(code)) { this.err = ERR.badCode; this.showChoice(true); return; }
    this.flow = flowNext(this.flow, 'join');
    this.connect('join', code);
  },
  async connect(kind, code) {
    this.showChoice(kind === 'join', kind === 'join' ? `Raum ${code} …` : 'Raum wird erstellt …');
    try {
      if (kind === 'host') await session.host(); else await session.join(normalizeCode(code));
      if (this.dead) return;
      townState.mode = 'room';
      this.go('ok');
    } catch (e) {
      if (this.dead) return;
      this.err = e.message || ERR.server;
      this.flow = flowNext(this.flow, 'fail');
      this.choiceEl?.remove();
      this.showChoice(kind === 'join');
      if (kind === 'join') this.flow = FLOW.JOIN;
    }
  },
  startTown() {
    this.choiceEl?.remove(); this.choiceEl = null;
    townState.entered = true;
    this.flow = FLOW.TOWN;
    this.hud.setVisible(true);
    this.app.touch.setVisible(true);
    this.refreshRoom();
    this.onMembers();
    const slot = Number(String(session.myId).slice(1)) || 0;
    this.spawn(slot);
    if (this.opts?.fromTraining) { const ts = stationById('training'); this.player.spawnAt(ts.x, ts.z - 1.2, 0); } // zurück vom Übungsplatz: an die Puppe
    this.rig.snap(this.player.pos, this.player.rot);
  },
  spawn(slot) {
    const s = SPAWNS[slot % SPAWNS.length];
    this.player.spawnAt(s.x, s.z, s.yaw);
  },

  toast(t, ms) { this.hud?.toast(t, ms); },
  blocked() { return this.flow !== FLOW.TOWN || isStationOpen() || !!this.menuEl; },

  toggleMenu() {
    if (this.flow !== FLOW.TOWN || isStationOpen()) return;
    if (this.menuEl) { this.menuEl.remove(); this.menuEl = null; this.app.touch.setVisible(true); return; }
    this.app.touch.setVisible(false);
    this.app.input.reset();
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `<div class="panel ui-hit town-panel"><h2>Menü</h2>
      <button class="btn" data-a="opt">Optionen</button>
      <button class="btn" data-a="title">${session.role === 'solo' ? 'Zum Titel' : 'Raum verlassen'}</button>
      <button class="btn red" data-a="back">Weiter</button></div>`;
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      sfx.unlock(); sfx.play('ui');
      if (a === 'back') this.toggleMenu();
      else if (a === 'opt') { this.menuEl.remove(); this.menuEl = null; this.openPanel('optionen'); }
      else if (a === 'title') { townState.entered = false; session.leave(); this.app.goto('title'); }
    });
    this.app.ui.appendChild(el);
    this.menuEl = el;
  },

  // ---------------------------------------------------------------- stations
  makePanelAdapter() {
    const board = this.board;
    return {
      getPosted: () => board.getPosted().map((p) => ({
        id: p.postId, quest: p.questId, mutators: p.mutators ?? [], host: p.hostName, joined: p.joined, mine: p.hostId === session.myId,
        members: p.members.map((m) => ({ name: m.name, ready: m.ready, me: m.id === session.myId })),
      })),
      post: (q, mu) => board.post(q, mu),
      join: (id) => board.join(id),
      unpost: () => board.leavePost(),
      setReady: (b) => board.setReady(b),
      onChange: (fn) => board.onChange(fn),
    };
  },
  openPanel(id) {
    this.hud.closeWheel();
    openStation(id, this.app, {
      adapter: id === 'auftragsbrett' ? this.panelAdapter : undefined,
      onClose: () => {
        if (this.dead) return;
        this.app.input.reset();
        if (this.flow === FLOW.TOWN) this.app.touch.setVisible(true);
        this.syncProfile();
      },
    });
    // suspend world input AFTER openStation: it closes a previous panel first, whose onClose would re-enable the controls
    this.app.touch.setVisible(false);
    this.app.input.reset();
  },
  stationLabel(st) {
    if (!st) return null;
    if (st.id !== 'tor') return st.label;
    const my = this.board.myPost();
    return !my ? 'Abflugtor' : my.ready ? 'Wartet …' : 'Bereit';
  },
  activate(st) {
    sfx.unlock(); sfx.play('ui');
    if (st.id === 'training') this.beginTraining();
    else if (st.id === 'tor') {
      const my = this.board.myPost();
      if (!my) this.toast('Erst am Auftragsbrett einen Auftrag posten.');
      else if (!my.ready) { this.board.setReady(true); this.toast('Bereit!'); }
      else this.toast('Warte auf die anderen …');
    } else this.openPanel(st.panel);
  },

  // ---------------------------------------------------------------- session / board events
  syncProfile() {
    const s = saveStore.get(), w = s.loadout.weapon, tier = s.weapons[w]?.tier ?? 1, branch = s.weapons[w]?.branch ?? null;
    // [G] gear = what everybody sees: armor per slot + weapon type/tier/branch + colour (compact code for the network)
    const gear = makeGear(buildLoadout(s)), code = encodeGear(gear, Math.max(0, PLAYER_COLORS.indexOf(s.color)));
    session.setProfile({ name: s.name, weapon: w, tier, gear: code });
    this.colors.set(session.myId, s.color);
    const p = this.player;
    if (p.name !== s.name) p.name = s.name;
    if (p.weaponId !== w || p.stats == null || this._tier !== tier || this._branch !== branch) {
      this._tier = tier; this._branch = branch;
      p.gear = gear;
      p.setWeapon(w, tier, branch); townify(p, null);
    }
    if (this._gearCode !== code || this.colors.get('applied') !== s.color) {
      this._gearCode = code;
      this.colors.set('applied', s.color);
      p.gear = gear;
      p.rig.setGear(gear);
    }
  },
  refreshRoom() {
    this.hud?.setRoom({ code: session.code, solo: session.role === 'solo' });
    this.onMembers();
  },
  onMembers() {
    if (!this.hud) return;
    const list = session.members;
    const busy = this.board.state.busy;
    this.hud.setMembers(list.map((m) => ({ name: m.name, color: this.colors.get(m.id) ?? m.color, hunting: busy.has(m.id) })));
    if (this.prevMembers) for (const m of list) if (!this.prevMembers.has(m.id) && !m.you) this.toast(`${m.name} ist da`);
    this.prevMembers = new Set(list.map((m) => m.id));
    this.hud.setRoom({ code: session.code, solo: session.role === 'solo' });
  },
  onBoardChange() {
    const busy = this.board.state.busy;
    const went = [...busy].filter((id) => !this.busyPrev.has(id) && id !== session.myId).map((id) => session.member(id)?.name ?? '?');
    const back = [...this.busyPrev].filter((id) => !busy.has(id) && id !== session.myId).map((id) => session.member(id)?.name ?? '?');
    if (went.length) this.toast(`${went.join(', ')} ${went.length > 1 ? 'sind' : 'ist'} auf der Jagd`, 4500);
    else if (back.length) this.toast(`${back.join(', ')} ${back.length > 1 ? 'sind' : 'ist'} zurück`);
    this.busyPrev = new Set(busy);
    this.onMembers();
  },

  /** Trainingspuppe: Übungsplatz, immer solo/lokal (auch im Raum), mit der aktuellen Ausrüstung. */
  beginTraining() {
    if (this.starting) return;
    this.starting = true;
    closeStation();
    const save = saveStore.get(), loadout = buildLoadout(save), o = this.opts;
    this.app.goto('hunt', { quest: 'training', training: true, seed: 1, loadout, name: save.name, weapon: loadout.weapon.type, tier: loadout.weapon.tier, god: true, nofx: o.nofx });
  },

  /** Quest board says: go. Mirrors lobby.js _begin(). */
  beginHunt(st) {
    if (this.starting) return;
    this.starting = true;
    closeStation();
    const save = saveStore.get(), loadout = buildLoadout(save), o = this.opts;
    const base = { quest: st.questId, mutators: st.mutators ?? [], seed: st.seed, loadout, name: save.name, weapon: loadout.weapon.type, tier: loadout.weapon.tier, god: o.god, nofx: o.nofx };
    if (session.role === 'solo') { this.app.goto('hunt', { ...base, aggro: o.aggro }); return; }
    const board = this.board;
    const channel = createHuntChannel(session, { hostId: st.hostId, members: st.members, onDispose: () => board.returned() });
    const players = st.members.map((id, slot) => { const m = session.member(id); return { id, name: m?.name ?? id, weapon: m?.weapon ?? 'gs', tier: m?.tier ?? 1, gear: id === session.myId ? this._gearCode : this.presence.sample(id)?.gear ?? m?.gear, slot }; }); // [G] freshest known outfit (presence beats the join-time roster)
    const slot = st.members.indexOf(session.myId);
    this.app.goto('hunt', { ...base, net: channel, players, playerId: session.myId, slot: Math.max(0, slot), coop: true, aggro: st.hostId === session.myId ? o.aggro : false });
  },

  // ---------------------------------------------------------------- emotes
  emote(i) {
    const id = emoteWire(i);
    if (!id || this.flow !== FLOW.TOWN) return;
    this.emoteId = id; this.emoteN++; this.emoteUntil = this.t + EMOTE_SECS + 0.3;
    this.showBubble(this.player, id);
    this.localBubbleT = EMOTE_SECS;
    sfx.play('ui');
  },
  showBubble(p, id, rec) {
    const text = emoteText(id);
    if (!text) return;
    const holder = rec ?? this;
    if (holder.bubble) { holder.bubble.parent?.remove(holder.bubble); holder.bubble.material.map?.dispose(); holder.bubble.material.dispose(); }
    const b = labelSprite(text, { color: '#ffffff', scale: 0.5 });
    b.position.y = 2.95;
    p.mesh.add(b);
    holder.bubble = b;
    holder.bubbleT = EMOTE_SECS;
  },
  tickBubble(holder, dt) {
    if (!holder.bubble) return;
    holder.bubbleT -= dt;
    if (holder.bubbleT <= 0) { holder.bubble.parent?.remove(holder.bubble); holder.bubble.material.map?.dispose(); holder.bubble.material.dispose(); holder.bubble = null; }
  },

  // ---------------------------------------------------------------- remote members
  syncRemotes(dt) {
    const ids = this.presence.remotes();
    for (const [id, rec] of [...this.members]) if (!ids.includes(id)) this.dropRemote(id, rec);
    for (const id of ids) {
      const s = this.presence.sample(id);
      if (!s) continue;
      let rec = this.members.get(id);
      const col = PLAYER_COLORS[session.member(id)?.colorIdx ?? s.color] ?? PLAYER_COLORS[0]; // room-resolved distinct colour
      if (!rec) rec = this.addRemote(id, s, col);
      const p = rec.player, hunting = this.board.state.busy.has(id);
      p.pos.set(s.x, s.y, s.z);
      p.rot = s.rot;
      const r = p.remote;
      r.speed = s.speed; r.sprint = s.speed > 7;
      r.state = s.anim === 'roll' ? 'roll' : 'free';
      r.rollT = r.state === 'roll' ? ((r.rollT ?? 0) + dt) % 0.6 : 0;
      p.updateRemote(dt);
      p.mesh.visible = !hunting; p.rig.shadow.visible = !hunting; // after the animate step (it forces visible)
      const dg = s.gear ? decodeGear(s.gear) : null; // [G] remote outfit (backward compatible: no code -> weapon type only)
      if (dg) {
        if (rec.gearCode !== s.gear) {
          rec.gearCode = s.gear;
          const w = dg.weapon;
          p.gear = makeGear({ ...dg, color: col });
          if (p.weaponId !== w.type || p.gear.weapon.tier !== rec.wTier || rec.wBranch !== w.branch) { rec.wTier = w.tier; rec.wBranch = w.branch; p.setWeapon(w.type, w.tier, w.branch); townify(p, null); p.rig.setGear(p.gear); } else p.rig.setGear(p.gear);
        }
      } else if (s.weapon && s.weapon !== p.weaponId) { p.setWeapon(s.weapon, session.member(id)?.tier ?? 1); townify(p, null); }
      if (s.emote && s.emoteN !== rec.lastN) { rec.lastN = s.emoteN; this.showBubble(p, s.emote, rec); }
      this.colors.set(id, col);
      this.tickBubble(rec, dt);
    }
  },
  addRemote(id, s, col) {
    const m = session.member(id);
    const dg = s.gear ? decodeGear(s.gear) : null; // [G]
    const p = new Player({ id, name: m?.name ?? id, weapon: dg?.weapon.type ?? s.weapon ?? m?.weapon ?? 'gs', tier: dg?.weapon.tier ?? m?.tier ?? 1, branch: dg?.weapon.branch ?? null, gear: dg ? { ...dg, color: col } : { color: col }, local: false, ctx: this.ctx });
    p.remote = { state: 'free', rollT: 0, sprint: false, speed: 0, wp: null, air: 0 };
    p.rig = buildHunterRig({ merged: true, color: col, gear: p.gear });
    p.mesh = p.rig.root;
    p._townRig = true;
    mountWeapon(p);
    const tag = labelSprite(m?.name ?? id, { color: col, scale: 0.3 });
    tag.position.y = 2.4;
    p.mesh.add(tag);
    this.scene.add(p.mesh, p.rig.shadow);
    const rec = { player: p, tag, bubble: null, bubbleT: 0, lastN: -1, gearCode: s.gear ?? null, wTier: p.gear.weapon.tier, wBranch: p.gear.weapon.branch };
    this.members.set(id, rec);
    this.onMembers();
    return rec;
  },
  dropRemote(id, rec) {
    this.scene.remove(rec.player.mesh, rec.player.rig.shadow);
    this.members.delete(id);
  },

  // ---------------------------------------------------------------- frame
  update(dt) {
    const app = this.app, input = app.input;
    input.poll(dt);
    this.t += dt;
    this.cameraYaw = this.rig.yaw;
    const p = this.player;
    if (input.b.menu.pressed) { if (!isStationOpen()) this.toggleMenu(); }
    const slot = input.takeSlot();
    if (slot >= 0 && slot < EMOTES.length) this.emote(slot);

    let st = null;
    if (!this.blocked()) {
      st = pickStation(p.pos.x, p.pos.z);
      if (st && input.b.context.pressed) this.activate(st);
    }
    // stamina is free in town (rolls, sprint)
    p.v.stamina = p.v.maxStamina; p.v.exhaust = 0;
    p.update(dt);
    this.world.update(dt, p.pos.x, p.pos.z);
    this.world.markStation(st);
    input.contextLabel = this.stationLabel(st);
    this.hud.setHint(input.hasTouch || !st ? '' : `[E] ${this.stationLabel(st)}`);

    this.presence.update(dt, {
      x: p.pos.x, y: p.pos.y, z: p.pos.z, rot: p.rot, anim: p.state === 'roll' ? 'roll' : null, speed: p.speed,
      emote: this.t < this.emoteUntil ? this.emoteId : 0, emoteN: this.emoteN, color: Math.max(0, PLAYER_COLORS.indexOf(saveStore.get().color)), weapon: p.weaponId, gear: this._gearCode,
    });
    this.syncRemotes(dt);
    this.tickBubble(this, dt);

    // camera
    if (this.flow === FLOW.TOWN) {
      this.rig.update(dt, { playerPos: p.pos, playerYaw: p.rot, moving: p.speed > 1, camInput: this.blocked() ? (input.takeCamera(), ZERO0) : input.takeCamera(), lockPos: null, shake: null });
      this.pullCamera();
    } else {
      input.takeCamera();
      const a = this.t * 0.18;
      this.camera.position.set(Math.sin(a) * 16, 6.5, Math.cos(a) * 16 - 2);
      this.camera.lookAt(0, 1.8, -1);
    }
  },
  pullCamera() {
    const f = this.rig.focus, c = this.camera.position;
    if (!this.world.cameraBlocked(c.x, c.y, c.z)) return;
    const dx = c.x - f.x, dy = c.y - f.y, dz = c.z - f.z;
    for (let k = 0.9; k >= 0.2; k -= 0.1) {
      const x = f.x + dx * k, y = f.y + dy * k, z = f.z + dz * k;
      if (!this.world.cameraBlocked(x, y, z)) { c.set(x, y, z); break; }
      if (k < 0.25) c.set(x, y, z);
    }
    this.camera.lookAt(f.x, f.y, f.z);
  },
  render() {
    this.app.touch?.update();
    this.app.renderer.render(this.scene, this.camera);
    this.lastCalls = this.app.renderer.renderer.info.render.calls;
  },

  makeApi() {
    const self = this;
    return {
      get flow() { return self.flow; },
      get player() { return self.player; },
      get world() { return self.world; },
      get stations() { return self.world.stations; },
      get lastCalls() { return self.lastCalls; },
      get session() { return session; },
      get board() { return self.board; },
      get remotes() { return [...self.members].map(([id, r]) => ({ id, x: r.player.pos.x, z: r.player.pos.z, visible: r.player.mesh.visible, bubble: !!r.bubble })); },
      get bubble() { return !!self.bubble; },
      get nearStation() { return pickStation(self.player.pos.x, self.player.pos.z)?.id ?? null; },
      teleport(x, z, yaw = self.player.rot) { self.player.spawnAt(x, z, yaw); self.rig.snap(self.player.pos, yaw); },
      toStation(id) { const s = stationById(id); this.teleport(s.x, s.z - 0.5, 0); },
      open(id) { self.openPanel(id); },
      emote: (i) => self.emote(i),
      activate() { const st = pickStation(self.player.pos.x, self.player.pos.z); if (st) self.activate(st); return st?.id ?? null; },
    };
  },

  exit() {
    this.dead = true;
    music.setScene(null);
    for (const f of this.offs) f();
    this.presence.dispose();
    closeStation();
    this.menuEl?.remove(); this.choiceEl?.remove();
    this.hud.dispose();
    this.detachSfx?.();
    this.app.renderer.onResize.delete(this._onResize);
    this.app.touch?.setVisible(false);
    this.app.input.reset();
    this.app.input.contextLabel = null;
    document.body.classList.remove('town');
    this.world.dispose();
    this.bus.clear();
  },
};

const ZERO0 = { dx: 0, dy: 0 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
