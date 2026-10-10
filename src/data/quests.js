import { resolveMods } from './mutators.js';
// Quest data (GDD 8.4).
//   type      'hunt' (default, kill `monster`) | 'gather' (hand in `gather.n` x `gather.id`, no Brocken)
//   world     key of the world registry (game/world/index.js). Other agents may re-point this to 'schotterklamm'.
//   rp        Rang-Punkte pro Sieg (Basis; Mutatoren/Feldstudie skalieren in huntmeta/fieldstudy)
//   jr        Jägerrang needed to take the quest      jrUp  Jägerrang you reach by finishing it the first time
//   variant   'rotglut' (Anzeige); mutators: ['id'] feste Mutatoren (data/mutators.js: Preset rotglut = hpMul 1,4, Dauerwut, Beute x2)
//   matMul    optionaler Beute-Faktor des Auftrags (Mutator-reward kommt dazu)
export const quests = {
  kraeuterlauf: {
    id: 'kraeuterlauf', name: 'Kräuterlauf', type: 'gather', monster: null, world: 'schotterklamm', timeLimit: 15 * 60, reward: 100, rp: 20, jr: 1,
    gather: { id: 'knisterkraut', n: 10 },
    desc: 'Sammle 10 Knisterkraut und gib sie ab. Kein Brocken.',
  },
  jaggo: {
    id: 'jaggo', name: 'Jaggos Rudel', type: 'hunt', monster: 'jaggo', world: 'schotterklamm', timeLimit: 20 * 60, reward: 300, rp: 40, jr: 1, jrUp: 2,
    desc: 'Jaggo der Große auf der Wackelwiese. Schnell, ruft Rudel-Verstärkung.',
  },
  barrotz: {
    id: 'barrotz', name: 'Schlamm drüber', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 20 * 60, reward: 500, rp: 60, jr: 2, jrUp: 3,
    desc: 'Barrotz in der Schlammsenke. Schwer, langsam, harte Treffer.',
  },
  brathalos: {
    id: 'brathalos', name: 'Feuer unterm Hintern', type: 'hunt', monster: 'brathalos', world: 'schotterklamm', timeLimit: 20 * 60, reward: 800, rp: 80, jr: 3, jrUp: 4,
    desc: 'Brathalos am Glutkamm. Fliegt und speit Feuer, Fernwaffe hilft.',
  },
  jaggo_rotglut: {
    id: 'jaggo_rotglut', name: 'Rotglut: Jaggo', type: 'hunt', monster: 'jaggo', world: 'schotterklamm', timeLimit: 20 * 60, reward: 600, rp: 60, jr: 4,
    variant: 'rotglut', mutators: ['rotglut'], // hpMul 1,4 + Dauerwut + Beute x2 kommen aus dem Mutator-Preset
    desc: 'Jaggo, dauerwütend, 40 % mehr Leben. Doppelte Materialien.',
  },
  barrotz_rotglut: {
    id: 'barrotz_rotglut', name: 'Rotglut: Barrotz', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 20 * 60, reward: 900, rp: 90, jr: 4,
    variant: 'rotglut', mutators: ['rotglut'], // hpMul 1,4 + Dauerwut + Beute x2 kommen aus dem Mutator-Preset
    desc: 'Barrotz, dauerwütend, 40 % mehr Leben.',
  },
  brathalos_rotglut: {
    id: 'brathalos_rotglut', name: 'Rotglut: Brathalos', type: 'hunt', monster: 'brathalos', world: 'schotterklamm', timeLimit: 20 * 60, reward: 1400, rp: 120, jr: 4,
    variant: 'rotglut', mutators: ['rotglut'], // hpMul 1,4 + Dauerwut + Beute x2 kommen aus dem Mutator-Preset
    desc: 'Brathalos, dauerwütend, 40 % mehr Leben.',
  },
  // Übungsplatz (Dorf: Trainingspuppe). hidden: nicht im Auftragsbrett, kein Rang, keine Belohnung, kein Zeitlimit.
  training: {
    id: 'training', name: 'Übungsplatz', type: 'hunt', monster: 'dummy', world: 'arena', timeLimit: 3600, reward: 0, rp: 0, jr: 0,
    hidden: true, training: true,
    desc: 'Trainingspuppe: Leisten füllen sich dauernd, Glitch-Energie sehr schnell.',
  },
};
// Rostwerke-Aufträge (GDD 15.8). JR: Revierstreit -> 5, Kroll/Gorgo -> 6, Voltaro -> 7.
Object.assign(quests, {
  kroll: {
    id: 'kroll', name: 'Rauch am Horizont', type: 'hunt', monster: 'kroll', world: 'rostwerke', timeLimit: 20 * 60, reward: 1500, rp: 130, jr: 5, jrUp: 6,
    desc: 'Kroll der Kesselkrebs in der Kesselhalle. Panzer brechen, Dampf meiden.',
  },
  gorgo: {
    id: 'gorgo', name: 'Was da gräbt', type: 'hunt', monster: 'gorgo', world: 'rostwerke', timeLimit: 20 * 60, reward: 1600, rp: 130, jr: 5, jrUp: 6,
    desc: 'Gorgo der Schlackwurm auf den Schlackehalden. Gräbt sich ein, zieht an.',
  },
  voltaro: {
    id: 'voltaro', name: 'Der Funkenfürst', type: 'hunt', monster: 'voltaro', world: 'rostwerke', timeLimit: 25 * 60, reward: 2600, rp: 180, jr: 6, jrUp: 7,
    desc: 'Voltaro auf der Turbinenkrone. Lädt an Blitzableitern, Kamm brechen.',
  },
  rostiger_ausflug: {
    id: 'rostiger_ausflug', name: 'Rostiger Ausflug', type: 'gather', monster: null, world: 'rostwerke', timeLimit: 15 * 60, reward: 400, rp: 30, jr: 5,
    gather: { id: 'kupferdraht', n: 8 },
    desc: 'Sammle 8 Kupferdraht in den Rostwerken und gib sie ab. Kein Brocken.',
  },
  kroll_rotglut: {
    id: 'kroll_rotglut', name: 'Rotglut: Kroll', type: 'hunt', monster: 'kroll', world: 'rostwerke', timeLimit: 20 * 60, reward: 2600, rp: 200, jr: 7,
    variant: 'rotglut', mutators: ['rotglut'],
    desc: 'Kroll, dauerwütend, 40 % mehr Leben. Doppelte Materialien.',
  },
  gorgo_rotglut: {
    id: 'gorgo_rotglut', name: 'Rotglut: Gorgo', type: 'hunt', monster: 'gorgo', world: 'rostwerke', timeLimit: 20 * 60, reward: 2800, rp: 210, jr: 7,
    variant: 'rotglut', mutators: ['rotglut'],
    desc: 'Gorgo, dauerwütend, 40 % mehr Leben.',
  },
  voltaro_rotglut: {
    id: 'voltaro_rotglut', name: 'Rotglut: Voltaro', type: 'hunt', monster: 'voltaro', world: 'rostwerke', timeLimit: 25 * 60, reward: 4400, rp: 260, jr: 7,
    variant: 'rotglut', mutators: ['rotglut'],
    desc: 'Voltaro, dauerwütend, 40 % mehr Leben.',
  },
});
// Feste Mutatoren eines Auftrags liefern seinen Beute-Faktor (progression.js liest quest.matMul).
for (const q of Object.values(quests)) if (q.mutators?.length) q.matMul = (q.matMul ?? 1) * resolveMods(q.mutators).reward;
export const QUEST_ORDER = ['kraeuterlauf', 'jaggo', 'barrotz', 'brathalos', 'jaggo_rotglut', 'barrotz_rotglut', 'brathalos_rotglut'];

