import { describe, it, expect } from 'vitest';
import {
  MSG, encodeP, decodeP, encodeM, decodeM, encodeAtk, decodeAtk, encodeHit, decodeHit, Dedupe, applyHitOnce, validHit,
  generateRoomCode, normalizeCode, isValidCode, peerIdFor, CODE_CHARS, MAX_HIT_DMG,
} from '../../src/net/protocol.js';
import { SnapBuffer } from '../../src/net/interp.js';
import { peerOptions, iceServers } from '../../src/net/net.js';
import { HuntNet } from '../../src/net/sync.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { AttackInstance } from '../../src/game/monsters/attack.js';
import { createBus } from '../../src/core/events.js';
import { createRng } from '../../src/core/rng.js';

describe('room codes', () => {
  it('generates 4 letters without I and O', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateRoomCode();
      expect(c).toMatch(/^[A-HJ-NP-Z]{4}$/);
      expect(isValidCode(c)).toBe(true);
    }
    expect(CODE_CHARS).not.toMatch(/[IO]/);
  });
  it('is deterministic for a given rng and covers the edges', () => {
    expect(generateRoomCode(() => 0)).toBe('AAAA');
    expect(generateRoomCode(() => 0.999999)).toBe('ZZZZ');
  });
  it('normalizes typed input: uppercase, strips invalid chars, max 4', () => {
    expect(normalizeCode('ab-cd')).toBe('ABCD');
    expect(normalizeCode('i0o1abcdef')).toBe('ABCD');
    expect(normalizeCode(' k m ')).toBe('KM');
    expect(normalizeCode(null)).toBe('');
  });
  it('validates and maps to peer ids', () => {
    expect(isValidCode('ABCD')).toBe(true);
    expect(isValidCode('ABC')).toBe(false);
    expect(isValidCode('ABIO')).toBe(false);
    expect(peerIdFor('KLMN')).toBe('scuffedhunter-KLMN');
  });
});

describe('protocol roundtrips', () => {
  it('player snapshot', () => {
    const s = { x: 1.2345, y: 0.5, z: -7.891, rot: 2.3456, state: 'roll', anim: null, animT: 0.1234, level: 0, charging: false, speed: 8.55, sprint: true, air: 0, hp: 87.4, maxHp: 100 };
    const d = decodeP(JSON.parse(JSON.stringify(encodeP(s, 12.3456))));
    expect(d.T).toBeCloseTo(12.346, 3);
    expect(d.x).toBeCloseTo(1.23, 2); expect(d.z).toBeCloseTo(-7.89, 2); expect(d.rot).toBeCloseTo(2.35, 2);
    expect(d.state).toBe('roll'); expect(d.animT).toBeCloseTo(0.12, 2); expect(d.sprint).toBe(true); expect(d.speed).toBeCloseTo(8.6, 1);
    expect(d.hp).toBe(87); expect(d.maxHp).toBe(100); expect(d.anim).toBe(null);
  });
  it('player snapshot with animation and charge keeps short keys and omits defaults', () => {
    const s = { x: 0, y: 0, z: 0, rot: 0, state: 'free', anim: 'gs_charge', animT: 0.7, level: 2, charging: true, speed: 0, sprint: false, air: 0, hp: 100, maxHp: 100 };
    const o = encodeP(s, 1);
    expect(Object.keys(o).sort()).toEqual(['T', 'a', 'c', 'h', 'l', 'm', 'r', 's', 't', 'x', 'y', 'z']);
    expect(JSON.stringify(o).length).toBeLessThan(120);
    const d = decodeP(o);
    expect(d.anim).toBe('gs_charge'); expect(d.level).toBe(2); expect(d.charging).toBe(true);
  });
  it('monster snapshot incl. part state and flags', () => {
    const m = { id: 'jaggo', def: 'jaggo', x: 3.14159, y: 0, z: -2, rot: 1.23456, state: 'combat', hpPct: 0.45678, rage: true, discovered: true, stun: false, stag: true, atk: 12501,
      parts: [{ hp: 120.4, broken: false }, { hp: Infinity, broken: false }, { hp: -3, broken: true }] };
    const q = decodeM(JSON.parse(JSON.stringify(encodeM(5.5, 1000.04, 2, [m]))));
    expect(q.timeLeft).toBe(1000); expect(q.teamKo).toBe(2);
    const d = q.monsters[0];
    expect(d).toMatchObject({ id: 'jaggo', def: 'jaggo', state: 'combat', rage: true, discovered: true, stun: false, stag: true, atk: 12501 });
    expect(d.hpPct).toBeCloseTo(0.457, 3);
    expect(d.parts).toEqual([{ hp: 120, broken: false }, { hp: 0, broken: false }, { hp: 0, broken: true }]);
  });
  it('attack params roundtrip into an identical AttackInstance', () => {
    const params = { attackId: 'jaggo_huepfer', t0: 12.3456, origin: { x: 3.1, y: 0, z: -4.2 }, yaw: 0.7, targetPos: { x: 9, y: 0, z: 2 }, seed: 1234567, rage: true };
    const a = decodeAtk(JSON.parse(JSON.stringify(encodeAtk('jaggo', params, 4))));
    expect(a.monsterId).toBe('jaggo');
    expect(a.params.attackId).toBe('jaggo_huepfer'); expect(a.params.seed).toBe(1234567); expect(a.params.rage).toBe(true);
    const def = jaggo.attacks.jaggo_huepfer;
    const i1 = new AttackInstance(def, params), i2 = new AttackInstance(def, a.params);
    for (let t = 0; t < i1.duration; t += 0.1) {
      const s1 = i1.sample(t), s2 = i2.sample(t);
      expect(Math.abs(s1.x - s2.x)).toBeLessThan(0.02); expect(Math.abs(s1.z - s2.z)).toBeLessThan(0.02);
    }
  });
  it('attack with dir instead of yaw encodes a yaw', () => {
    const a = decodeAtk(encodeAtk('m', { attackId: 'x', t0: 1, origin: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, seed: 1 }, 0));
    expect(a.params.yaw).toBeCloseTo(Math.PI / 2, 3);
  });
  it('hit roundtrip', () => {
    const d = decodeHit(JSON.parse(JSON.stringify(encodeHit('jaggo', { partId: 'head', dmg: 103.6, elemDmg: 4, blunt: 30, crit: true, weak: true }, 'p2', 7))));
    expect(d).toEqual({ id: 7, monsterId: 'jaggo', res: { partId: 'head', dmg: 104, elemDmg: 4, blunt: 30, crit: true, weak: true, attackerId: 'p2' } });
  });
  it('knows all message types of the architecture', () => {
    expect(Object.values(MSG).sort()).toEqual(['atk', 'end', 'ev', 'fx', 'gather', 'hello', 'hit', 'lobby', 'm', 'p', 'ping', 'qb', 'ready', 'start', 'tp'].sort());
  });
});

