import Peer from 'peerjs';
import { MSG, RELAY, IDEMPOTENT, MAX_PLAYERS, BUILD_ID, ERR, Dedupe, generateRoomCode, normalizeCode, isValidCode, peerIdFor, wrap } from './protocol.js';
import { RECONNECT_GRACE_MS, randomToken, loadResume, saveResume, clearResume } from './resumeIdentity.js';

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
const SYNC_CHUNK = 6000, MAX_SYNC_CHARS = 2000000;
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
    this._fragments = new Map();
    this._mid = 0;
    this._nextId = 1; this.connectionState = 'connected'; this.resumeToken = null;
    this._wake = () => { if (!globalThis.document?.hidden) { this.#heartbeat(); if (this.connectionState === 'reconnecting') this.reconnectNow(); } };
    globalThis.window?.addEventListener?.('online', this._wake);
    globalThis.document?.addEventListener?.('visibilitychange', this._wake);
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
    // A world bootstrap can exceed Safari/WebRTC's message size. Keep each wire packet small.
    if (type === MSG.SYNC && d?.a !== 'fragment') {
      const json = JSON.stringify(d);
      if (json?.length > MAX_SYNC_CHARS) return 0;
      if (json?.length > SYNC_CHUNK) {
        const key = randomToken(), count = Math.ceil(json.length / SYNC_CHUNK);
        let first = 0;
        for (let index = 0; index < count; index++) { const id = this.send(type, { a: 'fragment', key, index, count, chunk: json.slice(index * SYNC_CHUNK, (index + 1) * SYNC_CHUNK) }, to); first ||= id; }
        return first;
      }
    }
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
  #raw(conn, w) {
    try {
      if (!conn?.open) return;
      if ([MSG.P, MSG.M, MSG.TP].includes(w.t) && ((conn.dataChannel?.bufferedAmount ?? 0) > 262144 || (conn.bufferSize ?? 0) > 24)) return;
      conn.send(w);
    } catch { if (this.isGuest && conn === this.hostConn) this._lost(ERR.lost); }
  }

  // ---------- Eingang
  _dispatch(conn, w, peerRec) {
    if (!w || !Object.values(MSG).includes(w.t) || !w.d || typeof w.d !== 'object' || this.closed) return;
    if (this.isHost && peerRec && peerRec.conn !== conn) return;
    if (this.isGuest && conn !== this.hostConn) return;
    if (this.isGuest && [MSG.HELLO, MSG.LOBBY, MSG.CLOSE, MSG.START].includes(w.t) && w.f !== 'p0') return;
    if (w.t === MSG.HELLO && this.isHost) return this.#onHello(conn, w);
    if (this.isHost && !peerRec) return;
    if (peerRec) peerRec.lastRx = now(); else this.lastRx = now();
    if (w.t === MSG.PING) return w.d && Number.isFinite(w.d.s) ? this.#onPing(conn, w, peerRec) : undefined;
    if (w.t === MSG.LEAVE && this.isHost) return this.#removePeer(peerRec.id, 'Raum verlassen');
    if (w.t === MSG.CLOSE && this.isGuest) return this._finalLost(ERR.roomClosed ?? ERR.hostLeft);
    if (w.t === MSG.PROFILE && this.isHost) return peerRec ? this.#onProfile(peerRec, w.d) : undefined;
    const from = peerRec ? peerRec.id : w.f;
    if (this.isHost) {
      if (!peerRec) return; // unbekannte Verbindung (kein hello)
      w.f = peerRec.id;
      w.e = peerRec.epoch;
      if (w.to) { // adressiert: nur an die genannten Mitglieder (Jagd-Verkehr); der Host selbst nur, wenn er genannt ist
        if (!Array.isArray(w.to) || w.to.length > MAX_PLAYERS || !w.to.every(t => typeof t === 'string')) return;
        for (const t of w.to) { const o = this.peers.get(t); if (o && o !== peerRec) this.#raw(o.conn, w); }
        if (!w.to.includes(this.myId)) return;
      } else if (RELAY.has(w.t)) for (const o of this.peers.values()) if (o !== peerRec) this.#raw(o.conn, w);
      if (w.t === MSG.READY) return this.#onReady(peerRec, w.d);
    } else {
      if (w.t === MSG.HELLO) return this.#onWelcome(w.d);
      if (w.t === MSG.LOBBY) { this.roster = w.d.players; this.quest = w.d.quest; this.emit('roster', this.roster); return; }
      if (w.t === MSG.START) { this.started = true; this.roster = w.d.players; }
    }
    if (IDEMPOTENT.has(w.t) && this.dedupe.seen(`${from}:${w.e ?? 0}`, w.i)) return;
    if (w.t === MSG.SYNC && w.d.a === 'fragment') {
      const d = w.d;
      if (typeof d.key !== 'string' || d.key.length > 100 || !Number.isInteger(d.count) || d.count < 1 || d.count > Math.ceil(MAX_SYNC_CHARS / SYNC_CHUNK) || !Number.isInteger(d.index) || d.index < 0 || d.index >= d.count || typeof d.chunk !== 'string' || d.chunk.length > SYNC_CHUNK) return;
      const key = `${from}:${w.e ?? 0}:${d.key}`;
      let entry = this._fragments.get(key);
      if (!entry) {
        while (this._fragments.size >= 8) this._fragments.delete(this._fragments.keys().next().value);
        entry = { count: d.count, chunks: new Map(), at: now() }; this._fragments.set(key, entry);
      }
      if (entry.count !== d.count) return;
      entry.chunks.set(d.index, d.chunk);
      if (entry.chunks.size !== entry.count) return;
      this._fragments.delete(key);
      try { w.d = JSON.parse(Array.from({ length: entry.count }, (_, i) => entry.chunks.get(i)).join('')); } catch { return; }
      if (!w.d || typeof w.d !== 'object' || w.d.a === 'fragment') return;
    }
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
    for (const [key, entry] of this._fragments) if (t - entry.at > 15000) this._fragments.delete(key);
    const ping = () => wrap(MSG.PING, this.myId, 0, { s: t });
    if (this.isHost) {
      for (const p of [...this.peers.values()]) {
        if (p.awayUntil) { if (t >= p.awayUntil) this.#removePeer(p.id, ERR.lost); continue; }
        if (t - p.lastRx > TIMEOUT_MS) { this.#dropPeer(p.id, ERR.lost); continue; }
        this.#raw(p.conn, ping());
      }
    } else if (this.connectionState === 'reconnecting') {
      if (t - this._lostAt >= RECONNECT_GRACE_MS) this._finalLost(ERR.lost);
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
    if (d.v !== BUILD_ID) { reply({ err: 'version' }); setTimeout(() => conn.close(), 200); return; } // alter/neuer Tab: erst neu laden
    let rec = typeof d.resume === 'string' ? [...this.peers.values()].find(p => p.token === d.resume) : null;
    if (d.resume && (!rec || rec.awayUntil && now() >= rec.awayUntil)) { reply({ err: 'resume' }); setTimeout(() => conn.close(), 200); return; }
    if (rec?.conn?.open) { reply({ err: 'busy' }); setTimeout(() => conn.close(), 200); return; }
    if (!rec && this.roster.length >= MAX_PLAYERS) { reply({ err: 'full' }); setTimeout(() => conn.close(), 200); return; }
    const resumed = !!rec;
    const id = rec?.id ?? 'p' + this._nextId++;
    rec = { ...rec, id, name: rec?.name ?? String(d.name ?? 'Pirscher').slice(0, 12), token: rec?.token ?? randomToken(), epoch: (rec?.epoch ?? 0) + 1, conn, rtt: 0, lastRx: now(), awayUntil: 0 };
    this.peers.set(id, rec);
    if (!resumed) this.roster.push({ id, name: rec.name, weapon: d.weapon ?? 'gs', tier: d.tier ?? 1, ready: false, online: true, ...(typeof d.gear === 'string' ? { gear: d.gear.slice(0, 8) } : {}) });
    const row = this.roster.find(p => p.id === id); row.online = true; row.epoch = rec.epoch;
    conn.on('close', () => { if (this.peers.get(id)?.conn === conn) this.#dropPeer(id, ERR.lost); });
    conn.on('error', () => { if (this.peers.get(id)?.conn === conn) this.#dropPeer(id, ERR.lost); });
    reply({ you: id, code: this.code, token: rec.token, epoch: rec.epoch, resumed });
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
    if (this.closed || rec.awayUntil) return;
    const conn = rec.conn; rec.conn = null; rec.awayUntil = now() + RECONNECT_GRACE_MS;
    const row = this.roster.find(p => p.id === id); if (row) row.online = false;
    try { conn?.close(); } catch { /* already closed */ }
    this.#pushLobby();
  }
  #removePeer(id, reason) {
    const rec = this.peers.get(id); if (!rec) return;
    this.peers.delete(id);
    try { rec.conn?.close(); } catch { /* already closed */ }
    const r = this.roster.find((x) => x.id === id);
    this.roster = this.roster.filter((x) => x.id !== id);
    this.#pushLobby();
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
    if (d.err) {
      if (d.err === 'busy') { this._retryDial?.(); return; }
      const message = d.err === 'resume' ? ERR.resume : d.err === 'full' ? ERR.full : d.err === 'version' ? ERR.version : ERR.started;
      if (d.err === 'resume') clearResume(this.code);
      this._joinFail?.(message); return;
    }
    this.myId = d.you;
    this.resumeToken = d.token; saveResume(this.code, d.token);
    this.connectionState = 'connected'; this._lostAt = null; this._attempt = 0; this._connectedOnce = true;
    this.emit('connection', { state: 'connected', resumed: !!d.resumed });
    this.roster = this.roster.length ? this.roster : [];
    this._joinOk?.(this);
  }
  _lost(reason) {
    if (this.closed) return;
    if (!this._connectedOnce) { this._joinFail?.(reason); return; }
    if (this.connectionState !== 'reconnecting') {
      this.connectionState = 'reconnecting'; this._lostAt = now();
      this.emit('connection', { state: 'reconnecting', reason, graceMs: RECONNECT_GRACE_MS });
    }
    this._retryDial?.();
  }
  _finalLost(reason) {
    if (this.closed) return;
    this.emit('close', { reason });
    this.close(false);
  }
  reconnectNow() { if (this.connectionState === 'reconnecting') this._retryDial?.(true); }
  setReady(r) { if (this.isGuest) this.send(MSG.READY, { r: r ? 1 : 0 }); else this.updateSelf({ ready: !!r }); }

  close(notify = true) {
    if (this.closed) return;
    if (notify) { if (this.isHost) this.send(MSG.CLOSE, {}); else { this.send(MSG.LEAVE, {}); clearResume(this.code); } }
    this.closed = true;
    this.connectionState = 'closed';
    clearInterval(this._hb);
    clearTimeout(this._dialTimer); clearTimeout(this._connectTimer); clearTimeout(this._signalTimer); clearTimeout(this._hostRetryTimer); clearTimeout(this._hostConnectTimer);
    globalThis.window?.removeEventListener?.('online', this._wake);
    globalThis.document?.removeEventListener?.('visibilitychange', this._wake);
    setTimeout(() => { try { for (const p of this.peers.values()) p.conn?.close(); this.hostConn?.close(); this.peer?.destroy(); } catch { /* closed */ } }, 150);
    this.handlers.clear();
    this._fragments.clear();
  }
}

// ---------- Fabriken

/** Reopen signaling, or rebuild a destroyed Peer while retaining room IDs and leases. */
function maintainHostTransport(net) {
  let retryAt = null, attempts = 0;
  const recover = () => {
    if (net.closed || net._hostRetryTimer) return;
    if (retryAt === null) {
      retryAt = now(); net.connectionState = 'reconnecting';
      net.emit('connection', { state: 'reconnecting', graceMs: RECONNECT_GRACE_MS });
    }
    if (now() - retryAt >= RECONNECT_GRACE_MS) { net._finalLost(ERR.server); return; }
    net._hostRetryTimer = setTimeout(() => {
      net._hostRetryTimer = null;
      if (net.closed) return;
      if (now() - retryAt >= RECONNECT_GRACE_MS) { net._finalLost(ERR.server); return; }
      const old = net.peer;
      net.peer = null;
      try { old?.destroy(); } catch { /* stale transport */ }
      const peer = net.peer = new Peer(peerIdFor(net.code), peerOptions());
      let opened = false;
      const timeout = net._hostConnectTimer = setTimeout(() => { if (!opened && net.peer === peer) { try { peer.destroy(); } catch { /* retry below */ } recover(); } }, Math.min(CONNECT_TIMEOUT_MS, RECONNECT_GRACE_MS - (now() - retryAt)));
      peer.once('open', () => {
        if (net.closed || net.peer !== peer) return;
        opened = true; clearTimeout(timeout); retryAt = null; attempts = 0;
        bind(peer); net.connectionState = 'connected'; net.emit('connection', { state: 'connected', resumed: true });
      });
      peer.on('error', () => {
        if (opened || net.closed || net.peer !== peer) return;
        clearTimeout(timeout); net.peer = null;
        try { peer.destroy(); } catch { /* retry below */ } recover();
      });
      peer.once('close', () => { if (!opened && !net.closed && net.peer === peer) { clearTimeout(timeout); recover(); } });
    }, Math.min(5000, 400 * 2 ** Math.min(attempts++, 4)));
  };
  const bind = peer => {
    peer.on('connection', conn => {
      if (net.closed || net.peer !== peer) { conn.close(); return; }
      const timeout = setTimeout(() => { if (![...net.peers.values()].some(p => p.conn === conn)) conn.close(); }, CONNECT_TIMEOUT_MS);
      conn.on('close', () => clearTimeout(timeout));
      conn.on('data', w => {
        const rec = [...net.peers.values()].find(p => p.conn === conn);
        if (rec) clearTimeout(timeout);
        if (!net.closed && net.peer === peer) net._dispatch(conn, w, rec);
      });
    });
    const signalRetry = () => {
      if (net.closed || net.peer !== peer || !peer.disconnected) return;
      if (peer.destroyed) { recover(); return; }
      clearTimeout(net._signalTimer);
      net._signalTimer = setTimeout(() => {
        if (net.closed || net.peer !== peer) return;
        try { if (peer.disconnected) peer.reconnect(); } catch { /* retry */ }
        signalRetry();
      }, 1500);
    };
    peer.on('disconnected', signalRetry);
    peer.on('close', () => { if (net.peer === peer) recover(); });
    peer.on('error', () => { if (net.peer === peer && peer.destroyed) recover(); });
  };
  bind(net.peer);
}

/** Host: Raum erzeugen (4-Buchstaben-Code, bei belegter ID neuer Versuch). */
export function hostRoom({ name = 'Pirscher', weapon = 'gs', tier = 1, gear, quest = 'jaggo', code: fixed } = {}) { // [G] gear = compact gear code
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = () => {
      const code = fixed ?? generateRoomCode();
      const peer = new Peer(peerIdFor(code), peerOptions());
      const to = setTimeout(() => { try { peer.destroy(); } catch { /* egal */ } reject(new Error(ERR.server)); }, CONNECT_TIMEOUT_MS);
      let opened = false;
      peer.once('open', () => {
        opened = true;
        clearTimeout(to);
        const net = new Net({ isHost: true, peer, code, name });
        net.quest = quest;
        net.roster = [{ id: 'p0', name, weapon, tier, ready: true, ...(gear ? { gear } : {}) }];
        maintainHostTransport(net);
        resolve(net);
      });
      peer.on('error', (e) => {
        if (opened) return;
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
    const net = new Net({ isHost: false, peer: null, code, name });
    net.resumeToken = loadResume(code);
    let done = false, generation = 0;
    const fail = message => {
      if (!done) { done = true; net.close(false); reject(new Error(message)); }
      else net._finalLost(message);
    };
    const initialDeadline = now() + CONNECT_TIMEOUT_MS;
    net._joinFail = fail;
    net._joinOk = () => { clearTimeout(net._connectTimer); if (!done) { done = true; resolve(net); } };
    const dial = () => {
      if (net.closed) return;
      clearTimeout(net._dialTimer); clearTimeout(net._connectTimer);
      net._dialTimer = null;
      const gen = ++generation;
      const oldPeer = net.peer;
      net.hostConn = null;
      try { oldPeer?.destroy(); } catch { /* already gone */ }
      if (!done && now() >= initialDeadline) { fail(ERR.timeout); return; }
      if (net._lostAt !== null && net._lostAt !== undefined && now() - net._lostAt >= RECONNECT_GRACE_MS) { net._finalLost(ERR.lost); return; }
      const peer = net.peer = new Peer(undefined, peerOptions());
      const current = () => !net.closed && gen === generation;
      const retry = () => { if (!current()) return; if (!done) schedule(); else net._lost(ERR.lost); };
      net._connectTimer = setTimeout(retry, Math.min(CONNECT_TIMEOUT_MS, done ? RECONNECT_GRACE_MS - (now() - net._lostAt) : initialDeadline - now()));
      peer.once('open', () => {
        if (!current()) return;
        const conn = net.hostConn = peer.connect(peerIdFor(code), { reliable: true, serialization: 'json' });
        conn.on('open', () => { if (current()) conn.send(wrap(MSG.HELLO, 'x', 0, { v: BUILD_ID, name, weapon, tier, gear, resume: net.resumeToken })); });
        conn.on('data', w => { if (current()) net._dispatch(conn, w, null); });
        conn.on('close', retry); conn.on('error', retry);
      });
      peer.on('error', e => {
        if (!current()) return;
        // Signaling errors do not tear down a working WebRTC connection.
        if (net.hostConn?.open && ['network', 'socket-error', 'socket-closed', 'disconnected', 'peer-unavailable'].includes(e.type)) return;
        if (!done && e.type === 'peer-unavailable' && !net.resumeToken) fail(ERR.notFound); else retry();
      });
      peer.on('disconnected', () => { if (current() && net.hostConn?.open) { try { peer.reconnect(); } catch { retry(); } } });
    };
    const schedule = (immediate = false) => {
      if (net.closed) return;
      if (net._dialTimer && !immediate) return;
      clearTimeout(net._dialTimer); clearTimeout(net._connectTimer);
      const delay = immediate ? 0 : Math.min(5000, 400 * 2 ** Math.min(net._attempt ?? 0, 4));
      net._attempt = (net._attempt ?? 0) + 1;
      net._dialTimer = setTimeout(dial, delay);
    };
    net._retryDial = schedule;
    dial();
  });
}

