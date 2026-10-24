# Mobile Steuerung und gemeinsamer Jagdbericht

## Rahmen

GitHub Pages bleibt das Hosting. Vanilla JS, three.js und PeerJS bleiben der Stack. Keine neuen Abhängigkeiten, Accounts, Datenbanken oder Serverdienste. Die erfolgreiche Sechs-Spieler-Erprobung bleibt die Grundlage; zusätzliche Leistungsoptimierung ist kein Ziel dieser Änderung.

## Touch-Steuerung

Unter Optionen → Layout (Touch) → Anpassen gibt es einen Editor. A, B, Rolle, Lock, Item, Aktion und Glitch lassen sich verschieben. Alle reservierten Tasten erscheinen im Editor, auch wenn sie beim Spielen gerade ausgeblendet wären. Pause, Karte, Joystick und Itemleiste bleiben geschützt. Unzulässige Bewegungen werden mit einem kurzen Hinweis abgelehnt.

Positionen werden relativ zur Bildschirmgröße gespeichert und beim Linkshändermodus gespiegelt. Passt das gespeicherte Layout nach einer Größenänderung nicht mehr, verwendet das Spiel das sichere Standardlayout. Die gespeicherten Einstellungen werden dadurch beim Spielen nicht überschrieben. Deckkraft: 40–100 %. Abbrechen verwirft die Vorschau; Standard setzt sie zurück; Übernehmen speichert lokal.

Die Hinweise im Editor lassen sich einklappen, damit auch dahinterliegende Tasten erreichbar sind. Waffen-Finisher markieren B, sobald Wucht voll ist; die Beschriftung unterscheidet Tippen und Halten entsprechend der tatsächlichen Waffensteuerung.

## Eingaben verständlich beantworten

Gepufferte Rollen werden erst nach Ablauf ihres Eingabefensters als blockiert gemeldet. Ein später tatsächlich ausgeführter Druck erzeugt keinen Fehlhinweis. Gründe: fehlende Puste, laufende Bewegung, Itembindung, Festhalten, Aufstehen oder KO. Lock ohne Ziel und Glitch ohne Energie erhalten eigene Hinweise.

Der Hinweis erscheint kurz und ohne Eingabesperre. Taste und gegebenenfalls Puste-/Glitch-Leiste werden betont. Hinweise sind gedrosselt und in Optionen abschaltbar. Ausweichfenster, Abbruchregeln, Kosten und Monsterverhalten werden nicht gelockert.

## Kampflesbarkeit

Eigene Treffer betonen: Eigene Zahlen verdrängen bei voller Anzeige zuerst fremde Zahlen; fremde Treffer können eigene Anzeigen nicht verdrängen. Fremde Zahlen und ihre zusätzlichen Trefferfunken fallen dezenter aus. Gegnermarker, Angriffswarnungen, Statusmechaniken und Projektiltreffer bleiben erhalten.

Ruhigere Bildschirm-Effekte reduziert Wackeln, dekorative Blitze und Glitch-Bildverschiebungen. Mechanische Blendung und Warnungen behalten ihre Bedeutung. Textliche Zustandsmeldungen bleiben auch bei ausgeschalteten Schadenszahlen sichtbar. Es gibt keine zusätzliche automatische Grafikreduktion.

## Gemeinsamer Endscreen

Im Koop öffnet sich zuerst **Die Truppe**, daneben **Deine Beute**. Der Jagd-Host verteilt einen gemeinsamen Bericht an alle Teilnehmer. Persönliche Beute und Fortschritt bleiben individuell.

Bestätigte Schadensereignisse, Teilbrüche und Betäubungen werden beim Host gezählt. Elementschaden wird nicht doppelt gezählt; Overkill erhöht den bestätigten Schaden nicht. Persönliche Rollen, perfekte Ausweichmanöver, KOs, Glitch-Schaden, Team-Beats und verbrauchte Heiltränke werden über den bestehenden Jagdkanal gemeldet und am Kampfende eingefroren. Der Bericht hält kurz auf fehlende Endmeldungen Rücksicht, wartet aber nicht unbegrenzt. Fehlende Werte werden ausdrücklich als fehlend angezeigt.

Highlights: Abrissunternehmen, Demontageleitung, Knapp daneben ist auch vorbei, Tragende Band, Bitte kurz warten, Fehler mit Absicht. Spieler mit gleichen Spitzenwerten teilen sich den Titel. Jede Person bleibt in der Truppenübersicht sichtbar.

Lowlights: Bodengutachten (KOs), Amtierender Rollmops (mindestens acht Rollen), Brausebeauftragte (mindestens zwei Heiltränke). Sie beruhen auf gemessenen Aktionen und bedeuten nicht, dass eine Spielweise falsch war. Kein Titel für niedrigsten Schaden, keine zufällige MVP-Wahl. Bestätigte Team-Momente ergänzen den Bericht.

## Verbindungshandhabung im bestehenden Stack

Der neue Bericht nutzt vorhandene PeerJS-Nachrichten. Monsterzustand, Angriffsstarts, Jagdende und finaler Bericht werden beim Gast nur vom Jagd-Host akzeptiert. Berichte und Jagdende sind an die Auftrags-ID gebunden, damit verspätete Nachrichten einer früheren Jagd nicht in den nächsten Abschluss geraten. Disconnects verhindern keinen Abschluss der übrigen Berichte.

Wiederverbindung und Beitritt zu laufenden Jagden sind weiterhin ohne zusätzliche Dienste möglich, solange Raum- und Jagd-Host online bleiben. Das wären die nächsten getrennten Protokolländerungen: stabile Wiederverbindungsschlüssel, reservierte Plätze, Register laufender Jagden, vollständiger Zustandsabgleich mit Bestätigung und eindeutige Verbuchung von Inventar/Belohnungen. Diese Änderung implementiert noch keinen Reconnect und keinen laufenden Beitritt. Einen geschlossenen Host-Browser kann GitHub Pages nicht ersetzen.

## Prüfung

Unit-Tests prüfen gemeinsame Berichte, Gleichstände, fehlende Endmeldungen, Absenderprüfung, Schadenszählung, sichere Tastenpositionen, Finisher-Eingaben und Lesbarkeitsregeln. Für die Geräteabnahme: Touch-Layout ändern/speichern/abbrechen, kleine Landschaftsauflösung und Linkshändermodus, blockierte Rolle, sechs Teilnehmer mit Support und Gleichstand sowie ein Disconnect vor dem Ende. Ein echter iPhone-/Safari-Durchlauf ist separat erforderlich.