QUEST_ORDER.push('kroll', 'gorgo', 'rostiger_ausflug', 'voltaro', 'kroll_rotglut', 'gorgo_rotglut', 'voltaro_rotglut');

export function getQuest(id) {
  const q = quests[id];
  if (!q) throw new Error(`unknown quest "${id}"`);
  return q;
}
/** Quests in board order (only ones that exist). */
export const questList = () => QUEST_ORDER.map((id) => quests[id]).filter((q) => q && !q.hidden);

// ---- Phase 3: Multi-Jagd + Feldstudie-Hook
// Revierstreit (Schlüssel-Auftrag JR 4 -> 5): Barrotz + Jaggo, je 65 % HP, bekämpfen sich erst gegenseitig (game/revier.js).
quests.revierstreit = {
  id: 'revierstreit', name: 'Revierstreit', type: 'hunt', monster: 'barrotz', world: 'schotterklamm', timeLimit: 25 * 60, reward: 1500, rp: 110, jr: 4, jrUp: 5,
  monsters: [{ id: 'barrotz', hpMul: 0.65 }, { id: 'jaggo', hpMul: 0.65 }], multi: 'revier',
  desc: 'Barrotz und Jaggo streiten ums Revier. Nutzt den Kampf - nach einer Minute oder bei zu viel Druck jagen sie euch gemeinsam.',
};
QUEST_ORDER.push('revierstreit');
/** Wochen-Feldstudie (meta/fieldstudy.js) meldet sich hier an; nicht in QUEST_ORDER (das Brett zeigt sie separat oben). */
export function setFieldStudyQuest(q) { quests.feldstudie = q; }

/** Basis-RP je Brocken (Feldstudie-Berechnung). */
export const MONSTER_RP = { jaggo: 40, barrotz: 60, brathalos: 80, kroll: 130, gorgo: 130, voltaro: 180 };
/** RP-Schwelle je Zielrang (Schlüssel-Auftrag). progression.js baut daraus RANKS. */
export const RANK_RP = { 2: 0, 3: 100, 4: 250, 5: 450, 6: 800, 7: 1200 };
