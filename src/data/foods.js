// Kochtopf (GDD 7.1). One meal per hunt. cost: schrott + optional items.
// effect keys are applied by game/loadout.js: maxHp, maxStamina, atk (+fraction), resist (poison/burn), itemSpeed (use time -fraction)
export const FOODS = {
  eintopf: { id: 'eintopf', name: 'Schotter-Eintopf', desc: '+25 Max-HP. Besteht zu 40 % aus Schotter.', cost: { schrott: 50 }, effect: { maxHp: 25 } },
  pustebrei: { id: 'pustebrei', name: 'Pustebrei', desc: '+25 Max-Puste. Klebt innen an den Lungen.', cost: { schrott: 50 }, effect: { maxStamina: 25 } },
  glutgulasch: { id: 'glutgulasch', name: 'Glutgulasch', desc: '+10 % Angriff. Brennt beidseitig.', cost: { schrott: 80, glutbrocken: 1 }, effect: { atk: 0.1 } },
  pilzpfanne: { id: 'pilzpfanne', name: 'Pilzpfanne', desc: '+15 % Gift-/Brenn-Resistenz, Items 20 % schneller.', cost: { schrott: 60, wabbelpilz: 1 }, effect: { resist: 0.15, itemSpeed: 0.2 } },
};
export const FOOD_ORDER = ['eintopf', 'pustebrei', 'glutgulasch', 'pilzpfanne'];
export const getFood = (id) => FOODS[id] ?? null;
