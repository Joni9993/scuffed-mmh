// Item definitions (GDD 6.1, 7, 8.3). Pure data, German texts.
// kind: 'material' (gathered/carved, only ever stored) | 'consumable' (item bar) | 'ammo' (bow tips, item bar)
// max   = how many may be carried into a hunt (consumables). Materials: 99.
// time  = use time in seconds (committing animation). applyAt = fraction of `time` at which the effect lands.
// effect = what game/items.js does. icon = 8x8 pixel shape (ui/hubIcons.js) + colour.
// value = Schrott a surplus piece is worth when the box (99 per item) overflows.

export const BOX_MAX = 99;

const mat = (id, name, desc, shape, color, value = 5) => ({ id, name, desc, kind: 'material', max: BOX_MAX, icon: { shape, color }, value });

export const ITEMS = {
  // ---- gathered
  knisterkraut: mat('knisterkraut', 'Knisterkraut', 'Raschelt verdächtig. Grundlage jeder Flickbrause.', 'leaf', '#58d84a', 3),
  blaublatt: mat('blaublatt', 'Blaublatt', 'Schmeckt nach Radiergummi, wirkt trotzdem.', 'leaf', '#4a8cff', 4),
  wabbelpilz: mat('wabbelpilz', 'Wabbelpilz', 'Wackelt auch ohne Wind.', 'shroom', '#e8a0c0', 6),
  stinkmorchel: mat('stinkmorchel', 'Stinkmorchel', 'Riecht, als hätte sie etwas zu verbergen.', 'shroom', '#a0b040', 6),
  schrotterz: mat('schrotterz', 'Schrotterz', 'Erz mit Charakter. Und Rost.', 'ore', '#9a8a7a', 8),
  glimmstein: mat('glimmstein', 'Glimmstein', 'Selten, hübsch und leider nicht essbar.', 'gem', '#6af0ff', 40),
  altknochen: mat('altknochen', 'Altknochen', 'Gehörte mal jemandem. Der braucht ihn nicht mehr.', 'bone', '#e8e0c8', 4),
  grossknochen: mat('grossknochen', 'Großknochen', 'Ein Knochen, der Ansprüche stellt.', 'bone', '#f4ecd0', 10),
  brummkaefer: mat('brummkaefer', 'Brummkäfer', 'Brummt sogar im Beutel.', 'bug', '#c08a30', 5),
  blitzkaefer: mat('blitzkaefer', 'Blitzkäfer', 'Leuchtet grell. Nicht ansehen.', 'bug', '#ffe85a', 7),
  glutbrocken: mat('glutbrocken', 'Glutbrocken', 'Warm. Sehr warm. Bitte nicht in die Hosentasche.', 'ember', '#ff7a30', 10),

  // ---- carved
  jaggo_schuppe: mat('jaggo_schuppe', 'Jaggo-Schuppe', 'Von Jaggo dem Großen. Er will sie nicht zurück.', 'scale', '#5ab04a', 15),
  jaggo_fell: mat('jaggo_fell', 'Jaggo-Fell', 'Kratzt, hält aber warm.', 'fur', '#b08a50', 15),
  jaggo_kamm: mat('jaggo_kamm', 'Jaggo-Kamm', 'Der Stolz des Rudelführers. Jetzt dein Besitz.', 'crest', '#ff5a3a', 60),
  jaggling_schuppe: mat('jaggling_schuppe', 'Jaggling-Schuppe', 'Klein, aber vorlaut.', 'scale', '#8ad070', 6),
  barrotz_kruste: mat('barrotz_kruste', 'Barrotz-Kruste', 'Getrockneter Schlamm mit Selbstbewusstsein.', 'scale', '#8a6a4a', 20),
  barrotz_platte: mat('barrotz_platte', 'Barrotz-Platte', 'Hartnäckig. Wie der Besitzer.', 'plate', '#b0a090', 50),
  barrotz_schwanzleder: mat('barrotz_schwanzleder', 'Barrotz-Schwanzleder', 'Zäh, riecht nach nassem Hund.', 'fur', '#7a5a3a', 25),
  brathalos_schuppe: mat('brathalos_schuppe', 'Brathalos-Schuppe', 'Immer noch lauwarm.', 'scale', '#e0502a', 30),
  brathalos_membran: mat('brathalos_membran', 'Brathalos-Membran', 'Flügelhaut. Dünn, aber nicht billig.', 'fur', '#d06a4a', 45),
  glutsack: mat('glutsack', 'Glutsack', 'Hier drin wohnt das Feuer.', 'ember', '#ff9a2a', 55),
  brathalos_rubin: mat('brathalos_rubin', 'Brathalos-Rubin', 'Extrem selten. Extrem rot. Extrem teuer.', 'gem', '#ff2a4a', 250),

  // ---- [L] neutral fauna drops (Mampfer / Hoppler)
  rohfleisch: mat('rohfleisch', 'Rohfleisch', 'Roh, rosa und leicht vorwurfsvoll. Dringend braten.', 'meat', '#e0607a', 7),
  mampfer_fell: mat('mampfer_fell', 'Mampfer-Fell', 'Zottelig, warm und riecht nach Wiese.', 'fur', '#c9a878', 18),

  // ---- Rostwerke (GDD 15.7): gathered + Brocken materials
  kupferdraht: mat('kupferdraht', 'Kupferdraht', 'Leitet Strom, Ärger und gelegentlich Funken.', 'ore', '#d08a50', 8),
  schlacke: mat('schlacke', 'Schlacke', 'Erstarrter Hüttenabfall. Knirscht beim Anfassen.', 'ore', '#6a5a52', 5),
  rostkaefer: mat('rostkaefer', 'Rostkäfer', 'Frisst Eisen zum Frühstück. Und zum Mittag.', 'bug', '#c8661e', 6),
  giftschlamm: mat('giftschlamm', 'Giftschlamm', 'Blubbert in giftigem Grün. Nicht probieren.', 'shroom', '#7ac030', 8),
  funkenstein: mat('funkenstein', 'Funkenstein', 'Knistert, wenn man ihn schief anschaut. Selten.', 'gem', '#ffe85a', 45),
  kroll_panzer: mat('kroll_panzer', 'Kroll-Panzer', 'Verbeult, verrußt, unkaputtbar. Fast.', 'plate', '#a0522d', 40),
  kroll_schere: mat('kroll_schere', 'Kroll-Schere', 'Zwickt noch. Vorsicht.', 'crest', '#c8661e', 45),
  kroll_auge: mat('kroll_auge', 'Kroll-Auge', 'Glimmt wie ein ausgebrannter Kessel.', 'gem', '#ff8a3a', 70),
  gorgo_segment: mat('gorgo_segment', 'Gorgo-Segment', 'Ein Stück Schlackwurm. Immer noch warm.', 'scale', '#6a5a52', 40),
  gorgo_zahn: mat('gorgo_zahn', 'Gorgo-Zahn', 'Zermahlt Stahl. Und Hoffnung.', 'bone', '#d8d0b8', 50),
  gorgo_kern: mat('gorgo_kern', 'Gorgo-Kern', 'Glüht tief im Inneren. Sehr selten.', 'ember', '#ff5a2a', 120),
  voltaro_kamm: mat('voltaro_kamm', 'Voltaro-Kamm', 'Knistert vor Spannung.', 'crest', '#5ad8ff', 90),
  voltaro_spule: mat('voltaro_spule', 'Voltaro-Spule', 'Gewickelt von der Natur selbst.', 'ore', '#8ab0ff', 80),
  voltaro_fell: mat('voltaro_fell', 'Voltaro-Fell', 'Statisch aufgeladen. Haare zu Berge.', 'fur', '#9fc8ff', 70),
  voltaro_herz: mat('voltaro_herz', 'Voltaro-Herz', 'Schlägt noch im Takt der Turbinen. Sehr selten.', 'gem', '#ffe14d', 300),

  // ---- consumables
  flickbrause: { id: 'flickbrause', name: 'Flickbrause', desc: '+35 HP über 1 s. Schmeckt nach Pfefferminz und Eisen.', kind: 'consumable', max: 10, time: 0.9, applyAt: 0.45, icon: { shape: 'potion', color: '#58e060' }, value: 8, effect: { type: 'heal', hp: 35, over: 1 } },
  dicke_flickbrause: { id: 'dicke_flickbrause', name: 'Dicke Flickbrause', desc: '+80 HP über 1 s, heilt die Prellung komplett.', kind: 'consumable', max: 5, time: 1.1, applyAt: 0.45, icon: { shape: 'potion', color: '#20c0a0' }, value: 20, effect: { type: 'heal', hp: 80, over: 1, bruise: true } },
  pustekuchen: { id: 'pustekuchen', name: 'Pustekuchen', desc: 'Puste-Verbrauch halbiert für 60 s. Krümelt.', kind: 'consumable', max: 3, time: 1.2, applyAt: 0.5, icon: { shape: 'cake', color: '#ffd84a' }, value: 18, effect: { type: 'stamina', mul: 0.5, secs: 60 } },
  sprudelwasser: { id: 'sprudelwasser', name: 'Sprudelwasser', desc: 'Löscht Schlamm, Brennen und Gift vom Pirscher.', kind: 'consumable', max: 5, time: 0.6, applyAt: 0.5, icon: { shape: 'water', color: '#5ad8ff' }, value: 6, effect: { type: 'cleanse' } },
  blendknolle: { id: 'blendknolle', name: 'Blendknolle', desc: 'Wurf (6 m). Blendet Brocken 4 s und holt Fliegende runter.', kind: 'consumable', max: 3, time: 0.5, applyAt: 0.6, icon: { shape: 'bomb', color: '#fff4a0' }, value: 20, effect: { type: 'throw', fx: 'flash', range: 6 } },
  stinkbombe: { id: 'stinkbombe', name: 'Stinkbombe', desc: 'Wurf. Der Brocken wechselt Ziel oder Zone und lässt das Fressen.', kind: 'consumable', max: 3, time: 0.5, applyAt: 0.6, icon: { shape: 'bomb', color: '#8ab030' }, value: 16, effect: { type: 'throw', fx: 'stink', range: 6 } },
  klebefalle: { id: 'klebefalle', name: 'Klebefalle', desc: 'Platzieren. Brocken klebt 6 s fest (1× pro Brocken pro 60 s).', kind: 'consumable', max: 1, time: 1.5, applyAt: 0.8, icon: { shape: 'trap', color: '#d0a050' }, value: 25, effect: { type: 'place', fx: 'trap' } },
  knallgurke: { id: 'knallgurke', name: 'Knallgurke', desc: 'Platzieren. 3 s Lunte, dann 120 Schaden + Betäubung.', kind: 'consumable', max: 2, time: 1.0, applyAt: 0.7, icon: { shape: 'cuke', color: '#4ac040' }, value: 25, effect: { type: 'place', fx: 'bomb' } },

  grillsteak: { id: 'grillsteak', name: 'Grillsteak', desc: '+40 HP und +25 Max-Puste für den Rest der Jagd. Zischt noch.', kind: 'consumable', max: 3, time: 1.2, applyAt: 0.55, icon: { shape: 'meat', color: '#c8683a' }, value: 25, effect: { type: 'grill', hp: 40, over: 1, maxStamina: 25 } }, // [L]

  // ---- bow tips (crafted in packs of 10)
  brennspitze: { id: 'brennspitze', name: 'Brennspitze', desc: 'Bogen-Munition mit Feuer (+12). Wechsel dauert 0,4 s.', kind: 'ammo', max: 20, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#ff7a30' }, value: 2, effect: { type: 'tip' } },
  giftspitze: { id: 'giftspitze', name: 'Giftspitze', desc: 'Bogen-Munition, baut Gift auf (20).', kind: 'ammo', max: 20, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#a050e0' }, value: 2, effect: { type: 'tip' } },
  bummspitze: { id: 'bummspitze', name: 'Bummspitze', desc: 'Bogen-Munition, kleine Explosion mit Betäubung (8).', kind: 'ammo', max: 10, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#ffe14d' }, value: 3, effect: { type: 'tip' } },
  rostspitze: { id: 'rostspitze', name: 'Rostspitze', desc: 'Bogen-Munition, baut Rost auf (15).', kind: 'ammo', max: 20, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#c8661e' }, value: 3, effect: { type: 'tip' } },
  // ---- Rostwerke items
  rostbombe: { id: 'rostbombe', name: 'Rostbombe', desc: 'Wurf (6 m). Der Brocken fängt an zu rosten.', kind: 'consumable', max: 3, time: 0.5, applyAt: 0.6, icon: { shape: 'bomb', color: '#c8661e' }, value: 22, effect: { type: 'throw', fx: 'rostbomb', range: 6 } },
  erdungsstab: { id: 'erdungsstab', name: 'Erdungsstab', desc: 'Platzieren. 20 s Schutzzone (4 m) gegen Blitze.', kind: 'consumable', max: 2, time: 1.0, applyAt: 0.7, icon: { shape: 'trap', color: '#d08a50' }, value: 25, effect: { type: 'place', fx: 'ground' } },
  kuehlbrause: { id: 'kuehlbrause', name: 'Kühlbrause', desc: '+30 HP über 1 s, löscht Rost und Brennen.', kind: 'consumable', max: 5, time: 0.9, applyAt: 0.45, icon: { shape: 'potion', color: '#5ad8ff' }, value: 14, effect: { type: 'cool', hp: 30, over: 1 } },
};

// baseValue = Schrott value per piece (shop sells at 40 % of it, see meta/shop.js). Defaults to 2x `value`.
const BASE = { flickbrause: 30, knisterkraut: 8, sprudelwasser: 10, blaublatt: 15, altknochen: 12, brennspitze: 6, giftspitze: 6, klebefalle: 120, blendknolle: 70, rohfleisch: 14, mampfer_fell: 36, grillsteak: 60 };
for (const it of Object.values(ITEMS)) it.baseValue = BASE[it.id] ?? Math.max(1, it.value * 2);

// info = one-line, factual effect / use (shown when an item is tapped in crafting, chests). Values mirror the effects above.
const INFO = {
  knisterkraut: 'Material: für Flickbrause.',
  blaublatt: 'Material: für Pustekuchen.',
  wabbelpilz: 'Material: für Dicke Flickbrause, Klebefalle, Pilzpfanne.',
  stinkmorchel: 'Material: für Blendknolle, Stinkbombe, Giftspitzen.',
  schrotterz: 'Material: für Bummspitzen und Waffen-Upgrades.',
  glimmstein: 'Material: für die höchste Waffenstufe.',
  altknochen: 'Material: für Knallgurke, Bogenspitzen, Waffen und Rüstung.',
  grossknochen: 'Material: für Klebefalle und Rüstung.',
  brummkaefer: 'Material: für Pustekuchen.',
  blitzkaefer: 'Material: für Blendknolle.',
  glutbrocken: 'Material: für Knallgurke, Grillsteak, Brenn-/Bummspitzen, Glutgulasch.',
  jaggo_schuppe: 'Material: für Jaggo-Waffen und -Rüstung.',
  jaggo_fell: 'Material: für Jaggo-Waffen und -Rüstung.',
  jaggo_kamm: 'Material: seltenes Teil für Jaggo-Waffen und -Rüstung.',
  jaggling_schuppe: 'Material: nur zum Verkaufen.',
  barrotz_kruste: 'Material: für Barrotz-Waffen und -Rüstung.',
  barrotz_platte: 'Material: für Barrotz-Waffen und -Rüstung.',
  barrotz_schwanzleder: 'Material: für Barrotz-Waffen und -Rüstung.',
  brathalos_schuppe: 'Material: für die höchste Waffenstufe und Brathalos-Rüstung.',
  brathalos_membran: 'Material: für die höchste Waffenstufe und Brathalos-Rüstung.',
  glutsack: 'Material: für die höchste Waffenstufe und Brathalos-Rüstung.',
  brathalos_rubin: 'Material: nur zum Verkaufen, sehr wertvoll.',
  rohfleisch: 'Material: für Grillsteak und Mampfer-Ragout.',
  mampfer_fell: 'Material: für Mampfer-Rüstung.',
  flickbrause: 'Heilt 35 HP über 1 s.',
  dicke_flickbrause: 'Heilt 80 HP über 1 s und die Prellung komplett.',
  pustekuchen: 'Halbiert den Puste-Verbrauch für 60 s.',
  sprudelwasser: 'Entfernt Schlamm, Brennen und Gift.',
  blendknolle: 'Wurf (6 m): blendet Brocken 4 s, holt Fliegende runter.',
  stinkbombe: 'Wurf (6 m): Brocken wechselt Ziel oder Zone und lässt das Fressen.',
  klebefalle: 'Platzieren: Brocken klebt 6 s fest (1× pro Brocken pro 60 s).',
  knallgurke: 'Platzieren: nach 3 s Lunte 120 Schaden und Betäubung.',
  grillsteak: 'Heilt 40 HP und gibt +25 Max-Puste bis Jagdende.',
  brennspitze: 'Bogen-Munition mit Feuer (+12). Wechsel 0,4 s.',
  giftspitze: 'Bogen-Munition, baut Gift auf (20). Wechsel 0,4 s.',
  bummspitze: 'Bogen-Munition, kleine Explosion mit Betäubung (8). Wechsel 0,4 s.',
  kupferdraht: 'Material: für Erdungsstab.',
  schlacke: 'Material: für Rostbombe.',
  rostkaefer: 'Material: für Rostbombe und Kühlbrause.',
  giftschlamm: 'Material: aus dem Giftgraben, für spätere Rostwerke-Rezepte.',
  funkenstein: 'Material: selten, aus der Turbinenkrone.',
  kroll_panzer: 'Material: für Rostwerke-Ausrüstung.',
  kroll_schere: 'Material: für Rostwerke-Ausrüstung.',
  kroll_auge: 'Material: seltenes Teil für Rostwerke-Ausrüstung.',
  gorgo_segment: 'Material: für Rostwerke-Ausrüstung.',
  gorgo_zahn: 'Material: für Rostwerke-Ausrüstung.',
  gorgo_kern: 'Material: sehr selten, für Rostwerke-Ausrüstung.',
  voltaro_kamm: 'Material: für Rostwerke-Ausrüstung.',
  voltaro_spule: 'Material: für Rostwerke-Ausrüstung.',
  voltaro_fell: 'Material: für Rostwerke-Ausrüstung.',
  voltaro_herz: 'Material: sehr selten, für die stärksten Rostwerke-Stücke.',
  rostbombe: 'Wurf (6 m): baut 60 Rost auf (bei 100: 15 s Verrostet).',
  erdungsstab: 'Platzieren: 20 s Schutzzone (4 m) gegen Kettenblitz und Donnerschlag.',
  kuehlbrause: 'Heilt 30 HP und entfernt Rost und Brennen.',
  rostspitze: 'Bogen-Munition, baut Rost auf (15). Wechsel 0,4 s.',
};
for (const it of Object.values(ITEMS)) it.info = INFO[it.id] ?? it.desc;

export const ITEM_IDS = Object.keys(ITEMS);
export const getItem = (id) => ITEMS[id] ?? null;
export const itemName = (id) => ITEMS[id]?.name ?? id;
export const isCarryable = (id) => ITEMS[id]?.kind === 'consumable' || ITEMS[id]?.kind === 'ammo';
/** carry limit into / during a hunt */
export const carryMax = (id) => ITEMS[id]?.max ?? BOX_MAX;
