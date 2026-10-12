import { describe, it, expect, beforeEach } from 'vitest';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { weapons } from '../../src/game/weapons/index.js';
import {
  glitchaxt, GLITCH_GAIN, BLITZ_WINDOW, STOLPER, SCHALT_MIN, SCHWERT_DECAY, FIN_DRUCK, ZF_MUL, entladCount, addDruck, st,
} from '../../src/game/weapons/glitchaxt.js';
import { buildGlitchaxtLook, updateGlitchaxtLook, GA_N, gaLookKey } from '../../src/game/gear/glitchaxtLook.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { settings } from '../../src/core/settings.js';
import { resolvePlayerHit } from '../../src/game/combat.js';
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats, upgradeOptions, WEAPON_UPGRADES } from '../../src/data/weapons.js';
import { ITEMS } from '../../src/data/items.js';
import { defaultSave, sanitize, migrate } from '../../src/meta/save.js';
import { upgradeWeapon, weaponUpgradeOptions } from '../../src/meta/crafting.js';
import { encodeGear, decodeGear } from '../../src/data/gearlook.js';
import { WEAPON_TIPS, GA_EXTRA, showOnboarding } from '../../src/ui/onboarding.js';
import { addGlitchEnergy } from '../../src/game/glitch.js';

const DT = 1 / 60;

// ---- reiner WeaponState-Harness (wie katana.test.js)
function setup({ sinceRoll = 99, glitching = false } = {}) {
  const sfx = [], says = [];
  const player = {
    sinceRoll, glitching, glitch: { _zf: false }, pos: { x: 0, y: 0, z: 0 }, rot: 0,
    ctx: { bus: { emit: (n, o) => n === 'sfx' && sfx.push(o.name) }, fx: { number: (p, t, k) => says.push([t, k]), spark() {}, shake() {}, flash() {} } },
  };
  let drained = 0;
  const w = new WeaponState(glitchaxt, { player, drain: (a) => { drained += a; } });
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w, player, sfx, says, drained: () => drained,
    step(sec = DT) {
      const n = Math.max(1, Math.round(sec / DT));
      for (let i = 0; i < n; i++) { w.update(DT, inp); player.sinceRoll += DT; A.pressed = A.released = B.pressed = B.released = false; }
    },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
    until(pred, max = 5) { for (let t = 0; t < max && !pred(); t += DT) api.step(); },
    /** Treffer simulieren (so wie player.afterHit es tut) */
    hit(druck) { glitchaxt.onHit({ weapon: w }, {}, { hit: { druck }, group: 'x' }, {}); },
    mode(m, druck) { w.data.mode = m; w.data.druck = druck; },
  };
  return api;
}
const bwOf = (id) => glitchaxt.moves[id].hits.reduce((s, h) => (s.has(h.group) ? s : s.set(h.group, h.mv)), new Map());
const sumBw = (id) => [...bwOf(id).values()].reduce((a, b) => a + b, 0);
const druckOf = (id) => { const m = new Map(); for (const h of glitchaxt.moves[id].hits) m.set(h.group, h.druck); return [...m.values()]; };

// ---- Player-Harness
function makeCtx() {
  const calls = { numbers: [], hits: [] };
  const ctx = {
    world: { heightAt: () => 0, collide: () => {} },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number: (p, t) => calls.numbers.push(t), spark() {}, shake() {}, flash() {}, glitch() {} },
    playerHit(p, mon, hp, ah) { calls.hits.push({ mon, hp, ah, dmgMul: p.def.dmgMul?.(p.weapon) ?? 1 }); },
    respawn(p) { p.respawn(0, 0); },
  };
  ctx.calls = calls;
  return ctx;
}
function make() {
  const ctx = makeCtx();
  const p = new Player({ ctx, weapon: 'ga' });
  p.spawnAt(0, 0, 0);
  ctx.players.push(p);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.input.poll(DT); p.update(DT); } };
  return { ctx, p, step, w: p.weapon };
}
beforeEach(() => { time.reset(); settings.gaFehl = 0; });

