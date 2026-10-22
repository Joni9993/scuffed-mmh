# Gockelok: aggressiver Hahn, 22.10.2026

Der Hahn bindet Jäger jetzt durch Verfolgung und räumlich wirksame Ketten.
Die alte Fassung konnte mit gleichmäßigem Seitwärtslaufen oder Kreisen komplett
umgangen werden. Lebenspunkte, Augenform und Übergang bleiben erhalten.

- Bewegte Pickkombos und breite, wechselnde Klauen-/Flügelschläge.
- Klauensprung über bis zu 30 m, mit vorgestreckten Füßen, Landetreffer und zweitem Krallenhieb.
- Federhagel mit drei versetzten Salven. Markierungen und sichtbare Federn folgen den tatsächlichen Trefferbahnen.
- Drei, vier oder fünf Aktionen pro Kette je nach Phase; neue Zielwahl und begrenztes Vorhalten zwischen den Aktionen.
- Bogen- und Ratterbüchsen-Spieler werden ausdrücklich mitverfolgt. Die Bewegung von Koop-Gästen wird aus Positionsupdates ermittelt.
- Laufende Angriffe bleiben auf ihre angekündigte Richtung festgelegt. Rollen, Teilbrüche, Naht-Konter und Ermüdung bleiben wirksame Antworten.
- Mindestens 1,35 s Ruhe nach dem Kettenabschluss; beschädigte Flügel verlängern Sprung-Erholungen.
- Bewegte Hahn-Angriffe beziehen ihre Bodenhöhe aus derselben Welt wie das Modell. So treffen Landungen auch auf Hängen korrekt und werden auf Gästen identisch wiedergegeben.

## Gemessene Wirkung

Die Tests verwenden echte `Player.update`-/`Monster.update`-Schritte, 168 Schutz,
normale Bewegung, Trefferreaktionen, Ausdauer und Rollen. Der 36-s-Dauertest
verwendet absichtlich 10.000 Test-LP, damit ein früher K.O. die Schadensmessung
nicht abschneidet. Das ist keine Änderung der Spielerwerte im Spiel.

| Verhalten | Vorher, 36 s | Jetzt, 36 s, drei Seeds |
|---|---:|---:|
| Gleichmäßig seitwärts laufen | 0 Schaden | 153–266 Schaden |
| Um den Hahn kreisen | 0 Schaden | 321–389 Schaden |
| Kreisen mit gezielten Rollen | — | 32–97 Schaden, 5–10 tatsächliche Ausweichkontakte |

Ein stationärer Jäger mit 150 LP und 168 Schutz wird auf 3, 10 und 24 m
in sechs Tests nach rund 5–7 s besiegt. Der Hahn startet im 30-s-Test jeder Phase
zwölf Angriffe, viele davon mit mehreren Treffern. Vollständige Ketten mit genau
drei/vier/fünf Aktionen und echte Ruhefenster werden separat geprüft.

`gockelokPredator.test.js` prüft zusätzlich Zielwechsel auf Bogen und Ratterbüchse,
Vorhalten für bewegte Koop-Gäste, begrenzte Vorhersage, unveränderte angekündigte
Trefferbahnen und Unterbrechung durch Kammbruch. `gockelokRoosterRig.test.js`
prüft Fußpose, sichtbare Salven, Aufräumen und echte Landetreffer auf Hängen
einschließlich Host-/Gast-Wiedergabe.

## Prüfung und Vorschau

1.711 Tests bestanden; ein optionaler Metriktest übersprungen. Der lange
`p3fairness`-Lauf wurde nicht wiederholt. Produktionsbuild erfolgreich, bestehende
Bundle-Größenwarnung unverändert. Längere menschliche Spieltests bleiben sinnvoll.

Lokale Vorschau: `/tools/gockelok-preview.html`. Klauensprung/Federhagel einzeln,
Phasen, 4/12/24-m-Startpositionen, Zeitlupe und Einzelbilder sind verfügbar.
„Großes Kampfbild“ blendet die Regler aus. Keine Spielstandänderungen.
