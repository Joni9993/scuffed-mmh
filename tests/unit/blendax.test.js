// Blendax, der Flimmerfürst (Smaragdküste): Definition, Blitz (faceCheck, Geblendet, Glitch-Konter), Schirm, Welt, Daten.
import { describe, it, expect, beforeEach } from 'vitest';
import { make, DT } from './p3helpers.js';
import { Player } from '../../src/game/player.js';
import { monsters } from '../../src/game/monsters/index.js';
import { blendax, BLENDAX, buildBlendax } from '../../src/game/monsters/blendax.js';
import { jaggo } from '../../src/game/monsters/jaggo.js';
import { retune } from '../../src/game/monsters/common.js';
import { MIN_TELEGRAPH, AttackInstance } from '../../src/game/monsters/attack.js';
import { pickTone } from '../../src/game/cues.js';
import { time } from '../../src/core/time.js';
import { ITEMS } from '../../src/data/items.js';
import { DROPS } from '../../src/data/drops.js';
import { ARMOR_SETS, SKILLS, SET_ORDER } from '../../src/data/armor.js';
import { quests, QUEST_ORDER, MONSTER_RP, RANK_RP } from '../../src/data/quests.js';
import { RANKS, questLock } from '../../src/meta/progression.js';
import { defaultSave } from '../../src/meta/save.js';
import { BESTIARY, CONDITIONS, ELEM_NOTES } from '../../src/data/compendium.js';
import { skillEffects } from '../../src/meta/loadout.js';
import { createWorld } from '../../src/game/world/index.js';

beforeEach(() => time.reset());

const def = { ...blendax, hp: 1e8 };
const run = (m, ctx, secs, fn) => { for (let i = 0; i < secs / DT; i++) { fn?.(i); ctx.players.forEach((p) => p.update(DT)); m.update(DT); } };
const fxSpy = (ctx) => { const calls = []; for (const k of ['whiteout', 'clearWhiteout', 'brokenScreen']) ctx.fx[k] = (...a) => calls.push([k, ...a]); return calls; };
/** Blendax steht bei (0,0) Blick +z, Pirscher bei (0,9) schaut zum Brocken; Blitz wird direkt gestartet. */
function blitzScene({ camera = Math.PI } = {}) {
  const s = make(def, 'combat', 0, 9);
  s.ctx.cameraYaw = camera; // Pirscher bei +z, Brocken im -z: Kamera zum Brocken = PI
  s.m.recover = 99; s.m._taught = true;
  s.p.god = false;
  s.fx = fxSpy(s.ctx);
  return s;
}

