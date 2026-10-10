# Phase 5 – Rostwerke: Verträge zwischen den parallelen Agents

Basis: GDD §15. Drei Agents parallel (R = Map & Systeme, MK = Kroll + Gorgo, MV = Voltaro). Parallel laufen außerdem noch Katana (KT), Gear-Optik (G) und Fauna (L) aus Phase 4 – deren Dateien nicht anfassen.

## Besitz
| Agent | Besitzt | Darf minimal (markiert `// [R]` / `// [MK]` / `// [MV]`) |
|---|---|---|
| **R** | `src/game/world/rostwerke*.js`, `src/game/world/interactables.js`, `src/data/gather.js` (Rostwerke-Teil), Rost-Status, neue Items/Rezepte | `world/index.js`, `data/quests.js`, `data/items.js`, `data/recipes.js`, `data/drops.js`, `monsters/monster.js` (nur `applyStatus('rust')`), `player.js` (nur `addStatus('rust')`), `net/sync.js` (Interactable-Sync), `ui/hud.js` (Minimap-Icons) |
| **MK** | `src/game/monsters/kroll.js`, `gorgo.js` | `monsters/index.js`, `monster.js` (generische Hooks, z. B. `burrow`, Phasen), `data/drops.js` (Kroll/Gorgo-Block) |
| **MV** | `src/game/monsters/voltaro.js` | `monsters/index.js`, `monster.js` (generische Hooks), `data/drops.js` (Voltaro-Block) |

## Schnittstellen
- **Welt:** `createWorld('rostwerke', {seed})` liefert das bekannte Interface + `zoneAt`, `groundType` (`'slag'|'toxic'|'metal'|'grass'|…`), `nestFor('kroll'|'gorgo'|'voltaro')`, `routeFor`, `monsterSpawns`.
- **Interactables (R):** `world.interactables = [{id, kind:'valve'|'crane'|'rod', pos, state, cooldown}]`. `world.activate(id, by)` (Host-autoritativ; Gäste senden Anfrage). Events: `bus.emit('hazard', {kind, id, pos, radius, dir})` wenn ein Ventil zündet / Kran-Last fällt. R wendet Schaden auf Brocken/Pirscher selbst an (Brocken über `monster.applyDamage`-Pfad bzw. `applyStatus('stun')`).
- **Blitzableiter (R stellt bereit, MV nutzt):** `world.rods` → `[{id, pos, alive}]`, `world.damageRod(id, n)` (3 Treffer zerstören; Pirscher-Treffer per Nahkampf/Pfeil), `world.destroyRod(id)` (Voltaro-Phase 2), Event `rodDestroyed {id}`. Voltaro prüft `world.rods?.filter(r => r.alive)`; Fallback wenn nicht vorhanden: feste Punkte um das Nest.
- **Eingraben (MK):** Ein Brocken im Zustand `burrow` ist `m.burrowed = true`, unverwundbar für normale Treffer; R's Kran-Last und P's Knallgurke (über `hunt.spawnEffect('bomb')` → Treffer) müssen ihn erreichen: MK implementiert `monster.onHazard?.({kind, pos, radius})` und für die Bombe einen Check in seinem Tick (Bomben-Effekte in `hunt.effects.list` o. ä. – defensiv prüfen).
- **Rost (R):** `monster.applyStatus('rust', {buildup})` → bei 100: 15 s verrostet (Teile-Faktoren +0,15, Teil-HP-Schaden ×1,5). `player.addStatus('rust', {t:20})` → Schutz −30 %, Sprudelwasser/Kühlbrause entfernt. MK/MV rufen nur diese APIs auf (defensiv mit `?.`).
- **Determinismus:** Alle Brocken-Angriffe deterministisch aus `{attackId, t0, origin, dir|yaw, targetPos, seed, rage}` (+ ggf. `phase`), Telegraph ≥ 0,5 s (Rotglut −20 %), jeder Angriff ausweichbar → `tests/unit/p3fairness.test.js` um die neuen Angriffe erweitern. Gast-Replay muss Spezialzustände (eingegraben, Überladen, Phase 2, Panzer gebrochen) über Snapshot-`flags` bekommen.
- **Aufträge (R):** `kroll`, `gorgo`, `voltaro`, `rostwerke_sammeln`, Rotglut-Varianten; `?scene=hunt&quest=kroll|gorgo|voltaro` muss funktionieren (Welt `rostwerke`). JR-Freischaltung laut GDD §15.8.
- **Item-IDs (fix):** Sammeln `kupferdraht, schlacke, rostkaefer, giftschlamm, funkenstein`; Brocken `kroll_panzer, kroll_schere, kroll_auge, gorgo_segment, gorgo_zahn, gorgo_kern, voltaro_kamm, voltaro_spule, voltaro_fell, voltaro_herz`; Items `rostbombe, rostspitze, erdungsstab, kuehlbrause`.

## Regeln
`npm test` + `npm run build` grün, neue Logik getestet, Playwright-Screenshots (844×390) angesehen, keine Konsolenfehler. Commit-Footer:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Kn1UPYH6JVr5FMfc6TjqEe
```
Nicht pushen.
