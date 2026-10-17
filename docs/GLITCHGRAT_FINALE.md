# Glitchgrat: Das Finale von Glitch Hunter (Design-Spezifikation)

> Status: **Finale implementiert; Geräte- und Spielzeitabnahme offen (16. Oktober 2026)**.
> Vierte und finale Karte des Spiels, 3 Apex-Drachen (Die Herrscher des Gebirges) + geheimer finaler Boss (Der Ur-Hahn / Gockelok).

## Verbindlicher Qualitätsmaßstab (Owner, 16. Oktober 2026)

Das Finale setzt den neuen Maßstab für Glitch Hunter: bessere Silhouetten, feinere Animationen,
anspruchsvollere und abwechslungsreichere Kämpfe. Der billige PS1-Abklatsch mit absurden
Glitches und schnellem Spaß mit Freunden bleibt die Identität. Keine sterile Hochglanz-Optik.
Bestehende Gegner werden erst nach einem spielbaren, getesteten Apex als Vergleich überarbeitet.

**Aktueller Bauabschnitt:** Alle vier Gegner mit eigenen Rigs, drei Kampfzuständen,
Teilbruch-Folgen, deterministischen Angriffen, Drops und Aufträgen sind implementiert.
Die drei Apex wechseln per synchronisiertem Flug die Zone; Gockelok bleibt am Weltenkamm.
Die Auftragskette führt von JR 10 bis JR 14, alle sieben Waffen erhalten Stufe 7.
Die nachstehenden Qualitätsziele bleiben Abnahmekriterien; insbesondere Jagddauer und
Leistung auf echten Mobilgeräten sind noch nicht durch Spieltests belegt.

### Implementierungs- und Prüfstand

- **Pyrostur:** nach Owner-Kritik einzeln als Elder überarbeitet: sechsarmige Crimson-/Obsidian-
  Silhouette, 16 Angriffe mit Pirschsprüngen, echte Flammen-/Dampfeffekte, aggressivere
  spätere Ketten und deutlich höherer Trefferschaden bei weiterhin 22.000 HP.
  420 Brustschaden im begrenzten Überdruckfenster erzeugen 3,2 s Taumeln, mit 18 s Konterpause.
  Details und offene menschliche Abnahme: [Pyrostur-Umbau](PYROSTUR_ELDER_REWORK.md).
- **Felsengroll:** zehn Angriffe, versetzte Beben, sichtbare Schlackefelder, Meteor und
  verzweigter finaler Bodenbruch. Schulterbruch öffnet die Flanke; Keulenbruch entfernt Außenhits.
- **Voltiris:** dreizehn Angriffe einschließlich Teilbruchvarianten, asymmetrische Prismaflügel,
  augenlose Drahtgitter-Nachbilder und vorbereitete Blitzbahnen. Antennen und Flügel verändern Serien.
- **Gockelok:** elf Angriffe einschließlich Varianten, fünf Pickhiebe, Pusteschrei,
  drei Eier mit je drei Splittern, Spornwirbel und dreiteiliger Sprint mit Stolperfenster.
  Der Kopf sinkt beim Picken und Stolpern in Nahkampfreichweite. Der Wirbel verwendet hohen
  Schaden; ein zusätzlicher Blutungsstatus wird nicht eingeführt.
- **Flug:** frühestens nach 65 s Bodenkampf, 8,6 s Flugereignis, 25 m Flughöhe,
  3 s Zielkreis vor dem Einschlag, danach 1,8 s Erholung. Host überträgt Ziel, Seed und Tempo;
  die Höheninterpolation ist auch zwischen unterschiedlich hohen Plateaus deterministisch.
- **Progression:** jeder Teilbruch liefert verwendbares Material. Stufe 7 vereint die beiden
  Stufe-6-Äste; Schmuck baut auf den bestehenden Waffen auf und bewahrt Griffe, Sockets und Morphs.
- **Automatisiert:** echte Spielerwaffen und Projektile gegen Pyrostur, alle vier Phasenverläufe,
  90-s-Kampfsimulationen, Positionsdruck bei 3/6/12 m, Teilbrüche, Rezepte, Save-Grenzen und
  Host/Gast-Angriffs-/Teilbruch-/Tod-/Flug-Replay über die echten HuntNet-Handler.
- **Browser:** Modell-, Signatur-, Phasen- und Teilbruchansichten sowie Flug/Landung mit der
  echten Welt und Touch-Oberfläche geprüft; Layouts 568×320, 740×360 und 844×390.
  Reproduzierbare Entwickleransicht: `tools/glitchgrat-combat-review.html` (nur lokal über Vite).
