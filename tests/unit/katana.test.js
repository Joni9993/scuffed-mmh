import { describe, it, expect, beforeEach } from 'vitest';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { weapons } from '../../src/game/weapons/index.js';
import {
  katana, addSchliff, COUNTER_WINDOW, STANCE_TIME, STANCE_RECOVERY, SCHLIFF_TIME, BLANK_WINDOW, BLANK_MUL, KT_REST,
} from '../../src/game/weapons/katana.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { resolvePlayerHit, SAUBER_MUL } from '../../src/game/combat.js';
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats, upgradeOptions, WEAPON_UPGRADES } from '../../src/data/weapons.js';
import { ITEMS } from '../../src/data/items.js';
import { defaultSave, sanitize, migrate } from '../../src/meta/save.js';
import { upgradeWeapon, weaponUpgradeOptions } from '../../src/meta/crafting.js';

const DT = 1 / 60;

// ---- pure WeaponState harness (like dualblades.test.js)
function setup({ sinceRoll = 99 } = {}) {
  const player = { sinceRoll };
  const w = new WeaponState(katana, { player });
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w, player,
    step(sec = DT) {
      const n = Math.max(1, Math.round(sec / DT));
      for (let i = 0; i < n; i++) { w.update(DT, inp); player.sinceRoll += DT; A.pressed = A.released = B.pressed = B.released = false; }
    },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
    until(pred, max = 5) { for (let t = 0; t < max && !pred(); t += DT) api.step(); },
  };
  return api;
}
const groups = (id) => new Set(katana.moves[id].hits.map((h) => h.group)).size;
const bw = (id) => katana.moves[id].hits.reduce((s, h) => (s.has(h.group) ? s : s.set(h.group, h.mv)), new Map());
const sumBw = (id) => [...bw(id).values()].reduce((a, b) => a + b, 0);

// ---- Player harness (takeHit path)
function makeCtx() {
  const calls = { numbers: [], glitch: 0 };
  const ctx = {
    world: { heightAt: () => 0, collide: () => {} },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number: (p, t) => calls.numbers.push(t), spark() {}, shake() {}, flash() {}, glitch() { calls.glitch++; } },
    playerHit() {}, respawn(p) { p.respawn(0, 0); },
  };
  ctx.calls = calls;
  return ctx;
}
function make() {
  const ctx = makeCtx();
  const p = new Player({ ctx, weapon: 'kt' });
  p.spawnAt(0, 0, 0); // faces +z
  ctx.players.push(p);
  const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.input.poll(DT); p.update(DT); } };
  const secs = (s) => step(Math.round(s / DT));
  return { ctx, p, step, secs, w: p.weapon };
}
const monsterHit = (extra = {}) => ({ dmg: 30, key: 'bite@1:0|p1', sourcePos: { x: 0, y: 0, z: 2.5 }, monster: {}, attackId: 'jaggo_biss', ...extra });
beforeEach(() => time.reset());

describe('Katana A-Kette (GDD 4.4)', () => {
  it('is registered as `kt` and every move has an animation', () => {
    expect(weapons.kt).toBe(katana);
    for (const m of Object.values(katana.moves)) expect(katana.anims[m.anim], m.id).toBeTruthy();
  });
  it('Schnitt (BW 20) -> Zugschnitt (BW 22) -> Kreuzhieb (BW 28) -> Zugschnitt (loop)', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.moveId).toBe('kt_a1');
    expect(sumBw('kt_a1')).toBe(20);
    expect(katana.moves.kt_a1.duration).toBeCloseTo(0.45, 1);
    s.until(() => s.w.t >= katana.moves.kt_a1.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'kt_a1', 1);
    expect(s.w.moveId).toBe('kt_a2');
    expect(sumBw('kt_a2')).toBe(22);
    s.until(() => s.w.t >= katana.moves.kt_a2.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'kt_a2', 1);
    expect(s.w.moveId).toBe('kt_a3');
    expect(sumBw('kt_a3')).toBe(28);
    s.until(() => s.w.t >= katana.moves.kt_a3.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'kt_a3', 1);
    expect(s.w.moveId).toBe('kt_a2'); // repeatable from Zugschnitt
  });
  it('a late tap after the window ends the chain (back to Schnitt)', () => {
    const s = setup();
    s.tap('A');
    s.until(() => s.w.moveId === null, 2);
    s.tap('A');
    expect(s.w.moveId).toBe('kt_a1');
  });
  it('Wucht +3 per cut; walking during the chain is slow but possible', () => {
    for (const id of ['kt_a1', 'kt_a2', 'kt_a3']) {
      const per = new Map();
      for (const h of katana.moves[id].hits) per.set(h.group, h.wucht);
      expect([...per.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(3, 5);
      expect(katana.moves[id].moveSpeed).toBeGreaterThan(0);
      expect(katana.moves[id].moveSpeed).toBeLessThan(0.5);
    }
  });
  it('Rolle -> A = Gleitschnitt (BW 24, 3 m)', () => {
    const s = setup({ sinceRoll: 0.1 });
    s.tap('A');
    expect(s.w.moveId).toBe('kt_gleit');
    expect(sumBw('kt_gleit')).toBe(24);
    expect(katana.moves.kt_gleit.lunge.dist).toBe(3);
    const late = setup({ sinceRoll: 0.6 });
    late.tap('A');
    expect(late.w.moveId).toBe('kt_a1');
  });
});

