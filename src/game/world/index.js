// World registry. A world factory returns the world interface documented in docs/ARCHITECTURE.md
// plus the phase 2 additions: nestFor, routeFor, zoneAt, groundType, gatherPoints, setGatherState, minimap.
import { createTestArena } from './testArena.js';
import { createSchotterklamm } from './schotterklamm.js';

export const worlds = {
  test: createTestArena,
  arena: createTestArena, // ?world=arena
  schotterklamm: createSchotterklamm,
};

/** Fill in the phase 2 interface for simple worlds (the test arena) so callers never have to special-case. */
function withDefaults(w) {
  w.zoneAt ??= () => 1;
  w.groundType ??= () => 'grass';
  w.nestFor ??= () => ({ ...(w.nestPoint ?? { x: 0, z: 0 }) });
  w.routeFor ??= (id) => [w.nestFor(id), { ...(w.monsterSpawns?.[id] ?? w.monsterSpawns?.default ?? { x: 0, z: 0 }) }];
  w.gatherPoints ??= [];
  w.setGatherState ??= () => false;
  w.zoneName ??= () => w.name ?? '';
  return w;
}

/** createWorld(id, { seed }) – seed is the hunt seed (gather points are deterministic from it; terrain is fixed). */
export function createWorld(id, opts = {}) {
  const f = worlds[id];
  if (!f) throw new Error(`unknown world "${id}"`);
  return withDefaults(f(opts));
}
