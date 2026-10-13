import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { WeaponState } from '../../src/game/weapons/weapon.js';
import { weapons } from '../../src/game/weapons/index.js';
import {
  krachkiste, kkState, playBar, addSample, onKkEvent, playMoveId, SAMPLE_SOUND, ECHO_HIT, ECHO_DELAY, FEEDBACK_PERIOD, CHARGE_TIME, VOLL_WINDOW, VOLL_MUL,
} from '../../src/game/weapons/krachkiste.js';
import {
  BUFF, STRENGTH, zoneOfPart, sampleOfPart, pushSample, barBuffs, applyBuff, tickBuffs, atkMul, staminaMul, speedMul, noFlinch, buffKey,
  encodeKk, decodeKk, encodeKkBar, decodeKkBar, receiveKk,
} from '../../src/game/buffs.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { spendStamina } from '../../src/game/vitals.js';
import { monsters as MONDEFS } from '../../src/game/monsters/index.js';
import { WEAPON_TYPES, WEAPON_ORDER, weaponStats, upgradeOptions, WEAPON_UPGRADES } from '../../src/data/weapons.js';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { upgradeWeapon, weaponUpgradeOptions } from '../../src/meta/crafting.js';
import { encodeGear, decodeGear, makeGear } from '../../src/data/gearlook.js';
import { WEAPON_TIPS } from '../../src/ui/onboarding.js';
import { mountOnBack } from '../../src/game/gear/backMount.js';
import { buildKrachkisteLook, kkLookKey, KK_KEYS, setSlots, CELL } from '../../src/game/gear/krachkisteLook.js';
import { sfx } from '../../src/audio/sfx.js';
import { HuntNet } from '../../src/net/sync.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { initGlitch, addGlitchEnergy, activateGlitch, tickGlitch, attachGlitch, glitchDmgMul } from '../../src/game/glitch.js';

const DT = 1 / 60;
const KK = krachkiste;

// ---- pure WeaponState harness (wie katana.test.js / dualblades.test.js)
function setup({ sinceRoll = 99, bar = [], wucht = 0 } = {}) {
  const player = { sinceRoll, pos: { x: 0, y: 0, z: 0 }, rot: 0 };
  const w = new WeaponState(KK, { player });
  player.weapon = w;
  w.data.kk = { bar: [...bar], sampledInst: -1, pump: 0, pumpC: 'r', echo: [], open: 0 };
  if (wucht) w.addWucht(wucht); // frisch gesammelte Wucht (sinceWuchtHit = 0, sonst klingt sie nach 4 s ab)
  const A = { down: false, pressed: false, released: false }, B = { down: false, pressed: false, released: false };
  const inp = { A, B };
  const api = {
    w, player, inp,
    step(sec = DT) {
      const n = Math.max(1, Math.round(sec / DT));
      for (let i = 0; i < n; i++) { w.update(DT, inp); player.sinceRoll += DT; A.pressed = A.released = B.pressed = B.released = false; }
    },
    press(b = 'A') { inp[b].down = true; inp[b].pressed = true; },
    release(b = 'A') { inp[b].down = false; inp[b].released = true; },
    tap(b = 'A', hold = 0.05) { api.press(b); api.step(hold); api.release(b); api.step(); },
    until(pred, max = 5) { for (let t = 0; t < max && !pred(); t += DT) api.step(); },
    holdFor(b, sec) { api.press(b); api.step(sec); },
  };
  return api;
}
const bwOf = (id) => [...KK.moves[id].hits.reduce((m, h) => (m.has(h.group) ? m : m.set(h.group, h.mv)), new Map()).values()].reduce((a, b) => a + b, 0);
const wuchtOf = (id) => [...KK.moves[id].hits.reduce((m, h) => (m.has(h.group) ? m : m.set(h.group, h.wucht)), new Map()).values()].reduce((a, b) => a + b, 0);

// ---- Player + Hunt-Kontext (Netz/Buffs/Heilung)
function makeCtx() {
  const calls = { numbers: [], sfx: [], kkPlay: [], kkBar: [] };
  const ctx = {
    world: { heightAt: () => 0, collide: () => {} },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0, scene: new THREE.Scene(), mods: {},
    fx: { number: (p, t) => calls.numbers.push(t), spark() {}, shake() {}, flash() {}, glitch() {}, ring() {} },
    playerHit() {}, respawn(p) { p.respawn(0, 0); },
  };
  ctx.bus.on('sfx', (e) => calls.sfx.push(e));
  ctx.bus.on('kkPlay', (e) => calls.kkPlay.push(e));
  ctx.bus.on('kkBar', (e) => calls.kkBar.push(e));
  ctx.calls = calls;
  return ctx;
}
function make({ at = [0, 0] } = {}) {
  const ctx = makeCtx();
  const p = new Player({ ctx, weapon: 'kk' });
  p.spawnAt(at[0], at[1], 0);
  ctx.players.push(p);
  ctx.player = p;
  const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.input.poll(DT); p.update(DT); } };
  return { ctx, p, step, w: p.weapon, secs: (s) => step(Math.round(s / DT)) };
}
function addPlayer(ctx, x, z, { local = true, id = 'p' + ctx.players.length } = {}) {
  const q = new Player({ ctx, weapon: 'kk', local, id });
  q.spawnAt(x, z, 0);
  ctx.players.push(q);
  return q;
}
beforeEach(() => time.reset());

// ======================================================================================================
describe('Krachkiste A-Kette (GDD 17.1)', () => {
  it('ist als `kk` registriert, jeder Zug hat eine Animation, Waffe ist zweihaendig (Mesh twoHand)', () => {
    expect(weapons.kk).toBe(krachkiste);
    expect(KK.id).toBe('kk');
    for (const m of Object.values(KK.moves)) expect(KK.anims[m.anim], m.id).toBeTruthy();
    expect(KK.buildMesh({ tier: 1 }).userData.twoHand).toBeTruthy();
  });
  it('Schwinger (BW 30, 0,7 s) -> Gegenschwinger (BW 30, 0,7 s) -> Ueberkopf-Stampfer (BW 46, 1,0 s) -> Schwinger (Schleife)', () => {
    const s = setup();
    s.tap('A');
    expect(s.w.moveId).toBe('kk_a1');
    expect(bwOf('kk_a1')).toBe(30);
    expect(KK.moves.kk_a1.duration).toBeCloseTo(0.7, 5);
    s.until(() => s.w.t >= KK.moves.kk_a1.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'kk_a1', 1);
    expect(s.w.moveId).toBe('kk_a2');
    expect(bwOf('kk_a2')).toBe(30);
    s.until(() => s.w.t >= KK.moves.kk_a2.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'kk_a2', 1);
    expect(s.w.moveId).toBe('kk_a3');
    expect(bwOf('kk_a3')).toBe(46);
    expect(KK.moves.kk_a3.duration).toBeCloseTo(1.0, 5);
    s.until(() => s.w.t >= KK.moves.kk_a3.combo.window[0] + 0.01);
    s.tap('A', 0.02);
    s.until(() => s.w.moveId !== 'kk_a3', 1);
    expect(s.w.moveId).toBe('kk_a1');
  });
  it('stumpf: jeder Kettenschlag hat blunt > 0; Wucht +4 pro Schlag; Gehen waehrend der Kette langsam moeglich', () => {
    for (const id of ['kk_a1', 'kk_a2', 'kk_a3']) {
      expect(wuchtOf(id), id).toBe(4);
      for (const h of KK.moves[id].hits) expect(h.blunt, id).toBeGreaterThan(0);
    }
    expect(KK.moves.kk_a1.moveSpeed).toBeGreaterThan(0);
    expect(KK.moves.kk_a1.moveSpeed).toBeLessThan(0.5); // mittelschwer (zwischen Plattmacher 0 und Katana 0,35)
  });
  it('ein spaeter Tipp nach dem Combo-Fenster beginnt die Kette von vorn', () => {
    const s = setup();
    s.tap('A');
    s.until(() => s.w.moveId === null, 2);
    s.tap('A');
    expect(s.w.moveId).toBe('kk_a1');
  });
  it('Rolle -> A = Rutsch-Schwinger (BW 28, 2,5 m nach vorn, flach / trifft tief)', () => {
    const s = setup({ sinceRoll: 0.1 });
    s.tap('A');
    expect(s.w.moveId).toBe('kk_rutsch');
    expect(bwOf('kk_rutsch')).toBe(28);
    const l = KK.moves.kk_rutsch.lunge;
    expect(l.dist).toBe(2.5);
    for (const h of KK.moves.kk_rutsch.hits) expect(Math.max(h.from[1], h.to[1])).toBeLessThan(0.8);
    const s2 = setup({ sinceRoll: 0.5 });
    s2.tap('A');
    expect(s2.w.moveId).toBe('kk_a1');
  });
});

