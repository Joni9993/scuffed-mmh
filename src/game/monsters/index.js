// Monster registry. Add a monster: create <name>.js exporting a def and add ONE line here.
import { jaggo } from './jaggo.js';
import { jaggling } from './jaggling.js';
import { barrotz } from './barrotz.js';
import { brathalos } from './brathalos.js'; // [M]
import { mampfer, mampferbulle, mampferkalb, hoppler } from './mampfer.js'; // [L]

export const monsters = {
  jaggo,
  jaggling,
  barrotz, // [M]
  brathalos, // [M]
  mampfer, mampferbulle, mampferkalb, hoppler, // [L] neutral fauna
};

export function getMonsterDef(id) {
  const d = monsters[id];
  if (!d) throw new Error(`unknown monster "${id}"`);
  return d;
}
