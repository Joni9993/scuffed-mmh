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
  // Rostwerke-Macken (GDD 15.8). Zahlen: meta/loadout.js skillEffects.
  panzerhaut: { id: 'panzerhaut', name: 'Panzerhaut', max: 3, desc: (l) => `Rost-Dauer −${Math.round(50 * l / 3)} %, +${Math.round(10 * l / 3)} % Schutz` },
  wuehler: { id: 'wuehler', name: 'Wühler', max: 3, desc: (l) => (l >= 2 ? 'Immun gegen Sog und Wind' : 'Ab Stufe 2: immun gegen Sog und Wind') },
  ueberladung: { id: 'ueberladung', name: 'Überladung', max: 3, desc: (l) => `Nach Glitch-Konter 8 s +${5 * l} % Angriff` },
  // Smaragdküste-Macken. Zahlen: meta/loadout.js skillEffects.blendCut, gelesen in game/loadout.js (Status blend).
  blendschutz: { id: 'blendschutz', name: 'Blendschutz', max: 3, desc: (l) => (l >= 3 ? 'Geblendet: Weiß nur 0,1 s, keine Betäubung' : `Geblendet: Weiß −${(0.3 * l).toFixed(1).replace('.', ',')} s, Betäubung −${(0.3 * l).toFixed(1).replace('.', ',')} s`) },
  eisenmagen: { id: 'eisenmagen', name: 'Eisenmagen', max: 3, desc: (l) => `Gift, Brennen, Verwirrung, Item-Sperre: Dauer −${15 * l} %` },
  schleimhaut: { id: 'schleimhaut', name: 'Schleimhaut', max: 3, desc: (l) => `Glitch-Schleim: Zündschnur +${(0.4 * l).toFixed(1).replace('.', ',')} s, Explosion −${15 * l} % Schaden` },
  erdung: { id: 'erdung', name: 'Erdung', max: 3, desc: (l) => `Schock-Resistenz ${Math.round(100 * (1 - 0.8 ** l))} %` },
  kesselherz: { id:'kesselherz',name:'Kesselherz',max:3,desc:l=>`Unter 50 % LP +${4*l} % Angriff; ${12*l} % Feuer-Resistenz` },
  weltenpanzer: { id:'weltenpanzer',name:'Weltenpanzer',max:3,desc:l=>`+${8*l} % Teilschaden; Block-Puste −${8*l} %` },
  prismenpakt: { id:'prismenpakt',name:'Prismenpakt',max:3,desc:l=>`+${4*l} % Krit; perfekte Rolle erstattet ${4*l} Puste` },
  urcode: { id:'urcode',name:'Ur-Code',max:3,desc:l=>`Glitch-Konter: 8 s +${6*l} % Angriff; Gift/Brand/Blindheit −${5*l} % Dauer` },
};

const set = (id, name, prot, skills, pieces) => ({ id, name, prot, skills, pieces });
const piece = (name, cost, skills) => ({ name, cost, skills });

