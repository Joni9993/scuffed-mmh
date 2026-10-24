import { afterEach, describe, expect, it } from 'vitest';
import { Session, createHuntChannel } from '../../src/net/session.js';
import { makeHunt } from '../huntFixture.js';
import { captureHunt, restoreHunt, capturePersonal, restorePersonal, validHuntSnapshot } from '../../src/net/huntSnapshot.js';
import { addScorch, addRing } from '../../src/game/monsters/pyrosturHazards.js';
import { addPillar } from '../../src/game/monsters/felsengrollPillars.js';
import { addEcho, addLane, startCage } from '../../src/game/monsters/voltirisEchoes.js';
import { addSlime } from '../../src/game/monsters/krachfaust.js';
import { defaultSave, sanitize } from '../../src/meta/save.js';
import { applyHuntLeave, applyHuntResult, buildRewards } from '../../src/meta/progression.js';
import { getQuest } from '../../src/data/quests.js';
import { createRng } from '../../src/core/rng.js';

const hunts = [];
function hunt() {
  const s = new Session({ name: 'Tester' }), st = { postId: 'test-round', hostId: 'p0', members: ['p0'] };
  const h = makeHunt(createHuntChannel(s, { hostId: 'p0', members: st.members, roundId: st.postId }), st, s.profile);
  hunts.push(h); return h;
}
afterEach(() => { for (const h of hunts.splice(0)) { h.net.dispose(); for (const m of h.monsters) m.dispose?.(); } });
const wire = d => JSON.parse(JSON.stringify(d));

