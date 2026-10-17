# Felsengroll: Elder-Umbau nach Pyrostur-Standard

> **Owner-Steuerung (gilt vorrangig):** Die drei Drachen müssen sich in Verhalten und
> Fähigkeiten klar unterscheiden, nicht nur in Look und Effekten. Der frühere Entwurf
> unten (Leiste → Raserei → Ablass, Vorhalten) kopierte Pyrosturs Kampfschleife und ist
> durch den Abschnitt **„Festung statt Jäger“** ersetzt. Gleich bleibt nur die Qualitätslatte
> (Fairness, Determinismus, Tests, Elder-Look, Endgame-Härte).

## Drei Drachen, drei Kämpfe

| | Pyrostur | **Felsengroll** | Voltiris (geplant) |
|---|---|---|---|
| Rolle | Jäger: verfolgt dich | **Festung: beherrscht sein Revier** | Trickser: weicht dir aus |
| Tempo | ~20 Angriffe/min, kurze Ansagen | **~12/min, wuchtig, riesige Flächen** | Salven + Teleports, du musst ihn stellen |
| Kernschleife | Druck → Glutrausch → Ablass/Brustkonter | **Panzer → Säulen-Crash → Kern bloß** | Ladung auf dem Jäger → Entladung, echter Körper vs. Nachbilder |
| Gelände | brennender Boden | **beschwört Felssäulen (Deckung + Crash-Ziel), zertrümmert sie** | Blitzraster, Bahnen |
| Gegen Fernkampf | Vorhalten, Lanzen | **arenaweite Bebenrhythmen, Deckung nötig** | er ist selbst der Fernkämpfer |
| Spieler-Aufgabe | Ausweichen unter Dauerverfolgung | **Rollen in Säulen locken, Deckung nutzen** | lesen, jagen, Raster verlassen |

## Festung statt Jäger (verbindlich)

1. **Panzer statt Druckleiste.** `m.armor` 0–100. Gepanzert: alle Teile außer Kopf ×0,55,
   praktisch kein Zucken (Superrüstung), regeneriert langsam (~3/s außerhalb von Angriffen).
   Panzer < 30: Nähte glühen offen, normale Faktoren.
2. **Felssäulen** (eigene Entitäten in `m.extra.pillars`, nur aus `all`-Ereignissen,
   max. 6, ~25 s Lebensdauer):
   - *Säulenbruch* lässt 3–4 Säulen in Linie oder Bogen aufbrechen (Aufbruch trifft).
   - *Meteor* setzt bei der Landung einen Säulenkranz.
   - **Deckung:** Bebenringe, Felsbrocken und Schlackespucke treffen niemanden, der hinter
     einer Säule steht (Säule zwischen Einschlag/Zentrum und Jäger).
   - Keulenwirbel, Ramme und Weltenbruch **zertrümmern** Säulen in Reichweite. Er nimmt dir
     aktiv die Deckung.
3. **Crash = Hauptkonter.** Trifft sein Rollangriff (oder die Ramme) eine Säule
   (Host-Entscheidung, Unterbrechung wird synchronisiert): Die Säule zerbricht, er
   überschlägt sich, 3,5 s Taumeln, Panzer −60, danach 8 s **Kern bloß** (Brust/Nähte
   Faktor ×1,6). Schulterbruch während der Rolle erzeugt ebenfalls einen Crash. Die
   Säulen glühen kurz auf, wenn er eine Rolle auf sie ausrichtet (lesbar).
4. **Revier statt Verfolgung.** Bevorzugt 6–12 m, läuft nicht hinterher. Distanz
   überbrückt er mit Rollangriff (bis 3 Kurven, jede neu ausgerichtet, aber **ohne**
   Vorhalten), Sprungstampf und Bebenlinien. Kein `aimTarget`.
5. **Bebenrhythmus gegen Fernkampf.** Stampfer, Beben und Landungen senden Bebenringe bis
   ~24 m (Knock `down`). Wer fern steht, muss den Rhythmus rollen oder Säulen-Deckung
   nutzen. Felswurf: hohe Bögen auf feste Punkte. Glutlanzen-artige Schnellprojektile gibt
   es nicht.
6. **Letzter Zustand „Lavaader“:** schnellere Panzer-Regeneration, Säulen speien beim
   Entstehen Schlacke. Ultimate *Weltenbruch*: Er gräbt sich ein, die Arena bricht in
   Sektoren (Tortenstücke), die nacheinander rotierend ausbrechen. Säulen schützen,
   werden dabei aber zerstört. Bewusst **keine** Ringe-Supernova wie bei Pyrostur.

Schaden pro Treffer auf Pyrostur-Skala, aber eher am oberen Ende (wuchtig).

