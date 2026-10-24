import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('peerjs', async () => ({ default: (await import('../fakePeer.js')).FakePeer }));
import { FakePeer, memoryStorage } from '../fakePeer.js';
import { hostRoom, joinRoom } from '../../src/net/net.js';
import { Session, createHuntChannel } from '../../src/net/session.js';
import { createQuestBoard } from '../../src/net/questboard.js';
import { clearResume } from '../../src/net/resumeIdentity.js';
import { MSG } from '../../src/net/protocol.js';
import { makeHunt } from '../huntFixture.js';
import { Presence } from '../../src/net/presence.js';

const nets = [];
const tick = ms => vi.advanceTimersByTimeAsync(ms);
async function room() { const p = hostRoom({ name: 'Host', code: 'ABCD' }); await tick(5); const n = await p; nets.push(n); return n; }
async function join(name = 'Gast') { const p = joinRoom('ABCD', { name }); await tick(15); const n = await p; nets.push(n); return n; }
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] }); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(async () => { for (const net of nets.splice(0)) net.close(false); await tick(200); FakePeer.reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Production connection lifecycle under injected network failures', () => {
  it('reserves a place and reconnects repeatedly with the same identity and no duplicate peers', async () => {
    const host = await room(), guest = await join(), id = guest.myId;
    for (let i = 0; i < 3; i++) {
      const old = guest.hostConn; old.close();
      expect(guest.connectionState).toBe('reconnecting'); expect(host.roster.find(p => p.id === id).online).toBe(false);
      await tick(600);
      expect(guest.connectionState).toBe('connected'); expect(guest.myId).toBe(id);
      expect(host.roster).toHaveLength(2); expect(host.peers.size).toBe(1);
      old.emit('close'); expect(host.roster.find(p => p.id === id).online).toBe(true);
    }
    expect(JSON.stringify(host.roster)).not.toContain(guest.resumeToken);
  });
  it('allows the reserved guest back into a full six-player room', async () => {
    const host = await room(), guests = [];
    for (let i = 0; i < 5; i++) { clearResume('ABCD'); guests.push(await join('G' + i)); }
    const id = guests[2].myId; guests[2].hostConn.close(); await tick(600);
    expect(host.roster).toHaveLength(6); expect(guests[2].myId).toBe(id); expect(guests[2].connectionState).toBe('connected');
    clearResume('ABCD'); const seventh = joinRoom('ABCD'); const rejected = expect(seventh).rejects.toThrow('Raum voll'); await tick(20); await rejected;
  });
  it('releases voluntary departures immediately and uses fresh IDs for new participants', async () => {
    const host = await room(), guest = await join(), id = guest.myId;
    guest.close(); await tick(200); expect(host.roster).toHaveLength(1);
    const next = await join('Neu'); expect(next.myId).not.toBe(id);
  });
  it('cleans up after the grace period instead of retrying forever', async () => {
    const host = await room(), guest = await join(), closed = vi.fn(); guest.on('close', closed);
    FakePeer.blocked = true; guest.hostConn.close(); await tick(91000);
    expect(guest.closed).toBe(true); expect(closed).toHaveBeenCalledTimes(1); expect(host.roster).toHaveLength(1);
  });
  it('does not replace the room state when signaling opens again', async () => {
    const host = await room(), guest = await join(); host.peer.disconnected = true; host.peer.emit('disconnected'); await tick(1600);
    expect(host.roster).toHaveLength(2); expect(host.peers.get(guest.myId).conn.open).toBe(true);
  });
  it('rebuilds a destroyed host transport with the same room and reserved player identity', async () => {
    const host = await room(), guest = await join(), old = host.peer, id = guest.myId;
    old.destroy(); expect(host.connectionState).toBe('reconnecting');
    await tick(2200);
    expect(host.peer).not.toBe(old); expect(host.connectionState).toBe('connected');
    expect(host.code).toBe('ABCD'); expect(guest.connectionState).toBe('connected'); expect(guest.myId).toBe(id); expect(host.roster).toHaveLength(2);
  });
  it('ignores guest attempts to close another guest’s room', async () => {
    const host = await room(), a = await join(); clearResume('ABCD'); const b = await join('B');
    a.send(MSG.CLOSE, {}, [b.myId]); await tick(10);
    expect(b.closed).toBe(false); expect(host.roster).toHaveLength(3);
  });
  it('drops queued snapshots but keeps essential messages when the send buffer is congested', async () => {
    const host = await room(), guest = await join(), conn = host.peers.get(guest.myId).conn;
    conn.dataChannel.bufferedAmount = 300000; const before = conn.sent.length;
    host.send(MSG.P, {}); host.send(MSG.EV, { k: 'important' });
    expect(conn.sent.slice(before).map(m => m.t)).toEqual([MSG.EV]);
  });
  it('fragments large state transfers and reassembles them once through a guest-to-guest relay', async () => {
    const host = await room(), a = await join(); clearResume('ABCD'); const b = await join('B');
    const received = vi.fn(); b.on(MSG.SYNC, received);
    const data = { a: 'offer', round: 'test', _hunt: 'test', text: '🦖ä\n'.repeat(10000) };
    a.send(MSG.SYNC, data, [b.myId]); await tick(15);
    expect(received).toHaveBeenCalledTimes(1); expect(received.mock.calls[0][0]).toEqual(data); expect(received.mock.calls[0][1]).toBe(a.myId);
    expect(a.hostConn.sent.filter(w => w.t === MSG.SYNC).every(w => new TextEncoder().encode(JSON.stringify(w)).length < 64000)).toBe(true);
    expect(b._fragments.size).toBe(0); expect(host._fragments.size).toBe(0);
  });
  it('expires incomplete state transfers and rejects malformed fragments', async () => {
    await room(); const guest = await join(), receive = vi.fn(); guest.on(MSG.SYNC, receive);
    const packet = d => guest._dispatch(guest.hostConn, { t: MSG.SYNC, f: 'p0', i: 1, d });
    packet({ a: 'fragment', key: 'bad', count: 999999, index: 0, chunk: 'x' }); expect(guest._fragments.size).toBe(0);
    packet({ a: 'fragment', key: 'partial', count: 2, index: 0, chunk: '{' }); expect(guest._fragments.size).toBe(1);
    await tick(16000); expect(guest._fragments.size).toBe(0); expect(receive).not.toHaveBeenCalled();
  });
});

