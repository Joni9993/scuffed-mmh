import { hostRoom, joinRoom } from './net.js';
import { MSG, ERR } from './protocol.js';

export const MEMBER_COLORS = ['#5ad8ff', '#ff9a3a', '#7dff7d', '#ff6bd6'];
ERR.roomClosed = 'Der Raum-Host ist weg. Du jagst jetzt in deinem eigenen Rostnest.';

/**
 * Raum-Sitzung (session-level, überdauert Stadt -> Jagd -> Ergebnis -> Stadt).
 *   role: 'solo' (eigener Raum ohne Netz) | 'host' (Raumcode offen, bis zu 3 Gäste) | 'guest'
 *   members: [{ id, name, color, weapon, tier, you }]       (id 'p0' = Raum-Host)
 *   events (on): 'members', 'peer-leave' {id,name}, 'closed' {reason} (Raum-Host weg -> wieder solo), 'role',
 *                dazu jeder Nachrichtentyp (p, tp, qb, …) als (payload, fromId)
 *   send(type, payload, to?)   to = Id oder Id-Liste (Host leitet weiter); ohne to: Gast -> Host, Host -> alle
 * Generisch nutzbar von Stadt (Präsenz, Auftragsbrett) und Jagd (HuntChannel).
 */
export class Session {
  constructor(profile = {}) {
    this.profile = { name: profile.name ?? 'Pirscher', weapon: profile.weapon ?? 'gs', tier: profile.tier ?? 1 };
    this.handlers = new Map();
    this.#reset();
  }
  #reset() {
    this.net = null;
    this.role = 'solo';
    this.myId = 'p0';
    this.code = null;
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
    this.net?.updateSelf?.(p); // Host: sofort an alle; Gäste: gilt ab dem nächsten Beitritt
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
      else if (type === 'close') {
        this.#reset();
        this.emit('closed', { reason: ERR.roomClosed });
        this.emit('role', this.role);
        this.emit('members', this.members);
      } else if (type === 'peer-leave') this.emit('peer-leave', d);
      else this.emit(type, d, from);
    });
    this.emit('role', role);
    this.emit('members', this.members);
  }
  #syncMembers(roster, notify) {
    const old = this.members;
    this.members = roster.map((r, i) => ({ id: r.id, name: r.name, weapon: r.weapon, tier: r.tier, color: MEMBER_COLORS[Number(r.id.slice(1)) % 4] ?? MEMBER_COLORS[i % 4], you: r.id === this.myId }));
    if (!notify) return;
    if (this.role === 'guest') for (const m of old) if (!this.members.some((x) => x.id === m.id)) this.emit('peer-leave', { id: m.id, name: m.name });
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
export function createHuntChannel(sess, { hostId, members, onDispose } = {}) {
  const ids = members ?? sess.members.map((m) => m.id);
  const offs = [];
  const ch = {
    session: sess, hostId, members: ids, myId: sess.myId,
    isHost: sess.myId === hostId, isGuest: sess.myId !== hostId,
    others: () => ids.filter((i) => i !== sess.myId),
    sendAll(type, d) { const o = ch.others(); if (o.length) sess.send(type, d, o); },
    sendHost(type, d) { if (!ch.isHost) sess.send(type, d, [hostId]); },
    /** nur Nachrichten von Teilnehmern */
    on(type, fn) { const off = sess.on(type, (d, from, t) => { if (ids.includes(from)) fn(d, from, t); }); offs.push(off); return off; },
    onLeave(fn) { offs.push(sess.on('peer-leave', (e) => { if (ids.includes(e.id)) fn(e); })); },
    onLost(fn) { offs.push(sess.on('closed', fn)); },
    get rtt() { return sess.rtt; },
    rttOf: (id) => sess.rttOf(id),
    dispose() { for (const f of offs) f(); offs.length = 0; onDispose?.(); },
  };
  return ch;
}
export { MSG };
