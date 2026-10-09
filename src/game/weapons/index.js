// Weapon registry. Add a weapon: create <name>.js exporting a def and add ONE line here.
import { greatsword } from './greatsword.js';

export const weapons = {
  gs: greatsword,
  // db: dualblades,
  // bow: bow,
};

export function getWeapon(id) {
  const w = weapons[id];
  if (!w) throw new Error(`unknown weapon "${id}"`);
  return w;
}
