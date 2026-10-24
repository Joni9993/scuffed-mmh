# Endgame: Glitch-Stufen

Grund zum Weiterspielen nach Gockelok. Gebaut als MVP. Gestrichenes (GDD 16.7) bleibt gestrichen.

## Glitch-Stufen 0-10
- Wählbar am Auftragsbrett pro **echter Brocken-Jagd** (13 Brocken; nicht Sammeln, Training, Rotglut-Presets, Revierstreit, Feldstudie).
- Stufe 1 offen nach dem ersten Sieg gegen den Brocken, Stufe n+1 nach Sieg auf Stufe n. Gespeichert je Brocken (`save.glitch.cleared`).
- Tabelle `src/data/glitchTiers.js` (`TIERS`): feste Mutatoren-Kombi + `matMul` (1,2 bis 4,0) + Schrott/RP x(1+0,1·Stufe). Stufe 10 = 5 Mutatoren.
- Stufen-Jagd ersetzt die Einzel-`reward`-Faktoren der Mutatoren durch `matMul` (sonst x3,7+). Nie Rang-Aufstieg, eigene Bestzeiten.
- Fairness: Telegraph nie unter 0,5 s (`attack.js` klemmt). Einziger Telegraph-Mutator ist Hotfix (x0,85, nie gestapelt). Test prüft alle Angriffe.
- Neue Mutatoren (nur bestehende Hooks, kein Code pro Brocken): Nullzeiger, Redundanz, Timeout, Schreibschutz, Downgrade, Hotfix.

## Belohnung
- **Glitch-Splitter** (`save.glitch.splitter`): Sieg auf Stufe n = n x 4. Wochen-Glitch zählt wie Stufe 6 (+40 beim ersten Wochen-Sieg).
- **Übertaktung** in der Schmiede (Reiter „Übertakten“), `save.oc`: Waffenart +1..+5 = +4 % Kraft je Stufe (Kosten 20/40/70/110/160), getragenes Rüstungsteil +1..+5 = +5 % Teil-Schutz je Stufe (10/20/35/55/80). Angewendet in `game/loadout.js` (Kraft, `player.protect`), Loadout trägt `oc`.
- **Bestzeit** je Brocken x Stufe (`save.glitch.best`; Stufe 0 = `save.best`): Spiegel-Reiter „Glitch“, Ergebnisbildschirm „Neue Bestzeit!“.
- Auszeichnungen „Glitch-Veteran“ (Stufe 5) und „Glitch-Legende“ (Stufe 10) über `pickAwards(..., { tierAward })`.

## Wochen-Glitch
`src/meta/weekly.js`: ISO-Woche = Seed, 1 Brocken + 4 Mutatoren (nie Timeout + Redundanz), Beute x2,5. Eigener Eintrag im Reiter „★ Woche“.
Gepostet wird der Basis-Auftrag + Wochenschlüssel (`weekly: '2026-W43'`), Gäste brauchen kein Datum; Seed kommt aus dem Schlüssel.

## Koop
Der Host postet `{ questId, tier, weekly, mutators }`. `cleanPostGlitch` (Raum-Host) klemmt die Stufe auf 0-10 und nimmt bei Stufe > 0 die Mutatoren **aus der Tabelle**, nie aus der Nachricht; Wochen-Glitch max. 5 bekannte IDs (`MAX_TIER_MUTATORS`), freie Auswahl weiter max. 2.
Der Hunt baut den Auftrag über `resolveHuntQuest()` mit `glitchQuest()` aus. Szenenoptionen verwenden `glitchTier` für die Schwierigkeit und `tier` ausschließlich für die Waffe. Das Brett-/Netzprotokoll behält `tier` als Glitch-Stufe und wird beim Szenenwechsel übersetzt. Beitreten ohne Freischaltung geht; Freischaltung, Splitter und Bestzeit bekommt jeder lokal bei Sieg.

## Save
Version 3, Migration 2 -> 3 setzt Defaults (`glitch`, `oc`). Alte Siege zählen: Stufe 1 ist sofort offen. Tests: `tests/unit/glitchTiers.test.js`.