export const ARMOR_SETS = {
  lumpen: set('lumpen', 'Lumpen', 5, [], {
    head: piece('Lumpenkappe', null, {}), body: piece('Lumpenhemd', null, {}), legs: piece('Lumpenhose', null, {}),
  }),
  // [G] Fellkluft (GDD 8.6 / neutral animals): made from `mampfer_fell` (the item is added by the animals content)
  fellkluft: set('fellkluft', 'Fellkluft', 10, ['zaehe_socke'], {
    head: piece('Fellmütze', { schrott: 60, mampfer_fell: 2 }, { zaehe_socke: 1 }),
    body: piece('Fellweste', { schrott: 90, mampfer_fell: 4 }, { zaehe_socke: 1 }),
    legs: piece('Fellstiefel', { schrott: 70, mampfer_fell: 3 }, { zaehe_socke: 1 }),
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
  // Rostwerke-Sets (GDD 15.8)
  kroll: set('kroll', 'Kroll', 34, ['panzerhaut'], {
    head: piece('Kroll-Kesselhelm', { schrott: 1000, kroll_panzer: 3, kroll_auge: 1, kupferdraht: 3 }, { panzerhaut: 1 }),
    body: piece('Kroll-Kesselpanzer', { schrott: 1200, kroll_panzer: 5, kroll_schere: 2, kupferdraht: 4 }, { panzerhaut: 1 }),
    legs: piece('Kroll-Scherenbeine', { schrott: 1000, kroll_panzer: 3, kroll_schere: 2, kupferdraht: 3 }, { panzerhaut: 1 }),
  }),
  gorgo: set('gorgo', 'Gorgo', 36, ['wuehler'], {
    head: piece('Gorgo-Wurmhelm', { schrott: 1100, gorgo_segment: 3, gorgo_zahn: 2, schlacke: 4 }, { wuehler: 1 }),
    body: piece('Gorgo-Segmentpanzer', { schrott: 1300, gorgo_segment: 5, gorgo_zahn: 1, gorgo_kern: 1, schlacke: 5 }, { wuehler: 1 }),
    legs: piece('Gorgo-Grabbeine', { schrott: 1100, gorgo_segment: 4, gorgo_zahn: 2, schlacke: 4 }, { wuehler: 1 }),
  }),
  voltaro: set('voltaro', 'Voltaro', 40, ['ueberladung', 'erdung'], {
    head: piece('Voltaro-Funkenkrone', { schrott: 1500, voltaro_kamm: 2, voltaro_fell: 2, funkenstein: 1 }, { ueberladung: 1, erdung: 1 }),
    body: piece('Voltaro-Spulenharnisch', { schrott: 1800, voltaro_spule: 4, voltaro_fell: 3, voltaro_kamm: 1, funkenstein: 2 }, { ueberladung: 1, erdung: 1 }),
    legs: piece('Voltaro-Blitzläufer', { schrott: 1500, voltaro_spule: 3, voltaro_fell: 3, funkenstein: 1 }, { ueberladung: 1, erdung: 1 }),
  }),
  // Smaragdküste-Set (Prot 44, Spec 2.11)
  blendax: set('blendax', 'Blendax', 44, ['blendschutz', 'flinkfuss'], {
    head: piece('Blendax-Blinzelhaube', { schrott: 2000, blendax_schuppe: 3, blendax_schirm: 1, glimmstein: 1 }, { blendschutz: 1, flinkfuss: 1 }),
    body: piece('Blendax-Schuppenpanzer', { schrott: 2300, blendax_schuppe: 5, blendax_klaue: 2, blendax_schirm: 1 }, { blendschutz: 1, flinkfuss: 1 }),
    legs: piece('Blendax-Sprungstiefel', { schrott: 2000, blendax_schuppe: 3, blendax_klaue: 3 }, { blendschutz: 1, flinkfuss: 1 }),
  }),
  // Smaragdküste-Set (Prot 46, Spec 3.9): Eisenmagen gegen die Zustände des Mampfaffen
  mampfaffe: set('mampfaffe', 'Mampfaffe', 46, ['eisenmagen', 'dickschaedel'], {
    head: piece('Mampfaffe-Backenschutz', { schrott: 2100, mampfaffe_fell: 3, mampfaffe_backe: 1, giftkraut: 2 }, { eisenmagen: 1, dickschaedel: 1 }),
    body: piece('Mampfaffe-Pelzmantel', { schrott: 2400, mampfaffe_fell: 5, mampfaffe_knoechel: 2, mampfaffe_backe: 1, feuerpilz: 2 }, { eisenmagen: 1, dickschaedel: 1 }),
    legs: piece('Mampfaffe-Knöchelhosen', { schrott: 2100, mampfaffe_fell: 3, mampfaffe_knoechel: 3, kokosnuss: 3 }, { eisenmagen: 1, dickschaedel: 1 }),
  }),
  // Smaragdküste-Set (Prot 50, Spec 4.11): Schleimhaut gegen Krachfausts Glitch-Schleim, dazu Zähe Socke
  krachfaust: set('krachfaust', 'Krachfaust', 50, ['schleimhaut', 'zaehe_socke'], {
    head: piece('Krachfaust-Schleimhelm', { schrott: 2600, krachfaust_kruste: 3, krachfaust_faustplatte: 1, tempelstein: 2 }, { schleimhaut: 1, zaehe_socke: 1 }),
    body: piece('Krachfaust-Tempelpanzer', { schrott: 3000, krachfaust_kruste: 5, krachfaust_schleim: 2, krachfaust_faustplatte: 1, tempelstein: 2 }, { schleimhaut: 1, zaehe_socke: 1 }),
    legs: piece('Krachfaust-Trümmerstiefel', { schrott: 2600, krachfaust_kruste: 3, krachfaust_schleim: 2, tempelstein: 1 }, { schleimhaut: 1, zaehe_socke: 1 }),
  }),
  // Final-map trophies: three distinct dragon disciplines, then the secret finale's reality armour.
  pyrostur: set('pyrostur','Pyrostur · Kesselherz',60,['kesselherz'],{
    head:piece('Kesselherz-Drachenkrone',{schrott:3200,pyrostur_schuppe:3,pyrostur_kesselsack:1,glitchgrat_erz:2},{kesselherz:1}),
    body:piece('Kesselherz-Ofenmantel',{schrott:3800,pyrostur_schuppe:5,pyrostur_fluegel:2,pyrostur_rubin:1,glitchgrat_erz:3},{kesselherz:1}),
    legs:piece('Kesselherz-Aschesporne',{schrott:3200,pyrostur_schuppe:3,pyrostur_kesselsack:2,glitchgrat_erz:2},{kesselherz:1}),
  }),
  felsengroll: set('felsengroll','Felsengroll · Weltenpanzer',64,['weltenpanzer'],{
    head:piece('Weltenpanzer-Bollwerk',{schrott:3300,felsengroll_panzer:3,felsengroll_schlacke:1,glitchgrat_erz:2},{weltenpanzer:1}),
    body:piece('Weltenpanzer-Festung',{schrott:3900,felsengroll_panzer:5,felsengroll_schweif:2,felsengroll_kern:1,glitchgrat_erz:3},{weltenpanzer:1}),
    legs:piece('Weltenpanzer-Fundamente',{schrott:3300,felsengroll_panzer:3,felsengroll_schlacke:2,glitchgrat_erz:2},{weltenpanzer:1}),
  }),
  voltiris: set('voltiris','Voltiris · Prismenpakt',60,['prismenpakt'],{
    head:piece('Prismenpakt-Strahlenvisier',{schrott:3300,voltiris_flimmerfeder:3,voltiris_horn:1,glitchgrat_erz:2},{prismenpakt:1}),
    body:piece('Prismenpakt-Flügelgewand',{schrott:3900,voltiris_flimmerfeder:5,voltiris_antenne:2,voltiris_kristall:1,glitchgrat_erz:3},{prismenpakt:1}),
    legs:piece('Prismenpakt-Lichtläufer',{schrott:3300,voltiris_flimmerfeder:3,voltiris_horn:2,glitchgrat_erz:2},{prismenpakt:1}),
  }),
  gockelok: set('gockelok','Gockelok · Ur-Code',68,['urcode'],{
    head:piece('Ur-Code-Augenkrone',{schrott:4500,gockel_kamm:2,gockel_feder:3,glitchgrat_erz:3},{urcode:1}),
    body:piece('Ur-Code-Realitätsmantel',{schrott:5500,gockel_feder:5,gockel_sporn:2,ur_gockelei:1,glitchgrat_erz:4},{urcode:1}),
    legs:piece('Ur-Code-Nullschritt',{schrott:4500,gockel_feder:3,gockel_sporn:3,glitchgrat_erz:3},{urcode:1}),
  }),
};
export const SET_ORDER = ['lumpen', 'fellkluft', 'knochenkram', 'jaggo', 'barrotz', 'brathalos', 'kroll', 'gorgo', 'voltaro', 'blendax', 'mampfaffe', 'krachfaust','pyrostur','felsengroll','voltiris','gockelok'];

export const pieceId = (set, slot) => `${set}_${slot}`;
const index = {};
for (const s of Object.values(ARMOR_SETS)) for (const slot of SLOTS) index[pieceId(s.id, slot)] = { id: pieceId(s.id, slot), set: s.id, slot, setName: s.name, prot: s.prot, ...s.pieces[slot] };
export const ARMOR_PIECES = index;
export const getPiece = (id) => ARMOR_PIECES[id] ?? null;
export const DEFAULT_ARMOR = { head: 'lumpen_head', body: 'lumpen_body', legs: 'lumpen_legs' };
