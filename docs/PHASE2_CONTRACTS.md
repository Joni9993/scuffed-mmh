# Phase 2 – gemeinsame Verträge (für alle parallelen Agents)

Fünf Agents arbeiten parallel in getrennten Worktrees auf Basis von Phase 1. Der Lead merged danach alles. Damit das klappt:

## Besitz (wer darf was ändern)
| Agent | Besitzt (frei ändern) | Darf minimal anfassen |
|---|---|---|
| **W – Waffen** | `src/game/weapons/dualblades.js`, `bow.js`, `src/game/projectiles.js` | `weapons/index.js` (Registry-Zeile), `hunt.js` (nur Projektil-Update-Hook), `data/weapons.js` |
| **M – Brocken** | `src/game/monsters/*` (außer Registry-Konflikte), `src/data/monsters.js` | `monsters/index.js`, `data/quests.js` (Test-Aufträge), `render/textures.js` (registerTexture) |
| **P – Meta** | `src/meta/*`, `src/data/items.js`, `recipes.js`, `armor.js`, `drops.js`, `foods.js`, `src/game/items.js`, `src/game/inventory.js`, `src/scenes/hub.js`, `results.js`, `src/ui/hub*.js` | `hunt.js` (Loadout anwenden, Item/Context-Hooks, Carving), `data/quests.js`, `data/weapons.js` (Bäume), `scenes/index.js`, `main.js` (`__SH.save`) |
| **N – Netz** | `src/net/*`, `src/scenes/lobby.js`, `src/ui/lobby*.js` | `hunt.js` (Netz-Hooks), `scenes/index.js`, `main.js` |
| **K – Welt** | `src/game/world/*` (inkl. `gatherables.js`), `src/data/gather.js`, `src/audio/*` | `render/textures.js`, `data/quests.js` (world-Feld), `ui/hud.js` (nur Minimap) |

Änderungen an Dateien, die man nicht besitzt: klein, in klar abgegrenzten Blöcken, mit Kommentar `// [W]`, `// [M]` usw. davor, damit der Lead Konflikte schnell auflösen kann.

## Item-IDs (fix, alle nutzen diese)
Sammelmaterial: `knisterkraut, blaublatt, wabbelpilz, stinkmorchel, schrotterz, glimmstein, altknochen, grossknochen, brummkaefer, blitzkaefer, glutbrocken, sprudelwasser`
Brocken-Material: `jaggo_schuppe, jaggo_fell, jaggo_kamm, jaggling_schuppe, barrotz_kruste, barrotz_platte, barrotz_schwanzleder, brathalos_schuppe, brathalos_membran, glutsack, brathalos_rubin`
Verbrauchbar: `flickbrause, dicke_flickbrause, pustekuchen, sprudelwasser, blendknolle, stinkbombe, klebefalle, knallgurke, brennspitze, giftspitze, bummspitze`

## Schnittstellen zwischen Agents
- **Inventar während der Jagd (P):** `hunt.inventory` mit `count(id)`, `add(id, n)`, `consume(id, n) → bool`, `items` (Leiste). Ist sie nicht vorhanden (anderer Worktree), defensiv mit `?.` zugreifen.
- **Bogen-Spitzen (W liest, P setzt):** `player.ammoTip` = `null | 'brennspitze' | 'giftspitze' | 'bummspitze'`. P setzt es, wenn der Spieler eine Spitze in der Item-Leiste „benutzt". W verbraucht pro Schuss `hunt.inventory?.consume(tip, 1)`; ist es leer → `player.ammoTip = null`.
- **Status auf Brocken (M implementiert, P/W rufen auf):** `monster.applyStatus(type, opts)` mit `type ∈ 'blind' (4 s, holt Fliegende runter) | 'trap' (6 s, 1×/60 s) | 'poison' ({buildup}) | 'stun' ({buildup}) | 'stink' (Zielwechsel/Zone) | 'fire' | 'shock'`. Rückgabe bool (gewirkt?). Ist die Methode nicht da: `monster.applyStatus?.(...)`.
- **Schlamm/Brennen/Gift auf dem Pirscher (M verursacht, P heilt):** `player.status` = Objekt `{ mud: {t, rollsLeft}, burn: {t, rollsLeft}, poison: {t} }`; `player.addStatus(type, opts)` und `player.clearStatus(type?)`. M implementiert diese beiden Methoden in `player.js` minimal, falls sie fehlen (Block markiert `// [M]`). Rollen reduziert `rollsLeft`.
- **Welt (K stellt bereit, M nutzt):** zusätzlich zum Phase-1-Interface: `world.nestFor(monsterDefId) → {x,z}`, `world.routeFor(monsterDefId) → [{x,z}...]` (Wanderpunkte), `world.zoneAt(x,z) → zoneId (1..4)`, `world.groundType(x,z) → 'grass'|'mud'|'rock'|'lava'`. M nutzt das mit Fallback auf `world.nestPoint`.
- **Sammeln (K):** Sammelpunkte sind Entities in `world.gatherPoints` (`{id, kind, pos, usesLeft}`). Nähe → `hunt.contextLabel = 'Sammeln'`; halten 0,8 s → `bus.emit('gathered', {pointId, items:[{id,n}]})` und `usesLeft--`. P hört auf `gathered` und füllt das Inventar.
- **Zerlegen (P):** Nach Brocken-Tod → `bus.emit('monsterDead', {monster})` (M stellt sicher, dass das gefeuert wird) → P macht Zerlegen über Context-Taste.
- **Wurf-/Platzier-Items (P):** über `hunt.spawnEffect(kind, params)` (P implementiert: `'flash'|'stink'|'trap'|'bomb'`). N hängt sich später an `spawnEffect`, um es zu synchronisieren.
- **Szenenfluss:** Hub (P) → Solo: `app.goto('hunt', {quest, loadout})`; Koop: `app.goto('lobby', {mode:'host'|'join', code?, quest, loadout})` (N). Lobby → `app.goto('hunt', {quest, loadout, net, seed})`. Jagd-Ende → `app.goto('results', {result, rewards, quest})` (P).
- **Loadout:** `{ name, weapon:{type:'gs'|'db'|'bow', tier, branch}, armor:{head, body, legs}, items:[{id,n}], food }`. Fehlt es (Debug-URL), Standardausrüstung.
- **Netz (N):** `hunt.net` = `null` (solo) oder Objekt mit `isHost`, `send(type, payload)`, `on(type, fn)`, `peers`. Andere Agents müssen nichts Netz-spezifisches bauen; N integriert Spieler, Brocken-Snapshots, Angriffe (`monster.startAttack`), Treffer (`ctx.playerHit` → beim Gast an Host), Sammelpunkte (`gathered`), `spawnEffect`, Auftragszustand.

## Regeln für alle
- `npm test` und `npm run build` müssen grün sein. Neue Logik mit Vitest testen.
- Smoke-Test im Browser über Playwright (`/opt/node-tools/node_modules/playwright`, Chromium-Args `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, niemals `playwright install`), Screenshot bei 844×390 ansehen.
- Deutsche Spielertexte, eigene Begriffe aus `docs/GDD.md`, keine Markennamen von Monster Hunter.
- HUD/Menüs kompakt (GDD §10). Touch-first, alles mit dem Daumen bedienbar, Tap-Ziele ≥ 40 px.
- Commits mit Footer:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Kn1UPYH6JVr5FMfc6TjqEe
  ```
  Kein Push, keine PRs, keine Modellnamen im Code/Commits.
