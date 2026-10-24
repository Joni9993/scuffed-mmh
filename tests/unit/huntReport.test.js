import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBus } from '../../src/core/events.js';
import { createHuntReport } from '../../src/game/huntReport.js';
import { teamAwards } from '../../src/meta/teamAwards.js';
import { teamReportHtml } from '../../src/ui/teamReport.js';
import { HuntNet } from '../../src/net/sync.js';

function setup(guest = false) {
  const players = ['p0', 'p1'].map((id, i) => ({ id, name: ['Ada', 'Bo'][i], weaponId: 'kk', alive: true, local: i === +guest, pos: { x: 0, z: 0 } }));
  const h = { opts: { players: players.map(p => ({ ...p, weapon: 'kk' })) }, player: players[+guest], players, bus: createBus(), stats: { damage: 300, hits: 3, kos: 1, rolls: 8, perfect: 2, glitchDmg: 90 }, monsters: [], teamplay: { summary: () => [{ title: 'Vorlage verwandelt', text: 'Ada für Bo', at: 12 }] }, net: { isGuest: guest } };
  const report = h.report = createHuntReport(h);
  const damage = (id, dmg, extra = {}) => h.bus.emit('monsterDamaged', { monster: { def: {} }, res: { attackerId: id, dmg, ...extra } });
  return { h, report, damage };
}
afterEach(() => vi.useRealTimers());

describe('Shared hunt report', () => {
  it('credits host-confirmed total damage once, without double-counting its elemental share', () => {
    const { h, report, damage } = setup();
    damage('p0', 100, { elemDmg: 30 }); damage('p1', 200); damage('p1', 900, { env: true }); damage('unknown', 900);
    h.bus.emit('partBreak', { attackerId: 'p1' }); h.bus.emit('monsterStun', { attackerId: 'p0' });
    report.accept('p1', { damage: 999999, perfect: 4, kos: 0 }, true);
    const r = report.snapshot(true);
    expect(r.players[0]).toMatchObject({ damage: 100, hits: 1, stuns: 1 });
    expect(r.players[1]).toMatchObject({ damage: 200, breaks: 1, perfect: 4 });
    expect(report.accept('unknown', {}, true)).toBe(false);
    expect(report.snapshot(true)).toBe(r);
  });
  it('freezes personal counters before carving and counts only consumed healing items and useful team beats', () => {
    const { h, report } = setup();
    h.bus.emit('itemUsed', { player: h.player, id: 'flickbrause' });
    h.bus.emit('itemUsed', { player: h.player, id: 'giftspitze', tip: 'giftspitze' });
    h.bus.emit('kkPlay', { player: h.player, decoded: { buffs: [{ c: 'r' }] } });
    h.bus.emit('playerHit', { player: h.player, dmg: 25 });
    expect(report.local(true)).toMatchObject({ potions: 1, support: 1, damageTaken: 25, kos: 1 });
    h.stats.kos = 9; h.bus.emit('itemUsed', { player: h.player, id: 'flickbrause' });
    expect(report.local()).toMatchObject({ potions: 1, kos: 1 });
  });
  it('all guests use the host report; arbitrary participant identities and predicted damage cannot replace it', () => {
    const host = setup(), guest = setup(true);
    host.damage('p0', 80); host.damage('p1', 120);
    host.report.accept('p1', guest.report.local(true), true);
    const r = JSON.parse(JSON.stringify(host.report.snapshot(true)));
    guest.damage('p1', 99999);
    expect(guest.report.receive({ ...r, players: [{ id: 'impostor' }] })).toBe(false);
    expect(guest.report.receive(r)).toBe(true);
    expect(guest.report.final.players.map(p => [p.id, p.damage])).toEqual([['p0', 80], ['p1', 120]]);
    expect(teamAwards(guest.report.final.players)).toEqual(teamAwards(r.players));
  });
  it('retains disconnected participants without inventing their personal completion stats', () => {
    const { report, damage } = setup(); damage('p1', 100); report.accept('p1', { kos: 0 }); report.departed('p1');
    const r = report.snapshot(true);
    expect(r.players[1]).toMatchObject({ damage: 100, left: true, complete: false });
    expect(teamReportHtml(r, 'p0')).toContain('Abschlussbericht fehlt');
  });
  it('counts only the HP actually removed by a final overkill hit', () => {
    const { h, report } = setup();
    h.bus.emit('monsterDamaged', { monster: { def: {} }, res: { attackerId: 'p0', dmg: 5000 }, appliedDamage: 7 });
    expect(report.snapshot(true).players[0].damage).toBe(7);
  });
});

