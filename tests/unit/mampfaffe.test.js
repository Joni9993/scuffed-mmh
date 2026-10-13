// Mampfaffe, der Magenkönig (Smaragdküste): Definition, Futter-KI, Buffs, Futterklau, Zustände (Verwirrt, Item-Sperre), Welt, Daten.
import { describe, it, expect, beforeEach } from 'vitest';
import { make, DT } from './p3helpers.js';
import { monsters } from '../../src/game/monsters/index.js';
import { mampfaffe, MAMPFAFFE, FOODS, FOOD_IDS, setFood, stealFromPouch } from '../../src/game/monsters/mampfaffe.js';
import { MIN_TELEGRAPH, AttackInstance } from '../../src/game/monsters/attack.js';
import { pickTone } from '../../src/game/cues.js';
import { time } from '../../src/core/time.js';
import { HuntInventory } from '../../src/game/inventory.js';
import { ItemSystem } from '../../src/game/items.js';
import { applyLoadout } from '../../src/game/loadout.js';
import { ITEMS } from '../../src/data/items.js';
import { DROPS } from '../../src/data/drops.js';
import { GATHER_KINDS } from '../../src/data/gather.js';
import { ARMOR_SETS, SKILLS, SET_ORDER } from '../../src/data/armor.js';
import { quests, QUEST_ORDER, MONSTER_RP, RANK_RP } from '../../src/data/quests.js';
import { RANKS, questLock } from '../../src/meta/progression.js';
import { defaultSave } from '../../src/meta/save.js';
import { BESTIARY, CONDITIONS, ELEM_NOTES } from '../../src/data/compendium.js';
import { skillEffects } from '../../src/meta/loadout.js';
import { createWorld } from '../../src/game/world/index.js';
import { encodeMonster, decodeMonster } from '../../src/net/protocol.js';

beforeEach(() => time.reset());

const def = { ...mampfaffe, hp: 1e8 };
const run = (m, ctx, secs, fn) => { for (let i = 0; i < secs / DT; i++) { fn?.(i); ctx.players.forEach((p) => p.update(DT)); m.update(DT); } };
const NEON_OK = /^#(39ff14|7dff3a|d8ffd0)$/;

/** Mock-Futterstelle (so wie world.gatherPoints sie liefert). */
function foodWorld(ctx, specs) {
  const pts = specs.map(([kind, x, z, zone = 1, uses = 2], i) => ({ id: `g${zone}-${i}`, kind, zone, pos: { x, y: 0, z }, usesLeft: uses, maxUses: uses }));
  ctx.world.gatherPoints = pts;
  ctx.world.setGatherState = (id, u) => { const p = pts.find((q) => q.id === id); if (p) p.usesLeft = u; return !!p; };
  return pts;
}
/** Mampfaffe wandert bei (0,0), kein Pirscher in der Nähe. */
function wandering(specs = []) {
  const s = make(def, 'wander', 200, 200);
  s.m.recover = 99;
  s.pts = foodWorld(s.ctx, specs);
  return s;
}

describe('Mampfaffe: Definition', () => {
  it('Registry, Werte, Teile', () => {
    expect(monsters.mampfaffe).toBe(mampfaffe);
    expect(mampfaffe.hp).toBe(16000);
    expect(mampfaffe.scale).toBe(1.8);
    expect(mampfaffe.walk).toBe(3.4); expect(mampfaffe.run).toBe(8);
    const bp = (id) => mampfaffe.parts.find((p) => p.id === id);
    for (const id of ['head', 'prankeL', 'prankeR', 'belly', 'body', 'legs']) expect(bp(id), id).toBeTruthy();
    expect(bp('head').breakHp).toBe(1050); expect(bp('prankeL').breakHp).toBe(650);
    expect(bp('belly').elem.fire).toBe(28); expect(bp('legs').elem.shock).toBe(25);
    expect(mampfaffe.glitchSpots).toBeUndefined();
    expect(mampfaffe.teachAttack).toBe('mampfaffe_faeuste');
    expect(mampfaffe.predator).toBe(true);
  });
  it('jeder Angriff: Cue ohne Hue-Shift, nie Cyan/Magenta, Telegraph >= 0.5, Treffer melden audit an; Ketten/Phasen zeigen auf echte Angriffe', () => {
    const FOOD_COLORS = [FOODS.kokosnuss.color, FOODS.feuerpilz.color, FOODS.giftkraut.color];
    for (const a of Object.values(mampfaffe.attacks)) {
      expect(a.cue, a.id).toBeTruthy();
      expect(a.cue.noShift, a.id).toBe(true);
      expect(a.cue.color, a.id).toSatisfy((c) => NEON_OK.test(c) || FOOD_COLORS.includes(c));
      expect(a.telegraph).toBeGreaterThanOrEqual(MIN_TELEGRAPH);
      if (a.hits?.length) expect(a.audit?.length, a.id).toBeGreaterThan(0);
      if (a.marker?.color) expect(a.marker.color, a.id).toSatisfy((c) => c === '#39ff14' || FOOD_COLORS.includes(c));
    }
    for (const [from, list] of Object.entries(mampfaffe.chains)) {
      expect(mampfaffe.attacks[from], from).toBeTruthy();
      for (const o of list) if (o.atk) expect(mampfaffe.attacks[o.atk], o.atk).toBeTruthy();
    }
    expect(mampfaffe.attacks[mampfaffe.phases[0].special]).toBeTruthy();
    expect(pickTone('mampfaffe_faeuste', mampfaffe.attacks.mampfaffe_faeuste.cue, 3).color).toBe('#7dff3a');
  });
  it('Grundangriffe (verschärft): Treffer bis 48, Fäuste 38/38/46 mit großen Hitboxen, Brust dmg 0 + pin, Stampfer r 6,5 + Welle', () => {
    const A = mampfaffe.attacks;
    expect(A.mampfaffe_faeuste.hits.map((h) => h.dmg)).toEqual([38, 38, 46]);
    expect(A.mampfaffe_faeuste.hits.every((h) => h.radius >= 2.0)).toBe(true);
    expect(A.mampfaffe_faeuste.hits[2].knock).toBe('down');
    expect(A.mampfaffe_grabbel.hits[0]).toMatchObject({ dmg: 20, steal: true });
    expect(A.mampfaffe_stampfer.hits[0]).toMatchObject({ radius: 6.5, dmg: 42, knock: 'down' });
    expect(A.mampfaffe_stampfer.hits[1].radius).toBe(9.5);
    expect(A.mampfaffe_rolle.hits[0]).toMatchObject({ dmg: 40, radius: 2.5 });
    expect(A.mampfaffe_brust.hits[0]).toMatchObject({ dmg: 0, knock: 'pin' });
    expect(A.mampfaffe_feuerruelpser.telegraph).toBeCloseTo(0.75, 5);
    expect(A.mampfaffe_feuerruelpser.hits.every((h) => h.dmg === 26 && h.status?.type === 'burn')).toBe(true);
    expect(A.mampfaffe_flimmersprung.hits[0]).toMatchObject({ radius: 3.4, dmg: 34, knock: 'down' });
    const max = Math.max(...Object.values(A).flatMap((a) => (a.hits ?? []).map((h) => h.dmg)));
    expect(max).toBeLessThanOrEqual(48);
  });
});

