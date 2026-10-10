# Phase 3 – Verträge zwischen den Bausteinen (Rostwerke)

Autoritativ für Zahlen/Inhalte: `docs/GDD.md` §15 (Rostwerke) + §16 (Brocken 2.0, Glitch, Mutatoren). Leitregel: Brocken abwechslungsreich UND schwer, Telegraph ≥ 0,5 s, alles host-autoritativ + deterministisch (Zufall nur beim Host, Replay aus Attack-params).

## Welt `rostwerke` (`src/game/world/rostwerke.js`, registriert in `world/index.js`)
- `createWorld('rostwerke', { seed })` liefert wie Schotterklamm: `heightAt, collide, zoneAt(x,z)→1..4, groundType(x,z)→'grass'|'mud'|'lava'|'slag'|'metal'|'toxic', spawnPoints, campPoint, monsterSpawns{kroll,gorgo,voltaro,default}, nestFor(id), routeFor(id), gatherPoints, minimap, env, layout (walkable/reachable für nav.js)`.
- Zonen: 1 Schlackehalden (Start, Camp im Waggon, Gorgo), 2 Kesselhalle (Kroll), 3 Giftgraben, 4 Turbinenkrone (Voltaro).
- `world.id === 'rostwerke'` → Musik-Stil 'rost' (bereits verdrahtet in hunt.js).
- **Interactable-Plätze:** `world.interactables = [{ id: 'valve1', type: 'valve'|'crane'|'rod', x, z, yaw, zone }]` – 6 valve (Zone 2), 2 crane (Zone 1, mit `dropAt:{x,z}` Lastkreis), 4 rod (Zone 4). Nester: `world.beetleNests` werden als normale gatherPoints vom Typ `rostkaefer` abgebildet.

## Interactables (`src/game/world/interactables.js`)
- `createInteractables(hunt)` → `hunt.interact`: `list`, `nearest(player)`, `use(player, id)` (Kontext-Taste wie Sammeln), Host entscheidet, Gäste schicken Wunsch; Zustand per Netz (`MSG.EV {k:'ia', …}`).
- API für Brocken: `hunt.interact.rods()` → aktive Blitzableiter `[{id,x,z,alive}]`, `hunt.interact.damageRod(id, n)`, `destroyRod(id)`; Bus `rodDestroyed {id}`, `valveBurst {id, x, z}`, `craneDrop {id, x, z}`.
- Schaden auf Brocken über `monster.applyDamage({ dmg, partId:null, env:true, … })`; Pirscher über `player.takeHit({ dmg, knock, key, … })`.

## Status Rost
- `monster.applyStatus('rost', { amount })` (Aufbau 100 → 15 s `m.st.rustT`: alle Teile-Faktoren +0,15, Teil-HP-Schaden ×1,5); `player.applyStatus?.('rost')` bzw. Feld `player.v.rust` (Schutz −30 % für 20 s). Element `rost` in Waffen-/Item-Daten = Rost-Aufbau pro Treffer.
- `hunt.groundingZones = [{ x, z, r: 4, until }]` (Erdungsstab) – Voltaros Kettenblitz/Donnerschlag ignoriert Pirscher darin.

## Glitch-Stellen (generisch, `monster.js`)
- `def.glitchSpots = ['partId', …]`: diese Teile flackern sichtbar (RGB/Glitch-Look) und geben bei eigenen Treffern ×2 Glitch-Energie; nach Bruch erlischt die Stelle.

## Brocken-Defs (`src/game/monsters/{kroll,gorgo,voltaro}.js`)
- Brocken-2.0-Felder (chains, phases, teachAttack, stamina, flinchDmg, cue, audit pro Angriff mit hits), `glitchSpots`, Teile + Werte nach GDD §15.4–15.6, Drops in `data/drops.js`.

## Quests / Progression
- `data/quests.js`: `kroll` „Rauch am Horizont" (JR 5), `gorgo` „Was da gräbt" (JR 5), `voltaro` „Der Funkenfürst" (JR 6), `rostiger_ausflug` (Sammeln, Rostwerke), Rotglut-Varianten JR 7; alle mit `world: 'rostwerke'`. JR 5 schaltet nach erstem Brathalos frei.
- `data/quests.js`-Eintrag `revierstreit` (JR 4, Schotterklamm, `monsters: ['barrotz','jaggo']`) und Feldstudie (generiert, siehe `src/meta/fieldstudy.js`).
