import { MSG, MAX_PLAYERS } from './protocol.js';
import { cleanMutatorIds } from '../data/mutators.js';

/**
 * Auftragsbrett-Zustand (rein, unit-getestet). Der Raum-Host ist die Wahrheit; Gäste spiegeln `snapshot()`.
 * post = { postId, questId, hostId (Poster = Jagd-Host), members:[{id, ready}], mutators:[id] (0-2, sichtbar vor Abflug) }
 * Regeln: ein Mitglied ist in höchstens einem Auftrag; sind alle Mitglieder eines Auftrags bereit, startet er
 * (Auftrag verschwindet, Mitglieder gelten als „unterwegs" bis `back`); Poster weg -> Auftrag gelöscht.
 */
export class QuestBoardState {
  constructor() { this.posts = []; this.busy = new Set(); this.n = 0; }
  postOf(id) { return this.posts.find((p) => p.members.some((m) => m.id === id)) ?? null; }
  snapshot() { return JSON.parse(JSON.stringify({ posts: this.posts, busy: [...this.busy] })); }
  load(s) { this.posts = s.posts; this.busy = new Set(s.busy); }

  /** msg: { a:'post', questId, mutators? } | { a:'join', postId } | { a:'ready', r } | { a:'leave' } | { a:'back' } → { changed, start } */
  apply(from, msg, seed = 1) {
    const res = { changed: false, start: null };
    if (msg.a === 'back') { res.changed = this.busy.delete(from); return res; }
    if (this.busy.has(from)) return res;
    const mine = this.postOf(from);
    switch (msg.a) {
      case 'post':
        if (mine || typeof msg.questId !== 'string') break;
        this.posts.push({ postId: `${from}-${++this.n}`, questId: msg.questId, mutators: cleanMutatorIds(msg.mutators), hostId: from, members: [{ id: from, ready: false }] });
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
          res.start = { postId: mine.postId, questId: mine.questId, mutators: mine.mutators ?? [], hostId: mine.hostId, members: mine.members.map((x) => x.id), seed };
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
    const had = !!this.postOf(id) || this.busy.has(id);
    this.#drop(id);
    this.busy.delete(id);
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
    const seed = Math.floor(Math.random() * 1e9) + 2;
    const r = st.apply(from, msg, seed);
    if (r.changed) { broadcast(); changed(); }
    if (r.start) {
      const others = r.start.members.filter((i) => i !== session.myId);
      if (others.length) session.send(MSG.QB, { a: 'start', ...r.start }, others);
      if (r.start.members.includes(session.myId)) for (const f of [...startFns]) f(r.start);
    }
  };
  const act = (msg) => { if (isAuth()) run(session.myId, msg); else session.send(MSG.QB, msg, [session.hostId]); };

  session.on(MSG.QB, (d, from) => {
    if (isAuth()) { if (from !== session.myId) run(from, d); return; }
    if (d.a === 'state') { st.load(d); changed(); }
    else if (d.a === 'start') for (const f of [...startFns]) f(d);
  });
  session.on('peer-leave', ({ id }) => { if (isAuth() && st.removeMember(id)) { broadcast(); changed(); } });
  session.on('members', () => { // neue Gäste bekommen den aktuellen Stand
    if (isAuth() && session.role === 'host') broadcast();
  });
  session.on('role', () => { st.load({ posts: [], busy: [] }); changed(); });

  const api = {
    state: st,
    getPosted() {
      return st.posts.map((p) => ({
        postId: p.postId, questId: p.questId, mutators: p.mutators ?? [], hostId: p.hostId, hostName: session.member(p.hostId)?.name ?? '?',
        members: p.members.map((m) => ({ ...m, name: session.member(m.id)?.name ?? '?' })), joined: p.members.some((m) => m.id === session.myId),
        ready: p.members.find((m) => m.id === session.myId)?.ready ?? false, full: p.members.length >= MAX_PLAYERS,
      }));
    },
    myPost() { return api.getPosted().find((p) => p.joined) ?? null; },
    post(questId, mutators = []) { act({ a: 'post', questId, mutators: cleanMutatorIds(mutators) }); },
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
