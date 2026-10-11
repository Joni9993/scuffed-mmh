// Brocken-Kompendium (Spiegel → Reiter „Kompendium"). Feldnotizen des Glitch Hunters, in der Rolle geschrieben.
// Einträge werden mit der Zahl der Kämpfe gegen den Brocken freigeschaltet (save.fights[id], Sieg oder Niederlage zählt).
//   at: Kämpfe, ab denen der Eintrag lesbar ist · kind: 'angriff' | 'verhalten' | 'schwaeche'
// Zahlen/Mechaniken müssen zum Code passen (Angriffe in src/game/monsters/*.js, Zustände in player.js/monster.js).

export const KIND_LABEL = { angriff: 'Angriff', verhalten: 'Verhalten', schwaeche: 'Schwachstelle' };

export const BESTIARY = [
  {
    id: 'jaggo', name: 'Jaggo der Große', where: 'Schotterklamm · Wackelwiese', title: 'Rudelführer',
    intro: 'Erste Sichtung. Ein Raptor mit Kamm und Ego, schneller als er aussieht. Wo Jaggo ist, sind seine Jagglinge nicht weit. Merke: nie lange auf einem Fleck stehen.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Bissreihe', text: 'Kopf zuckt zurück, dann drei Bisse nach vorn. Die Vorwarnung ist kurz. Seitlich rollen, nicht rückwärts – er läuft mit.' },
      { at: 1, kind: 'angriff', name: 'Schwanzwirbel', text: 'Schwanz hebt sich, dann einmal komplett rundherum. Wer hinter ihm klebt, fliegt. Der Moment, in dem der Schwanz oben steht, ist dein Signal.' },
      { at: 2, kind: 'angriff', name: 'Hüpfer', text: 'Duckt sich, die Beine blinken – dann springt er bis zu 10 m auf dich drauf und wirft dich um. Abstand hilft nicht, Timing schon.' },
      { at: 2, kind: 'verhalten', name: 'Rudelruf', text: 'Brüllt und ruft zwei Jagglinge dazu. Im Umkreis von 8 m bist du kurz festgenagelt. Wer im richtigen Moment rollt, kontert den Schrei mit einem Glitch.' },
      { at: 3, kind: 'angriff', name: 'Zickzack-Biss', text: 'Neigt sich zur Seite, zwei Haken, dann der Biss. Die erste Neigung verrät die Richtung – nicht vom Zickzack hypnotisieren lassen.' },
      { at: 3, kind: 'angriff', name: 'Rückhüpfer', text: 'Wer zu lange vorne klebt, bekommt einen schnellen Schwanzwirbel und Jaggo springt 4 m weg. Die Quittung für Dauer-Nahkampf.' },
      { at: 4, kind: 'verhalten', name: 'Hetzjagd', text: 'Ab halber Lebensleiste wird es persönlich: ein kurviger Sprint auf dich zu, der in einem harten Biss endet. Lies die Kurve, roll beim Einbiegen.' },
      { at: 4, kind: 'schwaeche', name: 'Kamm & Feuer', text: 'Der Kopf ist weich und gegen Feuer empfindlich, stumpfe Schläge auf den Kopf betäuben. Bricht der Kamm, beißt er öfter – bricht der Schwanz, zickzackt er mehr. Bruch ändert das Moveset.' },
    ],
  },
  {
    id: 'barrotz', name: 'Barrotz', where: 'Schotterklamm · Schlammsenke', title: 'Schlamm-Rammbock',
    intro: 'Ein Rammbock auf vier Beinen, mit einer Kopfplatte wie eine Kellertür. Langsam? Nur bis er losrennt. Seine Schlammsenke ist sein Revier – und rutschig.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Rammsturm', text: 'Scharrt kurz mit den Hufen, dann geht er 15 m geradeaus. Wirft um. In Rotglut dreht er am Ende und kommt nochmal. Zur Seite, nie nach hinten.' },
      { at: 1, kind: 'angriff', name: 'Plattenhammer', text: 'Kopf hoch, Platte runter – mit Schlamm-Schockwelle im 4-m-Umkreis. Wer direkt vor ihm steht, steht falsch.' },
      { at: 2, kind: 'angriff', name: 'Schwanzfeger', text: 'Ein Vollkreis mit dem Schwanz. Kommt oft, wenn du an seiner Flanke klebst. Kurz, aber fies.' },
      { at: 2, kind: 'angriff', name: 'Hörnerschwung', text: 'Kopf zur Seite, dann schleudert er dich über 100 Grad weg. Bestraft Dauerrollen – manchmal ist Stehenbleiben die Antwort.' },
      { at: 3, kind: 'verhalten', name: 'Schlammpanzer', text: 'Nach dem Schlammwälzer (er rollt wie eine Walze auf dich zu) trägt er einen Panzer: Körper halbiert Schaden, Feuer wirkt nicht. Schock oder genug Treffer sprengen ihn – dann taumelt er.' },
      { at: 3, kind: 'angriff', name: 'Schlammspritzer', text: 'Nur mit Panzer: schüttelt sich und verteilt sechs Kleckse. Wer getroffen wird, ist verschlammt – langsamer, kein Sprint.' },
      { at: 4, kind: 'angriff', name: 'Doppelstampfer', text: 'Kopf hoch, Stampfer vorne, kurze Pause mit erhobenem Kopf – dann der zweite als Ring um ihn. Die Pause ist die Falle. Erst nach dem Ring wieder rein.' },
      { at: 5, kind: 'schwaeche', name: 'Kopfplatte', text: 'Die Platte schluckt Treffer (halber Schaden), aber stumpfe Schläge betäuben und sie bricht. Danach ersetzt ein schneller Kopfstoß den Hammer. Schock tut ihm überall weh.' },
    ],
  },
  {
    id: 'brathalos', name: 'Brathalos', where: 'Schotterklamm · Glutkamm', title: 'Feuer-Wyvern',
    intro: 'Flügel, Feuer, schlechte Laune. Ein Fünftel der Zeit ist er in der Luft – dann ist die Fernwaffe dein bester Freund. Riecht nach angebranntem Grillsteak.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Feuerball', text: 'Kopf zieht zurück, das Maul glüht – dann fliegt ein Feuerball. Treffer setzt dich in Brand. In Rotglut kommen drei im Fächer.' },
      { at: 1, kind: 'angriff', name: 'Schwanzhieb', text: '180° nach hinten. Wer sich hinter ihm sicher fühlt, lernt es auf die harte Tour.' },
      { at: 2, kind: 'verhalten', name: 'Aufflug & Krallensturz', text: 'Duckt sich, Flügel auf, weg ist er. Aus der Luft: ein Schatten auf dem Boden, 0,9 s später kommt er mit den Krallen runter – Gift inklusive. Raus aus dem Schatten.' },
      { at: 2, kind: 'angriff', name: 'Flügelböe', text: 'Wind schiebt dich 3 m zurück und unterbricht dein Aufladen. Ärgerlich bei Großschwert und Bogen.' },
      { at: 3, kind: 'angriff', name: 'Feuerteppich', text: 'Drei Feuerbälle nacheinander, links, Mitte, rechts. Die Lücke liegt immer zwischen den Einschlägen, nicht dahinter.' },
      { at: 4, kind: 'verhalten', name: 'Rotglut-Brüllen', text: 'Wenn er wütend wird, brüllt er alles im 9-m-Umkreis fest. Mit perfektem Timing gerollt: Glitch-Konter.' },
      { at: 4, kind: 'angriff', name: 'Flammenstoß', text: 'Sind die Flügel kaputt, gibt es keine Böe mehr – stattdessen einen Feuerkegel aus nächster Nähe. Nahkampf bleibt ein Risiko.' },
      { at: 5, kind: 'schwaeche', name: 'Flügel & Schwanz', text: 'Feuer prallt an ihm ab, Schock dagegen zieht – besonders am Kopf. Flügelbruch beendet die Böe, der Schwanz lässt sich abtrennen und separat zerlegen.' },
    ],
  },
  {
    id: 'kroll', name: 'Kroll', where: 'Rostwerke', title: 'Kesselkrabbe',
    intro: 'Eine Krabbe mit einem Dampfkessel auf dem Rücken und Scheren wie Schraubstöcke. Sie hält die Scheren hoch wie ein Boxer – und sie weiß, was sie tut.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Scherenzange', text: 'Holt sichtbar aus, dann links, rechts. Zwei Treffer, kleiner Ausfallschritt. Wer nach dem ersten Hieb stehen bleibt, frisst den zweiten.' },
      { at: 1, kind: 'angriff', name: 'Dampfstrahl', text: 'Der Kessel glüht, es pfeift, ein kurzer Dampfstoß – dann ein 10-m-Strahl, zwei Sekunden lang. Macht dich rostig. Aus dem Kegel raus, nicht durch.' },
      { at: 2, kind: 'verhalten', name: 'Panzerdeckung', text: 'Scheren vor das Gesicht, Augen eingezogen. Von vorn kommt kaum Schaden an – und jeder Treffer in die Deckung wird sofort mit einem Konterhieb beantwortet. Flanke oder Rücken suchen. Kommt, wenn du stur frontal draufhaust.' },
      { at: 2, kind: 'angriff', name: 'Seitrammer', text: 'Beine stemmen, dann rast sie bis 12 m seitwärts mit der Breitseite. Wirft um. Krabben gehen eben seitwärts.' },
      { at: 3, kind: 'angriff', name: 'Scherengriff', text: 'Beide Scheren weit auf – sie schnellt bis 8 m nach vorn und zwickt zu. Hoher Schaden, umwerfen. Kommt gern direkt nach einem Seitrammer oder Sprung.' },
      { at: 3, kind: 'angriff', name: 'Kesseldruck', text: 'Zittern, Ventile pfeifen, dann explodiert ein Ring um sie herum. Direkt unter ihr ist es sicher – mutig, aber wahr.' },
      { at: 4, kind: 'verhalten', name: 'Panzerbruch', text: 'Bricht der Kesselpanzer, ändert sich alles: Scherenwirbel (drei Drehungen) und der Krabbensprung, nach dem sie 1,5 s feststeckt. Das ist dein Fenster.' },
      { at: 5, kind: 'verhalten', name: 'Doppelsprung', text: 'Unter 40 % Leben wird sie schneller und härter: zwei Sätze hintereinander, Zwischenlandung auf halbem Weg. Nicht nach dem ersten Satz aufatmen.' },
      { at: 6, kind: 'schwaeche', name: 'Beine & Schock', text: 'Der Panzer schluckt fast alles, die Beine nicht – und Schock geht durch. Stumpfe Schläge knacken den Panzer am schnellsten.' },
    ],
  },
  {
    id: 'gorgo', name: 'Gorgo', where: 'Rostwerke', title: 'Schlackwurm',
    intro: 'Achtzehn Meter Wurm aus Schlacke und schlechter Absicht. Der Boden ist nicht sicher, wenn er weg ist. Vor allem dann nicht.',
    entries: [
      { at: 1, kind: 'verhalten', name: 'Wühlen & Durchbruch', text: 'Er taucht ab, ein Hügel zieht auf dich zu. Dann Risse, Glühen, Rumpeln – und er bricht unter dir durch. Nicht nur einmal: zweimal, später dreimal hintereinander. Weiterlaufen, bis er oben bleibt.' },
      { at: 1, kind: 'angriff', name: 'Körperpeitsche', text: 'Ein Halbkreis vor ihm, die Segmente schlagen zu. Der rote Ring zeigt die Reichweite.' },
      { at: 2, kind: 'angriff', name: 'Schlackespucke', text: 'Glühende Brocken im Bogen, danach bleiben Lava-Pfützen 8 s liegen. Macht rostig. Er spuckt aus Distanz – Bogen-Schützen aufgepasst.' },
      { at: 2, kind: 'angriff', name: 'Sog', text: 'Das Maul geht auf und saugt alles im Kegel an. Eine Rolle bricht den Sog. Wer im Maul landet, hat ein Problem.' },
      { at: 3, kind: 'angriff', name: 'Wurmwalze', text: 'Der ganze Körper dreht sich 180° um seine Mitte – Kopf und Schwanz fegen einen vollen Kreis. Was der Körper berührt, liegt. Ring raus oder im richtigen Moment rollen.' },
      { at: 3, kind: 'angriff', name: 'Schlackewelle', text: 'Er bäumt sich auf und schlägt auf den Boden. Drei Ringe laufen nach außen, mit Lücken dazwischen. In die Lücke stellen oder durch die Welle rollen. In Wut: zwei Wellen.' },
      { at: 4, kind: 'verhalten', name: 'Zubiss & Ketten', text: 'Nach dem Sog kommt oft ein schneller Biss, danach die Walze. Wer den Sog übersteht, ist noch nicht durch.' },
      { at: 5, kind: 'schwaeche', name: 'Segmente', text: 'Jedes gebrochene Segment macht ihn kürzer und langsamer – ab zwei gebrochenen schnappt er statt zu peitschen. Knallgurke oder Schrottkran zwingen ihn aus dem Boden. Schock und Rost wirken gut.' },
    ],
  },
  {
    id: 'voltaro', name: 'Voltaro', where: 'Rostwerke', title: 'Funkenfürst',
    intro: 'Das Ende der Nahrungskette. Ein geducktes Raubtier mit Kupferspulen auf dem Rücken, zwischen denen es knistert. Wenn die Spulen glühen, wird es gleich sehr hell.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Prankenhiebe', text: 'Ausfallschritt, Hieb – und er dreht bis kurz vor dem Treffer nach. Zwei bis drei hintereinander. Zähl mit.' },
      { at: 1, kind: 'angriff', name: 'Blitzfeld', text: 'Vom Kamm schießen Bögen auf den Boden und setzen Ladungen – als Linie, Kreuz oder Ring. Sie zünden nacheinander, Marker zeigen wo. Die Lücken lesen, nicht rennen.' },
      { at: 2, kind: 'angriff', name: 'Funkenlauf', text: 'Ein Sturmangriff durch dich durch, er bremst, dreht einmal und kommt zurück – mit Schwanzschlag am Ende. Hinter sich lässt er eine gelbe Funkenspur, die brennt.' },
      { at: 2, kind: 'angriff', name: 'Spulensprung', text: 'Rückwärtssalto, danach wirbelt der Schwanz. Oft der Auftakt zu Pranken oder Blitzfeld.' },
      { at: 3, kind: 'verhalten', name: 'Aufladen & Überladen', text: 'Er läuft zu den Blitzableitern und lädt sich auf. Bei voller Ladung: Überladen – 60 s lang schneller, Kombos reißen nicht ab. Zerstörte Ableiter in seiner Nähe beenden das Überladen sofort.' },
      { at: 4, kind: 'angriff', name: 'Kettenblitz', text: 'Nur überladen: ein Blitz vom Kamm aufs Ziel, der von Pirscher zu Pirscher springt. Im Koop: auseinander!' },
      { at: 4, kind: 'angriff', name: 'Donnerschlag', text: 'Nur überladen: fünf Blitze vom Himmel auf markierte Kreise, einer nach dem anderen. In der Zone eines Erdungsstabs bist du sicher.' },
      { at: 5, kind: 'angriff', name: 'Plasmasprung', text: 'Nur überladen: Sprung aufs Ziel und eine Schockwelle von 6 m. Der Ring am Boden ist exakt die Reichweite.' },
      { at: 5, kind: 'verhalten', name: 'Sturmruf', text: 'In der zweiten Phase brüllt er ein Gewitter herbei. Ab dann schlagen in der Gegend immer wieder Blitze ein – mit Vorwarnung, aber ohne Pause.' },
      { at: 6, kind: 'schwaeche', name: 'Ungeladen ist er verwundbar', text: 'Schock kitzelt ihn nur. Feuer und Rost wirken – aber Feuer nur, solange er nicht geladen ist. Kamm brechen halbiert sein Aufladen, der Schwanz lässt sich abtrennen.' },
    ],
  },
];
export const BESTIARY_IDS = BESTIARY.map((b) => b.id);