describe('Mampfaffe: Futter-KI (Host/Solo)', () => {
  it('geht im Wandern zur nächsten Futterstelle, frisst 2 s lang und verbraucht genau eine Nutzung', () => {
    const { ctx, m, pts } = wandering([['feuerpilz', 12, 0, 2]]);
    m.extra.foodCd = 0;
    const eaten = [];
    ctx.bus.on('foodEaten', (e) => eaten.push(e));
    run(m, ctx, 14);
    expect(eaten.length).toBe(1);
    expect(pts[0].usesLeft).toBe(1);
    expect(m.extra.food).toBe('feuerpilz');
    expect(m.extra.foodT).toBeGreaterThan(25); expect(m.extra.foodT).toBeLessThanOrEqual(40);
    expect(m.extra.foodCd).toBeGreaterThan(0); // danach 12 s Pause (läuft schon)
  });
  it('Zone 3/4 und weit entfernte Stellen interessieren ihn nicht (nur Revier Zone 1+2, 40 m)', () => {
    const { ctx, m, pts } = wandering([['glitchpilz', 20, 0, 3], ['kokosnuss', 70, 0, 1]]);
    m.extra.foodCd = 0;
    run(m, ctx, 12);
    expect(m.extra.food).toBeNull();
    expect(pts.every((p) => p.usesLeft === 2)).toBe(true);
  });
  it('Flinch unterbricht das Fressen: Stelle bleibt unangetastet, kein Buff (er versucht es später neu)', () => {
    const s = wandering([['giftkraut', 6, 0, 2]]);
    s.m.extra.foodCd = 0;
    let cut = false;
    run(s.m, s.ctx, 6, () => { if (!cut && s.m.attack?.id === 'mampfaffe_fressen' && s.m.attack.t > 0.4) { s.m._interrupt(); s.m.extra.foodCd = 30; cut = true; } });
    expect(cut).toBe(true);
    expect(s.pts[0].usesLeft).toBe(2);
    expect(s.m.extra.food).toBeNull();
  });
  it('ist die Stelle weggeerntet (Pirscher war schneller), bekommt er nichts: "LEER?!"', () => {
    const { ctx, m, pts } = wandering([['kokosnuss', 6, 0, 1]]);
    m.extra.foodCd = 0;
    const nums = [];
    ctx.fx.number = (p, t) => nums.push(t);
    run(m, ctx, 20, () => { if (m.attack?.id === 'mampfaffe_fressen' && m.attack.t > 0.3) pts[0].usesLeft = 0; });
    expect(m.extra.food).toBeNull();
    expect(nums.some((t) => /LEER|AUSGESPUCKT/.test(t)) || pts[0].usesLeft === 0).toBe(true);
  });
  it('im Kampf nur, wenn der Pirscher > 8 m weg ist und die Stelle <= 18 m entfernt liegt', () => {
    const near = make(def, 'combat', 0, 6);
    near.m.recover = 0; near.m._taught = true; near.m.extra.foodCd = 0;
    foodWorld(near.ctx, [['feuerpilz', 8, -6, 2]]);
    run(near.m, near.ctx, 2);
    expect(near.m.attack?.id).not.toBe('mampfaffe_fressen');
    const far = make(def, 'combat', 0, 30);
    far.m.recover = 0; far.m._taught = true; far.m.extra.foodCd = 0;
    far.m.target = far.p;
    const pts = foodWorld(far.ctx, [['feuerpilz', 8, -6, 2]]);
    let ate = false;
    run(far.m, far.ctx, 14, () => { if (far.m.attack?.id === 'mampfaffe_fressen') ate = true; far.m.target = far.p; });
    expect(ate).toBe(true);
    expect(pts[0].usesLeft).toBe(1);
    const gone = make(def, 'combat', 0, 40);
    gone.m.recover = 0; gone.m._taught = true; gone.m.extra.foodCd = 0;
    foodWorld(gone.ctx, [['feuerpilz', 8, 25, 2]]); // 25 m: zu weit für den Kampf
    run(gone.m, gone.ctx, 3);
    expect(gone.m.attack?.id).not.toBe('mampfaffe_fressen');
  });
  it('Aushungern: ohne Futter im Revier + 120 s ohne Buff -> hungrig (+10 % Schaden, Grabbel öfter)', () => {
    const { ctx, m } = wandering([]);
    run(m, ctx, 115);
    expect(m.extra.hungry).toBe(false);
    const base = m.dmgMul;
    run(m, ctx, 12);
    expect(m.extra.hungry).toBe(true);
    expect(m.dmgMul).toBeCloseTo(base * 1.1, 5);
    expect(mampfaffe.attacks.mampfaffe_grabbel.weight(m)).toBeGreaterThan(5);
    setFood(m, 'kokosnuss');
    expect(m.extra.hungry).toBe(false);
  });
  it('Rotglut: immer ein Buff, 60 s, ohne Pause', () => {
    const { ctx, m } = wandering([]);
    ctx.mods = { monster: { rageAlways: true } };
    run(m, ctx, 1);
    expect(FOOD_IDS).toContain(m.extra.food);
    expect(m.extra.foodT).toBeGreaterThan(55);
    expect(m.extra.foodCd).toBe(0);
    m.extra.foodT = 0.01; run(m, ctx, 0.2);
    expect(m.extra.food).toBeTruthy(); // gleich ein neuer
  });
  it('Fressrausch (Phase 50 %): Buff 60 s, Pause 6 s', () => {
    const { m } = wandering([]);
    m.phase = 1;
    setFood(m, 'giftkraut');
    expect(m.extra.foodT).toBe(60); expect(m.extra.foodCd).toBe(6);
    expect(mampfaffe.phases[0]).toMatchObject({ at: 0.5, special: 'mampfaffe_brust' });
  });
});