describe('Glitchaxt: Registrierung und Daten', () => {
  it('ist als `ga` registriert, jeder Move hat eine Animation', () => {
    expect(weapons.ga).toBe(glitchaxt);
    for (const m of Object.values(glitchaxt.moves)) expect(glitchaxt.anims[m.anim], m.id).toBeTruthy();
  });
  it('Kraft je Stufe/Ast laut GDD 17.2', () => {
    expect(WEAPON_ORDER).toEqual(['gs', 'db', 'bow', 'kt', 'kk', 'ga', 'lb']);
    expect(WEAPON_TYPES.ga.tiers.length).toBe(6);
    expect(weaponStats('ga', 1).power).toBe(78);
    expect(weaponStats('ga', 2).power).toBe(97);
    expect(weaponStats('ga', 3, 'a')).toMatchObject({ power: 114, crit: 0.15 });
    expect(weaponStats('ga', 3, 'b')).toMatchObject({ power: 112, elems: { shock: 14 } });
    expect(weaponStats('ga', 4)).toMatchObject({ power: 132, elems: { fire: 22 } });
    expect(weaponStats('ga', 5, 'k')).toMatchObject({ power: 146, elems: { rust: 18 }, partDmgMul: 1.25 });
    expect(weaponStats('ga', 5, 'g')).toMatchObject({ power: 148, crit: 0.15, elems: { fire: 20 } });
    expect(weaponStats('ga', 5, 'v')).toMatchObject({ power: 152, elems: { shock: 22 } });
    expect(weaponStats('ga', 6, 'v')).toMatchObject({ power: 174, elems: { shock: 32 } });
  });
  it('Upgrade-Kosten fuer jede Stufe/jeden Ast nennen echte Materialien', () => {
    for (const [tier, branch] of [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null], [5, 'k'], [5, 'v']]) {
      for (const o of upgradeOptions('ga', tier, branch)) for (const id of Object.keys(o.cost)) expect(id === 'schrott' || ITEMS[id], id).toBeTruthy();
    }
    expect(Object.keys(WEAPON_UPGRADES[3].ga)).toEqual(['a', 'b']);
    expect(Object.keys(WEAPON_UPGRADES[5].ga)).toEqual(['k', 'g', 'v']);
    for (const id of Object.keys(WEAPON_UPGRADES[6].ga.cost)) expect(id === 'schrott' || ITEMS[id], id).toBeTruthy();
  });
  it('Schmiede: Rost -> Knochen -> Zweig b -> Brathalos', () => {
    const s = defaultSave();
    s.schrott = 9999;
    s.box = { altknochen: 10, schrotterz: 20, barrotz_kruste: 10, barrotz_platte: 5, barrotz_schwanzleder: 5, brathalos_schuppe: 10, brathalos_membran: 5, glutsack: 5, glimmstein: 5 };
    expect(upgradeWeapon(s, 'ga').name).toBe('Knochen-Glitchaxt');
    expect(weaponUpgradeOptions(s, 'ga').length).toBe(2);
    expect(upgradeWeapon(s, 'ga', 'b').name).toBe('Barrotz-Plattenaxt');
    expect(upgradeWeapon(s, 'ga').name).toBe('Brathalos-Schuppenaxt');
    expect(s.weapons.ga).toEqual({ tier: 4, branch: 'b' });
  });
  it('Save: neue und alte Saves bekommen eine Start-Glitchaxt, ga ist ausruestbar', () => {
    expect(defaultSave().weapons.ga).toEqual({ tier: 1, branch: null });
    const old = { version: 1, name: 'Alt', weapons: { gs: { tier: 3, branch: 'b' }, db: { tier: 1, branch: null }, bow: { tier: 2, branch: null }, kt: { tier: 4, branch: null } }, loadout: { weapon: 'kt' } };
    const s = migrate(old);
    expect(s.weapons.ga).toEqual({ tier: 1, branch: null });
    expect(s.weapons.kt).toEqual({ tier: 4, branch: null });
    expect(sanitize({ ...old, loadout: { weapon: 'ga' } }).loadout.weapon).toBe('ga');
    expect(sanitize({ weapons: { ga: { tier: 9, branch: 'b' } } }).weapons.ga).toEqual({ tier: 6, branch: 'v' });
    expect(sanitize({ armory: [{ type: 'ga', tier: 5, branch: 'g' }] }).armory).toEqual([{ type: 'ga', tier: 5, branch: 'g' }]);
  });
  it('Gear-Code Roundtrip fuer alle Stufen/Aeste', () => {
    for (const [tier, br] of [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null], [5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']]) {
      const code = encodeGear({ weapon: { type: 'ga', tier, branch: br } }, 3);
      expect(code[0]).toBe('x');
      expect(decodeGear(code).weapon).toEqual({ type: 'ga', tier, branch: br });
    }
    expect(decodeGear(encodeGear({ weapon: { type: 'kt', tier: 2 } })).weapon.type).toBe('kt'); // Katana unberuehrt
  });
});

