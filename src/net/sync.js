import * as THREE from 'three';
import { MSG, encodeP, decodeP, encodeM, decodeM, encodeAtk, decodeAtk, encodeHit, decodeHit, applyHitOnce, Dedupe, ERR } from './protocol.js';
import { SnapBuffer } from './interp.js';
import { Player } from '../game/player.js';
import { weapons } from '../game/weapons/index.js';
import { clamp } from '../core/math.js';
import { rollGather } from '../data/gather.js';
import { decodeGear, makeGear } from '../data/gearlook.js'; // [G]
import { PLAYER_COLORS } from '../meta/save.js';

export const RATE_P = 15;   // Hz  Pirscher
export const RATE_M = 10;   // Hz  Brocken
const nowS = () => performance.now() / 1000;
const atkKey = (t0) => Math.round(t0 * 1000) + 1;

/**
 * Jagd-Synchronisation (GDD 12). Host: autoritativ für Brocken, Auftragszustand, Umgekippt-Zähler.
 * Gast: spielt Brocken per `tickRemote` aus Host-Snapshots + `atk`-Events ab, prüft Brockentreffer nur gegen den eigenen
 * Pirscher und schickt eigene Treffer als `hit` an den Host. Jeder Client ist für den eigenen Pirscher autoritativ.
 *
 * Die Instanz ist `hunt.net` (Vertrag: isHost, send, on, peers; combat.js nutzt isGuest + sendHit).
 */
export class HuntNet {
  constructor(hunt, net, opts) {
    this.hunt = hunt;
    this.net = net;
    this.isHost = net.isHost;
    this.isGuest = !net.isHost;
    this.myId = net.myId;
    this.peers = new Map();       // id -> { id, name, rtt, player, buf }
    this.monBuf = new Map();      // Gast: Brocken-ID -> SnapBuffer
    this.hits = new Dedupe();
    this.stats = { txP: 0, txM: 0, rxP: 0, rxM: 0, hitsSent: 0, hitsApplied: 0, hitsDup: 0, dmgApplied: 0, dmgSent: 0 };
    this.accP = 0; this.accM = 0;
    this.offs = [];
    this._fxHooked = false; this._inFx = false;
    this.ended = false;

    for (const info of opts.players ?? []) if (info.id !== this.myId) this.#addRemote(info);
    if (this.isGuest) for (const m of hunt.monsters) m.authority = false;
    this.#bind();
  }

  // ---------- Vertrag
  send(type, payload, to) { return to ? this.net.session.send(type, payload, to) : this.net.sendAll(type, payload); }
  on(type, fn) { return this.net.on(type, fn); }
  /** Gast: eigener Treffer -> Host (combat.applyMonsterHit). Lokales Feedback sofort. */
  sendHit(monster, res) {
    this.stats.hitsSent++;
    this.stats.dmgSent += Math.round(res.dmg);
    this.net.sendHost(MSG.HIT, encodeHit(monster.id, res, this.myId));
    monster.hitFlash = 0.12;
  }
  /** Gast: eigener Pirscher ist umgekippt -> Host zählt. */
  sendKo() { this.net.sendHost(MSG.EV, { k: 'ko' }); }
  /** Host: Jagd ist entschieden -> alle. */
  sendEnd(result, reason) { this.ended = true; this.net.sendAll(MSG.END, { r: result, why: reason ?? '', tl: Math.round(this.hunt.timeLeft) }); }
  get rtt() { return this.net.rtt; }