describe('Room → running quest → authoritative bootstrap → reconnect', () => {
  async function start() {
    const host = new Session({ name: 'Host' }), guest = new Session({ name: 'Gast' });
    const hb = createQuestBoard(host), gb = createQuestBoard(guest);
    const hp = host.host(); await tick(5); await hp; nets.push(host.net);
    let hostHunt, guestHunt;
    const attach = (s, b, set) => {
      const seen = new Set();
      return b.onStart(st => {
        if (seen.has(st.postId)) return; seen.add(st.postId);
        set(makeHunt(createHuntChannel(s, { hostId: st.hostId, members: st.members, roundId: st.postId, board: b, onDispose: () => b.returned() }), st, s.profile));
      });
    };
    attach(host, hb, h => hostHunt = h); attach(guest, gb, h => guestHunt = h);
    hb.post('jaggo'); hb.setReady(true);
    const jp = guest.join(host.code); jp.catch(() => {}); await tick(20); await jp; nets.push(guest.net); await tick(10);
    return { host, guest, hb, gb, get hostHunt() { return hostHunt; }, get guestHunt() { return guestHunt; }, attach };
  }
  async function enter(s) { s.gb.joinRunning(s.gb.getRunning()[0].postId); await tick(15); s.guestHunt.net.pump(); await tick(30); s.guestHunt.net.pump(); }
  it('joins a hunt already in progress, with health, phases, depleted resources and exactly one new avatar', async () => {
    const s = await start(), h = s.hostHunt; h.mainMonster.hp = 80; h.mainMonster.phase = 1; h.world.gatherPoints[0].usesLeft = 0;
    await enter(s);
    expect(s.guestHunt.net.recovery.blocked).toBe(false); expect(h.players).toHaveLength(2); expect(s.guestHunt.players).toHaveLength(2);
    expect(s.guestHunt.mainMonster.hp / s.guestHunt.mainMonster.maxHp).toBeCloseTo(h.mainMonster.hp / h.mainMonster.maxHp);
    expect(s.guestHunt.mainMonster.phase).toBe(1); expect(s.guestHunt.world.gatherPoints[0].usesLeft).toBe(0);
    expect(s.hb.state.active[0].pending).toEqual([]); expect(s.gb.getRunning()).toHaveLength(1);
    h.net.dispose(); s.guestHunt.net.dispose();
  });
  it('restores HP, spent items and KO counters after a connection interruption without healing or double KO', async () => {
    const s = await start(); await enter(s); const g = s.guestHunt, h = s.hostHunt;
    g.player.v.hp = 26; g.inventory.consume('flickbrause', 4); g.stats.kos = 1; g.net.recovery.checkpoint(); await tick(10);
    expect(h.teamKo).toBe(1);
    s.guest.net.hostConn.close(); expect(g.net.pump()).toBe(true);
    const avatar = h.net.peers.get(g.player.id).player; avatar.updateRemote(.016); expect(avatar.mesh.visible).toBe(false); expect(avatar.alive).toBe(false);
    await tick(650); g.net.pump(); await tick(40); g.net.pump();
    expect(g.net.recovery.blocked).toBe(false); expect(g.player.v.hp).toBe(26); expect(g.inventory.count('flickbrause')).toBe(1); expect(h.teamKo).toBe(1); expect(h.players).toHaveLength(2);
    expect(avatar.mesh.visible).toBe(true); expect(avatar.alive).toBe(true);
    h.net.dispose(); g.net.dispose();
  });
  it('rejoins from a fresh Session after a tab reload using the reserved identity and saved inventory', async () => {
    const s = await start(); await enter(s); const old = s.guestHunt, id = s.guest.myId;
    old.player.v.hp = 19; old.inventory.consume('flickbrause', 3); old.net.recovery.checkpoint(); await tick(10);
    s.guest.net.close(false); await tick(200);
    const fresh = new Session({ name: 'Gast' }), board = createQuestBoard(fresh); let restored;
    s.attach(fresh, board, h => restored = h);
    const promise = fresh.join(s.host.code); promise.catch(() => {}); await tick(25); await promise; nets.push(fresh.net); await tick(10);
    expect(fresh.myId).toBe(id); expect(restored).toBeTruthy(); restored.net.pump(); await tick(40); restored.net.pump();
    expect(restored.player.v.hp).toBe(19); expect(restored.inventory.count('flickbrause')).toBe(2);
    expect(s.hostHunt.players).toHaveLength(2);
    s.hostHunt.net.dispose(); restored.net.dispose(); old.net.recovery.dispose();
  });
  it('joins and resumes through the room relay when another guest is the hunt authority', async () => {
    const s = await start(); s.gb.post('jaggo'); s.gb.setReady(true); await tick(15);
    const authority = s.guestHunt; authority.mainMonster.hp = 71;
    clearResume(s.host.code);
    const third = new Session({ name: 'Dritter' }), board = createQuestBoard(third); let hunter;
    s.attach(third, board, h => hunter = h);
    const promise = third.join(s.host.code); promise.catch(() => {}); await tick(25); await promise; nets.push(third.net); await tick(10);
    board.joinRunning(board.getRunning().find(p => p.hostId === s.guest.myId).postId); await tick(25); hunter.net.pump(); await tick(50); hunter.net.pump();
    expect(hunter.net.recovery.blocked).toBe(false); expect(authority.players).toHaveLength(2);
    expect(s.hostHunt.players).toHaveLength(1);
    hunter.player.v.hp = 31; hunter.net.recovery.checkpoint(); await tick(10);
    FakePeer.blocked = true; s.guest.net.hostConn.close(); await tick(10); expect(hunter.net.pump()).toBe(true);
    await tick(30000); expect(hunter.net.pump()).toBe(true); expect(hunter.result).toBeNull();
    FakePeer.blocked = false; await tick(6000); authority.net.pump(); hunter.net.pump(); await tick(60); hunter.net.pump();
    expect(hunter.net.recovery.blocked).toBe(false); expect(hunter.player.v.hp).toBe(31); expect(authority.players).toHaveLength(2);
    s.hostHunt.net.dispose(); authority.net.dispose(); hunter.net.dispose();
  });
  it('recovers an ended hunt even after the host has moved to the results screen', async () => {
    const s = await start(); await enter(s); const g = s.guestHunt, h = s.hostHunt;
    g.player.v.hp = 23; g.net.recovery.checkpoint(); await tick(10);
    FakePeer.blocked = true; s.guest.net.hostConn.close(); g.net.pump();
    h.result = 'win'; h.meta.phase = 'carve'; h.meta.carveT = 18; h.report.snapshot(true); h.net.sendEnd('win'); h.net.dispose();
    FakePeer.blocked = false; await tick(700); g.net.pump(); await tick(50); g.net.pump();
    expect(g.net.recovery.blocked).toBe(false); expect(g.result).toBe('win'); expect(g.net.ended).toBe(true); expect(g.meta.carveT).toBe(18); expect(g.player.v.hp).toBe(23); expect(g.report.final).toBeTruthy();
    g.net.dispose();
  });
  it('makes a returned hunter visible again on the other guests after host confirmation', async () => {
    const s = await start(); await enter(s); const first = s.guestHunt;
    clearResume(s.host.code); const third = new Session({ name: 'Dritter' }), board = createQuestBoard(third); let other;
    s.attach(third, board, h => other = h);
    const promise = third.join(s.host.code); promise.catch(() => {}); await tick(25); await promise; nets.push(third.net); await tick(10);
    board.joinRunning(board.getRunning()[0].postId); await tick(25); other.net.pump(); await tick(50); other.net.pump();
    const avatar = other.net.peers.get(s.guest.myId).player;
    s.guest.net.hostConn.close(); await tick(10); avatar.updateRemote(.016); expect(avatar.netAway).toBe(true); expect(avatar.mesh.visible).toBe(false);
    await tick(650); first.net.pump(); await tick(50); other.net.pump();
    expect(avatar.netAway).toBe(false); avatar.updateRemote(.016); expect(avatar.mesh.visible).toBe(true); expect(other.players).toHaveLength(3);
    s.hostHunt.net.dispose(); first.net.dispose(); other.net.dispose();
  });
  it('clears stale town positions when a returning tab restarts its timestamp clock', async () => {
    const s = await start(), presence = new Presence(s.host);
    s.guest.send(MSG.TP, { T: 100000, x: 1, y: 0, z: 1, r: 0 }); await tick(10); expect(presence.remotes()).toEqual([s.guest.myId]);
    s.guest.net.hostConn.close(); expect(presence.remotes()).toEqual([]); await tick(650);
    s.guest.send(MSG.TP, { T: 1000, x: 7, y: 0, z: 8, r: 0 }); await tick(10);
    expect(presence.sample(s.guest.myId)?.x).toBe(7); presence.dispose(); s.hostHunt.net.dispose();
  });
});