describe('Ziehschnitt / Blankgezogen', () => {
  it('A halten = Spannung; zu frueh loslassen = nichts', () => {
    const s = setup();
    s.press('A');
    s.step(0.4);
    expect(s.w.moveId).toBe('kt_draw');
    s.release('A');
    s.step(0.05);
    expect(s.w.moveId).toBeNull();
  });
  it('Loslassen nach 0,6 s: Ziehschnitt BW 45, 4 m, Wucht +8, ohne Bonus', () => {
    const s = setup();
    s.press('A');
    s.step(0.2);
    s.until(() => s.w.chargeT >= BLANK_WINDOW[1] + 0.05);
    expect(s.w.sauberOpen).toBe(false);
    s.release('A');
    s.step();
    expect(s.w.moveId).toBe('kt_zieh');
    expect(s.w.flags.sauber).toBe(false);
    const m = katana.moves.kt_zieh;
    expect(m.hits[0].mv).toBe(45);
    expect(m.hits[0].wucht).toBe(8);
    const reach = Math.max(...m.hits.map((h) => Math.hypot(h.to[0], h.to[2]))) + m.lunge.dist;
    expect(reach).toBeGreaterThanOrEqual(4);
  });
  it('Fenster 0,6-0,75 s = "Blankgezogen!" (+20 %), davor und danach nicht', () => {
    const at = (t) => {
      const s = setup();
      s.press('A');
      s.step(0.2);
      s.until(() => s.w.chargeT >= t, 3);
      const open = s.w.sauberOpen;
      s.release('A');
      s.step();
      return { open, sauber: s.w.flags.sauber, id: s.w.moveId };
    };
    expect(at(0.55).id).toBeNull();
    expect(at(0.61)).toMatchObject({ open: true, sauber: true, id: 'kt_zieh' });
    expect(at(0.71)).toMatchObject({ open: true, sauber: true });
    expect(at(0.8)).toMatchObject({ open: false, sauber: false, id: 'kt_zieh' });
  });
  it('Blankgezogen multipliziert den Schaden mit 1,2 (nicht 1,15)', () => {
    const hit = katana.moves.kt_zieh.hits[0];
    expect(hit.sauberMul).toBe(BLANK_MUL);
    const part = { id: 'head', factor: 1, elem: {} };
    const att = { power: 100, critChance: 0, elems: {} };
    const rng = () => 0.5;
    const normal = resolvePlayerHit(att, hit, part, rng).dmg;
    const blank = resolvePlayerHit({ ...att, sauber: true }, hit, part, rng).dmg;
    expect(blank / normal).toBeCloseTo(1.2, 1);
    // other weapons keep the global Sauber bonus
    expect(resolvePlayerHit({ ...att, sauber: true }, { mv: 100 }, part, rng).dmg).toBe(Math.round(100 * SAUBER_MUL));
    expect(katana.status({ charging: true, sauberOpen: true, data: {}, wucht: 0 }).text).toBe('Blankgezogen!');
  });
});