describe('Authoritative hunt bootstrap snapshots', () => {
  for (const id of ['jaggo', 'barrotz', 'brathalos', 'gorgo', 'voltaro', 'kroll', 'blendax', 'mampfaffe', 'krachfaust', 'pyrostur', 'felsengroll', 'voltiris', 'gockelok']) {
    it(`${id}: restores exact HP, broken parts, state and the current attack without replaying past events`, () => {
      const host = hunt(), guest = hunt(), m = host.spawnMonster(id, { id: 'boss', x: 12, z: 18, state: 'combat' });
      m.hp = Math.floor(m.maxHp * .43); m.phase = 1; m.time = 17; m.st.poisonT = 6;
      const part = m.parts.find(p => p.breakHp); if (part) { part.broken = true; part.hp = 0; }
      const attack = Object.values(m.def.attacks).find(a => !a.cond);
      if (attack) m.startAttack({ attackId: attack.id, t0: 5, origin: { x: 12, y: 0, z: 18 }, targetPos: { x: 12, y: 0, z: 23 }, yaw: 0, seed: 7 }, 1.2);
      const state = wire(captureHunt(host)); expect(validHuntSnapshot(state)).toBe(true); expect(restoreHunt(guest, state)).toBe(true);
      const restored = guest.monsters.find(m => m.id === 'boss');
      expect(restored.hp).toBe(m.hp); expect(restored.maxHp).toBe(m.maxHp); expect(restored.st.poisonT).toBe(6); expect(restored.phase).toBe(1);
      expect(restored.parts.map(p => p.broken)).toEqual(m.parts.map(p => p.broken));
      if (m.attack) { expect(restored.attack.t).toBe(1.2); expect([...restored.attack.inst.firedEvents].every(e => e.t <= restored.attack.inst.tau(1.2))).toBe(true); }
    });
  }
  it('restores lingering hazards, hit ledgers and Voltiris echoes with their original object binding', () => {
    const host = hunt(), guest = hunt();
    const p = host.spawnMonster('pyrostur', { id: 'pyro', x: 10, z: 10 }); p.time = 10;
    addScorch(p, 9, 8); addRing(p, 8, 7, {}); p.extra.hazards.scorch[0].next.set('p0', 12); p.extra.hazards.rings[0].hit.add('p0');
    const f = host.spawnMonster('felsengroll', { id: 'fels', x: 10, z: 10 }); addPillar(f, 15, 16);
    const k = host.spawnMonster('krachfaust', { id: 'krach', x: 10, z: 10 }); addSlime(k, 12, 12);
    const v = host.spawnMonster('voltiris', { id: 'volt', x: 10, z: 10 }); addEcho(v, 15, 16); addLane(v, 0, 0, 10, 10); startCage(v, { x: 10, z: 10 });
    const remote = guest.spawnMonster('voltiris', { id: 'volt', x: 10, z: 10 }), bound = remote.extra.volt;
    restoreHunt(guest, wire(captureHunt(host)));
    expect(guest.monsters.find(m => m.id === 'pyro').extra.hazards.scorch[0].next.get('p0')).toBe(12);
    expect(guest.monsters.find(m => m.id === 'pyro').extra.hazards.rings[0].hit.has('p0')).toBe(true);
    expect(guest.monsters.find(m => m.id === 'fels').extra.pillars).toHaveLength(1);
    expect(guest.monsters.find(m => m.id === 'krach').extra.slimes).toHaveLength(1);
    expect(remote.extra.volt).toBe(bound); expect(bound.echoes).toHaveLength(1); expect(bound.lanes).toHaveLength(1); expect(bound.cage).toBeTruthy();
    expect(remote.hurtParts().some(p => p.part.id.startsWith('echo'))).toBe(true);
  });
  it('constructs the eye arena when joining Gockelok’s already active final form', () => {
    const host = hunt(), guest = hunt(), m = host.spawnMonster('gockelok', { id: 'gockelok', x: 30, z: 35 });
    m.gockelForm = 'eye'; m.formTime = 32; m.hp = 1000; host.player.netAway = guest.player.netAway = true;
    restoreHunt(guest, wire(captureHunt(host)));
    const remote = guest.monsters.find(m => m.id === 'gockelok'); expect(remote.eyeArena).toBeTruthy(); expect(remote.eyeArena.center.x).toBe(450); expect(remote.gockelForm).toBe('eye');
  });
  it('keeps shared loadout/chest fields, consumed supplies, special charge and carve counts across JSON', () => {
    const h = hunt(); h.meta.chest.weapon = h.loadout.weapon; h.inventory.consume('flickbrause', 4); h.player.v.hp = 17; h.player.voltCharge = { n: 2, countdown: 0 }; h.stats.kos = 1;
    h.meta.rng(); const rngState = h.meta.rng.state();
    const d = wire(capturePersonal(h, 'test-round', 11));
    expect(d.chest.weapon).toEqual(d.loadout.weapon); h.inventory.free.flickbrause = 50; h.player.v.hp = 100; h.meta.rng();
    expect(restorePersonal(h, d)).toBe(true); expect(h.player.v.hp).toBe(17); expect(h.inventory.count('flickbrause')).toBe(1); expect(h.player.voltCharge.n).toBe(2); expect(h.stats.kos).toBe(1); expect(h.meta.rng.state()).toBe(rngState);
  });
});

describe('Exactly-once hunt settlement after reconnect', () => {
  it('books a result once, including rewards, spent items, rank points and statistics', () => {
    const s = defaultSave(), q = getQuest('jaggo'); s.box.flickbrause = 9;
    const rewards = buildRewards({ quest: q, result: 'win', used: { flickbrause: 2 }, rng: createRng(1) });
    applyHuntResult(s, q, rewards, { roundId: 'round-1', time: 120 }); const once = wire(s);
    expect(applyHuntResult(s, q, rewards, { roundId: 'round-1', time: 120 }).duplicate).toBe(true); expect(s).toEqual(once);
    applyHuntLeave(s, { roundId: 'round-1', used: { flickbrause: 2 } }); expect(s).toEqual(once);
  });
  it('books abandonment once and retains the bounded ledger through save sanitization', () => {
    const s = defaultSave(); s.box.flickbrause = 9;
    applyHuntLeave(s, { roundId: 'round-2', used: { flickbrause: 2 }, gathered: { eisenerz: 1 } }); const once = wire(s);
    applyHuntLeave(s, { roundId: 'round-2', used: { flickbrause: 2 }, gathered: { eisenerz: 1 } }); expect(s).toEqual(once);
    expect(sanitize(s).settledHunts).toEqual(['round-2']); expect(sanitize({ ...s, settledHunts: [...Array.from({ length: 80 }, (_, i) => `r-${i}`), null, '<bad>'] }).settledHunts).toHaveLength(64);
  });
});