describe('Glitchaxt: Axt-Kette und Druck-Aufbau', () => {
  it('Hieb (BW 32) -> Aufwaertshieb (BW 30) -> Rundumschlag (BW 40) -> Hieb (Schleife)', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.moveId).toBe('ga_a1');
    expect(sumBw('ga_a1')).toBe(32);
    s.until(() => s.w.t >= glitchaxt.moves.ga_a1.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'ga_a1', 1);
    expect(s.w.moveId).toBe('ga_a2');
    expect(sumBw('ga_a2')).toBe(30);
    s.until(() => s.w.t >= glitchaxt.moves.ga_a2.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'ga_a2', 1);
    expect(s.w.moveId).toBe('ga_a3');
    expect(sumBw('ga_a3')).toBe(40);
    s.until(() => s.w.t >= glitchaxt.moves.ga_a3.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'ga_a3', 1);
    expect(s.w.moveId).toBe('ga_a1');
  });
  it('Druck je Treffer: +8 / +8 / +12, Wilde Schwuenge +6', () => {
    expect(druckOf('ga_a1')).toEqual([8]);
    expect(druckOf('ga_a2')).toEqual([8]);
    expect(druckOf('ga_a3')).toEqual([12]);
    expect(druckOf('ga_wild1')).toEqual([6]);
    expect(sumBw('ga_wild1')).toBe(22);
    const s = setup();
    s.hit(8); s.hit(8); s.hit(12);
    expect(s.w.data.druck).toBe(28);
    s.hit(100);
    expect(s.w.data.druck).toBe(100); // Deckel
  });
  it('Rundumschlag ist breit (Radius 0,7, +-115 Grad)', () => {
    const hits = glitchaxt.moves.ga_a3.hits;
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...hits.map((h) => h.radius))).toBeGreaterThanOrEqual(0.7);
    const xs = hits.map((h) => h.to[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2);
  });
  it('Wucht +3 je Hieb', () => {
    for (const id of ['ga_a1', 'ga_a2', 'ga_s1']) expect(glitchaxt.moves[id].hits[0].wucht).toBe(3);
  });
  it('A halten = Wilde Schwuenge: wiederholen sich solange A gehalten wird, kosten 12 Puste/s, rueckt vor', () => {
    const s = setup();
    s.press('A');
    s.step(0.25);
    expect(s.w.moveId).toBe('ga_wild1');
    expect(glitchaxt.moves.ga_wild1.lunge.dist).toBeGreaterThan(0);
    const seen = new Set();
    for (let i = 0; i < 90; i++) { s.step(); if (s.w.moveId) seen.add(s.w.moveId); }
    expect(seen.has('ga_wild2') && seen.has('ga_wild1')).toBe(true);
    expect([...seen].some((id) => !id.startsWith('ga_wild'))).toBe(false);
    expect(s.drained()).toBeGreaterThan(12 * 1.2); // ~1,7 s Schwuenge
    s.release('A');
    s.until(() => !s.w.busy, 2);
    expect(s.w.busy).toBe(false);
  });
  it('erschoepft: keine weiteren Wilden Schwuenge', () => {
    const player = { sinceRoll: 99 };
    let ex = false;
    const w = new WeaponState(glitchaxt, { player, drain() {}, exhausted: () => ex });
    const A = { down: true, pressed: true, released: false };
    const inp = { A, B: { down: false } };
    for (let i = 0; i < 20; i++) { w.update(DT, inp); A.pressed = false; }
    expect(w.moveId).toBe('ga_wild1');
    ex = true;
    for (let i = 0; i < 60; i++) w.update(DT, inp);
    expect(w.busy).toBe(false);
  });
  it('Rolle -> A: Axt = Sprungspalter (BW 38, 2,5 m), Schwert = Ausfallstich (BW 30, 3 m)', () => {
    const s = setup({ sinceRoll: 0.1 });
    s.tap('A');
    expect(s.w.moveId).toBe('ga_jump');
    expect(sumBw('ga_jump')).toBe(38);
    expect(glitchaxt.moves.ga_jump.lunge.dist).toBe(2.5);
    const t = setup({ sinceRoll: 0.1 });
    t.mode('schwert', 60);
    t.tap('A');
    expect(t.w.moveId).toBe('ga_stich');
    expect(sumBw('ga_stich')).toBe(30);
    expect(glitchaxt.moves.ga_stich.lunge.dist).toBe(3);
    const late = setup({ sinceRoll: 0.4 });
    late.tap('A');
    expect(late.w.moveId).toBe('ga_a1');
  });
});

describe('Glitchaxt: Moduswechsel', () => {
  it('B in der Axt mit >= 25 % Druck: Schaltschlag (BW 34) wechselt ins Schwert', () => {
    const s = setup();
    s.mode('axt', 30);
    s.tap('B');
    s.until(() => s.w.moveId === 'ga_schalt_s', 1);
    expect(sumBw('ga_schalt_s')).toBe(34);
    expect(s.w.data.mode).toBe('axt');
    s.until(() => s.w.data.mode === 'schwert', 1);
    expect(s.w.data.mode).toBe('schwert');
    expect(s.w.data.druck).toBe(30); // Wechsel kostet keinen Druck
  });
  it('Grenze: 25 % schaltet, 24 % hustet', () => {
    const a = setup(); a.mode('axt', SCHALT_MIN); a.tap('B');
    expect(a.w.moveId).toBe('ga_schalt_s');
    const b = setup(); b.mode('axt', SCHALT_MIN - 1); b.tap('B');
    expect(b.w.moveId).toBe('ga_husten');
  });
  it('hustet bei < 25 %: Pixel-Puff + Klack, keine Strafe (Modus, Druck, kein Stolpern)', () => {
    const s = setup();
    s.mode('axt', 10);
    s.tap('B');
    expect(s.w.moveId).toBe('ga_husten');
    expect(glitchaxt.moves.ga_husten.hits).toBeUndefined();
    s.until(() => !s.w.busy, 1);
    expect(s.sfx).toContain('gaHusten');
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.druck).toBe(10);
    expect(s.w.data.fehl).toBe(0);
    expect(glitchaxt.moves.ga_husten.duration).toBeLessThan(0.4);
    expect(glitchaxt.moves.ga_husten.rollCancelAt).toBeLessThan(0.2); // man kann direkt wegrollen
  });
  it('B im Schwert: Schaltschlag (BW 30) zurueck in die Axt, immer erlaubt, Druck bleibt', () => {
    const s = setup();
    s.mode('schwert', 80);
    s.tap('B');
    s.until(() => s.w.moveId === 'ga_schalt_a', 1);
    expect(sumBw('ga_schalt_a')).toBe(30);
    s.until(() => s.w.data.mode === 'axt', 1);
    expect(s.w.data.druck).toBeGreaterThan(70);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.blitzT).toBe(0);
  });
  it('Schwert-Kette: Schnitt (BW 34) -> Doppelschnitt (2 x BW 22) -> Hochschnitt (BW 44)', () => {
    const s = setup();
    s.mode('schwert', 100);
    s.tap('A');
    expect(s.w.moveId).toBe('ga_s1');
    expect(sumBw('ga_s1')).toBe(34);
    expect(sumBw('ga_s2')).toBe(44);
    expect([...bwOf('ga_s2').values()]).toEqual([22, 22]);
    expect(sumBw('ga_s3')).toBe(44);
    s.until(() => s.w.t >= glitchaxt.moves.ga_s1.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'ga_s1', 1);
    expect(s.w.moveId).toBe('ga_s2');
    s.until(() => s.w.t >= glitchaxt.moves.ga_s2.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'ga_s2', 1);
    expect(s.w.moveId).toBe('ga_s3');
  });
  it('Bewegung: Axt wie Katana (0,35), Schwert wie Plattmacher (~0)', () => {
    expect(glitchaxt.moves.ga_a1.moveSpeed).toBe(0.35);
    expect(glitchaxt.moves.ga_s1.moveSpeed).toBeLessThanOrEqual(0.1);
  });
});