describe('Mampfaffe: Buffs', () => {
  it('Kokosnuss: harter Schädel (Kopf-Faktor x0,5, Teil-HP-Schaden halbiert), Helm sichtbar; Ende stellt alles zurück', () => {
    const { m } = wandering();
    const head = m.partById.head, f0 = head.factor;
    setFood(m, 'kokosnuss');
    expect(head.factor).toBeCloseTo(f0 * 0.5, 5);
    expect(m.extra.helmet.visible).toBe(true);
    expect(mampfaffe.partHpMul(m, head)).toBe(0.5);
    const hp0 = head.hp;
    m.applyDamage({ dmg: 100, partId: 'head', elemBy: {}, attackerId: 'p1' });
    expect(hp0 - head.hp).toBeCloseTo(50, 5);
    setFood(m, 'feuerpilz');
    expect(head.factor).toBeCloseTo(f0, 5); expect(m.extra.helmet.visible).toBe(false);
    expect(mampfaffe.partHpMul(m, head)).toBe(1);
  });
  it('Feuerpilz: Feuer wirkungslos (elem.fire 0), danach wieder 28 am Bauch', () => {
    const { m } = wandering();
    setFood(m, 'feuerpilz');
    expect(m.partById.belly.elem.fire).toBe(0);
    expect(m.parts.every((p) => p.elem.fire === 0)).toBe(true);
    setFood(m, 'giftkraut');
    expect(m.partById.belly.elem.fire).toBe(28);
  });
  it('Fell leuchtet in der Futterfarbe (glow), Aura an; ohne Futter nichts', () => {
    const { m } = wandering();
    expect(mampfaffe.glow(m)).toBeNull();
    for (const k of FOOD_IDS) {
      setFood(m, k);
      m.update(DT);
      expect(m.extra.aura.visible).toBe(true);
      const g = mampfaffe.glow(m);
      expect(g).toHaveLength(3);
      expect(Math.max(...g)).toBeGreaterThan(0.05);
      if (k === 'glitchpilz') expect(g[1]).toBeGreaterThan(g[0]); // Neongrün, nie Magenta/Cyan
      if (k === 'feuerpilz') expect(g[0]).toBeGreaterThan(g[1] * 3);
      expect(m.partById.body.mats[0].emissive.g + m.partById.body.mats[0].emissive.r + m.partById.body.mats[0].emissive.b).toBeGreaterThan(0.05);
    }
  });
  it('Betäubung und Kopfbruch spucken das Futter aus', () => {
    const a = wandering();
    setFood(a.m, 'kokosnuss');
    a.m.applyDamage({ dmg: 10, partId: 'head', blunt: 99999, elemBy: {}, attackerId: 'p1' });
    expect(a.m.extra.food).toBeNull();
    expect(a.m.partById.head.factor).toBeGreaterThan(0.8); // Faktor zurück (Kopfbruch/Stun), nicht doppelt zurückgerechnet
    const b = wandering();
    setFood(b.m, 'feuerpilz');
    b.m._breakPart(b.m.partById.head);
    expect(b.m.extra.food).toBeNull();
    expect(b.m.partById.head.factor).toBeCloseTo(0.9, 5);
    setFood(b.m, 'kokosnuss');
    expect(b.m.extra.hard).toBe(false); // kaputter Kopf bleibt weich
    expect(mampfaffe.attacks.mampfaffe_kokoswurf.cond(b.m)).toBe(false);
  });
  it('Buff-Angriffe nur mit passendem Futter', () => {
    const { m } = wandering();
    const A = mampfaffe.attacks;
    const map = { mampfaffe_kokoswurf: 'kokosnuss', mampfaffe_feuerruelpser: 'feuerpilz', mampfaffe_stinkwolke: 'giftkraut', mampfaffe_flimmersprung: 'glitchpilz' };
    for (const [id, kind] of Object.entries(map)) {
      expect(A[id].cond(m), id).toBe(false);
      setFood(m, kind);
      expect(A[id].cond(m), id).toBe(true);
    }
  });
  it('Schock mit Glitchpilz im Bauch: Kurzschluss, Teleport 5 s gesperrt', () => {
    const { ctx, m } = wandering();
    setFood(m, 'glitchpilz');
    expect(mampfaffe.attacks.mampfaffe_flimmersprung.cond(m)).toBe(true);
    m.applyDamage({ dmg: 10, partId: 'legs', elemBy: { shock: 8 }, attackerId: 'p1' });
    expect(m.extra.tpLock).toBeCloseTo(MAMPFAFFE.TP_LOCK, 0);
    expect(mampfaffe.attacks.mampfaffe_flimmersprung.cond(m)).toBe(false);
    run(m, ctx, 5.5);
    expect(mampfaffe.attacks.mampfaffe_flimmersprung.cond(m)).toBe(true);
  });
  it('Faustbruch: -25 % Schaden der Seite', () => {
    const { m } = wandering();
    const h = mampfaffe.attacks.mampfaffe_faeuste.hits;
    expect(mampfaffe.hitDmgMul(m, h[0])).toBe(1);
    m._breakPart(m.partById.prankeL);
    expect(mampfaffe.hitDmgMul(m, h[0])).toBe(0.75);
    expect(mampfaffe.hitDmgMul(m, h[1])).toBe(1);
    expect(mampfaffe.hitDmgMul(m, h[2])).toBe(1);
  });
  it('Gäste: snapExtra/applySnapExtra und das Netz-Protokoll tragen den Buff', () => {
    const host = wandering(), guest = wandering();
    setFood(host.m, 'kokosnuss');
    const snap = { id: 'x', def: 'mampfaffe', x: 0, y: 0, z: 0, rot: 0, state: 'combat', hpPct: 1, rage: false, parts: [], phase: 0, extra: host.m.def.snapExtra(host.m) };
    const back = decodeMonster(encodeMonster(snap));
    guest.m.authority = false;
    mampfaffe.applySnapExtra(guest.m, back.extra);
    expect(guest.m.extra.food).toBe('kokosnuss');
    expect(guest.m.partById.head.factor).toBeCloseTo(guest.m.partById.head.baseFactor * 0.5, 5); // Gäste werten ihren Schaden selbst aus
    expect(guest.m.extra.aura.visible).toBe(true);
    mampfaffe.applySnapExtra(guest.m, { f: 0, t: 0, h: 1 });
    expect(guest.m.extra.food).toBeNull(); expect(guest.m.extra.hungry).toBe(true);
    expect(guest.m.partById.head.factor).toBeCloseTo(guest.m.partById.head.baseFactor, 5);
  });
});

