// Monster registry. Add a monster: create <name>.js exporting a def and add ONE line here.
import { jaggo } from './jaggo.js';
import { jaggling } from './jaggling.js';

export const monsters = {
  jaggo,
  jaggling,
  // barrotz, brathalos ...
};

export function getMonsterDef(id) {
  const d = monsters[id];
  if (!d) throw new Error(`unknown monster "${id}"`);
  return d;
}