describe('Glitchaxt: Druck im Schwert', () => {
  it('jeder Treffer -8, zusaetzlich -3 Druck/s', () => {
    for (const id of ['ga_s1', 'ga_s3', 'ga_stich']) expect(druckOf(id)).toEqual([-8]);
    expect(druckOf('ga_s2')).toEqual([-8, -8]);
    const s = setup();
    s.mode('schwert', 100);
    s.hit(-8);
    expect(s.w.data.druck).toBe(92);
    s.step(1);
    expect(s.w.data.druck).toBeCloseTo(92 - SCHWERT_DECAY, 1);
  });
  it('in der Axt sinkt der Druck nie', () => {
    const s = setup();
    s.mode('axt', 60);
    s.step(5);
    expect(s.w.data.druck).toBe(60);
  });
  it('Schwert-Treffer veraendern die Wucht-/Druck-Regeln nicht ausserhalb des Hits (kein Druck-Delta = nichts)', () => {
    const s = setup();
    s.mode('schwert', 50);
    glitchaxt.onHit({ weapon: s.w }, {}, { hit: { mv: 10 }, group: 'q' }, {});
    expect(s.w.data.druck).toBe(50);
  });
  it('Player.afterHit ruft den Waffen-Hook (Druck waechst durch echte Treffer)', () => {
    const m = make();
    m.p.afterHit({ hitstop: 0, wucht: 3 }, { hit: { druck: 8 }, group: 'a1' }, {});
    expect(m.w.data.druck).toBe(8);
    expect(m.w.wucht).toBe(3);
  });
  it('Zaehlt nicht fuer Fremdwaffen: Katana hat keinen onHit-Hook', () => {
    expect(weapons.kt.onHit).toBeUndefined();
  });
});

