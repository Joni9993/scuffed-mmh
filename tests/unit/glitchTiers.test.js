// Glitch-Stufen (Endgame, docs/ENDGAME.md): Freischaltung, Stapelung, Fairness, Save-Migration, Wochen-Glitch, Übertaktung, Netz-Sanitizing.
import { describe, it, expect } from 'vitest';
import { createRng } from '../../src/core/rng.js';
import { quests, getQuest } from '../../src/data/quests.js';
import { MUTATORS, GLITCH_MUTATOR_ORDER, MAX_MUTATORS, MAX_TIER_MUTATORS, cleanMutatorIds, cleanTierMutatorIds, resolveMods } from '../../src/data/mutators.js';
import {
  TIERS, MAX_TIER, cleanTier, tierMutators, isTierQuest, tierQuestIds, glitchQuest, cleanPostGlitch, splitterForWin, SPLITTER_FACTOR, WEEKLY_BONUS,
  OC_MAX, OC_COST_WEAPON, OC_COST_ARMOR, ocPowerMul, ocProtMul, ocCost, weekSeed,
} from '../../src/data/glitchTiers.js';
import { defaultSave, sanitize, migrate, exportCode, importCode, CURRENT_VERSION } from '../../src/meta/save.js';
import { tierUnlocked, recordGlitchWin, bestTime, overclockWeapon, overclockArmor, ocOfWeapon, ocOfPiece, addSplitter, monstersClearedAt } from '../../src/meta/endgame.js';
import { weeklyGlitch, weeklyQuest, WEEKLY_COUNT } from '../../src/meta/weekly.js';
import { buildRewards, applyHuntResult } from '../../src/meta/progression.js';
import { armorProtection, buildLoadout } from '../../src/meta/loadout.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { weaponStats } from '../../src/data/weapons.js';
import { pickAwards } from '../../src/meta/awards.js';
import { QuestBoardState } from '../../src/net/questboard.js';
import { AttackInstance, MIN_TELEGRAPH } from '../../src/game/monsters/attack.js';
import { monsters } from '../../src/game/monsters/index.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';

const tierQ = (monster, tier) => glitchQuest(getQuest(monster), { tier }).quest;
const win = (s, q, time = 300) => applyHuntResult(s, q, buildRewards({ quest: q, result: 'win', rng: createRng(1), rpMul: 1 }), { time });

