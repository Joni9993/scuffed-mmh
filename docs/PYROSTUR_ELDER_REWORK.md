# Pyrostur: Elder-Umbau

## Auftrag und Maßstab

Owner-Feedback: Das erste Finale war langweilig, zu leicht und optisch nicht bedrohlich.
Grüne technische Tests belegten keine gute Jagd. Zunächst wird ausschließlich Pyrostur
überarbeitet. Referenzen sind Diablos und Nargacuga: Masse und Raumkontrolle treffen
explosive Jagdbewegung, verbunden durch den eigenen Druck-/Flammencharakter.
Erste Fehlversuche sind ausdrücklich erwünscht; Endgame-Ausrüstung ersetzt das Lernen nicht.
Der absichtlich kantige PS1-/Glitch-Look bleibt, die Animation muss trotzdem präzise sein.

## Umsetzung

- Crimson-/Obsidian-Panzer, schwere Schulterpartie, zurückgezogene dunkle Kronenhörner,
  S-Hals, glühende Brustfissuren, vier separate Lastbeine und zwei große Flugorgane.
  Rund 68 Modell-Meshes und 7.300 Dreiecke; Farben als Vertexdaten, Geometrie pro Gelenk/Oberfläche gebündelt.
  Rund 21 m Spannweite. Innere Flügelsegel reichen bis zum beweglichen Torsoanschluss.
- Zusätzliche Schulter-, Ellbogen-, Handgelenk-, Nacken- und Schweifkanäle.
  Vorderklauen und gegliederte Hinterläufe erhalten eine begrenzte Korrektur gegen Bodenpenetration, unabhängig von
  der Kartenhöhe. Horn-, Flügel- und Schweifposen wurden anhand ihrer transformierten
  Gelenke geprüft und Trefferformen an die neue Reichweite angepasst.
- 16 Angriffe: Biss, Flügelhammer, Schweiffeger, Dampfablass, beschädigter Ablass,
  Ofenschneise, Kesselramme, Feuerregen, Überdruck, Notabschaltung, Hornbrecher,
  linke/rechte Glutpirsch, Ambossschweif, Schlackenbremse und Glutfessel.
- Glutpirsch bewegt ihn erst seitlich, dann mit einem Satz nach vorne. Hornhieb und Ramme
  ziehen tatsächlich den Körper mit. Die Bremsramme kündigt ihren anschließenden
  Feuerstoß separat an. Der Schweifhammer hebt die gegliederte Waffe zweimal.
- Drei Zustände mit Übergängen bei 72 % und 38 % HP. Spätere Zustände verbinden häufiger
  bis zu drei Angriffe. Erreichbarkeit und Spielerposition filtern die Fortsetzung.
  Die letzten vier beendeten Angriffe dämpfen Wiederholungen. Signaturen beenden ihre Kette.
- HP bleiben 22.000. Haupttreffer liegen meist bei 165–210 Rohschaden, Überdruck bei 260.
  Bei Schutz 150 kommen davon etwa 57–73 bzw. 90 HP an, vor Rotglut und anderen Faktoren.
  Wichtige Angriffe sind auch in Rotglut mindestens 0,5 s angekündigt; große Angriffe länger.
- Mehrteilige Trefferformen desselben Einschlags teilen sich eine Treffergruppe. Hörner
  und Schädel können dadurch auch gegen Rückstoßschutz nicht mehrfach gleichzeitig treffen.
- Druckkonter: sichtbare Brustöffnung zwischen Angriffszeit 0,9 und 2,9 (Explosion bei 3,2);
  420 Brustschaden, im Koop mit der Wurzel der HP-Skalierung erhöht. Erfolg gibt 3,2 s
  Taumeln und 18 s Schutz gegen wiederholtes Abschalten. Die innere Tasche vermeidet
  die Explosion auch ohne erfolgreichen Schadenskonter. Kein Pflichtkonter für jede Waffe.
- Zwei begrenzte Effekt-Batches zeigen Feuerbahnen, fallenden Feuerregen, Dampf und
  Einschlagspuren direkt aus dem deterministischen Angriff. Keine eigenen Schadenstimer,
  dynamischen Lichter oder zusätzlichen Vollbildpässe. Vier prozedurale Sounds unterscheiden
  Feuerstrahl, Druckaufbau, Krallenkontakt und Ofenbrüllen.
