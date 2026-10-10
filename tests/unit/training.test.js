import { describe, it, expect, beforeEach } from 'vitest';
import { getQuest, quests, questList, QUEST_ORDER } from '../../src/data/quests.js';
import { getMonsterDef } from '../../src/game/monsters/index.js';
import { Monster } from '../../src/game/monsters/monster.js';
import { Player } from '../../src/game/player.js';
import { createBus } from '../../src/core/events.js';
import { createInput } from '../../src/input/input.js';
import { createRng } from '../../src/core/rng.js';
import { time } from '../../src/core/time.js';
import { resolveMods } from '../../src/data/mutators.js';
import { STATIONS, stationById, pickStation, collideTown } from '../../src/game/town/layout.js';
import { newTrain, trainRefill, trainHit, trainTick, TRAIN_GLITCH_RATE } from '../../src/game/training.js';
import { GLITCH, glitchReady, activateGlitch } from '../../src/game/glitch.js';
import { buildRewards } from '../../src/meta/progression.js';

const DT = 1 / 60;
function ctxOf() {
  return {
    world: { heightAt: () => 0, collide: () => {}, nestPoint: { x: 40, z: 0 } },
    monsters: [], players: [], bus: createBus(), input: createInput(), rng: createRng(1), cameraYaw: 0,
    fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, marker() {}, clearMarker() {} },
    playerHit() {}, respawn() {}, countMonsters: () => 0, spawnMonster() {}, mods: resolveMods([]),
  };
}
beforeEach(() => time.reset());

describe('Übungsplatz: Quest', () => {
  it('training ist hidden, nicht im Auftragsbrett, kein Rang', () => {
    const q = getQuest('training');
    expect(q.hidden).toBe(true); expect(q.training).toBe(true); expect(q.monster).toBe('dummy'); expect(q.world).toBe('arena');
    expect(q.jr).toBe(0); expect(q.jrUp).toBeUndefined();
    expect(QUEST_ORDER).not.toContain('training');
    expect(questList().map((x) => x.id)).not.toContain('training');
    expect(Object.keys(quests)).toContain('training');
  });
  it('keine Belohnung (Auftragsgeld 0)', () => {
    expect(quests.training.reward).toBe(0);
    const r = buildRewards({ quest: quests.training, result: 'fail', gathered: [], carved: [], breaks: [], used: {}, chest: null, rng: createRng(1) });
    expect(r.money ?? 0).toBe(0);
  });
});

describe('Übungsplatz: Trainingspuppe', () => {
  it('greift nie an und stirbt nie', () => {
    const ctx = ctxOf();
    const m = new Monster(getMonsterDef('dummy'), ctx, { id: 'dummy', x: 0, z: 0, state: 'combat', seed: 3 });
    ctx.monsters.push(m);
    const p = new Player({ ctx }); p.spawnAt(0, 4, Math.PI); ctx.players.push(p); m.target = p;
    const hp0 = p.v.hp;
    for (let i = 0; i < 600; i++) { m.update(DT); expect(m.attack).toBeNull(); }
    expect(p.v.hp).toBe(hp0); expect(m.pos.x).toBe(0); expect(m.pos.z).toBe(0);
    for (let i = 0; i < 300; i++) { // 300 Treffer à 500 Schaden
      m.applyDamage({ dmg: 500, partId: 'head', elemDmg: 0, blunt: 5, attackerId: 'p1' });
      m.update(DT);
      expect(m.alive).toBe(true);
    }
    expect(m.hp).toBeGreaterThan(0);
    expect(m.attack).toBeNull();
    expect(m.parts.map((x) => x.id)).toEqual(['head', 'body', 'arms']);
  });
});

describe('Übungsplatz: Leisten', () => {
  it('Glitch-Energie füllt sich schnell (<= 6 s), HP/Puste/Wucht dauernd voll', () => {
    const ctx = ctxOf();
    const p = new Player({ ctx }); p.spawnAt(0, 0, 0); ctx.players.push(p);
    p.v.hp = 10; p.v.stamina = 0; p.v.exhaust = 3; p.weapon.wucht = 0;
    let t = 0;
    while (!glitchReady(p) && t < 10) { trainRefill(p, DT); t += DT; }
    expect(t).toBeLessThanOrEqual(6);
    expect(t).toBeCloseTo(GLITCH.MAX / TRAIN_GLITCH_RATE, 0);
    expect(p.v.hp).toBe(p.v.maxHp); expect(p.v.stamina).toBe(p.v.maxStamina); expect(p.v.exhaust).toBe(0);
    expect(p.weapon.wucht).toBeGreaterThan(0);
    expect(activateGlitch(p)).toBe(true);
    const e = p.glitch.energy;
    trainRefill(p, 1); // im Modus wird nicht zusätzlich aufgefüllt
    expect(p.glitch.energy).toBe(e);
  });
  it('DPS- und Combo-Zähler', () => {
    const t = newTrain();
    for (let i = 0; i < 5; i++) { trainHit(t, i * 0.5, 100); trainTick(t, i * 0.5); }
    expect(t.combo).toBe(5); expect(t.best).toBe(5); expect(t.dps).toBeCloseTo(50);
    trainTick(t, 3.5); expect(t.combo).toBe(0);
    trainTick(t, 20); expect(t.dps).toBe(0);
    expect(t.best).toBe(5);
  });
});

describe('Übungsplatz: Dorf-Station', () => {
  it('Station Trainingspuppe existiert, ist erreichbar und blockiert nichts', () => {
    const s = stationById('training');
    expect(s).toBeTruthy(); expect(STATIONS.filter((x) => x.id === 'training')).toHaveLength(1);
    expect(pickStation(s.x, s.z)?.id).toBe('training');
    const pt = { x: s.x, z: s.z }; collideTown(pt, 0.4);
    expect(Math.hypot(pt.x - s.x, pt.z - s.z)).toBeLessThan(0.05);
  });
});
