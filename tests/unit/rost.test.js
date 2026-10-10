import { describe, it, expect } from 'vitest';
import { make, DT } from './p3helpers.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { resolvePlayerHit, applyMonsterHit } from '../../src/game/combat.js';
import { ITEMS } from '../../src/data/items.js';
import { RECIPES } from '../../src/data/recipes.js';
import { attachGlitch, initGlitch, GLITCH } from '../../src/game/glitch.js';
import { encodeHit, decodeHit, encodeMonster, decodeMonster } from '../../src/net/protocol.js';
import { ItemSystem } from '../../src/game/items.js';
import { createBus } from '../../src/core/events.js';

const hit = (partId, dmg = 50) => ({ dmg, elemDmg: 0, crit: false, weak: false, zone: 1, blunt: 0, stunEligible: false, wucht: 0, partId, hitstop: 0, shake: 0 });

describe('Status Rost (Brocken)', () => {
  it('Aufbau 100 -> 15 s Verrostet: Teile-Faktoren +0,15', () => {
    const { m } = make(jaggo);
    const base = m.parts.map((p) => p.factor);
    m.applyStatus('rost', { amount: 60 });
    expect(m.st.rustT).toBe(0);
    m.applyStatus('rost', { amount: 40 });
    expect(m.st.rustT).toBe(15);
    m.update(DT);
    m.parts.forEach((p, i) => expect(p.factor).toBeCloseTo(base[i] + 0.15, 5));
    for (let i = 0; i < 15 * 60 + 5; i++) m.update(DT);
    expect(m.st.rustT).toBe(0);
    m.parts.forEach((p, i) => expect(p.factor).toBeCloseTo(base[i], 5));
  });
  it('Teil-HP-Schaden x1,5 solange verrostet', () => {
    const { m } = make(jaggo);
    const head = m.partById.head, h0 = head.hp;
    m.applyDamage(hit('head', 100));
    const plain = h0 - head.hp;
    m.applyStatus('rost', { amount: 100 });
    const h1 = head.hp;
    m.applyDamage(hit('head', 100));
    expect(h1 - head.hp).toBeCloseTo(plain * 1.5, 5);
  });
  it('Bruch waehrend Rost behaelt den Bonus', () => {
    const { m } = make(jaggo);
    m.applyStatus('rost', { amount: 100 });
    m.update(DT);
    const head = m.partById.head;
    m.applyDamage(hit('head', head.hp + 10));
    expect(head.broken).toBe(true);
    expect(head.factor).toBeCloseTo(Math.max(0, head.baseFactor - 0.1) + 0.15, 5);
  });
  it('Verbruht +0,1 fuer 10 s, stapelt mit Rost', () => {
    const { m } = make(jaggo);
    const b = m.partById.head.factor;
    m.applyStatus('scald', { t: 10 }); m.update(DT);
    expect(m.partById.head.factor).toBeCloseTo(b + 0.1, 5);
    m.applyStatus('rost', { amount: 100 }); m.update(DT);
    expect(m.partById.head.factor).toBeCloseTo(b + 0.25, 5);
  });
  it('Umgebungsschaden (env) ohne Teil zaehlt nicht als Bedrohung', () => {
    const { m } = make(jaggo);
    const hp = m.hp;
    m.applyDamage({ dmg: 150, partId: null, env: true, attackerId: 'env' });
    expect(m.hp).toBe(hp - 150);
    expect(m.threatOf('env')).toBe(0);
  });
  it('Element rost: kein Elementschaden, aber Rost-Aufbau pro Treffer', () => {
    const { m } = make(jaggo);
    const res = resolvePlayerHit({ power: 100, critChance: 0, elems: { rost: 50 } }, { mv: 100 }, m.partById.head, () => 0.9);
    expect(res.rostBuild).toBe(50);
    expect(res.elemDmg).toBe(0);
    applyMonsterHit(m, res, {});
    applyMonsterHit(m, res, {});
    expect(m.st.rustT).toBe(15);
  });
  it('Netz: Rost-Aufbau + Flags ueberstehen Encode/Decode', () => {
    expect(decodeHit(encodeHit('x', { partId: 'head', dmg: 5, rostBuild: 15 }, 'p2')).res.rostBuild).toBe(15);
    const o = encodeMonster({ id: 'a', def: 'jaggo', x: 0, y: 0, z: 0, rot: 0, state: 'combat', hpPct: 1, rust: true, scald: true, parts: [] });
    const d = decodeMonster(JSON.parse(JSON.stringify(o)));
    expect(d.rust).toBe(true); expect(d.scald).toBe(true); expect(d.stun).toBe(false);
  });
});

