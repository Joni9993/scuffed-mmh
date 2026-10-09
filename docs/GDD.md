# Scuffed Hunter – Game Design Document

Arbeitstitel: **Scuffed Hunter**. Koop-Monsterjagd für 1–4 Spieler im Browser (iPhone 16 / Pixel 10 als Zielgeräte, Querformat).
Inspiriert vom Genre „Monsterjagd", aber mit **eigener Welt, eigenen Begriffen und eigenen Mechaniken**. Nichts 1:1 übernehmen.

**Grundsatz:** Abstriche nur beim Aussehen (PS1-Look: Low-Poly, 32-px-Texturen, Vertex-Wackeln, Nebel). Gameplay ist präzise, fair, skillbasiert. Jeder Treffer, den der Spieler kassiert, muss vorher lesbar angekündigt worden sein.

Spielsprache: **Deutsch**. UI-Ton: trocken-witzig, kurz.

---

## 1. Welt & Begriffe (eigene Wortwelt)

| Begriff | Bedeutung |
|---|---|
| **Pirscher** | Spieler / Jäger |
| **Brocken** | Großmonster |
| **Rostnest** | Das Lager (Hub). Menüs: Schmiede, Truhe, Kochtopf, Auftragsbrett |
| **Schotterklamm** | Die Jagd-Map, 4 Zonen |
| **Auftrag** | Quest |
| **Schrott** | Währung |
| **Puste** | Ausdauer |
| **Prellung** | Roter, regenerierbarer Teil der HP nach einem Treffer |
| **Wucht** | Waffen-Meter (füllt sich durch Treffer, ermöglicht Finisher) |
| **Glitch-Konter** | Belohnung für perfektes Ausweichen (siehe 3.3) |
| **Rotglut** | Wut-Zustand eines Brockens |
| **Macken** | Rüstungs-Fähigkeiten |
| **Zerlegen** | Materialien von besiegtem Brocken holen |
| **Umgekippt** | Pirscher hat 0 HP → zurück zum Lagerpunkt. 3× Umkippen im Team = Auftrag gescheitert |
| **Jägerrang (JR)** | Spieler-Level, steigt durch erfüllte Aufträge, schaltet Aufträge frei |

---

## 2. Spielablauf (Core Loop)

1. **Rostnest (Hub, solo, Menüs):** Ausrüsten, Schmieden, Items herstellen, Essen kochen (Buff für nächste Jagd), Auftrag wählen.
2. **Auftragsbrett:** „Jagd hosten" (erzeugt 4-stelligen Raumcode) oder „Jagd beitreten" (Code eingeben). Solo = hosten ohne Mitspieler.
3. **Lobby:** Spieler + Waffen sichtbar, alle „Bereit" → Host startet.
4. **Jagd in der Schotterklamm** (Ziel 5–10 Minuten, Limit 20 min): Brocken finden, kämpfen, Sammelpunkte plündern, Brocken flieht bei niedriger HP in Nest-Zone.
5. **Sieg:** 45 s Zerlegen-Zeit, dann Belohnungsbildschirm (Auftragsbelohnung + Zerlegen + Teilbrüche + Gesammeltes). Jeder Spieler bekommt seine eigenen Belohnungen (lokaler Speicherstand).
6. Zurück ins Rostnest → craften → stärkeren Brocken jagen.

Scheitern: 3× Umgekippt (Team gesamt) oder Zeit abgelaufen. Gesammeltes bleibt trotzdem erhalten.

---

## 3. Kampf-Grundsystem (für alle Waffen)

### 3.1 Werte des Pirschers
- **HP:** 100 Basis (+ Essen-Buff). **Prellung:** Erlittener Schaden wird zu 50 % als Prellung angezeigt und regeneriert 2 HP/s, solange 3 s kein Treffer kam.
- **Puste:** 100 Basis. Regeneriert 30/s (nach 0,4 s Pause seit letztem Verbrauch).
  - Sprinten: 15/s · Rolle: 22 · Bogen-Aufladen: 12/s · Rausch-Modus: 10/s.
  - Bei 0 Puste: 1,2 s „Außer Puste" (nur gehen, keine Rolle).

