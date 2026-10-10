import * as THREE from 'three';
import { createBus } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { time } from '../core/time.js';
import { createFx } from '../render/fx.js';
import { createCameraRig } from '../render/camera.js';
import { createDebugViz } from '../render/debugviz.js';
import { createHud } from '../ui/hud.js';
import { Player } from './player.js';
import { resolveMods } from '../data/mutators.js';
import { Monster } from './monsters/monster.js';
import { getMonsterDef } from './monsters/index.js';
import { spawnPack } from './monsters/jaggling.js';
import { applyCoopScale } from './monsters/coopScale.js';
import { createWorld } from './world/index.js';
import { getQuest } from '../data/quests.js';
import { resolvePlayerHit, applyMonsterHit } from './combat.js';
import { sfx } from '../audio/sfx.js';
import * as cues from './cues.js';
// [P] meta layer: loadout, inventory, items, carving, end flow
import { HuntMeta, resolveLoadout } from './huntmeta.js';
import { Effects } from './effects.js';
import { Projectiles } from './projectiles.js'; // [W]
import { HuntNet } from '../net/sync.js'; // [N]
import { makeGear } from '../data/gearlook.js'; // [G]
import { spawnFauna } from './fauna.js'; // [L]
import { createAmbientFauna } from './ambientFauna.js'; // [L]
import { openStation, closeStation } from '../ui/stations.js';

const MAX_KO = 3;

/**
 * A hunt session. Also serves as the `ctx` for entities (see docs/ARCHITECTURE.md "Hunt context").
 * opts: { quest:'jaggo', weapon:'gs', seed:1, god:false, nofx:false, aggro:false, solo:true, name }
 */
const _lockV = new THREE.Vector3(); // [B] perf: no per-frame allocation
export const REAP_MINOR = 8, REAP_MAJOR = 70; // seconds dead before removal (> CARVE_WINDOW 45)
export class Hunt {
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.input = app.input;
    this.bus = createBus();
    this.seed = Number(opts.seed ?? 1);
    this.rng = createRng(this.seed);
    this.quest = getQuest(opts.quest ?? 'jaggo');
    this.mods = resolveMods([...(this.quest.mutators ?? []), ...(opts.mutators ?? [])]); // GDD 16.5; Brocken lesen ctx.mods.monster
    this.boardMods = resolveMods(opts.mutators ?? []); // nur die vor Abflug gewaehlten (Beute-Bonus; feste Quest-Mutatoren stecken schon in quest.matMul)
    this.timeLimit = this.quest.timeLimit * (this.mods.hunt.timeMul ?? 1);
    this.timeLeft = this.timeLimit;
    this.time = 0;
    this.teamKo = 0;
    this.result = null; // 'win' | 'fail'
    this.paused = false;
    this.panelOpen = false; // a station panel (camp chest / options) is up: world input is suspended
    this.net = null; // [N] HuntNet in coop (hunt.net: isHost, send, on, peers), null in solo
    this.players = [];
    this.monsters = [];
    this.stats = { damage: 0, hits: 0, perfect: 0, kos: 0 };
    this._n = 0;
    this._lastRender = performance.now();

    this.scene = new THREE.Scene();
    this.world = createWorld(opts.world || this.quest.world || 'schotterklamm', { seed: this.seed }); // [K] world id override (?world=arena) + hunt seed
    const env = this.world.env;
    this.scene.background = new THREE.Color(env.background);
    const fogK = this.mods.hunt.fog ?? 1; // >1 = dichter
    this.scene.fog = new THREE.Fog(env.fog.color, env.fog.near / fogK, env.fog.far / fogK);
    this.scene.add(this.world.mesh);

    this.camera = new THREE.PerspectiveCamera(60, app.renderer.aspect, 0.1, 170);
    this.rig = createCameraRig(this.camera, (x, z) => this.world.heightAt(x, z), (pt, r) => this.world.collide(pt, r));
    this.fx = createFx({ scene: this.scene, camera: this.camera, nofx: !!opts.nofx });
    this.viz = createDebugViz(this.scene);
    // [W] generic projectile system (arrows, later monster projectiles)
    this.projectiles = new Projectiles(this);
    this.scene.add(this.projectiles.group);
    this._onResize = (aspect) => { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);