/** Zustände – immer lesbar. who: 'du' (trifft den Pirscher) | 'brocken'. */
export const CONDITIONS = [
  { id: 'burn', name: 'Brennen', who: 'du', text: 'Feuer frisst 3 HP pro Sekunde, 10 s lang. Drei Rollen löschen es. Hitzefell macht es kürzer und schwächer. Töten kann es dich nicht – 1 HP bleibt.' },
  { id: 'poison', name: 'Gift', who: 'du', text: '1,5 HP pro Sekunde für 12 s, Rollen hilft nicht. Sprudelwasser spült es raus. Lässt dich immer mit 1 HP stehen – der nächste Treffer nicht.' },
  { id: 'mud', name: 'Verschlammt', who: 'du', text: 'Langsamer und kein Sprint, bis zu 25 s. Drei Rollen schütteln den Schlamm ab. In der Schlammsenke bei Barrotz an der Tagesordnung.' },
  { id: 'rost', name: 'Rost', who: 'du', text: 'Deine Rüstung schützt 30 % schlechter, 20 s lang. Kommt von Krolls Dampf und Gorgos Schlacke. Panzerhaut verkürzt ihn, Kühlbrause entfernt ihn.' },
  { id: 'shock', name: 'Schock', who: 'du', text: 'Voltaros Blitze. Die Macke Erdung (Voltaro-Set) senkt den Schaden, ein Erdungsstab baut 20 s eine 4-m-Schutzzone – darin trifft dich der Donnerschlag nicht.' },
  { id: 'bruise', name: 'Prellung', who: 'du', text: 'Die Hälfte jedes Treffers ist nur geprellt (dunkelrot im Balken) und heilt mit der Zeit zurück – solange du nicht gleich wieder getroffen wirst.' },
  { id: 'glitch', name: 'Glitch-Konter & Glitch-Modus', who: 'du', text: 'Perfekt ausgewichen = Glitch-Konter: Zeitlupe, nächster Treffer +50 % und ein Drittel Glitch-Leiste. Volle Leiste: 8 s Glitch-Modus mit +30 % Schaden und dem Waffen-Glitch.' },
  { id: 'm_poison', name: 'Vergiftet', who: 'brocken', text: 'Giftspitzen und Giftschlamm bauen Gift auf. Ist es voll, verliert der Brocken 15 s lang zusammen 3 % seines Lebens.' },
  { id: 'm_rost', name: 'Verrostet', who: 'brocken', text: 'Rost-Treffer bauen auf. Verrostet nimmt er 15 s lang 15 % mehr Schaden, und Teile brechen 1,5× schneller.' },
  { id: 'm_scald', name: 'Verbrüht', who: 'brocken', text: 'Heißer Dampf aus einem Ventil der Rostwerke: 10 s lang +10 % Schaden auf ihn. Lässt sich mit Rost kombinieren.' },
  { id: 'm_stun', name: 'Betäubt', who: 'brocken', text: 'Stumpfe Schläge auf den Kopf summieren sich. Ist genug zusammen, kippt er 6 s um – freies Feld für alles, was du hast.' },
  { id: 'm_blind', name: 'Geblendet', who: 'brocken', text: 'Blendknolle vor das Gesicht: 4 s orientierungslos. Fliegende Brocken holt sie sogar vom Himmel.' },
  { id: 'm_trap', name: 'Gefangen', who: 'brocken', text: 'Klebefalle: 6 s festgeklebt. Danach kennt er den Trick eine Minute lang.' },
  { id: 'm_stink', name: 'Gestank', who: 'brocken', text: 'Stinkbombe: Er dreht ab, im Koop sucht er sich ein anderes Ziel. Kurze Atempause, kein Schaden.' },
  { id: 'm_rage', name: 'Rotglut', who: 'brocken', text: 'Wütend: 45 s lang 20 % schneller, 15 % mehr Schaden, kürzere Vorwarnungen. Wird durch viel Schaden in kurzer Zeit ausgelöst – oder er startet schon so (Rotglut-Aufträge).' },
  { id: 'm_tired', name: 'Erschöpft & Hinkend', who: 'brocken', text: 'Nach langen Ketten ist er erschöpft und halb so schnell. Unter 30 % Leben hinkt er und will zurück in sein Nest – nicht entkommen lassen.' },
];