### 3.2 Bewegung
- Gehen 4 m/s, Laufen 6 m/s (Stick > 70 %), Sprinten 8,5 m/s (Stick ganz außen ≥ 0,4 s gedrückt, kostet Puste).
- Während Angriffen: Waffe bestimmt Bewegungsfreiheit (Großschwert: fast keine, Doppelklingen: viel).
- Treffer-Reaktionen: kleiner Treffer = Zucken (0,3 s), großer Treffer = Umwerfen (1,0 s, danach „Aufrapp-Rolle" mit Rolle-Taste möglich nach 0,4 s, i-Frames beim Aufstehen 0,5 s).

### 3.3 Rolle, i-Frames, Glitch-Konter (Skill-Kern)
- **Rolle:** 0,5 s Dauer, 4,5 m Weg in Stick-Richtung (ohne Stick: rückwärts zur Kamera bzw. weg vom Lock-On-Ziel).
- **i-Frames:** 0,06 s → 0,30 s nach Start (240 ms). Danach 0,2 s Erholung (verwundbar).
- **Perfekt-Ausweichen:** Wenn ein Brocken-Angriff den Pirscher in den **ersten 100 ms der i-Frames** getroffen hätte →
  **Glitch-Konter:** 0,35 s Zeitlupe (lokal), Bildschirm-Glitch-Effekt, nächster Angriff innerhalb 1,5 s macht +50 % Schaden und gibt +25 Wucht. Sound-Cue.
- Rolle kann Angriffs-Erholung abbrechen, aber erst ab dem „Cancel-Fenster" jeder Angriffsanimation (pro Move definiert). Großschwert-Aufladen nicht.
- Macke „Flinkfuß" verlängert i-Frames um 40 ms pro Stufe (max. 2 Stufen).

### 3.4 Lock-On & Kamera
- Lock-Taste: Ziel = nächster Brocken im Blickfeld; erneut tippen: zwischen Teilen des Brockens wechseln (Kopf, Körper, Schwanz…); lange halten = Lock aus.
- Gelockt: Kamera hält Pirscher + Ziel im Bild, Angriffe richten sich automatisch grob aufs Ziel aus (max. 35° Korrektur).
- Ohne Lock: Wischen auf freier rechter Bildschirmhälfte dreht Kamera. Kamera folgt automatisch langsam hinter den Pirscher, wenn man läuft.

### 3.5 Treffer & Schaden
```
Schaden = Waffenkraft × Bewegungswert × Trefferzonen-Faktor(Teil) × Krit × Bonus
        + Elementkraft × Elementzonen-Faktor(Teil, Element)
Krit: Waffen-Kritchance (Basis 5 %) → ×1,25
Bonus: Glitch-Konter ×1,5 · Rotglut-Treffer erhalten nicht mehr Schaden
```
- **Hitstop:** Pirscher-Treffer frieren die eigene Animation kurz ein (leicht 40 ms, mittel 70 ms, schwer 120 ms) + Screenshake proportional.
- **Trefferzonen:** Jeder Brocken hat Teile mit Faktoren (z. B. Kopf 1,0 / Körper 0,6 / Schwanz 0,8). Schwachstellen-Treffer ≥ 0,9 zeigen gelbe Schadenszahl, sonst weiße.
- **Teilbruch:** Jeder brechbare Teil hat eigene Teil-HP. Bruch → Brocken taumelt 2 s, Teil verändert Mesh (abgebrochen), Bonus-Material, Teil-Faktor danach −0,1. Visual: Vor dem Bruch wackelt der Teil stärker (PS1-Vertex-Jitter-Stärke steigt mit Teil-Schaden) – unser eigenes Stil-Feedback.
- **Betäuben:** Stumpfe Treffer (Großschwert-Aufladeschläge, Rempler) auf den Kopf bauen Betäubung auf. Schwelle 150 (×1,5 nach jeder Betäubung). Betäubt: 6 s wehrlos.
- **Status auf Brocken:** Gift (Brenn-/Giftspitzen): 3 % Max-HP über 15 s. Klebefalle: 6 s festgeklebt.

### 3.6 Wucht-Meter (eigene Mechanik)
- 0–100. Treffer geben Wucht (pro Move definiert). Glitch-Konter +25. Fällt 5/s ab, wenn 4 s kein Treffer.
- Bei 100: Waffenspezifischer **Finisher** über Spezial-Taste (siehe Waffen). Finisher leert Wucht.

---

## 4. Waffen

Alle Waffen: **A = Angriff**, **B = Spezial**, plus Rolle, Item, Lock. Combos über Tipp-Timing: nächste Eingabe im Eingabefenster des aktuellen Moves (Puffer 0,25 s vor Fensterbeginn).
Bewegungswerte (BW) in %. Werte sind Startwerte fürs Balancing.

### 4.1 Plattmacher (Großschwert)
Langsam, riesige Treffer, Belohnung für Timing und Positionierung.
- **A-Kette:** Hieb (BW 48, 0,9 s) → Querschlag (BW 36, 0,8 s) → Aufwärtshaken (BW 52, 1,0 s, wirft kleine Monster).
- **A halten = Aufladen** (bewegungsunfähig, nur drehen): Stufe 1 (0,5 s, BW 65), Stufe 2 (1,0 s, BW 90), Stufe 3 (1,5 s, BW 120). Zu lange gehalten (>2,1 s) = fällt auf Stufe 2 zurück. Stufe-3 genau im Fenster 1,5–1,8 s losgelassen = **„Sauber!"** (+15 % Schaden, gelber Blitz).
- Nach einem aufgeladenen Schlag: A erneut halten → **Wuchtladung** (schneller, nächste Stufe +20 BW).
- **B = Rempler** (Schulterstoß, BW 26, Superrüstung gegen Zucken, stumpf/Betäubung 30). Aus Rempler direkt A halten = Aufladen startet bei Stufe 1.
- **B halten = Klingenblock** (blockt Frontal-Treffer, 30 % Schaden durch, kostet Puste = Schaden × 0,8, Wucht +5).
- **Finisher „Schrottbrecher"** (B bei Wucht 100): Sprung + Bodenhieb BW 220, stumpf 80, Schockwelle trifft 3 m Radius.
- Wucht: Aufladeschläge geben Stufe × 12.

### 4.2 Zwillingsklingen (Doppelschwerter)
Schnell, mobil, viele kleine Treffer, Puste-Management.
- **A-Kette:** Doppelschnitt (2×BW 12) → Kreuzschnitt (2×BW 14) → Drehschnitt (3×BW 10). Wiederholbar. Laufen während Kette möglich (langsam).
- **Rolle → A:** Sprungschnitt (2×BW 18, Weg 3 m nach vorne).
- **B = Rausch an/aus:** Im Rausch: Angriffe +1 Treffer pro Move, Bewegung +15 %, Rolle wird zu kurzem Dash (0,3 s, gleiche i-Frames), kostet 10 Puste/s. Bei 0 Puste endet Rausch.
- **Finisher „Schrottwirbel"** (B halten 0,3 s bei Wucht 100): 1,8 s Wirbel, 12×BW 14, frei lenkbar.
- Wucht: jeder Treffer +2.

### 4.3 Spannbogen (Bogen)
Fernkampf, Spannungsstufen, Rhythmus aus Schießen und Ausweichen.
- **A halten = Spannen** (Gehgeschwindigkeit, Puste 12/s): Stufe 1 (0 s), Stufe 2 (0,45 s), Stufe 3 (0,9 s). **Loslassen = Schuss.** A-Tipp = Schnellschuss auf aktueller Stufe (nach jedem Schuss erhöht sich die Grundstufe für 1 s um 1, max. 3 → Rhythmus belohnt).
  - Stufe 1: Streuschuss (3 Pfeile, 25° Fächer, je BW 6)
  - Stufe 2: Doppelschuss (2 Pfeile gerade, je BW 10)
  - Stufe 3: Durchschuss (1 Pfeil durchbohrt, trifft bis zu 3 Teile, je BW 16)
- Optimale Distanz 8–16 m: ×1,0. Darunter/darüber ×0,7 (Pfeil-Glow zeigt „Sweet Spot" an).
- **Ausweichspannen:** Nach einer Rolle startet das Spannen direkt bei Stufe 2.
- **B = Bogenhieb** (Nahkampf-Schlag, BW 14, stößt kleine Monster weg).
- **Spitzen (Munition-Items):** Ausrüstbar im Item-Rad: Brennspitze (+Feuer), Giftspitze (Gift aufbauen), Bummspitze (Explosion, Betäubung). Je 10 Stück, Wechsel kostet 0,4 s.
- **Finisher „Pfeilregen"** (B bei Wucht 100): 1,2 s Ziel markieren, dann 20 Pfeile à BW 9 auf Zielbereich.
- Wucht: Treffer +3 (Durchschuss +2 pro Teil).

---

## 5. Brocken (Großmonster)

Gemeinsame KI-Struktur: Zustände **Umherziehen → Bemerken (Brüllen) → Kampf → (Rotglut) → Flucht (bei 30 % HP, Zone wechseln) → Schlafen im Nest (regeneriert 1 % HP/s, Treffer auf Schlafenden ×2)**.
Jeder Angriff hat: **Ankündigung (Telegraph) ≥ 0,5 s** (Körper-Haltung + Teil blinkt rot/weiß + Sound), **aktive Hitbox-Phase**, **Erholung** (Strafe-Fenster für Pirscher).
Rotglut: ab 60 % HP oder nach 300 Schaden in 20 s; dauert 45 s; +20 % Tempo, +15 % Schaden, Ankündigungen 20 % kürzer, glühende Augen + roter Dampf.
Zielwahl: Pirscher mit höchster „Bedrohung" (Schaden der letzten 10 s), gelegentlich zufällig.

### 5.1 Jaggo der Große (JR 1) – Rudel-Raptor
HP 1800 · Größe 2,1× · Schwäche: Feuer (Kopf 25, Körper 10), Schock 10.
Teile: Kopf (Kamm brechbar, 250 Teil-HP, Faktor 1,0), Körper 0,7, Beine 0,8, Schwanz 0,6.
Angriffe:
1. **Bissreihe:** 3 Bisse vorwärts, je 12 Schaden (Telegraph: Kopf zurück 0,5 s).
2. **Hüpfer:** Sprung auf Ziel bis 10 m, 22 Schaden, wirft um (Telegraph: duckt sich, Beine blinken 0,7 s).
3. **Schwanzwirbel:** 360°-Drehung, 15 Schaden (Telegraph: Schwanz hebt sich 0,6 s).
4. **Rudelruf:** Brüllen, ruft 2 Jagglinge (max. 3 aktiv), Brüllen hält Pirscher in 8 m Radius 1 s fest (Rolle im richtigen Moment = Glitch-Konter möglich).
Kleine Monster **Jagglinge:** HP 80, Biss 6 Schaden, sterben schnell, droppen Jaggling-Schuppe beim Zerlegen.

### 5.2 Barrotz (JR 2) – Rammbock-Dino, Schlamm
HP 3200 · Größe 2,4× · Schwäche: Schock (Kopf 20), Feuer nur wenn ohne Schlammpanzer (sonst 0).
Teile: Kopfplatte (brechbar, 400 Teil-HP, Faktor 0,5 → nach Bruch 0,9), Vorderbeine 0,9, Körper 0,7, Schwanz (brechbar) 0,8.
Angriffe:
1. **Rammsturm:** Anlauf 0,9 s (scharrt mit Fuß, Staub), rennt 15 m geradeaus, 30 Schaden, wirft um; dreht und rennt nochmal in Rotglut.
2. **Plattenhammer:** Kopf hebt sich 0,7 s, Schlag nach vorne + Schlamm-Schockwelle 4 m, 25 Schaden.
3. **Schlammwälzer:** Wälzt sich (2 s, verwundbar!), danach **Schlammpanzer** (Körper Faktor ×0,5, Feuer 0) bis 150 Schaden auf Körper ODER Schocktreffer.
4. **Schlammspritzer:** Schüttelt sich (nur mit Panzer): 6 Schlammkleckse fliegen, 10 Schaden + „Verschlammt" (Rolle 3× nötig oder Item „Sprudelwasser").
5. **Schwanzfeger:** Halbkreis hinten, 18 Schaden.

### 5.3 Brathalos (JR 3) – Feuerwyvern
HP 4200 · Größe 2,6× · Schwäche: Schock (Kopf 25, Flügel 20), Feuer 0.
Teile: Kopf (brechbar, 350, 1,0), Flügel L/R (brechbar, je 300, 0,8), Körper 0,6, Schwanz (abtrennbar, 450, 0,7 → abgetrennter Schwanz liegt in der Welt, kann einmal zerlegt werden).
Angriffe:
1. **Feuerspucke:** Kopf zieht zurück, Maul glüht 0,6 s → Feuerball, 28 Schaden + Brennen (3 Schaden/s, 3× rollen löscht). Rotglut: 3er-Fächer.
2. **Krallensturz:** Hebt ab (Flug-Zustand 4–8 s), Schatten auf Ziel 0,9 s, Sturzflug 26 Schaden + Gift.
3. **Flügelböe:** Wind schiebt Pirscher 3 m zurück, keine Schaden, unterbricht Aufladen.
4. **Schwanzhieb:** 180° hinten, 20 Schaden.
5. **Rotglut-Brüllen:** Hält Pirscher fest (wie Rudelruf).
Im Flug: nur Bogen + Item „Blendknolle" holt ihn runter (stürzt ab, 4 s wehrlos).

---

## 6. Welt: Schotterklamm

Eine zusammenhängende 3D-Map (~240 × 240 m), keine Ladebildschirme, 4 Zonen verbunden durch Schluchten/Engstellen:
1. **Wackelwiese** (Start, Lagerpunkt mit Truhe/Heimkehr): offen, Kräuter, Jagglinge.
2. **Knochengrube:** Felsen, Knochenhaufen, Erzadern, Jaggo-Nest.
3. **Schlammsenke:** Schlammpfützen (verlangsamen 30 %), Pilze, Barrotz-Nest.
4. **Glutkamm:** Lava-Spalten (Schaden 10/s), Glutsteine, Brathalos-Nest, hochgelegen.

Brocken ziehen zwischen Zonen umher (Routenpunkte). Minimap (klein, Tap = groß) zeigt Zonen, Pirscher, Brocken-Position, sobald entdeckt (bis dahin „?").

### 6.1 Sammelpunkte (respawnen pro Jagd)
Sammeln = in der Nähe Kontext-Taste halten 0,8 s (unterbrechbar, Rolle bricht ab). Jeder Punkt 1–3× nutzbar.

| Punkt | Zone | Materialien |
|---|---|---|
| Kräuterbusch | 1, 3 | Knisterkraut (häufig), Blaublatt |
| Pilzring | 3 | Wabbelpilz, Stinkmorchel |
| Erzader | 2, 4 | Schrotterz, Glimmstein (selten) |
| Knochenhaufen | 2 | Altknochen, Großknochen |
| Käferschwarm | 1, 3 | Brummkäfer, Blitzkäfer |
| Glutspalte | 4 | Glutbrocken |
| Sprudelquelle | 1, 3 | Sprudelwasser |

---

## 7. Items (im Kampf nutzbar)

Item-Leiste: max. 8 Slots, je Slot ein Stapel. Nutzen: Item-Taste tippen = aktuelles Item. Wischen über Item-Taste = durchschalten. **Item-Nutzung bindet** (Animation, nicht abbrechbar außer Rolle nach Mindestzeit) → Skill: wann ist sicher.

| Item | Wirkung | Nutzzeit | Max. mitnehmbar | Rezept |
|---|---|---|---|---|
| Flickbrause | +35 HP über 1 s | 0,9 s | 10 | Knisterkraut + Sprudelwasser |
| Dicke Flickbrause | +80 HP über 1 s, heilt Prellung voll | 1,1 s | 5 | Flickbrause + Wabbelpilz |
| Pustekuchen | Puste-Verbrauch −50 % für 60 s | 1,2 s | 3 | Blaublatt + Brummkäfer |
| Sprudelwasser | Entfernt Verschlammt/Brennen/Gift beim Pirscher | 0,6 s | 5 | gesammelt |
| Blendknolle | Wurf (6 m), blendet Brocken 4 s, holt Fliegende runter | 0,5 s | 3 | Blitzkäfer + Stinkmorchel |
| Stinkbombe | Wurf, Brocken wechselt Ziel/Zone, unterbricht Fressen | 0,5 s | 3 | Stinkmorchel ×2 |
| Klebefalle | Platzieren, Brocken 6 s festgeklebt (1× pro Brocken pro 60 s) | 1,5 s | 1 | Wabbelpilz + Großknochen |
| Knallgurke | Platzieren, 3 s Lunte, 120 Schaden + Betäubung 50 | 1,0 s | 2 | Glutbrocken + Altknochen |
| Brennspitze ×10 | Bogen-Munition +Feuer 12 | – | 20 | Glutbrocken + Altknochen |
| Giftspitze ×10 | Gift-Aufbau 20 | – | 20 | Stinkmorchel + Altknochen |
| Bummspitze ×10 | kleine Explosion, Betäubung 8 | – | 10 | Schrotterz + Glutbrocken |

Grundausstattung jeder Jagd (kostenlos, verfällt danach): 2× Flickbrause aus der Lager-Truhe.

### 7.1 Kochtopf (vor der Jagd, 1 Mahlzeit pro Jagd)
| Gericht | Effekt | Kosten |
|---|---|---|
| Schotter-Eintopf | +25 Max-HP | 50 Schrott |
| Pustebrei | +25 Max-Puste | 50 Schrott |
| Glutgulasch | +10 % Angriff | 80 Schrott + Glutbrocken |
| Pilzpfanne | +15 % Gift-/Brenn-Resistenz, Item-Nutzung 20 % schneller | 60 Schrott + Wabbelpilz |

---

## 8. Crafting & Progression

### 8.1 Waffen-Stammbäume (Schmiede)
Jede Waffenart hat 4 Stufen. Upgrade = Material + Schrott, ersetzt die Waffe (Stufe ↑).

| Stufe | Plattmacher | Zwillingsklingen | Spannbogen | Material |
|---|---|---|---|---|
| 1 | Rostplatte (Kraft 80) | Rostklingen (Kraft 70) | Ast-Bogen (Kraft 72) | Start |
| 2 | Knochenplatte (100) | Knochenkrallen (88) | Knochensehne (90) | Altknochen ×3, Schrotterz ×2, 200 Schrott |
| 3 | Jaggo-Hackbeil (120, Feuer 0) / Barrotz-Brecher (128, stumpf+) | Jaggo-Zähne (105, Krit 15 %) / Schlammsauger (100, Schock 14) | Jaggo-Kammbogen (108, Krit 15 %) / Barrotz-Prellbogen (112, Schock 12) | Monster-Mats |
| 4 | Brathalos-Glutplatte (140, Feuer 25) | Brathalos-Glühkrallen (122, Feuer 20) | Brathalos-Schwingbogen (130, Gift-Aufbau +) | Brathalos-Mats + Glimmstein |

Stufe 3 hat zwei Äste (Spieler wählt). Stufe 4 kommt aus einem beliebigen Stufe-3-Ast.

### 8.2 Rüstungs-Sets (3 Slots: Kopf, Körper, Beine)
| Set | Schutz/Teil | Macken (pro Teil +1 Stufe) |
|---|---|---|
| Lumpen (Start) | 5 | – |
| Knochenkram | 12 | Zähe Socke (+15 Puste je Stufe) |
| Jaggo | 18 | Flinkfuß (+40 ms i-Frames je Stufe, max 2) |
| Barrotz | 24 | Dickschädel (Zucken-Immunität ab 2, Umwerfen-Immunität ab 3) |
| Brathalos | 28 | Wuchtkopf (+8 % Krit je Stufe), Hitzefell (Feuer-Res) |

Schadensreduktion = Schutz / (Schutz + 80).

### 8.3 Materialien von Brocken (Zerlegen 3× pro Spieler + Teilbruch-Bonus + Auftragsbelohnung)
- Jaggo: Jaggo-Schuppe, Jaggo-Fell, Jaggo-Kamm (selten, Kopfbruch garantiert)
- Barrotz: Barrotz-Kruste, Barrotz-Platte (Kopfbruch), Barrotz-Schwanzleder
- Brathalos: Brathalos-Schuppe, Brathalos-Membran (Flügelbruch), Glutsack, Brathalos-Rubin (sehr selten, 3 %)

Drop-Tabellen mit Gewichten in `src/data/drops.js`.

### 8.4 Jägerrang & Aufträge
| Auftrag | Ziel | Freigeschaltet | Belohnung |
|---|---|---|---|
| Kräuterlauf | 10 Knisterkraut abgeben | JR 1 | 100 Schrott |
| Jaggos Rudel | Jaggo der Große jagen | JR 1 | 300 Schrott |
| Schlamm drüber | Barrotz jagen | JR 2 | 500 Schrott |
| Feuer unterm Hintern | Brathalos jagen | JR 3 | 800 Schrott |
| Rotglut-Varianten | Jeder Brocken, startet in Dauer-Rotglut, +40 % HP | JR 4 | ×2 Mats |

JR-Aufstieg: JR 2 nach erstem Jaggo, JR 3 nach erstem Barrotz, JR 4 nach erstem Brathalos.
Im Koop zählt der Auftrag des Hosts; Gäste bekommen Belohnungen, auch wenn der Auftrag für sie noch gesperrt ist.

### 8.5 Speicherstand
`localStorage` Key `scuffedhunter.save.v1`, JSON mit Versionsfeld + Migration. Export/Import als Base64-Code im Optionsmenü (Schutz gegen iOS-Löschung). Autosave nach jeder Jagd und jeder Schmiede-Aktion.

---

## 9. Steuerung

### Touch (primär)
- **Links:** Virtueller Stick (erscheint dort, wo der Daumen aufsetzt, linke 40 % des Bildschirms).
- **Rechts unten:** A (groß), B, Rolle, Lock. Darüber klein: Item-Taste (zeigt aktuelles Item + Anzahl; Wischen links/rechts = wechseln).
- **Kontext-Taste** (erscheint über A nur nahe Sammelpunkt/Zerlegen): „Sammeln"/„Zerlegen".
- **Rechte freie Fläche:** Wischen dreht Kamera.
- Menü-Taste oben rechts (Pause gibt es im Koop nicht, nur Overlay).

### Tastatur/Maus (PC-Freunde)
WASD bewegen, Shift sprinten, Maus Kamera (Pointer-Lock bei Klick), Linksklick A, Rechtsklick B, Leertaste Rolle, Q Lock, E Kontext, R Item nutzen, Mausrad/1–8 Item wählen.

### Gamepad
Standard-Mapping: Linker Stick bewegen, rechter Stick Kamera, A=Rolle(Süd), X=A-Angriff(West), Y=B(Nord), B=Kontext(Ost), RB Lock, LB+Stick Items, RT Item nutzen.

---

## 10. HUD (kompakt! Feedback aus Mockup: Mockup-HUD war zu groß)

Regel: **HUD nimmt max. ~15 % der Bildfläche ein**. Alle Größen relativ zur kürzeren Bildschirmseite. Ziel-Größen bei 390 px Höhe (iPhone quer):
- Oben links (max. 180 × 60 px): Name klein, HP-Balken (Prellung dunkelrot), Puste-Balken, Wucht-Meter (dünn), Waffen-Status (Bogen-Stufe / Aufladestufe / Rausch).
- Party (unter Spieler, nur Gäste): je 1 Zeile 10 px Schrift, Name + Mini-HP.
- Oben rechts: Timer + Minimap 64 px (Tap = groß).
- Rechts unten: A 64 px, B/Rolle/Lock 44 px, Item 40 px. Halbtransparent (Alpha 0,55), beim Drücken voll.
- Links unten: Stick erscheint dynamisch, 90 px.
- Brocken-HP wird **nicht** angezeigt (man liest den Zustand am Brocken: Hinken, Sabbern, Teilbrüche). Brocken-Name kurz eingeblendet beim Entdecken.
- Schadenszahlen: klein, pixelig, steigen auf, Option zum Abschalten.
- PS1-Pixel-Schrift (Press Start 2P) nur für Zahlen/Überschriften, sonst gut lesbare Pixelschrift-Größe ≥ 9 px.

---

## 11. Look (PS1-Verflucht, gewählt)

- Internes Rendern bei 480 px Breite (Höhe proportional), hochskaliert mit `image-rendering: pixelated`. Option: 360 px („Extra-scuffed").
- Vertex-Snapping im Vertex-Shader (Raster ~160×74 relativ), Gouraud-Licht (Lambert), Nebel, 16–32-px-Canvas-Texturen mit NearestFilter, prozedural erzeugt – **keine externen Assets**.
- Scanlines + Vignette als CSS-Overlay (abschaltbar).
- Effekte trotzdem saftig: Hitstop, Screenshake, Pixel-Funken (Points), Glitch-Effekt beim Glitch-Konter (kurzes Farbkanal-Verschieben + Vertex-Jitter ×3).
- Telegraphs: betroffener Teil blinkt (Emissive rot/weiß), Brocken-Pose, Sound.
- Sound: prozedurale WebAudio-SFX (kein Asset-Download), Lautstärke-Option. Start nach erster Interaktion.

---

## 12. Multiplayer (P2P)

- PeerJS (WebRTC DataChannels), Cloud-Signaling `0.peer.js.com` default; Host/Port per URL-Param überschreibbar (`?peerhost=localhost&peerport=9000`) für Tests.
- Raumcode: 4 Großbuchstaben (ohne I/O), PeerJS-ID `scuffedhunter-<CODE>`.
- **Host-autoritativ** für: Brocken (KI, HP, Teile, Status), Kleinmonster, Sammelpunkt-Zustände, Auftragszustand, Timer, Umgekippt-Zähler.
- **Client-autoritativ** für: eigene Pirscher-Position/Animation, eigene Treffer-Erkennung (sendet `hit`-Events: Ziel, Teil, Schaden, Stumpf, Element, Status), eigene erlittene Treffer (lokale Hitbox-Prüfung gegen vom Host gestartete Brocken-Angriffe → faire Rollen auch mit Latenz).
- Brocken-Angriffe: Host sendet `atk`-Event (Angriff-ID, Startzeit, Ziel, Position, Richtung). Clients spielen den Angriff deterministisch ab und prüfen Hitboxen lokal.
- Sync-Raten: Pirscher 15 Hz (interpoliert, 100 ms Puffer), Brocken-Zustand 10 Hz + Events sofort.
- Verbindungsabbruch Gast: Pirscher verschwindet, Rest spielt weiter. Host weg: Jagd endet für alle mit Meldung, gesammelte Items bleiben.

---

## 13. Nicht im MVP
Host-Migration, Online-Accounts, Chat (nur 6 Schnell-Emotes: „Hilfe!", „Hier!", „Falle!", „Danke", „Los!", „Oops"), weitere Waffen, Musik.
