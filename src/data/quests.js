// Quest data (GDD 8.4).
//   type      'hunt' (default, kill `monster`) | 'gather' (hand in `gather.n` x `gather.id`, no Brocken)
//   world     key of the world registry (game/world/index.js). Other agents may re-point this to 'schotterklamm'.
//   jr        Jägerrang needed to take the quest      jrUp  Jägerrang you reach by finishing it the first time
//   variant   'rotglut' -> Brocken starts in permanent Rotglut with hpMul x HP; matMul multiplies all material drops
export const quests = {
  kraeuterlauf: {
    id: 'kraeuterlauf', name: 'Kräuterlauf', type: 'gather', monster: null, world: 'schotterklamm', timeLimit: 15 * 60, reward: 100, jr: 1,
    gather: { id: 'knisterkraut', n: 10 },
    desc: 'Sammle 10 Knisterkraut und gib sie ab. Kein Brocken, nur Büsche. Meistens.',
  },
  jaggo: {
    id: 'jaggo', name: 'Jaggos Rudel', type: 'hunt', monster: 'jaggo', world: 'schotterklamm', timeLimit: 20 * 60, reward: 300, jr: 1, jrUp: 2,
    desc: 'Jaggo der Große terrorisiert die Wackelwiese. Er ist laut, schnell und hat Freunde.',
  },
  barrotz: {
    id: 'barrotz', name: 'Schlamm drüber', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 20 * 60, reward: 500, jr: 2, jrUp: 3,
    desc: 'Barrotz wälzt sich durch die Schlammsenke. Aufwand: hoch. Sauberkeit: keine.',
  },
  brathalos: {
    id: 'brathalos', name: 'Feuer unterm Hintern', type: 'hunt', monster: 'brathalos', world: 'schotterklamm', timeLimit: 20 * 60, reward: 800, jr: 3, jrUp: 4,
    desc: 'Brathalos brütet am Glutkamm. Bring etwas gegen Fliegendes mit.',
  },
  jaggo_rotglut: {
    id: 'jaggo_rotglut', name: 'Rotglut: Jaggo', type: 'hunt', monster: 'jaggo', world: 'schotterklamm', timeLimit: 20 * 60, reward: 600, jr: 4,
    variant: 'rotglut', hpMul: 1.4, rage: 'always', matMul: 2,
    desc: 'Jaggo, dauerwütend, 40 % zäher. Doppelte Materialien für doppelte Nerven.',
  },
  barrotz_rotglut: {
    id: 'barrotz_rotglut', name: 'Rotglut: Barrotz', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 20 * 60, reward: 900, jr: 4,
    variant: 'rotglut', hpMul: 1.4, rage: 'always', matMul: 2,
    desc: 'Barrotz, dauerwütend, 40 % zäher. Der Schlamm kocht.',
  },
  brathalos_rotglut: {
    id: 'brathalos_rotglut', name: 'Rotglut: Brathalos', type: 'hunt', monster: 'brathalos', world: 'schotterklamm', timeLimit: 20 * 60, reward: 1400, jr: 4,
    variant: 'rotglut', hpMul: 1.4, rage: 'always', matMul: 2,
    desc: 'Brathalos, dauerwütend, 40 % zäher. Sag nicht, wir hätten dich nicht gewarnt.',
  },
};
export const QUEST_ORDER = ['kraeuterlauf', 'jaggo', 'barrotz', 'brathalos', 'jaggo_rotglut', 'barrotz_rotglut', 'brathalos_rotglut'];

export function getQuest(id) {
  const q = quests[id];
  if (!q) throw new Error(`unknown quest "${id}"`);
  return q;
}
/** Quests in board order (only ones that exist). */
export const questList = () => QUEST_ORDER.map((id) => quests[id]).filter(Boolean);
