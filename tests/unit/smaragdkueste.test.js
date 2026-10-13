import { describe, it, expect, beforeAll } from 'vitest';
import { createWorld } from '../../src/game/world/index.js';
import { getNav } from '../../src/game/monsters/nav.js';
import { GATHER_KINDS } from '../../src/data/gather.js';
import { getQuest, questList } from '../../src/data/quests.js';

let w, L;
beforeAll(() => { w = createWorld('smaragdkueste', { seed: 1 }); L = w.layout; });

describe('smaragdkueste', () => {
  it('has 4 zones, sand on the beach, flat stone temple top', () => {
    expect(w.id).toBe('smaragdkueste');
    expect([w.zoneAt(-60, -60), w.zoneAt(-60, 60), w.zoneAt(60, 60), w.zoneAt(60, -60)]).toEqual([1, 2, 3, 4]);
    expect(w.groundType(-60, -60)).toBe('sand');
    expect(w.groundType(65, -65)).toBe('stone');
    expect(w.heightAt(65, -65)).toBeGreaterThan(w.heightAt(65, 60) + 3);
    expect(w.minimap.data.length).toBe(w.minimap.size * w.minimap.size * 4);
  });
  it('is one linear path: camp, all nests, routes and spawns are reachable', () => {
    expect(L.reachable(w.campPoint.x, w.campPoint.z)).toBe(true);
    for (const n of Object.values(L.nests)) expect(L.reachable(n.x, n.z)).toBe(true);
    for (const r of Object.values(L.routes)) for (const p of r) expect(L.reachable(p.x, p.z)).toBe(true);
    expect(L.reachable(65, -40)).toBe(true);
    expect(w.nestFor('voltaro')).toEqual(L.nests[4]);
    expect(w.routeFor('kroll').length).toBeGreaterThan(3);
  });
  it('arena on the temple is a large open flat area', () => {
    let free = 0, n = 0;
    for (let x = 45; x <= 85; x += 2) for (let z = -85; z <= -45; z += 2) { n++; if (L.walkable(x, z, 2)) free++; }
    expect(free / n).toBeGreaterThan(0.95);
    expect(getNav(w)).toBeTruthy();
  });
  it('places its gather kinds only in the intended zones', () => {
    const kinds = Object.entries(GATHER_KINDS).filter(([, d]) => d.world === 'smaragdkueste');
    expect(kinds.length).toBe(5);
    for (const [kind, d] of kinds) for (const p of w.gatherPoints.filter((q) => q.kind === kind)) expect(Object.keys(d.zones).map(Number)).toContain(p.zone);
    expect(w.gatherPoints.length).toBeGreaterThan(20);
    expect(getQuest('inselausflug').world).toBe('smaragdkueste');
    expect(getQuest('inselausflug').jr).toBe(7); // Voltaro-Sieg schaltet die Karte frei
    expect(getQuest('inselausflug').jrUp).toBeUndefined();
    expect(getQuest('rostiger_ausflug').jr).toBe(5);
    expect(questList().map((q) => q.id).indexOf('rostiger_ausflug')).toBeLessThan(questList().map((q) => q.id).indexOf('kroll'));
  });
});
