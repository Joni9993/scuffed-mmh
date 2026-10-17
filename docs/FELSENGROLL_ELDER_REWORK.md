# Felsengroll: Elder-Umbau nach Pyrostur-Standard

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