describe('Aufdrehen (A halten) + Boden-Stampfer', () => {
  it('Halten startet Aufdrehen; Loslassen frueh = normaler Schwinger', () => {
    const s = setup();
    s.holdFor('A', 0.4);
    expect(s.w.moveId).toBe('kk_wind');
    expect(s.w.charging).toBe(true);
    s.release('A');
    s.step(0.05);
    expect(s.w.moveId).toBe('kk_a1');
  });
  it('Fenster 0,8-1,05 s = "Voll aufgedreht!" (+20 %, sauber); davor/danach normal', () => {
    expect(CHARGE_TIME).toBe(0.8);
    expect(VOLL_WINDOW).toEqual([0.8, 1.05]);
    expect(VOLL_MUL).toBe(1.2);
    const s = setup();
    s.holdFor('A', 0.5);
    expect(s.w.sauberOpen).toBe(false);
    s.step(0.4); // ~0,9 s
    expect(s.w.chargeLevel).toBe(1);
    expect(s.w.sauberOpen).toBe(true);
    s.release('A'); s.step(0.05);
    expect(s.w.moveId).toBe('kk_stampf');
    expect(s.w.flags.sauber).toBe(true);
    const hit = KK.moves.kk_stampf.hits[0];
    expect(hit.sauberMul).toBe(1.2);
    expect(hit.sauberText).toBe('Voll aufgedreht!');
    // zu spaet losgelassen: Stampfer ohne sauber
    const s2 = setup();
    s2.holdFor('A', 1.3);
    expect(s2.w.sauberOpen).toBe(false);
    s2.release('A'); s2.step(0.05);
    expect(s2.w.moveId).toBe('kk_stampf');
    expect(s2.w.flags.sauber).toBe(false);
  });
  it('Boden-Stampfer: BW 70, Schallring-Radius 2,5 m, stumpf 35', () => {
    const h = KK.moves.kk_stampf.hits[0];
    expect(h.mv).toBe(70);
    expect(h.radius).toBe(2.5);
    expect(h.blunt).toBe(35);
    expect(h.shape).toBe('sphere');
    expect(KK.moves.kk_stampf.fire.map((f) => f.call)).toContain('ring');
  });
});

describe('B: Abspielen / Schallstoss / Remix / Zugabe', () => {
  it('B waehlt den Zug nach der Leiste: leer = Schallstoss (BW 10), 1-3 Samples = Abspielen, 3 verschiedene = Remix (Druckwelle BW 40, 4 m)', () => {
    expect(playMoveId(setup({ bar: [] }).w)).toBe('kk_stoss');
    expect(playMoveId(setup({ bar: ['r'] }).w)).toBe('kk_play');
    expect(playMoveId(setup({ bar: ['r', 'r', 'b'] }).w)).toBe('kk_play');
    expect(playMoveId(setup({ bar: ['r', 'b', 'g'] }).w)).toBe('kk_remix');
    expect(bwOf('kk_stoss')).toBe(10);
    expect(bwOf('kk_remix')).toBe(40);
    expect(KK.moves.kk_remix.hits[0].radius).toBe(4);
    expect(KK.moves.kk_play.hits).toBeUndefined(); // reines Abspielen macht keinen Schaden
    const s = setup({ bar: [] });
    s.tap('B');
    expect(s.w.moveId).toBe('kk_stoss');
    const s2 = setup({ bar: ['g', 'r'] });
    s2.tap('B');
    expect(s2.w.moveId).toBe('kk_play');
    expect(KK.moves.kk_play.duration).toBeCloseTo(1.0, 5);
    expect(KK.moves.kk_play.moveSpeed).toBeGreaterThan(0); // Gehen langsam moeglich
  });
  it('B halten (0,3 s) bei Wucht 100 = Zugabe (Riesen-Stampfer BW 200, stumpf 70, Radius 3 m); ohne Wucht 100 nur Abspielen', () => {
    const s = setup({ wucht: 100, bar: ['r'] });
    s.holdFor('B', 0.35);
    expect(s.w.moveId).toBe('kk_finisher');
    const h = KK.moves.kk_finisher.hits[0];
    expect([h.mv, h.blunt, h.radius]).toEqual([200, 70, 3]);
    expect(KK.moves.kk_finisher.superArmor).toBe('all');
    expect(KK.moves.kk_finisher.consumeWucht).toBe(true);
    expect(s.w.wucht).toBe(0);
    const s2 = setup({ wucht: 99, bar: ['r'] });
    s2.holdFor('B', 0.35);
    expect(s2.w.moveId).toBe('kk_play');
    // B-Tipp bei Wucht 100 ist KEINE Zugabe
    const s3 = setup({ wucht: 100, bar: ['r'] });
    s3.tap('B');
    expect(s3.w.moveId).toBe('kk_play');
  });
  it('Rollen-Abbruch ab rollCancelAt in allen Zuegen', () => {
    for (const m of Object.values(KK.moves)) if (m.kind !== 'charge') expect(m.rollCancelAt, m.id).toBeGreaterThan(0);
    const s = setup({ bar: ['r'] });
    s.tap('B');
    expect(s.w.canRollCancel()).toBe(false);
    s.until(() => s.w.t >= KK.moves.kk_play.rollCancelAt + 0.02);
    expect(s.w.canRollCancel()).toBe(true);
  });
  it('Finisher spielt die Leiste auf Stufe 3 ab (leer = nur Schaden)', () => {
    const { ctx, p } = make();
    const kk = kkState(p.weapon);
    kk.bar.push('r', 'b');
    p.weapon.startMove('kk_finisher');
    for (let i = 0; i < 70; i++) p.weapon.update(DT, { A: { down: false }, B: { down: false } }); // bis ueber den 'finale'-Zeitpunkt (0,8 s)
    expect(p.buffs.r.lvl).toBe(3);
    expect(p.buffs.b.lvl).toBe(3);
    expect(p.buffs.g).toBeUndefined();
    expect(kk.bar).toEqual([]);
    expect(ctx.calls.numbers).toContain('Zugabe!');
    // leere Leiste: kein Buff, kein Fehler
    const m2 = make();
    m2.p.weapon.startMove('kk_finisher');
    for (let i = 0; i < 70; i++) m2.p.weapon.update(DT, { A: { down: false }, B: { down: false } });
    expect(Object.keys(m2.p.buffs)).toEqual([]);
  });
});

