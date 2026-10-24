import { MSG, MAX_PLAYERS } from './protocol.js';
import { cleanMutatorIds } from '../data/mutators.js';
import { cleanPostGlitch } from '../data/glitchTiers.js';
import { randomToken } from './resumeIdentity.js';

/**
 * Auftragsbrett-Zustand (rein, unit-getestet). Der Raum-Host ist die Wahrheit; Gäste spiegeln `snapshot()`.
 * post = { postId, questId, hostId (Poster = Jagd-Host), members:[{id, ready}], mutators:[id] (0-2, sichtbar vor Abflug; Glitch-Stufe/Wochen-Glitch: bis 5),
 *          tier (Glitch-Stufe 0-10, Mutatoren kommen dann aus data/glitchTiers.js), weekly ('2026-W43' oder null) }
 * Regeln: ein Mitglied ist in höchstens einem Auftrag; sind alle Mitglieder eines Auftrags bereit, startet er
 * (Auftrag verschwindet, Mitglieder gelten als „unterwegs" bis `back`); Poster weg -> Auftrag gelöscht.
 */
export class QuestBoardState {
  constructor() { this.posts = []; this.active = []; this.busy = new Set(); this.n = 0; this.namespace = randomToken().slice(0, 12); }
  postOf(id) { return this.posts.find((p) => p.members.some((m) => m.id === id)) ?? null; }
  snapshot() { return JSON.parse(JSON.stringify({ posts: this.posts, active: this.active, busy: [...this.busy] })); }
  load(s) { this.posts = Array.isArray(s.posts) ? s.posts : []; this.active = Array.isArray(s.active) ? s.active : []; this.busy = new Set(s.busy ?? []); }

  /** msg: { a:'post', questId, mutators?, tier?, weekly? } | { a:'join', postId } | { a:'ready', r } | { a:'leave' } | { a:'back' } → { changed, start } */
  apply(from, msg, seed = 1) {
    const res = { changed: false, start: null };
    if (!msg || typeof msg.a !== 'string') return res;
    if (msg.a === 'finish') {
      const p = this.active.find(p => p.postId === msg.postId && p.hostId === from);
      if (p) { p.phase = 'ended'; p.endedAt = Date.now(); res.changed = true; }
      return res;
    }
    if (msg.a === 'confirm') {
      const p = this.active.find(p => p.postId === msg.postId && p.hostId === from);
      if (p?.pending.includes(msg.id)) { p.pending = p.pending.filter(id => id !== msg.id); res.changed = true; }
      return res;
    }
    if (msg.a === 'back') {
      res.changed = this.busy.delete(from);
      for (const p of this.active) if (p.members.includes(from)) {
        p.members = p.members.filter(id => id !== from); p.pending = p.pending.filter(id => id !== from); res.changed = true;
        if (p.hostId === from) { p.phase = 'ended'; p.endedAt ??= Date.now(); }
      }
      return res;
    }
    if (msg.a === 'joinRunning') {
      const p = this.active.find(p => p.postId === msg.postId);
      if (!p || this.postOf(from) || this.busy.has(from) || p.phase !== 'running' || p.members.length >= MAX_PLAYERS) return res;
      p.members.push(from); p.participants = [...new Set([...p.participants, from])]; p.pending.push(from); this.busy.add(from);
      res.changed = true; res.start = { ...p, lateJoin: true, to: from }; return res;
    }
    if (this.busy.has(from)) return res;
    const mine = this.postOf(from);
    switch (msg.a) {
      case 'post':
        if (mine || typeof msg.questId !== 'string') break;
        { const g = cleanPostGlitch(msg.questId, msg, cleanMutatorIds); // Stufe/Woche vom Host bereinigt, nie blind übernommen
          this.posts.push({ postId: `${this.namespace}-${from}-${++this.n}`, questId: msg.questId, mutators: g.mutators, tier: g.tier, weekly: g.weekly, hostId: from, members: [{ id: from, ready: false }] }); }
        res.changed = true;
        break;
      case 'join': {
        const p = this.posts.find((x) => x.postId === msg.postId);
        if (!p || mine || p.members.length >= MAX_PLAYERS) break;
        p.members.push({ id: from, ready: false });
        res.changed = true;
        break;
      }
      case 'leave':
        if (mine) { this.#drop(from); res.changed = true; }
        break;
      case 'ready': {
        if (!mine) break;
        const m = mine.members.find((x) => x.id === from);
        m.ready = !!msg.r;
        res.changed = true;
        if (mine.members.every((x) => x.ready)) {
          this.posts = this.posts.filter((p) => p !== mine);
          for (const x of mine.members) this.busy.add(x.id);
          res.start = { postId: mine.postId, questId: mine.questId, mutators: mine.mutators ?? [], tier: mine.tier ?? 0, weekly: mine.weekly ?? null, hostId: mine.hostId, members: mine.members.map((x) => x.id), seed };
          this.active.push({ ...res.start, participants: [...res.start.members], pending: [], phase: 'running', createdAt: Date.now() });
          this.active = this.active.filter(p => p.phase !== 'ended' || Date.now() - p.endedAt < 90000);
        }
        break;
      }
    }
    return res;
  }
  #drop(id) {
    const p = this.postOf(id);
    if (!p) return;
    if (p.hostId === id) this.posts = this.posts.filter((x) => x !== p);
    else p.members = p.members.filter((m) => m.id !== id);
  }
  /** Mitglied hat den Raum verlassen. */
  removeMember(id) {
    const had = !!this.postOf(id) || this.busy.has(id) || this.active.some(p => p.members.includes(id));
    this.#drop(id);
    this.busy.delete(id);
    for (const p of this.active) {
      p.members = p.members.filter(x => x !== id); p.pending = p.pending.filter(x => x !== id);
      if (p.hostId === id) { p.phase = 'ended'; p.endedAt = Date.now(); }
    }
    return had;
  }
}

