# Voltiris: Elder-Umbau (dritter Drache)

Owner-Entscheidung, Variante 1: Nachbilder machen schwächeren Schaden, die Entladung
kann töten. Die Qualitätslatte kommt von Pyrostur (`docs/PYROSTUR_ELDER_REWORK.md`):
Fairness, Determinismus, Tests, Elder-Look, Endgame-Härte. Verhalten und Fähigkeiten
müssen sich klar von Pyrostur (Jäger) und Felsengroll (Festung) unterscheiden
(`docs/FELSENGROLL_ELDER_REWORK.md`, Tabelle „Drei Drachen“).

## Rolle: Duellant, der dir ausweicht

| | Pyrostur | Felsengroll | **Voltiris** |
|---|---|---|---|
| Bewegung | springt nach | steht, rollt | **Blink-Teleport, hält 14–20 m Abstand** |
| Kernschleife | Druck → Glutrausch → Brustkonter | Panzer → Säulen-Crash | **Ladung auf dem Jäger → Entladung; Kanalisierung unterbrechen** |
| Gelände | Glutboden | Felssäulen | **Strombahnen (kurzlebige Bodenlinien)** |
| Ultimate | Sonnenbruch (Ringe) | Weltenbruch (Sektoren) | **Gewitterkäfig (schrumpfender Rand + Leuchtturm-Laser)** |

## Mechaniken (verbindlich)

1. **Ladung** `p.charge` 0–3 auf jedem Jäger, lokal pro Client.
   - *Laden:* +1 pro Treffer durch Blitz-, Bahn- oder Nachbildangriffe (Schaden > 0).
     +1 je 1,5 s Stehen in einer Strombahn. +1 beim Zerschlagen eines Nachbilds.
   - *Abbauen:* Rolle −1 (höchstens einmal pro 0,8 s). Erdung beim Treffen des echten
     Körpers: Nahkampftreffer −1, Fernkampftreffer −1 nur je 3 Treffer.
   - *Entladung:* Bei 3 Stufen startet ein 1,2 s sichtbarer Countdown am Jäger (Ring zieht
     sich zusammen, Ton). Danach trifft ein schwerer Blitz den Jäger. Er ist tödlich, kann
     aber mit getimter Rolle durch i-Frames umgangen werden. Die Ladung fällt danach auf 0.
     Abbauen während des Countdowns bricht die Entladung ab.
   - HUD: 3 kleine Blitz-Pips über dem Jäger, nur bei Ladung > 0.
2. **Blink.** Teleport-Angriffe (Bewegung über `motion`, deterministisch):
   - Er verschwindet in 0,25 s.
   - 0,6 s vorher leuchtet ein Austrittsmarker am Ziel.
   - Austrittspunkte liegen auf 14–20 m zum Jäger, seitlich versetzt.
   - Er blinkt nach Salven (2–3 Angriffe), wenn man an ihm klebt (> 3 s unter 5 m), und
     nach großen Schadensspitzen.
3. **Nachbilder.** 2 Stück, ab 68 % HP 3, augenlose Drahtgitter-Kopien:
   - Sie entstehen an Blink-Startpunkten und wiederholen versetzt einen schwachen Angriff
     (Schaden ×0,45).
   - Treffer auf ein Nachbild lassen es zerplatzen, kleiner Schock, +1 Ladung.
   - Der echte Körper hat Augen, eine leuchtende Antennenkrone und einen eigenen Ton.
   - Nachbilder sind Entitäten aus `all`-Ereignissen mit eigener Trefferkugel für
     Spielerwaffen.
4. **Kurzschluss (Hauptkonter).**
   - Große Angriffe (Zickzack-Laser, Blitzraster, Prismensturm, Gewitterkäfig-Start) haben
     eine schwebende Ladephase.
   - Antennen- oder Kernschaden ≥ Schwelle in diesem Fenster löst den Kurzschluss aus:
     Absturz, 4 s Taumeln, Flügel ×1,4.
   - Die Schwelle skaliert im Koop wie Pyrosturs Druckkonter.
5. **Salventempo.** Ketten aus 2–3 schnellen Angriffen (0,55–0,8 s Ansage), dann Blink.
   Rund 16 Angriffe pro Minute, Erholung zwischen Salven 0,4–0,6 s.
6. **Klebe-Strafe.** *Statiknova* (Radius 5, 0,6 s Ansage) danach Blink weg.
7. **Gewitterkäfig.**
   - Kommt bei 30 % HP und danach alle ~80 s (2–3 Mal pro Jagd).
   - Er blinkt ins Zentrum. Ein Ring-Rand bei 22 m schrumpft auf 12 m, Berührung schadet und
     lädt auf.
   - Zwei Leuchtturm-Laser (lange Kapseln) drehen gegenläufig.
   - Danach Absturz mit 3 s Strafzeit.
   - Bewusst keine Ringe-Supernova und keine Sektoren.

## Angriffe (Ziel ≥ 20)

| Rolle | Angriffe |
|---|---|
| Schnell | Prismenbiss, Flügelkante, Rückkopplung (Schweif), Antennenstoß, Doppelblitz (zwei schnelle Bolzen) |
| Mobilität | Blinkhieb (blinkt hinter den Jäger, schlägt), Phasenstich (Durchstich), Rückzugsblink (Blink weg + Bolzen) |
| Kontrolle | Blitzraster (3 Bahnen bleiben 4 s), Zickzack-Laser, Kettenblitz (springt zwischen Nachbildern), Bahnsprint, Prismensturm, Nachbildserie |
| Signatur | Statiknova (Klebe-Strafe), Kernbruch, Gewitterkäfig |

Zustandswechsel: 68 % „Prismen-Gewitter“ (Zickzack-Laser, 3 Nachbilder), 30 % „Letztes
Signal“ (Gewitterkäfig, schnelleres Laden, mehr Blinks). HP 23.000. Schaden auf
Pyrostur-Skala, schnelle Bolzen eher am unteren Ende.

## Fairness und Tests

Wie bei Pyrostur und Felsengroll:
- Ansage ≥ 0,5 s.
- Rücksetzen ≥ 0,4 s, Signaturen ≥ 1,5 s.
- `p3fairness` muss grün sein.
- Bodenmarker kommen aus den Trefferformen.
- Gefahren und Nachbilder entstehen nur aus `all`-Ereignissen; Host und Gast identisch.
- Ladung und Entladung sind lokal: Der Countdown ist sichtbar, und die Entladung ist
  rollbar.

Bots:
- Ein geübter Roller nimmt ≤ 25 % des Schadens eines untätigen Jägers.
- Ein Armbrust-Kiter nimmt ≥ 450 Schaden pro Minute.
- Ein Nahkämpfer, der ihn verfolgt, erreicht ihn regelmäßig: mindestens 40 % der Zeit
  unter 6 m während der Salven.
