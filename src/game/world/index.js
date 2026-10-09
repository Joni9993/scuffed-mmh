// World registry. A world factory returns the world interface documented in docs/ARCHITECTURE.md.
import { createTestArena } from './testArena.js';

export const worlds = {
  test: createTestArena,
  // schotterklamm: createSchotterklamm,
};

export function createWorld(id) {
  const f = worlds[id];
  if (!f) throw new Error(`unknown world "${id}"`);
  return f();
}