describe('Kipp-Regel (Kern-Twist)', () => {
  it('<= 15 % im Schwert: Ticken wird schneller; 16 % tickt nicht', () => {
    const s = setup();
    s.mode('schwert', 16);
    s.step(0.1);
    expect(s.w.data.ticking).toBe(false);
    s.w.data.druck = 15;
    s.w.data.tickT = 0;
    s.step(1);
    const slow = s.sfx.filter((n) => n === 'gaTick').length;
    expect(slow).toBeGreaterThanOrEqual(2);
    const t = setup();
    t.mode('schwert', 14.9);
    t.w.data.tickT = 0;
    // schneller werdend: Intervall nahe 0 % ~0,1 s, bei 15 % ~0,4 s
    const gaps = [];
    let last = null;
    for (let i = 0; i < 600 && t.w.data.druck > 0.5; i++) { const n0 = t.w.data.tickN | 0; t.step(); t.w.data.druck = Math.max(1, t.w.data.druck - 0.1); if ((t.w.data.tickN | 0) > n0) { if (last !== null) gaps.push((i - last) * DT); last = i; } }
    expect(gaps.length).toBeGreaterThan(3);
    expect(gaps[gaps.length - 1]).toBeLessThan(gaps[0]);
  });
  it('Druck 0 im Schwert = Blitz fuer 0,4 s (Pling)', () => {
    const s = setup();
    s.mode('schwert', 2);
    s.step(1);
    expect(s.w.data.druck).toBe(0);
    expect(s.w.data.blitzT).toBeGreaterThan(0);
    expect(s.w.data.blitzT).toBeLessThanOrEqual(BLITZ_WINDOW);
    expect(s.sfx).toContain('gaPling');
    expect(BLITZ_WINDOW).toBe(0.4);
    expect(glitchaxt.status(s.w)).toMatchObject({ sauber: true });
  });
  it('Treffer, der den Druck auf 0 bringt, loest ebenfalls den Blitz aus', () => {
    const s = setup();
    s.mode('schwert', 6);
    s.hit(-8);
    expect(s.w.data.blitzT).toBeGreaterThan(0);
  });
  it('B im Blitz = "Sauber!": Bonus-Schlag BW 50, +25 % Druck, Axt', () => {
    const s = setup();
    s.mode('schwert', 0);
    s.step(0.02); // oeffnet den Blitz
    expect(s.w.data.blitzT).toBeGreaterThan(0);
    s.tap('B');
    expect(s.w.moveId).toBe('ga_sauber');
    expect(sumBw('ga_sauber')).toBe(50);
    s.step(0.05);
    expect(s.w.flags.sauber).toBe(true);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.druck).toBe(25);
    expect(s.w.data.blitzT).toBe(0);
    const h = glitchaxt.moves.ga_sauber.hits[0];
    expect(h.sauberText).toBe('Sauber!');
    expect(h.wucht).toBe(10); // Sauber +10 Wucht
    expect(s.w.activeHits().every((a) => a.sauber)).toBe(true);
    s.step(0.7);
    expect(s.w.data.fehl).toBe(0); // kein Fehlzuender nachtraeglich
  });
  it('Sauber-Schlag nimmt den vollen BW 50 ohne den normalen Sauber-Bonus (sauberMul 1)', () => {
    const hit = glitchaxt.moves.ga_sauber.hits[0];
    const res = resolvePlayerHit({ power: 100, critChance: 0, sauber: true, dmgMul: 1 }, hit, { factor: 1 }, () => 0.99);
    expect(res.dmg).toBe(50);
  });
  it('Fenstergrenzen: B bei 0,36 s zaehlt, B nach 0,4 s nicht mehr (= Fehlzuendung)', () => {
    const early = setup();
    early.mode('schwert', 0);
    early.step(0.02);
    early.step(0.34);
    expect(early.w.data.blitzT).toBeGreaterThan(0);
    early.tap('B');
    expect(early.w.moveId).toBe('ga_sauber');

    const late = setup();
    late.mode('schwert', 0);
    late.step(0.02);
    late.step(0.43);
    expect(late.w.moveId).toBe('ga_fehl');
    expect(late.w.data.fehl).toBe(1);
  });
  it('B kurz VOR dem Blitz (Eingabepuffer, 0,08 s) zaehlt noch', () => {
    const s = setup();
    s.mode('schwert', 0.1);
    s.press('B');
    s.step(0.05);
    s.release('B');
    s.step(0.05);
    expect(s.w.data.blitzT).toBeGreaterThanOrEqual(0);
    s.until(() => s.w.moveId === 'ga_sauber' || s.w.moveId === 'ga_schalt_a' || s.w.moveId === 'ga_fehl', 1);
    expect(['ga_sauber', 'ga_schalt_a']).toContain(s.w.moveId);
  });
  it('Fehlzuendung: Axt, Druck 0, rote Schwebeschrift, Knall, 0,5 s Stolpern ohne Roll-Abbruch', () => {
    const s = setup();
    s.mode('schwert', 0);
    s.step(0.02);
    s.step(0.45);
    expect(s.w.moveId).toBe('ga_fehl');
    s.step(0.02);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.druck).toBe(0);
    expect(s.says.some(([t, k]) => t === 'Fehlzündung' && k === 'hurt')).toBe(true);
    expect(s.sfx).toContain('gaKnall');
    const m = glitchaxt.moves.ga_fehl;
    expect(m.duration).toBe(STOLPER);
    expect(STOLPER).toBe(0.5);
    expect(m.hits).toBeUndefined();
    expect(s.w.canRollCancel()).toBe(false); // kein Roll-Abbruch
    s.step(0.2);
    expect(s.w.canRollCancel()).toBe(false);
    s.until(() => !s.w.busy, 1);
    expect(s.w.busy).toBe(false);
    expect(s.w.canRollCancel()).toBe(true);
  });
  it('Fehlzuendung zaehlt in den Einstellungen mit; Lern-Hinweis nur bei den ersten 2', () => {
    const misfire = () => { const s = setup(); s.mode('schwert', 0); s.step(0.02); s.step(0.45); return s; };
    const a = misfire();
    expect(settings.gaFehl).toBe(1);
    expect(a.says.some(([t]) => /Aufblitzen/.test(t))).toBe(true);
    misfire();
    expect(settings.gaFehl).toBe(2);
    const c = misfire();
    expect(settings.gaFehl).toBe(3);
    expect(c.says.some(([t]) => /Aufblitzen/.test(t))).toBe(false);
  });
  it('Onboarding: Waffen-Tipp, Zusatzzeile erst nach einer Fehlzuendung', () => {
    expect(WEAPON_TIPS.ga).toMatch(/Glitchaxt/);
    const host = { appendChild() {} };
    const html = (s) => { let el; const prev = globalThis.document; globalThis.document = { createElement: () => (el = { addEventListener() {}, remove() {} }) }; try { showOnboarding(host, 'ga', { s, save() {}, autoMs: 1e9 }); } finally { globalThis.document = prev; } return el.innerHTML; };
    expect(html({ tipsShown: 0 })).toContain('Glitchaxt');
    expect(html({ tipsShown: 0 })).not.toContain(GA_EXTRA);
    expect(html({ tipsShown: 0, gaFehl: 2 })).toContain(GA_EXTRA);
    expect(html({ tipsShown: 0, gaFehl: 2 })).toContain('sauber schalten');
  });
  it('kein Blitz in der Axt, waehrend Entladung/Finisher/Wechsel oder im Glitch', () => {
    const a = setup(); a.mode('axt', 0); a.step(1);
    expect(a.w.data.blitzT).toBe(0);
    const g = setup({ glitching: true }); g.mode('schwert', 0.5); g.step(2);
    expect(g.w.data.blitzT).toBe(0);
    expect(g.w.data.druck).toBe(0.5); // Druck sinkt im Glitch nicht
    const sa = setup(); sa.mode('schwert', 50); sa.tap('B'); sa.hit(-100);
    expect(sa.w.data.blitzT).toBe(0); // Wechsel zurueck laeuft: kein Blitz
  });
});

