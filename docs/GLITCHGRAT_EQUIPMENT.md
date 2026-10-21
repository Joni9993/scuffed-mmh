# Glitchgrat: die letzten Trophäen

Stand: 21. Oktober 2026. Vier Ausrüstungsfamilien für Pyrostur, Felsengroll,
Voltiris und Gockelok; alle sieben Waffenarten behalten ihre bestehenden
Steuerungen und Waffenmechaniken.

## Waffen

Insgesamt 28 Endmodelle: 21 neue Drachenvarianten und sieben überarbeitete
Ur-Waffen. Die Waffen verändern ihre tragende Geometrie, statt lediglich einen
andersfarbigen Anhänger zu erhalten. Griffe, Bogen-Sehnen, Mündungen, Katana-
Scheide und die beweglichen Glitchaxt-Blöcke behalten ihre Funktion.

| Familie | Erscheinung | Eigene Fähigkeit |
|---|---|---|
| Pyrostur | Kessel, Ventile, Hitzerippen, Glutkern | Kesselherz: Treffer bauen Hitze auf; bei voller Ladung folgt nach 0,65 s ein Feuerstoß. 4 s Abklingzeit. |
| Felsengroll | Geschichtete Steinplatten, Bruchkanten, Erdbebenkern | Weltenbruch: Schaden lädt ein Beben. Bei voller Ladung löst ein schwerer oder Schwachstellen-Treffer den Zusatztreffer mit erhöhtem Teilschaden aus. 5 s Abklingzeit. |
| Voltiris | Geteilte Kristallkanten, Prismenflügel, Lichtadern | Prismennachhall: perfektes Ausweichen oder Katana-Konter lädt drei Nachhalltreffer für 8 s. Sie folgen mit 0,35 s Verzögerung. |
| Gockelok / Ur | Sichelfedern, Sporne, Glitch-Auge und versetzte Pixel | Nahtschneider: fünf Treffer laden einen Realitätsriss, Schwachstellen zählen doppelt. Glitch-Konter lädt sofort. 0,6 s Verzögerung und 6 s Abklingzeit. |

Der bestehende Stufe-6-Baum verzweigt in die drei Drachenfamilien oder die
Ur-Konvergenz. Drachenwaffen können anschließend auf derselben Stufe 7 zur
Ur-Waffe konvergieren. Drachenrezepte verwenden Material ihres eigenen Bosses,
Glitchgrat-Erz und ein Drachenherz. Die Ur-Konvergenz benötigt Material aller
vier Bosse. Vorhandene Stufe-7-Waffen ohne Ast bleiben gültige Ur-Waffen.

Die Fähigkeiten laufen über den normalen Schadensweg einschließlich Gast → Host.
Sekundärtreffer laden sich nicht selbst auf. Verzögerte Treffer haben feste
Positionen; bewegte Ziele können den Bereich verlassen. Waffenwechsel, K. o.,
Jagdende und Boss-Formwechsel bereinigen ausstehende Effekte. Effektschlüssel
werden aus einem begrenzten Pool wiederverwendet. Das HUD zeigt Ladung und
Abklingzeit; die Schmiede erklärt die Fähigkeit vor dem Kauf.

## Rüstung

Vier neue Sets mit je Kopf, Körper und Beinen (zwölf Teile). Jedes Teil gibt eine
Stufe der eigenen Macke; Mischsets sind möglich. Die folgenden Werte gelten für
drei Teile:

| Set | Schutz je Teil | Macke und Spielstil |
|---|---|---|
| Pyrostur · Kesselherz | 60 | +12 % Angriff unter 50 % LP, 36 % Feuerresistenz: offensive Kesselrüstung mit Hitzerisiko. |
| Felsengroll · Weltenpanzer | 64 | +24 % Teilschaden und 24 % weniger Puste beim Blocken: schwere Festung zum Brechen von Teilen. |
| Voltiris · Prismenpakt | 60 | +12 Prozentpunkte Krit-Chance, 12 Puste nach perfektem Ausweichen/Katana-Konter: präziser, beweglicher Spielstil. |
| Gockelok · Ur-Code | 68 | Nach Glitch-Konter 8 s +18 % Angriff; kürzere negative Zustände. Die Zündschnur von Glitch-Schleim wird nicht verkürzt. |

Die Modelle besitzen eigene Helm-, Schulter-, Brust- und Beinformen und werden
weiter pro Gelenk zusammengefasst. Rezepte verwenden die jeweiligen Bossmaterialien;
seltene Kerne werden hauptsächlich für die Brustteile benötigt.

## Speicherung, Schmiede und Prüfung

- Alte Spielstände und Netzwerkcodes behalten ihre Bedeutung; neue Astkennungen
  und Rüstungskennungen werden zusätzlich unterstützt.
- Das Waffenlager fasst 42 Einträge, damit alle 28 Endwaffen neben aktiven Waffen
  sammelbar bleiben. Die Schmiede zeigt Familien, Fähigkeiten und korrekte Boni.
- Modellvergleich: `/tools/finale-equipment-preview.html` am lokalen Vite-Server.
  Alle sieben Waffenarten, vier Rüstungen und Drehansicht sind auswählbar; keine
  Änderungen am Spielstand. Die Seite gehört nicht zum Produktionsbuild.
- Prüfung: 1.632 Tests bestanden, ein optionaler Metriktest übersprungen, ohne
  erneuten Lauf des langen, zuvor erfolgreichen `p3fairness`-Skripts. Enthalten sind
  echte Schadens-/Block-/Konterpfade, Netzweiterleitung, Atomizität der Rezepte,
  Speichern aller 28 Waffen, Schmiede-Anzeige, Modellunterschiede und Ressourcen.
- Produktionsbuild erfolgreich; bestehende Warnung zur Hauptbundle-Größe bleibt.
  Modelle im Browser geprüft. Längere Endgame-Spieltests zur Balance bleiben offen.
