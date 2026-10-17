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
  {
    id: 'blendax', name: 'Blendax', where: 'Smaragdküste · Dschungel & Tiefer Dschungel', title: 'Flimmerfürst',
    intro: 'Ein Raptor mit einem Schirm wie ein kaputter Bildschirm. Wenn er flackert, ist es zu spät zum Nachdenken: nicht hinsehen.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Bissreihe & Hüpfer', text: 'Wie Jaggo, nur schneller und härter. Drei Bisse, dann ein Sprung bis 12 m. Rollen, nicht rückwärts laufen.' },
      { at: 1, kind: 'angriff', name: 'Blitz', text: 'Der Schirm klappt auf und flackert neongrün, dazu ein Pfeifen. Eine Sekunde später blendet er alle, die ihn ansehen: 1 s Weiß, 1 s Sterne, und er springt dir schon entgegen. Wegdrehen hilft.' },
      { at: 2, kind: 'angriff', name: 'Sprungkette', text: 'Nach dem Blitz: drei Sprünge hintereinander auf den Geblendeten, jeder landet dort, wo du eben standest. Der grüne Ring am Boden zeigt wohin.' },
      { at: 2, kind: 'verhalten', name: 'Glitch-Konter', text: 'Wer ihn im Moment des Blitzes ansieht und im richtigen Augenblick rollt, kontert mit einem Glitch: Blendax taumelt knapp 2 s.' },
      { at: 3, kind: 'schwaeche', name: 'Schirm', text: 'Schock auf den Schirm schließt ihn kurz: 6 s kein Blitz. Bricht er, blitzt Blendax nie wieder, springt dafür 25 s lang in wütenden Ketten.' },
      { at: 3, kind: 'verhalten', name: 'Nebel', text: 'Im Tiefen Dschungel blitzt er öfter und von weiter weg. Den Schirm erkennst du auch im Nebel.' },
      { at: 4, kind: 'angriff', name: 'Flimmerfieber', text: 'Unter der Hälfte rennt er in einem Bogen heran und beißt zum Schluss. Der Blitz kommt dann öfter.' },
    ],
  },
  {
    id: 'mampfaffe', name: 'Mampfaffe', where: 'Smaragdküste · Strand & Dschungel', title: 'Magenkönig',
    intro: 'Ein hockender Affe, der alles frisst, was im Dschungel wächst, und von jedem Happen etwas ganz anderes wird. Sein Fell leuchtet in der Farbe seines letzten Futters: lies es, bevor er zuschlägt.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Fäuste', text: 'Ausfallschritt, linke Faust, rechte Faust, dann beide Fäuste in den Boden. Seitlich raus, nicht zurück. Der grüne Ring am Boden zeigt die Reichweite.' },
      { at: 1, kind: 'verhalten', name: 'Fressen', text: 'Er sucht Kokosnüsse, Feuerpilze, Giftkraut und Glitchpilze, läuft hin und mampft 2 s lang mit offenem Maul: freier Schlag. Wer die Stellen vorher abräumt, nimmt ihm den Buff.' },
      { at: 2, kind: 'verhalten', name: 'Futterklau', text: 'Sein Wischer klaut dir genau eines der vier Futter aus dem Beutel (Kokosnuss, Feuerpilz, Giftkraut, Glitchpilz), sonst nichts. Er frisst es sofort und wird zu dem, was du geerntet hattest.' },
      { at: 2, kind: 'angriff', name: 'Stampfer, Rolle & Brusttrommeln', text: 'Hocksprung mit Schockwelle (5 m). Rolle als Fellkugel, 12 m geradeaus: seitlich raus, an der Wand knallt er dagegen und ist 1 s benommen. Beim Trommeln nagelt er alle im 8-m-Ring kurz fest: im richtigen Moment rollen kontert mit einem Glitch.' },
      { at: 2, kind: 'angriff', name: 'Kokos (braunes Fell)', text: 'Harter Schädel: Kopftreffer richten nur halben Schaden an und klingen nach Kokosnuss. Dazu wirft er drei Kokosnüsse in hohem Bogen, die Ringe am Boden zeigen den Aufschlag.' },
      { at: 3, kind: 'angriff', name: 'Feuerpilz (rotes Fell)', text: 'Die Backen blähen sich rot auf wie Ballons, dann ein Feuerrülpser im Kegel, 8 m: Brennen. Mit dem Pilz im Bauch ist er feuerfest.' },
      { at: 3, kind: 'angriff', name: 'Giftkraut (gelbgrünes Fell)', text: 'Er spuckt eine Stinkwolke, 5,5 m, 9 s: Gift, und du kannst keine Items benutzen, solange du drinstehst. Raus, dann heilen.' },
      { at: 4, kind: 'angriff', name: 'Glitchpilz (grünes Flackern)', text: 'Er flackert aus dem Bild und taucht bis 9 m weiter neben dir wieder auf. Jeder Treffer verwirrt dich 3 s: Steuerung verkehrt. Sprudelwasser hilft. Schock gibt ihm einen Kurzschluss.' },
      { at: 4, kind: 'schwaeche', name: 'Magen', text: 'Betäubung oder Kopfbruch spucken den Pilz wieder aus. Ist alles Futter im Revier weg, wird er nach zwei Minuten hungrig und aggressiv. Feuer wirkt auf den Bauch, Schock auf die Beine.' },
    ],
  },
  {
    id: 'krachfaust', name: 'Krachfaust', where: 'Smaragdküste · Verfluchter Tempel', title: 'Tempelbrecher',
    intro: 'Der Herr des Tempels. Seine Fäuste und sein Schädel sind mit grünem Pixelschleim überzogen, der pulsiert, bevor er platzt. Alles, was den Tempel betritt, bekommt Prügel, auch die anderen Brocken.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Schleimfaust', text: 'Ein Hieb mit der Rechten. Trifft er, klebt der Schleim an dir; verfehlt er, bleibt er als Pfütze liegen. Beides platzt nach 2 s.' },
      { at: 1, kind: 'verhalten', name: 'Schleim abrollen', text: 'Dunkelgrün pulsiert langsam, hellgrün schneller, weißgrün ist gleich vorbei. Eine Rolle schüttelt den Schleim vom Körper. Pfützen darf man umgehen.' },
      { at: 2, kind: 'angriff', name: 'Trommelwirbel', text: 'Vier Schläge im Wechsel, jeder hinterlässt Schleim. Zwischen den Pfützen laufen, nicht stehen bleiben.' },
      { at: 2, kind: 'angriff', name: 'Sprungstampfer & Kopfstoß', text: 'Er springt auf dich zu oder rammt mit dem Schädel, dahinter Schleimkleckse. Der Stampfer legt einen Ring.' },
      { at: 3, kind: 'angriff', name: 'Schleimsalve', text: 'Drei Schleimbälle aus der Ferne: Weglaufen löst das Problem nicht, nur Rollen.' },
      { at: 3, kind: 'verhalten', name: 'Revier', text: 'Im Tempel greift er jeden an. Wer sich mit ihm anlegen will, soll andere Brocken einlassen.' },
      { at: 4, kind: 'verhalten', name: 'Runenwut', text: 'Unter 40 % Leben glühen die Tempelrunen grün, der Schleim zündet schneller, jeder Schlag macht eine kleine Druckwelle.' },
      { at: 4, kind: 'angriff', name: 'Urknall', text: 'Am Ende lädt er 5 s auf. Der Boden pulsiert, das Licht flackert. Dann geht die ganze Plattform hoch: 70 % deiner Leben, außer eine hohe Säule schirmt dich ab. Sie bricht danach.' },
      { at: 5, kind: 'schwaeche', name: 'Schock', text: 'Schock fährt durch den Schleim, Pfützen platzen früh und harmlos. Fäuste und Kopf sind die Brechstellen.' },
    ],
  },
];
BESTIARY.push(
  {
    id: 'pyrostur', name: 'Pyrostur', where: 'Glitchgrat · Weltenkamm', title: 'Kessel ohne TÜV',
    intro: 'Hornpanzer, Flügelklauen und ein glühender Brustkessel. Dieser alte Drache geht seitlich auf Pirsch, bevor er die Lücke mit einem Satz schließt. Sein Sicherheitszertifikat ist längst verbrannt.',
    entries: [
      { at: 1, kind: 'verhalten', name: 'Druck lesen', text: 'Die Nadel steigt, die Brust schwillt an. Überdruck entlädt sich um ihn herum; nahe an der abgesenkten Brust bleibt eine sichere Tasche.' },
      { at: 1, kind: 'schwaeche', name: 'Notabschaltung von Hand', text: 'Wird die abgesenkte Brust beim Aufladen hell, kann gebündelter Schaden den Überdruck unterbrechen. Das Fenster schließt vor der Explosion. Nach einer Abschaltung braucht der Trick eine Pause; die innere Brusttasche bleibt eine Ausweichmöglichkeit.' },
      { at: 1, kind: 'angriff', name: 'Pirsch und Hornbrecher', text: 'Der seitliche Satz kündigt die Sprungrichtung an. Verlasse die Anflugbahn. Nach der Landung kann ein Hornhieb folgen; im Kernbruch jagt er auch zur Gegenseite weiter. Ein niedriger Kopf kündigt den Aufwärtshieb an.' },
      { at: 2, kind: 'schwaeche', name: 'Ventilbruch', text: 'Ein gebrochenes Ventil verändert die Dampfablässe. Die zerstörte Brust bleibt weich, die angeschlagenen Flügel bremsen seine Verfolgung.' },
      { at: 2, kind: 'angriff', name: 'Schweifhammer und Bremsramme', text: 'Ein hochgestellter Schweif fällt zweimal; der zweite Schlag reicht weiter. Bremst die Ramme mit ausgebreiteten Flügeln, folgt ein eigener Feuerstoß. Erst nach dem Abschluss sind Kopf und Brust lange offen.' },
      { at: 3, kind: 'angriff', name: 'Feuerregen', text: 'Die Feuerfelder treffen versetzt in festen Bahnen. Wechsle die Seite oder gehe zur entlüfteten Brust, statt geradeaus vor ihm wegzurennen.' },
    ],
  },
  {
    id: 'felsengroll', name: 'Felsengroll', where: 'Glitchgrat · Eisenerz-Plateau', title: 'Beweglicher Bergschaden',
    intro: 'Breite Schulterplatten, ein Schlackebauch und eine Keule mit eigener Postleitzahl. Seine Angriffe bestimmen, welche Bodenbahnen offen bleiben.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Versetzte Erdbeben', text: 'Seine Wellen laufen zeitversetzt über den Boden. Die roten Bahnen zeigen den echten Treffbereich; offene Zwischenräume sind kein Zufall.' },
      { at: 1, kind: 'schwaeche', name: 'Schulter öffnen', text: 'Brich die Schulterplatten, um eine weichere Flanke zu schaffen. Das ändert den Kampf stärker als ein paar zusätzliche Treffer auf den harten Kopf.' },
      { at: 2, kind: 'schwaeche', name: 'Keule kürzen', text: 'Eine gebrochene Schweifkeule nimmt dem Feger seinen äußeren Nachschlag. Der Stumpf ist noch gefährlich, aber sein sicherer Raum wächst.' },
      { at: 3, kind: 'verhalten', name: 'Einschlag', text: 'Beim Zonenwechsel steigt er über die Felsen. Der wandernde Schatten zeigt seinen Weg; verlasse den Zielkreis vor der Landung.' },
    ],
  },
  {
    id: 'voltiris', name: 'Voltiris', where: 'Glitchgrat · Blitzschlucht', title: 'Gebrochene Frequenz',
    intro: 'Asymmetrische Prismaflügel, Antennen und zu viele Konturen. Der echte Drache hat einen festen Körper und helle Augen; Drahtgitter-Geister sind Ablenkung.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Blitzraster', text: 'Beobachte die angekündigten Blitzbahnen. Positioniere dich zwischen ihnen und greife nach der Entladung an, statt auf die hellste Kontur zu schlagen.' },
      { at: 1, kind: 'schwaeche', name: 'Antennenkrone', text: 'Ein Bruch der Krone entfernt eine Blitzbahn. Ein gebrochener Prismaflügel verkürzt die Nachbildserie und macht den echten Körper leichter lesbar.' },
      { at: 2, kind: 'verhalten', name: 'Glitch gegen Glitch', text: 'Ein perfekter Konter auf seine Blitz-Signaturen unterbricht die Folge. Nutze die Öffnung für eine starke Attacke oder um einen Freund zu entlasten.' },
    ],
  },
  {
    id: 'gockelok', name: 'Gockelok', where: 'Glitchgrat · Weltenkamm', title: 'Ur-Hahn',
    intro: 'Man erwartete das Ende der Welt. Man fand ein Huhn. Und dann starb man. Sein Blick ist dumm; seine Angriffswinkel sind es nicht.',
    entries: [
      { at: 1, kind: 'angriff', name: 'Maschinengewehr-Picken', text: 'Fünf Hiebe nach vorn. Seitlich aus der Pickbahn laufen, statt jeden einzelnen Schnabelkontakt wegrollen zu wollen.' },
      { at: 1, kind: 'angriff', name: 'Kikeriki', text: 'Der Hals bläht sich auf, dann nimmt der Schrei Leben und Puste. Rechtzeitig herauslaufen oder die Schockwelle präzise kontern.' },
      { at: 2, kind: 'schwaeche', name: 'Kamm und Sporn', text: 'Kammbruch schwächt den Schrei, Spornbruch verkürzt den Wirbel. Der stolze Hahn sieht mit jedem Bruch noch beleidigter aus.' },
      { at: 2, kind: 'angriff', name: 'Kopfloser Sprint', text: 'Die Wendepunkte sind fest, sobald er losrennt. Nach der letzten Wende stolpert er: Das ist dein großes Angriffsfenster.' },
      { at: 3, kind: 'angriff', name: 'Glitch-Eier', text: 'Die Eier fliegen in Bögen und zerplatzen in Splitter. Ziehe sie aus der Arenamitte und verlasse die markierten Einschlagflächen.' },
    ],
  },
);
export const BESTIARY_IDS = BESTIARY.map((b) => b.id);