    const sp = this.world.spawnPoints[(opts.slot ?? 0) % this.world.spawnPoints.length]; // [N] slot = lobby position
    // [P] loadout from the hub (or standard gear for the debug URL)
    const lo = resolveLoadout(opts);
    this.loadout = lo;
    const p = new Player({ id: opts.playerId ?? 'p1', name: lo.name ?? opts.name ?? 'Pirscher', weapon: lo.weapon.type, tier: lo.weapon.tier, branch: lo.weapon.branch, gear: makeGear(lo), ctx: this }); // [G] gear looks
    p.god = !!opts.god;
    if (this.mods.player.staminaMul) p.v.regenMul = this.mods.player.staminaMul;
    p.spawnAt(sp.x, sp.z, sp.yaw);
    this.players.push(p);
    this.player = p;
    this.scene.add(p.mesh, p.rig.shadow);
    this.rig.snap(p.pos, sp.yaw);

    const ms = this.world.monsterSpawns?.[this.quest.monster] ?? this.world.monsterSpawns.default;
    // [P] gather quests have no Brocken (quest.monster = null)
    this.mainMonster = this.quest.monster ? this.spawnMonster(this.quest.monster, { x: ms.x, z: ms.z, yaw: Math.PI, state: opts.aggro ? 'combat' : 'wander', id: this.quest.monster }) : null;
    if (this.mainMonster) this.#applyQuestVariant(this.mainMonster);
    // [B] ambient Jagglinge packs in zones 1 + 2 (host/solo only; guests get them through the monster snapshots)
    if (!opts.noAmbient && (!opts.net || opts.net.isHost)) this.#spawnAmbient(ms);
    this.herds = []; // [L] neutral fauna (Mampfer herds, Hoppler groups); host/solo only, ?nofauna=1 disables
    if (!opts.noFauna && (!opts.net || opts.net.isHost)) { const f = spawnFauna(this); this.herds = [...f.herds, ...f.groups]; }
    this.ambientFauna = opts.noFauna ? null : createAmbientFauna(this); // [L] birds / glow bugs / butterflies (decoration only, local)
    if (this.ambientFauna) this.scene.add(this.ambientFauna.group);
    if (opts.aggro && this.mainMonster) { this.mainMonster.target = p; this.mainMonster.discovered = true; this.mainMonster.recover = 0.8; }

    this.hud = createHud(app.ui);
    sfx.attach(this); // [K] bus 'sfx' -> positional/panned WebAudio, jingles
    this._detachCues = cues.attach(this); // Lesbarkeit: Windup-Ton, Farbcue, Auto-Framing, Tod-Log
    this.bus.on('playerDown', () => this.#onPlayerDown());
    this.bus.on('glitchCounter', (e) => { if (!e?.player || e.player.local) this.stats.perfect++; });
    this.bus.on('playerDown', (e) => { if (!e?.player || e.player.local) this.stats.kos++; });
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
    // [P]
    this.effects = new Effects(this);
    this.meta = new HuntMeta(this, lo);
    // [N] coop: remote pirscher, monster sync, events (opts.net comes from the lobby)
    if (opts.net) { opts.coop = true; this.net = new HuntNet(this, opts.net, opts); this.applyCoopScale(); }
  }