describe('Konterhaltung (Player.takeHit path)', () => {
  const stance = (m) => { m.ctx.input.press('special', 60); m.step(1); expect(m.w.moveId).toBe('kt_stance'); };
  it('B startet die Haltung sofort beim Druecken (Reaktionszeit)', () => {
    const m = make();
    m.ctx.input.press('special', 600);
    m.step(1);
    expect(m.w.moveId).toBe('kt_stance');
    expect(m.w.t).toBeLessThan(0.05);
  });
  it('Treffer in den ersten 0,25 s: kein Schaden, Konterschnitt, Schliff +1, Wucht +15', () => {
    const m = make();
    stance(m);
    m.secs(0.2);
    expect(m.w.moveId).toBe('kt_stance');
    const hp = m.p.hp;
    expect(m.p.takeHit(monsterHit())).toBe('block');
    expect(m.p.hp).toBe(hp);
    expect(m.p.state).toBe('free');
    expect(m.w.moveId).toBe('kt_konter');
    expect(m.w.data.schliff).toBe(1);
    expect(m.w.data.schliffT).toBe(SCHLIFF_TIME);
    expect(m.w.wucht).toBe(15);
    expect(m.ctx.calls.numbers).toContain('Konter!');
    expect(katana.moves.kt_konter.hits[0].mv).toBe(60);
    expect(katana.moves.kt_konter.hits[0].hitstop).toBe('heavy');
  });
  it('Fenstergrenze: 0,24 s kontert, 0,27 s nicht', () => {
    const at = (t) => {
      const m = make();
      stance(m);
      m.secs(t);
      const hp0 = m.p.hp;
      const r = m.p.takeHit(monsterHit());
      return { r, lost: hp0 - m.p.hp, id: m.w.moveId };
    };
    expect(at(0.1)).toMatchObject({ r: 'block', lost: 0, id: 'kt_konter' });
    expect(at(0.24)).toMatchObject({ r: 'block', lost: 0 });
    const late = at(0.28);
    expect(late.r).toBe('hit');
    expect(late.lost).toBeGreaterThan(0);
    expect(at(0.38).r).toBe('hit');
    expect(COUNTER_WINDOW).toBe(0.25);
  });
  it('vor der Haltung / ausserhalb der Haltung gibt es keinen Konter', () => {
    const m = make();
    expect(m.p.takeHit(monsterHit({ key: 'a' }))).toBe('hit');
    const m2 = make();
    m2.ctx.input.press('attack', 40);
    m2.secs(0.1);
    expect(m2.p.takeHit(monsterHit())).not.toBe('block');
  });
  it('funktioniert auch gegen Monster-Projektile', () => {
    const m = make();
    stance(m);
    m.secs(0.15);
    const proj = { dmg: 28, key: 'feuerball|p1', sourcePos: { x: 1.0, y: 1, z: 6 }, monster: {}, attackId: 'feuerball', status: { type: 'burn' } };
    expect(m.p.takeHit(proj)).toBe('block');
    expect(m.p.status.burn).toBeUndefined();
    expect(m.w.data.schliff).toBe(1);
  });
  it('nur von vorn: Treffer von hinten, Umgebungsschaden (Lava) und Windstoss werden nicht gekontert', () => {
    const behind = make(); stance(behind); behind.secs(0.1);
    expect(behind.p.takeHit(monsterHit({ sourcePos: { x: 0, y: 0, z: -3 } }))).toBe('hit');
    const lava = make(); stance(lava); lava.secs(0.1);
    expect(lava.p.takeHit({ dmg: 5, knock: 'none', key: 'lava', sourcePos: null })).toBe('hit');
    const wind = make(); stance(wind); wind.secs(0.1);
    wind.p.takeHit(monsterHit({ knock: 'push' }));
    expect(wind.w.data.schliff | 0).toBe(0);
  });
  it('Konter richtet den Pirscher auf die Angriffsquelle aus und gibt kurze Unverwundbarkeit', () => {
    const m = make();
    stance(m);
    m.secs(0.1);
    m.p.takeHit(monsterHit({ sourcePos: { x: 1.5, y: 0, z: 2 } }));
    expect(m.p.rot).toBeCloseTo(Math.atan2(1.5, 2), 2);
    expect(m.p.invuln).toBeGreaterThan(0.3);
    expect(m.p.takeHit(monsterHit({ key: 'second' }))).toBe('iframe');
  });
  it('mehrfache Treffer derselben Attacke: der gekonterte Treffer gilt als verbraucht (Rueckgabe block)', () => {
    const m = make();
    stance(m);
    m.secs(0.1);
    expect(m.p.takeHit(monsterHit())).toBe('block'); // monster.js adds the hit to hitSet for 'block'
  });
  it('gescheiterte Haltung: 0,4 s Haltung + 0,35 s gesperrte Erholung, Rolle erst danach', () => {
    const m = make();
    stance(m);
    expect(katana.moves.kt_stance.duration).toBeCloseTo(STANCE_TIME + STANCE_RECOVERY, 5);
    m.secs(0.45);
    expect(m.w.moveId).toBe('kt_stance'); // still recovering
    m.ctx.input.press('roll', 40);
    m.secs(0.2);
    expect(m.p.state).toBe('free'); // roll refused while recovering
    expect(m.w.moveId).toBe('kt_stance');
    m.secs(0.2);
    expect(m.w.moveId).toBeNull();
    // B spam does not re-enter a fresh stance before the recovery is over
    const s = make();
    stance(s);
    s.ctx.input.press('special', 40); s.secs(0.1);
    s.ctx.input.press('special', 40); s.secs(0.1);
    expect(s.w.moveId).toBe('kt_stance');
    expect(s.w.t).toBeGreaterThan(0.15);
  });
  it('Konterschnitt: BW 60, Hitbox trifft ein Ziel in 4 m', () => {
    const m = katana.moves.kt_konter;
    const reach = Math.max(...m.hits.map((h) => Math.hypot(h.to[0], h.to[2]))) + m.lunge.dist;
    expect(reach).toBeGreaterThan(4);
    expect(m.superArmor).toBeTruthy();
  });
});

