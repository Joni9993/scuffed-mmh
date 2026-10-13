// Krachfaust, der Tempelbrecher (Smaragdküste): Definition, Glitch-Schleim (Boden + Pirscher), Runenwut, Urknall mit Säulen-Deckung, Apex-Revier,
// Sprengung (Waffen-Ast x), Quests/Daten. Fairness-Audit der Angriffe läuft in p3fairness.test.js (attack.audit).
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { make, makeCtx, DT } from './p3helpers.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { Player } from '../../src/game/player.js';
import { monsters } from '../../src/game/monsters/index.js';
import { krachfaust, KRACH, addSlime, wut, stageOf, buildKrachfaust } from '../../src/game/monsters/krachfaust.js';
import { mampfaffe } from '../../src/game/monsters/mampfaffe.js';
import { MIN_TELEGRAPH, AttackInstance } from '../../src/game/monsters/attack.js';
import { pickTone } from '../../src/game/cues.js';
import { Revier } from '../../src/game/revier.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { blastBuild } from '../../src/game/effects.js';
import { time } from '../../src/core/time.js';
import { createWorld } from '../../src/game/world/index.js';
import { weaponStats, WEAPON_ORDER } from '../../src/data/weapons.js';
import { ITEMS } from '../../src/data/items.js';
import { DROPS, rollReward } from '../../src/data/drops.js';
import { ARMOR_SETS, SKILLS, SET_ORDER } from '../../src/data/armor.js';
import { quests, QUEST_ORDER, MONSTER_RP, RANK_RP } from '../../src/data/quests.js';
import { RANKS, questLock } from '../../src/meta/progression.js';
import { defaultSave } from '../../src/meta/save.js';
import { BESTIARY, CONDITIONS, ELEM_NOTES } from '../../src/data/compendium.js';
import { skillEffects } from '../../src/meta/loadout.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { createRng } from '../../src/core/rng.js';
import { encodeMonster, decodeMonster } from '../../src/net/protocol.js';

beforeEach(() => time.reset());

const NEON_OK = /^#(39ff14|7dff3a|d8ffd0)$/;
const def = { ...krachfaust, hp: 1e8, chains: {} };
/** hold: kein eigener Angriffswunsch des Brockens (Erholung bleibt hoch), damit nur der Test-Angriff läuft. */
const run = (ctx, secs, fn, hold = true) => { for (let i = 0; i < secs / DT; i++) { fn?.(i); if (hold) for (const m of ctx.monsters) if (!m.attack && !m.queued) m.recover = 99; ctx.time = (ctx.time ?? 0) + DT; ctx.players.forEach((p) => p.update(DT)); ctx.monsters.forEach((m) => m.update(DT)); } };
/** Alle takeHit-Aufrufe eines Pirschers mitschneiden. */
const spy = (p) => { const log = []; const orig = p.takeHit.bind(p); p.takeHit = (h) => { const r = orig(h); log.push({ ...h, r }); return r; }; return log; };
const slimeHits = (log) => log.filter((h) => h.attackId === 'krachfaust_schleim');

