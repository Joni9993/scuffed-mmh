# Handoff – Projektstand für neue Agents/Sessions

> **Lies das zuerst.** Diese Datei ersetzt den Chat-Kontext der ersten Entwicklungs-Session (Okt 2026). Danach: **`docs/GDD.md` §16 (Glitch Hunter 2.0 – gültige Entscheidungen & Roadmap)**, `docs/NEXT.md` (Brainstorming: Brocken-Design & USP, offene Entscheidungen) und GitHub-Issue #4 (Rostwerke-TODO).

## 1. Was ist das?
**Scuffed Hunter** – Koop-Monsterjagd (1–4 Spieler) im Browser, mobile-first (Querformat, iPhone/Android), installierbar als PWA.
- Live: https://joni9993.github.io/scuffed-mmh/ (Deploy automatisch bei Push auf `main`, GitHub Actions → Pages)
- Repo: `Joni9993/scuffed-mmh`, Default-Branch `main`
- Look: absichtlich „scuffed" (PS1: Low-Res-Render, Vertex-Wackeln, 32-px-Texturen, Nebel). **Gameplay dagegen präzise und skillbasiert** – Abstriche nur am Aussehen.
- Eigene Wortwelt (kein MH-Wording): Pirscher (Spieler), Brocken (Großmonster), Rostnest (Stadt), Schotterklamm (Map), Puste (Ausdauer), Wucht (Waffen-Meter), Prellung (rote HP), Glitch-Konter (Perfekt-Ausweichen), Rotglut (Wut), Schrott (Geld), Macken (Rüstungs-Skills). Spielsprache Deutsch.