- **Noch offen:** Android Chrome und iPhone Safari auf echten Geräten, reale WebRTC-Verbindung
  zwischen mehreren Geräten sowie gemessene vollständige Solo-/Koop-Jagddauern. Die
  Drucksimulation beweist keine pauschale Überlegenheit gegenüber jedem bisherigen Boss;
  insbesondere alte Dauerschadensangriffe sind in dieser Metrik sehr stark. Alte Gegner
  werden deshalb erst nach menschlichen Vergleichsjagden auf den neuen Maßstab angepasst.

### Kampfregeln für alle vier neuen Gegner

- Schwierigkeit entsteht durch Raumwahl, unterscheidbare Ketten und Gegenentscheidungen.
  HP sind Startwerte; Ziel sind vorläufig 6–9 Minuten für einen eingespielten Solo-Pirscher mit
  passender Ausrüstung, 8–11 Minuten beim Ur-Hahn. Erst am vollständigen Kampf abstimmen.
- Mindestens acht eigenständige Angriffe je Drache, drei sinnvolle Kettenfamilien und drei
  Kampfzustände: Kennenlernen, verschärfte Signatur, angeschlagenes Finale. Keine bloßen
  Wiederholungen mit mehr Schaden. Ketten höchstens drei Glieder; Abschluss bietet ein
  sichtbares Fenster von mindestens 1,0 s, Signatur-Konter mindestens 1,5 s.
- Telegraph mindestens 0,5 s auch in Rotglut; neue große Flächen mindestens 0,9 s.
  Verzögerte Treffer haben eine eigene Haltepose und einen hörbaren Auslöser. Kein unsichtbares
  Nachführen nach dem sichtbaren Commit. Alle Schadensformen brauchen Fairness-Audits.
- Je Gegner mindestens zwei sinnvolle Teilbrüche, die Angriffe oder ihre sicheren Räume
  verändern. Eine Nahkampf- und eine Fernkampfantwort auf die Signatur, ohne Pflichtwaffe
  oder Pflichtitem. Fehler dürfen wehtun; keine garantierten Trefferketten nach dem Aufstehen.
- Reaktionen auf Spielerpositionen und wiederholtes Verhalten beeinflussen Gewichte;
  sie lesen keine Tastendrücke. Zufall, Varianten und Flugziele entscheidet ausschließlich der
  Host und überträgt sie an Gäste. Koop-Zielwechsel bleiben vorher erkennbar.
- Flugwechsel sind kurze Ereignisse zwischen Kampfabschnitten. Mindestens 75 % der aktiven
  Kampfzeit bleibt für Nahkämpfer erreichbar. Keine minutenlange Verfolgung, keine
  erzwungene Filmkamera; Schatten und Bodenmarkierung vermitteln den Einschlag.

### Eigenes Handwerk statt vier Varianten derselben Echse

| Gegner | Optische Signatur | Spielerentscheidung | Belohnung für Beherrschung |
|---|---|---|---|
| **Pyrostur** | Breite Kesselflügel, schwerer Brustbalg, schiefes Überdruckventil; Brust und Flügel pumpen vor Dampfstößen | Druck am sichtbaren Brustzustand lesen, seitliche Ablässe umspielen, nach Feuerregen zum entlüfteten Brustteil wechseln | Ventilbruch verändert den Ablass; rechtzeitiger Brustbruch während Überdruck erzeugt eine lange, sichere Öffnung |
| **Felsengroll** | Tief sitzender Schlackekörper, gestapelte Schulterplatten, übergroße Schweifkeule | Versetzte Bodenwellen und langsam scharf werdende Schlackefelder so lenken, dass Laufwege offen bleiben | Schulterbruch öffnet eine Flanke; Keulenbruch entfernt den äußeren Nachschlag und verändert seine Ketten |
| **Voltiris** | Dünne Antennenkrone, asymmetrische Prismaflügel, abgesetzte Nachbilder | Echten Körper an Pose und Ton erkennen; angekündigte Blitzbahnen gemeinsam platzieren, dann aus dem Raster treten | Antennenbruch nimmt eine Blitzbahn, Flügelbruch verkürzt die Nachbildserie; kein Raten zwischen identischen Attrappen |
| **Gockelok** | Lächerlich großer Hahn, schlabbriger Kamm, übertriebener Brustkorb, gelbe Stelzen; jede Attacke hat eine klare Kopf-/Fußpose | Picken seitlich verlassen, Hals-Aufblasen lesen, Eier gezielt aus dem Zentrum ziehen; nach der letzten Sprintwende angreifen | Spornbruch verkürzt den Wirbel, Kammbruch schwächt den Schrei; nach der Sprintserie stolpert der Hahn spektakulär |

### Optik, Mobile und Koop als Abnahme

