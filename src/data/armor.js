// Armor sets (GDD 8.2). Three slots per set. Piece id = `${set}_${slot}`.
// Protection of the hunter = sum of the three pieces; damage reduction = prot / (prot + 80)  (game/combat.js protectReduction).
export const SLOTS = ['head', 'body', 'legs'];
export const SLOT_NAMES = { head: 'Kopf', body: 'Körper', legs: 'Beine' };

// Macken (skills). Each worn piece of a set gives +1 level of the set's skill(s); levels are capped at `max`.
export const SKILLS = {
  zaehe_socke: { id: 'zaehe_socke', name: 'Zähe Socke', max: 3, desc: (l) => `+${15 * l} Max-Puste` },
  flinkfuss: { id: 'flinkfuss', name: 'Flinkfuß', max: 2, desc: (l) => `Rolle: +${40 * l} ms i-Frames` },
  dickschaedel: { id: 'dickschaedel', name: 'Dickschädel', max: 3, desc: (l) => (l >= 3 ? 'Kein Zucken, kein Umwerfen' : l >= 2 ? 'Kein Zucken' : 'Ab Stufe 2: kein Zucken') },
  wuchtkopf: { id: 'wuchtkopf', name: 'Wuchtkopf', max: 3, desc: (l) => `+${8 * l} % Krit-Chance` },
  hitzefell: { id: 'hitzefell', name: 'Hitzefell', max: 3, desc: (l) => `Feuer-Resistenz ${Math.round(100 * (1 - 0.8 ** l))} %` },
};

const set = (id, name, prot, skills, pieces) => ({ id, name, prot, skills, pieces });
const piece = (name, cost, skills) => ({ name, cost, skills });

export const ARMOR_SETS = {
  lumpen: set('lumpen', 'Lumpen', 5, [], {
    head: piece('Lumpenkappe', null, {}), body: piece('Lumpenhemd', null, {}), legs: piece('Lumpenhose', null, {}),
  }),
  knochenkram: set('knochenkram', 'Knochenkram', 12, ['zaehe_socke'], {
    head: piece('Knochenkappe', { schrott: 100, altknochen: 2, grossknochen: 1 }, { zaehe_socke: 1 }),
    body: piece('Knochenweste', { schrott: 150, altknochen: 4, grossknochen: 2 }, { zaehe_socke: 1 }),
    legs: piece('Knochenhosen', { schrott: 120, altknochen: 3, grossknochen: 1 }, { zaehe_socke: 1 }),
  }),
  jaggo: set('jaggo', 'Jaggo', 18, ['flinkfuss'], {
    head: piece('Jaggo-Kopfputz', { schrott: 300, jaggo_schuppe: 3, jaggo_kamm: 1 }, { flinkfuss: 1 }),
    body: piece('Jaggo-Panzer', { schrott: 350, jaggo_schuppe: 4, jaggo_fell: 3 }, { flinkfuss: 1 }),
    legs: piece('Jaggo-Stiefel', { schrott: 300, jaggo_schuppe: 3, jaggo_fell: 2 }, { flinkfuss: 1 }),
  }),
  barrotz: set('barrotz', 'Barrotz', 24, ['dickschaedel'], {
    head: piece('Barrotz-Schädel', { schrott: 400, barrotz_kruste: 3, barrotz_platte: 1 }, { dickschaedel: 1 }),
    body: piece('Barrotz-Harnisch', { schrott: 450, barrotz_kruste: 5, barrotz_schwanzleder: 2 }, { dickschaedel: 1 }),
    legs: piece('Barrotz-Beinlinge', { schrott: 400, barrotz_kruste: 3, barrotz_schwanzleder: 2 }, { dickschaedel: 1 }),
  }),
  brathalos: set('brathalos', 'Brathalos', 28, ['wuchtkopf', 'hitzefell'], {
    head: piece('Brathalos-Haube', { schrott: 600, brathalos_schuppe: 3, brathalos_membran: 1 }, { wuchtkopf: 1, hitzefell: 1 }),
    body: piece('Brathalos-Mieder', { schrott: 700, brathalos_schuppe: 4, glutsack: 1, brathalos_membran: 2 }, { wuchtkopf: 1, hitzefell: 1 }),
    legs: piece('Brathalos-Treter', { schrott: 600, brathalos_schuppe: 3, brathalos_membran: 1 }, { wuchtkopf: 1, hitzefell: 1 }),
  }),
};
export const SET_ORDER = ['lumpen', 'knochenkram', 'jaggo', 'barrotz', 'brathalos'];

export const pieceId = (set, slot) => `${set}_${slot}`;
const index = {};
for (const s of Object.values(ARMOR_SETS)) for (const slot of SLOTS) index[pieceId(s.id, slot)] = { id: pieceId(s.id, slot), set: s.id, slot, setName: s.name, prot: s.prot, ...s.pieces[slot] };
export const ARMOR_PIECES = index;
export const getPiece = (id) => ARMOR_PIECES[id] ?? null;
export const DEFAULT_ARMOR = { head: 'lumpen_head', body: 'lumpen_body', legs: 'lumpen_legs' };
