# Architektur

Stack: **Vanilla JS (ES Modules) + three.js (npm) + Vite**, PeerJS für P2P, Vitest für Unit-Tests, Playwright (e2e, vom Lead betrieben). Keine Frameworks, keine externen Assets (alle Texturen/Sounds prozedural).
Deploy: GitHub Actions → GitHub Pages, `vite.config.js` mit `base: './'`.

## Verzeichnisse & Zuständigkeit

```
index.html                 Einstieg, lädt src/main.js
src/main.js                Boot, Szenen-Manager (title → hub → lobby → hunt → results)
src/core/                  loop.js (fixed 60 Hz sim + variable render), events.js (Bus), rng.js (seeded), math.js
src/render/                renderer.js (Low-Res PS1-Pipeline), ps1.js (Material-Patch Vertex-Snap), textures.js (prozedurale Canvas-Texturen),
                           fx.js (Partikel, Funken, Schadenszahlen, Glitch), camera.js (Follow/Lock-On/Shake)
src/input/                 input.js (abstrakte Actions), touch.js, keyboard.js, gamepad.js
src/game/                  hunt.js (Jagd-Session: Welt, Entities, Regeln), player.js, combat.js (Schadensformel, Hit-Resolution),
                           hitbox.js (Kugel/Kapsel-Tests), status.js, items.js (Item-Nutzung im Kampf)
src/game/weapons/          weapon.js (Combo-State-Machine, datengetrieben), greatsword.js, dualblades.js, bow.js
src/game/monsters/         monster.js (Basis: KI-Zustände, Teile, Angriffs-Runner), jaggo.js, jaggling.js, barrotz.js, brathalos.js
src/game/world/            map.js (Schotterklamm-Geometrie, Kollision/Höhe), zones.js, gatherables.js
src/data/                  Reine Daten: items.js, recipes.js, weapons.js, armor.js, drops.js, quests.js, foods.js, monsters.js
src/meta/                  save.js, inventory.js, crafting.js, progression.js (pure Logik, unit-getestet)
src/ui/                    hud.js, hub.js, lobby.js, results.js, ui.css (DOM-Overlay über Canvas)
src/net/                   net.js (PeerJS Wrapper), protocol.js (Nachrichtentypen), sync.js (Interpolation)
src/audio/                 sfx.js (WebAudio, prozedural)
tests/unit/                Vitest
```

## Kernverträge

### Simulation
- `loop.js`: fester Sim-Schritt `DT = 1/60`. `update(dt)` aller Systeme, danach `render(alpha)`. Zeitlupe über `time.scale` (Glitch-Konter), Hitstop pro Entity (`entity.hitstop` Sekunden, in denen deren Animation/Bewegung pausiert).
- Alle Zufälle in der Simulation über `rng.js` (seeded) → Tests deterministisch.

### Entities
Jede Entity: `{ id, type, pos: Vector3, rot (yaw), vel, hp, update(dt, ctx), mesh (THREE.Object3D) }`.
`ctx` = Hunt-Kontext: `{ hunt, players, monsters, world, events, rng, time, net }`.

### Moves (Waffen) – datengetrieben
```js
{
  id: 'gs_hieb', anim: 'overhead', duration: 0.9,
  hits: [{ t0: 0.42, t1: 0.52, shape: 'capsule', from:[0,1.2,0.3], to:[0,0.2,2.6], radius: 0.5,
           mv: 48, blunt: 0, wucht: 6, hitstop: 'heavy', multi: false }],
  combo: { window: [0.55, 0.85], next: { A: 'gs_quer', holdA: 'gs_charge1', B: 'gs_rempler' } },
  rollCancelAt: 0.6, moveSpeed: 0, turnSpeed: 0.5, superArmor: false
}
```
`weapon.js` führt Moves aus, puffert Eingaben (0,25 s), löst Hits über `combat.js` aus.

### Brocken-Angriffe – datengetrieben & deterministisch
```js
{ id: 'jaggo_huepfer', range: [3, 10], weight: 3, cooldown: 4, rageOnly: false,
  telegraph: 0.7, flashParts: ['legs'], duration: 1.6,
  hits: [{ t0: 0.85, t1: 1.0, shape:'sphere', at:'body', radius: 1.6, dmg: 22, knock: 'down' }],
  motion: (t, m, ctx) => { /* Bewegung über Zeit, deterministisch aus Startparametern */ } }
```
Ein Angriff wird mit `{attackId, t0, origin, dir, targetPos, seed}` gestartet. Host sendet genau das im Netzwerk; Clients spielen identisch ab und prüfen Treffer gegen ihren eigenen Pirscher.

### Teile & Hurtboxes
Brocken definieren Teile: `{ id:'head', node: Object3D, radius, factor, breakHp, elem:{fire, shock}, blunt:true }`. Hurtbox = Kugel um Weltposition des Nodes.

### Kampf
`combat.js`: `resolvePlayerHit(attackerState, move, hit, monster, partId) → {dmg, crit, weak, elemDmg}` (pure, unit-getestet) und `applyMonsterHit(monster, result)`; im Koop geht `applyMonsterHit` beim Gast über das Netz an den Host.
Spieler-Treffer: `player.takeHit({dmg, knock, status, sourcePos})` prüft i-Frames/Perfekt-Ausweichen/Block.

### Events (Bus)
`hit`, `partBreak`, `monsterState`, `playerDown`, `glitchCounter`, `itemUsed`, `gathered`, `carved`, `questComplete`, `questFailed`, `sfx` (payload `{name, pos}`).

### Debug-/Test-API (Pflicht, wird vom Lead für e2e-Tests genutzt)
`window.__SH` mit: `scene`, `hunt`, `player`, `monsters`, `timeScale(x)`, `god(bool)`, `press(action, ms)`, `stick(x, y)`, `save`, `goto(scene, opts)`.
URL-Parameter: `?scene=hunt&quest=jaggo&weapon=gs|db|bow&seed=1&god=1&nofx=1`, `?peerhost=&peerport=` für lokalen Signaling-Server.

### Input-Actions (abstrakt)
`move{x,y}`, `camera{dx,dy}`, `attack` (down/up/held ms), `special`, `roll`, `lock`, `context`, `item`, `itemNext`, `itemPrev`, `menu`. Touch, Tastatur und Gamepad füllen dieselbe Struktur.

### Netzwerk-Protokoll (Kurzform)
`hello{name, weapon, armor}`, `lobby{players, quest, seed}`, `start{seed, quest, t}`, `p{id, pos, rot, anim, animT, hp, flags}` (15 Hz), `m{id, pos, rot, state, anim, hpPct, parts, flags}` (10 Hz), `atk{monsterId, attackId, t0, origin, dir, target, seed}`, `hit{monsterId, part, dmg, blunt, elem, status}`, `gather{pointId}`, `ev{type, ...}`, `end{result}`.