describe('Krachfaust: Definition', () => {
  it('Registry, Werte, Teile, Apex', () => {
    expect(monsters.krachfaust).toBe(krachfaust);
    expect(krachfaust.hp).toBe(20000);
    expect(krachfaust.scale).toBe(3); expect(krachfaust.bodyRadius).toBe(2.6);
    expect(krachfaust.walk).toBe(3.3); expect(krachfaust.run).toBe(8.2);
    expect(krachfaust.apex).toBe(true); expect(krachfaust.predator).toBe(true);
    expect(krachfaust.teachAttack).toBe('krachfaust_schleimfaust');
    const bp = (id) => krachfaust.parts.find((p) => p.id === id);
    for (const id of ['head', 'prankeL', 'prankeR', 'body', 'legs', 'tail']) expect(bp(id), id).toBeTruthy();
    expect(bp('head')).toMatchObject({ breakHp: 1300, blunt: true, stunPart: true, elem: { fire: 12, shock: 20 } });
    expect(bp('prankeL')).toMatchObject({ breakHp: 900, factor: 0.8, elem: { fire: 10, shock: 30 } });
    expect(bp('prankeR').elem.shock).toBe(30);
    expect(bp('body').factor).toBe(0.6);
    for (const part of krachfaust.parts) expect(part.elem.shock, part.id).toBeGreaterThan(part.elem.fire); // Schock = Schwäche, Feuer perlt ab (sprengfest)
    expect(Math.max(...Object.values(krachfaust.attacks).flatMap((a) => (a.hits ?? []).map((h) => h.dmg)))).toBeLessThanOrEqual(85); // Apex: härter als die Spec (Owner-Feedback)
    expect(krachfaust.phases.map((p) => p.at)).toEqual([0.4, 0.12, 0.05]);
  });
  it('jeder Angriff: Cue ohne Hue-Shift in Neongrün (nie Cyan/Magenta), Telegraph >= 0.5, Treffer melden audit an (außer Urknall); Ketten/Phasen zeigen auf echte Angriffe', () => {
    for (const a of Object.values(krachfaust.attacks)) {
      expect(a.cue, a.id).toBeTruthy();
      expect(a.cue.noShift, a.id).toBe(true);
      expect(a.cue.color, a.id).toSatisfy((c) => NEON_OK.test(c));
      expect(a.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
      if (a.hits?.length && a.id !== 'krachfaust_urknall') expect(a.audit?.length, a.id).toBeGreaterThan(0);
      if (a.marker?.color) expect(a.marker.color, a.id).toBe('#39ff14');
    }
    for (const [from, list] of Object.entries(krachfaust.chains)) {
      expect(krachfaust.attacks[from], from).toBeTruthy();
      for (const o of list) if (o.atk) expect(krachfaust.attacks[o.atk], o.atk).toBeTruthy();
    }
    for (const ph of krachfaust.phases) expect(krachfaust.attacks[ph.special]).toBeTruthy();
    expect(pickTone('krachfaust_trommel', krachfaust.attacks.krachfaust_trommel.cue, 3).color).toBe('#39ff14');
  });
  it('Apex-Moveset: Hammerkette, Hornschlag, Schwanzwirbel, Sprung-Faustschlag; Telegraph lesbar (>= 0,5 s)', () => {
    const A = krachfaust.attacks;
    for (const id of ['hammer', 'hornschlag', 'schwanzwirbel', 'sprungfaust']) { expect(A['krachfaust_' + id], id).toBeTruthy(); expect(A['krachfaust_' + id].telegraph).toBeGreaterThanOrEqual(0.5); }
    expect(A.krachfaust_hammer.hits.length).toBe(4); expect(A.krachfaust_hammer.hits[3].dmg).toBe(78);
    expect(A.krachfaust_schwanzwirbel.hits.some((h) => h.at?.[2] < 0 || h.from?.[2] < 0)).toBe(true); // trifft nach hinten
    expect(krachfaust.chains.krachfaust_hammer.some((o) => o.atk === 'krachfaust_schwanzwirbel')).toBe(true);
  });
  it('Wut: Angriffe schneller (Tempo-Faktor, kürzerer Telegraph, kürzere Erholung), nicht nur Laufen', () => {
    const ctx = makeCtx(5);
    const m = new Monster({ ...krachfaust, hp: 1e8 }, ctx, { id: 'krachfaust', x: 65, z: -65, state: 'combat', seed: 3 });
    const calm = krachfaust.attackTempo(m), rec0 = krachfaust.recoverAfter(m);
    m.phase = 1;
    expect(krachfaust.attackTempo(m)).toBeGreaterThan(calm * 1.2);
    expect(krachfaust.speedFactor(m)).toBeGreaterThan(1.2);
    m.recover = 99; m._taught = true; m.target = null;
    m.beginAttack('krachfaust_hammer', { tgMul: 1 });
    expect(m.attack.inst.params.tempoMul).toBeGreaterThan(1.3);
    expect(m.attack.inst.tgWall).toBeLessThan(krachfaust.attacks.krachfaust_hammer.telegraph);
    expect(m.attack.inst.tgWall).toBeGreaterThanOrEqual(0.5);
    expect(m.attack.inst.duration).toBeLessThan(krachfaust.attacks.krachfaust_hammer.duration / 1.3);
    expect(rec0).toBeGreaterThan(0);
  });
  it('Grundangriffe nach Spec: Zahlen, Schleim auf Treffer, Ring um die Landestelle', () => {
    const A = krachfaust.attacks;
    expect(A.krachfaust_schleimfaust.hits[0]).toMatchObject({ dmg: 58, knock: 'down', slimeOnHit: true });
    expect(A.krachfaust_trommel.hits.map((h) => [h.dmg, h.side])).toEqual([[40, 'L'], [40, 'R'], [40, 'L'], [40, 'R']]);
    expect(A.krachfaust_trommel.hits.map((h) => h.t0)).toEqual([0.85, 1.2, 1.55, 1.9]);
    expect(A.krachfaust_trommel.hits[3].slimeOnHit).toBe(true); expect(A.krachfaust_trommel.hits[0].slimeOnHit).toBeUndefined();
    expect(A.krachfaust_kopfstoss.hits[0]).toMatchObject({ dmg: 66, knock: 'down' });
    expect(A.krachfaust_sprungstampfer.hits[0]).toMatchObject({ dmg: 74, radius: 5.8, knock: 'down' });
    expect(A.krachfaust_runenwut.hits[0]).toMatchObject({ dmg: 0, radius: 9, knock: 'pin' });
    expect(A.krachfaust_salve.hits).toEqual([]);
  });
  it('Modell (Brachydios-Look): Obsidian-Panzer, massive gelbgrüne Fäuste/Horn (keine Leuchthülle), Schwanz, Teile-Knoten für die Hurtboxen', () => {
    const b = buildKrachfaust();
    for (const id of ['head', 'prankeL', 'prankeR', 'body', 'legs', 'tail']) expect(b.partMeshes[id].length, id).toBeGreaterThan(0);
    expect(b.extra.slimeMats.length).toBe(3); expect(b.extra.slimeMats.every((m) => !m.transparent)).toBe(true);
    for (const n of ['head', 'fistL', 'fistR', 'body', 'neck', 'legL', 'legR', 'tail1', 'tail3']) expect(b.nodes[n], n).toBeTruthy();
  });
});

describe('Krachfaust: Glitch-Schleim am Boden', () => {
  it('Schleimfaust ins Leere: Pfütze am Faustpunkt; Puls-Stufen nach Restzeit; Explosion r 3,4 nach 2,2 s trifft, wer in der Nähe bleibt', () => {
    expect([stageOf(1.5), stageOf(1.01), stageOf(0.7), stageOf(0.41), stageOf(0.1)]).toEqual([0, 0, 1, 1, 2]);
    const { ctx, m, p } = make(def, 'combat', -0.9, 7.6); // 2,4 m hinter dem Faustpunkt: aus der Faust heraus, aber im Sprengradius
    m.recover = 99; m._taught = true;
    const log = spy(p);
    m.beginAttack('krachfaust_schleimfaust', { tgMul: 1 });
    run(ctx, 1.2);
    expect(m.extra.slimes.length).toBe(1);
    const s = m.extra.slimes[0];
    expect(s.x).toBeCloseTo(-0.9, 0); expect(s.z).toBeGreaterThan(4); expect(s.fuse).toBe(KRACH.FUSE);
    expect(s.r).toBe(1.6); expect(s.blastR).toBe(3.4); expect(s.dmg).toBe(28);
    expect(slimeHits(log).length).toBe(0);
    run(ctx, 2.2);
    expect(m.extra.slimes.length).toBe(0);
    const hits = slimeHits(log);
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ knock: 'flinch', r: 'hit' });
    expect(hits[0].dmg).toBeCloseTo(28 * m.dmgMul, 5);
    expect(ctx.events).toContain('sfx');
  });
  it('wer rechtzeitig weggeht, nimmt keinen Schaden (Pfütze ist umgehbar)', () => {
    const { ctx, m, p } = make(def, 'combat', -0.9, 15);
    m.recover = 99;
    const log = spy(p);
    m.beginAttack('krachfaust_schleimfaust', { tgMul: 1 });
    run(ctx, 4.5);
    expect(slimeHits(log).length).toBe(0);
    expect(p.status.schleim).toBeUndefined();
  });
  it('hineinlaufen: Pfütze wird absorbiert, der Pirscher bekommt Schleim; dessen Explosion trifft auch den Mit-Pirscher; eine Rolle schüttelt ihn ab', () => {
    const s1 = make(def, 'combat', -0.9, 15), { ctx, m, p } = s1;
    m.recover = 99;
    const p2 = new Player({ id: 'p2', ctx }); p2.spawnAt(-0.9 + 2.5, 15, Math.PI); ctx.players.push(p2);
    const log = spy(p), log2 = spy(p2);
    m.beginAttack('krachfaust_schleimfaust', { tgMul: 1 });
    run(ctx, 1.1);
    const s = m.extra.slimes[0];
    p.pos.set(s.x, p.pos.y, s.z); p2.pos.set(s.x + 2.5, p2.pos.y, s.z);
    run(ctx, 0.1);
    expect(m.extra.slimes.length).toBe(0); // absorbiert
    expect(p.status.schleim).toBeTruthy();
    expect(p.status.schleim.t).toBeLessThanOrEqual(2.0 + 1e-6);
    expect(p.status.schleim.rollsLeft).toBe(1);
    expect(p2.status.schleim).toBeUndefined(); // 2,5 m daneben: nicht in r 1,3
    run(ctx, 2.4);
    expect(p.status.schleim).toBeUndefined();
    expect(slimeHits(log).length).toBe(1); // eigene Explosion
    expect(slimeHits(log2).length).toBe(1); // Mit-Pirscher im Radius 3,4 m
    expect(p.getEffect).toBeUndefined();
  });
  it('Rolle entfernt den Schleim: keine Explosion', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 12);
    m.recover = 99;
    const log = spy(p);
    p.addStatus('schleim', { t: 2 });
    expect(p.status.schleim).toBeTruthy();
    run(ctx, 0.3);
    ctx.input.press('roll', 50); ctx.input.poll(DT);
    run(ctx, 0.2);
    expect(p.status.schleim).toBeUndefined();
    run(ctx, 3);
    expect(slimeHits(log).length).toBe(0);
  });
  it('Schleim am Pirscher ohne Rolle: Explosion mit Schaden 28 am Pirscher; Klötzchen-Cluster am Mesh sichtbar', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 12);
    m.recover = 99;
    const log = spy(p);
    p.addStatus('schleim', { t: 2 });
    run(ctx, 0.5);
    expect(p.slimeGrp?.visible).toBe(true);
    run(ctx, 2);
    expect(slimeHits(log).length).toBe(1);
    expect(p.slimeGrp.visible).toBe(false);
  });
  it('Macke Schleimhaut: Zündschnur +0,4 s je Stufe, Explosionsschaden -15 % je Stufe', () => {
    expect(SKILLS.schleimhaut.max).toBe(3);
    const sk = skillEffects({ schleimhaut: 3 });
    expect(sk.schleimFuse).toBeCloseTo(1.2); expect(sk.schleimDmg).toBeCloseTo(0.55);
    const { ctx, p } = make(def, 'combat', 0, 12);
    applyLoadout(p, { weapon: { type: 'gs', tier: 1, branch: null }, armor: { head: 'krachfaust_head', body: 'krachfaust_body', legs: 'krachfaust_legs' }, food: null });
    const log = spy(p);
    p.addStatus('schleim', { t: 2 });
    expect(p.status.schleim.t).toBeCloseTo(2 + 1.2);
    run(ctx, 3.4);
    expect(slimeHits(log)[0].dmg).toBeCloseTo(28 * 0.55, 5); // über den Effekt (p._sk.schleimDmg)
  });
  it('Runenwut: Zündschnur 1,5 s, Pirscher-Schleim 1,4 s; Rotglut = Dauerwut; höchstens 24 Pfützen', () => {
    const { m } = make(def, 'combat', 0, 12);
    expect(wut(m)).toBe(false);
    m.phase = 1;
    expect(wut(m)).toBe(true);
    expect(addSlime(m, 3, 3).fuse).toBe(KRACH.FUSE_WUT);
    m.phase = 0; m.mm; // kein Mutator
    const r = make({ ...def }, 'combat', 0, 12);
    r.ctx.mods = { monster: { rageAlways: true } };
    expect(wut(r.m)).toBe(true);
    for (let i = 0; i < 40; i++) addSlime(m, i, 0);
    expect(m.extra.slimes.length).toBeLessThanOrEqual(KRACH.MAX_SLIMES);
  });
  it('Schock auf eine Faust lässt Pfützen in 4 m platzen (harmlos), Gäste ziehen per snapExtra nach', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 14);
    m.recover = 99;
    const log = spy(p);
    const f = m.nodes.fistL.getWorldPosition(new (m.pos.constructor)());
    addSlime(m, f.x + 1, f.z + 1); addSlime(m, f.x + 20, f.z);
    expect(m.extra.slimes.length).toBe(2);
    const part = m.partById.prankeL;
    m.applyDamage({ dmg: 50, partId: 'prankeL', elemDmg: 30, elemBy: { shock: 30 }, blunt: 0, attackerId: 'p1' });
    expect(m.extra.slimes.length).toBe(1); // nur die ferne bleibt
    expect(slimeHits(log).length).toBe(0);
    expect(part.hp).toBeLessThan(900);
    const ex = krachfaust.snapExtra(m);
    expect(ex.po).toBe(1);
    const g = make(def, 'combat', 0, 14); // Gast-Seite
    addSlime(g.m, f.x + 1, f.z + 1);
    krachfaust.applySnapExtra(g.m, { ...ex, px: f.x, pz: f.z });
    expect(g.m.extra.slimes.length).toBe(0);
  });
  it('Faustbruch: der Schlag dieser Seite klebt keinen Schleim mehr an; Kopfbruch betäubt 3 s', () => {
    const { m, p } = make(def, 'combat', 0, 14);
    m.partById.prankeR.broken = true;
    krachfaust.onHitPlayer(m, p, { hit: { slimeOnHit: true, side: 'R' } });
    expect(p.status.schleim).toBeUndefined();
    krachfaust.onHitPlayer(m, p, { hit: { slimeOnHit: true, side: 'L' } });
    expect(p.status.schleim).toBeTruthy();
    m.partById.head.hp = 1;
    m.applyDamage({ dmg: 50, partId: 'head', elemDmg: 0, blunt: 0, attackerId: 'p1' });
    expect(m.partById.head.broken).toBe(true);
    expect(m.stunT).toBeGreaterThanOrEqual(KRACH.STUN_HEAD - 0.1);
  });
});

