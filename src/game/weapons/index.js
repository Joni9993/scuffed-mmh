// Weapon registry. Add a weapon: create <name>.js exporting a def and add ONE line here.
import { greatsword } from './greatsword.js';
import { dualblades } from './dualblades.js'; // [W]
import { bow } from './bow.js'; // [W]
import { katana } from './katana.js'; // [KT]
import { glitchaxt } from './glitchaxt.js'; // [GA]
import { krachkiste } from './krachkiste.js'; // [KK]
import { armbrust } from './armbrust.js'; // [LB]
import { withTranscendence } from '../gear/transcendence.js';

export const weapons = {
  gs: withTranscendence(greatsword, 'gs'),
  db: withTranscendence(dualblades, 'db'),
  bow: withTranscendence(bow, 'bow'),
  kt: withTranscendence(katana, 'kt'),
  ga: withTranscendence(glitchaxt, 'ga'),
  kk: withTranscendence(krachkiste, 'kk'),
  lb: withTranscendence(armbrust, 'lb'),
};

export function getWeapon(id) {
  const w = weapons[id];
  if (!w) throw new Error(`unknown weapon "${id}"`);
  return w;
}
