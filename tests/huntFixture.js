import * as THREE from 'three';
import { createBus } from '../src/core/events.js';
import { createInput } from '../src/input/input.js';
import { createRng } from '../src/core/rng.js';
import { Player } from '../src/game/player.js';
import { Monster } from '../src/game/monsters/monster.js';
import { getMonsterDef } from '../src/game/monsters/index.js';
import { HuntInventory } from '../src/game/inventory.js';
import { HuntChest } from '../src/meta/huntChest.js';
import { defaultSave } from '../src/meta/save.js';
import { buildLoadout } from '../src/meta/loadout.js';
import { createHuntReport } from '../src/game/huntReport.js';
import { HuntNet } from '../src/net/sync.js';
import { getQuest } from '../src/data/quests.js';
import { applyCoopScale } from '../src/game/monsters/coopScale.js';

export function makeHunt(channel, descriptor, profile) {
  const save = defaultSave(), loadout = buildLoadout(save);
  const players = descriptor.members.map((id, slot) => ({ id, slot, name: channel.session.member(id)?.name ?? id, weapon: 'gs', tier: 1 }));
  const h = {
    opts: { players, net: channel, coop: true }, bus: createBus(), input: createInput(), rng: createRng(7), loadout, quest: getQuest('jaggo'), time: 33, timeLeft: 1167, teamKo: 0, result: null,
    players: [], monsters: [], scene: new THREE.Scene(), fx: { number() {}, spark() {}, shake() {}, flash() {}, glitch() {}, clearMarker() {} },
    hud: { center() {}, connection() {} }, rig: { snap() {} }, app: { touch: { setVisible() {} } },
    world: { spawnPoints: [{ x: 0, z: 0, yaw: 0 }, { x: 2, z: 0, yaw: 0 }], campPoint: { x: 0, z: 0 }, heightAt: () => 0, collide() {}, gatherPoints: [{ id: 'g1', usesLeft: 1 }], setGatherState(id, n) { this.gatherPoints.find(p => p.id === id).usesLeft = n; } },
    interact: { state: () => [['valve', 80, 1, 2, 0]], applyState(s) { this.received = s; } }, effects: { snapshot: () => [], restore() {} }, groundingZones: [], stats: { damage: 0, hits: 0, perfect: 0, kos: 0, glitchDmg: 0, rolls: 0 }, teamplay: { summary: () => [] },
    netKo() { this.teamKo++; }, netFinish(result, reason) { this.result = result; this.reason = reason; }, netAbort(reason) { this.result = 'abort'; this.reason = reason; }, countMonsters: () => 0,
    applyCoopScale() { for (const m of this.monsters) applyCoopScale(m, this.players.length); },
  };
  h.player = new Player({ id: channel.myId, name: profile.name, ctx: h }); h.players.push(h.player);
  h.inventory = new HuntInventory({ brought: [{ id: 'flickbrause', n: 3 }], free: { flickbrause: 2 } });
  h.meta = { phase: 'fight', corpses: [], breaks: [], carveT: 0, endT: 0, carveCount: 0, rng: createRng(99), chest: new HuntChest(save, h.inventory, loadout), items: { heals: [], buffs: [], glitchCooldown: 0 }, applyGear(lo) { h.loadout = lo; } };
  h.report = createHuntReport(h);
  h.spawnMonster = (id, opts) => { const m = new Monster(getMonsterDef(id), h, opts); h.monsters.push(m); h.scene.add(m.mesh, m.shadow); return m; };
  h.mainMonster = h.spawnMonster('jaggo', { id: 'jaggo', x: 20, z: 20, seed: 1, state: 'combat' }); h.bosses = [h.mainMonster];
  h.net = new HuntNet(h, channel, { players, joining: !!descriptor.lateJoin }); h.applyCoopScale();
  return h;
}