describe('Schliff', () => {
  it('stapelt bis Stufe 3, +8 % Schaden je Stufe', () => {
    const w = new WeaponState(katana, {});
    expect(katana.dmgMul(w)).toBe(1);
    for (let i = 1; i <= 5; i++) {
      addSchliff(w, 1);
      expect(w.data.schliff).toBe(Math.min(3, i));
    }
    expect(katana.dmgMul(w)).toBeCloseTo(1.24, 5);
    w.data.schliff = 2;
    expect(katana.dmgMul(w)).toBeCloseTo(1.16, 5);
  });
  it('haelt 40 s, verfaellt dann; jeder Konter erneuert die Zeit', () => {
    const w = new WeaponState(katana, {});
    const inp = { A: { down: false }, B: { down: false } };
    addSchliff(w, 2);
    for (let t = 0; t < 39; t += DT) w.update(DT, inp);
    expect(w.data.schliff).toBe(2);
    expect(katana.status(w).text).toContain('Schliff 2');
    katana.counter.onCounter(w); // refresh
    expect(w.data.schliff).toBe(3);
    expect(w.data.schliffT).toBe(SCHLIFF_TIME);
    for (let t = 0; t < 39; t += DT) w.update(DT, inp);
    expect(w.data.schliff).toBe(3);
    for (let t = 0; t < 2; t += DT) w.update(DT, inp);
    expect(w.data.schliff).toBe(0);
    expect(katana.status(w)).toBeNull();
  });
  it('HUD: Stufe + Restzeit kompakt', () => {
    const w = new WeaponState(katana, {});
    addSchliff(w, 2);
    expect(katana.status(w)).toMatchObject({ level: 2, max: 3, text: 'Schliff 2 · 40s' });
  });
  it('pose level (Netz) = Schliff-Stufe, ausser beim Ziehen', () => {
    const w = new WeaponState(katana, {});
    addSchliff(w, 2);
    w.startMove('kt_a1');
    expect(w.pose().level).toBe(2);
  });
});

describe('Mondsichel (Finisher)', () => {
  const heldB = (s, sec) => { s.press('B'); s.step(sec); };
  it('B halten (0,3 s) bei Wucht 100 = Mondsichel, setzt Schliff auf 3, leert Wucht', () => {
    const s = setup();
    s.w.wucht = 100; s.w.sinceWuchtHit = 0;
    heldB(s, 0.45);
    expect(s.w.moveId).toBe('kt_finisher');
    expect(s.w.wucht).toBe(0);
    expect(katana.moves.kt_finisher.hits[0].mv).toBe(190);
    s.until(() => s.w.t > 0.7, 2);
    expect(s.w.data.schliff).toBe(3);
    expect(s.w.data.schliffT).toBeGreaterThan(SCHLIFF_TIME - 0.5);
  });
  it('ohne Wucht 100 oder bei kurzem Tipp gibt es nur die Konterhaltung', () => {
    const a = setup();
    a.w.wucht = 99; a.w.sinceWuchtHit = 0;
    heldB(a, 0.6);
    expect(a.w.moveId).toBe('kt_stance');
    expect(a.w.data.schliff | 0).toBe(0);
    const b = setup();
    b.w.wucht = 100; b.w.sinceWuchtHit = 0;
    b.tap('B', 0.1);
    expect(b.w.moveId).toBe('kt_stance');
    b.step(0.5);
    expect(b.w.moveId).not.toBe('kt_finisher');
    expect(b.w.wucht).toBe(100);
  });
});

