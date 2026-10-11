// Essen (Owner Okt 2026): Koch-Mahlzeit + Grillsteak wirken bis zum Umkippen, danach weg; sichtbar über Max-HP/-Puste.
import { describe, it, expect } from 'vitest';
import { applyLoadout } from '../../src/game/loadout.js';
import { defaultLoadout } from '../../src/meta/loadout.js';
import { Player } from '../../src/game/player.js';
import { makeCtx } from './p3helpers.js';

const mk = (food) => { const p = new Player({ ctx: makeCtx() }); const lo = { ...defaultLoadout({ weapon: 'gs', tier: 1 }), food }; applyLoadout(p, lo); return { p, lo }; };

describe('Essen', () => {
  it('Koch-Mahlzeit erhöht Max-HP/-Puste und wird am Pirscher gemerkt', () => {
    const { p } = mk('eintopf');
    expect(p.v.maxHp).toBe(125); expect(p.foodHp).toBe(25); expect(p.mealId).toBe('eintopf');
    const q = mk('pustebrei').p; expect(q.v.maxStamina).toBe(125); expect(q.foodStamina).toBe(25);
  });
  it('Grillsteak-Puste überlebt das Neu-Anwenden (Camp-Truhe)', () => {
    const { p, lo } = mk('eintopf');
    p.grillStamina = 25; p.v.maxStamina += 25;
    applyLoadout(p, lo, { reapply: true });
    expect(p.v.maxStamina).toBe(125); expect(p.foodStamina).toBe(25);
  });
  it('ohne Essen (nach dem Umkippen) wieder Basiswerte', () => {
    const { p, lo } = mk('eintopf');
    p.grillStamina = 0;
    applyLoadout(p, { ...lo, food: null }, { reapply: true });
    expect(p.v.maxHp).toBe(100); expect(p.v.maxStamina).toBe(100); expect(p.mealId).toBeNull(); expect(p.foodHp).toBe(0);
  });
});
