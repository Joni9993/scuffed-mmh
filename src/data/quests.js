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
// Smaragdküste-Auftrag: Sammelausflug an Strand und Dschungel.
Object.assign(quests, {
  inselausflug: {
    id: 'inselausflug', name: 'Inselausflug', type: 'gather', monster: null, world: 'smaragdkueste', timeLimit: 15 * 60, reward: 700, rp: 40, jr: 7,
    gather: { id: 'kokosnuss', n: 8 },
    desc: 'Sammle 8 Kokosnüsse an der Smaragdküste und gib sie ab. Kein Brocken.',
  },
});
// Smaragdküste-Brocken (docs/SMARAGD_BROCKEN.md 0.2): Blendax ist der Schlüssel-Auftrag für JR 8 (Voltaro -> JR 7 öffnet die Karte).
Object.assign(quests, {
  blendax: {
    id: 'blendax', name: 'Flimmern im Dschungel', type: 'hunt', monster: 'blendax', world: 'smaragdkueste', timeLimit: 25 * 60, reward: 3000, rp: 200, jr: 7, jrUp: 8,
    desc: 'Blendax im Dschungel. Sein Schirm flackert, dann blitzt er: nicht hinsehen! Schock auf den Schirm schließt ihn kurz.',
  },
  mampfaffe: {
    id: 'mampfaffe', name: 'Der Fressfeind', type: 'hunt', monster: 'mampfaffe', world: 'smaragdkueste', timeLimit: 25 * 60, reward: 3200, rp: 220, jr: 8, jrUp: 9,
    desc: 'Der Mampfaffe frisst sich durch Strand und Dschungel und wird von jedem Happen ein anderer Brocken. Sein Fell zeigt dir, was er zuletzt gegessen hat. Ernte das Futter vor ihm!',
  },
  krachfaust: {
    id: 'krachfaust', name: 'Krach im Tempel', type: 'hunt', monster: 'krachfaust', world: 'smaragdkueste', timeLimit: 30 * 60, reward: 5200, rp: 300, jr: 9, jrUp: 10,
    desc: 'Krachfaust haust im Verfluchten Tempel und prügelt alles, was hereinkommt. Sein Schleim pulsiert, dann knallt er: abrollen! Am Ende lädt er auf und sprengt die ganze Plattform: hinter eine hohe Säule!',
  },
  mampfaffe_rotglut: {
    id: 'mampfaffe_rotglut', name: 'Rotglut: Mampfaffe', type: 'hunt', monster: 'mampfaffe', world: 'smaragdkueste', timeLimit: 25 * 60, reward: 5400, rp: 320, jr: 10,
    variant: 'rotglut', mutators: ['rotglut'],
    desc: 'Mampfaffe, dauerwütend, 40 % mehr Leben und immer satt: ein Futter-Buff ist immer an. Doppelte Materialien.',
  },
  blendax_rotglut: {
    id: 'blendax_rotglut', name: 'Rotglut: Blendax', type: 'hunt', monster: 'blendax', world: 'smaragdkueste', timeLimit: 25 * 60, reward: 5100, rp: 290, jr: 10,
    variant: 'rotglut', mutators: ['rotglut'],
    desc: 'Blendax, dauerwütend, 40 % mehr Leben. Doppelte Materialien.',
  },
  krachfaust_rotglut: {
    id: 'krachfaust_rotglut', name: 'Rotglut: Krachfaust', type: 'hunt', monster: 'krachfaust', world: 'smaragdkueste', timeLimit: 30 * 60, reward: 8800, rp: 440, jr: 10,
    variant: 'rotglut', mutators: ['rotglut'],
    desc: 'Krachfaust, dauerwütend, 40 % mehr Leben: die Runen glühen von Anfang an, der Schleim zündet schneller und es gibt ZWEI Urknalle (bei 12 % und 5 %). Doppelte Materialien.',
  },
  // Revierstreit der Smaragdküste (wie der Revierstreit von Karte 1): die drei Smaragd-Brocken gegeneinander, je 65 % HP, kein Rang-Aufstieg.
  revierstreit_smaragd: {
    id: 'revierstreit_smaragd', name: 'Revierstreit: Smaragd', type: 'hunt', monster: 'blendax', world: 'smaragdkueste', timeLimit: 30 * 60, reward: 7500, rp: 400, jr: 10,
    monsters: [{ id: 'blendax', hpMul: 0.65 }, { id: 'mampfaffe', hpMul: 0.65 }, { id: 'krachfaust', hpMul: 0.65 }], multi: 'revier',
    desc: 'Blendax, Mampfaffe und Krachfaust streiten ums Revier. Nutzt den Kampf: nach einer Minute oder bei zu viel Druck jagen sie euch gemeinsam.',
  },
  // Glitchgrat: Sammelausflug in luftige Höhen
  gratausflug: {
    id: 'gratausflug', name: 'Gratausflug', type: 'gather', monster: null, world: 'glitchgrat', timeLimit: 15 * 60, reward: 1200, rp: 60, jr: 10,
    gather: { id: 'glitchgrat_erz', n: 8 },
    desc: 'Erkunde den windigen Glitchgrat und bringe 8 Brocken Grat-Erz zurück. Kein Brocken.',
  },
  pyrostur: {
    id: 'pyrostur', name: 'Der Glutsturm', type: 'hunt', monster: 'pyrostur', world: 'glitchgrat',
    timeLimit: 25 * 60, reward: 6000, rp: 350, jr: 10, jrUp: 11,
    desc: 'Der Kesseldrache herrscht über den Weltenkamm. Lies seinen Druck, umspiele die Ablässe und brich sein Ventil.',
  },
  felsengroll: {
    id: 'felsengroll', name: 'Groll der Berge', type: 'hunt', monster: 'felsengroll', world: 'glitchgrat',
    timeLimit: 25 * 60, reward: 6500, rp: 400, jr: 11, jrUp: 12,
    desc: 'Auf dem Erzplateau grollt es. Halte die Schlackebahnen frei; Schulter und Schweifkeule bestimmen seine sicheren Flanken.',
  },
  voltiris: {
    id: 'voltiris', name: 'Gewitter am Abgrund', type: 'hunt', monster: 'voltiris', world: 'glitchgrat',
    timeLimit: 25 * 60, reward: 7000, rp: 450, jr: 12, jrUp: 13,
    desc: 'Eine Prismawyvern zerlegt die Blitzschlucht in leuchtende Bahnen. Der echte Körper hat Augen. Seine Nachbilder nicht.',
  },
  gockelok: {
    id: 'gockelok', name: 'Das Kikeriki des Untergangs', type: 'hunt', monster: 'gockelok', world: 'glitchgrat',
    timeLimit: 30 * 60, reward: 12000, rp: 600, jr: 13, jrUp: 14,
    desc: 'EIL-DEKRET: Etwas Uraltes ist auf dem Weltenkamm erwacht. Der letzte Auftrag. Bring Mut. Und vielleicht Paniermehl.',
  },
});
// Feste Mutatoren eines Auftrags liefern seinen Beute-Faktor (progression.js liest quest.matMul).
for (const q of Object.values(quests)) if (q.mutators?.length) q.matMul = (q.matMul ?? 1) * resolveMods(q.mutators).reward;
export const QUEST_ORDER = ['kraeuterlauf', 'jaggo', 'barrotz', 'brathalos', 'jaggo_rotglut', 'barrotz_rotglut', 'brathalos_rotglut'];