  /** [B] 2 packs (2-3 Jagglinge) in each of zone 1 (Wackelwiese) and zone 2 (Knochengrube); never near camp / spawns / the Brocken. */
  #spawnAmbient(bossSpawn) {
    const w = this.world, L = w.layout;
    if (w.id !== 'schotterklamm' || !w.zones) return;
    const rng = createRng((this.seed ^ 0xa11b) >>> 0);
    const placed = [];
    const far = (x, z, o, d) => !o || Math.hypot(x - o.x, z - o.z) >= d;
    for (const zone of [1, 1, 2, 2]) {
      const zc = w.zones[zone - 1];
      if (!zc) continue;
      for (let t = 0; t < 60; t++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 42;
        const x = zc.x + Math.cos(a) * r, z = zc.z + Math.sin(a) * r;
        if (w.zoneAt(x, z) !== zone) continue;
        if (L && !(L.walkable(x, z, 1.5) && L.reachable(x, z))) continue;
        if (!far(x, z, w.campPoint, 26) || !far(x, z, bossSpawn, 22) || w.spawnPoints.some((sp) => !far(x, z, sp, 26)) || placed.some((q) => !far(x, z, q, 28))) continue;
        placed.push({ x, z });
        spawnPack(this, { x, z }, 2 + (rng() < 0.4 ? 1 : 0), { state: 'wander', ambient: true });
        break;
      }
    }
  }

  // [P] Rotglut variants: more HP, permanent rage
  #applyQuestVariant(m) {
    const q = this.quest, mm = this.mods.monster, hpMul = (q.hpMul ?? 1) * (mm.hpMul ?? 1);
    if (hpMul !== 1) { m.maxHp = Math.round(m.maxHp * hpMul); m.hp = m.maxHp; }
    if (q.rage === 'always' || mm.rageAlways) { m.rageUsed = true; m.rage = true; m.rageT = 1e9; m.def.onRage?.(m, true); }
  }

  /** [N] Brocken-HP nach Anzahl Pirscher (coopScale.js); bei Beitritt/Verlassen erneut aufrufen. */
  applyCoopScale() {
    const n = this.players.length;
    for (const m of this.monsters) applyCoopScale(m, n);
  }

  // ---------- ctx API used by entities
  get cameraYaw() { return this.rig.yaw; }
  get localPlayers() { return this.players.filter((p) => p.local); }
  countMonsters(defId) { return this.monsters.filter((m) => m.alive && m.def.id === defId).length; }
  debugShape(shape, color) { this.viz.shape(shape, color); }

  spawnMonster(defId, { x, z, yaw = 0, state = 'wander', id, seed } = {}) {
    const def = getMonsterDef(defId);
    const m = new Monster(def, this, { id: id ?? `${defId}-${++this._n}`, x, z, yaw, state, seed: seed ?? this.rng.int(1, 1e9) });
    if (state === 'combat') m.discovered = true;
    this.monsters.push(m);
    this.scene.add(m.mesh, m.shadow);
    return m;
  }

  /** Dead monsters leave hunt.monsters (and the scene) once the carve window is over; minor ones after a few seconds. */
  reapDead(dt) {
    const list = this.monsters;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.alive) continue;
      m.deadFor = (m.deadFor ?? 0) + dt;
      if (m.deadFor < (m.minor ? REAP_MINOR : REAP_MAJOR)) continue;
      list.splice(i, 1);
      this.scene.remove(m.mesh, m.shadow);
      this.fx.clearMarker?.(m.id);
    }
  }

  respawn(player) {
    const c = this.world.campPoint;
    player.respawn(c.x, c.z);
    this.rig.snap(player.pos, player.rot);
    this.hud.center('Zurück im Lager', 1.2);
  }

  playerHit(player, monster, hp, ah) {
    const st = player.stats;
    // [W] ah.elems = extra per-hit elements (fire arrow tips)
    const elems = ah.elems ? Object.fromEntries([...new Set([...Object.keys(st.elems), ...Object.keys(ah.elems)])].map((k) => [k, (st.elems[k] ?? 0) + (ah.elems[k] ?? 0)])) : st.elems;
    const attacker = { power: st.power, critChance: st.crit, elems, glitch: ah.glitch, sauber: ah.sauber, dmgMul: player.dmgMul * (this.mods.player.dmgMul ?? 1) * (player.def.dmgMul?.(player.weapon) ?? 1) }; // [KT] Schliff
    const res = resolvePlayerHit(attacker, ah.hit, hp.part, this.rng, { sleeping: monster.sleeping || monster.eating }); // [L] eating predator = sneak hit
    if (st.bluntMul) res.blunt *= st.bluntMul; // [P] Barrotz-Brecher
    res.attackerId = player.id;
    applyMonsterHit(monster, res, this);
    const at = { x: hp.pos.x, y: hp.pos.y, z: hp.pos.z };
    this.fx.spark(at, res.weak ? 14 : 9, res.weak ? '#ffe14d' : '#ffffff', 5);
    this.fx.number({ x: at.x, y: at.y + 0.6, z: at.z }, res.dmg, res.weak ? 'weak' : res.crit ? 'crit' : 'hit');
    this.fx.shake(ah.hit.shake ?? res.shake, 0.2);
    if (ah.sauber) { this.fx.flash('rgba(255,225,70,.3)', 0.2); this.fx.number({ x: at.x, y: at.y + 1.4, z: at.z }, ah.hit.sauberText ?? 'Sauber!', 'weak'); } // [KT]
    this.bus.emit('sfx', { name: res.hitstop >= 0.1 ? 'heavy' : 'hit', pos: at, kind: res.weak ? 'weak' : res.crit ? 'crit' : undefined }); // [K] kind
    player.afterHit(res, ah);
    this.stats.damage += res.dmg;
    this.stats.hits++;
    this.bus.emit('hit', { player, monster, part: hp.part.id, ...res });
  }

  // Hooks for the meta agent (items, gathering, carving). Default: nothing.
  onItem(player, action, slot) { this.meta?.onItem(player, action, slot); } // [P]
  onContext(player, kind) { this.meta?.onContext(player, kind); } // [P]
  /** [P] world effects of items: 'flash' | 'stink' | 'trap' | 'bomb' (net layer mirrors by wrapping this) */
  spawnEffect(kind, params) { return this.effects.spawn(kind, params); }
  /** [P] give up (pause menu) */
  abandon() { this.#finish('fail', 'Aufgegeben'); this.meta.proceed(); }

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
    ov.innerHTML = '<div class="panel"><h2>Jagd verlassen?</h2><button class="btn" data-a="go">Weiter</button><button class="btn" data-a="opt">Optionen</button><button class="btn red" data-a="quit">Verlassen</button></div>';
    ov.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (a === 'go') this.#toggleLeave();
      if (a === 'opt') this.#optionsFrom(ov);
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
    for (const m of this.monsters) if (m !== this.mainMonster && m.alive && !m.def.neutral) m.applyDamage({ dmg: 9999, partId: m.parts[0].id, elemDmg: 0 });
    this.winTimer = 2.2;
  }
  #finish(result, reason = '') {
    if (this.result) return;
    this.result = result;
    this.reason = reason;
    if (this.net?.isHost) this.net.sendEnd(result, reason); // [N]
    this.bus.emit(result === 'win' ? 'questComplete' : 'questFailed', { quest: this.quest, time: this.timeLimit - this.timeLeft, reason, stats: this.stats });
    if (this.meta.onFinish(result, reason) || this.opts.noOverlay) return; // [P] carve window / results scene
    const ov = document.createElement('div');
    ov.className = 'screen ui-hit';
    ov.innerHTML = `<div class="panel"><h2>${result === 'win' ? 'Auftrag erfüllt' : 'Auftrag gescheitert'}</h2>
      <p>${result === 'win' ? `${this.quest.name} in ${Math.floor((this.timeLimit - this.timeLeft) / 60)}:${String(Math.floor((this.timeLimit - this.timeLeft) % 60)).padStart(2, '0')}.<br>Schrott gibt es später. Jetzt Daumen hoch.` : `${reason || 'Zeit abgelaufen'}.<br>Nächstes Mal mit mehr Rollen.`}</p>
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
      ov.innerHTML = '<div class="panel"><h2>Pause</h2><button class="btn" data-a="go">Weiter</button><button class="btn" data-a="opt">Optionen</button><button class="btn red" data-a="quit">Aufgeben</button></div>';
      ov.addEventListener('click', (e) => {
        const a = e.target.dataset?.a;
        if (a === 'go') this.setPaused(false);
        if (a === 'opt') this.#optionsFrom(ov);
        if (a === 'quit') this.abandon();
      });
      this.app.ui.appendChild(ov);
      this.pauseEl = ov;
    } else { this.pauseEl?.remove(); this.pauseEl = null; }
  }

  /** Pause / leave menu -> options panel (same panel as the town); the menu comes back when it closes. */
  #optionsFrom(menuEl) {
    sfx.unlock?.(); sfx.play?.('ui');
    menuEl.style.display = 'none';
    this.openPanel('optionen', { hunt: true }, () => { menuEl.style.display = ''; });
  }

  /** Open a station panel inside the hunt. World input is suspended while it is up and ALWAYS restored on close
   *  (X button, scene change via dispose, opening another panel, hunt end). The hunt itself keeps running (co-op never pauses). */
  openPanel(id, adapter, onClose) {
    const app = this.app;
    this.meta?.onboarding?.close(); // the controls tip must not float over the panel
    openStation(id, app, {
      adapter,
      onClose: () => {
        this.panelOpen = false;
        this.input.reset();
        if (!this.disposed) app.touch?.setVisible(true);
        onClose?.();
      },
    });
    // after openStation: it closes a previous panel first, whose onClose would otherwise re-enable the controls
    this.panelOpen = true;
    app.touch?.setVisible(false);
    this.input.reset();
  }

  #applyUiSettings() {
    document.body.classList.toggle('scan', this.app.settings.scanlines && !this.opts.nofx);
  }

  update(dt) {
    if (this.panelOpen) this.input.reset(); // panel up: nothing reaches the player (also swallows stale key repeats)
    if (this.panelOpen && (this.player.state === 'ko' || this.result)) closeStation(); // knocked out: back to the world
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

    this.meta.update(dt); // [P]
    this.effects.update(dt); // [P]
    for (const p of this.players) { if (p.local) p.update(dt); else p.updateRemote(dt); } // [N]
    for (const m of this.monsters) { if (m.authority) m.update(dt); else m.tickRemote(dt); } // [N]
    this.reapDead(dt);
    this.projectiles.update(dt); // [W]
    this.world.update(dt, this);
    this.ambientFauna?.update(dt); // [L]
    this.meta.late(dt); // [P]

    const p = this.player;
    this.fx.update(dt);
    this.rig.update(dt, {
      playerPos: p.pos, playerYaw: p.rot, moving: p.speed > 1, camInput: this.input.takeCamera(),
      lockPos: p.lockPoint(), lockSize: p.lock?.monster?.bodyRadius, shake: this.fx.shakeOffset,
    });
    this.viz.end();
    this.app.input.contextLabel = this.contextLabel ?? null;
    this.app.input.itemLabel = this.itemLabel ?? '';
    this.app.input.lockOn = !!p.lock;
  }

  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastRender) / 1000);
    this._lastRender = now;
    this.fx.updateNumbers(dt);
    this.hud.update(this, dt);
    this.meta.render(); // [P]
    const lp = this.player.lockPoint();
    if (lp) {
      const v = _lockV.set(lp.x, lp.y, lp.z).project(this.camera);
      this.hud.lock(v.z < 1 ? { x: v.x * 0.5 + 0.5, y: -v.y * 0.5 + 0.5 } : null);
    } else this.hud.lock(null);
    this.app.touch?.update();
    this.app.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    closeStation(); // restores nothing visible (touch is hidden below) but clears the module-level panel state
    this.app.renderer.onResize.delete(this._onResize);
    this.projectiles.dispose(); // [W]
    this.ambientFauna?.dispose(); // [L]
    this.fx.dispose();
    this.world.dispose?.(); // [K] gather UI, ambient audio
    this.hud.dispose();
    this.meta?.dispose(); this.effects?.dispose(); // [P]
    this.overlay?.remove();
    this.pauseEl?.remove();
    this.leaveEl?.remove(); // [N]
    this.net?.dispose(); // [N]
    this.app.touch?.setVisible(false);
    this.input.reset();
    this.input.contextLabel = null; this.input.lockOn = false;
    time.reset();
    this._detachCues?.();
    this.bus.clear();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    document.body.classList.remove('scan');
  }
}
