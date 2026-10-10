# Balance-Runde Okt 2026: Rostwerke-Brocken, Mutatoren, Drops

Owner-Feedback (Handy-Test, 6 Punkte): Mutatoren in der Feldstudie nicht spürbar · Bruchteil-Materialien (15,55/4) · Kroll/Gorgo/Voltaro viel zu leicht („Boxsäcke mit viel HP") · Kroll zu groß, clunky, rutscht Hügel runter · Gorgo ohne gefährliche Angriffe · Voltaro sieht aus wie „Hund mit Platte", Fußtritt trifft nie.

## 1. Analyse: Was macht Jaggo/Barrotz/Brathalos schwer?

| | Jaggo | Barrotz | Brathalos | Kroll (alt) | Gorgo (alt) | Voltaro (alt) |
|---|---|---|---|---|---|---|
| HP | 7000 | 9000 | 12000 | 15000 | 16000 | 22000 |
| Lauf / Drehen | 7,75 / 1,25 | 7,2 / 0,9 | 7,13 / 0,98 | **4,0** / 0,8 | 7,2 / 0,8 | 9,5 / 1,15 |
| Wunschdistanz | 4,5 | 6 | 6 | 7 | **9** | 5 |
| Telegraph (typ.) | 0,55–0,7 ×1,25 Tempo | 0,55–0,9 ×1,2 | 0,6–0,9 ×1,15 | 0,55–1,0 | **0,8–1,05** | 0,55–0,8 |
| Erwartete Rüstung (Schutz → Reduktion) | 36 → 31 % | 54 → 40 % | 72 → 47 % | 84 → 51 % | 102 → 56 % | 108 → 57 % |

Muster der Eröffnungs-Brocken: kurze Telegraphs mit Grundtempo > 1, ~22 Angriffe/min, Ketten, **Nahdruck** (kleben am Spieler), Mixups (Rückhüpfer, Ramm aus Distanz, Fernfeuer) und je eine Identitäts-Mechanik (Rudel, Schlammpanzer, Flug/Schwanz).
Die Rostwerke-Brocken hatten Rohschaden auf JR-1–3-Niveau, obwohl man mit 51–57 % Schadensreduktion ankommt; Kroll war wegrennbar (Lauf 4), Gorgo stand weit weg bzw. war eingegraben ohne Bedrohung, Voltaros Pranke traf nicht zur Optik. Mehr HP = nur länger, nicht schwerer.

**Messung** (`tests/unit/bosspressure.test.js`, effektiver Schaden/min auf einen nicht ausweichenden Pirscher nach erwarteter Rüstung, Ø 3 Seeds × 120 s):

| | stand | circle | range | Phase 2 (circle) |
|---|---|---|---|---|
| Jaggo | 280 | 62 | 0 | 66 |
| Barrotz | 448 | 381 | 72 | 376 |
| Brathalos | 168 | 62 | 192 | 52 |
| Kroll (alt) | 335 | 143 | 52 | 155 |
| Gorgo (alt) | 150 | 79 | 85 | 77 |
| Voltaro (alt) | 186 | 146 | 52 | 157 |

Gate (jetzt im Testlauf): jeder Rostwerke-Brocken muss im Mittel ≥ 1,25 × Ø der Eröffnungs-Brocken liegen, im Kreisen über Ø, aus Distanz ≥ 0,8 × Ø, und Phase 2 muss härter sein als Phase 1. Fairness-Audit (Telegraph ≥ 0,5 s, ausweichbar) bleibt Pflicht.

## 2. Plan & Umsetzung

| # | Punkt | Ursache | Lösung |
|---|---|---|---|
| 1 | Mutatoren nicht spürbar | Technisch aktiv (hunt.js nimmt `quest.mutators`), aber unsichtbar: Speicherleck 0,4 %/s, Lag-Spitze nur alle 6 s im Laufen, kein HUD | siehe §3 |
| 2 | Bruchteil-Materialien | `n * matMul` (Feldstudie 1,95, Mutatoren 1,2–1,35) ohne Rundung | `scaleCount()` in `data/drops.js`: stochastisch auf ganze Stück runden (Erwartungswert bleibt), `boxAdd` nimmt nur ganze Stücke, Laden floort schon. Test `dropcounts.test.js` |
| 3–6 | Rostwerke-Brocken zu leicht | siehe §1 | je Brocken ein Rework (§3), Gate `bosspressure` |

Umsetzung: Lead plant/misst/merged, je ein Sonnet-Agent pro Brocken + einer für Mutatoren, parallel in Worktrees mit klarer Datei-Zuständigkeit.

## 3. Ergebnisse

_(wird nach Merge ergänzt)_
