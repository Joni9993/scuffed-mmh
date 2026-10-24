# Multiplayer: laufender Beitritt und Wiederaufnahme

GitHub Pages, PeerJS und die Stern-Topologie bleiben bestehen. Der Raum-Host vermittelt Nachrichten; der jeweilige Auftraggeber bleibt Jagd-Host und simuliert die Monster. Es gibt keinen neuen Dienst und keine neue Abhängigkeit.

## Verhalten

- Das Auftragsbrett zeigt laufende Jagden mit freien Plätzen. Nachzügler werden zunächst reserviert und erst nach einem Welt-Snapshot und einer Bestätigung freigeschaltet. Sie starten im Lager. Beendete Jagden und Jagden mit einem vorübergehend nicht erreichbaren Host nehmen keine neuen Teilnehmer an.
- Verbindungsabbrüche reservieren die Spieler-ID und den Platz 90 Sekunden. Ein privates Token in `sessionStorage` ermöglicht auch die Rückkehr nach einem Reload des Gast-Tabs: denselben Raumcode im selben Tab erneut betreten. Freiwilliges Verlassen gibt den Platz sofort frei.
- Wiederholte Versuche verwenden Wartezeiten bis maximal fünf Sekunden. Rückkehr ins Browserfenster und das `online`-Ereignis stoßen die Prüfung erneut an. Änderungen am Signaling erhalten bestehende WebRTC-Kanäle; ein zerstörter Host-Peer wird unter demselben Raumcode neu aufgebaut.
- Während der eigenen Wiederverbindung oder beim Warten auf den Jagd-Host steht die lokale Simulation still. Abwesende Pirscher sind verborgen und können nicht angegriffen werden. Der Verbindungsstatus bietet einen Ausstieg an.
- Der Bootstrap übernimmt Monster, laufende Angriffe, Teilebrüche, Phasen, Gefahren, Ressourcen, Interactables, Restzeit und Team-KOs. Persönliche Checkpoints erhalten HP, Inventarpools, Verbrauch, Ausrüstung, Zustände, Zähler und den Beute-Zufallsgenerator. Rückkehrer erscheinen im Lager mit kurzem Trefferschutz.
- Jagdverkehr ist an die eindeutige Runde gebunden. Der Raum-Host bestimmt Absender und Verbindungsgeneration. Das verhindert, dass alte Pakete oder neu beginnende Treffer-IDs nach einem Reload eine andere Runde beeinflussen. Große Synchronisierungen werden in kleine Pakete zerlegt, unvollständige Transfers verfallen.
- Ergebnis und Verbrauch werden pro Runde genau einmal verbucht. Der Jagd-Host hält den Abschluss nach dem Szenenwechsel noch 90 Sekunden im Speicher bereit. Bereits abgeschlossene oder bewusst verlassene Runden lassen sich nicht erneut für Belohnungen betreten.

## Grenze des bestehenden Aufbaus

Der Raum-Host und der Jagd-Host müssen ihre Tabs geöffnet lassen. Ein vollständiges Schließen/Neuladen des Host-Tabs verwirft dessen autoritativen Zustand; es gibt keine Host-Migration oder serverseitige Speicherung. Nach Ablauf der Wiederaufnahmefrist wird die Verbindung sauber beendet. Die Erreichbarkeit über verschiedene Netze hängt weiterhin von den bestehenden Signaling-/STUN-/TURN-Diensten ab.

## Verifikation

`tests/unit/reconnect.test.js` führt die Produktionsmodule Net, Session, QuestBoard und HuntNet über einen transportierten, JSON-serialisierten PeerJS-Simulator aus. Abgedeckt sind wiederholte Abbrüche, volle Räume, Slot-Freigabe, Zeitablauf, Host-Transport-Neustart, ein anderer Gast als Jagd-Host, Tab-Reload, Abschluss während Abwesenheit, Fragmentierung und Sendepuffer-Stau. `huntResumeSnapshot.test.js` prüft alle großen Monster, verbleibende Gefahren und die einmalige Abrechnung.

Für einen Gerätetest mit echtem WebRTC bleiben diese Fälle relevant: iPhone/Safari und Desktop gemeinsam verbinden; aus der Stadt in eine laufende Jagd nachziehen; beim Gast WLAN kurz abschalten und wieder einschalten; Gast-Tab neu laden und denselben Raumcode eingeben; den Host kurz in den Hintergrund legen. Dabei Spieleranzahl, HP, verbrauchte Items und den gemeinsamen Abschluss vergleichen. Die automatischen Transporttests ersetzen diesen Gerätetest nicht.