QUEST_ORDER.push('rostiger_ausflug', 'kroll', 'gorgo', 'voltaro', 'kroll_rotglut', 'gorgo_rotglut', 'voltaro_rotglut', 'inselausflug', 'blendax', 'mampfaffe', 'krachfaust', 'blendax_rotglut', 'mampfaffe_rotglut', 'krachfaust_rotglut', 'revierstreit_smaragd', 'gratausflug'); // Reihenfolge nach Spec 0.2: Schlüssel-Aufträge, dann alle Rotglut, zuletzt der Revierstreit


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
QUEST_ORDER.push('pyrostur', 'felsengroll', 'voltiris', 'gockelok');
/** Wochen-Feldstudie (meta/fieldstudy.js) meldet sich hier an; nicht in QUEST_ORDER (das Brett zeigt sie separat oben). */
export function setFieldStudyQuest(q) { quests.feldstudie = q; }

/** Basis-RP je Brocken (Feldstudie-Berechnung). */
export const MONSTER_RP = { jaggo: 40, barrotz: 60, brathalos: 80, kroll: 130, gorgo: 130, voltaro: 180, blendax: 200, mampfaffe: 220, krachfaust: 300, pyrostur: 350, felsengroll: 400, voltiris: 450, gockelok: 600 };
/** RP-Schwelle je Zielrang (Schlüssel-Auftrag). progression.js baut daraus RANKS. */
export const RANK_RP = { 2: 0, 3: 100, 4: 250, 5: 450, 6: 800, 7: 1200, 8: 1700, 9: 2300, 10: 3000, 11: 3000, 12: 3350, 13: 3750, 14: 4200 };
