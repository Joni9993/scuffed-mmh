// Monster registry. Add a monster: create <name>.js exporting a def and add ONE line here.
import { jaggo } from './jaggo.js';
import { jaggling } from './jaggling.js';
import { barrotz } from './barrotz.js';
import { brathalos } from './brathalos.js'; // [M]
import { gorgo } from './gorgo.js'; // [Gorgo]
import { voltaro } from './voltaro.js'; // [V]
import { dummy } from './dummy.js';
import { mampfer, mampferbulle, mampferkalb, hoppler, schlackbock, schlackbullbock, schlackkitz, schrottler, palmbock, palmbockbulle, palmbockkitz, strandhuepfer, dschungelhuepfer } from './mampfer.js'; // [L]
import { kroll } from './kroll.js'; // [Rostwerke]
import { blendax } from './blendax.js'; // [Smaragdküste]
import { mampfaffe } from './mampfaffe.js'; // [Smaragdküste]

export const monsters = {
  jaggo,
  gorgo, // Rostwerke
  dummy, // Trainingspuppe (Übungsplatz)
  jaggling,
  barrotz, // [M]
  brathalos, // [M]
  voltaro, // [V]
  mampfer, mampferbulle, mampferkalb, hoppler, schlackbock, schlackbullbock, schlackkitz, schrottler, // [L] neutral fauna
  palmbock, palmbockbulle, palmbockkitz, strandhuepfer, dschungelhuepfer, // Smaragdküste
  kroll, // [Rostwerke]
  blendax, // [Smaragdküste]
  mampfaffe, // [Smaragdküste]
};

export function getMonsterDef(id) {
  const d = monsters[id];
  if (!d) throw new Error(`unknown monster "${id}"`);
  return d;
}