describe('Zonen-Zuordnung (Samples)', () => {
  it('Kopf = head/kopf (+ Augenstiele/Antennenkamm), Koerper = body/koerper/kesselpanzer/spulen (+ Gorgo-Segmente), alles andere = Glieder', () => {
    for (const id of ['head', 'kopf', 'augen', 'antennenkamm']) { expect(zoneOfPart(id)).toBe('head'); expect(sampleOfPart(id)).toBe('r'); }
    for (const id of ['body', 'koerper', 'kesselpanzer', 'spulen', 'segment1', 'segment6']) { expect(zoneOfPart(id), id).toBe('body'); expect(sampleOfPart(id)).toBe('b'); }
    for (const id of ['legs', 'tail', 'wingL', 'wingR', 'prankeL', 'prankeR', 'scherenL', 'scherenR', 'beine', 'arms', 'irgendwas', '', null]) { expect(zoneOfPart(id), String(id)).toBe('limb'); expect(sampleOfPart(id)).toBe('g'); }
  });
  it('alle Teile aller Brocken (src/game/monsters/*) bekommen eine Zone; jeder Brocken hat Kopf-Sample, jeder ausser Wurm/Fauna Glieder', () => {
    const seen = new Map();
    for (const [mid, def] of Object.entries(MONDEFS)) {
      for (const part of def.parts ?? []) {
        const z = zoneOfPart(part.id);
        expect(['head', 'body', 'limb']).toContain(z);
        seen.set(`${mid}.${part.id}`, z);
      }
    }
    expect(seen.size).toBeGreaterThan(30);
    // Stichproben aus den echten Defs
    expect(seen.get('jaggo.head')).toBe('head');
    expect(seen.get('jaggo.body')).toBe('body');
    expect(seen.get('jaggo.legs')).toBe('limb');
    expect(seen.get('jaggo.tail')).toBe('limb');
    expect(seen.get('brathalos.wingL')).toBe('limb');
    expect(seen.get('barrotz.head')).toBe('head');
    expect(seen.get('kroll.kesselpanzer')).toBe('body');
    expect(seen.get('kroll.scherenL')).toBe('limb');
    expect(seen.get('kroll.koerper')).toBe('body');
    expect(seen.get('kroll.augen')).toBe('head');
    expect(seen.get('voltaro.antennenkamm')).toBe('head');
    expect(seen.get('gorgo.kopf')).toBe('head');
    expect(seen.get('gorgo.segment3')).toBe('body');
    expect(seen.get('voltaro.kopf')).toBe('head');
    expect(seen.get('voltaro.spulen')).toBe('body');
    expect(seen.get('voltaro.prankeR')).toBe('limb');
    // jeder Grossbrocken liefert alle Farben ausser dem Wurm (Gorgo: Kopf + Koerper, keine Glieder)
    for (const mid of ['jaggo', 'barrotz', 'brathalos', 'kroll', 'voltaro']) {
      const zones = new Set([...seen].filter(([k]) => k.startsWith(mid + '.')).map(([, z]) => z));
      expect(zones, mid).toEqual(new Set(['head', 'body', 'limb']));
    }
  });
  it('Zonen-Ton ist immer derselbe: eine feste Zuordnung Farbe -> Ton, unabhaengig von Brocken und Waffenstufe', () => {
    expect(SAMPLE_SOUND).toEqual({ r: 'kkDing', b: 'kkBumm', g: 'kkTschak' });
    expect(new Set(Object.values(SAMPLE_SOUND)).size).toBe(3);
    for (const n of [...Object.values(SAMPLE_SOUND), 'kkBeat', 'kkRemix']) expect(sfx.names).toContain(n);
    // die Zone entscheidet nur ueber die Teil-ID, nie ueber Brocken-Material/Stufe
    expect(sampleOfPart('head')).toBe(sampleOfPart('kopf'));
  });
});

describe('Samples: max. 1 pro Move, erster getroffener Teil, FIFO (3 Slots)', () => {
  const hit = (p, partId, extra = {}) => KK.onHit(p, { partId }, { hit: { mv: 30, ...extra } }, { at: { x: 0, y: 1, z: 2 } });
  it('ein Schlag, der mehrere Teile trifft, legt nur das Sample des ERSTEN Teils ab', () => {
    const { p, w } = make();
    w.startMove('kk_a1');
    hit(p, 'head');
    hit(p, 'body');
    hit(p, 'legs');
    expect(kkState(w).bar).toEqual(['r']);
    w.startMove('kk_a2'); // neuer Move = neue Instanz -> wieder ein Sample
    hit(p, 'body');
    hit(p, 'head');
    expect(kkState(w).bar).toEqual(['r', 'b']);
  });
  it('FIFO: das vierte Sample verdraengt das aelteste', () => {
    const { p, w } = make();
    for (const [id, part] of [['kk_a1', 'head'], ['kk_a2', 'body'], ['kk_a3', 'legs'], ['kk_a1', 'tail']]) { w.startMove(id); hit(p, part); }
    expect(kkState(w).bar).toEqual(['b', 'g', 'g']);
    const bar = pushSample(['r', 'b', 'g'], 'g');
    expect(bar).toEqual(['b', 'g', 'g']);
    expect(pushSample(['r'], 'x')).toEqual(['r']); // unbekannte Farbe ignoriert
  });
  it('Remix-Druckwelle, Schallstoss, Zugabe und Glitch-Echo geben KEINE Samples', () => {
    const { p, w } = make();
    for (const id of ['kk_remix', 'kk_stoss', 'kk_finisher']) for (const h of KK.moves[id].hits) expect(h.noSample, id).toBe(true);
    expect(ECHO_HIT.noSample).toBe(true);
    w.startMove('kk_remix');
    hit(p, 'head', { noSample: true });
    expect(kkState(w).bar).toEqual([]);
  });
  it('Sample-Feedback: Zonen-Ton + Leisten-Update-Event + Membran-Pump in Zonen-Farbe', () => {
    const { ctx, p, w } = make();
    w.startMove('kk_a1');
    hit(p, 'koerper');
    expect(ctx.calls.sfx.map((e) => e.name)).toContain('kkBumm');
    expect(ctx.calls.kkBar.at(-1).bar).toEqual(['b']);
    expect(kkState(w).pump).toBe(1);
    expect(kkState(w).pumpC).toBe('b');
    expect(ctx.kkfx).toBeTruthy(); // fliegendes Symbol (gepoolt, eine Instanz pro Jagd)
  });
  it('Player.afterHit ruft den Waffen-Hook (Integration in hunt.playerHit)', () => {
    const { p, w } = make();
    w.startMove('kk_a1');
    p.afterHit({ hitstop: 0, wucht: 4, partId: 'kopf' }, { hit: { mv: 30 }, glitch: false }, { at: { x: 0, y: 1, z: 2 } });
    expect(kkState(w).bar).toEqual(['r']);
    expect(w.wucht).toBe(4);
  });
});