/**
 * Adapter für das Auftragsbrett-UI (P): { getPosted(), post(questId), join(postId), setReady(bool), onChange(fn) }
 * plus leavePost(), myPost(), onStart(fn) (Jagd startet: { postId, questId, hostId, members, seed }), returned() (nach der Jagd).
 * Funktioniert solo (lokale Wahrheit), als Raum-Host und als Gast.
 */
export function createQuestBoard(session) {
  const st = new QuestBoardState();
  const changeFns = new Set(), startFns = new Set();
  const changed = () => { for (const f of [...changeFns]) f(api.getPosted()); };
  const isAuth = () => session.isRoomHost;

  const broadcast = () => session.send(MSG.QB, { a: 'state', ...st.snapshot() });
  const run = (from, msg) => {
    if (msg.a === 'sync') { broadcast(); return; }
    if (msg.a === 'resume') {
      const p = st.active.find(p => p.members.includes(from) && st.busy.has(from));
      if (p) { const data = { a: 'start', ...p, lateJoin: true, returning: true }; if (from === session.myId) for (const f of [...startFns]) f(data); else session.send(MSG.QB, data, [from]); }
      return;
    }
    if (msg.a === 'joinRunning') {
      const p = st.active.find(p => p.postId === msg.postId);
      if (!p || session.member(p.hostId)?.online === false) return;
    }
    const seed = Math.floor(Math.random() * 1e9) + 2;
    const r = st.apply(from, msg, seed);
    if (r.changed) { broadcast(); changed(); }
    if (r.start) {
      const recipients = r.start.to ? [r.start.to] : r.start.members;
      const others = recipients.filter((i) => i !== session.myId);
      if (others.length) session.send(MSG.QB, { a: 'start', ...r.start }, others);
      if (recipients.includes(session.myId)) for (const f of [...startFns]) f(r.start);
    }
  };
  const act = (msg) => { if (isAuth()) run(session.myId, msg); else session.send(MSG.QB, msg, [session.hostId]); };

  session.on(MSG.QB, (d, from) => {
    if (!d || typeof d.a !== 'string') return;
    if (isAuth()) { if (from !== session.myId && session.member(from)) run(from, d); return; }
    if (from !== session.hostId) return;
    if (d.a === 'state') { st.load(d); changed(); }
    else if (d.a === 'start') for (const f of [...startFns]) f(d);
  });
  session.on('peer-leave', ({ id }) => { if (isAuth() && st.removeMember(id)) { broadcast(); changed(); } });
  session.on('peer-away', ({ id }) => {
    if (!isAuth()) return;
    const post = st.postOf(id), member = post?.members.find(m => m.id === id);
    if (member?.ready) { member.ready = false; broadcast(); changed(); }
  });
  session.on('members', () => { // neue Gäste bekommen den aktuellen Stand
    if (isAuth() && session.role === 'host') broadcast();
  });
  session.on('connection', d => { if (d.state === 'connected' && session.role === 'guest') { act({ a: 'sync' }); act({ a: 'resume' }); } });
  session.on('role', () => { st.load({ posts: [], busy: [] }); changed(); });

  const api = {
    state: st,
    getRunning() { return st.active.filter(p => p.phase === 'running').map(p => ({ ...p, hostName: session.member(p.hostId)?.name ?? '?', online: session.member(p.hostId)?.online !== false })); },
    joinRunning(postId) { act({ a: 'joinRunning', postId }); },
    confirm(postId, id) { act({ a: 'confirm', postId, id }); },
    finish(postId) { act({ a: 'finish', postId }); },
    resume() { act({ a: 'resume' }); },
    getPosted() {
      return st.posts.map((p) => ({
        postId: p.postId, questId: p.questId, mutators: p.mutators ?? [], tier: p.tier ?? 0, weekly: p.weekly ?? null, hostId: p.hostId, hostName: session.member(p.hostId)?.name ?? '?',
        members: p.members.map((m) => ({ ...m, name: session.member(m.id)?.name ?? '?' })), joined: p.members.some((m) => m.id === session.myId),
        ready: p.members.find((m) => m.id === session.myId)?.ready ?? false, full: p.members.length >= MAX_PLAYERS,
      }));
    },
    myPost() { return api.getPosted().find((p) => p.joined) ?? null; },
    /** extra: { tier?, weekly? } – Glitch-Stufe 0-10 bzw. Wochenschlüssel; der Raum-Host bereinigt beides. */
    post(questId, mutators = [], extra = {}) { act({ a: 'post', questId, mutators: cleanPostGlitch(questId, { ...extra, mutators }, cleanMutatorIds).mutators, tier: extra.tier ?? 0, weekly: extra.weekly ?? null }); },
    join(postId) { act({ a: 'join', postId }); },
    leavePost() { act({ a: 'leave' }); },
    setReady(r) { act({ a: 'ready', r: !!r }); },
    onChange(fn) { changeFns.add(fn); return () => changeFns.delete(fn); },
    onStart(fn) { startFns.add(fn); return () => startFns.delete(fn); },
    /** nach der Jagd: wieder in der Stadt */
    returned() { act({ a: 'back' }); },
  };
  return api;
}

let _board = null;
/** Auftragsbrett der gemeinsamen Sitzung (einmalig). */
export function getQuestBoard(session) {
  if (!_board || _board.session !== session) { _board = createQuestBoard(session); _board.session = session; }
  return _board;
}