## 2. Der Owner („Boss" / „Captain John")
- Deutsch, informell, Klartext, keine Floskeln. Entscheidet intuitiv, will Kennzahlen/Vergleiche dazu. MVP & Shipping vor Perfektion.
- Spielt selbst auf dem Handy (Android Chrome) + Freunde mit iPhones; testet live und gibt nummeriertes Feedback.
- **Token sparen („Caveman-Modus")**: Sub-Agents mit knappen Prompts, gezieltem Lesen (grep/sed statt ganze Dateien), max. 3–4 Screenshots, Reports ≤ 15 Zeilen.
- Arbeitsweise bisher: Lead-Agent (Opus) plant/verifiziert/merged, Sub-Agents (Sonnet) bauen parallel in Git-Worktrees mit klaren Datei-Zuständigkeiten. Lead merged selbst, testet selbst (Playwright), öffnet PRs nach `main` und merged nach grüner CI (Owner hat Merge-Erlaubnis gegeben).

## 3. Stand (was fertig & live ist)
- **Kampf:** Pirscher mit Laufen/Sprint, Puste, Prellung, Rolle mit i-Frames (0,06–0,30 s), Perfekt-Ausweichen → Glitch-Konter (Zeitlupe, +50 % nächster Treffer). Hitstop, Screenshake, Teilbrüche, Betäubung, Lock-On (Toggle; Wischen = Teil wechseln).
- **4 Waffen:** Plattmacher (Großschwert, zweihändig, Aufladen + „Sauber!"), Zwillingsklingen (Rausch, Schrottwirbel), Spannbogen (Spannstufen, Rhythmus, Sweet Spot, Spitzen, Pfeilregen), Katana (Ziehschnitt, Konterhaltung → Schliff 0–3, Mondsichel). DPS-Balance: db ≈ 92 %, bow ≈ 88 %, kt ≈ 89–94 % vom Großschwert.
- **Brocken:** Jaggo (Rudel-Raptor, ruft Jagglinge), Barrotz (Schlamm-Rammbock, Schlammpanzer), Brathalos (Feuer-Wyvern, Flug ~20 % der Zeit, abtrennbarer Schwanz). HP 7000/9000/12000 (≈5–6 min solo). Alle Angriffe deterministisch aus Startparametern (wichtig fürs Netz) und per Fairness-Test geprüft (Telegraph ≥ 0,5 s, ausweichbar). Wegfindung: Nav-Grid + A* (`src/game/monsters/nav.js`).
- **Welt:** Schotterklamm, 4 Zonen (Wackelwiese/Camp, Knochengrube, Schlammsenke, Glutkamm), 32 Sammelpunkte, Schlamm/Lava, Minimap. Leben: Jagglinge-Rudel, Mampfer-Herden (grasen, Stampede, werden von Brocken gefressen = Angriffsfenster), Hoppler, Vögel/Insekten.
- **Meta:** Rostnest als begehbare 3D-Stadt (Schmiede, Krämerladen, Truhe, Kochtopf, Auftragsbrett, Abflugtor, Spiegel mit Erfolgen/Statistik). Items im Kampf (bindende Nutzung), Crafting, Waffenbäume (Stufe 1–4, Ast bei Stufe 3), 6 Rüstungs-Sets mit sichtbarer Optik-Steigerung, Camp-Truhe auf der Jagd, Speicherstand (localStorage, v2, Export-Code).
- **Koop:** PeerJS/WebRTC, Raumcode (4 Buchstaben) = gemeinsame Stadt, Aufträge posten/beitreten, Host-autoritative Brocken, Client-autoritative eigene Treffer/Ausweichen, STUN + öffentlicher TURN-Fallback (openrelay.metered.ca). Nicht auf echtem Mobilfunk verifiziert.
- **Mobil:** Touch-Layout-Solver (keine Überlappungen, ≥ 44 px), PWA (Manifest + Service Worker, Installieren-Button), Auto-Grafik (360–800 px intern, Standard 640), Onboarding-Overlay.

## 4. Offene Punkte / bekannte Baustellen
- Brocken zu vorhersehbar + USP fehlt → **entschieden**, siehe `docs/GDD.md` §16 (Name Glitch Hunter, Glitch pro Waffe, Brocken 2.0, Mutatoren, Roadmap). Koop-HP-Skalierung ist gebaut.
- Schwarzer Balken oben auf Android war nicht reproduzierbar (Fix-Versuch gemerged: kein dvh, Fullscreen-Retry) – Owner-Bestätigung ausstehend.
- Rostwerke (2. Map, Kroll/Gorgo/Voltaro, Stufe 5) = Issue #4, Spec GDD §15. Noch nicht gebaut.
- Ungetestet: öffentliches PeerJS-Signaling + TURN über Mobilfunk; iOS-Installation.
- Kleinkram: Bogen gegen Barrotz relativ schwach (Kopfplatte 0,5), Camp-Zeichnungen ~+20 Draw Calls über Budget, Gast-Profiländerung im Raum nur teilweise.

## 5. Code-Orientierung
- `docs/GDD.md` – Spiel-Design (autoritativ für Zahlen & Begriffe), §15 = Rostwerke.
- `docs/ARCHITECTURE.md` – Module, Verträge (Moves/Angriffe datengetrieben, Netzprotokoll, Debug-API, Touch-Regeln, Gear-Optik).
- `src/game/` (hunt, player, combat, weapons/, monsters/, world/, items), `src/net/` (session, questboard, sync, protocol), `src/ui/` (HUD, Stations-Panels), `src/scenes/` (title, hub = Stadt, hunt, results, lobby = Debug), `src/meta/` (save, crafting, progression), `src/data/` (Items, Rezepte, Rüstung, Waffen, Drops, Quests).
- Debug: `window.__SH` (press/stick/sim/step/pause/god/debugHitboxes/town/save…), URL-Params `?scene=hunt&quest=jaggo&weapon=gs|db|bow|kt&seed=1&god=1&aggro=1&nofx=1&noambient=1&nofauna=1`, Netz-Tests `peerhost=localhost&peerport=9000&peersecure=0`.

## 6. Testen (so wurde verifiziert)
- `npm test` (Vitest, ~655 Tests, inkl. Fairness-Audit; voll: `P3_FULL=1 npx vitest run tests/unit/p3fairness.test.js`), `npm run build`.
- e2e mit Playwright (vorinstalliert unter `/opt/node-tools/node_modules/playwright`, Chromium-Args `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, nie `playwright install`): Build in `dist/` mit `python3 -m http.server 8080` servieren, dann `SH_URL=http://127.0.0.1:8080/ node tools/<x>.mjs`:
  - `net-e2e` (2 Peers, braucht lokalen PeerJS-Server auf :9000 – `npx peer --port 9000` bzw. npm-Paket `peer`), `fauna-e2e`, `panel-e2e` (Stadt-Input-Bug), `hunt-panels-e2e` (Camp-Truhe), `forge-e2e`, `mobile-e2e` (Layout 3 Größen), `edge-e2e` (Vollbild/Insets), `flee-e2e`, `perf-probe`, `weapon-dps`.
- Performance-Referenz: Sim ~0,7 ms/Schritt bei 42 Monstern (Achtung: Nav-Grid-Aufrufe drosseln – ungedrosselt waren es 20 ms → massiver Lag).

## 7. Prozess-Lehren
- Worktrees der Agents starteten anfangs auf falscher Basis → im Prompt immer „falls `git log -1` nicht Commit X → `git reset --hard X`".
- Parallele Agents nur mit klarer Datei-Zuständigkeit; Konflikte entstehen v. a. in `hunt.js`, `player.js`, `sync.js`, `rig.js`.
- Session-Limits (HTTP 429) kamen bei 4–5 parallelen Agents → Agents nach Reset per SendMessage fortsetzen.
- Nach jedem Merge: Branch `ccr-…` auf `origin/main` zurücksetzen, nie auf bereits gemergte Historie stapeln.