/** Zusatz zu den Element-Schwächen (Sonderregeln, die nicht in der Teile-Tabelle stehen). */
export const ELEM_NOTES = {
  barrotz: 'Mit Schlammpanzer prallt Feuer komplett ab – Schock sprengt den Panzer.',
  voltaro: 'Feuer wirkt nur, solange er nicht aufgeladen ist (Spulen dunkel).',
  gorgo: 'Eingegraben ist er unverwundbar – erst rausholen, dann draufhauen.',
  kroll: 'In Panzerdeckung kommt von vorn kaum etwas an, egal welches Element.',
};

/**
 * Schwachstellen aus den echten Trefferzonen (def.parts): Elemente (Feuer/Schock, Wert = % Element-Schaden auf dem besten Teil),
 * weiche Trefferzonen (factor) und brechbare Teile. Rost/Gift sind Status-Aufbau und wirken bei allen Brocken.
 */
export function weaknessOf(def) {
  const parts = def?.parts ?? [];
  const elems = ['fire', 'shock'].map((k) => {
    let best = 0, where = [];
    for (const p of parts) { const v = p.elem?.[k] ?? 0; if (v > best) { best = v; where = [p.label]; } else if (v === best && v > 0) where.push(p.label); }
    return { id: k, name: k === 'fire' ? 'Feuer' : 'Schock', value: best, stars: best >= 25 ? 3 : best >= 15 ? 2 : best >= 5 ? 1 : 0, where };
  });
  const soft = [...parts].filter((p) => p.factor >= 0.9).sort((a, b) => b.factor - a.factor).map((p) => p.label);
  const hard = parts.filter((p) => p.factor <= 0.5).map((p) => p.label);
  const breakable = parts.filter((p) => p.breakHp).map((p) => p.label);
  const stun = parts.filter((p) => p.stunPart).map((p) => p.label);
  return { elems, soft, hard, breakable, stun };
}

/** Freigeschaltete Einträge eines Brockens bei `fights` Kämpfen. */
export function unlockedEntries(b, fights) { return fights > 0 ? b.entries.filter((e) => e.at <= fights) : []; }
/** Kämpfe bis zum nächsten Eintrag (null = alles bekannt). */
export function nextUnlock(b, fights) { const n = b.entries.find((e) => e.at > fights); return n ? n.at - fights : null; }