describe('Krachfaust: Runenwut und Urknall', () => {
  it('Phasen: 40 % Runenwut-Brüllen (pin, Glitch-Konter möglich), 12 % Urknall, Rotglut-Zweitknall nur mit Dauerwut', () => {
    const { ctx, m } = make({ ...krachfaust, hp: 1000 }, 'combat', 0, 12);
    m.recover = 0; m._taught = true;
    m.hp = 380; m._b2Tick(DT);
    expect(m.phase).toBe(1); expect(m.phaseSpecial).toBe('krachfaust_runenwut');
    m.hp = 110; m._b2Tick(DT);
    expect(m.phase).toBe(2); expect(m.phaseSpecial).toBe('krachfaust_urknall');
    m.hp = 40; m._b2Tick(DT);
    expect(m.phase).toBe(3); expect(m.phaseSpecial).toBeNull(); // normale Jagd: nur ein Urknall
    const r = make({ ...krachfaust, hp: 1000 }, 'combat', 0, 12);
    r.ctx.mods = { monster: { rageAlways: true } };
    r.m.phase = 2; r.m.hp = 40; r.m._b2Tick(DT);
    expect(r.m.phaseSpecial).toBe('krachfaust_urknall'); // Rotglut: zweiter Urknall bei 5 %
  });
  it('Urknall: Telegraph 6,5 s, 70 % Max-LP ohne Deckung, occlude + noPerfect, Detonation r 52, danach erschöpft', () => {
    const a = krachfaust.attacks.krachfaust_urknall;
    expect(a.telegraph).toBe(6.5); expect(a.duration).toBe(8.5);
    expect(a.hits[0]).toMatchObject({ dmg: 0, dmgPct: 0.7, radius: 52, knock: 'down', occlude: true, noPerfect: true, t0: 6.5, t1: 7.1 });
    expect(a.marker).toMatchObject({ at: 'landing', radius: 52 });
    expect(a.audit).toBeUndefined(); // nicht ausrollbar: nur Deckung hilft
    expect(a.hits[0].t1 - a.hits[0].t0).toBeGreaterThan(0.5); // länger als die Rollen-I-Frames
  });
  describe('Finale in der Tempel-Welt', () => {
    let world;
    beforeAll(() => { world = createWorld('smaragdkueste', { seed: 1 }); });
    function finale(positions, opts = {}) {
      const ctx = makeCtx(5);
      ctx.world = world;
      for (const q of world.temple.pillars) { q.broken = false; q.mesh.visible = true; }
      const m = new Monster({ ...krachfaust, hp: 1e8, chains: {} }, ctx, { id: 'krachfaust', x: 65, z: -65, state: 'combat', seed: 7 });
      ctx.monsters.push(m);
      const players = positions.map(([x, z], i) => { const p = new Player({ id: 'p' + i, ctx }); p.spawnAt(x, z, 0); ctx.players.push(p); return p; });
      m.target = players[0]; m.recover = 99; m._taught = true;
      const logs = players.map(spy);
      ctx.hud = { calls: [], center(t) { this.calls.push(t); }, banner(t) { this.calls.push(t); } };
      m.beginAttack('krachfaust_urknall', { tgMul: 1 });
      return { ctx, m, players, logs };
    }
    const behind = (pl, extra = 4) => { const d = Math.hypot(pl.x - 65, pl.z + 65), k = (d + extra) / d; return [65 + (pl.x - 65) * k, -65 + (pl.z + 65) * k]; };

    it('wer offen steht, verliert 70 % der Max-LP (überlebt mit 30 %); hinter einer hohen Säule 0; die Säule bricht, die anderen nicht', () => {
      const pl = world.temple.pillars[1];
      const { ctx, m, players, logs } = finale([[65, -40], behind(pl)]);
      expect(players[0].v.maxHp).toBeGreaterThan(0);
      const hp0 = players[0].v.hp;
      run(ctx, 6.4);
      expect(logs[0].length).toBe(0); // vor der Detonation passiert nichts
      expect(ctx.hud.calls).toContain('HINTER DIE SÄULEN!');
      run(ctx, 0.9);
      const h = logs[0].find((x) => x.dmgPct);
      expect(h).toMatchObject({ dmgPct: 0.7, knock: 'down', r: 'hit', noPerfect: true });
      expect(players[0].v.hp).toBeCloseTo(hp0 * 0.3, 3);
      expect(players[0].state === 'ko').toBe(false);
      expect(logs[1].length).toBe(0); // gedeckt: Treffer verfällt
      expect(players[1].v.hp).toBe(players[1].v.maxHp);
      run(ctx, 0.6);
      expect(pl.broken).toBe(true); expect(pl.mesh.visible).toBe(false);
      expect(world.temple.pillars.filter((q) => q.broken).length).toBe(1); // nur die benutzte
    });
    it('Rolle (I-Frames) und perfekte Rolle retten nicht: die Detonation dauert länger und gibt keinen Glitch-Konter', () => {
      const { ctx, m, players, logs } = finale([[65, -40]]);
      run(ctx, 6.45);
      ctx.input.press('roll', 50); ctx.input.poll(DT); // Rolle genau zur Detonation
      run(ctx, 1.0);
      const got = logs[0].filter((x) => x.dmgPct);
      expect(got.some((x) => x.r === 'hit')).toBe(true);
      expect(got.every((x) => x.r !== 'perfect')).toBe(true);
    });
    it('Aufladen läuft nicht zu unterbrechen (kein Betäuben/Zucken); Teilbruch mittendrin: er lädt neu auf; danach 6 s erschöpft', () => {
      const { ctx, m, players } = finale([[65, -40]]);
      run(ctx, 3);
      expect(m.stunThreshold).toBeGreaterThan(1e9);
      m._addStun(1e6); expect(m.stunT).toBe(0);
      m._interrupt(); // z. B. Teilbruch
      expect(m.attack).toBeNull();
      m.recover = 0; m.state = 'combat';
      run(ctx, 1, null, false);
      expect(m.attack?.id).toBe('krachfaust_urknall'); // sofort neu aufladen
      run(ctx, 10.3, null, false);
      expect(m.tired).toBe(true); expect(m.tiredT).toBeGreaterThan(0); expect(m.tiredT).toBeLessThanOrEqual(6);
      expect(m.stunThreshold).toBeLessThan(1e9); // wieder normal
    });
    it('Koop: snapExtra trägt Finale-Zähler und verbrauchte Säulen; Gäste ziehen nach (auch über das Netzprotokoll)', () => {
      const { ctx, m } = finale([[65, -40]]);
      const p3 = world.temple.pillars[3];
      world.breakPillar(p3);
      m.extra.urkN = 1;
      const ex = krachfaust.snapExtra(m);
      expect(ex).toMatchObject({ u: 1, w: 1 << 3 });
      const wire = decodeMonster(encodeMonster({ id: 'krachfaust', def: 'krachfaust', x: 65, y: 0, z: -65, rot: 0, state: 'combat', hpPct: 1, rage: false, discovered: true, stun: false, stag: false, atk: 0, parts: [], extra: ex }));
      p3.broken = false; p3.mesh.visible = true; // Gast-Welt: Säule steht noch
      const g = new Monster({ ...krachfaust, hp: 1e8 }, ctx, { id: 'g', x: 65, z: -65, state: 'combat', seed: 1, authority: false });
      krachfaust.applySnapExtra(g, wire.extra);
      expect(p3.broken).toBe(true); expect(p3.mesh.visible).toBe(false);
      expect(g.extra.urkN).toBe(1);
    });
    it('Brocken außerhalb des Tempels: Detonation an der eigenen Position (kein Sprung in die Dais-Mitte)', () => {
      const inst = new AttackInstance(krachfaust.attacks.krachfaust_urknall, { attackId: 'krachfaust_urknall', t0: 0, origin: { x: 20, y: 0, z: 40 }, yaw: 0, seed: 1 });
      expect(inst.landing).toEqual({ x: 20, z: 40 });
      const inst2 = new AttackInstance(krachfaust.attacks.krachfaust_urknall, { attackId: 'krachfaust_urknall', t0: 0, origin: { x: 60, y: 0, z: -60 }, yaw: 0, seed: 1 });
      expect(inst2.landing).toEqual({ x: 65, z: -65 });
    });
  });
});

