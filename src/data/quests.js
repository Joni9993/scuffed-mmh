// Quest data (phase 1: only the test hunt). The meta agent extends this per GDD 8.4.
export const quests = {
  jaggo: { id: 'jaggo', name: 'Jaggos Rudel', monster: 'jaggo', world: 'schotterklamm' /* [K] */, timeLimit: 20 * 60, reward: 300, jr: 1 },
};
export function getQuest(id) {
  const q = quests[id];
  if (!q) throw new Error(`unknown quest "${id}"`);
  return q;
}
