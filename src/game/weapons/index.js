// Weapon registry. Add a weapon: create <name>.js exporting a def and add ONE line here.
import { greatsword } from './greatsword.js';
import { dualblades } from './dualblades.js'; // [W]
import { bow } from './bow.js'; // [W]
import { katana } from './katana.js'; // [KT]

export const weapons = {
  gs: greatsword,
  db: dualblades, // [W]
  bow, // [W]
  kt: katana, // [KT]
};

export function getWeapon(id) {
  const w = weapons[id];
  if (!w) throw new Error(`unknown weapon "${id}"`);
  return w;
}