describe('Entladung (B halten im Schwert)', () => {
  it('Pulszahl 2..6 nach Druck', () => {
    expect(entladCount(100)).toBe(6);
    expect(entladCount(50)).toBe(3);
    expect(entladCount(17)).toBe(2);
    expect(entladCount(1)).toBe(2); // mindestens 2
    expect(entladCount(0)).toBe(2);
    expect(entladCount(84)).toBe(6);
  });
  it('6 x BW 14 + Abschluss BW 40, verbraucht allen Druck, endet in der Axt', () => {
    const s = setup();
    s.mode('schwert', 100);
    s.press('B');
    s.step(0.4);
    expect(s.w.moveId).toBe('ga_entlad6');
    const m = glitchaxt.moves.ga_entlad6;
    expect(m.hits.length).toBe(7);
    expect(m.hits.slice(0, 6).every((h) => h.mv === 14)).toBe(true);
    expect(m.hits[6].mv).toBe(40);
    expect(sumBw('ga_entlad6')).toBe(6 * 14 + 40);
    expect(s.w.data.druck).toBe(0);
    expect(s.w.data.mode).toBe('schwert'); // erst am Ende Axt
    s.release('B');
    s.until(() => !s.w.busy, 3);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.druck).toBe(0);
    expect(s.w.data.blitzT).toBe(0); // Entladung loest keinen Blitz aus
    expect(s.w.data.fehl).toBe(0);
  });
  it('weniger Druck = weniger Pulse, mindestens 2', () => {
    const run = (druck) => { const s = setup(); s.mode('schwert', druck); s.press('B'); s.step(0.4); return s.w.moveId; };
    expect(run(100)).toBe('ga_entlad6');
    expect(run(50)).toBe('ga_entlad3');
    expect(run(8)).toBe('ga_entlad2');
    expect(glitchaxt.moves.ga_entlad2.hits.length).toBe(3);
  });
  it('Treffer waehrend der Entladung aendern den Druck nicht', () => {
    const s = setup();
    s.mode('schwert', 60);
    s.press('B'); s.step(0.45);
    expect(s.w.moveId).toMatch(/^ga_entlad/);
    s.hit(-8);
    expect(s.w.data.druck).toBe(0);
    expect(s.w.data.blitzT).toBe(0);
  });
  it('abgebrochene Entladung bleibt nicht im Schwert haengen', () => {
    const s = setup();
    s.mode('schwert', 60);
    s.press('B'); s.step(0.45);
    s.w.cancel();
    s.step(0.1);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.entlad).toBe(false);
  });
});

describe('Finisher Kernschmelze', () => {
  it('B halten (0,3 s) bei Wucht 100: Explosion BW 210, 3 m, Superruestung, endet in der Axt mit 50 % Druck', () => {
    const s = setup();
    s.w.addWucht(100);
    s.mode('schwert', 70);
    s.press('B');
    s.step(0.4);
    expect(s.w.moveId).toBe('ga_finisher');
    const m = glitchaxt.moves.ga_finisher;
    expect(sumBw('ga_finisher')).toBe(210);
    expect(m.hits[0].radius).toBe(3);
    expect(s.w.superArmor()).toBe('all');
    expect(m.superArmor).toBe('all');
    expect(s.w.wucht).toBe(0); // verbraucht
    expect(s.w.data.mode).toBe('schwert'); // Wechsel erst bei der Explosion
    s.release('B');
    s.step(0.8);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.druck).toBe(FIN_DRUCK);
  });
  it('funktioniert in beiden Modi; ohne Wucht 100 oder bei kurzem Tipp nur der Schaltschlag', () => {
    const a = setup(); a.w.addWucht(100); a.mode('axt', 0); a.press('B'); a.step(0.4);
    expect(a.w.moveId).toBe('ga_finisher');
    const b = setup(); b.w.addWucht(99); b.mode('axt', 60); b.press('B'); b.step(0.4);
    expect(b.w.moveId).toBe('ga_schalt_s');
    const c = setup(); c.w.addWucht(100); c.mode('axt', 60); c.tap('B', 0.1);
    expect(c.w.moveId).toBe('ga_schalt_s');
  });
  it('waehrend der Kernschmelze laeuft die Kipp-Regel nicht', () => {
    const s = setup();
    s.w.addWucht(100);
    s.mode('schwert', 4);
    s.press('B'); s.step(0.4);
    expect(s.w.moveId).toBe('ga_finisher');
    s.step(0.3);
    expect(s.w.data.blitzT).toBe(0);
    expect(s.w.data.druck).toBeGreaterThan(0);
  });
  it('Wucht-100-Finisher hat Vorrang vor der Entladung', () => {
    const s = setup(); s.w.addWucht(100); s.mode('schwert', 100); s.press('B'); s.step(0.4);
    expect(s.w.moveId).toBe('ga_finisher');
  });
});

