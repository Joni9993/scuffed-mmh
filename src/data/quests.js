// Quest data (phase 1: only the test hunt). The meta agent extends this per GDD 8.4.
export const quests = {
  jaggo: { id: 'jaggo', name: 'Jaggos Rudel', monster: 'jaggo', world: 'test', timeLimit: 20 * 60, reward: 300, jr: 1 },
  // [M] phase-2 test hunts (?scene=hunt&quest=barrotz | brathalos); the meta agent owns the real quest board
  barrotz: { id: 'barrotz', name: 'Schlamm drüber', monster: 'barrotz', world: 'test', timeLimit: 20 * 60, reward: 500, jr: 2 },
  brathalos: { id: 'brathalos', name: 'Feuer unterm Hintern', monster: 'brathalos', world: 'test', timeLimit: 20 * 60, reward: 800, jr: 3 },
};
export function getQuest(id) {
  const q = quests[id];
  if (!q) throw new Error(`unknown quest "${id}"`);
  return q;
}