/** Zustände – immer lesbar. who: 'du' (trifft den Pirscher) | 'brocken'. */
export const CONDITIONS = [
  { id: 'burn', name: 'Brennen', who: 'du', text: 'Feuer frisst 3 HP pro Sekunde, 10 s lang. Drei Rollen löschen es. Hitzefell macht es kürzer und schwächer. Töten kann es dich nicht – 1 HP bleibt.' },
  { id: 'poison', name: 'Gift', who: 'du', text: '1,5 HP pro Sekunde für 12 s, Rollen hilft nicht. Sprudelwasser spült es raus. Lässt dich immer mit 1 HP stehen – der nächste Treffer nicht.' },
  { id: 'mud', name: 'Verschlammt', who: 'du', text: 'Langsamer und kein Sprint, bis zu 25 s. Drei Rollen schütteln den Schlamm ab. In der Schlammsenke bei Barrotz an der Tagesordnung.' },
  { id: 'rost', name: 'Rost', who: 'du', text: 'Deine Rüstung schützt 30 % schlechter, 20 s lang. Kommt von Krolls Dampf und Gorgos Schlacke. Panzerhaut verkürzt ihn, Kühlbrause entfernt ihn.' },
  { id: 'shock', name: 'Schock', who: 'du', text: 'Voltaros Blitze. Die Macke Erdung (Voltaro-Set) senkt den Schaden, ein Erdungsstab baut 20 s eine 4-m-Schutzzone – darin trifft dich der Donnerschlag nicht.' },
  { id: 'blend', name: 'Geblendet', who: 'du', text: 'Blendax-Blitz: 1 s Vollbild weiß, danach 1 s betäubt. Nur wer hinsieht. Wegdrehen schützt, ein Glitch-Konter dreht den Spieß um. Die Macke Blendschutz (Blendax-Set) verkürzt beides.' },
  { id: 'verwirrt', name: 'Glitch-Verwirrung', who: 'du', text: 'Mampfaffe mit Glitchpilz: Jeder Treffer dreht deine Steuerung 3 s lang um, auch die Ausweichrolle. Sprudelwasser entfernt sie, die Macke Eisenmagen verkürzt sie.' },
  { id: 'itemlock', name: 'Item-Sperre', who: 'du', text: 'Mampfaffes Stinkwolke: Solange du in der Wolke stehst (und eine Sekunde danach), geht kein Item. Essen und Buffs bleiben. Raus aus der Wolke!' },
  { id: 'schleim', name: 'Glitch-Schleim', who: 'du', text: 'Krachfausts Schleim: pulsiert dunkelgrün, hellgrün, weißgrün, nach 2 s Explosion (28 Schaden, trifft auch Mit-Pirscher). Eine Rolle schüttelt ihn ab, Sprudelwasser auch. Die Macke Schleimhaut (Krachfaust-Set) verlängert die Zündschnur.' },
  { id: 'blast', name: 'Sprengung', who: 'du', text: 'Sprenger-Waffen (Krachfaust-Ast, Stufe 6): Treffer laden das Teil auf, ab 100 knallt es. Eigene Explosionen werfen dich nicht um.' },
  { id: 'bruise', name: 'Prellung', who: 'du', text: 'Die Hälfte jedes Treffers ist nur geprellt (dunkelrot im Balken) und heilt mit der Zeit zurück – solange du nicht gleich wieder getroffen wirst.' },
  { id: 'glitch', name: 'Glitch-Konter & Glitch-Modus', who: 'du', text: 'Perfekt ausgewichen = Glitch-Konter: Zeitlupe, nächster Treffer +50 % und ein Drittel Glitch-Leiste. Volle Leiste: 8 s Glitch-Modus mit +30 % Schaden und dem Waffen-Glitch.' },
  { id: 'm_fed', name: 'Gefüttert', who: 'brocken', text: 'Mampfaffe: 40 s Futter-Buff, das Fell leuchtet in der Futterfarbe (Braun Kokos, Rot Feuer, Gelbgrün Gift, Neongrün Glitch). Betäubung oder Kopfbruch beenden ihn.' },
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
  blendax: 'Schock auf dem Schirm schließt ihn kurz: er flackert wild und blitzt 6 s nicht mehr.',
  mampfaffe: 'Mit Feuerpilz im Bauch ist Feuer wirkungslos; mit Glitchpilz verträgt er keinen Schock (Kurzschluss, Teleport 5 s gesperrt); mit Kokosnuss ist der Kopf hart.',
  krachfaust: 'Schock fährt durch den Schleim und zündet ihn zu früh: Pfützen im Umkreis platzen sofort (harmlos). Feuer perlt ab, er ist sprengfest.',
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