- Farbhinweise liegen auf Brust und Ventil; der Ganzkörperglanz verdeckt bei Pyrostur
  nicht mehr Panzerung, Hörner und Bewegung. Andere Brocken behalten ihre bisherigen Cues.

## Prüfung und Grenzen

`pyrosturHardcore.test.js` prüft echte Spieler mit Schutz 150 und 190 HP sowie reale
Waffenangriffe über die produktive Schadensauflösung. Verglichen werden auch die zweite
Kampfminute, verschiedene Distanzen und Angriffsrichtungen. Reines Dauerschlagen mit
Stufe 6x oder 7 darf Pyrostur nicht niederhalten oder besiegen. Das beweist Gegenwehr,
keine menschlich gemessene Schwierigkeit oder Spielqualität.

Weitere Prüfungen: deterministischer Host/Gast-Replay, echte Treffergruppen gegen
Rückstoßschutz, erreichbare Konterpose, begrenzte Effekte, Animationsgelenke und
Ausweichfenster. Der Druckkonter ist mit echten Großschwert-Eingaben ab Angriffsbeginn
und vorbereiteten Bogen-/Armbrust-Finishern nach 0,35 s Reaktionszeit nachgewiesen.
Die Armbrust braucht einen seitlichen Winkel: Frontal kann der Kopf den Schuss abfangen.
Die lokale Ansicht `tools/glitchgrat-combat-review.html` erlaubt jeden
Angriff einzeln, Schritte von 0,1 s, Zielkamera und eine Jagd ohne Unverwundbarkeit.
Änderungen dort betreffen nur die aktuelle Jagd und speichern keine Freischaltungen.

Offen bleiben Owner-/Freundesjagden für Lesbarkeit, Spaß, gewünschte Gesamtdauer und
die subjektive Qualität des neuen Looks sowie echte Android-/iPhone-Geräte. Die anderen
drei Finale-Gegner wurden noch nicht auf diesen Stand gebracht. „Premium“ ist deshalb
keine allein aus Tests abgeleitete Abnahmebehauptung.

## Visueller Neustart vom 17. Oktober

Der erste Elder-Umbau erfüllte den gewünschten Standard aus Sicht des Owners nicht.
Das neue Vorbild ist Safi'jiiva. Die Silhouette ersetzt den bisherigen Flügelarm-Körper
vollständig. Vier Beine tragen einen distanzgetriebenen Gang: beim Schreiten mindestens
drei, beim Joggen mindestens zwei bodennahe Füße. Flügel atmen unabhängig vom Schritt;
Kopf und Hals richten sich zum Ziel aus. Die Augen liegen vor dem Wangenpanzer.
Ein eigener Shader gibt nur Pyrosturs Haut und Segeln Schuppen-/Lederdetails.

Die Krone hat passende rückwärtige Hurtshapes; die alten unsichtbaren vorderen Stoßhörner
sind entfernt. Der frühere Flügelhammer nutzt jetzt die Vorderklauen mit passender
Bodentrefferform. Beim Überdruck hebt sich die Krone vom Brustkern weg. Der tatsächlich
überlappte Kern hat im Konterfenster Faktor 1,2, damit breite Waffen ihn gegenüber
angrenzender Rüstung priorisieren. Echte Konterstrategien sind erneut geprüft: GS seitlich
bei (-4,4), Armbrust bei (12,7), Bogen wie zuvor bei (10,17), relativ zum Boss.

Dauerhafte Ventilglut und Funken zeigen Druck zwischen Angriffen. Vier weiche Fußkontakte
teilen sich einen Instancing-Draw; keine Shadow-Map oder zusätzlichen Lichter.

`tools/pyrostur-design-review.html` zeigt das **produktive Rig** unter neutralem Licht,
mit Profil/Kopf/Front, Atmung, vierbeinigem Gang, Drohen und echter Ofenschneisen-Pose.
Die Laufzyklen laufen dort auf der Stelle. Das ist eine lokale Modellstudie, kein Nachweis
für Jagdqualität. Die echte Kartenbeleuchtung bleibt über die Kampfprüfansicht kontrollierbar.

Dieser Abschnitt überarbeitet Erscheinung und körperliche Präsenz. Ein systematischer
Umbau der Verfolgung gegen langsam kreisende Jäger und kürzere, zusammenhängende
Kampfsequenzen bleiben als nächster Kampfabschnitt offen. Tests gegen stillstehende Jäger
dürfen nicht als Nachweis ausgegeben werden, dass Kreisen bereits bestraft wird.