describe('dedupe / hit idempotency', () => {
  it('Dedupe reports duplicates per sender and stays bounded', () => {
    const d = new Dedupe(4);
    expect(d.seen('p1', 1)).toBe(false);
    expect(d.seen('p1', 1)).toBe(true);
    expect(d.seen('p2', 1)).toBe(false);
    for (let i = 10; i < 20; i++) d.seen('p1', i);
    expect(d.set.size).toBeLessThanOrEqual(4);
    expect(d.seen('p1', undefined)).toBe(false);
  });
  it('applyHitOnce applies a duplicate message exactly once and rejects garbage', () => {
    const ledger = new Dedupe();
    let total = 0;
    const apply = (h) => { total += h.res.dmg; return true; };
    const wire = encodeHit('jaggo', { partId: 'body', dmg: 50 }, 'p1', 3);
    const h = decodeHit(wire);
    expect(applyHitOnce(ledger, 'p1', h, apply)).toBe(true);
    expect(applyHitOnce(ledger, 'p1', decodeHit(wire), apply)).toBe(null);
    expect(applyHitOnce(ledger, 'p1', decodeHit(wire), apply)).toBe(null);
    expect(total).toBe(50);
    expect(applyHitOnce(ledger, 'p1', decodeHit(encodeHit('jaggo', { partId: 'body', dmg: 50 }, 'p1', 4)), apply)).toBe(true);
    expect(total).toBe(100);
    expect(validHit(decodeHit(encodeHit('m', { partId: 'x', dmg: MAX_HIT_DMG + 1 }, 'p1', 9)))).toBe(false);
    expect(validHit(decodeHit(encodeHit('m', { partId: 'x', dmg: -5 }, 'p1', 9)))).toBe(false);
  });
  it('HuntNet host: duplicate hit messages damage the real monster once and use the sender id', () => {
    const handlers = {};
    const net = { isHost: true, myId: 'p0', hostId: 'p0', on: (t, fn) => { handlers[t] = fn; return () => {}; }, onLeave() {}, onLost() {}, sendAll() {}, sendHost() {}, rttOf: () => 0, dispose() {} };
    const ctx = {
      world: { heightAt: () => 0, collide() {}, spawnPoints: [{ x: 0, z: 0, yaw: 0 }] }, players: [], monsters: [], bus: createBus(), rng: createRng(1),
      fx: { number() {}, spark() {}, shake() {}, clearMarker() {} }, scene: { add() {}, remove() {} }, hud: { center() {} }, countMonsters: () => 0,
    };
    const m = new Monster(jaggo, ctx, { id: 'jaggo', x: 0, z: 5, state: 'combat', seed: 3 });
    ctx.monsters.push(m);
    const hn = new HuntNet(ctx, net, { players: [] });
    const hp0 = m.hp;
    const msg = encodeHit('jaggo', { partId: 'body', dmg: 40, elemDmg: 0, blunt: 0 }, 'liar', 11);
    handlers.hit(msg, 'p2');
    handlers.hit(msg, 'p2');
    handlers.hit({ ...msg }, 'p2');
    expect(m.hp).toBe(hp0 - 40);
    expect(hn.stats.hitsApplied).toBe(1);
    expect(hn.stats.hitsDup).toBe(2);
    expect(m.threatOf('p2')).toBe(40);
    expect(m.threatOf('liar')).toBe(0);
    handlers.hit(encodeHit('jaggo', { partId: 'body', dmg: 40 }, 'p2', 12), 'p2');
    expect(m.hp).toBe(hp0 - 80);
    handlers.hit(encodeHit('nope', { partId: 'body', dmg: 40 }, 'p2', 13), 'p2'); // unknown monster: ignored
    expect(m.hp).toBe(hp0 - 80);
  });
});