describe('Glitch "Zustandsfehler"', () => {
  const monster = (parts = [{ part: { id: 'head' }, pos: { x: 0, y: 1, z: 2 } }]) => ({ alive: true, hurtParts: () => parts });
  it('zweiter Treffer (ZF_MUL) ueber den normalen Treffer-Pfad; kein Dreifach-Treffer', () => {
    const m = make();
    const mon = monster();
    m.w.startMove('ga_a1');
    m.w.t = 0.15;
    m.p.glitch.active = true;
    glitchaxt.glitch.onHit(m.p, { partId: 'head' }, mon);
    expect(m.ctx.calls.hits.length).toBe(1);
    const h = m.ctx.calls.hits[0];
    expect(h.dmgMul).toBe(ZF_MUL);
    expect(h.ah.group).toBe('zf');
    expect(h.ah.hit.mv).toBe(32);
    expect(h.ah.hit.hitstop).toBe('none');
    // der Zweittreffer loest selbst keinen weiteren aus
    m.p.glitch._zf = true;
    glitchaxt.glitch.onHit(m.p, { partId: 'head' }, mon);
    m.p.glitch._zf = false;
    expect(m.ctx.calls.hits.length).toBe(1);
    expect(glitchaxt.dmgMul(m.w)).toBe(1);
  });
  it('Zweittreffer aendert den Druck nicht', () => {
    const m = make();
    m.w.data.druck = 40;
    m.p.afterHit({ hitstop: 0, wucht: 0 }, { hit: { druck: 8 }, group: 'zf' }, {});
    expect(m.w.data.druck).toBe(40);
  });
  it('Druck sinkt nicht, jeder Wechsel geht ohne Mindestdruck und ist automatisch "Sauber!"', () => {
    const s = setup({ glitching: true });
    s.mode('axt', 3);
    s.hit(-8);
    expect(s.w.data.druck).toBe(3);
    s.tap('B');
    expect(s.w.moveId).toBe('ga_schalt_s'); // 3 % reichen im Glitch
    s.until(() => s.w.data.mode === 'schwert', 1);
    expect(s.w.flags.sauber).toBe(true);
    s.hit(-8); s.step(2);
    expect(s.w.data.druck).toBe(3);
    expect(s.w.data.blitzT).toBe(0);
  });
  it('Glitch-Ende: Schwert nie mit Druck 0 zurueck (kein Blitz aus dem Nichts)', () => {
    const m = make();
    m.w.data.mode = 'schwert'; m.w.data.druck = 0;
    glitchaxt.glitch.onEnd(m.p);
    expect(m.w.data.druck).toBeGreaterThan(0);
  });
  it('Glitch-Energie: Waffen-Faktor GLITCH_GAIN (Glitchaxt laedt langsamer), andere Waffen unveraendert', () => {
    const m = make();
    expect(glitchaxt.glitchGainMul).toBe(GLITCH_GAIN);
    expect(GLITCH_GAIN).toBeLessThan(1);
    expect(addGlitchEnergy(m.p, 10)).toBeCloseTo(10 * GLITCH_GAIN, 5);
    const k = new Player({ ctx: makeCtx(), weapon: 'kt' });
    expect(addGlitchEnergy(k, 10)).toBe(10);
  });
  it('Glitch-Hook ist am Def (Name) und im Player verdrahtet', () => {
    expect(glitchaxt.glitch.name).toBe('Zustandsfehler');
    const m = make();
    expect(m.p.def.glitch).toBe(glitchaxt.glitch);
  });
});