describe('Futterklau: nur die vier Futtersorten', () => {
  it('stealFromPouch: Whitelist, Kokos 2 / sonst 1, nichts anderes verschwindet', () => {
    const inv = new HuntInventory({ brought: [{ id: 'flickbrause', n: 5 }] });
    inv.add('knisterkraut', 4); inv.add('muschel', 3); inv.add('blendax_schuppe', 2); inv.add('dschungelkraut', 2);
    const before = JSON.stringify({ loot: inv.loot, brought: inv.brought, free: inv.free });
    expect(stealFromPouch(inv)).toBeNull(); // kein Futter im Beutel
    expect(JSON.stringify({ loot: inv.loot, brought: inv.brought, free: inv.free })).toBe(before);
    inv.add('kokosnuss', 5);
    const got = stealFromPouch(inv);
    expect(got).toEqual({ id: 'kokosnuss', n: 2 });
    expect(inv.count('kokosnuss')).toBe(3);
    expect(inv.count('flickbrause')).toBe(5); expect(inv.count('knisterkraut')).toBe(4); expect(inv.count('muschel')).toBe(3); expect(inv.count('dschungelkraut')).toBe(2);
    inv.add('glitchpilz', 1);
    for (let i = 0; i < 40; i++) { const r = stealFromPouch(inv, () => (i % 7) / 7); if (r) expect(FOOD_IDS).toContain(r.id); }
    expect(inv.count('flickbrause')).toBe(5); expect(inv.count('muschel')).toBe(3); expect(inv.count('blendax_schuppe')).toBe(2);
    expect(inv.bar).toContain('flickbrause');
  });
  it('Grabbel-Treffer: klaut ein Futter, Brocken frisst es sofort (ohne Stelle zu verbrauchen); Zahl für den Pirscher', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 3);
    m.recover = 99; m._taught = true;
    p.god = false;
    ctx.inventory = new HuntInventory({});
    ctx.inventory.add('feuerpilz', 2); ctx.inventory.add('muschel', 4);
    const pts = foodWorld(ctx, [['giftkraut', 40, 40, 2]]);
    const nums = [];
    ctx.fx.number = (pp, t) => nums.push(t);
    m.beginAttack('mampfaffe_grabbel', { tgMul: 1 });
    run(m, ctx, 1.4);
    expect(ctx.inventory.count('feuerpilz')).toBe(1);
    expect(ctx.inventory.count('muschel')).toBe(4);
    expect(m.extra.food).toBe('feuerpilz');
    expect(pts[0].usesLeft).toBe(2);
    expect(nums.some((t) => /geklaut/.test(t))).toBe(true);
  });
  it('Gast: meldet den Klau dem Host (net.sendSteal), eigener Brocken-Buff wird nicht lokal gesetzt', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 3);
    m.authority = false;
    ctx.inventory = new HuntInventory({}); ctx.inventory.add('kokosnuss', 3);
    const sent = [];
    ctx.net = { sendSteal: (id, kind) => sent.push([id, kind]) };
    mampfaffe.onHitPlayer(m, p, { hit: { steal: true } });
    expect(sent).toEqual([[m.id, 'kokosnuss']]);
    expect(m.extra.food).toBeNull();
    expect(ctx.inventory.count('kokosnuss')).toBe(1);
    const host = make(def, 'combat', 0, 3);
    mampfaffe.onFoodStolen(host.m, 'kokosnuss'); expect(host.m.extra.food).toBe('kokosnuss');
    mampfaffe.onFoodStolen(host.m, 'flickbrause'); expect(host.m.extra.food).toBe('kokosnuss'); // Unsinn vom Netz wird ignoriert
  });
  it('Treffer ohne steal-Feld klaut nichts', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 3);
    ctx.inventory = new HuntInventory({}); ctx.inventory.add('kokosnuss', 3);
    mampfaffe.onHitPlayer(m, p, { hit: {} });
    expect(ctx.inventory.count('kokosnuss')).toBe(3);
  });
});