- Modelle aus bestehender Geometrie-/Rig-Technik mit deutlichen Proportionen, eigenen
  Windup-, Treffer- und Erschöpfungsposen; verletzte Teile bleiben sichtbar beschädigt.
  Zusätzliche Details sitzen an Silhouette und bewegten Teilen, nicht als Partikelwand.
- Ruhige, ausreichend helle Kampfböden; Rot bleibt Gefahrenmarkierungen vorbehalten.
  Glitch zeigt Charakter und Zustand, verdeckt aber keine Hitboxen. Voltiris nutzt versetzte
  Konturen und einzelne Impulse statt wiederholter Vollbild-Stroboskope.
- Drei günstige Fernkulissen, gebündelte Props, vorberechnete Navigation; keine Echtzeit-
  Schattenkarten oder zusätzlichen Vollbild-Renderpässe für das Finale.
- Vor Release: alle sieben Waffen gegen den ersten Apex, Teilbruch-/Phasen-/Fairness-Tests,
  Host/Gast-Flug und Landung, Touch bei 568×320, 740×360 und 844×390 prüfen.
  Zielgerät-Test auf Android Chrome und iPhone Safari separat dokumentieren; Desktop-FPS
  oder Touch-Layout-Unit-Tests sind kein Ersatz für echte Geräte.
- Baufolge: Karte → Pyrostur als vollständiger Maßstab inkl. Drops/Quest/Progression →
  Felsengroll → Voltiris → Ur-Hahn mit Enthüllung und Stufe 7 → gezielter Rückport auf alte Gegner.

---

## 0. Vision & Kern-Säulen

1. **Die Krone der Welt:** Die finale Karte liegt als karges, windgepeitschtes Hochgebirge hoch über allen bisherigen Welten. An den Steilkanten blickt man tief hinab und erkennt die Silhouetten der Schotterklamm, der rauchenden Rostwerke und des Dschungels der Smaragdküste.
2. **Glitch-Korruption am Ursprung:** Auf dem Gebirgskamm bricht der Spiele-Code auf: schwebende Gesteins-Cluster mit Z-Fighting, Neon-Drahtgitter-Kanten im Basalt, vertikale Daten-Lichtschächte und eiskalter Glitch-Wind.
3. **Cinema-Flug der Apex-Drachen:** 3 gewaltige Wyvern/Drachen beherrschen den Luftraum. Sie wechseln Zonen nicht zu Fuß, sondern steigen mit mächtigen Flügelschlägen auf, werfen riesige Schatten über die Karte und schlagen wie Kometen in ihrer Zielzone ein.
4. **Der ultimative Twist & Skill-Check:** Nach dem Sieg über die 3 Drachen löst ein dramatisches Eil-Dekret im Rostnest Panik aus: Eine uralte Monstrosität erwacht auf dem Weltenkamm! Doch wer den Gipfel betritt, blickt einem **riesigen, scuffed PS1-Hahn** in die Augen – der zugleich der härteste, schnellste und unbarmherzigste Kampf des gesamten Spiels ist.

---

## 1. Die Map: „Glitchgrat“ (`glitchgrat`)

### 1.1 Zonen-Struktur
Map-Größe: $260 \times 260\,\text{m}$ ($[-130, 130]^2$), 4 Zonen:
- **Zone 1: Basislager & Nebelkamm** ($x < 0, z < 0$): Landestelle des Pirscher-Gleiters, Zeltlager, Felsbrücken. Aussichtspunkt nach Süden auf die Schotterklamm.
- **Zone 2: Die Blitzschlucht** ($x < 0, z > 0$): Zerklüfteter Pass mit schwebenden Monolithen und Neon-Adern. Nistplatz von Voltiris.
- **Zone 3: Eisenerz-Plateau** ($x > 0, z > 0$): Weite, windige Hochebene mit Blick nach Westen (Rostwerke) und Osten (Smaragdküste). Nistplatz von Felsengroll.
- **Zone 4: Der Weltenkamm** ($x > 0, z < 0$): Das höchste Dach der Welt. Uraltes, kreisrundes Felsenplateau, Glitch-Spalten. Nistplatz von Pyrostur – und Arena des Ur-Hahns.

### 1.2 Vista-System (Blick ins Tal)
Die Tal-Silhouetten nutzen eine eigene, weitere Nebelspanne. Der dichte Nebel der eigentlichen
Karte bleibt erhalten; die Kamera erfasst die vereinfachten Kulissen ohne weitere Renderpässe:
- **Süd-Klippe (Z1):** Ocker- und Sandtöne, ferne Felssäulen der Schotterklamm.
- **West-Klippe (Z3):** Dunkle Silhouetten rauchender Kessel, Kräne und Funken der Rostwerke.
- **Ost-Klippe (Z3/Z4):** Türkiser Meer-Horizont und tiefgrünes Dschungeldach der Smaragdküste.