describe('Stufentabelle und Stapelung', () => {
  it('10 Stufen, alle Mutatoren existieren, keine Duplikate je Stufe, nie über der Obergrenze', () => {
    expect(TIERS).toHaveLength(MAX_TIER + 1);
    for (let t = 1; t <= MAX_TIER; t++) {
      const ids = tierMutators(t);
      expect(ids.every((i) => MUTATORS[i]), `Stufe ${t}`).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBeGreaterThanOrEqual(1);
      expect(ids.length).toBeLessThanOrEqual(MAX_TIER_MUTATORS);
      expect(cleanTierMutatorIds(ids)).toEqual(ids); // Obergrenze lässt jede Stufe unverändert durch
    }
  });
  it('Stufe 10 = 4-5 Mutatoren, Mutatoren-Zahl und Beute steigen, Zeitlimit-und-Leben-Kombi gibt es nie', () => {
    expect(tierMutators(10).length).toBeGreaterThanOrEqual(4);
    expect(tierMutators(10).length).toBeLessThanOrEqual(5);
    for (let t = 2; t <= MAX_TIER; t++) {
      expect(tierMutators(t).length).toBeGreaterThanOrEqual(tierMutators(t - 1).length);
      expect(TIERS[t].matMul).toBeGreaterThan(TIERS[t - 1].matMul);
      expect(TIERS[t].payMul).toBeGreaterThan(TIERS[t - 1].payMul);
    }
    for (let t = 1; t <= MAX_TIER; t++) expect(tierMutators(t).includes('timeout') && tierMutators(t).includes('redundanz')).toBe(false);
  });
  it('cleanMutatorIds: Standard bleibt bei 2, Stufen-Obergrenze explizit 5, Müll fliegt raus', () => {
    expect(MAX_MUTATORS).toBe(2); expect(MAX_TIER_MUTATORS).toBe(5);
    const all = Object.keys(MUTATORS);
    expect(cleanMutatorIds(all)).toHaveLength(2);
    expect(cleanTierMutatorIds(all)).toHaveLength(5);
    expect(cleanTierMutatorIds(['hotfix', 'hotfix', 'nix', 7, null, 'timeout'])).toEqual(['hotfix', 'timeout']);
    expect(cleanTierMutatorIds('hotfix')).toEqual([]);
  });
  it('Stapelung multipliziert/addiert sauber (Stufe 10)', () => {
    const m = resolveMods(tierMutators(10));
    expect(m.monster.dmgMul).toBeCloseTo(1.4); // overflow
    expect(m.monster.speedMul).toBeCloseTo(1.25); expect(m.monster.recoverMul).toBeCloseTo(0.7);
    expect(m.monster.telegraphMul).toBeCloseTo(0.85); expect(m.monster.chainBonus).toBeCloseTo(0.6);
    expect(m.monster.regenPct).toBeGreaterThan(0);
    expect(m.player.dmgMul).toBeCloseTo(0.85);
    // Mutator-reward-Faktoren würden x3,7+ ergeben; die Stufe ersetzt sie durch die Tabelle
    const q = tierQ('jaggo', 10);
    expect(q.matMul).toBe(TIERS[10].matMul);
    expect(q.mutators).toEqual(tierMutators(10));
  });
  it('chainBonus ist additiv (zwei Quellen nicht multiplizieren)', () => {
    MUTATORS.__t = { id: '__t', name: 't', reward: 1, monster: { chainBonus: 0.5 } };
    expect(resolveMods(['hotfix', '__t']).monster.chainBonus).toBeCloseTo(1.1);
    delete MUTATORS.__t;
  });
  it('6 neue Mutatoren mit generischen Hooks, kein Code pro Brocken', () => {
    expect(GLITCH_MUTATOR_ORDER).toHaveLength(6);
    const hooks = { monster: ['speedMul', 'recoverMul', 'telegraphMul', 'dmgMul', 'hpMul', 'regenPct', 'chainBonus', 'rageAlways', 'hideColorCues', 'lagSpike'], player: ['dmgMul', 'healItems', 'staminaMul', 'glitchGainMul'], hunt: ['timeMul', 'fog', 'matMul'] };
    for (const id of GLITCH_MUTATOR_ORDER) {
      const m = MUTATORS[id];
      expect(m.name && m.desc && m.reward > 1).toBeTruthy();
      for (const g of ['monster', 'player', 'hunt']) for (const k of Object.keys(m[g] ?? {})) expect(hooks[g]).toContain(k);
    }
  });
});

