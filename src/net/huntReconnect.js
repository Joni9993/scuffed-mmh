import { MSG } from './protocol.js';
import { randomToken } from './resumeIdentity.js';
import { captureHunt, restoreHunt, capturePersonal, restorePersonal, loadCheckpoint, saveCheckpoint, validPersonal, validHuntSnapshot } from './huntSnapshot.js';

const seconds = () => performance.now() / 1000;
const MAX_SYNC_MS = 25000;

/** Keeps the existing Hunt alive across a reconnect; late join is a two-phase host handshake. */
export class HuntReconnect {
  constructor(sync, opts) {
    this.sync = sync; this.h = sync.hunt; this.channel = sync.net; this.round = this.channel.roundId;
    this.personal = new Map(); this.offers = new Map(); this.koCounts = new Map(); this.offs = [];
    this.saved = loadCheckpoint(this.round, this.h.player.id); this.sequence = this.saved?.seq ?? 0;
    this.h.inventory.onChange = () => { if (!this.waiting) this.checkpoint(); };
    this.h.meta.chest.onChange = () => { if (!this.waiting) this.checkpoint(); };
    this.waiting = !!opts.joining; this.startedAt = seconds(); this.lastRequest = -99; this.lastCheckpoint = -99;
    this.offs.push(this.channel.on(MSG.SYNC, (d, from) => this.receive(d, from)));
    const add = off => { if (off) this.offs.push(off); };
    add(this.channel.onMembers?.((ids, pending) => this.members(ids, pending)));
    this.channel.onAway?.(p => this.away(p.id));
    this.channel.onReturn?.(p => this.returned(p.id));
    this.channel.onConnection?.(d => {
      if (d.state === 'reconnecting') { this.checkpoint(); this.waiting = !sync.isHost; this.startedAt = seconds(); }
      else if (d.state === 'connected') {
        if (sync.isHost) for (const id of this.channel.others()) this.offer(id);
        else { this.waiting = true; this.startedAt = seconds(); this.request(true); }
      }
    });
    for (const type of ['itemUsed', 'gathered', 'carved', 'playerDown']) this.offs.push(this.h.bus.on(type, () => { if (!this.waiting) this.checkpoint(); }));
    this._hide = () => { if (globalThis.document?.hidden && !this.waiting) this.checkpoint(); };
    globalThis.document?.addEventListener?.('visibilitychange', this._hide);
  }
  get blocked() {
    return !this.rejected && (this.channel.reconnecting || this.waiting || (!this.sync.isHost && this.channel.session?.member(this.channel.hostId)?.online === false));
  }
  checkpoint() {
    if (!this.round || !this.h.inventory || this.h.meta.phase === 'leaving') return;
    const d = capturePersonal(this.h, this.round, ++this.sequence); this.saved = d; saveCheckpoint(d);
    if (this.sync.isHost) this.personal.set(this.h.player.id, d);
    else if (!this.channel.reconnecting) this.channel.sendHost(MSG.SYNC, { a: 'checkpoint', round: this.round, data: d });
  }
  pump() {
    if (this.blocked) {
      this.h.player.netAway = true; this.h.input.reset();
      if (this.hudWasBlocked !== true) { this.h.app.touch?.setVisible(false); this.hudWasBlocked = true; }
      this.h.hud.connection?.(this.channel.reconnecting ? 'Verbindung wird wiederhergestellt …' : this.channel.session?.member(this.channel.hostId)?.online === false ? 'Warte auf den Jagd-Host …' : 'Jagd wird synchronisiert …', this.h);
      if (!this.sync.isHost && !this.channel.reconnecting && this.channel.session?.member(this.channel.hostId)?.online !== false) this.request();
      if (this.waiting && !this.channel.reconnecting && this.channel.session?.member(this.channel.hostId)?.online !== false && seconds() - this.startedAt > MAX_SYNC_MS / 1000) this.reject('Der Jagd-Host antwortet nicht. Bitte erneut beitreten.');
      return true;
    }
    if (this.hudWasBlocked) { this.hudWasBlocked = false; this.h.hud.connection?.(''); this.h.player.netAway = false; this.h.input.reset(); this.h.app.touch?.setVisible(!this.h.panelOpen && !this.h.paused); }
    if (!this.h.result && seconds() - this.lastCheckpoint > .75) { this.lastCheckpoint = seconds(); this.checkpoint(); }
    return false;
  }
  request(force = false) {
    if (this.sync.isHost || !this.round || !force && seconds() - this.lastRequest < 1) return;
    this.lastRequest = seconds(); this.channel.sendHost(MSG.SYNC, { a: 'request', round: this.round });
  }
  info(id) { const m = this.channel.session.member(id); return m ? { ...m, slot: this.channel.members.indexOf(id) } : null; }
  members(ids, pending = []) {
    for (const id of ids) {
      if (id === this.h.player.id || pending.includes(id)) continue;
      const info = this.info(id); if (!info) continue;
      this.sync.addParticipant(info);
      if (this.sync.isHost && this.offers.get(id)?.acked) this.activate(id);
    }
    for (const id of [...this.sync.peers.keys()]) if (!ids.includes(id)) this.sync.removeParticipant(id);
  }
  away(id) {
    const p = this.sync.peers.get(id)?.player;
    if (p) { p.netAway = true; p.mesh.visible = false; p.rig.shadow.visible = false; }
    if (id === this.channel.hostId) { this.checkpoint(); this.waiting = true; this.startedAt = seconds(); }
  }
  returned(id) {
    if (this.sync.isHost) this.offer(id);
    if (id === this.channel.hostId && !this.sync.isHost) { this.waiting = true; this.startedAt = seconds(); this.request(true); }
  }
  offer(id) {
    if (!this.sync.isHost || id === this.h.player.id || !this.channel.members.includes(id)) return;
    if (this.h.result && this.channel.pending.includes(id)) { this.channel.sendTo(MSG.SYNC, { a: 'reject', round: this.round, reason: 'Diese Jagd ist bereits beendet.' }, [id]); return; }
    const entry = this.offers.get(id) ?? { nonce: randomToken(), acked: false }; this.offers.set(id, entry);
    this.channel.sendTo(MSG.SYNC, { a: 'offer', round: this.round, nonce: entry.nonce, state: captureHunt(this.h), personal: this.personal.get(id) }, [id]);
  }
  activate(id) {
    const entry = this.offers.get(id); if (!entry?.acked) return;
    const peer = this.sync.peers.get(id);
    if (peer) { peer.player.netAway = false; peer.player.mesh.visible = true; peer.player.rig.shadow.visible = true; peer.buf.clear(); }
    this.channel.sendTo(MSG.SYNC, { a: 'activate', round: this.round, nonce: entry.nonce, state: captureHunt(this.h), personal: this.personal.get(id) }, [id]);
    this.channel.sendAll(MSG.SYNC, { a: 'ready', round: this.round, id });
    this.offers.delete(id);
  }
  recordKo(id, n) {
    if (!this.sync.isHost || !Number.isInteger(n) || n < 0 || n > 3) return;
    const before = this.koCounts.get(id) ?? 0;
    if (n <= before) return;
    this.koCounts.set(id, n);
    for (let i = before; i < n; i++) this.h.netKo(id);
  }
  receive(d, from) {
    if (!d || d.round !== this.round) return;
    if (this.sync.isHost) {
      if (!this.channel.members.includes(from) || from === this.h.player.id) return;
      if (d.a === 'request') this.offer(from);
      if (d.a === 'checkpoint' && validPersonal(d.data, this.round, from) && d.data.seq > (this.personal.get(from)?.seq ?? -1)) {
        this.personal.set(from, d.data); this.h.report?.accept(from, { ...d.data.stats, ...d.data.localReport }); this.recordKo(from, d.data.stats?.kos);
      }
      if (d.a === 'ack') {
        if (this.h.result && this.channel.pending.includes(from)) { this.channel.sendTo(MSG.SYNC, { a: 'reject', round: this.round, reason: 'Diese Jagd ist bereits beendet.' }, [from]); return; }
        const entry = this.offers.get(from); if (!entry || entry.nonce !== d.nonce) return;
        entry.acked = true;
        if (this.channel.pending.includes(from)) this.channel.confirm(from); else this.activate(from);
      }
      return;
    }
    if (from !== this.channel.hostId) return;
    if (d.a === 'ready' && this.channel.members.includes(d.id)) {
      const peer = this.sync.peers.get(d.id);
      if (peer && this.channel.session.member(d.id)?.online !== false) { peer.player.netAway = false; peer.player.mesh.visible = true; peer.player.rig.shadow.visible = true; peer.buf.clear(); }
      return;
    }
    if (d.a === 'reject') { this.reject(d.reason); return; }
    if (d.a === 'offer') {
      if (!validHuntSnapshot(d.state) || typeof d.nonce !== 'string') return;
      if (!this.waiting) { this.checkpoint(); this.waiting = true; this.startedAt = seconds(); }
      this.nonce = d.nonce; this.h.player.netAway = true;
      if (!restoreHunt(this.h, d.state)) return;
      this.channel.sendHost(MSG.SYNC, { a: 'ack', round: this.round, nonce: d.nonce });
    }
    if (d.a === 'activate' && d.nonce === this.nonce && validHuntSnapshot(d.state)) {
      this.h.player.netAway = true; restoreHunt(this.h, d.state);
      let personal = this.saved;
      if (validPersonal(d.personal, this.round, this.h.player.id) && (!personal || d.personal.seq > personal.seq)) personal = d.personal;
      if (personal) { restorePersonal(this.h, personal); this.sequence = Math.max(this.sequence, personal.seq); }
      const p = this.h.player, camp = this.h.world.campPoint;
      p.spawnAt(camp.x, camp.z, p.rot); p.invuln = Math.max(p.invuln, 1.5); p.netAway = false; this.h.rig.snap(p.pos, p.rot);
      this.waiting = false; this.cutoff = d.state.stamp ?? 0; this.h.net.monBuf.clear(); for (const peer of this.sync.peers.values()) peer.buf.clear();
      this.h.meta.breaks = d.state.meta.breaks;
      if (d.state.result) {
        this.sync.ended = true;
        this.h.netFinish(d.state.result, d.state.reason);
        this.h.meta.phase = d.state.meta.phase === 'carve' ? 'carve' : 'fight'; this.h.meta.carveT = d.state.meta.carveT; this.h.meta.endT = d.state.meta.endT || (this.h.meta.phase === 'carve' ? 0 : 1);
      }
      this.checkpoint(); this.h.hud.center('Wieder auf der Jagd!', 1.5);
    }
  }
  reject(message) { this.rejected = true; this.waiting = false; this.channel.board?.returned(); this.h.netAbort(String(message ?? 'Beitritt nicht möglich.')); }
  dispose() {
    if (this.sync.isHost && this.h.result && this.h.result !== 'abort' && this.channel.rawSession) {
      const cache = this.channel.rawSession.completedHunts;
      cache.set(this.round, { until: Date.now() + 90000, members: this.h.report.roster().map(p => p.id), state: captureHunt(this.h), personal: new Map(this.personal), nonces: new Map() });
      while (cache.size > 6) cache.delete(cache.keys().next().value);
    }
    if (!this.waiting) this.checkpoint();
    this.offs.forEach(off => off()); globalThis.document?.removeEventListener?.('visibilitychange', this._hide);
    this.h.inventory.onChange = null; this.h.meta.chest.onChange = null;
  }
}
