import Peer from 'peerjs';
import { MSG, RELAY, IDEMPOTENT, MAX_PLAYERS, ERR, Dedupe, generateRoomCode, normalizeCode, isValidCode, peerIdFor, wrap } from './protocol.js';

/**
 * PeerJS-Wrapper. Stern-Topologie: Host erzeugt den Peer `scuffedhunter-<CODE>`, Gäste verbinden nur zum Host.
 * Ein zuverlässiger, geordneter DataChannel (JSON); Snapshots sind klein (15/10 Hz) und tragen Zeitstempel, ältere werden
 * beim Empfänger verworfen. Der Host reicht `p`/`fx`/`gather` von Gästen an die übrigen Gäste weiter.
 *
 * Nutzung:  const net = await hostRoom({name, weapon, tier, quest})  |  await joinRoom('ABCD', {name, weapon, tier})
 *   net.on(type, (payload, fromId, wire) => …)  → Abmelde-Funktion;  net.send(type, payload, toId?)
 *   Sonderereignisse: 'roster' (Liste geändert), 'peer-leave' ({id, name}), 'close' ({reason}), 'start' (Spielstart)
 */

// Öffentliches Gratis-TURN (Open Relay) als Fallback für Mobilfunk/CGNAT; eigenes per ?turn=<JSON> ergänzbar.
export const TURN_SERVERS = [{
  urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
  username: 'openrelayproject', credential: 'openrelayproject',
}];
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun2.l.google.com:19302' }];
const HEARTBEAT_MS = 1000, TIMEOUT_MS = 10000, CONNECT_TIMEOUT_MS = 12000;
const now = () => performance.now();

/** ICE-Server: Google-STUN + TURN-Konstante + optional `?turn=<JSON>` (Objekt oder Liste). */
export function iceServers(search = globalThis.location?.search ?? '') {
  const out = [...STUN, ...TURN_SERVERS];
  try {
    const t = new URLSearchParams(search).get('turn');
    if (t) { const j = JSON.parse(t); out.push(...(Array.isArray(j) ? j : [j])); }
  } catch { /* kaputtes ?turn= ignorieren */ }
  return out;
}

/** PeerJS-Optionen; Signaling per URL überschreibbar: ?peerhost=&peerport=&peerpath=&peersecure=0|1 (sonst PeerJS-Cloud). */
export function peerOptions(search = globalThis.location?.search ?? '') {
  const q = new URLSearchParams(search);
  const o = { debug: 0, config: { iceServers: iceServers(search), iceCandidatePoolSize: 2 } };
  if (q.get('peerhost')) o.host = q.get('peerhost');
  if (q.get('peerport')) o.port = Number(q.get('peerport'));
  if (q.get('peerpath')) o.path = q.get('peerpath');
  if (q.has('peersecure')) o.secure = q.get('peersecure') === '1' || q.get('peersecure') === 'true';
  else if (o.host) o.secure = false;
  return o;
}