Owner-Vorgabe: Pyrosturs Niveau und Look (docs/PYROSTUR_ELDER_REWORK.md, Abschnitt
„Kampf-Neustart“) sind das Vorbild für alle Drachen. Felsengroll ist der zweite.
Gleiche Säulen, eigenes Thema: **Beben und Schlacke**. Pyrostur ist der agile Jäger,
Felsengroll der **unaufhaltsame Rammbock, der die Arena zerlegt** – trotzdem schnell,
aggressiv und mit Ketten, nie träge.

## Säulen

1. **Rammbock-Tempo.** Schnelle Nahschläge (0,6–0,8 s Ansage), schwere Treffer, Ketten bis 4.
   Erholung 0,55/0,38/0,24 s je Zustand, 0,15 s im Erdrutsch.
2. **Mobilität eines Felsbrockens.** *Rollangriff*: rollt sich ein und walzt auf die
   vorgehaltene Position. Er kann sich bis zu dreimal selbst verketten und zielt dabei jedes
   Mal neu (Uragaan). *Sprungstampf*: schwerer Satz mit Landebeben.
3. **Arena zerlegen.** *Schlackefelder* (`addScorch` mit `kind: 'slag'`): verlangsamen
   (Status `mud`), ticken leicht und **detonieren** nach ihrer Zündschnur (`blast`).
   *Bebenringe* (`addRing` ohne Brand, Knock `down`) nach schweren Landungen.
   *Bruchlinien*: hintereinander aufbrechende Bodenspalten, die zur vorgehaltenen
   Zielposition rasen.
4. **Bebenzorn (statt Druck).** `m.quake` 0–100 steigt im Leerlauf, mit Angriffen und mit
   Treffern am Jäger. Bei 100 beginnt der Erdrutsch: 16 s lang Tempo ×1,15, kurze Erholung,
   mehr Ketten, und jede schwere Landung erzeugt einen kleinen Bebenring.
   Er endet immer mit einem Ablass:
   - *Kernbeben*: konterbar. Schulter- oder Kopftreffer während der offenen Kernphase
     geben langes Taumeln.
   - *Weltenbruch*: nur im letzten Zustand, als Ultimate.
5. **Fernkampf-Druck von Anfang an.** `aimTarget`-Vorhalten auf Rolle, Ramme,
   Sprungstampf, Bruchlinie und Felswurf. Scharfschützen-Gedächtnis wie bei Pyrostur.
   *Felswurf*: Die Keule schleudert drei Brocken (Projektile im Modus `impact`) auf
   Laufweg und Ausweichseiten.
6. **Verdiente Öffnungen.** Signaturen enden ohne Kette mit ≥ 1,5 s Strafzeit.
   - Bricht die Schulter während des Rollangriffs, überschlägt er sich: 4 s Sturz.
   - Keulenbruch entfernt den Nachschlag der Keule und den Felswurf.

## Angriffe (Ziel: ≥ 22)

| Rolle | Angriffe |
|---|---|
| Schnell | Biss, Schulterstoß, Scharren (Doppelklaue), Stampfer (kleiner Ring vorn), Keulenpeitsche (schneller Einzelschlag seitlich/hinten) |
| Mobilität | Rollangriff (selbstverkettend), Sprungstampf, Rückstoß (Sprung zurück + Keulenfeger), Ramme |
| Kontrolle | Beben (Spaltenlinie), Bruchlinie (gegabelt, ab Zustand 2), Schlackespucke (3 Felder mit Zündschnur), Felswurf, Säulenbruch (Felsnadeln brechen in einer Linie/Ring auf), Keulenwirbel (360°, doppelt), Stummel (nach Keulenbruch) |
| Signatur | Meteor (Sprung auf ~9 m, Einschlag, Bebenring + Schlackekranz), Kernbeben (Konter), Weltenbruch (Ultimate: Aufstieg, Einschlag, drei Bebenringe, Schlackefelder) |

Zustandswechsel: 65 % → Meteor („Flüssiger Berg“), 30 % → Weltenbruch („Der letzte
Erdrutsch“). Schaden auf Pyrostur-Skala (roh ~110–300); HP bleiben 24.000.

## Fairness (dieselben Tests wie Pyrostur)

- Jede Ansage ≥ 0,5 s, auch mit Wut und Erdrutsch.
- Jeder Angriff setzt sichtbar zurück (≥ 0,4 s).
- `p3fairness`: Jeder Angriff ist mit einer Rolle aus seinen Audit-Distanzen lösbar.
- Bodenmarker kommen aus den echten Trefferformen.
- Gefahren entstehen nur aus `all`-Ereignissen; Host und Gast sind identisch.
- Ringe treffen nicht innerhalb ihres Startradius.
- Bots: Ein geübter Roller nimmt ≤ 25 % des Schadens eines untätigen Jägers. Ein kreisender
  Armbrust-Kiter nimmt ≥ 450 Schaden pro Minute.