describe('Krachfaust: Apex-Revier (greift andere Brocken im Tempel an)', () => {
  function setup(rivalDef = { ...mampfaffe, hp: 6000 }) {
    const ctx = makeCtx(5);
    const k = new Monster({ ...krachfaust, hp: 1e8 }, ctx, { id: 'krachfaust', x: 65, z: -65, yaw: 0, state: 'combat', seed: 3 });
    const r = new Monster(rivalDef, ctx, { id: 'eindringling', x: 65, z: -57, yaw: Math.PI, state: 'combat', seed: 9 });
    for (const m of [k, r]) { m.discovered = true; ctx.monsters.push(m); }
    const rv = new Revier(ctx, [k], { apex: true });
    return { ctx, k, r, rv };
  }
  it('rivalOf: der Apex wählt den nächsten Brocken im Tempel; andere zielen auf den Apex, aber nur im Tempel', () => {
    const { ctx, k, r, rv } = setup();
    expect(rv.rivalOf(k)).toBe(r);
    expect(rv.rivalOf(r)).toBe(k);
    r.pos.set(65, 0, 20); // draußen im Dschungel
    expect(rv.rivalOf(k)).toBeNull(); expect(rv.rivalOf(r)).toBeNull();
    r.pos.set(65, 0, -57);
    expect(rv.phase).toBe('clash'); rv.update(5); rv.noteDamage(k, 99999);
    expect(rv.phase).toBe('clash'); // kein Bündnis im Apex-Modus
  });
  it('Krachfaust verprügelt den Eindringling (Revier-Treffer), Kleinvieh darf sterben, der Eindringling wehrt sich', () => {
    const { ctx, k, r, rv } = setup();
    run(ctx, 20, null, false);
    expect(k.target).toBe(r);
    expect(rv.hits).toBeGreaterThan(0);
    expect(r.hp).toBeLessThan(r.maxHp);
    expect(ctx.events).toContain('revierHit');
    const c2 = makeCtx(5);
    const k2 = new Monster({ ...krachfaust, hp: 1e8 }, c2, { id: 'krachfaust', x: 65, z: -65, state: 'combat', seed: 3 });
    const prey = new Monster({ ...monsters.jaggling, hp: 30 }, c2, { id: 'jaggling-1', x: 65, z: -60, state: 'combat', seed: 4 });
    for (const m of [k2, prey]) c2.monsters.push(m);
    const hunter = new Player({ ctx: c2 }); hunter.spawnAt(65, -35, Math.PI); c2.players.push(hunter); // Kleinvieh weit weg von jedem Pirscher ist 'culled' (nicht treffbar)
    new Revier(c2, [k2], { apex: true });
    run(c2, 15, null, false);
    expect(prey.alive).toBe(false);
  });
});

