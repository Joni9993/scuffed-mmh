// Brocken-Kompendium: Einträge wachsen mit Kämpfen, Spielstand zählt Kämpfe (auch verlorene).
import { describe, it, expect } from 'vitest';
import { BESTIARY, CONDITIONS, unlockedEntries, nextUnlock } from '../../src/data/compendium.js';
import { monsters } from '../../src/game/monsters/index.js';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { applyHuntResult } from '../../src/meta/progression.js';
import { getQuest } from '../../src/data/quests.js';

describe('Kompendium', () => {
  it('jeder Brocken existiert, Einträge aufsteigend, Start mit 1 Kampf', () => {
    for (const b of BESTIARY) {
      expect(monsters[b.id]).toBeTruthy();
      expect(b.entries[0].at).toBe(1);
      for (let i = 1; i < b.entries.length; i++) expect(b.entries[i].at).toBeGreaterThanOrEqual(b.entries[i - 1].at);
      for (const e of b.entries) expect(e.text.length).toBeGreaterThan(30);
    }
    expect(CONDITIONS.length).toBeGreaterThan(8);
  });
  it('unlockedEntries / nextUnlock', () => {
    const k = BESTIARY.find((b) => b.id === 'kroll');
    expect(unlockedEntries(k, 0)).toEqual([]);
    expect(unlockedEntries(k, 1).length).toBe(2);
    expect(unlockedEntries(k, 99).length).toBe(k.entries.length);
    expect(nextUnlock(k, 1)).toBe(1); expect(nextUnlock(k, 99)).toBeNull();
  });
  it('Kampf zählt auch bei Niederlage und meldet neue Einträge', () => {
    const s = defaultSave();
    const q = getQuest('kroll');
    const r1 = applyHuntResult(s, q, { result: 'fail', items: {} });
    expect(s.fights.kroll).toBe(1); expect(r1.book.map((x) => x.name)).toEqual(['Scherenzange', 'Dampfstrahl']);
    applyHuntResult(s, q, { result: 'win', items: {}, schrott: 0 });
    expect(s.fights.kroll).toBe(2); expect(s.kills.kroll).toBe(1);
  });
  it('Revierstreit zählt für beide Brocken; alte Saves starten mit ihren Siegen', () => {
    const s = defaultSave();
    applyHuntResult(s, getQuest('revierstreit'), { result: 'fail', items: {} });
    expect(s.fights).toMatchObject({ barrotz: 1, jaggo: 1 });
    const old = sanitize({ kills: { jaggo: 4 } });
    expect(old.fights.jaggo).toBe(4);
    const kept = sanitize({ kills: { jaggo: 4 }, fights: { jaggo: 6 }, bookSeen: { jaggo: 3 } });
    expect(kept.fights.jaggo).toBe(6); expect(kept.bookSeen.jaggo).toBe(3);
  });
});