### 1.3 Bodentypen & Texturen
- `ridge_rock`: Karger, graublauer Gebirgsstein mit feinen Neon-Glitch-Rissen.
- `ridge_frost`: Gefrorene Schotterflächen (schnelleres Laufen, aber Ausweich-Rollen gleiten minimal weiter).
- `ridge_ore`: Dunkles Eisenerz mit schimmernden Pixeln.
- `glitch_core`: Der Boden von Zone 4, durchzogen von pulsierenden Datenlinien.

---

## 2. Die 3 Apex-Drachen

| | Pyrostur | Felsengroll | Voltiris |
|---|---|---|---|
| **Rolle** | Herr der Flammen & Dampf | Erdbeben- & Schlackewyvern | Flimmer- & Blitzwyvern |
| **Ahnen** | Brathalos + Kroll | Barrotz + Gorgo + Krachfaust | Voltaro + Blendax + Mampfaffe |
| **HP (Solo)** | 22 000 | 24 000 | 23 000 |
| **Nest** | Zone 4 | Zone 3 | Zone 2 |
| **Route** | [4, 3, 2] | [3, 2, 1] | [2, 1, 4] |
| **Zonenwechsel** | Cinema-Flug | Cinema-Flug | Cinema-Flug |
| **Elemente** | Feuer 0, Schock 15, Wasser 25 | Feuer 20, Schock 0, Sprengung 25 | Schock 0, Feuer 20, Eis 20 |
| **Signatur** | Kesseldampf-Ablass + Feuerregen | Meteor-Einschlag + Sprengpfützen | Strobe-Blitzsturm + Zickzack-Laser |

### 2.1 Der Cinema-Flug (Gemeinsame Mechanik)
Beim Zonenwechsel läuft der Drache nicht:
1. Hebt mit lautem Windstoß senkrecht ab ($y + 25\,\text{m}$).
2. Schwebender Schatten wandert auf der Minimap und über das Terrain zur Zielzone.
3. Nach 3 Sekunden Vorwarnung (roter Zielkreis in der Zielzone) schlägt er mit Wucht und Schockwelle ein.

---

## 3. Der finale Boss: „Gockelok“ (Der Ur-Hahn)

> *„Man erwartete das Ende der Welt. Man fand ein Huhn. Und dann starb man.“*

### 3.1 Konzept & Rig
- **Look:** Übergroßer (3,5-fache Pirscher-Höhe), blockiger PS1-Kampfhahn. Roter Wackelkamm, staksige gelbe Beine mit langen Spornen, gefiederte Flügel mit Glitch-Fransen, irrer Blick.
- **HP:** zunächst 28 000 (Solo), hoher Druck, klar verdiente Erholungspausen nach Ketten und Signaturen.
- **Geschwindigkeit:** Höchstes Bewegungstempo im Spiel (`speedFactor 1.35`), blitzschnelle Richtungswechsel.

### 3.2 Moveset
1. **Maschinengewehr-Picken:** 5 blitzschnelle Pick-Hiebe vor sich in den Boden mit Mikro-Schockwellen.
2. **Kikeriki des Untergangs:** Hebt den Kopf, Hals bläht sich auf – ohrenbetäubender Schrei (Bitcrush-Audio), 15 m Schockwelle, entzieht Puste und bricht Aktionen.
3. **Flatter-Artillerie:** Hebt kurz ab, schlägt mit den Flügeln und feuert 3 Glitch-Eier in hohem Bogen. Eier explodieren beim Kontakt in 3 Splitter.
4. **Sporn-Wirbeltritt:** 360°-Drehkick der Hinterläufe mit Blutung/hohem Schaden.
5. **Kopfloser Sprint (Wut):** Rennt im Zickzack wie von Sinnen quer durch die Arena, trampelt alles nieder.

---

## 4. Progression & Ränge

| JR | Freischalt-Quest | Typ | Monster | Belohnung | RP |
|---|---|---|---|---|---|
| **11** | Der Glutsturm | Jagd | Pyrostur | 6 000 | 350 |
| **12** | Groll der Berge | Jagd | Felsengroll | 6 500 | 400 |
| **13** | Gewitter am Abgrund | Jagd | Voltiris | 7 000 | 450 |
| **14** | **Das Kikeriki des Untergangs** | Finale | Gockelok | 12 000 | 600 |

- **MAX_JR:** Steigt auf **14**.
- **Material:** `glitchgrat_erz`, `drachen_herz`, `gockel_sporn`, `gockel_feder`, `ur_gockelei`
  sowie die artspezifischen Apex-Materialien (siehe `src/data/items.js` und `src/data/drops.js`).
- **Waffen Stufe 7 („Glitch-Transzendenz“):** Höchste Stufe aller 7 Waffenarten, ultimative Werte und einzigartige Glitch-Verzerrungen.