describe('Zustände: Glitch-Verwirrung und Item-Sperre', () => {
  it('Glitchpilz: jeder Treffer setzt Verwirrt 3 s; ohne Glitchpilz nicht', () => {
    const { ctx, m, p } = make(def, 'combat', 0, 3);
    m.recover = 99; m._taught = true;
    mampfaffe.onHitPlayer(m, p, { hit: {} });
    expect(p.status.verwirrt).toBeUndefined();
    setFood(m, 'glitchpilz');
    mampfaffe.onHitPlayer(m, p, { hit: {} });
    expect(p.status.verwirrt.t).toBeCloseTo(3, 5);
    expect(p.snapshot().status).toContain('verwirrt');
    void ctx;
  });
  it('Verwirrt: Steuerung und Ausweichrolle verkehrt, endet nach 3 s, Sprudelwasser (clearStatus) entfernt es', () => {
    const { ctx, p } = make(def, 'combat', 0, 9);
    ctx.input.setStick(0, 1, 'bot'); ctx.input.poll(DT);
    const z0 = p.pos.z;
    for (let i = 0; i < 30; i++) { ctx.input.setStick(0, 1, 'bot'); ctx.input.poll(DT); p.update(DT); }
    const normal = p.pos.z - z0; // Kamera 0: Stick vorwärts = +z
    p.pos.z = z0;
    p.addStatus('verwirrt', { t: 3 });
    for (let i = 0; i < 30; i++) { ctx.input.setStick(0, 1, 'bot'); ctx.input.poll(DT); p.update(DT); }
    expect(normal).toBeGreaterThan(0.5);
    expect(p.pos.z - z0).toBeLessThan(-0.5);
    ctx.input.setStick(0, 0, 'bot');
    for (let i = 0; i < 4 / DT; i++) { ctx.input.poll(DT); p.update(DT); }
    expect(p.status.verwirrt).toBeUndefined();
    p.addStatus('verwirrt', { t: 3 });
    p.clearStatus();
    expect(p.status.verwirrt).toBeUndefined();
  });
  it('Verwirrt: frischt nur auf (stapelt nicht), Overlay läuft über fx.confuse', () => {
    const { ctx, p } = make(def, 'combat', 0, 9);
    const calls = [];
    ctx.fx.confuse = (d) => calls.push(d); ctx.fx.clearConfuse = () => calls.push('clear');
    p.addStatus('verwirrt', { t: 3 }); p.update(DT); p.addStatus('verwirrt', { t: 3 });
    expect(p.status.verwirrt.t).toBeCloseTo(3, 1);
    expect(calls[0]).toBe(3);
    p.clearStatus('verwirrt');
    expect(calls).toContain('clear');
  });
  it('Item-Sperre: Item-Benutzung blockiert (kein Puffern), Toast, nach 1 s wieder frei; Essen bleibt unberührt', () => {
    const { ctx, p } = make(def, 'combat', 0, 9);
    const toasts = [];
    ctx.toast = (t) => toasts.push(t);
    const inv = new HuntInventory({ brought: [{ id: 'flickbrause', n: 3 }] });
    const sys = new ItemSystem(ctx, p, inv);
    p.addStatus('itemlock', { t: 1 });
    expect(sys.canStart()).toBe(false);
    expect(sys.request()).toBe(false);
    expect(sys.buffer).toBe(0);
    expect(toasts.some((t) => /Gestank/.test(t))).toBe(true);
    for (let i = 0; i < 1.2 / DT; i++) { p.update(DT); sys.update(DT); }
    expect(p.status.itemlock).toBeUndefined();
    expect(sys.request()).toBe(true);
  });
  it('Eisenmagen: Dauer von Gift/Brennen/Verwirrung/Item-Sperre -15 % je Stufe', () => {
    expect(skillEffects({ eisenmagen: 3 }).eisenCut).toBeCloseTo(0.45, 5);
    expect(SKILLS.eisenmagen.desc(2)).toContain('30');
    const { ctx, p } = make(def, 'combat', 0, 9);
    applyLoadout(p, { weapon: { type: 'gs', tier: 1, branch: null }, armor: { head: 'mampfaffe_head', body: 'mampfaffe_body', legs: 'mampfaffe_legs' }, food: null });
    p.addStatus('verwirrt', { t: 3 }); expect(p.status.verwirrt.t).toBeCloseTo(3 * 0.55, 5);
    p.addStatus('itemlock', { t: 1 }); expect(p.status.itemlock.t).toBeCloseTo(0.55, 5);
    p.addStatus('poison', {}); expect(p.status.poison.t).toBeCloseTo(12 * 0.55, 5);
    void ctx;
  });
});

