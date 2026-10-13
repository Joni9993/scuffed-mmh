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
    expect(kinds.length).toBe(8); // + Feuerpilz, Giftkraut, Glitchpilz (Futter des Mampfaffen)
    for (const [kind, d] of kinds) for (const p of w.gatherPoints.filter((q) => q.kind === kind)) expect(Object.keys(d.zones).map(Number)).toContain(p.zone);
    expect(w.gatherPoints.length).toBeGreaterThan(20);
    // Mampfaffe-Revier (Zone 1 + 2) enthaelt jedes Futter, das er frisst
    for (const food of ['kokosnuss', 'feuerpilz', 'giftkraut', 'glitchpilz']) expect(w.gatherPoints.some((q) => q.kind === food && q.zone <= 2), food).toBe(true);
    expect(getQuest('inselausflug').world).toBe('smaragdkueste');
    expect(getQuest('inselausflug').jr).toBe(7); // Voltaro-Sieg schaltet die Karte frei
    expect(getQuest('inselausflug').jrUp).toBeUndefined();
    expect(getQuest('rostiger_ausflug').jr).toBe(5);
    expect(questList().map((q) => q.id).indexOf('rostiger_ausflug')).toBeLessThan(questList().map((q) => q.id).indexOf('kroll'));
  });
  it('Tempel-Saeulen (Krachfaust-Urknall): >= 6 hohe Saeulen, Deckungs-Check Strecke gegen Kreis, Bruch verbraucht die Saeule, Runen/Licht-Haken', () => {
    const t = w.temple, c = t.c;
    expect(c).toEqual({ x: 65, z: -65 });
    expect(t.pillars.length).toBeGreaterThanOrEqual(6);
    for (const p of t.pillars) { expect(p.h).toBeGreaterThanOrEqual(6); expect(p.r).toBeCloseTo(1.15); expect(p.broken).toBe(false); expect(p.mesh.visible).toBe(true); expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(26); }
    const p = t.pillars[0], d = Math.hypot(p.x - c.x, p.z - c.z), k = (d + 4) / d;
    const behind = { x: c.x + (p.x - c.x) * k, z: c.z + (p.z - c.z) * k }; // 4 m hinter der Saeule, von der Mitte aus gesehen
    expect(w.coverBetween(c, behind)).toBe(p);
    expect(w.coverBetween(c, { x: c.x + 10, z: c.z + 3 })).toBeNull(); // kurze Strecke ohne Saeule
    const side = { x: behind.x - (p.z - c.z) / d * 6, z: behind.z + (p.x - c.x) / d * 6 }; // 6 m seitlich: nicht mehr gedeckt
    expect(w.coverBetween(c, side)).not.toBe(p);
    expect(w.coverBetween(behind, c)).toBe(p); // Richtung egal
    expect(w.coverBetween(c, { x: c.x + (p.x - c.x) * 0.5, z: c.z + (p.z - c.z) * 0.5 })).toBeNull(); // Pirscher VOR der Saeule ist nicht gedeckt
    expect(w.breakPillar(p)).toBe(true);
    expect(p.broken).toBe(true); expect(p.mesh.visible).toBe(false);
    expect(w.breakPillar(p)).toBe(false); // nur einmal
    expect(w.coverBetween(c, behind)).toBeNull(); // verbraucht
    w.setRuneGlow('#b8ff1a', 1.4); w.setRuneGlow(null, 1); w.pulse(1.4); w.pulse(1);
  });
});