describe('snapshot interpolation buffer', () => {
  const mk = () => new SnapBuffer({ delay: 0.1, angleKeys: ['rot'] });
  it('interpolates linearly between snapshots 100 ms behind', () => {
    const b = mk();
    // sender sends every 1/15 s starting at ts=10; receiver clock = sender + 5 (const offset)
    for (let i = 0; i < 10; i++) { const ts = 10 + i / 15; b.push(ts, { x: i, state: i < 5 ? 'a' : 'b' }, ts + 5); }
    // render at receiver time 5 + 10.5 -> sender time 10.4 (0.1 delay)
    const s = b.sample(15.5);
    const expectX = (10.4 - 10) * 15; // 6.0
    expect(s.s.x).toBeCloseTo(expectX, 1);
    expect(s.cur.state).toBe('b');
    expect(s.rt).toBeCloseTo(10.4, 3);
  });
  it('holds the last snapshot instead of extrapolating', () => {
    const b = mk();
    b.push(1, { x: 0 }, 1); b.push(1.1, { x: 10 }, 1.1);
    expect(b.sample(5).s.x).toBe(10);
  });
  it('clamps to the first snapshot when render time is before the buffer', () => {
    const b = mk();
    b.push(1, { x: 3 }, 1); b.push(1.1, { x: 4 }, 1.1);
    expect(b.sample(1.0).s.x).toBe(3);
  });
  it('takes the short way around for angles', () => {
    const b = mk();
    b.push(0, { rot: 3.0 }, 0); b.push(0.2, { rot: -3.0 }, 0.2);
    const r = b.sample(0.2).s.rot; // render time 0.1 -> halfway
    expect(Math.abs(Math.cos(r) - Math.cos(3.1416))).toBeLessThan(0.01);
  });
  it('drops old and duplicate snapshots', () => {
    const b = mk();
    expect(b.push(2, { x: 1 }, 2)).toBe(true);
    expect(b.push(1, { x: 0 }, 2)).toBe(false);
    expect(b.push(2, { x: 0 }, 2)).toBe(false);
    expect(b.length).toBe(1);
  });
  it('is robust against latency jitter (offset tracks the minimum)', () => {
    const b = mk();
    const rnd = createRng(5);
    for (let i = 0; i < 60; i++) { const ts = i / 15; b.push(ts, { x: ts * 10 }, ts + 0.05 + rnd() * 0.04); }
    const now = 4 + 0.05 + 0.1; // receiver time -> sender time 4 - 0.1 + 0.0 (+ off error <= 0.04)
    expect(Math.abs(b.sample(now).s.x - 39)).toBeLessThan(0.5);
  });
  it('is bounded', () => {
    const b = new SnapBuffer({ max: 5 });
    for (let i = 0; i < 50; i++) b.push(i, { x: i }, i);
    expect(b.length).toBe(5);
  });
  it('returns null when empty', () => { expect(mk().sample(1)).toBe(null); });
});

describe('connection options', () => {
  it('uses the PeerJS cloud by default and local server via URL params', () => {
    const d = peerOptions('');
    expect(d.host).toBeUndefined(); expect(d.port).toBeUndefined();
    const l = peerOptions('?peerhost=localhost&peerport=9000&peersecure=0&peerpath=/x');
    expect(l).toMatchObject({ host: 'localhost', port: 9000, secure: false, path: '/x' });
    expect(peerOptions('?peerhost=h').secure).toBe(false);
  });
  it('ICE: Google STUN plus optional ?turn= JSON', () => {
    const base = iceServers('');
    expect(base.every((s) => s.urls.startsWith('stun:stun'))).toBe(true);
    const t = iceServers('?turn=' + encodeURIComponent(JSON.stringify({ urls: 'turn:t.example:3478', username: 'u', credential: 'c' })));
    expect(t.at(-1)).toMatchObject({ urls: 'turn:t.example:3478', username: 'u' });
    expect(iceServers('?turn=garbage{').length).toBe(base.length);
  });
});