describe('Daten: Stats, Baum, Kosten, Save', () => {
  it('Kraft laut GDD, Zweige in Stufe 3', () => {
    expect(WEAPON_ORDER).toContain('kt');
    expect(WEAPON_TYPES.kt.tiers.map((t) => t.name)).toEqual(['Rostkatana', 'Knochenkatana', 'Jaggo-Reißzahn', 'Brathalos-Glutkatana', 'Panzerschnitt', 'Funkenfürst-Katana']);
    expect(weaponStats('kt', 1).power).toBe(78);
    expect(weaponStats('kt', 2).power).toBe(96);
    expect(weaponStats('kt', 3, 'a')).toMatchObject({ name: 'Jaggo-Reißzahn', power: 112, crit: 0.15 });
    expect(weaponStats('kt', 3, 'b')).toMatchObject({ name: 'Barrotz-Schlickschneide', power: 110, elems: { shock: 14 } });
    expect(weaponStats('kt', 4)).toMatchObject({ name: 'Brathalos-Glutkatana', power: 128, elems: { fire: 22 } });
  });
  it('Upgrade-Kosten existieren fuer jede Stufe/jeden Zweig und nennen echte Materialien', () => {
    for (const [tier, branch] of [[1, null], [2, null], [3, 'a'], [3, 'b']]) {
      const opts = upgradeOptions('kt', tier, branch);
      expect(opts.length).toBe(tier === 2 ? 2 : 1);
      for (const o of opts) for (const id of Object.keys(o.cost)) expect(id === 'schrott' || ITEMS[id], id).toBeTruthy();
    }
    expect(upgradeOptions('kt', 4).length).toBe(3); // Stufe 5: Kroll/Gorgo/Voltaro (progression3.test.js)
    expect(Object.keys(WEAPON_UPGRADES[3].kt)).toEqual(['a', 'b']);
  });
  it('Schmiede: Rostkatana -> Knochenkatana -> Zweig b -> Glutkatana', () => {
    const s = defaultSave();
    s.schrott = 9999;
    s.box = { altknochen: 10, schrotterz: 20, barrotz_kruste: 10, barrotz_platte: 5, barrotz_schwanzleder: 5, brathalos_schuppe: 10, brathalos_membran: 5, glutsack: 5, glimmstein: 5 };
    expect(upgradeWeapon(s, 'kt').name).toBe('Knochenkatana');
    expect(weaponUpgradeOptions(s, 'kt').length).toBe(2);
    expect(upgradeWeapon(s, 'kt', 'b').name).toBe('Barrotz-Schlickschneide');
    expect(upgradeWeapon(s, 'kt').name).toBe('Brathalos-Glutkatana');
    expect(s.weapons.kt).toEqual({ tier: 4, branch: 'b' });
  });
  it('Save: neue Saves und alte Saves ohne kt bekommen eine Start-Rostkatana, kt ist ausruestbar', () => {
    expect(defaultSave().weapons.kt).toEqual({ tier: 1, branch: null });
    const old = { version: 1, name: 'Alt', weapons: { gs: { tier: 3, branch: 'b' }, db: { tier: 1, branch: null }, bow: { tier: 2, branch: null } }, loadout: { weapon: 'gs' } };
    const s = migrate(old);
    expect(s.weapons.kt).toEqual({ tier: 1, branch: null });
    expect(s.weapons.gs).toEqual({ tier: 3, branch: 'b' });
    expect(sanitize({ ...old, loadout: { weapon: 'kt' } }).loadout.weapon).toBe('kt');
    expect(sanitize({ weapons: { kt: { tier: 9, branch: 'b' } } }).weapons.kt).toEqual({ tier: 6, branch: 'v' });
  });
});

describe('Koop / Rig', () => {
  it('Remote-Pirscher mit kt haben alle Posen (Snapshot sendet anim-Namen)', () => {
    const m = make();
    for (const mv of Object.values(katana.moves)) expect(m.p.anims[mv.anim], mv.id).toBeTruthy();
    expect(Object.keys(KT_REST)).toContain('arx');
  });
  it('Remote-Avatar: Pose wird aus dem Snapshot gespielt und die Klinge zeigt die Schliff-Stufe', () => {
    const ctx = makeCtx();
    const p = new Player({ ctx, weapon: 'kt', local: false });
    p.remote = { state: 'free', rollT: 0, sprint: false, speed: 0, wp: { name: 'kt_a2', t: 0.2, charging: false, level: 3 }, air: 0 };
    for (let i = 0; i < 40; i++) p.updateRemote(DT);
    expect(p.weaponMesh.userData.kt.k).toBeGreaterThan(1);
    expect(p.weaponMesh.userData.grip2).toBeTruthy();
  });
  it('Meshes pro Stufe/Zweig haben Griff fuer die zweite Hand und Scheide', () => {
    for (const [tier, branch] of [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null]]) {
      const mesh = katana.buildMesh({ tier, branch });
      expect(mesh.userData.grip2.position.y).toBeGreaterThan(0);
      expect(mesh.userData.hip).toBeTruthy();
    }
  });
});