describe('Awards honour ties and do not invent lowlights', () => {
  it('shares a title across equal leaders and gives support its own highlight', () => {
    const rows = [{ id: 'a', damage: 100, support: 0, complete: true }, { id: 'b', damage: 100, support: 3, complete: true }];
    expect(teamAwards(rows).find(a => a.id === 'damage').winners).toEqual(['a', 'b']);
    expect(teamAwards(rows).find(a => a.id === 'support').winners).toEqual(['b']);
    expect(teamAwards(rows).filter(a => a.low)).toEqual([]);
  });
  it('uses actual funny mishaps, never lowest damage, and escapes incoming names', () => {
    const rows = [{ id: 'a', name: '<img onerror=evil>', damage: 0, kos: 2, rolls: 12, potions: 3, complete: true }, { id: 'b', name: 'Bo', complete: true, damage: 100 }];
    expect(teamAwards(rows).filter(a => a.low).map(a => a.id)).toEqual(['floor', 'rolls', 'potions']);
    const html = teamReportHtml({ players: rows, complete: true }, 'a');
    expect(html).not.toContain('<img onerror'); expect(html).toContain('&lt;img');
  });
});

describe('Report synchronization over existing P2P transport', () => {
  function network(guest = false) {
    const { h, report } = setup(guest), handlers = {};
    const endpoint = { isHost: !guest, isGuest: guest, myId: h.player.id, hostId: 'p0', on: (t, fn) => { handlers[t] = fn; return () => {}; }, onLeave() {}, onLost() {}, sendAll: vi.fn(), sendHost: vi.fn(), dispose() {} };
    const net = h.net = new HuntNet(h, endpoint, { players: [] });
    net.peers.set(guest ? 'p0' : 'p1', {});
    return { h, report, net, endpoint, handlers };
  }
  it('waits for final reports, then broadcasts one common result', async () => {
    vi.useFakeTimers();
    const { net, handlers, endpoint } = network();
    net.sendEnd('win', ''); const waiting = net.waitForReport();
    handlers.ev({ k: 'reportStats', stats: { perfect: 5, rolls: 10 }, final: true }, 'p1');
    const report = await waiting;
    expect(report.complete).toBe(true); expect(report.players[1].perfect).toBe(5);
    expect(endpoint.sendAll.mock.calls.filter(([, d]) => d.k === 'reportFinal')).toHaveLength(1);
    net.dispose();
  });
  it('finishes with explicitly incomplete rows if a participant never sends a final sample', async () => {
    vi.useFakeTimers(); const { net } = network(); net.sendEnd('fail', ''); const waiting = net.waitForReport();
    await vi.advanceTimersByTimeAsync(1500); const report = await waiting;
    expect(report.players[1].complete).toBe(false); net.dispose();
  });
  it('accepts final reports and end decisions only from the hunt host', () => {
    const { h, net, report, handlers } = network(true); h.netFinish = vi.fn();
    const data = setup().report.snapshot(true);
    handlers.ev({ k: 'reportFinal', report: data }, 'p1'); handlers.end({ r: 'win' }, 'p1');
    expect(report.final).toBe(null); expect(h.netFinish).not.toHaveBeenCalled();
    handlers.ev({ k: 'reportFinal', report: data }, 'p0');
    expect(report.final.complete).toBe(true); net.dispose();
  });
  it('does not invent a zero-damage team report when the host report never arrives', async () => {
    vi.useFakeTimers(); const { net } = network(true); const waiting = net.waitForReport();
    await vi.advanceTimersByTimeAsync(1800); expect(await waiting).toBe(null); net.dispose();
  });
  it('ignores delayed reports and hunt-end messages from a previous quest', () => {
    const { h, net, report, handlers, endpoint } = network(true); endpoint.roundId = 'p0-2'; h.netFinish = vi.fn();
    const data = setup().report.snapshot(true);
    handlers.ev({ k: 'reportFinal', round: 'p0-1', report: data }, 'p0');
    handlers.end({ r: 'win', round: 'p0-1' }, 'p0');
    expect(report.final).toBe(null); expect(h.netFinish).not.toHaveBeenCalled();
    handlers.ev({ k: 'reportFinal', round: 'p0-2', report: data }, 'p0');
    expect(report.final.complete).toBe(true); net.dispose();
  });
});