export class Net {
  constructor({ isHost, peer, code, name }) {
    this.isHost = isHost;
    this.isGuest = !isHost;
    this.peer = peer;
    this.code = code;
    this.name = name;
    this.myId = isHost ? 'p0' : null;
    this.peers = new Map();        // Host: id -> { id, name, conn, rtt, lastRx }
    this.hostConn = null;          // Gast: Verbindung zum Host
    this.roster = [];              // [{ id, name, weapon, tier, ready }]
    this.quest = null;
    this.started = false;
    this.closed = false;
    this.rtt = 0;                  // Gast: Ping zum Host (ms)
    this.handlers = new Map();
    this.dedupe = new Dedupe();
    this._mid = 0;
    this._hb = setInterval(() => this.#heartbeat(), HEARTBEAT_MS);
  }

  // ---------- Ereignisse
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  off(type, fn) { this.handlers.get(type)?.delete(fn); }
  emit(type, d, from, wire) {
    const s = this.handlers.get(type);
    if (s) for (const fn of [...s]) fn(d, from, wire, type);
    const a = this.handlers.get('*'); // catch-all (Session)
    if (a) for (const fn of [...a]) fn(d, from, wire, type);
  }

  // ---------- Senden
  /** Host: an alle (oder `to`), Gast: an den Host. Rückgabe = Nachrichten-ID. */
  send(type, d, to = null) {
    if (this.closed) return 0;
    const id = ++this._mid;
    const w = wrap(type, this.myId, id, d);
    const list = to ? (Array.isArray(to) ? to : [to]) : null;
    if (this.isHost) {
      if (list) { for (const t of list) { const p = this.peers.get(t); if (p) this.#raw(p.conn, w); } }
      else for (const p of this.peers.values()) this.#raw(p.conn, w);
    } else if (this.hostConn) {
      if (list) w.to = list; // Raum-Host leitet an die Adressaten weiter
      this.#raw(this.hostConn, w);
    }
    return id;
  }
  #raw(conn, w) { try { if (conn.open) conn.send(w); } catch { /* Verbindung schließt gerade */ } }

  // ---------- Eingang
  _dispatch(conn, w, peerRec) {
    if (!w || typeof w.t !== 'string') return;
    if (peerRec) peerRec.lastRx = now(); else this.lastRx = now();
    if (w.t === MSG.PING) return this.#onPing(conn, w, peerRec);
    if (w.t === MSG.HELLO && this.isHost) return this.#onHello(conn, w);
    if (w.t === MSG.PROFILE && this.isHost) return peerRec ? this.#onProfile(peerRec, w.d) : undefined;
    const from = peerRec ? peerRec.id : w.f;
    if (this.isHost) {
      if (!peerRec) return; // unbekannte Verbindung (kein hello)
      w.f = peerRec.id;
      if (w.to) { // adressiert: nur an die genannten Mitglieder (Jagd-Verkehr); der Host selbst nur, wenn er genannt ist
        for (const t of w.to) { const o = this.peers.get(t); if (o && o !== peerRec) this.#raw(o.conn, w); }
        if (!w.to.includes(this.myId)) return;
      } else if (RELAY.has(w.t)) for (const o of this.peers.values()) if (o !== peerRec) this.#raw(o.conn, w);
      if (w.t === MSG.READY) return this.#onReady(peerRec, w.d);
    } else {
      if (w.t === MSG.HELLO) return this.#onWelcome(w.d);
      if (w.t === MSG.LOBBY) { this.roster = w.d.players; this.quest = w.d.quest; this.emit('roster', this.roster); return; }
      if (w.t === MSG.START) { this.started = true; this.roster = w.d.players; }
    }
    if (IDEMPOTENT.has(w.t) && this.dedupe.seen(from, w.i)) return;
    this.emit(w.t, w.d, from, w);
  }

  #onPing(conn, w, rec) {
    if (w.d.r) {
      const rtt = now() - w.d.s;
      if (rec) rec.rtt = rec.rtt ? rec.rtt * 0.7 + rtt * 0.3 : rtt;
      else this.rtt = this.rtt ? this.rtt * 0.7 + rtt * 0.3 : rtt;
    } else this.#raw(conn, wrap(MSG.PING, this.myId, 0, { s: w.d.s, r: 1 }));
  }
  #heartbeat() {
    if (this.closed) return;
    const t = now();
    const ping = () => wrap(MSG.PING, this.myId, 0, { s: t });
    if (this.isHost) {
      for (const p of [...this.peers.values()]) {
        if (t - p.lastRx > TIMEOUT_MS) { this.#dropPeer(p.id, ERR.lost); continue; }
        this.#raw(p.conn, ping());
      }
    } else if (this.hostConn) {
      if (t - (this.lastRx ?? t) > TIMEOUT_MS) { this._lost(ERR.lost); return; }
      this.#raw(this.hostConn, ping());
    }
  }

  // ---------- Host: Anmeldung, Roster
  #onHello(conn, w) {
    const d = w.d ?? {};
    const reply = (x) => this.#raw(conn, wrap(MSG.HELLO, this.myId, 0, x));
    const old = [...this.peers.values()].find((p) => p.conn === conn);
    if (old) return;
    if (this.roster.length >= MAX_PLAYERS) { reply({ err: 'full' }); setTimeout(() => conn.close(), 200); return; }
    let n = 1;
    while (this.roster.some((r) => r.id === 'p' + n)) n++;
    const id = 'p' + n;
    const rec = { id, name: String(d.name ?? 'Pirscher').slice(0, 12), conn, rtt: 0, lastRx: now() };
    this.peers.set(id, rec);
    this.roster.push({ id, name: rec.name, weapon: d.weapon ?? 'gs', tier: d.tier ?? 1, ready: false, ...(typeof d.gear === 'string' ? { gear: d.gear.slice(0, 8) } : {}) }); // [G] gear code
    conn.on('close', () => this.#dropPeer(id, ERR.lost));
    conn.on('error', () => this.#dropPeer(id, ERR.lost));
    reply({ you: id, code: this.code });
    this.#pushLobby();
  }
  /** Host: Gast ändert nach dem Beitritt Name/Waffe/Rüstung -> Roster aktualisieren und an alle schicken. */
  #onProfile(rec, d) {
    const r = this.roster.find((x) => x.id === rec.id);
    if (!r || !d) return;
    if (typeof d.name === 'string') r.name = rec.name = d.name.slice(0, 12);
    if (typeof d.weapon === 'string') r.weapon = d.weapon.slice(0, 12);
    if (Number.isFinite(d.tier)) r.tier = Math.max(1, Math.min(9, d.tier | 0));
    if (typeof d.gear === 'string') r.gear = d.gear.slice(0, 8);
    this.#pushLobby();
  }
  #onReady(rec, d) {
    const r = this.roster.find((x) => x.id === rec.id);
    if (r) { r.ready = !!d.r; this.#pushLobby(); }
  }
  #pushLobby() {
    this.send(MSG.LOBBY, { players: this.roster, quest: this.quest });
    this.emit('roster', this.roster);
  }
  /** Host: Auftrag in der Lobby ändern. */
  setQuest(q) { this.quest = q; if (this.isHost) this.#pushLobby(); }
  /** Host: eigene Bereit-/Ausrüstungsdaten ändern. */
  updateSelf(patch) {
    if (this.isGuest) {
      const d = {};
      for (const k of ['name', 'weapon', 'tier', 'gear']) if (patch[k] !== undefined) d[k] = patch[k];
      if (Object.keys(d).length && this.myId) this.send(MSG.PROFILE, d);
      return;
    }
    const r = this.roster.find((x) => x.id === this.myId);
    if (r) Object.assign(r, patch);
    if (this.isHost) this.#pushLobby();
  }
  #dropPeer(id, reason) {
    const rec = this.peers.get(id);
    if (!rec) return;
    this.peers.delete(id);
    try { rec.conn.close(); } catch { /* egal */ }
    const r = this.roster.find((x) => x.id === id);
    this.roster = this.roster.filter((x) => x.id !== id);
    if (!this.started) this.#pushLobby();
    this.emit('peer-leave', { id, name: r?.name ?? rec.name, reason });
  }
  /** Host: Jagd starten. Liefert die Spielerliste mit Slots; schickt `start` an alle Gäste. */
  startGame({ quest, seed }) {
    this.started = true;
    const players = this.roster.map((r, slot) => ({ id: r.id, name: r.name, weapon: r.weapon, tier: r.tier, gear: r.gear, slot }));
    this.send(MSG.START, { seed, quest, players, t: Date.now() });
    return { seed, quest, players };
  }
  rttOf(id) { return this.isHost ? (this.peers.get(id)?.rtt ?? 0) : id === 'p0' ? this.rtt : 0; }
  get allReady() { return this.roster.every((r) => r.ready || r.id === this.myId); }

  // ---------- Gast
  #onWelcome(d) {
    if (d.err) { this._joinFail?.(d.err === 'full' ? ERR.full : ERR.started); return; }
    this.myId = d.you;
    this.roster = this.roster.length ? this.roster : [];
    this._joinOk?.(this);
  }
  _lost(reason) {
    if (this.closed) return;
    this.emit('close', { reason });
    this.close();
  }
  setReady(r) { if (this.isGuest) this.send(MSG.READY, { r: r ? 1 : 0 }); else this.updateSelf({ ready: !!r }); }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this._hb);
    try { for (const p of this.peers.values()) p.conn.close(); this.hostConn?.close(); } catch { /* egal */ }
    setTimeout(() => { try { this.peer.destroy(); } catch { /* egal */ } }, 150);
    this.handlers.clear();
  }
}