describe('Fairness-Minimum: Telegraph nie unter 0,5 s', () => {
  it('kombinierter Telegraph-Faktor aller Stufen bleibt ≥ 0,75', () => {
    for (let t = 1; t <= MAX_TIER; t++) expect(resolveMods(tierMutators(t)).monster.telegraphMul ?? 1).toBeGreaterThanOrEqual(0.75);
  });
  it('mit Stufe-10-Mods, Rage und Timing-Variation fällt kein Angriff unter MIN_TELEGRAPH', () => {
    const tg = resolveMods(tierMutators(10)).monster.telegraphMul;
    let n = 0;
    for (const q of tierQuestIds()) {
      const def = monsters[quests[q].monster];
      for (const a of Object.values(def.attacks ?? {})) {
        if (!(a.telegraph > 0) || !a.hits) continue;
        for (const rage of [false, true]) for (const v of [0.85, 1, 1.25]) {
          const inst = new AttackInstance(a, { attackId: a.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 6 }, seed: 3, rage, tgMul: v * tg });
          expect(inst.tgWall, `${def.id}.${a.id}`).toBeGreaterThanOrEqual(MIN_TELEGRAPH - 1e-9);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });
});

describe('Freischaltung pro Brocken', () => {
  it('Stufen gibt es nur für echte Brocken-Jagden', () => {
    const ids = tierQuestIds();
    expect(ids).toContain('jaggo'); expect(ids).toContain('gockelok'); expect(ids).toHaveLength(13);
    for (const bad of ['kraeuterlauf', 'gratausflug', 'training', 'jaggo_rotglut', 'revierstreit', 'revierstreit_smaragd']) expect(isTierQuest(quests[bad]), bad).toBe(false);
    expect(isTierQuest({ ...quests.jaggo, fieldStudy: '2026-W41' })).toBe(false);
  });
  it('Stufe 1 erst nach dem ersten Sieg, Stufe n+1 nach Sieg auf Stufe n, Maximum 10, je Brocken getrennt', () => {
    const s = defaultSave();
    expect(tierUnlocked(s, 'jaggo')).toBe(0);
    const r0 = win(s, quests.jaggo);
    expect(r0.glitch.unlocked).toBe(1); // Ergebnisbildschirm zeigt "Glitch-Stufe 1 freigeschaltet"
    expect(tierUnlocked(s, 'jaggo')).toBe(1);
    expect(tierUnlocked(s, 'barrotz')).toBe(0);
    for (let t = 1; t <= 10; t++) {
      expect(tierUnlocked(s, 'jaggo')).toBe(Math.min(10, t));
      win(s, tierQ('jaggo', t));
      expect(tierUnlocked(s, 'jaggo')).toBe(Math.min(10, t + 1));
    }
    expect(tierUnlocked(s, 'jaggo')).toBe(10);
    expect(monstersClearedAt(s, 10)).toBe(1); expect(monstersClearedAt(s, 5)).toBe(1);
  });
  it('Niederlage schaltet nichts frei und gibt keine Splitter', () => {
    const s = defaultSave(); win(s, quests.jaggo);
    const q = tierQ('jaggo', 1);
    const r = applyHuntResult(s, q, buildRewards({ quest: q, result: 'fail', rng: createRng(1) }), { time: 100 });
    expect(r.glitch).toBe(null); expect(tierUnlocked(s, 'jaggo')).toBe(1); expect(s.glitch.splitter).toBe(0);
  });
  it('Gast ohne eigene Freischaltung: Sieg schaltet lokal frei und gibt Splitter', () => {
    const s = defaultSave(); // nie gegen Barrotz gewonnen, tritt Stufe 4 bei
    expect(tierUnlocked(s, 'barrotz')).toBe(0);
    const r = win(s, tierQ('barrotz', 4), 250);
    expect(r.glitch.splitter).toBe(4 * SPLITTER_FACTOR);
    expect(tierUnlocked(s, 'barrotz')).toBe(5);
    expect(s.glitch.splitter).toBe(16);
    expect(s.jr).toBe(1); // nie Rang-Aufstieg über eine Stufen-Jagd
  });
  it('Stufen-Jagd ist ein Sieg, aber nie "erster Abschluss" des Basis-Auftrags', () => {
    const s = defaultSave(); const r = win(s, tierQ('jaggo', 2));
    expect(r.firstClear).toBe(false); expect(s.kills.jaggo).toBe(1); expect(s.best.jaggo).toBeUndefined(); // eigene Bestzeit-Ablage
  });
});

describe('Splitter, Bestzeit, Auszeichnung', () => {
  it('Splitter = Stufe x Faktor je Sieg', () => {
    expect(splitterForWin(1)).toBe(4); expect(splitterForWin(10)).toBe(40); expect(splitterForWin(0)).toBe(0); expect(splitterForWin(99)).toBe(40);
  });
  it('Bestzeit je Brocken x Stufe, "Neue Bestzeit" nur bei Verbesserung', () => {
    const s = defaultSave(); win(s, quests.jaggo, 400);
    expect(bestTime(s, quests.jaggo, 0)).toBe(400);
    let r = win(s, tierQ('jaggo', 1), 500);
    expect(r.best).toMatchObject({ tier: 1, time: 500, prev: null, isNew: true });
    r = win(s, tierQ('jaggo', 1), 520); expect(r.best.isNew).toBe(false); expect(bestTime(s, quests.jaggo, 1)).toBe(500);
    r = win(s, tierQ('jaggo', 1), 480); expect(r.best).toMatchObject({ prev: 500, isNew: true, time: 480 });
    expect(bestTime(s, quests.jaggo, 1)).toBe(480); expect(bestTime(s, quests.jaggo, 2)).toBe(null); expect(bestTime(s, quests.barrotz, 1)).toBe(null);
    r = win(s, quests.jaggo, 380); expect(r.best).toMatchObject({ tier: 0, prev: 400, isNew: true }); expect(s.best.jaggo).toBe(380);
  });
  it('Auszeichnung bei Stufe 5 und 10 (awards-System), darunter keine', () => {
    const s = defaultSave(); win(s, quests.jaggo);
    expect(win(s, tierQ('jaggo', 4)).glitch.award).toBe(null);
    const a5 = win(s, tierQ('jaggo', 5)).glitch.award, a10 = win(s, tierQ('jaggo', 10)).glitch.award;
    expect([a5, a10]).toEqual([5, 10]);
    const st = { damage: 900, hits: 40, perfect: 4, kos: 1, glitchDmg: 200, rolls: 9 };
    expect(pickAwards(st, [], { tierAward: 5 })[0].id).toBe('glitch_veteran');
    expect(pickAwards(st, [], { tierAward: 10 })[0].id).toBe('glitch_legende');
    expect(pickAwards(st, [], { tierAward: 10 })).toHaveLength(3);
    expect(pickAwards(st, [], {}).some((a) => a.id.startsWith('glitch_'))).toBe(false);
  });
});

describe('Save: Migration und Defaults', () => {
  it('alter v2-Save lädt ohne Fehler, Glitch/Übertaktung = Defaults, Fortschritt bleibt', () => {
    const old = { version: 2, name: 'Alt', jr: 5, rp: 500, schrott: 123, clears: { jaggo: 3 }, kills: { jaggo: 3 }, best: { jaggo: 200 }, weapons: { gs: { tier: 3, branch: 'a' } }, loadout: { weapon: 'gs' } };
    const s = migrate(old);
    expect(s.version).toBe(CURRENT_VERSION);
    expect(s.glitch).toEqual({ cleared: {}, best: {}, splitter: 0, weekly: '' });
    expect(s.oc).toEqual({ weapons: {}, armor: {} });
    expect(s.schrott).toBe(123); expect(s.best.jaggo).toBe(200);
    expect(tierUnlocked(s, 'jaggo')).toBe(1); // alter Sieg zählt: Stufe 1 offen
    expect(migrate({ version: 1, kills: {}, clears: {} }).glitch.splitter).toBe(0);
    expect(migrate({ playerName: 'Proto', rank: 2 }).oc.weapons).toEqual({});
  });
  it('kaputte Endgame-Daten werden bereinigt', () => {
    const s = sanitize({ ...defaultSave(), glitch: { cleared: { jaggo: 99, 'bad id': 3, barrotz: -2 }, best: { jaggo: { 3: 100, 11: 5, x: 9, 4: -1 }, '!': { 1: 1 } }, splitter: -50, weekly: 'quatsch' }, oc: { weapons: { gs: 9, nix: 3, db: 'x' }, armor: { lumpen_head: 2, kein_teil: 1 } } });
    expect(s.glitch.cleared).toEqual({ jaggo: 10 });
    expect(s.glitch.best).toEqual({ jaggo: { 3: 100 } });
    expect(s.glitch.splitter).toBe(0); expect(s.glitch.weekly).toBe('');
    expect(s.oc).toEqual({ weapons: { gs: 5 }, armor: { lumpen_head: 2 } });
    expect(sanitize('müll').glitch.splitter).toBe(0);
  });
  it('Export/Import behält Stufen, Splitter und Übertaktung', () => {
    const s = defaultSave(); win(s, quests.jaggo); win(s, tierQ('jaggo', 1), 321); addSplitter(s, 100); overclockWeapon(s, 'gs');
    const r = importCode(exportCode(s));
    expect(r.ok).toBe(true);
    expect(r.save.glitch.cleared.jaggo).toBe(1); expect(r.save.glitch.best.jaggo[1]).toBe(321);
    expect(r.save.glitch.splitter).toBe(s.glitch.splitter); expect(r.save.oc.weapons.gs).toBe(1);
  });
});

describe('Wochen-Glitch', () => {
  it('gleiche Woche = gleicher Brocken und gleiche Mutatoren (kein Server), nächste Woche anders', () => {
    const a = weeklyGlitch(new Date(2026, 9, 19)), b = weeklyGlitch(new Date(2026, 9, 25, 23, 59));
    expect(a).toEqual(b);
    const c = weeklyGlitch(new Date(2026, 9, 26));
    expect(c.key).not.toBe(a.key); expect(c.seed).not.toBe(a.seed);
    const mons = new Set(), muts = new Set();
    for (let w = 0; w < 40; w++) { const g = weeklyGlitch(new Date(2026, 0, 5 + 7 * w)); mons.add(g.monster); g.mutators.forEach((m) => muts.add(m)); }
    expect(mons.size).toBeGreaterThan(5); expect(muts.size).toBeGreaterThan(8);
  });
  it('immer 4 verschiedene bekannte Mutatoren, nie Timeout + Redundanz, Brocken hat Stufen, Jahreswechsel ok', () => {
    for (let w = 0; w < 120; w++) {
      const g = weeklyGlitch(new Date(2026, 0, 1 + 7 * w));
      expect(g.mutators).toHaveLength(WEEKLY_COUNT); expect(new Set(g.mutators).size).toBe(WEEKLY_COUNT);
      expect(g.mutators.every((m) => MUTATORS[m])).toBe(true);
      expect(g.mutators.includes('timeout') && g.mutators.includes('redundanz')).toBe(false);
      expect(isTierQuest(quests[g.questId])).toBe(true);
      expect(g.key).toMatch(/^\d{4}-W\d{2}$/);
    }
    expect(weeklyGlitch(new Date(2026, 11, 31)).key).toBe(weeklyGlitch(new Date(2027, 0, 1)).key);
  });
  it('Auftrag: Basis-Quest + feste Mutatoren, Beute x2,5, gleicher Seed bei allen, kein Rang-Aufstieg', () => {
    const d = new Date(2026, 9, 24), w = weeklyGlitch(d), q = weeklyQuest(d);
    expect(q.baseId).toBe(w.questId); expect(q.mutators).toEqual(w.mutators); expect(q.matMul).toBe(2.5);
    expect(q.weekly).toBe(w.key); expect(q.fixedSeed).toBe(weekSeed(w.key)); expect(q.jrUp).toBeUndefined();
    expect(weekSeed('2026-W43')).toBe(weekSeed('2026-W43')); expect(weekSeed('2026-W43')).not.toBe(weekSeed('2026-W44'));
  });
  it('Bonus-Splitter nur beim ersten Sieg der Woche', () => {
    const s = defaultSave(); const q = weeklyQuest(new Date(2026, 9, 24));
    const r1 = win(s, q, 600);
    expect(r1.glitch.weeklyBonus).toBe(WEEKLY_BONUS); expect(r1.glitch.splitter).toBe(6 * SPLITTER_FACTOR + WEEKLY_BONUS);
    const r2 = win(s, q, 590);
    expect(r2.glitch.weeklyBonus).toBe(0); expect(r2.glitch.splitter).toBe(6 * SPLITTER_FACTOR);
    expect(s.glitch.splitter).toBe(r1.glitch.splitter + r2.glitch.splitter);
    const next = weeklyQuest(new Date(2026, 10, 2));
    expect(win(s, next, 600).glitch.weeklyBonus).toBe(WEEKLY_BONUS);
    expect(s.jr).toBe(1);
  });
});

describe('Übertaktung', () => {
  it('Mathe: +4 % Kraft, +5 % Schutz je Stufe, bei 5 gedeckelt, Kosten steigen', () => {
    expect(ocPowerMul(0)).toBe(1); expect(ocPowerMul(1)).toBeCloseTo(1.04); expect(ocPowerMul(5)).toBeCloseTo(1.2); expect(ocPowerMul(99)).toBeCloseTo(1.2); expect(ocPowerMul(-3)).toBe(1);
    expect(ocProtMul(5)).toBeCloseTo(1.25);
    for (const c of [OC_COST_WEAPON, OC_COST_ARMOR]) { expect(c).toHaveLength(OC_MAX); for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThan(c[i - 1]); }
    expect(ocCost('weapon', 0)).toBe(20); expect(ocCost('weapon', 4)).toBe(160); expect(ocCost('weapon', 5)).toBe(null); expect(ocCost('armor', 2)).toBe(35);
  });
  it('Waffe übertakten: Splitter werden abgezogen, Stufe steigt, Maximum 5, zu wenig Splitter = Fehler ohne Abzug', () => {
    const s = defaultSave();
    expect(overclockWeapon(s, 'gs')).toMatchObject({ ok: false, reason: 'splitter' });
    addSplitter(s, 20 + 40 + 70 + 110 + 160 + 7);
    const costs = [];
    for (let i = 1; i <= 5; i++) { const r = overclockWeapon(s, 'gs'); expect(r.ok).toBe(true); expect(r.level).toBe(i); costs.push(r.cost); }
    expect(costs).toEqual(OC_COST_WEAPON);
    expect(s.glitch.splitter).toBe(7); expect(ocOfWeapon(s, 'gs')).toBe(5);
    expect(overclockWeapon(s, 'gs')).toMatchObject({ ok: false, reason: 'maxed' });
    expect(overclockWeapon(s, 'nix')).toMatchObject({ ok: false, reason: 'unknown' });
    expect(ocOfWeapon(s, 'db')).toBe(0);
  });
  it('Rüstung: nur eigene Teile, je Teil eigene Stufe', () => {
    const s = defaultSave(); addSplitter(s, 100);
    expect(overclockArmor(s, 'barrotz_head')).toMatchObject({ ok: false, reason: 'not_owned' });
    expect(overclockArmor(s, 'lumpen_head').ok).toBe(true);
    expect(overclockArmor(s, 'lumpen_head').level).toBe(2);
    expect(ocOfPiece(s, 'lumpen_head')).toBe(2); expect(ocOfPiece(s, 'lumpen_body')).toBe(0);
    expect(s.glitch.splitter).toBe(100 - 10 - 20);
  });
  it('Schutz-Berechnung: ohne Übertaktung unverändert, mit Übertaktung je Teil gerundet', () => {
    const armor = { head: 'gockelok_head', body: 'gockelok_body', legs: 'gockelok_legs' }; // je 68
    expect(armorProtection(armor)).toBe(204); expect(armorProtection(armor, {})).toBe(204);
    expect(armorProtection(armor, { gockelok_head: 5 })).toBe(Math.round(68 * 1.25) + 68 + 68);
    expect(armorProtection(armor, { gockelok_head: 5, gockelok_body: 5, gockelok_legs: 5 })).toBe(3 * 85);
  });
  it('wirkt im Spiel: Loadout trägt die Übertaktung, applyLoadout skaliert Kraft und Schutz', () => {
    const s = defaultSave(); addSplitter(s, 999);
    for (let i = 0; i < 5; i++) overclockWeapon(s, 'gs');
    for (let i = 0; i < 3; i++) overclockArmor(s, 'lumpen_head');
    const lo = buildLoadout(s), base = buildLoadout(defaultSave());
    expect(lo.oc.weapons.gs).toBe(5);
    const mk = () => { const ctx = { bus: createBus(), input: createInput(), players: [], monsters: [], world: { heightAt: () => 0, collide() {} } }; return new Player({ ctx }); };
    const p0 = mk(), p1 = mk();
    applyLoadout(p0, base); applyLoadout(p1, lo);
    const w = lo.weapon, raw = weaponStats(w.type, w.tier, w.branch).power;
    expect(p0.stats.power).toBeCloseTo(raw); expect(p1.stats.power).toBeCloseTo(raw * 1.2);
    expect(p0.protect).toBe(15); expect(p1.protect).toBe(Math.round(5 * 1.15) + 5 + 5);
    expect(p1.protect).toBeGreaterThan(p0.protect);
    // ohne oc-Feld (alte Loadouts, Debug-URL) bleibt alles wie vorher
    const p2 = mk(); const { oc, ...plain } = lo; void oc; applyLoadout(p2, plain);
    expect(p2.stats.power).toBeCloseTo(raw); expect(p2.protect).toBe(15);
  });
});

describe('Netz: Brett-Sanitizing, Stufe und Mutatoren im Quest-Protokoll', () => {
  const post = (msg) => { const b = new QuestBoardState(); b.apply('p1', { a: 'post', ...msg }); return b; };
  it('Stufe wird geklemmt, Mutatoren kommen aus der Tabelle (gefälschte IDs egal)', () => {
    let p = post({ questId: 'jaggo', tier: 99, mutators: ['rotglut'] }).posts[0];
    expect(p.tier).toBe(10); expect(p.mutators).toEqual(tierMutators(10)); expect(p.mutators.length).toBeLessThanOrEqual(5);
    p = post({ questId: 'jaggo', tier: '7' }).posts[0]; expect(p.tier).toBe(7); expect(p.mutators).toEqual(tierMutators(7));
    p = post({ questId: 'jaggo', tier: -4 }).posts[0]; expect(p.tier).toBe(0); expect(p.mutators).toEqual([]);
    p = post({ questId: 'jaggo', tier: NaN }).posts[0]; expect(p.tier).toBe(0);
    p = post({ questId: 'jaggo', tier: {} , mutators: 'x'}).posts[0]; expect(p.tier).toBe(0); expect(p.mutators).toEqual([]);
  });
  it('ohne Stufe weiter max. 2 freie Mutatoren; Stufe nur für echte Brocken-Jagden', () => {
    expect(post({ questId: 'jaggo', mutators: ['overflow', 'kein_undo', 'hotfix', 'timeout'] }).posts[0].mutators).toHaveLength(2);
    for (const q of ['kraeuterlauf', 'jaggo_rotglut', 'revierstreit', 'gibtsnicht']) { const p = post({ questId: q, tier: 8, weekly: '2026-W43' }).posts[0]; expect(p.tier, q).toBe(0); expect(p.weekly, q).toBe(null); }
  });
  it('Wochen-Glitch: gültiger Schlüssel, bis 5 bekannte Mutatoren, Müll fliegt raus', () => {
    let p = post({ questId: 'barrotz', weekly: '2026-W43', mutators: ['hotfix', 'overflow', 'timeout', 'downgrade', 'null_zeiger', 'redundanz', 'nix'] }).posts[0];
    expect(p.weekly).toBe('2026-W43'); expect(p.mutators).toHaveLength(5); expect(p.tier).toBe(0);
    p = post({ questId: 'barrotz', weekly: '<script>', mutators: ['hotfix'] }).posts[0]; expect(p.weekly).toBe(null); expect(p.mutators).toEqual(['hotfix']);
  });
  it('Start-Nachricht trägt Stufe, Wochenschlüssel und Mutatoren zu allen Mitgliedern', () => {
    const b = post({ questId: 'jaggo', tier: 6 });
    const id = b.posts[0].postId;
    b.apply('p2', { a: 'join', postId: id });
    b.apply('p1', { a: 'ready', r: true });
    const r = b.apply('p2', { a: 'ready', r: true }, 5);
    expect(r.start).toMatchObject({ questId: 'jaggo', tier: 6, weekly: null, members: ['p1', 'p2'] });
    expect(r.start.mutators).toEqual(tierMutators(6));
    expect(JSON.parse(JSON.stringify(b.snapshot())).posts).toEqual(b.posts); // Spiegel der Gäste
  });
  it('Gast baut aus Stufe/Mutatoren denselben Auftrag wie der Host (Hunt: glitchQuest)', () => {
    const host = glitchQuest(getQuest('kroll'), { tier: 8 }).quest;
    const guest = glitchQuest(getQuest('kroll'), { tier: 8, mutators: ['rotglut'] }).quest; // fremde IDs ändern nichts
    expect(guest.mutators).toEqual(host.mutators); expect(guest.matMul).toBe(host.matMul); expect(guest.glitchTier).toBe(8);
    const wk = glitchQuest(getQuest('kroll'), { weekly: '2026-W43', mutators: ['hotfix', 'timeout', 'x'] }).quest;
    expect(wk.mutators).toEqual(['hotfix', 'timeout']); expect(wk.weekly).toBe('2026-W43'); expect(wk.fixedSeed).toBe(weekSeed('2026-W43'));
    expect(glitchQuest(getQuest('kraeuterlauf'), { tier: 5 }).glitch).toBe(false);
    expect(glitchQuest(getQuest('kroll'), {}).quest).toBe(getQuest('kroll'));
  });
  it('Beute: Stufen-Jagd zahlt matMul x payMul, ohne doppelten Mutator-Bonus', () => {
    const q = tierQ('jaggo', 10);
    expect(q.reward).toBe(Math.round(getQuest('jaggo').reward * 2)); expect(q.rp).toBe(Math.round(getQuest('jaggo').rp * 2));
    const r = buildRewards({ quest: q, result: 'win', rng: createRng(1) });
    expect(r.schrott).toBe(q.reward);
    expect(cleanTier(3.9)).toBe(3);
  });
});