  // ---------- Fernspieler
  #addRemote(info) {
    const hunt = this.hunt;
    const weapon = weapons[info.weapon] ? info.weapon : 'gs';
    const dg = decodeGear(info.gear); // [G] remote outfit; old clients send no code -> default armor, weapon type/tier as before
    const gear = dg ? makeGear({ ...dg, color: PLAYER_COLORS[this.net.session?.member(info.id)?.colorIdx ?? dg.colorIdx] }) : null;
    const p = new Player({ id: info.id, name: info.name, weapon: dg?.weapon.type ?? weapon, tier: dg?.weapon.tier ?? info.tier ?? 1, branch: dg?.weapon.branch ?? null, gear, local: false, ctx: hunt });
    const sp = hunt.world.spawnPoints[(info.slot ?? 1) % hunt.world.spawnPoints.length];
    p.spawnAt(sp.x, sp.z, sp.yaw);
    p.remote = { state: 'free', rollT: 0, sprint: false, speed: 0, wp: null, air: 0 };
    p.mesh.add(nameTag(info.name));
    hunt.scene.add(p.mesh, p.rig.shadow);
    hunt.players.push(p);
    this.peers.set(info.id, { id: info.id, name: info.name, rtt: 0, player: p, buf: new SnapBuffer({ angleKeys: ['rot'] }) });
  }
  #removeRemote(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    const hunt = this.hunt, p = peer.player;
    hunt.scene.remove(p.mesh, p.rig.shadow);
    hunt.players.splice(hunt.players.indexOf(p), 1);
    this.peers.delete(id);
    hunt.hud?.center?.(`${peer.name} ist weg`, 2);
    
  }

  // ---------- Handler
  #bind() {
    const n = this.net, hunt = this.hunt, off = (this.offs = []);
    off.push(n.on(MSG.P, (d, from) => this.#onP(d, from)));
    off.push(n.on(MSG.GATHER, (d, from) => this.#onGather(d, from)));
    off.push(n.on(MSG.FX, (d, from) => this.#onFx(d, from)));
    off.push(n.on(MSG.EV, (d, from) => this.#onEv(d, from)));
    // lokales Einsammeln (K) -> alle
    off.push(hunt.bus.on('gathered', (e) => {
      if (e?.remote) return;
      setTimeout(() => {
        const pt = hunt.world.gatherPoints?.find((g) => g.id === e.pointId);
        this.net.sendAll(MSG.GATHER, { id: e.pointId, u: pt ? pt.usesLeft : 0 });
      }, 0);
    }));
    n.onLeave(({ id }) => { if (id === n.hostId && this.isGuest) this.#hostGone(); else this.#removeRemote(id); });
    n.onLost(() => this.#hostGone());
    if (this.isHost) {
      off.push(n.on(MSG.HIT, (d, from) => this.#onHit(d, from)));
      off.push(hunt.bus.on('monsterAttack', (e) => {
        const { monsterId, ...params } = e;
        n.sendAll(MSG.ATK, encodeAtk(monsterId, params, nowS()));
      }));
      off.push(hunt.bus.on('partBreak', (e) => n.sendAll(MSG.EV, { k: 'pb', m: e.monster.id, p: e.part })));
      off.push(hunt.bus.on('monsterStun', (e) => n.sendAll(MSG.EV, { k: 'st', m: e.monster.id })));
      off.push(hunt.bus.on('monsterDead', (e) => n.sendAll(MSG.EV, { k: 'dead', m: e.monster.id })));
    } else {
      off.push(n.on(MSG.M, (d) => this.#onM(d)));
      off.push(n.on(MSG.ATK, (d) => this.#onAtk(d)));
      off.push(n.on(MSG.END, (d) => { this.ended = true; hunt.netFinish(d.r, d.why); }));
    }
  }

  #onP(d, from) {
    const peer = this.peers.get(from);
    if (!peer) return;
    this.stats.rxP++;
    const s = decodeP(d);
    peer.buf.push(s.T, s, nowS());
  }

  // ---------- Host: Treffer, Ereignisse
  #onHit(d, from) {
    const hunt = this.hunt;
    const r = applyHitOnce(this.hits, from, decodeHit(d), (h) => {
      const m = hunt.monsters.find((x) => x.id === h.monsterId);
      if (!m || !m.alive) return null;
      h.res.attackerId = from; // dem Absender vertrauen, nicht der Nutzlast
      const before = m.hp;
      const ev = m.applyDamage(h.res);
      this.stats.hitsApplied++;
      this.stats.dmgApplied += before - m.hp;
      const hp = m.hurtParts().find((q) => q.part.id === h.res.partId);
      if (hp) hunt.fx.number({ x: hp.pos.x, y: hp.pos.y + 0.6, z: hp.pos.z }, h.res.dmg, h.res.weak ? 'weak' : h.res.crit ? 'crit' : 'hit');
      if (hp) hunt.fx.spark(hp.pos, 6, '#ffffff', 4);
      return ev;
    });
    if (r === null) this.stats.hitsDup++;
  }

  #onEv(d, from) {
    const hunt = this.hunt;
    switch (d.k) {
      case 'ko': if (this.isHost) hunt.netKo(from); break;
      case 'bye': if (from === this.net.hostId && this.isGuest) this.#hostGone(); else this.#removeRemote(from); break; // participant left the hunt (still in the room)
      case 'pb': {
        const m = this.#mon(d.m), part = m?.partById[d.p];
        if (this.isGuest && m && part) this.#replicateBreak(m, part);
        break;
      }
      case 'st': { const m = this.#mon(d.m); if (this.isGuest && m) { m.attack = null; hunt.fx.clearMarker?.(m.id); } break; }
      case 'dead': { const m = this.#mon(d.m); if (this.isGuest && m && m.alive) this.#kill(m); break; }
    }
  }

  #mon(id) { return this.hunt.monsters.find((m) => m.id === id); }

  // ---------- Gast: Brocken
  #onM(d) {
    this.stats.rxM++;
    const q = decodeM(d), hunt = this.hunt;
    hunt.timeLeft = q.timeLeft;
    if (q.teamKo !== hunt.teamKo) {
      if (q.teamKo > hunt.teamKo) hunt.hud.center(`Umgekippt! ${q.teamKo}/3`, 2);
      hunt.teamKo = q.teamKo;
    }
    for (const s of q.monsters) {
      let buf = this.monBuf.get(s.id);
      if (!buf) { buf = new SnapBuffer({ angleKeys: ['rot'] }); this.monBuf.set(s.id, buf); }
      buf.push(q.T, { ...s, T: q.T }, nowS());
    }
  }

  #onAtk(d) {
    const a = decodeAtk(d);
    const m = this.#mon(a.monsterId);
    if (!m || !m.alive) return;
    // elapsed = 0: der Gast bekommt die volle Telegraph-Zeit (faires Ausweichen trotz Latenz)
    const inst = m.startAttack(a.params, 0);
    if (inst && m.attack) { m.attack.netT = a.T; m.attack.key = atkKey(a.params.t0); }
  }

  #replicateBreak(m, part) {
    if (part.broken) return;
    part.broken = true;
    part.hp = 0;
    part.factor = Math.max(0, part.baseFactor - 0.1);
    for (const mat of part.mats) mat.userData.ps1.uJit.value = 0.01;
    m.attack = null;
    this.hunt.fx.clearMarker?.(m.id);
    m.def.onBreak?.(m, part);
    const p = part.sph[0].node.getWorldPosition(new THREE.Vector3());
    this.hunt.fx.spark(p, 24, '#ffffff', 6);
    this.hunt.fx.shake(0.2, 0.2);
    this.hunt.bus.emit('partBreak', { monster: m, part: part.id });
    this.hunt.bus.emit('sfx', { name: 'break', pos: p });
  }

  #kill(m) {
    m.attack = null;
    m.applyDamage({ dmg: Math.ceil(m.hp) + 1, elemDmg: 0, partId: null, blunt: 0, attackerId: 'net' });
  }

  #applyMonsters(dt) {
    const hunt = this.hunt, t = nowS();
    for (const [id, buf] of this.monBuf) {
      const sm = buf.sample(t);
      if (!sm) continue;
      const s = sm.s, c = sm.cur;
      let m = this.#mon(id);
      if (!m) {
        if (c.state === 'dead') continue; // already reaped here
        m = hunt.spawnMonster(c.def, { x: s.x, z: s.z, yaw: s.rot, state: c.state === 'dead' ? 'wander' : c.state, id });
        m.authority = false;
      }
      m.stateT += dt;
      m.hitFlash = Math.max(0, m.hitFlash - dt);
      // Teile
      c.parts.forEach((sp, i) => {
        const part = m.parts[i];
        if (!part || !part.breakHp) return;
        if (sp.broken) { if (!part.broken) this.#replicateBreak(m, part); return; }
        if (!part.broken) {
          part.hp = sp.hp;
          const jit = clamp(1 - part.hp / part.breakHp, 0, 1) * (part.jitter ?? 0.05);
          for (const mat of part.mats) mat.userData.ps1.uJit.value = jit;
        }
      });
      // Zustand
      if (c.state !== m.state) {
        if (c.state === 'dead') { if (m.alive) { m.pos.set(s.x, s.y, s.z); this.#kill(m); } }
        else if (m.alive) m.setState(c.state);
      }
      if (!m.alive) continue;
      m.hp = Math.max(1, s.hpPct * m.maxHp);
      m.discovered = c.discovered;
      m.stunT = c.stun ? 1 : 0;
      m.stagT = c.stag ? 1 : 0;
      if (c.rage !== m.rage) { m.rage = c.rage; this.hunt.bus.emit('rage', { monster: m, on: c.rage }); m.def.onRage?.(m, c.rage); }
      // Angriff abbrechen, wenn der Host ihn beendet/unterbrochen hat (Snapshot ist jünger als der Angriffsstart)
      if (m.attack && m.attack.netT !== undefined && c.T >= m.attack.netT && c.atk !== m.attack.key) {
        m.attack = null;
        hunt.fx.clearMarker?.(m.id);
      }
      // Position: Angriffe bewegen den Brocken selbst (deterministisch); sonst zum interpolierten Snapshot gleiten
      if (!m.attack) {
        const k = 1 - Math.exp(-20 * dt);
        const ox = m.pos.x, oz = m.pos.z;
        const dx = s.x - m.pos.x, dz = s.z - m.pos.z;
        if (dx * dx + dz * dz > 100) m.pos.set(s.x, s.y, s.z); else { m.pos.x += dx * k; m.pos.z += dz * k; m.pos.y += (s.y - m.pos.y) * k; }
        const dr = Math.atan2(Math.sin(s.rot - m.rot), Math.cos(s.rot - m.rot));
        m.rot += dr * k;
        const iv = 1 - Math.exp(-10 * dt);
        m.vel.x += ((m.pos.x - ox) / dt - m.vel.x) * iv;
        m.vel.z += ((m.pos.z - oz) / dt - m.vel.z) * iv;
      }
    }
  }

  // ---------- Welt-/Effekt-Replikation
  /** Guest -> host: "I finished gathering at this point". The host arbitrates (last use goes to whoever arrives first). */
  claimGather(pointId) { this.net.sendHost(MSG.GATHER, { id: pointId, c: 1 }); }

  #onGather(d, from) {
    const hunt = this.hunt, world = hunt.world;
    const pt = world.gatherPoints?.find((g) => g.id === d.id);
    if (!pt) return;
    if (d.c) { // host: arbitrate a claim
      if (!this.isHost) return;
      const reply = (x) => this.net.session.send(MSG.GATHER, { id: pt.id, ...x }, [from]);
      if (pt.usesLeft <= 0) { reply({ u: 0, deny: 1 }); return; }
      const items = rollGather(hunt.seed, pt.id, pt.kind, pt.zone, pt.maxUses - pt.usesLeft);
      world.setGatherState(pt.id, pt.usesLeft - 1);
      this.stats.gathersGranted = (this.stats.gathersGranted ?? 0) + 1;
      reply({ u: pt.usesLeft, it: items });
      const others = this.net.others().filter((i) => i !== from);
      if (others.length) this.net.session.send(MSG.GATHER, { id: pt.id, u: pt.usesLeft }, others);
      hunt.fx?.spark({ x: pt.pos.x, y: pt.pos.y + 0.7, z: pt.pos.z }, 6, '#ffe14d', 2);
      return;
    }
    if (d.deny) {
      world.setGatherState(pt.id, 0);
      hunt.fx?.number({ x: hunt.player.pos.x, y: hunt.player.pos.y + 2.3, z: hunt.player.pos.z }, 'Schon leer!', 'hurt');
      return;
    }
    if (pt.usesLeft > d.u) world.setGatherState(pt.id, d.u);
    if (d.it) { // my claim was granted: items + the usual local feedback
      hunt.bus.emit('gathered', { pointId: pt.id, items: d.it, usesLeft: d.u, remote: true });
      hunt.bus.emit('sfx', { name: 'gather', pos: pt.pos });
      const p = hunt.player;
      hunt.fx?.number({ x: p.pos.x, y: p.pos.y + 2.3, z: p.pos.z }, d.it.map((it) => `${it.id} x${it.n}`).join(', '), 'heal');
    }
  }
  #onFx(d, from) {
    if (d.k === 'arrow') { this.#mirrorArrow(d.p, from); return; }
    if (!this.hunt.spawnEffect) return;
    this._inFx = true;
    try { this.hunt.spawnEffect(d.k, d.p); } finally { this._inFx = false; }
  }
  /** Remote hunters' arrows: visual only (their client resolves the hits and sends them as `hit`). */
  #mirrorArrow(a, from) {
    const hunt = this.hunt, peer = this.peers.get(from);
    if (!hunt.projectiles || !a) return;
    hunt.projectiles.spawn({
      pos: { x: a.x, y: a.y, z: a.z }, vel: { x: a.vx, y: a.vy, z: a.vz }, gravity: a.g ?? 7, radius: 0.1, life: a.l ?? 2.6,
      team: 'player', owner: peer?.player ?? null, pierce: a.pi ?? 1, color: a.c, mirror: true, onHit: () => {},
    });
    this.stats.arrowsMirrored = (this.stats.arrowsMirrored ?? 0) + 1;
  }
  /** Tell the others about an arrow I fired (compact). */
  #sendArrow(o) {
    const r = (n) => Math.round(n * 100) / 100;
    this.net.sendAll(MSG.FX, { k: 'arrow', p: { x: r(o.pos.x), y: r(o.pos.y), z: r(o.pos.z), vx: r(o.vel.x), vy: r(o.vel.y), vz: r(o.vel.z), g: o.gravity ?? 0, c: o.color, l: o.life, pi: o.pierce } });
  }
  #hookFx() {
    const hunt = this.hunt;
    if (this._fxHooked || typeof hunt.spawnEffect !== 'function') return;
    this._fxHooked = true;
    const orig = hunt.spawnEffect.bind(hunt);
    hunt.spawnEffect = (kind, params) => {
      const r = orig(kind, params);
      if (!this._inFx) {
        let p = null;
        try { p = JSON.parse(JSON.stringify(params ?? null)); } catch { /* nicht serialisierbar */ }
        this.net.sendAll(MSG.FX, { k: kind, p });
      }
      return r;
    };
  }

  #hookArrows() {
    const hunt = this.hunt, pr = hunt.projectiles;
    if (!pr || this._arrowsHooked) return;
    this._arrowsHooked = true;
    const orig = pr.spawn.bind(pr);
    pr.spawn = (o) => {
      if (o.team !== 'monster' && !o.mirror && o.owner === hunt.player) this.#sendArrow(o);
      return orig(o);
    };
  }

  #hostGone() {
    const hunt = this.hunt;
    if (hunt.result || this.ended) return;
    hunt.netAbort(ERR.hostLeft);
  }

  // ---------- pro Sim-Schritt
  update(dt) {
    const hunt = this.hunt, t = nowS();
    if (!this._fxHooked) { this.#hookFx(); this.#hookArrows(); }
    // eigener Pirscher
    this.accP += dt;
    if (this.accP >= 1 / RATE_P) {
      this.accP = Math.min(this.accP - 1 / RATE_P, 1 / RATE_P);
      this.net.sendAll(MSG.P, encodeP(this.#localSnap(), t));
      this.stats.txP++;
    }
    // Brocken + Auftragszustand (Host)
    if (this.isHost) {
      this.accM += dt;
      if (this.accM >= 1 / RATE_M) {
        this.accM = Math.min(this.accM - 1 / RATE_M, 1 / RATE_M);
        this.net.sendAll(MSG.M, encodeM(t, hunt.timeLeft, hunt.teamKo, hunt.monsters.map((m) => this.#monSnap(m))));
        this.stats.txM++;
      }
    } else this.#applyMonsters(dt);
    // Fernspieler
    for (const peer of this.peers.values()) {
      const sm = peer.buf.sample(t);
      if (!sm) continue;
      const s = sm.s, c = sm.cur, p = peer.player;
      p.pos.set(s.x, s.y, s.z);
      p.rot = s.rot;
      p.v.hp = s.hp; p.v.maxHp = s.maxHp;
      const el = clamp(sm.rt - sm.curT, 0, 0.2);
      p.remote.state = c.state;
      p.remote.rollT = c.state === 'roll' ? c.animT + el : 0;
      p.remote.sprint = c.sprint;
      p.remote.speed = s.speed;
      p.remote.air = s.air;
      p.remote.wp = c.anim ? { name: c.anim, t: c.animT + el, charging: c.charging, level: c.level } : null;
      peer.rtt = this.net.rttOf(peer.id);
    }
  }

  #localSnap() {
    const p = this.hunt.player, w = p.weapon, wp = w.pose();
    return {
      x: p.pos.x, y: p.pos.y, z: p.pos.z, rot: p.rot, state: p.state, anim: wp?.name ?? null,
      animT: p.state === 'roll' ? p.rollT : wp?.t ?? 0, level: wp?.level ?? 0, charging: !!wp?.charging,
      speed: p.speed, sprint: p.sprinting, air: w.airOffset(), hp: p.v.hp, maxHp: p.v.maxHp,
    };
  }
  #monSnap(m) {
    return {
      id: m.id, def: m.def.id, x: m.pos.x, y: m.pos.y, z: m.pos.z, rot: m.rot, state: m.state, hpPct: m.hp / m.maxHp,
      rage: m.rage, discovered: m.discovered, stun: m.stunT > 0, stag: m.stagT > 0,
      atk: m.attack ? atkKey(m.attack.inst.params.t0) : 0, parts: m.parts.map((p) => ({ hp: p.hp, broken: p.broken })),
    };
  }

  dispose() {
    for (const f of this.offs) f();
    this.offs = [];
    this.net.sendAll(MSG.EV, { k: 'bye' });
    this.net.dispose();
  }
}

/** Kleines Pixel-Namensschild über dem Kopf (Sprite, NearestFilter). */
export function nameTag(name) {
  const c = document.createElement('canvas');
  const w = Math.max(16, name.length * 6 + 6), h = 11;
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(10,8,40,.6)';
    g.fillRect(0, 0, w, h);
    g.font = 'bold 8px monospace';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = '#000';
    g.fillText(name, w / 2 + 1, h / 2 + 1);
    g.fillStyle = '#7dff7d';
    g.fillText(name, w / 2, h / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
  sp.scale.set((w / h) * 0.3, 0.3, 1);
  sp.position.y = 2.3;
  sp.renderOrder = 20;
  return sp;
}