describe('Sprengung (Waffen-Ast x, elems.blast)', () => {
  const mk = () => {
    const s = make({ ...monsters.jaggo, hp: 1e6 }, 'combat', 0, 8);
    const bres = [];
    const h = { fx: { spark() {}, ring() {}, shake() {}, number: (p, t, k) => bres.push([t, k]) }, bus: { emit() {} }, net: null, players: [s.p], monsters: [s.m] };
    return { ...s, h, bres };
  };
  it('jeder Treffer baut Sprengwert auf (blast x Trefferstärke), kein Elementschaden; bei 100 detoniert es am Teil mit 8 % x 6 der Waffenkraft und Teil-HP x1,5', () => {
    const { m, p, h, bres } = mk();
    const part = m.parts[0];
    const st = { power: 200, elems: { blast: 30 } };
    const rng = createRng(1);
    const res = resolvePlayerHit({ power: 200, critChance: 0, elems: { blast: 30 } }, { mv: 100, hitstop: 'light' }, part, rng);
    expect(res.blastBuild).toBe(30); expect(res.elemDmg).toBe(0); expect(res.elemBy.blast).toBeUndefined();
    expect(resolvePlayerHit({ power: 200, critChance: 0, elems: { blast: 30 } }, { mv: 250 }, part, rng).blastBuild).toBe(75); // schwere Treffer laden stärker
    expect(resolvePlayerHit({ power: 200, critChance: 0, elems: { blast: 30 } }, { mv: 10 }, part, rng).blastBuild).toBeCloseTo(12); // untere Grenze 0,4
    const hp = { part, pos: { x: 1, y: 1, z: 1 } };
    const hp0 = m.hp, part0 = part.breakHp ? part.hp : null;
    for (let i = 0; i < 3; i++) expect(blastBuild(h, p, m, hp, res, st)).toBe(false);
    expect(m.hp).toBe(hp0);
    expect(blastBuild(h, p, m, hp, res, st)).toBe(true); // 4 x 30 = 120 >= 100
    expect(hp0 - m.hp).toBe(Math.round(200 * 0.08 * 6)); // 96
    expect(bres.at(-1)).toEqual(['PENG 96', 'blast']);
    if (part0 != null) expect(part0 - part.hp).toBeCloseTo(96 * 1.5, 5);
    expect(p._blast.get(`${m.id}|${part.id}`)).toBe(20); // Rest zählt weiter
  });
  it('Zähler gelten je Angreifer und Teil', () => {
    const { m, p, h } = mk();
    const res = { blastBuild: 60 };
    const st = { power: 100 };
    expect(blastBuild(h, p, m, { part: m.parts[0], pos: { x: 0, y: 0, z: 0 } }, res, st)).toBe(false);
    expect(blastBuild(h, p, m, { part: m.parts[1], pos: { x: 0, y: 0, z: 0 } }, res, st)).toBe(false); // anderes Teil: eigener Zähler
    expect(blastBuild(h, p, m, { part: m.parts[0], pos: { x: 0, y: 0, z: 0 } }, res, st)).toBe(true);
  });
  it('alle Waffenarten haben Stufe 6 Ast x: Kraft +8 zum v-Ast, Krit gleich, blast 30, Teilbruch 1,2', () => {
    for (const t of WEAPON_ORDER) {
      const v = weaponStats(t, 6, 'v'), x = weaponStats(t, 6, 'x');
      expect(x.branch).toBe('x'); expect(x.power).toBe(v.power + 8); expect(x.crit).toBe(v.crit);
      expect(x.elems).toEqual({ blast: 30 }); expect(x.partDmgMul).toBe(1.2);
      expect(x.name).toMatch(/-Sprenger$/); expect(x.desc).toMatch(/Macht Peng/);
    }
  });
  it('Kompendium kennt Sprengung und Glitch-Schleim', () => {
    expect(CONDITIONS.find((c) => c.id === 'blast').text).toMatch(/knallt/);
    expect(CONDITIONS.find((c) => c.id === 'schleim').text).toMatch(/Rolle/);
  });
});

