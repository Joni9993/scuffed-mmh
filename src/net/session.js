import { hostRoom, joinRoom } from './net.js';
import { MSG, ERR } from './protocol.js';
import { resolveColorIdx, gearColorIdx } from './colors.js';
import { PLAYER_COLORS } from '../meta/save.js';
import { installCompletedResume } from './completedResume.js';

export const MEMBER_COLORS = ['#5ad8ff', '#ff9a3a', '#7dff7d', '#ff6bd6', '#c08aff', '#ffd84a'];
ERR.roomClosed = 'Der Raum-Host ist weg. Du jagst jetzt in deinem eigenen Rostnest.';

/**
 * Raum-Sitzung (session-level, überdauert Stadt -> Jagd -> Ergebnis -> Stadt).
 *   role: 'solo' (eigener Raum ohne Netz) | 'host' (Raumcode offen, bis zu 5 Gäste) | 'guest'
 *   members: [{ id, name, color, weapon, tier, you }]       (id 'p0' = Raum-Host)
 *   events (on): 'members', 'peer-leave' {id,name}, 'closed' {reason} (Raum-Host weg -> wieder solo), 'role',
 *                dazu jeder Nachrichtentyp (p, tp, qb, …) als (payload, fromId)
 *   send(type, payload, to?)   to = Id oder Id-Liste (Host leitet weiter); ohne to: Gast -> Host, Host -> alle
 * Generisch nutzbar von Stadt (Präsenz, Auftragsbrett) und Jagd (HuntChannel).
 */
export class Session {
  constructor(profile = {}) {
    this.profile = { name: profile.name ?? 'Pirscher', weapon: profile.weapon ?? 'gs', tier: profile.tier ?? 1, gear: profile.gear }; // [G] gear = compact code (data/gearlook.js)
    this.handlers = new Map();
    this.#reset();
    installCompletedResume(this);
  }
  #reset() {
    this.net = null;
    this.role = 'solo';
    this.myId = 'p0';
    this.code = null;
    this.connectionState = 'connected';
    this.completedHunts = new Map();
    this.members = [{ id: 'p0', ...this.profile, color: MEMBER_COLORS[0], you: true }];
  }
  get isRoomHost() { return this.role !== 'guest'; }
  get hostId() { return 'p0'; }
  get rtt() { return this.net?.rtt ?? 0; }
  rttOf(id) { return this.net?.rttOf(id) ?? 0; }
  member(id) { return this.members.find((m) => m.id === id); }

  setProfile(p) {
    Object.assign(this.profile, p);
    const me = this.member(this.myId);
    if (me) Object.assign(me, p);
    this.net?.updateSelf?.(p); // Host: sofort an alle; Gast: 'prof' an den Host, der das Roster neu verteilt
    this.emit('members', this.members);
  }

  // ---------- Ereignisse
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, d, from) { for (const fn of [...(this.handlers.get(type) ?? [])]) fn(d, from, type); }
  send(type, d, to) { return this.net ? this.net.send(type, d, to) : 0; }

  // ---------- Raum
  /** „Eigenes Rostnest": Raum öffnen (Code anzeigen). Gibt den Code zurück. */
  async host() {
    if (this.role === 'host') return this.code;
    this.leave();
    this.#attach(await hostRoom({ ...this.profile }), 'host');
    return this.code;
  }
  /** „Rostnest beitreten": wirft mit deutschem Text bei Fehlern. */
  async join(code) {
    if (this.role === 'guest' && this.code === String(code).toUpperCase() && !this.net?.closed) return;
    this.leave();
    this.#attach(await joinRoom(code, { ...this.profile }), 'guest');
  }
  leave() {
    const had = this.net;
    this.net?.close();
    this.#reset();
    if (had) { this.emit('role', this.role); this.emit('members', this.members); }
  }

  #attach(net, role) {
    this.net = net;
    this.role = role;
    this.myId = net.myId;
    this.code = net.code;
    this.#syncMembers(net.roster, false);
    net.on('*', (d, from, wire, type) => {
      if (net !== this.net) return;
      if (type === 'roster') this.#syncMembers(d, true);
      else if (type === 'connection') { this.connectionState = d.state; this.emit('connection', d); }
      else if (type === 'close') {
        this.#reset();
        this.emit('closed', { reason: d.reason ?? ERR.roomClosed });
        this.emit('role', this.role);
        this.emit('members', this.members);
      } else if (type === 'peer-leave') this.emit('peer-leave', d);
      else this.emit(type, d, from);
    });
    this.emit('role', role);
    this.emit('members', this.members);
    if (role === 'guest') { this.send(MSG.QB, { a: 'sync' }, [this.hostId]); this.send(MSG.QB, { a: 'resume' }, [this.hostId]); }
  }
  #syncMembers(roster, notify) {
    const old = this.members;
    const idx = resolveColorIdx(roster.map((r) => gearColorIdx(r.gear))); // Standardfarbe -> je Slot eindeutige Farbe
    this.members = roster.map((r, i) => ({ id: r.id, name: r.name, weapon: r.weapon, tier: r.tier, gear: r.gear, online: r.online !== false, epoch: r.epoch ?? 0, colorIdx: idx[i], color: PLAYER_COLORS[idx[i]] ?? MEMBER_COLORS[i % MEMBER_COLORS.length], you: r.id === this.myId }));
    if (!notify) return;
    if (this.role === 'guest') for (const m of old) if (!this.members.some((x) => x.id === m.id)) this.emit('peer-leave', { id: m.id, name: m.name });
    for (const m of this.members) {
      const prev = old.find(p => p.id === m.id);
      if (prev && prev.online !== false && !m.online) this.emit('peer-away', m);
      if (prev && m.online && (prev.online === false || prev.epoch !== m.epoch)) this.emit('peer-return', m);
    }
    this.emit('members', this.members);
  }
}