describe('Buff-Stufen (GDD 17.1)', () => {
  it('3 gleiche = Stufe 3 (doppelt), 2 gleiche = Stufe 2 (x1,5), sonst je Sample Stufe 1', () => {
    expect(barBuffs(['r', 'r', 'r']).buffs).toEqual([{ c: 'r', lvl: 3 }]);
    expect(barBuffs(['g', 'g']).buffs).toEqual([{ c: 'g', lvl: 2 }]);
    expect(barBuffs(['r', 'r', 'b']).buffs).toEqual([{ c: 'r', lvl: 2 }, { c: 'b', lvl: 1 }]);
    expect(barBuffs(['b']).buffs).toEqual([{ c: 'b', lvl: 1 }]);
    expect(barBuffs(['r', 'b']).buffs).toEqual([{ c: 'r', lvl: 1 }, { c: 'b', lvl: 1 }]);
    expect(barBuffs([]).empty).toBe(true);
    expect(STRENGTH).toEqual([0, 1, 1.5, 2]);
  });
  it('3 verschiedene = REMIX (alle drei Buffs Stufe 1); nicht bei 2 verschiedenen oder erzwungener Stufe', () => {
    const r = barBuffs(['r', 'b', 'g']);
    expect(r.remix).toBe(true);
    expect(r.buffs).toEqual([{ c: 'r', lvl: 1 }, { c: 'b', lvl: 1 }, { c: 'g', lvl: 1 }]);
    expect(barBuffs(['g', 'r', 'b']).remix).toBe(true); // Reihenfolge egal
    expect(barBuffs(['r', 'b']).remix).toBe(false);
    expect(barBuffs(['r', 'r', 'g']).remix).toBe(false);
    const f = barBuffs(['r', 'b', 'g'], 3);
    expect(f.remix).toBe(false);
    expect(f.buffs.every((e) => e.lvl === 3)).toBe(true);
  });
  it('Wirkung: Angriff +10 %, Puste-Verbrauch -25 %, Tempo +10 %, je mit Stufen-Faktor', () => {
    const p = { v: { costMul: 1 }, buffs: {} };
    expect(atkMul(p)).toBe(1); expect(staminaMul(p)).toBe(1); expect(speedMul(p)).toBe(1);
    applyBuff(p, 'r', 1); applyBuff(p, 'b', 2); applyBuff(p, 'g', 3);
    expect(atkMul(p)).toBeCloseTo(1.1);
    expect(staminaMul(p)).toBeCloseTo(1 - 0.25 * 1.5);
    expect(speedMul(p)).toBeCloseTo(1.2);
    expect(p.v.buffMul).toBeCloseTo(staminaMul(p));
    expect(noFlinch(p)).toBe(true);
    expect(buffKey(p)).toBe('r1b2g3');
  });
  it('Puste-Verbrauch: spendStamina nutzt den Blau-Buff (-25 %) zusaetzlich zu Items (costMul)', () => {
    const { p } = make();
    const base = p.v.stamina;
    spendStamina(p.v, 20);
    expect(base - p.v.stamina).toBeCloseTo(20);
    p.v.stamina = base;
    applyBuff(p, 'b', 1);
    spendStamina(p.v, 20);
    expect(base - p.v.stamina).toBeCloseTo(15);
    p.v.stamina = base; p.v.costMul = 0.5; // Item "Ausdauer-Trank" stapelt
    spendStamina(p.v, 20);
    expect(base - p.v.stamina).toBeCloseTo(7.5);
  });
  it('Blau: leichte Treffer (flinch) lassen nicht zurueckstolpern, schwere (down/pin) schon; Schaden bleibt', () => {
    const { p, step } = make();
    step(2);
    const hp0 = p.hp;
    const hit = (knock) => p.takeHit({ dmg: 20, key: 'k' + Math.random(), sourcePos: { x: 0, y: 0, z: 3 }, monster: {}, attackId: 'x', knock });
    expect(hit('flinch')).toBe('hit');
    expect(p.state).toBe('flinch'); // ohne Buff
    p.state = 'free'; p.invuln = 0;
    applyBuff(p, 'b', 1);
    expect(hit('flinch')).toBe('hit');
    expect(p.state).toBe('free'); // mit Blau: kein Stolpern
    expect(p.hp).toBeLessThan(hp0 - 20 + 0.01); // Schaden kam an
    p.invuln = 0;
    hit('down');
    expect(p.state).toBe('down');
  });
  it('Rot: hunt.playerHit-Faktor; Gruen: Tempo-Faktor am Pirscher (Laufgeschwindigkeit)', () => {
    const run = (buff) => {
      const m = make();
      if (buff) applyBuff(m.p, 'g', 1);
      m.ctx.input.setStick(0, 1, 't');
      m.secs(1.2);
      return m.p.speed;
    };
    const base = run(false), fast = run(true);
    expect(fast / base).toBeGreaterThan(1.07);
    expect(fast / base).toBeLessThan(1.13);
  });
});

