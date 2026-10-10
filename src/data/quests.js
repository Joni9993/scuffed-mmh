import { resolveMods } from './mutators.js';
// Quest data (GDD 8.4).
//   type      'hunt' (default, kill `monster`) | 'gather' (hand in `gather.n` x `gather.id`, no Brocken)
//   world     key of the world registry (game/world/index.js). Other agents may re-point this to 'schotterklamm'.
//   jr        Jägerrang needed to take the quest      jrUp  Jägerrang you reach by finishing it the first time
//   variant   'rotglut' (Anzeige); mutators: ['id'] feste Mutatoren (data/mutators.js: Preset rotglut = hpMul 1,4, Dauerwut, Beute x2)
//   matMul    optionaler Beute-Faktor des Auftrags (Mutator-reward kommt dazu)
export const quests = {
  kraeuterlauf: {
    id: 'kraeuterlauf', name: 'Kräuterlauf', type: 'gather', monster: null, world: 'schotterklamm', timeLimit: 15 * 60, reward: 100, jr: 1,
    gather: { id: 'knisterkraut', n: 10 },
    desc: 'Sammle 10 Knisterkraut und gib sie ab. Kein Brocken.',
  },
  jaggo: {
    id: 'jaggo', name: 'Jaggos Rudel', type: 'hunt', monster: 'jaggo', world: 'schotterklamm', timeLimit: 20 * 60, reward: 300, jr: 1, jrUp: 2,
    desc: 'Jaggo der Große auf der Wackelwiese. Schnell, ruft Rudel-Verstärkung.',
  },
  barrotz: {
    id: 'barrotz', name: 'Schlamm drüber', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 20 * 60, reward: 500, jr: 2, jrUp: 3,
    desc: 'Barrotz in der Schlammsenke. Schwer, langsam, harte Treffer.',
  },
  brathalos: {
    id: 'brathalos', name: 'Feuer unterm Hintern', type: 'hunt', monster: 'brathalos', world: 'schotterklamm', timeLimit: 20 * 60, reward: 800, jr: 3, jrUp: 4,
    desc: 'Brathalos am Glutkamm. Fliegt und speit Feuer, Fernwaffe hilft.',
  },
  jaggo_rotglut: {
    id: 'jaggo_rotglut', name: 'Rotglut: Jaggo', type: 'hunt', monster: 'jaggo', world: 'schotterklamm', timeLimit: 20 * 60, reward: 600, jr: 4,
    variant: 'rotglut', mutators: ['rotglut'], // hpMul 1,4 + Dauerwut + Beute x2 kommen aus dem Mutator-Preset
    desc: 'Jaggo, dauerwütend, 40 % mehr Leben. Doppelte Materialien.',
  },
  barrotz_rotglut: {
    id: 'barrotz_rotglut', name: 'Rotglut: Barrotz', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 20 * 60, reward: 900, jr: 4,
    variant: 'rotglut', mutators: ['rotglut'], // hpMul 1,4 + Dauerwut + Beute x2 kommen aus dem Mutator-Preset
    desc: 'Barrotz, dauerwütend, 40 % mehr Leben.',
  },
  brathalos_rotglut: {
    id: 'brathalos_rotglut', name: 'Rotglut: Brathalos', type: 'hunt', monster: 'brathalos', world: 'schotterklamm', timeLimit: 20 * 60, reward: 1400, jr: 4,
    variant: 'rotglut', mutators: ['rotglut'], // hpMul 1,4 + Dauerwut + Beute x2 kommen aus dem Mutator-Preset
    desc: 'Brathalos, dauerwütend, 40 % mehr Leben.',
  },
};
// Feste Mutatoren eines Auftrags liefern seinen Beute-Faktor (progression.js liest quest.matMul).
for (const q of Object.values(quests)) if (q.mutators?.length) q.matMul = (q.matMul ?? 1) * resolveMods(q.mutators).reward;
export const QUEST_ORDER = ['kraeuterlauf', 'jaggo', 'barrotz', 'brathalos', 'jaggo_rotglut', 'barrotz_rotglut', 'brathalos_rotglut'];

export function getQuest(id) {
  const q = quests[id];
  if (!q) throw new Error(`unknown quest "${id}"`);
  return q;
}
/** Quests in board order (only ones that exist). */
export const questList = () => QUEST_ORDER.map((id) => quests[id]).filter(Boolean);