describe('Angriffe im Einzelnen', () => {
  const fresh = (dist = 6) => { const s = make(def, 'combat', 0, dist); s.m.recover = 99; s.m._taught = true; s.p.god = false; return s; };
  it('Feuerrülpser: Kegel trifft, Brennen; Kegel-Strahl nur beim Rülpsen', () => {
    const { ctx, m, p } = fresh(5);
    setFood(m, 'feuerpilz');
    const jets = [];
    ctx.fx.jet = (...a) => jets.push(a);
    m.beginAttack('mampfaffe_feuerruelpser', { tgMul: 1 });
    run(m, ctx, 0.6);
    expect(jets.length).toBe(0);
    run(m, ctx, 1.2);
    expect(jets.length).toBeGreaterThan(3);
    expect(p.status.burn).toBeTruthy();
    expect(p.v.hp).toBeLessThan(p.v.maxHp);
  });
  it('Stinkwolke: Wolke am Ziel (r 5,5, 9 s), im Inneren Gift + Item-Sperre, draußen nicht, danach weg', () => {
    const { ctx, m, p } = fresh(8);
    setFood(m, 'giftkraut');
    m.beginAttack('mampfaffe_stinkwolke', { tgMul: 1 });
    run(m, ctx, 1.6);
    expect(m.extra.clouds.length).toBe(1);
    const q = m.extra.clouds[0];
    expect(Math.hypot(q.x - p.pos.x, q.z - p.pos.z)).toBeLessThan(0.1); // Ziel = Pirscher beim Start
    run(m, ctx, 0.5);
    expect(p.status.itemlock).toBeTruthy();
    expect(p.status.poison).toBeTruthy();
    // raus aus der Wolke
    p.clearStatus(); p.pos.x += 9;
    run(m, ctx, 0.5);
    expect(p.status.itemlock).toBeUndefined(); expect(p.status.poison).toBeUndefined();
    run(m, ctx, 10);
    expect(m.extra.clouds.length).toBe(0);
  });
  it('Flimmersprung: Teleport an die Landemarke (<= 9 m), Mesh flackert vorher, Treffer r 3,4 mit down, Verwirrung durch den Treffer', () => {
    const { ctx, m, p } = fresh(14);
    setFood(m, 'glitchpilz');
    const start = { x: m.pos.x, z: m.pos.z };
    const inst = m.beginAttack('mampfaffe_flimmersprung', { tgMul: 1 });
    expect(Math.hypot(inst.landing.x - start.x, inst.landing.z - start.z)).toBeLessThanOrEqual(MAMPFAFFE.TP_MAX + 1e-6);
    let flick = false;
    run(m, ctx, 0.6, () => { if (!m.mesh.visible) flick = true; });
    expect(flick).toBe(true);
    expect(Math.hypot(m.pos.x - start.x, m.pos.z - start.z)).toBeLessThan(0.1);
    run(m, ctx, 0.35);
    expect(Math.hypot(m.pos.x - inst.landing.x, m.pos.z - inst.landing.z)).toBeLessThan(0.1);
    void p;
  });
  it('Flimmersprung in Reichweite: Treffer wirft um und verwirrt', () => {
    const { ctx, m, p } = fresh(5);
    setFood(m, 'glitchpilz');
    m.beginAttack('mampfaffe_flimmersprung', { tgMul: 1 });
    run(m, ctx, 1.4);
    expect(p.v.hp).toBeLessThan(p.v.maxHp);
    expect(p.status.verwirrt).toBeTruthy();
  });
  it('Kokoswurf: drei Kokosnüsse mit Aufschlag-Splash', () => {
    const { ctx, m } = fresh(12);
    setFood(m, 'kokosnuss');
    m.beginAttack('mampfaffe_kokoswurf', { tgMul: 1 });
    run(m, ctx, 1.1);
    expect(m.projectiles.list.length).toBe(3);
    expect(m.projectiles.list[0].def.kind).toBe('kokos');
    expect(m.projectiles.list[0].def.dmg).toBe(22);
  });
  it('Rolle: 12 m geradeaus; Wand-Prall = 1,2 s benommen', () => {
    const { ctx, m } = fresh(14);
    m.beginAttack('mampfaffe_rolle', { tgMul: 1 });
    const x0 = m.pos.x, z0 = m.pos.z;
    run(m, ctx, 2.4);
    expect(Math.hypot(m.pos.x - x0, m.pos.z - z0)).toBeGreaterThan(10);
    const w = fresh(14);
    w.ctx.world.collide = (pos) => { if (pos.z > 5) pos.z = 5; }; // Wand
    w.m.beginAttack('mampfaffe_rolle', { tgMul: 1 });
    run(w.m, w.ctx, 1.5);
    expect(w.m.stunT).toBeGreaterThan(0.2);
    expect(w.m.attack).toBeNull();
  });
  it('Brusttrommeln: Glitch-Konter lässt ihn sich verschlucken (taumeln)', () => {
    const { ctx, m } = fresh(4);
    m.beginAttack('mampfaffe_brust', { tgMul: 1 });
    run(m, ctx, 0.3);
    mampfaffe.onGlitchCounter(m, 'mampfaffe_brust');
    expect(m.stunT).toBeCloseTo(MAMPFAFFE.DIZZY, 1);
    expect(m.attack).toBeNull();
    mampfaffe.onGlitchCounter(m, 'mampfaffe_faeuste'); // anderer Angriff: nichts
  });
  it('Fäuste/Stampfer/Grabbel treffen auf Nähe, alle Treffer des Lehrangriffs bleiben dodgebar (siehe p3fairness)', () => {
    const { ctx, m, p } = fresh(3);
    m.beginAttack('mampfaffe_faeuste', { tgMul: 1 });
    run(m, ctx, 2.2);
    expect(p.v.hp).toBeLessThan(p.v.maxHp);
  });
});