// ---------- Fabriken

/** Host: Raum erzeugen (4-Buchstaben-Code, bei belegter ID neuer Versuch). */
export function hostRoom({ name = 'Pirscher', weapon = 'gs', tier = 1, gear, quest = 'jaggo', code: fixed } = {}) { // [G] gear = compact gear code
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = fixed ?? generateRoomCode();
      const peer = new Peer(peerIdFor(code), peerOptions());
      const to = setTimeout(() => { try { peer.destroy(); } catch { /* egal */ } reject(new Error(ERR.server)); }, CONNECT_TIMEOUT_MS);
      peer.on('open', () => {
        clearTimeout(to);
        const net = new Net({ isHost: true, peer, code, name });
        net.quest = quest;
        net.roster = [{ id: 'p0', name, weapon, tier, ready: true, ...(gear ? { gear } : {}) }];
        peer.on('connection', (conn) => {
          conn.on('data', (w) => {
            const rec = [...net.peers.values()].find((p) => p.conn === conn);
            if (!net.closed) net._dispatch(conn, w, rec);
          });
        });
        peer.on('disconnected', () => { if (!net.closed) try { peer.reconnect(); } catch { /* egal */ } });
        peer.on('error', () => { /* peer-unavailable usw.: für den Host harmlos */ });
        resolve(net);
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && !fixed && ++tries < 8) { clearTimeout(to); try { peer.destroy(); } catch { /* egal */ } attempt(); return; }
        clearTimeout(to);
        if (!peer.open) reject(new Error(ERR.server));
      });
    };
    attempt();
  });
}

