import { describe, it, expect, vi } from 'vitest';
import { resolveColorIdx, gearColorIdx } from '../../src/net/colors.js';
import { Session } from '../../src/net/session.js';
import { Net } from '../../src/net/net.js';
import { MSG, wrap, ERR } from '../../src/net/protocol.js';
import { AutoQuality } from '../../src/core/autoquality.js';
import { Hunt, REAP_MINOR, REAP_MAJOR } from '../../src/game/hunt.js';
import { shouldShowTips, showOnboarding, TIPS_MAX } from '../../src/ui/onboarding.js';
import { shouldHintA2hs } from '../../src/ui/a2hs.js';
import { installAudioAutoResume } from '../../src/audio/sfx.js';

describe('co-op colours', () => {
  it('default colours become distinct per slot, explicit ones are kept', () => {
    expect(resolveColorIdx([0, 0, 0, 0])).toEqual([0, 1, 2, 3]);
    expect(resolveColorIdx([0, 1, 0])).toEqual([0, 1, 2]);
    expect(resolveColorIdx([4, 0, 0])).toEqual([4, 0, 1]);
    expect(resolveColorIdx([0])).toEqual([0]);
  });
  it('reads the colour from the gear code', () => {
    expect(gearColorIdx('g1-aaa5')).toBe(5);
    expect(gearColorIdx(undefined)).toBe(0);
  });
});

const fakeConn = () => ({ open: true, sent: [], send(w) { this.sent.push(w); }, on() {}, close() {} });
describe('guest profile update', () => {
  it('host updates roster and rebroadcasts lobby; guest sends prof', () => {
    const host = new Net({ isHost: true, peer: {}, code: 'ABCD', name: 'H' });
    host.roster = [{ id: 'p0', name: 'H', weapon: 'gs', tier: 1, ready: true }];
    const c = fakeConn();
    host._dispatch(c, wrap(MSG.HELLO, 'x', 0, { name: 'Gast', weapon: 'gs', tier: 1 }), null);
    const rec = [...host.peers.values()][0];
    const rosters = [];
    host.on('roster', (r) => rosters.push(JSON.parse(JSON.stringify(r))));
    c.sent.length = 0;
    host._dispatch(c, wrap(MSG.PROFILE, rec.id, 1, { name: 'Neuer Name Lang Lang', weapon: 'bow', tier: 3, gear: 'b3a-----2xx' }), rec);
    const r = host.roster.find((x) => x.id === rec.id);
    expect(r).toMatchObject({ name: 'Neuer Name L', weapon: 'bow', tier: 3 });
    expect(r.gear.length).toBeLessThanOrEqual(8);
    expect(rosters.length).toBe(1);
    expect(c.sent.some((w) => w.t === MSG.LOBBY && w.d.players.find((p) => p.id === rec.id).weapon === 'bow')).toBe(true);
    host.close();

    const guest = new Net({ isHost: false, peer: {}, code: 'ABCD', name: 'G' });
    guest.myId = 'p1'; guest.hostConn = fakeConn();
    guest.updateSelf({ name: 'X', gear: 'abc', ready: true });
    const w = guest.hostConn.sent.at(-1);
    expect(w.t).toBe(MSG.PROFILE);
    expect(w.d).toEqual({ name: 'X', gear: 'abc' });
    guest.close();
  });
  it('session.setProfile forwards to the net (guests too)', () => {
    const s = new Session({ name: 'G' });
    const spy = vi.fn();
    s.net = { updateSelf: spy };
    s.setProfile({ name: 'Neu' });
    expect(spy).toHaveBeenCalledWith({ name: 'Neu' });
  });
});

describe('auto quality', () => {
  it('drops once after 4 s below 45 fps, not when fast', () => {
    const fast = new AutoQuality();
    let hit = false;
    for (let i = 0; i < 600; i++) hit ||= fast.sample(1 / 60);
    expect(hit).toBe(false);
    const slow = new AutoQuality();
    let n = 0, when = 0;
    for (let i = 0; i < 400; i++) if (slow.sample(1 / 30)) { n++; when = i / 30; }
    expect(n).toBe(1);
    expect(when).toBeGreaterThanOrEqual(3.9);
    expect(when).toBeLessThan(4.5);
  });
  it('ignores hitches (tab switches)', () => {
    const q = new AutoQuality();
    for (let i = 0; i < 100; i++) q.sample(2);
    expect(q.n).toBe(0);
  });
});

describe('dead monsters are reaped after the carve window', () => {
  const mk = (minor, alive = false) => ({ id: 'm' + Math.random(), minor, alive, mesh: {}, shadow: {} });
  it('keeps them through the window, removes them after', () => {
    const removed = [];
    const big = mk(false), small = mk(true), live = mk(false, true);
    const h = { monsters: [big, small, live], scene: { remove: (...a) => removed.push(...a) }, fx: {} };
    Hunt.prototype.reapDead.call(h, REAP_MINOR + 0.1);
    expect(h.monsters).toEqual([big, live]);
    Hunt.prototype.reapDead.call(h, 46);
    expect(h.monsters).toContain(big); // carve window (45 s) still covered
    Hunt.prototype.reapDead.call(h, REAP_MAJOR);
    expect(h.monsters).toEqual([live]);
    expect(removed).toContain(big.mesh);
  });
  it('REAP_MAJOR outlasts the carve window', async () => {
    const { CARVE_WINDOW } = await import('../../src/game/huntmeta.js');
    expect(REAP_MAJOR).toBeGreaterThan(CARVE_WINDOW + 5);
  });
});

describe('onboarding + a2hs + audio', () => {
  it('tips show at most TIPS_MAX times unless dismissed', () => {
    expect(shouldShowTips({})).toBe(true);
    expect(shouldShowTips({ tipsSeen: true })).toBe(false);
    expect(shouldShowTips({ tipsShown: TIPS_MAX })).toBe(false);
    expect(showOnboarding({}, 'gs', { s: { tipsSeen: true } })).toBe(null);
  });
  it('detects iOS Safari not installed', () => {
    const ios = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', standalone: false };
    expect(shouldHintA2hs(ios, {})).toBe(true);
    expect(shouldHintA2hs({ ...ios, standalone: true }, {})).toBe(false);
    expect(shouldHintA2hs({ userAgent: 'Android' }, {})).toBe(false);
  });
  it('audio auto-resume registers gesture + visibility listeners', () => {
    const reg = {};
    const doc = { hidden: false, addEventListener: (e, f) => { reg[e] = f; }, removeEventListener() {} };
    const win = { addEventListener: (e, f) => { reg['w:' + e] = f; }, removeEventListener() {} };
    const off = installAudioAutoResume(doc, win);
    expect(Object.keys(reg)).toEqual(expect.arrayContaining(['touchend', 'click', 'visibilitychange', 'w:pageshow']));
    off();
  });
  it('timeout error is the German network hint', () => { expect(ERR.timeout).toContain('anderes Netz'); });
});