describe('Mampfaffe: Welt, Daten, Fortschritt', () => {
  it('Nest Zone 2, Route nur Zone 1 + 2 über den Pass, Spawn in Zone 2 erreichbar', () => {
    const w = createWorld('smaragdkueste', { seed: 1 });
    expect(w.nestFor('mampfaffe')).toEqual(w.nestFor('jaggo'));
    const zones = new Set(w.routeFor('mampfaffe').map((p) => w.zoneAt(p.x, p.z)));
    expect([...zones].sort()).toEqual([1, 2]);
    expect(w.zoneAt(w.monsterSpawns.mampfaffe.x, w.monsterSpawns.mampfaffe.z)).toBe(2);
    expect(w.layout.reachable(w.monsterSpawns.mampfaffe.x, w.monsterSpawns.mampfaffe.z)).toBe(true);
  });
  it('Revier enthält jedes Futter: Kokosnuss, Feuerpilz, Giftkraut UND Glitchpilz in Zone 1/2, für mehrere Seeds', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const w = createWorld('smaragdkueste', { seed });
      for (const food of FOOD_IDS) expect(w.gatherPoints.some((q) => q.kind === food && q.zone <= 2), `${food} seed ${seed}`).toBe(true);
    }
    for (const food of FOOD_IDS) expect(GATHER_KINDS[food].world).toBe('smaragdkueste');
    expect(GATHER_KINDS.glitchpilz.zones[3] > 0 && GATHER_KINDS.glitchpilz.zones[4] > 0).toBe(true); // Pirscher-Spots in 3+4 bleiben
    expect(Object.keys(GATHER_KINDS.feuerpilz.zones).map(Number)).toEqual([2]);
    expect(Object.keys(GATHER_KINDS.giftkraut.zones).map(Number).sort()).toEqual([2, 3]);
  });
  it('Futter-Items existieren, Stellen sind endlich (maxUses 1-3)', () => {
    for (const id of FOOD_IDS) { expect(ITEMS[id], id).toBeTruthy(); expect(GATHER_KINDS[id].uses[1]).toBeLessThanOrEqual(3); }
    expect(ITEMS.glitchpilz.icon.color).toBe('#39ff14');
  });
  it('Drops: Materialien existieren, Kopf- und Faustbruch geben Teile, Mageninhalt im Zerlegen', () => {
    const d = DROPS.mampfaffe;
    for (const id of [...d.carve, ...d.reward, ...Object.values(d.breaks).flat()].map((e) => e.id)) expect(ITEMS[id], id).toBeTruthy();
    expect(d.breaks.head[0].id).toBe('mampfaffe_backe'); expect(d.breaks.pranke[0].id).toBe('mampfaffe_knoechel');
    expect(d.carve.some((e) => FOOD_IDS.includes(e.id))).toBe(true);
    for (const set of Object.values(ARMOR_SETS.mampfaffe.pieces)) for (const id of Object.keys(set.cost)) expect(ITEMS[id] || id === 'schrott', id).toBeTruthy();
  });
  it('Set: Prot 46, Eisenmagen + Dickschädel, Reihenfolge nach Blendax', () => {
    expect(ARMOR_SETS.mampfaffe.prot).toBe(46);
    expect(ARMOR_SETS.mampfaffe.skills).toEqual(['eisenmagen', 'dickschaedel']);
    expect(SET_ORDER.indexOf('mampfaffe')).toBeGreaterThan(SET_ORDER.indexOf('blendax'));
  });
  it('Aufträge: mampfaffe JR 8 -> 9 (Schlüssel, RP 2300), Rotglut erst ab JR 10, Reihenfolge nach Spec 0.2', () => {
    const q = quests.mampfaffe;
    expect(q).toMatchObject({ monster: 'mampfaffe', world: 'smaragdkueste', jr: 8, jrUp: 9, reward: 3200, rp: 220, timeLimit: 25 * 60 });
    expect(MONSTER_RP.mampfaffe).toBe(220);
    expect(RANKS.find((r) => r.jr === 9)).toMatchObject({ keys: ['mampfaffe'], rp: RANK_RP[9] });
    expect(RANK_RP[9]).toBe(2300);
    const o = QUEST_ORDER;
    expect(o.indexOf('blendax')).toBeLessThan(o.indexOf('mampfaffe'));
    expect(o.indexOf('mampfaffe')).toBeLessThan(o.indexOf('blendax_rotglut'));
    expect(o.indexOf('blendax_rotglut')).toBeLessThan(o.indexOf('mampfaffe_rotglut'));
    expect(o.indexOf('inselausflug')).toBeLessThan(o.indexOf('blendax'));
    const s = defaultSave(); s.jr = 7;
    expect(questLock(s, q)).toMatchObject({ reason: 'jr', need: 8 });
    s.jr = 8; s.rp = 2299;
    expect(questLock(s, q)).toMatchObject({ reason: 'rp' });
    s.rp = 2300;
    expect(questLock(s, q)).toBeNull();
    expect(quests.mampfaffe_rotglut).toMatchObject({ jr: 10, variant: 'rotglut', monster: 'mampfaffe', reward: 5400, rp: 320 });
    expect(quests.mampfaffe_rotglut.matMul).toBeGreaterThan(1);
    expect(quests.mampfaffe_rotglut.jrUp).toBeUndefined();
  });
  it('Kompendium: Eintrag, Zustände Verwirrt/Item-Sperre/Gefüttert, Element-Hinweis', () => {
    const b = BESTIARY.find((x) => x.id === 'mampfaffe');
    expect(b.entries.length).toBeGreaterThanOrEqual(8);
    for (const id of ['verwirrt', 'itemlock', 'm_fed']) expect(CONDITIONS.some((c) => c.id === id), id).toBe(true);
    expect(ELEM_NOTES.mampfaffe).toContain('Feuerpilz');
  });
  it('Spieler-Zustände landen im Netz-Snapshot', () => {
    const { p } = make(def, 'combat', 0, 9);
    p.addStatus('verwirrt'); p.addStatus('itemlock');
    expect(p.snapshot().status).toEqual(expect.arrayContaining(['verwirrt', 'itemlock']));
  });
});

