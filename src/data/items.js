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

  // ---- consumables
  flickbrause: { id: 'flickbrause', name: 'Flickbrause', desc: '+35 HP über 1 s. Schmeckt nach Pfefferminz und Eisen.', kind: 'consumable', max: 10, time: 0.9, applyAt: 0.45, icon: { shape: 'potion', color: '#58e060' }, value: 8, effect: { type: 'heal', hp: 35, over: 1 } },
  dicke_flickbrause: { id: 'dicke_flickbrause', name: 'Dicke Flickbrause', desc: '+80 HP über 1 s, heilt die Prellung komplett.', kind: 'consumable', max: 5, time: 1.1, applyAt: 0.45, icon: { shape: 'potion', color: '#20c0a0' }, value: 20, effect: { type: 'heal', hp: 80, over: 1, bruise: true } },
  pustekuchen: { id: 'pustekuchen', name: 'Pustekuchen', desc: 'Puste-Verbrauch halbiert für 60 s. Krümelt.', kind: 'consumable', max: 3, time: 1.2, applyAt: 0.5, icon: { shape: 'cake', color: '#ffd84a' }, value: 18, effect: { type: 'stamina', mul: 0.5, secs: 60 } },
  sprudelwasser: { id: 'sprudelwasser', name: 'Sprudelwasser', desc: 'Löscht Schlamm, Brennen und Gift vom Pirscher.', kind: 'consumable', max: 5, time: 0.6, applyAt: 0.5, icon: { shape: 'water', color: '#5ad8ff' }, value: 6, effect: { type: 'cleanse' } },
  blendknolle: { id: 'blendknolle', name: 'Blendknolle', desc: 'Wurf (6 m). Blendet Brocken 4 s und holt Fliegende runter.', kind: 'consumable', max: 3, time: 0.5, applyAt: 0.6, icon: { shape: 'bomb', color: '#fff4a0' }, value: 20, effect: { type: 'throw', fx: 'flash', range: 6 } },
  stinkbombe: { id: 'stinkbombe', name: 'Stinkbombe', desc: 'Wurf. Der Brocken wechselt Ziel oder Zone und lässt das Fressen.', kind: 'consumable', max: 3, time: 0.5, applyAt: 0.6, icon: { shape: 'bomb', color: '#8ab030' }, value: 16, effect: { type: 'throw', fx: 'stink', range: 6 } },
  klebefalle: { id: 'klebefalle', name: 'Klebefalle', desc: 'Platzieren. Brocken klebt 6 s fest (1× pro Brocken pro 60 s).', kind: 'consumable', max: 1, time: 1.5, applyAt: 0.8, icon: { shape: 'trap', color: '#d0a050' }, value: 25, effect: { type: 'place', fx: 'trap' } },
  knallgurke: { id: 'knallgurke', name: 'Knallgurke', desc: 'Platzieren. 3 s Lunte, dann 120 Schaden + Betäubung.', kind: 'consumable', max: 2, time: 1.0, applyAt: 0.7, icon: { shape: 'cuke', color: '#4ac040' }, value: 25, effect: { type: 'place', fx: 'bomb' } },

  // ---- bow tips (crafted in packs of 10)
  brennspitze: { id: 'brennspitze', name: 'Brennspitze', desc: 'Bogen-Munition mit Feuer (+12). Wechsel dauert 0,4 s.', kind: 'ammo', max: 20, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#ff7a30' }, value: 2, effect: { type: 'tip' } },
  giftspitze: { id: 'giftspitze', name: 'Giftspitze', desc: 'Bogen-Munition, baut Gift auf (20).', kind: 'ammo', max: 20, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#a050e0' }, value: 2, effect: { type: 'tip' } },
  bummspitze: { id: 'bummspitze', name: 'Bummspitze', desc: 'Bogen-Munition, kleine Explosion mit Betäubung (8).', kind: 'ammo', max: 10, time: 0.4, applyAt: 0.5, icon: { shape: 'arrow', color: '#ffe14d' }, value: 3, effect: { type: 'tip' } },
};

// baseValue = Schrott value per piece (shop sells at 40 % of it, see meta/shop.js). Defaults to 2x `value`.
const BASE = { flickbrause: 30, knisterkraut: 8, sprudelwasser: 10, blaublatt: 15, altknochen: 12, brennspitze: 6, giftspitze: 6, klebefalle: 120, blendknolle: 70 };
for (const it of Object.values(ITEMS)) it.baseValue = BASE[it.id] ?? Math.max(1, it.value * 2);

export const ITEM_IDS = Object.keys(ITEMS);
export const getItem = (id) => ITEMS[id] ?? null;
export const itemName = (id) => ITEMS[id]?.name ?? id;
export const isCarryable = (id) => ITEMS[id]?.kind === 'consumable' || ITEMS[id]?.kind === 'ammo';
/** carry limit into / during a hunt */
export const carryMax = (id) => ITEMS[id]?.max ?? BOX_MAX;