describe('Blendax: Definition', () => {
  it('Registry, Werte, Teile', () => {
    expect(monsters.blendax).toBe(blendax);
    expect(blendax.hp).toBe(14000);
    expect(blendax.scale).toBe(1.5);
    expect(blendax.walk).toBe(4.2); expect(blendax.run).toBe(11);
    const ids = blendax.parts.map((p) => p.id);
    for (const id of ['head', 'frill', 'body', 'legs', 'tail']) expect(ids).toContain(id);
    const bp = (id) => blendax.parts.find((p) => p.id === id);
    expect(bp('head').breakHp).toBe(1000); expect(bp('frill').breakHp).toBe(1450); expect(bp('tail').breakHp).toBe(850);
    expect(bp('frill').elem.shock).toBe(35);
    expect(blendax.glitchSpots).toBeUndefined();
    expect(blendax.teachAttack).toBe('blendax_bissreihe');
  });
  it('jeder Angriff: Cue (neongrün), Telegraph >= 0.5, Treffer melden audit an; Ketten/Phasen zeigen auf echte Angriffe', () => {
    for (const a of Object.values(blendax.attacks)) {
      expect(a.cue, a.id).toBeTruthy();
      expect(a.cue.color, a.id).toMatch(/^#(39ff14|7dff3a|d8ffd0)$/); // nie Cyan/Magenta
      expect(a.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
      if (a.hits?.length) expect(a.audit?.length, a.id).toBeGreaterThan(0);
      // Schadensbereiche rot und aus den Trefferformen abgeleitet (nie grün); nur die Blitz-Warnung (kein Schaden) ist gelb
      if (a.hits?.some((h) => h.dmg > 0)) { expect(a.markerFromHits, a.id).toBe(true); expect(a.marker, a.id).toBeUndefined(); }
      if (a.marker) expect(a.marker.color, a.id).not.toMatch(/^#(39ff14|7dff3a|d8ffd0)$/);
    }
    for (const [from, list] of Object.entries(blendax.chains)) {
      expect(blendax.attacks[from], from).toBeTruthy();
      for (const o of list) if (o.atk) expect(blendax.attacks[o.atk], o.atk).toBeTruthy();
    }
    expect(blendax.attacks[blendax.phases[0].special]).toBeTruthy();
    expect(blendax.chains.blendax_blitz[0].atk).toBe('blendax_sprung');
  });
  it('Cue-Farbe bleibt in Ketten grün (kein Hue-Shift)', () => {
    for (const idx of [0, 1, 2, 3]) expect(pickTone('blendax_sprung', blendax.attacks.blendax_sprung.cue, idx).color).toBe('#39ff14');
  });
  it('Klone sind tiefe Kopien: Jaggo bleibt unverändert, Blendax ist härter und schneller', () => {
    expect(blendax.attacks.blendax_bissreihe.hits).not.toBe(jaggo.attacks.jaggo_bissreihe.hits);
    expect(blendax.attacks.blendax_bissreihe.hits[0].dmg).toBe(31); // 17 x1,8
    expect(jaggo.attacks.jaggo_bissreihe.hits[0].dmg).toBe(12);
    expect(blendax.attacks.blendax_bissreihe.tempo).toBeGreaterThan(jaggo.attacks.jaggo_bissreihe.tempo);
    const c = retune(jaggo.attacks.jaggo_huepfer, { id: 'x', dmg: 5, range: [1, 2] });
    expect(c.hits[0].dmg).toBe(5); expect(c.id).toBe('x'); expect(c.range).toEqual([1, 2]);
    expect(jaggo.attacks.jaggo_huepfer.range).toEqual([3.5, 10]);
  });
  it('Schaden: alle Treffer x1,8 gegenüber den Basiswerten (Blitz bleibt 0)', () => {
    const A = blendax.attacks, dmgs = (id) => A[id].hits.map((h) => h.dmg), x = (a) => a.map((d) => Math.round(d * 1.8));
    expect(BLENDAX.DMG_MUL).toBe(1.8);
    expect(dmgs('blendax_bissreihe')).toEqual(x([17, 17, 17])); expect(dmgs('blendax_huepfer')).toEqual(x([32])); expect(dmgs('blendax_schwanz')).toEqual(x([24]));
    expect(dmgs('blendax_rueckhuepfer')).toEqual(x([24])); expect(dmgs('blendax_zickzack')).toEqual(x([15, 15, 15, 20])); expect(dmgs('blendax_hetzjagd')).toEqual(x([30, 24]));
    expect([A.blendax_sprung, A.blendax_sprung2, A.blendax_sprung3].map((a) => a.hits[0].dmg)).toEqual(x([30, 30, 36]));
    expect(dmgs('blendax_blitz')).toEqual([0]);
  });
  it('Körper gelbgrün: Haut- und Bauchfarbe im Gelbgrün-Bereich (Hue 70-100 Grad), Schirm bleibt Neongrün', () => {
    const hue = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); return (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; };
    for (const c of [BLENDAX.SKIN, BLENDAX.BELLY]) { expect(hue(c), c).toBeGreaterThan(70); expect(hue(c), c).toBeLessThan(100); }
    expect(buildBlendax().extra.frillMat).toBeTruthy();
  });
  it('Blitz: 1 s Telegraph, dmg 0, kein Knockback, faceCheck 80, Status blend, gesperrt bei Schirmbruch', () => {
    const b = blendax.attacks.blendax_blitz;
    expect(b.telegraph).toBe(1.0);
    expect(b.hits[0]).toMatchObject({ dmg: 0, knock: 'none', faceCheck: 80, status: { type: 'blend' } });
    expect(b.lockedByBreak).toBe('frill');
    expect(new AttackInstance(b, { attackId: b.id, t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, seed: 1 }).firstHitTime()).toBeCloseTo(1.0 / 1, 1);
  });
});

describe('Blendax: Blitz trifft nur, wer hinsieht', () => {
  it('Kamera zum Brocken: Geblendet (Weißbild 1 s, danach Betäubung mit Sternen), Warnbildschirm beim Start', () => {
    const { ctx, m, p, fx } = blitzScene();
    p.god = true; // der Sprung landet jetzt noch in der Betäubung
    m.beginAttack('blendax_blitz');
    run(m, ctx, 0.1);
    expect(fx.some((c) => c[0] === 'brokenScreen')).toBe(true); // Warnung für alle, die ihn im Bild haben
    run(m, ctx, 1.1);
    expect(p.status.blend).toBeTruthy();
    expect(fx.find((c) => c[0] === 'whiteout')[1]).toBeCloseTo(1, 5);
    expect(p.state).not.toBe('pinned'); // Phase 1: steuerbar
    run(m, ctx, 1.0);
    expect(p.status.blend?.stunned).toBe(true);
    expect(p.status.blend.stun).toBe(2); // Blendax: 2 s Betäubung nach dem Weißbild
    expect(p.state).toBe('pinned');
    expect(p.stars?.visible).toBe(true);
    m.recover = 99; run(m, ctx, 2.1);
    expect(p.status.blend).toBeUndefined();
    expect(p.stars.visible).toBe(false);
    expect(p.state).not.toBe('pinned'); // Sprung darf schon getroffen haben (flinch)
  });
  it('weggedreht (Kamera 180 Grad): kein Treffer, kein Zustand, keine Warnung', () => {
    const { ctx, m, p, fx } = blitzScene({ camera: 0 });
    m.beginAttack('blendax_blitz');
    run(m, ctx, 1.4);
    expect(p.status.blend).toBeUndefined();
    expect(fx.some((c) => c[0] === 'brokenScreen')).toBe(false);
    expect(p.v.hp).toBe(p.v.maxHp);
  });
  it('perfekter Dodge = Glitch-Konter: kein Blend, Blendax taumelt 1,8 s und die Sprungkette entfällt', () => {
    const { ctx, m, p } = blitzScene();
    let counters = 0;
    ctx.bus.on('glitchCounter', () => counters++);
    const inst = m.beginAttack('blendax_blitz', { tgMul: 1 });
    expect(inst.firstHitTime()).toBeCloseTo(1.0, 5);
    // Rolle bei t = 0,9 s: beim Treffer (t = 1,0 s) steht sie 0,1 s im perfect-Fenster (0,06-0,16 s)
    for (let t = 0; t < 1.12 + 0.2; t += DT) {
      if (Math.abs(t - 0.90) < DT / 2) { ctx.input.setStick(-1, 0, 'bot'); ctx.input.press('roll', 50); }
      ctx.input.poll(DT); p.update(DT); ctx.input.setStick(0, 0, 'bot'); m.update(DT);
      if (counters) break;
    }
    expect(counters).toBe(1);
    expect(p.status.blend).toBeUndefined();
    expect(m.stunT).toBeCloseTo(BLENDAX.DIZZY, 1);
    expect(m.attack).toBeNull();
    expect(m.chainNext).toBeNull();
  });
});

describe('Blendax: Schirm, Schock, Nebel', () => {
  it('Schirmbruch: Schirm weg, Stumpf, 25 s Sprung-Wut (schneller), kein Blitz mehr', () => {
    const { ctx, m } = make(def, 'combat', 0, 9);
    const base = m.speedMul;
    m._breakPart(m.partById.frill);
    expect(m.hopFury).toBe(25);
    expect(m.extra.crest.visible).toBe(false); expect(m.extra.stump.visible).toBe(true);
    expect(m.speedMul).toBeCloseTo(base * 1.15, 5);
    expect(m._atkAllowed(blendax.attacks.blendax_blitz)).toBe(false);
    run(m, ctx, 26);
    expect(m.hopFury).toBe(0);
  });
  it('Schock auf dem Schirm: 6 s Blitz-Sperre, laufender Blitz bricht ab', () => {
    const { ctx, m } = make(def, 'combat', 0, 9);
    m.recover = 99; m._taught = true;
    m.beginAttack('blendax_blitz'); run(m, ctx, 0.3);
    m.applyDamage({ dmg: 10, partId: 'frill', elemBy: { shock: 8 }, attackerId: 'p1' });
    expect(m.extra.blitzLock).toBeCloseTo(6, 0);
    expect(m.attack).toBeNull();
    expect(blendax.attacks.blendax_blitz.cond(m)).toBe(false);
    m.applyDamage({ dmg: 10, partId: 'frill', elemBy: { fire: 8 }, attackerId: 'p1' }); // Feuer sperrt nicht neu
  });
  it('Blitz-Abklingzeit: 14 s, im Nebel (Zone 3) 9 s, Flimmerfieber x0,7', () => {
    const { ctx, m } = make(def, 'combat', 0, 9);
    m.fogged = false; blendax.onAttackEnd(m, 'blendax_blitz'); expect(m.extra.blitzT).toBe(14);
    m.fogged = true; blendax.onAttackEnd(m, 'blendax_blitz'); expect(m.extra.blitzT).toBe(9);
    m.phase = 1; blendax.onAttackEnd(m, 'blendax_blitz'); expect(m.extra.blitzT).toBeCloseTo(6.3, 5);
    ctx.world.zoneAt = () => 3; run(m, ctx, 0.1);
    expect(m.fogged).toBe(true);
    expect(m.speedMul).toBeGreaterThan(1.09);
    expect(blendax.detectFor(m)).toBe(40);
  });
  it('Kette: Blitz -> Sprung -> Sprung2 -> Sprung3 (3 Folgeglieder erlaubt), letzter Sprung wirft um', () => {
    expect(blendax.chainMax).toBe(4);
    expect(blendax.attacks.blendax_sprung3.hits[0].knock).toBe('down');
    expect(blendax.attacks.blendax_sprung.hits[0].dmg).toBe(54); // 30 x1,8
    expect(blendax.chains.blendax_sprung3.some((o) => o.atk === 'blendax_schwanz')).toBe(true); // Kombo geht weiter
  });
});

describe('Geblendet (Pirscher-Status) und Blendschutz', () => {
  function bare() { const { ctx, p } = make(def, 'combat', 0, 9); const fx = fxSpy(ctx); return { ctx, p, fx }; }
  it('Standard: 1 s Weiß, 1 s Betäubt, Sterne nur in Phase 2', () => {
    const { ctx, p, fx } = bare();
    p.addStatus('blend');
    expect(fx.find((c) => c[0] === 'whiteout').slice(1)[0]).toBe(1);
    for (let i = 0; i < 0.5 / DT; i++) p.update(DT);
    expect(p.state).toBe('free'); expect(p.stars?.visible).toBeFalsy();
    for (let i = 0; i < 0.6 / DT; i++) p.update(DT);
    expect(p.state).toBe('pinned'); expect(p.stars.visible).toBe(true);
    for (let i = 0; i < 1.1 / DT; i++) p.update(DT);
    expect(p.status.blend).toBeUndefined(); expect(p.state).toBe('free');
    expect(fx.some((c) => c[0] === 'clearWhiteout')).toBe(true);
    void ctx;
  });
  it('Blendschutz Stufe 3: Weiß 0,1 s, keine Betäubung', () => {
    const { p, fx } = bare();
    p.addStatus('blend', { white: 0.1, stun: 0 });
    expect(fx.find((c) => c[0] === 'whiteout')[1]).toBeCloseTo(0.1, 5);
    for (let i = 0; i < 0.3 / DT; i++) p.update(DT);
    expect(p.status.blend).toBeUndefined(); expect(p.state).toBe('free');
  });
  it('Macke Blendschutz: Zahlen und Set', () => {
    expect(skillEffects({ blendschutz: 2 }).blendCut).toBeCloseTo(0.6, 5);
    expect(SKILLS.blendschutz.desc(1)).toContain('0,3');
    expect(SKILLS.blendschutz.desc(3)).toContain('keine Betäubung');
    expect(ARMOR_SETS.blendax.prot).toBe(44);
    expect(ARMOR_SETS.blendax.skills).toContain('blendschutz');
    expect(SET_ORDER.indexOf('blendax')).toBeGreaterThan(SET_ORDER.indexOf('voltaro'));
  });
  it('Respawn / clearStatus räumt Weißbild und Sterne ab', () => {
    const { p, fx } = bare();
    p.addStatus('blend'); for (let i = 0; i < 1.2 / DT; i++) p.update(DT);
    p.clearStatus();
    expect(p.stars.visible).toBe(false);
    expect(fx.some((c) => c[0] === 'clearWhiteout')).toBe(true);
  });
});

describe('Blendax: Welt, Daten, Fortschritt', () => {
  it('Nest Zone 3, Route durch Zone 3 + 2 über den Pass, Spawn erreichbar', () => {
    const w = createWorld('smaragdkueste', { seed: 1 });
    expect(w.nestFor('blendax')).toEqual(w.nestFor('barrotz'));
    const route = w.routeFor('blendax');
    const zones = new Set(route.map((p) => w.zoneAt(p.x, p.z)));
    expect(zones.has(2)).toBe(true); expect(zones.has(3)).toBe(true);
    expect(route.length).toBeGreaterThan(w.routeFor('barrotz').length);
    expect(w.monsterSpawns.blendax).toBeTruthy();
    expect(w.zoneAt(w.monsterSpawns.blendax.x, w.monsterSpawns.blendax.z)).toBe(3);
  });
  it('Drops: Materialien existieren, Schirm-Bruch gibt den Schirm', () => {
    const d = DROPS.blendax;
    const ids = [...d.carve, ...d.tail, ...d.reward, ...Object.values(d.breaks).flat()].map((e) => e.id);
    for (const id of ids) expect(ITEMS[id], id).toBeTruthy();
    expect(d.breaks.frill[0].id).toBe('blendax_schirm');
    for (const set of Object.values(ARMOR_SETS.blendax.pieces)) for (const id of Object.keys(set.cost)) expect(ITEMS[id] || id === 'schrott', id).toBeTruthy();
  });
  it('Auftrag blendax: JR 7 -> 8, Schlüssel in RANKS, RP-Schwelle 1700, Rotglut erst ab JR 10', () => {
    const q = quests.blendax;
    expect(q).toMatchObject({ monster: 'blendax', world: 'smaragdkueste', jr: 7, jrUp: 8, reward: 3000, rp: 200, timeLimit: 25 * 60 });
    expect(MONSTER_RP.blendax).toBe(200);
    expect(RANKS.find((r) => r.jr === 8)).toMatchObject({ keys: ['blendax'], rp: RANK_RP[8] });
    expect(QUEST_ORDER.indexOf('blendax')).toBeGreaterThan(QUEST_ORDER.indexOf('inselausflug'));
    const s = defaultSave(); s.jr = 6;
    expect(questLock(s, q)).toMatchObject({ reason: 'jr', need: 7 });
    s.jr = 7; s.rp = 0;
    expect(questLock(s, q)).toMatchObject({ reason: 'rp' });
    s.rp = 1700;
    expect(questLock(s, q)).toBeNull();
    expect(quests.blendax_rotglut).toMatchObject({ jr: 10, variant: 'rotglut' });
    expect(quests.blendax_rotglut.matMul).toBeGreaterThan(1);
  });
  it('Kompendium: Eintrag, Zustand Geblendet, Element-Hinweis', () => {
    const b = BESTIARY.find((x) => x.id === 'blendax');
    expect(b.entries.length).toBeGreaterThanOrEqual(6);
    expect(CONDITIONS.some((c) => c.id === 'blend')).toBe(true);
    expect(ELEM_NOTES.blendax).toContain('Schirm');
  });
  it('Spieler-Zustand wird im Netz-Snapshot angezeigt', () => {
    const { p } = make(def, 'combat', 0, 9);
    p.addStatus('blend');
    expect(p.snapshot().status).toContain('blend');
    void Player;
  });
});
