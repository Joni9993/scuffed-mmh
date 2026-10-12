import { describe, it, expect } from 'vitest';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { weapons } from '../../src/game/weapons/index.js';
import { armbrust, AMMO, LB, st, fireBolt } from '../../src/game/weapons/armbrust.js';
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats } from '../../src/data/weapons.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { ITEM_IDS, ITEMS } from '../../src/data/items.js';
import { defaultSave } from '../../src/meta/save.js';
import { encodeGear, decodeGear } from '../../src/data/gearlook.js';

const DT = 1 / 60;
function setup({ ammoTip = null, glitching = false, tips = 5 } = {}) {
  const spawned = [], says = [];
  const inv = { n: tips, consume() { if (this.n <= 0) return false; this.n--; return true; }, count() { return this.n; } };
  const player = {
    id: 'p', sinceRoll: 99, glitching, ammoTip, pos: { x: 0, y: 0, z: 0 }, rot: 0, lockPoint: () => null, stats: {},
    ctx: {
      monsters: [], cameraYaw: 0, inventory: inv, world: { heightAt: () => 0 },
      bus: { emit() {} }, fx: { number: (p, t) => says.push(t), spark() {}, shake() {}, flash() {}, marker() {}, clearMarker() {} },
      projectiles: { spawn(o) { spawned.push(o); return o; } }, playerHit() {},
    },
  };
  const w = new WeaponState(armbrust, { player });
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w, player, spawned, says, inv, d: st(w),
    step(sec = DT) { const n = Math.max(1, Math.round(sec / DT)); for (let i = 0; i < n; i++) { w.update(DT, inp); player.sinceRoll += DT; A.pressed = A.released = B.pressed = B.released = false; } },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
  };
  return api;
}

