// Monster registry. Add a monster: create <name>.js exporting a def and add ONE line here.
import { jaggo } from './jaggo.js';
import { jaggling } from './jaggling.js';
import { barrotz } from './barrotz.js';
import { brathalos } from './brathalos.js'; // [M]
import { dummy } from './dummy.js';
import { mampfer, mampferbulle, mampferkalb, hoppler } from './mampfer.js'; // [L]
import { kroll } from './kroll.js'; // [Rostwerke]

export const monsters = {
  jaggo,
  dummy, // Trainingspuppe (Übungsplatz)
  jaggling,
  barrotz, // [M]
  brathalos, // [M]
  mampfer, mampferbulle, mampferkalb, hoppler, // [L] neutral fauna
  kroll, // [Rostwerke]
};

export function getMonsterDef(id) {
  const d = monsters[id];
  if (!d) throw new Error(`unknown monster "${id}"`);
  return d;
}