describe('Krachfaust: Daten', () => {
  it('Aufträge: Schlüssel JR 9 -> 10, Rotglut JR 10, Revierstreit Smaragd; Reihenfolge im Brett; RANKS JR 10', () => {
    expect(quests.krachfaust).toMatchObject({ monster: 'krachfaust', world: 'smaragdkueste', jr: 9, jrUp: 10, reward: 5200, rp: 300, timeLimit: 1800 });
    expect(quests.krachfaust_rotglut).toMatchObject({ monster: 'krachfaust', jr: 10, reward: 8800, rp: 440, variant: 'rotglut', mutators: ['rotglut'] });
    expect(quests.krachfaust_rotglut.jrUp).toBeUndefined();
    expect(quests.krachfaust_rotglut.matMul).toBeGreaterThan(1);
    expect(quests.revierstreit_smaragd).toMatchObject({ jr: 10, multi: 'revier', world: 'smaragdkueste', reward: 7500, rp: 400, timeLimit: 1800 });
    expect(quests.revierstreit_smaragd.monsters.map((x) => x.id)).toEqual(['blendax', 'mampfaffe', 'krachfaust']);
    expect(quests.revierstreit_smaragd.monsters.every((x) => x.hpMul === 0.65)).toBe(true);
    expect(quests.revierstreit_smaragd.jrUp).toBeUndefined();
    for (const x of quests.revierstreit_smaragd.monsters) expect(monsters[x.id]).toBeTruthy();
    expect(QUEST_ORDER.slice(QUEST_ORDER.indexOf('inselausflug'), QUEST_ORDER.indexOf('inselausflug') + 8)).toEqual(['inselausflug', 'blendax', 'mampfaffe', 'krachfaust', 'blendax_rotglut', 'mampfaffe_rotglut', 'krachfaust_rotglut', 'revierstreit_smaragd']);
    expect(MONSTER_RP.krachfaust).toBe(300);
    expect(RANKS.at(-1)).toEqual({ jr: 10, keys: ['krachfaust'], rp: RANK_RP[10] });
    expect(RANK_RP[10]).toBe(3000);
  });
  it('Freischaltung: Krachfaust braucht Rang 9 (also Mampfaffe-Sieg), gibt Rang 10 mit genug RP; Rotglut/Revierstreit ab Rang 10', () => {
    const s = defaultSave();
    s.jr = 8; s.rp = 5000;
    expect(questLock(s, quests.krachfaust)).toEqual({ reason: 'jr', need: 9 });
    s.jr = 9;
    expect(questLock(s, quests.krachfaust)).toBeNull();
    s.rp = 2999;
    expect(questLock(s, quests.krachfaust)).toEqual({ reason: 'rp', need: 1 });
    for (const id of ['krachfaust_rotglut', 'revierstreit_smaragd']) expect(questLock(s, quests[id])).toEqual({ reason: 'jr', need: 10 });
    s.jr = 10;
    for (const id of ['krachfaust_rotglut', 'revierstreit_smaragd']) expect(questLock(s, quests[id])).toBeNull();
  });
  it('Drops, Materialien, Set und Kompendium', () => {
    for (const id of ['krachfaust_schleim', 'krachfaust_kruste', 'krachfaust_faustplatte', 'krachfaust_runenherz']) expect(ITEMS[id], id).toBeTruthy();
    expect(ITEMS.krachfaust_runenherz.value).toBe(350);
    const d = DROPS.krachfaust;
    expect(d.carve.map((c) => c.id)).toEqual(['krachfaust_kruste', 'krachfaust_schleim', 'krachfaust_faustplatte', 'tempelstein', 'krachfaust_runenherz']);
    expect(d.breaks.pranke[0].id).toBe('krachfaust_faustplatte'); expect(d.breaks.head[0].id).toBe('krachfaust_kruste');
    for (const e of [...d.carve, ...d.reward, ...Object.values(d.breaks).flat()]) expect(ITEMS[e.id], e.id).toBeTruthy();
    const got = rollReward('krachfaust', createRng(3), 1);
    expect(got.length === undefined ? Object.keys(got).length : got.length).toBeGreaterThan(0);
    const set = ARMOR_SETS.krachfaust;
    expect(set.prot).toBe(50); expect(set.skills).toEqual(['schleimhaut', 'zaehe_socke']);
    expect(SET_ORDER.at(-1)).toBe('krachfaust');
    for (const sl of ['head', 'body', 'legs']) for (const id of Object.keys(set.pieces[sl].cost)) expect(id === 'schrott' || ITEMS[id], id).toBeTruthy();
    const b = BESTIARY.find((x) => x.id === 'krachfaust');
    expect(b.entries.length).toBe(9);
    expect(b.entries.map((e) => e.name)).toContain('Urknall');
    expect(ELEM_NOTES.krachfaust).toMatch(/Schock/);
  });
});