describe('HUD, Koop, Optik', () => {
  it('Status: Modus-Chip AXT/SCHWERT + Druck-Level', () => {
    const s = setup();
    expect(glitchaxt.status(s.w)).toMatchObject({ text: 'AXT 0%', level: 0, max: 4 });
    s.mode('axt', 60);
    expect(glitchaxt.status(s.w)).toMatchObject({ text: 'AXT 60%', level: 3 });
    s.mode('schwert', 100);
    expect(glitchaxt.status(s.w)).toMatchObject({ text: 'SCHWERT 100%', level: 4 });
    s.w.addWucht(100);
    expect(glitchaxt.status(s.w).text).toMatch(/Kern/);
  });
  it('Pose-Level (Netz) kodiert Modus, Druck und Blitz', () => {
    const s = setup();
    s.mode('axt', 40);
    expect(glitchaxt.poseLevel(s.w)).toBe(8);
    s.mode('schwert', 100);
    expect(glitchaxt.poseLevel(s.w)).toBe(32 + 20);
    s.w.data.blitzT = 0.2;
    expect(glitchaxt.poseLevel(s.w) & 64).toBe(64);
  });
  it('alle 9 Looks bauen: Stiel + 10 Bloecke, Anker am Stiel, eigene Form je Look', () => {
    const sig = new Set();
    for (const [tier, br] of [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null], [5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']]) {
      const m = buildGlitchaxtLook(tier, br);
      const g = m.userData.ga;
      expect(g.blocks.length).toBe(GA_N);
      expect(m.userData.twoHand).toBeTruthy();
      expect(m.children.filter((c) => c.visible).length).toBe(1 + GA_N); // Stiel + Bloecke (Geister unsichtbar)
      sig.add(gaLookKey(tier, br) + ':' + g.blocks[0].mesh.geometry.attributes.position.count);
    }
    expect(new Set([...sig].map((s) => s.split(':')[0])).size).toBe(9);
    expect(new Set([...sig].map((s) => s.split(':')[1])).size).toBeGreaterThan(5); // verschiedene Block-Geometrie
    expect(glitchaxt.buildMesh({ tier: 3, branch: 'b' }).userData.ga.key).toBe('barr');
  });
  it('Morph Axt <-> Schwert dauert ~0,2 s, Anker/Stiel morpht nie', () => {
    const m = buildGlitchaxtLook(1, null);
    const g = m.userData.ga;
    const shaftPos = m.children[0].position.clone();
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0 }, DT);
    const axtY = g.blocks[GA_N - 1].mesh.position.y;
    for (let i = 0; i < 6; i++) updateGlitchaxtLook(m, { mode: 'schwert', druck: 50 }, DT);
    expect(g.k).toBeGreaterThan(0.4);
    expect(g.k).toBeLessThan(1);
    for (let i = 0; i < 8; i++) updateGlitchaxtLook(m, { mode: 'schwert', druck: 50 }, DT);
    expect(g.k).toBe(1);
    const swY = g.blocks[GA_N - 1].mesh.position.y;
    expect(swY).toBeLessThan(axtY - 0.3); // Reihe ist laenger als der Klumpen
    expect(m.children[0].position.equals(shaftPos)).toBe(true);
  });
  it('Glut: Fugen leuchten vom Griff aus je nach Druck (magenta), Blitz = alle weiss', () => {
    const m = buildGlitchaxtLook(4, null);
    const g = m.userData.ga;
    const gl = (i) => g.blocks[i].mat.userData.glow.value;
    updateGlitchaxtLook(m, { mode: 'axt', druck: 30 }, DT);
    expect(gl(0)).toBeGreaterThan(0.7); // Griffnaher Block voll
    expect(gl(1)).toBeGreaterThan(0.7);
    expect(gl(3)).toBe(0);
    expect(gl(GA_N - 1)).toBe(0);
    updateGlitchaxtLook(m, { mode: 'axt', druck: 55 }, DT);
    expect(gl(3)).toBeGreaterThan(0.7);
    expect(gl(4)).toBeGreaterThan(0.2); // halber Block
    expect(gl(4)).toBeLessThan(gl(3));
    expect(gl(5)).toBe(0);
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0 }, DT);
    for (let i = 0; i < GA_N; i++) expect(gl(i)).toBe(0);
    updateGlitchaxtLook(m, { mode: 'schwert', druck: 0, blitz: true }, DT);
    for (let i = 0; i < GA_N; i++) { expect(g.blocks[i].mat.emissive.g).toBeGreaterThan(0.6); expect(g.blocks[i].mat.emissive.r).toBeGreaterThan(0.6); expect(gl(i)).toBeLessThan(0.1); }
  });
  it('Fehlzuendung: Bloecke platzen weg und kommen schief zurueck; Zustandsfehler zeigt Geisterbloecke', () => {
    const m = buildGlitchaxtLook(1, null);
    const g = m.userData.ga;
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0 }, DT);
    const home = g.blocks[3].mesh.position.clone();
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0, anim: 'ga_fehl', at: 0.2 }, DT);
    expect(g.blocks[3].mesh.position.distanceTo(home)).toBeGreaterThan(0.3);
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0, anim: 'ga_fehl', at: 0.5 }, DT);
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0 }, DT);
    expect(g.tilt).toBeGreaterThan(0.5); // schief
    expect(g.blocks[0].ghost.visible).toBe(false);
    updateGlitchaxtLook(m, { mode: 'axt', druck: 0, glitch: true }, DT);
    expect(g.blocks.every((b) => b.ghost.visible)).toBe(true);
  });
  it('Remote-Avatar: Modus/Druck kommen aus dem Pose-Level, bleiben zwischen Moves erhalten', () => {
    const ctx = makeCtx();
    const p = new Player({ ctx, weapon: 'ga', local: false });
    p.remote = { state: 'free', rollT: 0, sprint: false, speed: 0, wp: { name: 'ga_s1', t: 0.2, charging: false, level: 32 + 10 }, air: 0 };
    for (let i = 0; i < 30; i++) p.updateRemote(DT);
    expect(p.weaponMesh.userData.ga.k).toBe(1);
    p.remote.wp = null; // zwischen den Moves wird kein Level gesendet
    for (let i = 0; i < 10; i++) p.updateRemote(DT);
    expect(p.weaponMesh.userData.ga.k).toBe(1);
    for (const mv of Object.values(glitchaxt.moves)) expect(p.anims[mv.anim], mv.id).toBeTruthy();
  });
  it('Player nutzt Glitchaxt im Spielablauf: Wilde Schwuenge, Rollen, Mesh-Update ohne Fehler', () => {
    const m = make();
    m.ctx.input.set('attack', true, 'bot');
    m.step(80);
    expect(m.w.moveId).toMatch(/^ga_/);
    m.ctx.input.set('attack', false, 'bot');
    m.w.data.mode = 'schwert'; m.w.data.druck = 40;
    m.step(30);
    expect(m.p.weaponMesh.userData.ga.k).toBeGreaterThan(0);
  });
  it('KO/Respawn leert den Glitchaxt-Zustand (Axt, Druck 0, kein offener Blitz/Timer)', () => {
    const m = make();
    m.w.data.mode = 'schwert'; m.w.data.druck = 0; m.w.data.blitzT = 0.3; m.w.data.entlad = true; m.w.data.ticking = true;
    m.p.respawn(0, 0);
    expect(m.w.data).toMatchObject({ mode: 'axt', druck: 0, blitzT: 0, entlad: false, ticking: false });
    for (let i = 0; i < 60; i++) m.step();
    expect(m.w.data.fehl | 0).toBe(0);
    expect(m.w.moveId).toBeNull();
    expect(settings.gaFehl | 0).toBe(0);
    const s = setup();
    s.mode('schwert', 0); s.step(0.02); s.w.reset(); s.step(0.6);
    expect(s.w.data.mode).toBe('axt');
    expect(s.w.data.fehl | 0).toBe(0);
  });
  it('addDruck/st sind sicher mit leerem Zustand', () => {
    const w = new WeaponState(glitchaxt, {});
    expect(st(w)).toMatchObject({ mode: 'axt', druck: 0 });
    expect(addDruck(w, 500)).toBe(100);
    expect(addDruck(w, -500)).toBe(0);
  });
});
