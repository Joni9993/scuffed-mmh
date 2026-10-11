// Essen (Owner Okt 2026): Koch-Mahlzeit + Grillsteak wirken bis zum Umkippen, danach weg; sichtbar über Max-HP/-Puste.
import { describe, it, expect } from 'vitest';
import { applyLoadout } from '../../src/game/loadout.js';
import { defaultLoadout } from '../../src/meta/loadout.js';
import { Player } from '../../src/game/player.js';
import { makeCtx, DT } from './p3helpers.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { ItemSystem } from '../../src/game/items.js';

function eat(meal) {
  const ctx = makeCtx(); const toasts = []; ctx.toast = (t) => toasts.push(t); ctx.spawnEffect = () => {};
  const p = new Player({ ctx }); p.spawnAt(0, 0, 0); ctx.players.push(p);
  applyLoadout(p, { ...defaultLoadout({ weapon: 'gs', tier: 1 }), food: meal });
  const inv = new HuntInventory({ brought: [{ id: 'grillsteak', n: 3 }], free: {} });
  const sys = new ItemSystem(ctx, p, inv);
  const use = () => { sys.request(); for (let i = 0; i < 120; i++) { ctx.input.poll(DT); sys.update(DT); p.update(DT); } };
  return { p, inv, use, toasts };
}

const mk = (food) => { const p = new Player({ ctx: makeCtx() }); const lo = { ...defaultLoadout({ weapon: 'gs', tier: 1 }), food }; applyLoadout(p, lo); return { p, lo }; };

describe('Essen', () => {
  it('Koch-Mahlzeit erhöht Max-HP/-Puste und wird am Pirscher gemerkt', () => {
    const { p } = mk('eintopf');
    expect(p.v.maxHp).toBe(125); expect(p.foodHp).toBe(25); expect(p.mealId).toBe('eintopf');
    const q = mk('pustebrei').p; expect(q.v.maxStamina).toBe(125); expect(q.foodStamina).toBe(25);
  });
  it('Grillsteak-Bonus überlebt das Neu-Anwenden (Camp-Truhe)', () => {
    const { p, lo } = mk('eintopf');
    p.grillStamina = 25; p.grillHp = 40; p.v.maxStamina += 25; p.v.maxHp += 40;
    applyLoadout(p, lo, { reapply: true });
    expect(p.v.maxStamina).toBe(125); expect(p.v.maxHp).toBe(165);
  });
  it('ohne Essen (nach dem Umkippen) wieder Basiswerte', () => {
    const { p, lo } = mk('eintopf');
    p.grillStamina = 0; p.grillHp = 0;
    applyLoadout(p, { ...lo, food: null }, { reapply: true });
    expect(p.v.maxHp).toBe(100); expect(p.v.maxStamina).toBe(100); expect(p.mealId).toBeNull(); expect(p.foodHp).toBe(0);
  });
  it('Grillsteak: +40 Max-HP (sofort aufgefüllt) und +25 Max-Puste', () => {
    const { p, inv, use } = eat(null);
    use();
    expect(inv.count('grillsteak')).toBe(2);
    expect(p.v.maxHp).toBe(140); expect(p.v.hp).toBe(140); expect(p.v.maxStamina).toBe(125);
  });
  it('Essen stapelt nicht: zweites Grillsteak / Grillsteak nach Koch-Mahlzeit wird nicht gegessen', () => {
    const a = eat(null); a.use(); a.use();
    expect(a.inv.count('grillsteak')).toBe(2); expect(a.p.v.maxHp).toBe(140);
    const b = eat('eintopf'); b.use();
    expect(b.inv.count('grillsteak')).toBe(3); expect(b.p.v.maxHp).toBe(125); expect(b.toasts.join()).toMatch(/Schon gegessen/);
  });
});