/** Gemeinsame Sitzung der App (Stadt, Lobby und Jagd benutzen dieselbe). */
export const session = new Session();

/**
 * Jagd-Kanal: Verkehr der Jagd geht nur an die Teilnehmer des Auftrags; der Jagd-Host (Brocken-Autorität) kann ein anderer
 * sein als der Raum-Host. Die Sitzung bleibt beim Verlassen der Jagd bestehen (dispose schließt sie NICHT).
 * Vertrag für HuntNet: isHost, isGuest, myId, hostId, members, sendAll, sendHost, on, onLeave, onLost, rtt, rttOf, dispose.
 */
export function createHuntChannel(sess, { hostId, members, roundId, board, onDispose } = {}) {
  let ids = [...new Set([hostId, ...(members ?? sess.members.map((m) => m.id))].filter(Boolean))];
  const offs = [];
  const memberFns = new Set();
  const address = d => roundId ? { ...d, _hunt: roundId } : d;
  const sendTo = (type, d, to) => sess.send(type, address(d), to);
  const scopedSession = Object.create(sess);
  scopedSession.send = sendTo;
  scopedSession.member = id => sess.member(id);
  const ch = {
    session: scopedSession, rawSession: sess, hostId, roundId, get members() { return ids; }, myId: sess.myId, board,
    isHost: sess.myId === hostId, isGuest: sess.myId !== hostId,
    others: () => ids.filter((i) => i !== sess.myId),
    sendAll(type, d) { const o = ch.others(); if (o.length) sendTo(type, d, o); },
    sendHost(type, d) { if (!ch.isHost) sendTo(type, d, [hostId]); },
    sendTo,
    /** nur Nachrichten von Teilnehmern */
    on(type, fn) { const off = sess.on(type, (d, from, t) => { if (ids.includes(from) && (!roundId || d?._hunt === roundId)) fn(d, from, t); }); offs.push(off); return off; },
    onLeave(fn) { offs.push(sess.on('peer-leave', (e) => { if (ids.includes(e.id)) fn(e); })); },
    onLost(fn) { offs.push(sess.on('closed', fn)); },
    onAway(fn) { offs.push(sess.on('peer-away', e => { if (ids.includes(e.id)) fn(e); })); },
    onReturn(fn) { offs.push(sess.on('peer-return', e => { if (ids.includes(e.id)) fn(e); })); },
    onConnection(fn) { offs.push(sess.on('connection', fn)); },
    onMembers(fn) { memberFns.add(fn); return () => memberFns.delete(fn); },
    get reconnecting() { return sess.connectionState === 'reconnecting'; },
    get pending() { return board?.state.active.find(p => p.postId === roundId)?.pending ?? []; },
    confirm(id) { board?.confirm(roundId, id); },
    finish() { board?.finish(roundId); },
    get rtt() { return sess.rtt; },
    rttOf: (id) => sess.rttOf(id),
    dispose() { for (const f of offs) f(); offs.length = 0; memberFns.clear(); onDispose?.(); },
  };
  if (board) offs.push(board.onChange(() => {
    const active = board.state.active.find(p => p.postId === roundId);
    if (!active) return;
    ids = [...new Set([hostId, ...active.members])];
    for (const fn of memberFns) fn(ids, active.pending ?? []);
  }));
  return ch;
}
export { MSG };