describe('Status Rost (Pirscher)', () => {
  it('Schutz -30 % fuer 20 s, clearStatus entfernt', () => {
    const { p } = make(jaggo);
    p.protect = 80;
    const dmg = () => { p.v.hp = p.v.maxHp; p.invuln = 0; p.state = 'free'; const hp0 = p.v.hp; p.takeHit({ dmg: 100, knock: 'none', key: 'k' + Math.random() }); return hp0 - p.v.hp; };
    const normal = dmg();
    expect(p.applyStatus('rost')).toBe(true);
    p.state = 'free';
    const rusty = dmg();
    expect(rusty).toBeGreaterThan(normal);
    expect(p.status.rost.t).toBeCloseTo(20, 0);
    p.clearStatus('rost');
    expect(p.status.rost).toBeUndefined();
  });
});

describe('Items + Rezepte (Rostwerke)', () => {
  it('IDs, Materialien, Rezepte', () => {
    for (const id of ['kupferdraht', 'schlacke', 'rostkaefer', 'giftschlamm', 'funkenstein', 'kroll_panzer', 'kroll_schere', 'kroll_auge', 'gorgo_segment', 'gorgo_zahn', 'gorgo_kern', 'voltaro_kamm', 'voltaro_spule', 'voltaro_fell', 'voltaro_herz']) {
      expect(ITEMS[id]?.kind).toBe('material'); expect(ITEMS[id].desc.length).toBeGreaterThan(5); expect(ITEMS[id].info).toBeTruthy();
    }
    expect(RECIPES.rostbombe.cost).toEqual({ rostkaefer: 1, schlacke: 1 });
    expect(RECIPES.erdungsstab.cost).toEqual({ kupferdraht: 2, altknochen: 1 });
    expect(RECIPES.kuehlbrause.cost).toEqual({ blaublatt: 1, sprudelwasser: 1, rostkaefer: 1 });
    expect(RECIPES.rostspitze.out).toBe(10);
    expect(ITEMS.rostspitze.kind).toBe('ammo');
    for (const r of Object.values(RECIPES)) for (const k of Object.keys(r.cost)) expect(ITEMS[k], k).toBeTruthy();
  });
  function useItem(id, setup) {
    const { ctx, p } = make(jaggo);
    const counts = { [id]: 3 };
    const inv = { selectedId: id, count: (i) => counts[i] ?? 0, consume: (i, n) => { counts[i] -= n; return true; }, cycle() {}, select() {} };
    const placed = [];
    const hunt = { fx: ctx.fx, bus: createBus(), spawnEffect: (k, o) => placed.push([k, o]), world: ctx.world, monsters: ctx.monsters, toast() {} };
    setup?.(p);
    const sys = new ItemSystem(hunt, p, inv);
    sys.request();
    for (let i = 0; i < 200; i++) { sys.update(DT); }
    return { p, sys, placed, counts };
  }
  it('Kuehlbrause: +30 HP, entfernt Rost und Brennen', () => {
    const { p, counts } = useItem('kuehlbrause', (pl) => { pl.v.hp = 50; pl.addStatus('rost'); pl.addStatus('burn'); });
    expect(counts.kuehlbrause).toBe(2);
    expect(p.v.hp).toBeCloseTo(80, 0);
    expect(p.status.rost).toBeUndefined(); expect(p.status.burn).toBeUndefined();
  });
  it('Rostbombe wirft rostbomb, Erdungsstab platziert ground', () => {
    expect(useItem('rostbombe').placed[0][0]).toBe('rostbomb');
    expect(useItem('erdungsstab').placed[0][0]).toBe('ground');
  });
});

describe('Glitch-Stellen', () => {
  it('Treffer auf def.glitchSpots geben x2 Energie, nach Bruch nicht mehr', () => {
    const { ctx, m, p } = make({ ...jaggo, glitchSpots: ['head'] });
    p.local = true;
    initGlitch(p);
    attachGlitch({ bus: ctx.bus, time: 0, stats: {}, player: p });
    const emit = (partId) => ctx.bus.emit('hit', { player: p, monster: m, part: partId, partId, dmg: 40 });
    emit('tail'); const normal = p.glitch.energy; p.glitch.energy = 0;
    emit('head'); expect(p.glitch.energy).toBeCloseTo(normal * GLITCH.SPOT_MUL, 5);
    expect(m.isGlitchSpot('head')).toBe(true);
    m.applyDamage(hit('head', m.partById.head.hp + 5));
    expect(m.isGlitchSpot('head')).toBe(false);
    p.glitch.energy = 0; emit('head'); expect(p.glitch.energy).toBeCloseTo(normal, 5);
  });
  it('Flackern: Teil-Emissive wechselt zwischen cyan und magenta', () => {
    const { m } = make({ ...jaggo, glitchSpots: ['head'] });
    const mat = m.partById.head.mats.find((x) => x.emissive);
    const seen = new Set();
    for (let i = 0; i < 30; i++) { m.update(DT); seen.add(mat.emissive.r > 0.3 ? 'magenta' : 'cyan'); }
    expect(seen.size).toBe(2);
  });
});