describe('Buff-Dauer, Ueberschreiben, Reichweite', () => {
  it('45 s Dauer, danach weg (auch der Puste-Faktor); Tick zaehlt herunter', () => {
    const p = { v: { costMul: 1 }, buffs: {} };
    applyBuff(p, 'b', 1);
    expect(p.buffs.b.t).toBe(BUFF.DUR);
    expect(BUFF.DUR).toBe(45);
    tickBuffs(p, 44.9);
    expect(noFlinch(p)).toBe(true);
    tickBuffs(p, 0.2);
    expect(p.buffs.b).toBeUndefined();
    expect(noFlinch(p)).toBe(false);
    expect(p.v.buffMul).toBe(1);
  });
  it('staerkere Stufe gewinnt, gleiche erneuert, schwaechere wird ignoriert', () => {
    const p = { buffs: {} };
    applyBuff(p, 'r', 1);
    tickBuffs(p, 30);
    expect(applyBuff(p, 'r', 1)).toBe(true); // gleiche erneuert
    expect(p.buffs.r.t).toBe(45);
    tickBuffs(p, 10);
    expect(applyBuff(p, 'r', 3)).toBe(true); // staerkere gewinnt
    expect(p.buffs.r).toEqual({ lvl: 3, t: 45 });
    tickBuffs(p, 20);
    expect(applyBuff(p, 'r', 2)).toBe(false); // schwaechere ignoriert, Dauer unveraendert
    expect(p.buffs.r.lvl).toBe(3);
    expect(p.buffs.r.t).toBe(25);
    tickBuffs(p, 25); // Stufe 3 laeuft aus -> Stufe 2 kann wieder gesetzt werden
    expect(applyBuff(p, 'r', 2)).toBe(true);
    expect(applyBuff(p, 'x', 1)).toBe(false);
    expect(applyBuff(p, 'r', 4)).toBe(false);
  });
  it('Abspielen: Buff fuer alle Pirscher im Radius 8 m (auch den eigenen), Heilung 15 HP nur lokal, danach Leiste leer', () => {
    const { ctx, p, w } = make();
    const near = addPlayer(ctx, 7.5, 0);
    const far = addPlayer(ctx, 8.5, 0);
    const away = addPlayer(ctx, 0, -20, { local: false });
    expect(BUFF.RADIUS).toBe(8);
    kkState(w).bar.push('g', 'r');
    p.v.hp = 50; near.v.hp = 50; far.v.hp = 50;
    const plan = playBar(p);
    expect(plan.buffs).toEqual([{ c: 'r', lvl: 1 }, { c: 'g', lvl: 1 }]);
    for (const q of [p, near]) { expect(q.buffs.r.lvl).toBe(1); expect(q.buffs.g.lvl).toBe(1); }
    expect(far.buffs).toEqual({}); // 8,5 m: ausserhalb
    expect(away.buffs).toEqual({});
    expect(p.v.hp).toBe(65); expect(near.v.hp).toBe(65); expect(far.v.hp).toBe(50); // Gruen: +15 HP einmalig
    expect(kkState(w).bar).toEqual([]);
    expect(ctx.calls.kkPlay).toHaveLength(1);
    expect(ctx.calls.sfx.map((e) => e.name)).toContain('kkBeat');
  });
  it('Stufe-3-Heilung ist doppelt (30 HP); Remix = alle drei + Remix-Ton, Zugabe-Ton nur bei finale', () => {
    const { ctx, p, w } = make();
    p.v.hp = 40;
    kkState(w).bar.push('g', 'g', 'g');
    playBar(p);
    expect(p.buffs.g.lvl).toBe(3);
    expect(p.v.hp).toBe(70);
    kkState(w).bar.push('r', 'b', 'g');
    const plan = playBar(p);
    expect(plan.remix).toBe(true);
    expect(p.buffs.g.lvl).toBe(3); // staerkere Stufe gewinnt: Remix-Gruen (1) ersetzt Stufe 3 nicht
    expect(p.buffs.r.lvl).toBe(1); expect(p.buffs.b.lvl).toBe(1);
    expect(ctx.calls.sfx.map((e) => e.name)).toContain('kkRemix');
    expect(ctx.calls.numbers).toContain('REMIX!');
  });
  it('leere Leiste: kein Buff, kein Event', () => {
    const { ctx, p } = make();
    expect(playBar(p).empty).toBe(true);
    expect(p.buffs).toEqual({});
    expect(ctx.calls.kkPlay).toHaveLength(0);
  });
  it('B-Zug (WeaponState): Beat feuert bei 0,42 s und bufft mit der Leiste', () => {
    const { p, w } = make();
    kkState(w).bar.push('b');
    w.startMove(playMoveId(w));
    for (let i = 0; i < 20; i++) w.update(DT, { A: { down: false }, B: { down: false } });
    expect(p.buffs.b).toBeUndefined(); // t = 0,33 s: noch vor dem Beat
    for (let i = 0; i < 10; i++) w.update(DT, { A: { down: false }, B: { down: false } });
    expect(p.buffs.b.lvl).toBe(1);
  });
});