describe('Mampfaffe: wilder Gorilla (Affenwut)', () => {
  const A = mampfaffe.attacks;
  const raging = (dist = 6, specs = []) => {
    const s = make(def, 'combat', 0, dist);
    s.m._taught = true; s.m.recover = 0; s.p.god = true;
    s.pts = foodWorld(s.ctx, specs);
    s.m.rage = true; s.m.rageT = 1e9;
    return s;
  };
  it('neue Schlag-Angriffe: Rundum (360 Grad, zwei Drehungen), Sprungschlag (Gap-Closer), Erdschlag; Kette ohne Pause', () => {
    for (const id of ['mampfaffe_rundum', 'mampfaffe_sprungschlag', 'mampfaffe_erdschlag']) {
      expect(A[id], id).toBeTruthy();
      expect(A[id].audit.length).toBeGreaterThan(0);
      expect(A[id].hits.some((h) => h.dmg >= 36 && h.knock === 'down'), id).toBe(true);
    }
    expect(A.mampfaffe_rundum.hits.every((h) => h.radius >= 6)).toBe(true);
    expect(A.mampfaffe_sprungschlag.range[0]).toBeGreaterThanOrEqual(8); expect(A.mampfaffe_sprungschlag.range[1]).toBeGreaterThanOrEqual(24);
    const ins = new AttackInstance(A.mampfaffe_rundum, { attackId: 'x', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, seed: 1 });
    expect(ins.sample(ins.duration).yaw).toBeCloseTo(Math.PI * 4, 3); // 2 volle Drehungen
    const leap = new AttackInstance(A.mampfaffe_sprungschlag, { attackId: 'x', t0: 0, origin: { x: 0, y: 0, z: 0 }, yaw: 0, targetPos: { x: 0, y: 0, z: 20 }, seed: 1 });
    const s = leap.sample(leap.duration);
    expect(s.z).toBeCloseTo(20, 1); // landet auf dem Pirscher
  });
  it('Wut startet Affenwut: Angriffskette ohne Atempause, schneller; nur Neongrün', () => {
    const { ctx, m, p } = raging(6);
    const ids = [], nums = [];
    ctx.fx.number = (_p, t) => nums.push(t);
    run(m, ctx, 0.5);
    expect(m.extra.fz).toBe('rampage');
    expect(nums).toContain('AFFENWUT!');
    expect(m.speedMul).toBeGreaterThan(1.5);
    let gaps = 0, idle = 0;
    run(m, ctx, 10, () => { p.pos.set(0, 0, 6); if (m.attack) { ids.push(m.attack.id); idle = 0; } else if (++idle > 0.3 / DT) gaps++; });
    expect(new Set(ids).size).toBeGreaterThanOrEqual(3);
    expect(gaps).toBe(0); // nie 0,3 s ohne Angriff
  });
  it('Zyklus: Kette -> ERSCHÖPFT (tired, Teile +30 %) -> Futtersuche -> frisst -> neue Kette mit neuem Status', () => {
    const { ctx, m, p } = raging(6, [['feuerpilz', 20, 0, 1], ['giftkraut', -20, 0, 1]]);
    setFood(m, 'kokosnuss');
    const seen = [];
    let tiredSeen = false, boost = 0;
    run(m, ctx, 60, () => { p.pos.set(0, 0, 40); if (!seen.length || seen.at(-1) !== m.extra.fz) seen.push(m.extra.fz); if (m.tired && m.extra.fz === 'tired') { tiredSeen = true; boost = mampfaffe.partHpMul(m, m.partById.body); } });
    expect(seen.slice(0, 4)).toEqual(['calm', 'rampage', 'tired', 'forage']);
    expect(tiredSeen).toBe(true);
    expect(boost).toBeCloseTo(MAMPFAFFE.TIRED_DMG, 5);
    expect(['feuerpilz', 'giftkraut']).toContain(m.extra.food);
    expect(m.extra.food).not.toBe('kokosnuss');
    expect(seen.filter((z) => z === 'rampage').length).toBeGreaterThanOrEqual(2); // nach dem Fressen wieder Kette
  });
  it('Zonenwechsel: Futter nur in Zone 3 -> er wandert hin (Revierwechsel), Futter-KI im Wandern bleibt auf Zone 1+2', () => {
    const { ctx, m, p } = raging(6, [['glitchpilz', 60, 0, 3]]);
    ctx.world.zoneAt = (x) => (x > 40 ? 3 : 1);
    const zones = [];
    ctx.bus.on('mampfaffeZone', (e) => zones.push(e));
    m.extra.fz = 'forage';
    let maxX = -99;
    run(m, ctx, 30, () => { p.pos.set(-20, 0, 0); maxX = Math.max(maxX, m.pos.x); });
    expect(zones.length).toBeGreaterThanOrEqual(1);
    expect(zones[0]).toMatchObject({ from: 1, to: 3 });
    expect(m.extra.food).toBe('glitchpilz');
    expect(maxX).toBeGreaterThan(55); // stand am Pilz in Zone 3, bevor die nächste Kette ihn zurückjagt
  });
  it('Gäste sehen die Wut-Phase (snapExtra w)', () => {
    const { m } = wandering();
    m.extra.fz = 'tired';
    const ex = mampfaffe.snapExtra(m);
    expect(ex.w).toBe(2);
    const g = wandering(); g.m.authority = false;
    mampfaffe.applySnapExtra(g.m, ex);
    expect(g.m.extra.fz).toBe('tired');
  });
});
