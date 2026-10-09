import * as THREE from 'three';
import { createBus } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { time } from '../core/time.js';
import { createFx } from '../render/fx.js';
import { createCameraRig } from '../render/camera.js';
import { createDebugViz } from '../render/debugviz.js';
import { createHud } from '../ui/hud.js';
import { Player } from './player.js';
import { Monster } from './monsters/monster.js';
import { getMonsterDef } from './monsters/index.js';
import { createWorld } from './world/index.js';
import { getQuest } from '../data/quests.js';
import { resolvePlayerHit, applyMonsterHit } from './combat.js';
import { sfx } from '../audio/sfx.js';
import { HuntNet } from '../net/sync.js'; // [N]

const MAX_KO = 3;

/**
 * A hunt session. Also serves as the `ctx` for entities (see docs/ARCHITECTURE.md "Hunt context").
 * opts: { quest:'jaggo', weapon:'gs', seed:1, god:false, nofx:false, aggro:false, solo:true, name }
 */
export class Hunt {
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.input = app.input;
    this.bus = createBus();
    this.seed = Number(opts.seed ?? 1);
    this.rng = createRng(this.seed);
    this.quest = getQuest(opts.quest ?? 'jaggo');
    this.timeLeft = this.quest.timeLimit;
    this.time = 0;
    this.teamKo = 0;
    this.result = null; // 'win' | 'fail'
    this.paused = false;
    this.net = null; // [N] HuntNet in coop (hunt.net: isHost, send, on, peers), null in solo
    this.players = [];
    this.monsters = [];
    this.stats = { damage: 0, hits: 0, perfect: 0 };
    this._n = 0;
    this._lastRender = performance.now();