describe('Netz: Abspielen als Event an alle', () => {
  it('Protokoll: encode/decode Roundtrip, kompakt, Muell wird abgelehnt', () => {
    const ev = { x: 12.3456, z: -7.891, bar: ['r', 'r', 'b'], buffs: [{ c: 'r', lvl: 2 }, { c: 'b', lvl: 1 }], remix: false };
    const wire = JSON.parse(JSON.stringify(encodeKk(ev)));
    expect(wire).toEqual({ k: 'kk', x: 12.35, z: -7.89, s: 'rrb', b: 'r2b1' });
    expect(JSON.stringify(wire).length).toBeLessThan(60);
    const d = decodeKk(wire);
    expect(d).toMatchObject({ x: 12.35, z: -7.89, bar: ['r', 'r', 'b'], buffs: [{ c: 'r', lvl: 2 }, { c: 'b', lvl: 1 }], remix: false, auto: false });
    expect(decodeKk(encodeKk({ ...ev, remix: true })).remix).toBe(true);
    expect(decodeKk(encodeKk({ ...ev, auto: true })).auto).toBe(true);
    for (const bad of [null, {}, { k: 'kk' }, { k: 'kk', x: 'a', z: 1, s: '', b: 'r1' }, { k: 'kk', x: 0, z: 0, s: 'rx', b: 'r1' }, { k: 'kk', x: 0, z: 0, s: 'r', b: 'r9' }, { k: 'kk', x: 0, z: 0, s: 'r', b: 'r1r1' }, { k: 'kk', x: 0, z: 0, s: 'r', b: '' }, { k: 'kk', x: 0, z: 0, s: 'r', b: 'r' }, { k: 'kk', x: 0, z: 0, s: 'r', b: 'r1b1g1x1' }]) expect(decodeKk(bad), JSON.stringify(bad)).toBe(null);
    expect(decodeKkBar(encodeKkBar(['g', 'r']))).toEqual(['g', 'r']);
    expect(decodeKkBar({ k: 'kkb', s: 'zz' })).toBe(null);
  });
  it('Handler: wendet den Buff auf den lokalen Pirscher an, wenn er im Radius steht (client-autoritativ), sonst nicht', () => {
    const { ctx, p } = make({ at: [5, 0] });
    p.v.hp = 60;
    const ev = { x: 0, z: 0, bar: ['g', 'r'], buffs: [{ c: 'g', lvl: 2 }, { c: 'r', lvl: 1 }], remix: false };
    const hit = onKkEvent(ctx, encodeKk(ev));
    expect(hit).toContain(p);
    expect(p.buffs.g.lvl).toBe(2);
    expect(p.buffs.r.lvl).toBe(1);
    expect(p.v.hp).toBe(60 + 15 * 1.5); // Gruen Stufe 2: Heilung x1,5
    expect(ctx.calls.sfx.map((e) => e.name)).toContain('kkBeat'); // Beat auch beim Empfaenger
    // ausserhalb: 8,01 m
    const far = make({ at: [8.01, 0] });
    expect(onKkEvent(far.ctx, encodeKk(ev))).toEqual([]);
    expect(far.p.buffs).toEqual({});
    // Muell
    expect(onKkEvent(ctx, { k: 'kk', x: 0 })).toEqual([]);
    // Glitch-Schleife (auto): Buff ja, Heilung nein
    const auto = make({ at: [1, 0] });
    auto.p.v.hp = 60;
    onKkEvent(auto.ctx, encodeKk({ ...ev, auto: true }));
    expect(auto.p.buffs.g.lvl).toBe(2);
    expect(auto.p.v.hp).toBe(60);
  });
  it('receiveKk: fremde Avatare im Radius bekommen den Buff nur zur Anzeige (keine Heilung)', () => {
    const { ctx } = make({ at: [30, 0] });
    const remote = addPlayer(ctx, 2, 0, { local: false });
    remote.v.hp = 50;
    const hit = receiveKk(ctx, { x: 0, z: 0, buffs: [{ c: 'g', lvl: 1 }, { c: 'b', lvl: 1 }] });
    expect(hit).toEqual([remote]);
    expect(remote.buffs.g.lvl).toBe(1);
    expect(remote.v.hp).toBe(50);
  });
  function netHarness() {
    const handlers = {}, sent = [];
    const net = { isHost: true, myId: 'p0', hostId: 'p0', on: (t, fn) => { handlers[t] = fn; return () => {}; }, onLeave() {}, onLost() {}, sendAll: (t, d) => sent.push([t, d]), sendHost() {}, rttOf: () => 0, dispose() {} };
    const ctx = makeCtx();
    ctx.world = { heightAt: () => 0, collide() {}, spawnPoints: [{ x: 0, z: 0, yaw: 0 }] };
    ctx.scene = { add() {}, remove() {} };
    ctx.hud = { center() {} };
    ctx.countMonsters = () => 0;
    ctx.fx.clearMarker = () => {};
    const me = new Player({ ctx, weapon: 'kk', id: 'p0' });
    me.spawnAt(3, 0, 0);
    ctx.players.push(me); ctx.player = me;
    const hn = new HuntNet(ctx, net, { players: [{ id: 'p2', name: 'Zwei', weapon: 'kk', tier: 1, slot: 1 }] });
    return { ctx, me, hn, handlers, sent, remote: hn.peers.get('p2').player };
  }
  it('HuntNet: eigenes Abspielen geht als EV an alle (Position, Leiste, Stufen); fremdes Abspielen bufft mich im Radius', () => {
    const { ctx, me, handlers, sent, remote } = netHarness();
    expect(remote.weaponId).toBe('kk');
    // lokal abspielen -> Event
    kkState(me.weapon).bar.push('r', 'r');
    playBar(me);
    const play = sent.find(([t, d]) => t === 'ev' && d.k === 'kk');
    expect(play).toBeTruthy();
    expect(play[1]).toMatchObject({ k: 'kk', x: 3, z: 0, s: 'rr', b: 'r2' });
    expect(sent.find(([, d]) => d.k === 'kkb')[1].s).toBe(''); // Leiste danach leer
    // Mitspieler spielt ab, 5 m von mir -> ich bekomme den Buff
    me.buffs = {}; me.v.hp = 70;
    handlers.ev({ k: 'kk', x: 8, z: 0, s: 'g', b: 'g1' }, 'p2');
    expect(me.buffs.g.lvl).toBe(1);
    expect(me.v.hp).toBe(85);
    // 10 m entfernt -> nichts
    me.buffs = {};
    handlers.ev({ k: 'kk', x: 13.5, z: 0, s: 'g', b: 'g1' }, 'p2');
    expect(me.buffs).toEqual({});
    // unbekannter Absender wird ignoriert
    handlers.ev({ k: 'kk', x: 3, z: 0, s: 'g', b: 'g1' }, 'fremder');
    expect(me.buffs).toEqual({});
    // Leisten-Stand des Mitspielers fuer den Kragen
    handlers.ev({ k: 'kkb', s: 'rbg' }, 'p2');
    expect(kkState(remote.weapon).bar).toEqual(['r', 'b', 'g']);
    handlers.ev({ k: 'kkb', s: 'zzz' }, 'p2');
    expect(kkState(remote.weapon).bar).toEqual(['r', 'b', 'g']);
    expect(ctx.calls.sfx.map((e) => e.name)).toContain('kkBeat');
  });
  it('HuntNet: Mitspieler im Radius sieht den Buff in der Party-Anzeige (remote.buffs), Mitspieler ausserhalb nicht', () => {
    const { me, handlers, remote } = netHarness();
    remote.pos.set(40, 0, 0);
    handlers.ev({ k: 'kk', x: 3, z: 0, s: 'b', b: 'b1' }, 'p2');
    expect(me.buffs.b.lvl).toBe(1);
    expect(remote.buffs).toEqual({});
    remote.pos.set(6, 0, 0);
    handlers.ev({ k: 'kk', x: 3, z: 0, s: 'b', b: 'b1' }, 'p2');
    expect(remote.buffs.b.lvl).toBe(1);
  });
});

describe('Waffen-Glitch: Feedback-Schleife (GDD 17.1)', () => {
  function glitchSetup() {
    const m = make();
    const h = m.ctx;
    h.time = 0; h.stats = { damage: 0, glitchDmg: 0 };
    h.sys = attachGlitch(h);
    h.player = m.p;
    initGlitch(m.p);
    addGlitchEnergy(m.p, 100); activateGlitch(m.p);
    return m;
  }
  it('Waffen-Glitch ist verdrahtet (def.glitch, Name)', () => {
    expect(KK.glitch.name).toBe('Feedback-Schleife');
    for (const k of ['onStart', 'onEnd', 'tick', 'onHit']) expect(typeof KK.glitch[k]).toBe('function');
    expect(FEEDBACK_PERIOD).toBe(2);
  });
  it('Leiste spielt sich alle 2 s selbst ab (ohne Leeren, ohne Heilung)', () => {
    const { p, w, ctx } = glitchSetup();
    kkState(w).bar.push('r', 'g');
    p.v.hp = 50;
    for (let i = 0; i < 100; i++) tickGlitch(p, DT); // 1,67 s
    expect(p.buffs).toEqual({});
    for (let i = 0; i < 30; i++) tickGlitch(p, DT);
    expect(p.buffs.r.lvl).toBe(1);
    expect(p.buffs.g.lvl).toBe(1);
    expect(kkState(w).bar).toEqual(['r', 'g']); // nicht geleert
    expect(p.v.hp).toBe(50); // keine Dauer-Heilung
    expect(ctx.calls.kkPlay).toHaveLength(1);
    for (let i = 0; i < 120; i++) tickGlitch(p, DT);
    expect(ctx.calls.kkPlay).toHaveLength(2);
    // leere Leiste: still
    kkState(w).bar.length = 0;
    for (let i = 0; i < 130; i++) tickGlitch(p, DT);
    expect(ctx.calls.kkPlay).toHaveLength(2);
  });
  it('jeder A-Treffer erzeugt ein Echo (BW 12, erhoehter Stagger-Wert), Echo loest kein weiteres Echo und kein Sample aus', () => {
    const { p, w, ctx } = glitchSetup();
    const hits = [];
    const mon = { alive: true, hurtParts: () => [{ part: { id: 'head' }, pos: { x: 0, y: 1, z: 2 } }] };
    ctx.playerHit = (pl, m, hp, ah) => { hits.push(ah); if (pl.glitch._echoing) KK.glitch.onHit(pl, { partId: hp.part.id }, m); };
    expect(ECHO_HIT.mv).toBe(12);
    expect(ECHO_HIT.blunt).toBeGreaterThan(14); // Stagger-Wert hoeher als der Kettenschlag (blunt 14)
    w.startMove('kk_a1');
    KK.glitch.onHit(p, { partId: 'head' }, mon);
    expect(hits).toHaveLength(0);
    for (let i = 0; i < Math.ceil(ECHO_DELAY / DT) + 1; i++) tickGlitch(p, DT);
    expect(hits).toHaveLength(1);
    expect(hits[0].hit).toMatchObject({ mv: 12, echo: true, noSample: true });
    expect(hits[0].group).toBe('echo');
    for (let i = 0; i < 30; i++) tickGlitch(p, DT);
    expect(hits).toHaveLength(1); // kein Echo vom Echo
    // B-Zuege (Remix, Schallstoss) erzeugen kein Echo
    w.startMove('kk_remix');
    KK.glitch.onHit(p, { partId: 'head' }, mon);
    for (let i = 0; i < 20; i++) tickGlitch(p, DT);
    expect(hits).toHaveLength(1);
  });
  it('Modus-Ende raeumt offene Echos auf', () => {
    const { p, w } = glitchSetup();
    const mon = { alive: true, hurtParts: () => [] };
    w.startMove('kk_a1');
    KK.glitch.onHit(p, { partId: 'head' }, mon);
    expect(p.glitch._kk.echo).toHaveLength(1);
    KK.glitch.onEnd(p);
    expect(p.glitch._kk.echo).toHaveLength(0);
  });
});