/** Gast: Raum betreten. Rejects mit deutschem Fehlertext. */
export function joinRoom(codeIn, { name = 'Pirscher', weapon = 'gs', tier = 1, gear } = {}) {
  const code = normalizeCode(codeIn);
  return new Promise((resolve, reject) => {
    if (!isValidCode(code)) { reject(new Error(ERR.badCode)); return; }
    const peer = new Peer(undefined, peerOptions());
    let done = false;
    const fail = (msg) => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch { /* egal */ } reject(new Error(msg)); };
    const to = setTimeout(() => fail(peer.open ? ERR.timeout : ERR.server), CONNECT_TIMEOUT_MS);
    peer.on('error', (e) => {
      if (done) return;
      fail(e.type === 'peer-unavailable' ? ERR.notFound : ERR.server);
    });
    peer.on('open', () => {
      const conn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
      const net = new Net({ isHost: false, peer, code, name });
      net.hostConn = conn;
      net._joinFail = fail;
      net._joinOk = () => { if (done) return; done = true; clearTimeout(to); resolve(net); };
      conn.on('open', () => conn.send(wrap(MSG.HELLO, 'x', 0, { name, weapon, tier, ...(gear ? { gear } : {}) })));
      conn.on('data', (w) => net._dispatch(conn, w, null));
      conn.on('close', () => { if (!done) fail(ERR.notFound); else net._lost(ERR.lost); });
      conn.on('error', () => { if (!done) fail(ERR.timeout); else net._lost(ERR.lost); });
      peer.on('disconnected', () => { if (!net.closed) try { peer.reconnect(); } catch { /* egal */ } });
    });
  });
}