describe('Ratterbüchse', () => {
  it('registriert, Stufen, Save, Gear-Code', () => {
    expect(weapons.lb).toBe(armbrust);
    expect(WEAPON_ORDER).toContain('lb');
    expect(WEAPON_TYPES.lb.tiers).toHaveLength(6);
    expect(weaponStats('lb', 1).power).toBe(70);
    expect(defaultSave().weapons.lb.tier).toBe(1);
    expect(decodeGear(encodeGear({ weapon: { type: 'lb', tier: 3, branch: 'b' } })).weapon).toEqual({ type: 'lb', tier: 3, branch: 'b' });
  });
  it('Magazin leert sich je Schuss, Streu = 5 Schrot, Durchschlag pierce 3', () => {
    const t = setup();
    fireBolt(t.w);
    expect(t.d.mag.normal).toBe(AMMO.normal.mag - 1);
    t.d.ammo = 'streu'; fireBolt(t.w);
    expect(t.spawned.length).toBe(1 + 5);
    t.d.ammo = 'durch'; fireBolt(t.w);
    expect(t.spawned.at(-1).pierce).toBe(3);
  });
  it('Reload: 1,0 s ohne Treffer-Timing, Magazin voll danach', () => {
    const t = setup();
    t.d.mag.normal = 0;
    t.tap('A'); t.step(1.4);
    expect(t.d.mag.normal).toBe(AMMO.normal.mag);
    expect(t.d.sauberMag).toBe(false);
  });
  it('Sauber geladen: B im Fenster 0,45-0,6 s beendet sofort, +15 % fuer das naechste Magazin', () => {
    const t = setup();
    t.d.mag.normal = 0;
    t.tap('A');
    while (!(t.d.rel && t.d.rel.t >= 0.5)) t.step();
    t.tap('B', 0.02);
    expect(t.d.mag.normal).toBe(AMMO.normal.mag);
    expect(t.d.sauberMag).toBe(true);
    expect(t.says).toContain('Sauber geladen!');
    expect(t.w.moveId === 'lb_done' || t.w.moveId === null).toBe(true);
    const rec = fireBolt(t.w);
    expect(rec.dmgMul).toBeCloseTo(LB.reload.sauberMul);
  });
  it('B ausserhalb des Fensters = Klemmer (1,4 s), danach geladen', () => {
    const t = setup();
    t.d.mag.normal = 0;
    t.tap('A'); t.step(0.25);
    t.tap('B', 0.02);
    expect(t.w.moveId).toBe('lb_klemmer');
    expect(t.d.mag.normal).toBe(0);
    t.step(1.5);
    expect(t.d.mag.normal).toBe(AMMO.normal.mag);
    expect(t.d.sauberMag).toBe(false);
  });
  it('Leer + A: Auto-Nachladen; Munition ist unendlich (Zyklus laedt immer wieder)', () => {
    const t = setup();
    for (let i = 0; i < 40; i++) { t.tap('A'); t.step(0.3); }
    expect(t.d.shots).toBeGreaterThanOrEqual(30);
    expect(t.d.mag.normal).toBeGreaterThanOrEqual(0);
  });
  it('Rattern: ca. 3 Schuesse/s, x1,15 Schaden', () => {
    const t = setup();
    t.press('A'); t.step(2);
    const n = t.d.shots;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(t.d.log[0].dmgMul).toBeCloseTo(LB.rattern.mul);
    expect(t.w.moveSpeedMul()).toBeLessThanOrEqual(0.6);
  });
  it('Spitzen: 1 je Bolzen verbraucht, nicht im Glitch', () => {
    const t = setup({ ammoTip: 'brennspitze' });
    fireBolt(t.w); fireBolt(t.w);
    expect(t.inv.n).toBe(3);
    expect(t.spawned[0].color).toBe(0xff7a1a);
    const g = setup({ ammoTip: 'brennspitze', glitching: true });
    fireBolt(g.w); fireBolt(g.w);
    expect(g.inv.n).toBe(5);
  });
  it('Glitch: kein Nachladen, Magazin bleibt voll, Rattern ohne Tempo-Malus', () => {
    const t = setup({ glitching: true });
    for (let i = 0; i < 30; i++) fireBolt(t.w);
    expect(t.d.mag.normal).toBe(AMMO.normal.mag);
    expect(t.d.wantReload).toBe(false);
    t.d.mag.normal = 0;
    t.tap('A'); t.step(0.1);
    expect(t.w.moveId).not.toBe('lb_reload');
    t.press('A'); t.step(0.5);
    expect(t.w.moveId).toBe('lb_rattern_g');
    expect(t.w.moveSpeedMul()).toBe(1);
  });
  it('Mine: B halten setzt, max. 2 Ladungen, +1 nach 20 s', () => {
    const t = setup();
    for (let i = 0; i < 3; i++) { t.tap('B'); t.step(0.6); }
    expect(t.d.mines.length).toBe(2);
    expect(t.d.charges).toBe(0);
    t.step(20.5);
    expect(t.d.charges).toBe(1);
  });
  it('Finisher (Wucht 100 + B halten) hat Vorrang vor der Mine', () => {
    const t = setup();
    t.w.wucht = 100; t.w.sinceWuchtHit = 0;
    t.press('B'); t.step(0.5);
    expect(t.w.moveId === 'lb_finisher' || t.w.lastMoveId === 'lb_finisher').toBe(true);
    expect(t.d.mines.length).toBe(0);
  });
  it('Cooldown: Tipp-Spam feuert max. 3/s, hoechstens 1 Schuss gepuffert', () => {
    const t = setup();
    for (let i = 0; i < 30; i++) { t.tap('A', 0.02); t.step(0.05); } // ~2,5 s Spam
    expect(t.d.shots).toBeLessThanOrEqual(9);
    expect(t.d.shots).toBeGreaterThanOrEqual(6);
  });
  it('Auto-Nachladen bei leerem Magazin, auch mit gehaltenem A; Rattern setzt danach fort; Reload-Status fuer HUD', () => {
    const t = setup();
    t.press('A'); t.step(5);
    expect(t.d.shots).toBeGreaterThan(AMMO.normal.mag);
    t.d.mag.normal = 0; t.d.wantReload = true; t.step(0.1);
    const st = armbrust.status(t.w);
    expect(st.reload?.win).toEqual(LB.reload.win);
  });
  it('B ohne Reload: Tipp = Mine; B halten ohne Wucht 100 = nichts', () => {
    const t = setup();
    t.press('B'); t.step(0.5); t.release('B'); t.step(0.6);
    expect(t.d.mines.length).toBe(0);
    t.tap('B'); t.step(0.6);
    expect(t.d.mines.length).toBe(1);
  });
  it('Regression: Schuss, Ausfallschritt, Schuss verbraucht Munition (kein Gratis-Hüpfschuss)', () => {
    const t = setup();
    t.tap('A'); t.step(0.5);
    const after1 = t.d.mag.normal;
    expect(after1).toBe(AMMO.normal.mag - 1);
    t.w.cancel(); t.player.sinceRoll = 0; // Rolle/Ausfallschritt
    t.tap('A'); t.step(0.6);
    expect(t.d.mag.normal).toBe(after1 - 1);
    const rec = t.d.log.at(-1);
    expect(rec.free).toBe(false);
    expect(rec.dmgMul).toBeCloseTo(1.1);
  });
  it('Projektile: Geschoss-Stil je Munition, Muendung aus dem Waffen-Mesh', () => {
    const t = setup();
    t.player.weaponMesh = { userData: { muzzle: { updateWorldMatrix() {}, getWorldPosition(v) { v.set(3, 1.4, 4); return v; } } } };
    fireBolt(t.w);
    expect(t.spawned[0].style).toBe('slug');
    expect(t.spawned[0].pos.x).toBe(3);
    t.d.ammo = 'streu'; fireBolt(t.w);
    expect(t.spawned.at(-1).style).toBe('pellet');
    t.d.ammo = 'durch'; fireBolt(t.w);
    expect(t.spawned.at(-1).style).toBe('long');
  });
  it('Rolle = Ausfallschritt-Konfig', () => {
    expect(armbrust.rollOverride().step).toBe(true);
    expect(armbrust.walkLegs).toBe(true);
  });
  it('HUD-Status: Magazin-Pips, Glitch-Flicker NaN/inf', () => {
    const t = setup();
    expect(armbrust.status(t.w)).toMatchObject({ level: AMMO.normal.mag, max: AMMO.normal.mag });
    const g = setup({ glitching: true });
    expect(armbrust.status(g.w).text).toMatch(/\/∞/);
  });
  it('Munitionssorten: virtuelle Leisten-Items nur mit lb, unendlich, nicht in ITEM_IDS', () => {
    const inv = new HuntInventory({ free: { flickbrause: 2 }, weapon: 'lb' });
    for (const id of ['ammo_normal', 'ammo_streu', 'ammo_durch']) {
      expect(inv.bar).toContain(id);
      expect(inv.count(id)).toBe(Infinity);
      expect(inv.consume(id, 5)).toBe(true);
      expect(ITEM_IDS).not.toContain(id);
      expect(ITEMS[id].virtual).toBe(true);
    }
    expect(inv.used()).toEqual({});
    expect(inv.bring('ammo_streu', 3)).toBe(0);
    inv.setWeapon('bow');
    expect(inv.bar.some((id) => id.startsWith('ammo_'))).toBe(false);
    expect(new HuntInventory({ weapon: 'bow' }).bar).toEqual([]);
    inv.setWeapon('lb');
    expect(inv.bar.filter((id) => id.startsWith('ammo_'))).toHaveLength(3);
  });
});

describe('Jagd verlassen (Host im Koop allein): Spitzen bleiben abgebucht', () => {
  it('applyHuntLeave bucht Verbrauchtes ab, behält Gesammeltes', async () => {
    const { applyHuntLeave } = await import('../../src/meta/progression.js');
    const s = defaultSave();
    s.box.giftspitze = 20;
    const inv = new HuntInventory({ brought: [{ id: 'giftspitze', n: 20 }], weapon: 'bow' });
    for (let i = 0; i < 7; i++) inv.consume('giftspitze', 1);
    inv.add('knisterkraut', 2);
    applyHuntLeave(s, { used: inv.used(), gathered: inv.gathered(), chest: null });
    expect(s.box.giftspitze).toBe(13);
    expect(s.box.knisterkraut).toBe(2);
  });
});