describe('Waffen-Daten, Schmiede, Save, Gear-Code', () => {
  it('Stufenwerte (Kraft) laut GDD 17.1', () => {
    expect(WEAPON_ORDER).toContain('kk');
    expect(WEAPON_TYPES.kk.tiers.map((t) => t.name)).toEqual(['Blechkiste', 'Schädel-Box', 'Jaggo-Equalizer', 'Brathalos-Schalltrichter', 'Kroll-Dampforgel', 'Funkenfürst-Doppelspule']);
    expect(weaponStats('kk', 1).power).toBe(76);
    expect(weaponStats('kk', 2).power).toBe(95);
    expect(weaponStats('kk', 3, 'a')).toMatchObject({ power: 112, crit: 0.15 });
    expect(weaponStats('kk', 3, 'b')).toMatchObject({ power: 118, bluntMul: 1.3, name: 'Barrotz-Gong' });
    expect(weaponStats('kk', 4)).toMatchObject({ power: 134, elems: { fire: 22 } });
    expect(weaponStats('kk', 5, 'k')).toMatchObject({ power: 150, elems: { rust: 20 }, partDmgMul: 1.25 });
    expect(weaponStats('kk', 5, 'g')).toMatchObject({ power: 152, elems: { fire: 24 }, crit: 0.15 });
    expect(weaponStats('kk', 5, 'v')).toMatchObject({ power: 156, elems: { shock: 26 } });
    expect(weaponStats('kk', 6, 'v')).toMatchObject({ power: 180, elems: { shock: 36 } });
  });
  it('Upgrade-Baum wie die anderen Waffen: 1 -> 2 -> 3a/3b -> 4 -> 5k/g/v -> 6v/6x, Kosten analog Katana', () => {
    expect(Object.keys(WEAPON_UPGRADES[3].kk)).toEqual(['a', 'b']);
    expect(Object.keys(WEAPON_UPGRADES[5].kk)).toEqual(['k', 'g', 'v']);
    expect(WEAPON_UPGRADES[6].kk.cost.voltaro_herz).toBe(1);
    expect(WEAPON_UPGRADES[3].kk).toEqual(WEAPON_UPGRADES[3].kt);
    expect(WEAPON_UPGRADES[5].kk).toEqual(WEAPON_UPGRADES[5].kt);
    expect(WEAPON_UPGRADES[6].kk).toEqual(WEAPON_UPGRADES[6].kt);
    expect(upgradeOptions('kk', 1).length).toBe(1);
    expect(upgradeOptions('kk', 2).length).toBe(2);
    expect(upgradeOptions('kk', 3, 'a').length).toBe(1);
    expect(upgradeOptions('kk', 4).length).toBe(3);
    expect(upgradeOptions('kk', 5, 'v').length).toBe(2); // 6v Funkenfuerst + 6x Sprenger
    expect(upgradeOptions('kk', 5, 'k').length).toBe(1); // nur 6x Sprenger (Krachfaust)
    expect(upgradeOptions('kk', 6)).toEqual([]);
    const s = defaultSave();
    const give = (cost) => { for (const [k, v] of Object.entries(cost)) { if (k === 'schrott') s.schrott += v; else s.box[k] = (s.box[k] ?? 0) + v; } };
    give(WEAPON_UPGRADES[2].cost);
    expect(upgradeWeapon(s, 'kk').name).toBe('Schädel-Box');
    expect(weaponUpgradeOptions(s, 'kk').length).toBe(2);
    give(WEAPON_UPGRADES[3].kk.b.cost);
    expect(upgradeWeapon(s, 'kk', 'b').name).toBe('Barrotz-Gong');
    expect(s.weapons.kk).toEqual({ tier: 3, branch: 'b' });
  });
  it('Save: neue Saves und alte Saves ohne kk bekommen eine Start-Blechkiste, kk ist ausruestbar, kaputte Werte werden geklemmt', () => {
    expect(defaultSave().weapons.kk).toEqual({ tier: 1, branch: null });
    const old = { version: 2, name: 'Alt', weapons: { gs: { tier: 3, branch: 'a' }, db: { tier: 1 }, bow: { tier: 1 }, kt: { tier: 2 } }, loadout: { weapon: 'kt' } };
    const s = sanitize(old);
    expect(s.weapons.kk).toEqual({ tier: 1, branch: null }); // Migration: Start-Waffe
    expect(s.weapons.gs).toEqual({ tier: 3, branch: 'a' }); // Bestehendes bleibt
    expect(sanitize({ ...old, loadout: { weapon: 'kk' } }).loadout.weapon).toBe('kk');
    expect(sanitize({ weapons: { kk: { tier: 9, branch: 'b' } } }).weapons.kk).toEqual({ tier: 6, branch: 'v' });
    expect(sanitize({ weapons: { kk: { tier: 3, branch: 'zz' } } }).weapons.kk).toEqual({ tier: 3, branch: 'a' });
    const arm = sanitize({ armory: [{ type: 'kk', tier: 5, branch: 'g' }, { type: 'kx', tier: 1 }] });
    expect(arm.armory).toEqual([{ type: 'kk', tier: 5, branch: 'g' }]);
  });
  it('Gear-Code: Zeichen `h`, Roundtrip ueber alle Stufen/Aeste, kollidiert nicht mit den anderen Waffen', () => {
    expect(encodeGear({ weapon: { type: 'kk', tier: 1 } })[0]).toBe('h');
    for (const [tier, branch] of [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null], [5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']]) {
      const code = encodeGear({ weapon: { type: 'kk', tier, branch } }, 2);
      expect(code).toHaveLength(7);
      const d = decodeGear(code);
      expect(d.weapon).toEqual({ type: 'kk', tier, branch });
      expect(d.colorIdx).toBe(2);
      expect(makeGear({ weapon: { type: 'kk', tier, branch } }).weapon.type).toBe('kk');
    }
    for (const t of ['gs', 'db', 'bow', 'kt']) expect(decodeGear(encodeGear({ weapon: { type: t, tier: 2 } })).weapon.type).toBe(t);
    const chars = ['gs', 'db', 'bow', 'kt', 'kk'].map((t) => encodeGear({ weapon: { type: t, tier: 1 } })[0]);
    expect(new Set(chars).size).toBe(5);
  });
  it('Onboarding-Tipp und Rueckenhalterung sind vorhanden', () => {
    expect(WEAPON_TIPS.kk).toMatch(/Krachkiste/);
    expect(WEAPON_TIPS.kk.length).toBeLessThan(180);
    const rig = { torso: new THREE.Group() };
    const back = mountOnBack(rig, KK.buildMesh({ tier: 1 }), 'kk');
    const g = back.children[0]; // eigener Socket (kleiner, schraeg ueber der Schulter), nicht der Standard (gs)
    expect(g.scale.x).toBeCloseTo(0.8);
    expect(g.rotation.z).toBeCloseTo(0.55);
    expect(g.children[0]).toBeTruthy();
  });
});

describe('Optik: neun Instrumente, Entfalten, Kragen, wenig Draw Calls', () => {
  const STEPS = [[1, null], [2, null], [3, 'a'], [3, 'b'], [4, null], [5, 'k'], [5, 'g'], [5, 'v'], [6, 'v']];
  const meshes = (root) => { let n = 0; root.traverse((o) => { if (o.isMesh) n++; }); return n; };
  it('Stufe/Ast -> Look-Schluessel (alle 9 verschieden)', () => {
    const keys = STEPS.map(([t, b]) => kkLookKey(t, b));
    expect(keys).toEqual(KK_KEYS);
    expect(new Set(keys).size).toBe(9);
  });
  it('jeder Look: Griff fuer die zweite Hand, 3 Kragen-Slots, Membran, <= 12 Meshes (Draw Calls), mind. ein entfaltbares Teil', () => {
    for (const [tier, branch] of STEPS) {
      const m = KK.buildMesh({ tier, branch });
      const d = m.userData.kk;
      expect(m.userData.twoHand, `${tier}${branch}`).toBeTruthy();
      expect(d.slots).toHaveLength(3);
      expect(d.mem.mesh).toBeTruthy();
      expect(d.pivots.length, `${tier}${branch}`).toBeGreaterThan(0);
      expect(meshes(m), `${tier}${branch}`).toBeLessThanOrEqual(12);
      expect(m.userData.glow.emissive).toBeTruthy(); // Aufdrehen-/Sauber-Glanz (player.#animate)
    }
  });
  it('Kragen leuchtet gemaess Leiste (immer gleiche Stelle/Farben): Slot i zeigt Symbol des i-ten Samples', () => {
    const d = buildKrachkisteLook(1).userData.kk;
    const cells = () => d.slots.map((s) => s.cell);
    expect(cells()).toEqual([0, 0, 0]);
    setSlots(d, ['r', 'b', 'g']);
    expect(cells()).toEqual([CELL.r, CELL.b, CELL.g]);
    setSlots(d, ['g']);
    expect(cells()).toEqual([CELL.g, 0, 0]);
    const y = d.slots.map((s) => s.sp.position.y);
    expect(y[0]).toBeGreaterThan(y[1]); expect(y[1]).toBeGreaterThan(y[2]);
    // Position ist fuer alle Looks identisch
    for (const [tier, branch] of STEPS) expect(buildKrachkisteLook(tier, branch).userData.kk.slots.map((s) => s.sp.position.y)).toEqual(y);
  });
  it('Abspielen entfaltet das Instrument (Remix maximal), Idle faltet zu; Membran pumpt in Zonen-Farbe', () => {
    for (const [tier, branch] of [[1, null], [2, null], [3, 'a'], [4, null], [5, 'k'], [6, 'v']]) {
      const mesh = KK.buildMesh({ tier, branch });
      const d = mesh.userData.kk;
      const w = { data: { kk: { bar: ['r', 'b', 'g'], pump: 0, pumpC: 'r' } }, move: null, t: 0 };
      for (let i = 0; i < 30; i++) KK.updateMesh(w, mesh, DT, null);
      expect(d.open).toBeLessThan(0.02);
      Object.assign(w, { move: { anim: 'kk_play' }, t: 0.5 });
      for (let i = 0; i < 40; i++) KK.updateMesh(w, mesh, DT, null);
      const open = d.open;
      expect(open).toBeGreaterThan(0.9);
      Object.assign(w, { move: { anim: 'kk_remix' }, t: 0.55 });
      for (let i = 0; i < 40; i++) KK.updateMesh(w, mesh, DT, null);
      expect(d.open).toBeGreaterThan(open + 0.2); // Remix = maximal entfaltet
      Object.assign(w, { move: null, t: 0 });
      for (let i = 0; i < 90; i++) KK.updateMesh(w, mesh, DT, null);
      expect(d.open).toBeLessThan(0.02);
    }
    const mesh = KK.buildMesh({ tier: 1 });
    const w = { data: { kk: { bar: [], pump: 1, pumpC: 'b' } }, move: null, t: 0 };
    KK.updateMesh(w, mesh, DT, null);
    const em = mesh.userData.kk.mem.mat.emissive;
    expect(em.b).toBeGreaterThan(em.r);
    expect(mesh.userData.kk.mem.mesh.scale.z).toBeGreaterThan(1.2);
  });
  it('Remote-Avatar: Pose aus dem Snapshot entfaltet das Instrument, Leiste kommt aus weapon.data (kkb-Event)', () => {
    const ctx = makeCtx();
    const p = new Player({ ctx, weapon: 'kk', local: false });
    p.remote = { state: 'free', rollT: 0, sprint: false, speed: 0, wp: { name: 'kk_play', t: 0.5, charging: false, level: 0 }, air: 0 };
    kkState(p.weapon).bar = ['r', 'b'];
    for (let i = 0; i < 40; i++) p.updateRemote(DT);
    const d = p.weaponMesh.userData.kk;
    expect(d.open).toBeGreaterThan(0.9);
    expect(d.slots.map((s) => s.cell)).toEqual([CELL.r, CELL.b, 0]);
    for (const mv of Object.values(KK.moves)) expect(p.anims[mv.anim], mv.id).toBeTruthy();
  });
});

describe('HUD-Status', () => {
  it('3 Slots (r/b/g bzw. leer), REMIX bei 3 verschiedenen, Hinweise je Zustand', () => {
    const s = setup({ bar: [] });
    expect(KK.status(s.w)).toMatchObject({ slots: ['', '', ''], remix: false, text: '' });
    kkState(s.w).bar = ['r', 'b'];
    expect(KK.status(s.w)).toMatchObject({ slots: ['r', 'b', ''], text: 'B = Abspielen' });
    kkState(s.w).bar = ['g', 'r', 'b'];
    expect(KK.status(s.w)).toMatchObject({ slots: ['g', 'r', 'b'], remix: true, text: 'REMIX' });
    kkState(s.w).bar = ['r', 'r', 'b'];
    expect(KK.status(s.w).remix).toBe(false);
    s.w.wucht = 100;
    expect(KK.status(s.w).text).toBe('Zugabe: B halten');
    s.w.wucht = 0;
    s.holdFor('A', 0.9);
    expect(KK.status(s.w)).toMatchObject({ sauber: true, text: 'Voll aufgedreht!' });
  });
});