    this.scene = new THREE.Scene();
    this.world = createWorld(this.quest.world);
    const env = this.world.env;
    this.scene.background = new THREE.Color(env.background);
    this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near, env.fog.far);
    this.scene.add(this.world.mesh);

    this.camera = new THREE.PerspectiveCamera(60, app.renderer.aspect, 0.1, 170);
    this.rig = createCameraRig(this.camera, (x, z) => this.world.heightAt(x, z));
    this.fx = createFx({ scene: this.scene, camera: this.camera, nofx: !!opts.nofx });
    this.viz = createDebugViz(this.scene);
    this._onResize = (aspect) => { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);

    const sp = this.world.spawnPoints[(opts.slot ?? 0) % this.world.spawnPoints.length]; // [N] slot = lobby position
    const p = new Player({ id: opts.playerId ?? 'p1', name: opts.name ?? 'Pirscher', weapon: opts.weapon ?? 'gs', tier: opts.tier ?? 1, ctx: this });
    p.god = !!opts.god;
    p.spawnAt(sp.x, sp.z, sp.yaw);
    this.players.push(p);
    this.player = p;
    this.scene.add(p.mesh, p.rig.shadow);
    this.rig.snap(p.pos, sp.yaw);

    const ms = this.world.monsterSpawns?.[this.quest.monster] ?? this.world.monsterSpawns.default;
    this.mainMonster = this.spawnMonster(this.quest.monster, { x: ms.x, z: ms.z, yaw: Math.PI, state: opts.aggro ? 'combat' : 'wander', id: this.quest.monster });
    if (opts.aggro) { this.mainMonster.target = p; this.mainMonster.discovered = true; this.mainMonster.recover = 0.8; }

    this.hud = createHud(app.ui);
    this.bus.on('sfx', (e) => {
      let vol = 1;
      if (e.pos) { const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z); vol = 1 / (1 + d / 25); }
      sfx.play(e.name, { ...e, vol });
    });
    this.bus.on('playerDown', () => this.#onPlayerDown());
    this.bus.on('glitchCounter', () => { this.stats.perfect++; });
    this.bus.on('monsterDead', ({ monster }) => { if (monster === this.mainMonster) this.#onBossDead(); });
    this.bus.on('monsterState', ({ monster, state }) => {
      if (monster === this.mainMonster && state === 'notice') this.hud.banner(monster.def.name, 3);
      if (state === 'enrage') this.hud.center('Rotglut!', 1.5);
    });
    this.bus.on('partBreak', ({ monster, part }) => this.hud.center(`${monster.partById[part].label} gebrochen!`, 1.5));
    this.bus.on('glitchCounter', () => this.hud.center('Glitch-Konter!', 1));
    // forward to app bus for other modules (net, meta)
    this.bus.on('*', (payload, type) => app.bus?.emit(type, payload));
    this.#applyUiSettings();
    app.touch?.setVisible(true);
    // [N] coop: remote pirscher, monster sync, events (opts.net comes from the lobby)
    if (opts.net) { opts.coop = true; this.net = new HuntNet(this, opts.net, opts); }
  }

  // ---------- ctx API used by entities
  get cameraYaw() { return this.rig.yaw; }
  get localPlayers() { return this.players.filter((p) => p.local); }
  countMonsters(defId) { return this.monsters.filter((m) => m.alive && m.def.id === defId).length; }
  debugShape(shape, color) { this.viz.shape(shape, color); }

  spawnMonster(defId, { x, z, yaw = 0, state = 'wander', id } = {}) {
    const def = getMonsterDef(defId);
    const m = new Monster(def, this, { id: id ?? `${defId}-${++this._n}`, x, z, yaw, state, seed: this.rng.int(1, 1e9) });
    if (state === 'combat') m.discovered = true;
    this.monsters.push(m);
    this.scene.add(m.mesh, m.shadow);
    return m;
  }

  respawn(player) {
    const c = this.world.campPoint;
    player.respawn(c.x, c.z);
    this.rig.snap(player.pos, player.rot);
    this.hud.center('Zurück im Lager', 1.2);
  }

  playerHit(player, monster, hp, ah) {
    const st = player.stats;
    const attacker = { power: st.power, critChance: st.crit, elems: st.elems, glitch: ah.glitch, sauber: ah.sauber, dmgMul: player.dmgMul };
    const res = resolvePlayerHit(attacker, ah.hit, hp.part, this.rng, { sleeping: monster.sleeping });
    res.attackerId = player.id;
    applyMonsterHit(monster, res, this);
    const at = { x: hp.pos.x, y: hp.pos.y, z: hp.pos.z };
    this.fx.spark(at, res.weak ? 14 : 9, res.weak ? '#ffe14d' : '#ffffff', 5);
    this.fx.number({ x: at.x, y: at.y + 0.6, z: at.z }, res.dmg, res.weak ? 'weak' : res.crit ? 'crit' : 'hit');
    this.fx.shake(ah.hit.shake ?? res.shake, 0.2);
    if (ah.sauber) { this.fx.flash('rgba(255,225,70,.3)', 0.2); this.fx.number({ x: at.x, y: at.y + 1.4, z: at.z }, 'Sauber!', 'weak'); }
    this.bus.emit('sfx', { name: res.hitstop >= 0.1 ? 'heavy' : 'hit', pos: at });
    player.afterHit(res, ah);
    this.stats.damage += res.dmg;
    this.stats.hits++;
    this.bus.emit('hit', { player, monster, part: hp.part.id, ...res });
  }

  // Hooks for the meta agent (items, gathering, carving). Default: nothing.
  onItem(/* player, action ('use'|'next'|'prev'|'slot'), slot */) {}
  onContext(/* player, 'press'|'hold' */) {}

  // ---------- flow
  #onPlayerDown() {
    if (this.net?.isGuest) { this.net.sendKo(); return; } // [N] the host counts team KOs
    this.#countKo();
  }
  /** [N] host: a guest went down. */
  netKo() { if (!this.result) this.#countKo(); }
  /** [N] guest: the host decided the hunt. */
  netFinish(result, reason) { this.#finish(result, reason); }
  /** [N] guest: the host is gone -> message + back. */
  netAbort(message) {
    if (this.result) return;
    this.result = 'abort';
    this.reason = message;
    this.overlay?.remove();
    const ov = document.createElement('div');
    ov.className = 'screen ui-hit';
    ov.innerHTML = `<div class="panel"><h2>${message}</h2><p>Gesammeltes bleibt erhalten.</p><button class="btn">Zurück</button></div>`;
    ov.querySelector('button').addEventListener('click', () => this.#leave());
    this.app.ui.appendChild(ov);
    this.overlay = ov;
  }
  #leave() { // [N] back to the town/room (hub when it exists, else the debug lobby for coop, else title)
    for (const name of this.opts.coop ? ['hub', 'lobby', 'title'] : ['hub', 'title']) { try { return this.app.goto(name); } catch { /* scene missing */ } }
  }
  #toggleLeave() {
    if (this.leaveEl) { this.leaveEl.remove(); this.leaveEl = null; return; }
    if (this.result) return;
    const ov = document.createElement('div');
    ov.className = 'screen ui-hit';
    ov.innerHTML = '<div class="panel"><h2>Jagd verlassen?</h2><button class="btn" data-a="go">Weiter</button><button class="btn red" data-a="quit">Verlassen</button></div>';
    ov.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (a === 'go') this.#toggleLeave();
      if (a === 'quit') this.#leave();
    });
    this.app.ui.appendChild(ov);
    this.leaveEl = ov;
  }
  #countKo() {
    this.teamKo++;
    this.hud.center(`Umgekippt! ${this.teamKo}/${MAX_KO}`, 2);
    if (this.teamKo >= MAX_KO) this.#finish('fail', 'Dreimal umgekippt');
  }
  #onBossDead() {
    for (const m of this.monsters) if (m !== this.mainMonster && m.alive) m.applyDamage({ dmg: 9999, partId: m.parts[0].id, elemDmg: 0 });
    this.winTimer = 2.2;
  }
  #finish(result, reason = '') {
    if (this.result) return;
    this.result = result;
    this.reason = reason;
    if (this.net?.isHost) this.net.sendEnd(result, reason); // [N]
    this.bus.emit(result === 'win' ? 'questComplete' : 'questFailed', { quest: this.quest, time: this.quest.timeLimit - this.timeLeft, reason, stats: this.stats });
    if (this.opts.noOverlay) return;
    const ov = document.createElement('div');
    ov.className = 'screen ui-hit';
    ov.innerHTML = `<div class="panel"><h2>${result === 'win' ? 'Auftrag erfüllt' : 'Auftrag gescheitert'}</h2>
      <p>${result === 'win' ? `${this.quest.name} in ${Math.floor((this.quest.timeLimit - this.timeLeft) / 60)}:${String(Math.floor((this.quest.timeLimit - this.timeLeft) % 60)).padStart(2, '0')}.<br>Schrott gibt es später. Jetzt Daumen hoch.` : `${reason || 'Zeit abgelaufen'}.<br>Nächstes Mal mit mehr Rollen.`}</p>
      <button class="btn">Weiter</button></div>`;
    ov.querySelector('button').addEventListener('click', () => this.#leave()); // [N]
    this.app.ui.appendChild(ov);
    this.overlay = ov;
  }

  setPaused(v) {
    if (this.result) return;
    this.paused = v;
    if (v) {
      const ov = document.createElement('div');
      ov.className = 'screen ui-hit';
      ov.innerHTML = '<div class="panel"><h2>Pause</h2><button class="btn" data-a="go">Weiter</button><button class="btn red" data-a="quit">Aufgeben</button></div>';
      ov.addEventListener('click', (e) => {
        const a = e.target.dataset?.a;
        if (a === 'go') this.setPaused(false);
        if (a === 'quit') this.app.goto('title');
      });
      this.app.ui.appendChild(ov);
      this.pauseEl = ov;
    } else { this.pauseEl?.remove(); this.pauseEl = null; }
  }

  #applyUiSettings() {
    document.body.classList.toggle('scan', this.app.settings.scanlines && !this.opts.nofx);
  }

  update(dt) {
    this.input.poll(dt);
    if (this.input.b.menu.pressed) { if (this.opts.coop) this.#toggleLeave(); else this.setPaused(!this.paused); } // [N] coop never pauses
    if (this.paused) return;
    this.time += dt;
    this.viz.begin();
    if (!this.result) this.timeLeft -= dt;
    const authoritative = !this.net || this.net.isHost; // [N] guests take quest state from the host
    this.net?.update(dt); // [N]
    if (authoritative && this.timeLeft <= 0 && !this.result) this.#finish('fail', 'Zeit abgelaufen');
    if (this.winTimer > 0) { this.winTimer -= dt; if (this.winTimer <= 0 && authoritative) this.#finish('win'); }

    for (const p of this.players) { if (p.local) p.update(dt); else p.updateRemote(dt); } // [N]
    for (const m of this.monsters) { if (m.authority) m.update(dt); else m.tickRemote(dt); } // [N]
    this.world.update(dt, this);

    const p = this.player;
    this.fx.update(dt);
    this.rig.update(dt, {
      playerPos: p.pos, playerYaw: p.rot, moving: p.speed > 1, camInput: this.input.takeCamera(),
      lockPos: p.lockPoint(), shake: this.fx.shakeOffset,
    });
    this.viz.end();
    this.app.input.contextLabel = this.contextLabel ?? null;
    this.app.input.itemLabel = this.itemLabel ?? '';
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastRender) / 1000);
    this._lastRender = now;
    this.fx.updateNumbers(dt);
    this.hud.update(this, dt);
    const lp = this.player.lockPoint();
    if (lp) {
      const v = new THREE.Vector3(lp.x, lp.y, lp.z).project(this.camera);
      this.hud.lock(v.z < 1 ? { x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5 } : null);
    } else this.hud.lock(null);
    this.app.touch?.update();
    this.app.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.app.renderer.onResize.delete(this._onResize);
    this.fx.dispose();
    this.hud.dispose();
    this.overlay?.remove();
    this.pauseEl?.remove();
    this.leaveEl?.remove(); // [N]
    this.net?.dispose(); // [N]
    this.app.touch?.setVisible(false);
    this.input.reset();
    this.input.contextLabel = null;
    time.reset();
    this.bus.clear();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    document.body.classList.remove('scan');
  }
}
