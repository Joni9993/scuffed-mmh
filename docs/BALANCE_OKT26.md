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

**Metrik nachher** (effektiver Schaden/min; Gate grün, Eröffnungs-Brocken unverändert):

| | stand | circle | range | Phase 2 (circle) | HP |
|---|---|---|---|---|---|
| Kroll | 335 → **431** | 143 → **373** | 52 → **183** | 155 → **401** | 15000 → 13500 |
| Gorgo | 150 → **335** | 79 → **264** | 85 → **142** | 77 → **283** | 16000 → 14500 |
| Voltaro | 186 → **395** | 146 → **263** | 52 → **131** | 157 → **279** | 22000 → 18500 |

### Kroll (`kroll.js`, Test `krollrework.test.js`)
- SC 2,6 → 1,9, bodyRadius 3 → 2,2; Scheren in Boxer-Haltung (hoch/seitlich), Angriffe holen sichtbar aus.
- run 4 → 6,8, prefer 7 → 5, turn 1,0, kürzere Erholung, Rohschaden ↑ (Zange 2×26, Seitrammer 32, Druck 40, Sprung 34).
- **Panzerdeckung** (`kroll_deckung`): frontal nur 20 % Schaden, Treffer in Deckung → sofortiger Konterhieb (`kroll_konter`, 0,5 s). Kommt, wenn man frontal draufprügelt → flankieren.
- **Scherengriff** (`kroll_griff`): Vorschnellen bis 8 m, 44 Schaden + Umwerfen. Dampf wird 10-m-Strahl. Doppelsprung nur Phase 2.
- Ketten: Seitrammer→Griff, Sprung→Griff, Doppelsprung→Griff, (P2) Dampf→Seitrammer. Phase 2 (≤ 40 %): +12 % Tempo, +15 % Schaden, Cooldowns −35 %.
- **Hügel-Bug:** Seitrammer/Sprung liefen als reine Funktion der Startparameter durch Hänge/Klippen, `collide()` schob danach bis 9 m weg (y-Sprünge bis 15 m). Jetzt kürzt `prepare()` die Bewegung auf begehbare Strecke (`safeLen`, SDF + Kollider), Seitrammer wechselt bei blockierter Seite. Max. Frame-Sprung 0,83 m.

### Gorgo (`gorgo.js`, Test `gorgorework.test.js`)
- **Jagd-Durchbruch:** Wühlen 2,5 → 1,75 s, danach 2 (P2: 3) Durchbrüche hintereinander unter dem Ziel (`gorgo_stoss` 0,65 s Warnung, letzter `gorgo_durchbruch` 0,8 s). Knallgurke/Schrottkran brechen ab.
- **Schlackewelle** (`gorgo_welle`, P2 `gorgo_doppelwelle`): Ringe bei 4,5/8,5/12,5 m, je 0,1 s aktiv, Lücken → Timing-Rolle oder in der Lücke stehen.
- **Wurmwalze** (`gorgo_walze`): 270°-Rundumschlag, 40 Schaden, Umwerfen. **Zubiss** als Kettenglied.
- Ketten: Sog→Zubiss→Walze, Walze→(Doppel)Welle, Durchbruch→Welle/Walze. Lava-Pfützen 8 s, Splash 2,3 m. prefer 9 → 6.

### Voltaro (`voltaro.js`, Test `voltarorework.test.js`)
- **Neue Optik:** geduckter Raubtier-Körper, kräftige Vorderläufe, Rückenkamm aus 4 Kupfer-Spulentürmen mit Funkenbögen (statt „Platte"), Antennen-Kranz, 5-teiliger Schwanz mit Glühkugel.
- **Tritt → Prankenhieb** mit 3–4 m Ausfallschritt, dreht bis kurz vor Treffer nach, Kombo 2–3.
- **Blitzfeld:** 4–6 Ladungspunkte (Linie/Kreuz/Ring), gestaffelt, Marker ≥ 0,6 s.
- **Funkenlauf:** Sturm übers Ziel hinaus, 1× Wende, Rücklauf + Schwanz-Schlag.
- Ketten: Sprung/Plasma → Pranken/Blitzfeld. Überladen: Angriffe ~18 % schneller, Ketten brechen nicht ab, Kettenblitz mit 2 Nachzündern.

### Mutatoren (`mutators.js`, `monster.js` mutatorTick, `hud.js`)
- HUD: aktive Mutatoren oben rechts + 3-s-Banner beim Start.
- Speicherleck 0,4 → 1,2 %/s (auch im Flug), grüne „+Σ"-Heilzahlen jede Sekunde, Ton, Lock-Marke flackert grün.
- Lag-Spitze alle 6 → 3,5 s, Sprung 0,18 → 0,4 s Weg, auch im Flug; Geisterbild + Glitch-Ton. Nie während Angriffen (Fairness).
- Übertaktet ×1,25 Tempo / ×0,7 Pausen, Overflow ×1,4. Gäste leiten die FX aus Snapshots ab (keine Protokolländerung).

## 4. Offen / beim nächsten Handytest prüfen
- Gefühlte Härte der drei Rostwerke-Brocken (Metrik misst nur Druck ohne Ausweichen).
- Voltaro: Schwanz-Schlag am Funkenlauf-Ende trifft auch bei abgetrenntem Schwanz; Plasma hat das engste Ausweichfenster (150 ms); P2 nur knapp über P1.
- Kroll: Gäste sehen die nachdrehende Deckung mit fixer Blickrichtung; `safeLen` nutzt die Welt des zuletzt erzeugten Krolls (Modul-Variable).
- Mutator-FX beim Gast nur per Code-Lesen geprüft (kein Koop-Test).

