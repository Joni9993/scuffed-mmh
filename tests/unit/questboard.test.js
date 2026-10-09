import { describe, it, expect } from 'vitest';
import { QuestBoardState, createQuestBoard } from '../../src/net/questboard.js';
import { Session, createHuntChannel } from '../../src/net/session.js';

describe('quest board state (room host is the truth)', () => {
  it('post -> join -> all ready starts with the poster as hunt host; members become busy', () => {
    const b = new QuestBoardState();
    expect(b.apply('p1', { a: 'post', questId: 'jaggo' }).changed).toBe(true);
    const id = b.posts[0].postId;
    expect(b.posts[0].hostId).toBe('p1');
    b.apply('p0', { a: 'join', postId: id });
    expect(b.apply('p1', { a: 'ready', r: true }).start).toBe(null);
    const r = b.apply('p0', { a: 'ready', r: true }, 42);
    expect(r.start).toMatchObject({ questId: 'jaggo', hostId: 'p1', members: ['p1', 'p0'], seed: 42 });
    expect(b.posts.length).toBe(0);
    expect(b.busy.has('p0')).toBe(true);
    expect(b.apply('p0', { a: 'post', questId: 'x' }).changed).toBe(false); // busy
    b.apply('p0', { a: 'back' });
    expect(b.apply('p0', { a: 'post', questId: 'x' }).changed).toBe(true);
  });
  it('a member is in one post only; max 4', () => {
    const b = new QuestBoardState();
    b.apply('p0', { a: 'post', questId: 'jaggo' });
    expect(b.apply('p0', { a: 'post', questId: 'again' }).changed).toBe(false);
    const id = b.posts[0].postId;
    for (const p of ['p1', 'p2', 'p3', 'p4']) b.apply(p, { a: 'join', postId: id });
    expect(b.posts[0].members.length).toBe(4);
    b.apply('p5', { a: 'post', questId: 'o' });
    expect(b.apply('p1', { a: 'join', postId: b.posts[1].postId }).changed).toBe(false);
  });
  it('a new joiner is not ready; poster leaving deletes the post; leaving members free their slot', () => {
    const b = new QuestBoardState();
    b.apply('p0', { a: 'post', questId: 'q' });
    const id = b.posts[0].postId;
    b.apply('p1', { a: 'join', postId: id });
    expect(b.posts[0].members.every((m) => !m.ready)).toBe(true);
    b.apply('p1', { a: 'leave' });
    expect(b.posts[0].members.length).toBe(1);
    b.apply('p1', { a: 'join', postId: id });
    expect(b.removeMember('p0')).toBe(true);
    expect(b.posts.length).toBe(0);
    expect(b.postOf('p1')).toBe(null);
  });
  it('snapshot/load mirrors state', () => {
    const a = new QuestBoardState(), c = new QuestBoardState();
    a.apply('p0', { a: 'post', questId: 'q' });
    c.load(JSON.parse(JSON.stringify(a.snapshot())));
    expect(c.posts).toEqual(a.posts);
  });
  it('adapter works solo: post, ready -> onStart', () => {
    const s = new Session({ name: 'Ich' });
    const board = createQuestBoard(s);
    let started = null, changes = 0;
    board.onStart((st) => { started = st; });
    board.onChange(() => changes++);
    board.post('jaggo');
    expect(board.getPosted()).toHaveLength(1);
    expect(board.myPost().hostId).toBe('p0');
    board.setReady(true);
    expect(started).toMatchObject({ questId: 'jaggo', hostId: 'p0', members: ['p0'] });
    expect(board.getPosted()).toHaveLength(0);
    expect(changes).toBeGreaterThan(1);
  });
});

describe('hunt channel addresses participants only', () => {
  it('sendAll targets participants except me, sendHost only the hunt host, listeners ignore non-participants', () => {
    const sent = [];
    const s = new Session({ name: 'x' });
    s.myId = 'p2';
    s.send = (t, d, to) => sent.push([t, to]);
    const ch = createHuntChannel(s, { hostId: 'p1', members: ['p1', 'p2', 'p3'] });
    expect(ch.isHost).toBe(false);
    ch.sendAll('p', {}); ch.sendHost('hit', {});
    expect(sent).toEqual([['p', ['p1', 'p3']], ['hit', ['p1']]]);
    const got = [];
    ch.on('p', (d, from) => got.push(from));
    s.emit('p', {}, 'p3'); s.emit('p', {}, 'p0');
    expect(got).toEqual(['p3']);
    ch.dispose();
    s.emit('p', {}, 'p3');
    expect(got).toEqual(['p3']);
  });
});
