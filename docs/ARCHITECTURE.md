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

---

# Phase 1: konkrete Schnittstellen (Stand Fundament)

Alles unten ist implementiert und getestet (`npm test`, 100+ Unit-Tests). Parallel arbeitende Agents erweitern **über Registries** – jede Erweiterung ist ein Ein-Zeiler in der jeweiligen `index.js`.

## Befehle
`npm run dev` (Vite, LAN-Host) · `npm run build` (→ `dist/`, `base: './'`) · `npm test` (Vitest, `tests/unit/**`, DOM-Stub in `tests/setup.js` damit prozedurale Canvas-Texturen in Node laufen) · `npm run preview`.
Deploy: `.github/workflows/deploy.yml` (push auf `main`), CI: `.github/workflows/ci.yml` (PRs).

## Konventionen
- Einheiten: Meter, Sekunden. **Y = oben.** `yaw = 0` blickt nach +Z; `forward(yaw) = (sin yaw, 0, cos yaw)`. Modelle blicken lokal +Z.
- **Lokale Koordinaten** (Hitboxen von Waffen/Angriffen): `[x, y, z]` = (links, oben, vorn) relativ zum Entity (`+x` ist die **linke** Seite der Figur), Umrechnung `core/math.js → localToWorld(out, pos, yaw, lx, ly, lz)`.
- Kamera-`yaw` = Blickrichtung. Stick `y > 0` = vorwärts (Kamera-relativ). Rechts = `(-cos yaw, 0, sin yaw)`.
- Sim-Schritt `DT = 1/60` (`core/loop.js`). `update(dt)` bekommt `DT * time.scale` (Zeitlupe). Zeitlupe: `time.slowmo(dauerSekRealzeit, scale)` (`core/time.js`). Hitstop: `entity.hitstop = sek` + `consumeHitstop(entity, dt)` am Anfang von `update`.
- Zufall in der Sim nur über `core/rng.js` (`createRng(seed)`; `rng()`, `.range(a,b)`, `.int(a,b)`, `.chance(p)`, `.pick(arr)`).
- Spielertexte Deutsch, Code Englisch.

## Registries (hier eintragen)
| Was | Datei | Eintrag |
|---|---|---|
| Waffe | `src/game/weapons/index.js` | `weapons = { gs, db: dualblades, bow }` – Def exportieren, eine Zeile |
| Waffen-Werte (Kraft, Krit, Element je Stufe) | `src/data/weapons.js` | `WEAPON_TYPES[type].tiers[]`, `weaponStats(type, tier)` |
| Brocken | `src/game/monsters/index.js` | `monsters = { jaggo, jaggling, barrotz, … }` |
| Welt | `src/game/world/index.js` | `worlds = { test: createTestArena, schotterklamm: … }`, `createWorld(id)` |
| Auftrag | `src/data/quests.js` | `quests[id] = { id, name, monster, world, timeLimit, reward, jr }` (`world` = Welt-Registry-Key) |
| Szene | `src/scenes/index.js` | `scenes = { title, hunt, hub, lobby, results … }`; wechseln mit `app.goto(name, opts)` |
| Prozedurale Textur | `src/render/textures.js` | `registerTexture(name, (g, n, rnd) => …)`, benutzen mit `tex(name, {size:16\|32, repeat})` |
| SFX | `src/audio/sfx.js` | `SOUNDS[name] = (opts) => …`; auslösen über `bus.emit('sfx', {name, pos, …})` (Hunt routet mit Distanz-Lautstärke) |

**Szene** = `{ enter(app, opts), exit(), update(dt), render(alpha) }`. `app = { renderer, input, touch, ui (DOM-Root), bus (appBus), settings, sfx, goto }`. Szene-DOM in `app.ui` anhängen (Klasse `screen` wird beim Szenenwechsel automatisch entfernt; interaktive Elemente brauchen Klasse `ui-hit` bzw. sind `button`/`.btn`, sonst ist `#ui` `pointer-events:none`). Touch-Steuerung nur in der Jagd: `app.touch.setVisible(bool)`.

## Waffen (`src/game/weapons/`)
`weapon.js` ist rein logisch (kein THREE) und unit-getestet: `new WeaponState(def, hooks)`; der Spieler füttert `w.update(dt, {A: input.b.attack, B: input.b.special})` (und `w.feed(dt, inp)` solange er rollt / reagiert).

**Weapon-Def** (`greatsword.js` ist das Referenzbeispiel):
```js
{ id:'gs', name,
  holdThreshold:{A:0.2, B:0.2},          // 0/fehlt = Tipp sofort bei Druck; sonst Tipp = Loslassen < Schwelle, Halten = 'holdA'/'holdB'
  idle:{ A:'gs_hieb', holdA:'gs_charge', B:'gs_rempler', holdB:'gs_block' },  // Wert = Move-ID oder fn(w)=>ID
  moves:{ … }, anims:{ name: compileTrack([...]) },
  overrideEvent(w, type){ return 'gs_finisher' | undefined },   // z. B. Wucht-100-Finisher (greift überall, wo ein Move Eingaben annimmt)
  on:{ shoot(w, move, fireDef){…} },     // Ziele von move.fire (Timeline-Events, z. B. Pfeil abschießen)
  onUpdate(w, dt),                       // optional, pro Schritt
  buildMesh(): THREE.Object3D,           // sitzt in der rechten Hand; Klinge entlang lokal -Y (Griff = Ursprung)
  status(w): {text, level, max, sauber}|null }   // HUD-Zeile (Ladestufe etc.)
```
**Move** (`kind` fehlt = Zeitleisten-Move):
```js
{ id, anim, duration,
  hits:[{ t0, t1, shape:'capsule', from:[x,y,z], to:[x,y,z], radius }            // oder shape:'sphere', at:[x,y,z], radius
         + { mv, blunt, wucht, hitstop:'light'|'medium'|'heavy', group, multi, interval, shake }],
  // group: gleiche group = max. 1 Treffer pro Ziel pro Move-Instanz (Schwünge sind als mehrere Kapseln entlang der Klinge modelliert, damit Hitbox = Visual).
  combo:{ window:[a,b], next:{ A, holdA, B, holdB } },   // Eingabepuffer 0,25 s vor Fensterbeginn
  rollCancelAt, moveSpeed (Faktor auf Gehtempo, 0 = stehen), turnSpeed (Faktor auf Drehrate),
  superArmor: true|'flinch'|'all'|[t0,t1,'flinch'|'all'],
  lunge:{t0,t1,dist}, arc:{t0,t1,h} (Sprunghöhe, nur Visual), consumeWucht:true,
  fire:[{t, call, …}] }
```
`kind:'charge'`: `{button:'A', levels:[0.5,1,1.5], maxHold, over (Stufe bei Überladung), sauber:[a,b], releases:[id_stufe0, id1, id2, id3], startT, rate, staminaPerSec}` – beim Loslassen wird `releases[level]` gestartet, `flags.sauber` gesetzt. `kind:'hold'`: `{button:'B', minTime, block:{arc, pass, staminaMul, wucht}, next}` – läuft solange der Button gehalten wird (Klingenblock).
`WeaponState`-API für den Player: `activeHits()`, `canHit(group, targetKey, hit)`, `markHit`, `addWucht(n)`, `wucht`, `moveSpeedMul()`, `turnMul()`, `canRollCancel()`, `superArmor()`, `lungeSpeed()`, `airOffset()`, `blockDef()`, `pose()`, `cancel()`, `reset()`, `data` (freier Waffen-State, z. B. Rausch an/aus, Bogenstufe), `flags.{sauber,glitch}`.
Der Spieler stellt in den Hooks bereit: `takeGlitch()` (verbraucht den Glitch-Konter-Bonus beim Start eines Treffer-Moves), `drain(amount)`, `exhausted()`, `onChargeLevel`. Nach Rolle: `player.sinceRoll` (Sekunden) – z. B. für „Ausweichspannen" des Bogens (Stufe 2 direkt nach Rolle). Aim-Assist (max. 35° zum Lock-Ziel) und Ausrichten auf die Stickrichtung passieren automatisch beim Start jedes Moves.
**Erweiterungen fuer das Katana `[KT]`** (alle optional, andere Waffen unberuehrt): `def.earlyTap:{B:true}` (Tipp-Event schon beim Druecken, `holdB` folgt nach der Schwelle), `def.counter:{arc, invuln, active(w), onCounter(w,h,player)}` (Hook in `Player.takeHit`, gibt `'block'` zurueck, damit Monster/Projektile den Treffer als verbraucht markieren; funktioniert lokal pro Spieler, also auch bei Gaesten im Koop), `WeaponState.startMove(id)`, `def.poseLevel(w)` (Wert fuer `pose().level`, im Koop-Snapshot als `level`), `def.dmgMul(w)` (Waffen-Schadensfaktor, z. B. Schliff, in `hunt.playerHit`), Hit-Felder `sauberMul` / `sauberText` (Blankgezogen +20 %), `def.buildMesh({tier, branch})` + `def.tierMesh:true` (Mesh pro Waffenstufe/Zweig), Rig: `mesh.userData.grip2` (Object3D, an dem die zweite Hand greift -> linker Arm wird per `aimLeftArm` darauf ausgerichtet = zweihaendig) und `mesh.userData.hip` (Scheide am Guertel).

Animationen: `game/anim.js` – Keyframes `[t, {Pose-Keys}, 'lin'?]`; Pose-Keys siehe Kommentar in `anim.js` (Klingenwinkel = `arx + sw`). Projektile (Bogen): bitte über `ctx.projectiles` o. Ä. in `hunt.js` ergänzen und Treffer wie Nahkampf über `ctx.playerHit(player, monster, {part, pos}, ah)` auslösen.

## Spieler (`src/game/player.js`)
`new Player({id, name, weapon:'gs', tier, local, ctx})`. Felder: `pos, rot, vel, v (Vitals: hp, maxHp, bruise, stamina, exhaust …), state ('free'|'roll'|'flinch'|'down'|'pinned'|'ko'), weapon (WeaponState), lock, glitchT, invuln, god, stats (Waffenwerte), protect, flinkfuss`.
- `takeHit({dmg, knock:'none'|'flinch'|'down'|'pin', sourcePos, key, dmgMul?}) → 'hit'|'block'|'iframe'|'perfect'|'ignored'`. `key` identifiziert die Angriffs-Instanz (pro Angriff max. ein Glitch-Konter).
- `hitCapsules()`: Hurtboxen für Monster-Hit-Tests (zählt in den ersten Frames einer Rolle auch die Startposition → verlässliche Perfekt-Ausweichen).
- Reine Regeln in `src/game/vitals.js` (HP/Prellung/Puste/`rollPhase`) und `src/game/combat.js` (`calcDamage`, `resolvePlayerHit`, `HITSTOP`, `SHAKE`), `src/game/hitbox.js` (`sphere`, `capsule`, `overlap`, `playerCapsule`).
- Remote-Spieler (Netzwerk): `local:false` – wird nicht von Monster-Hits getroffen (jeder Client prüft nur seinen eigenen Pirscher), Position/Pose vom Netz setzen (`snapshot()` liefert das Sendeformat).
- Items (Meta-Agent): `Hunt.onItem(player, 'use'|'next'|'prev'|'slot', slot)` und `Hunt.onContext(player, 'press'|'hold')` sind leere Hooks – überschreiben/erweitern. Touch-Beschriftung: `hunt.contextLabel = 'Sammeln'` (Kontext-Taste erscheint nur wenn gesetzt) und `hunt.itemLabel = 'Flickbrause x2'`. Heilung: `healVitals(player.v, hp, healBruise)` aus `vitals.js`; Puste-Kosten: `player.v.costMul = 0.5`.

## Brocken (`src/game/monsters/`)
**Monster-Def** (`jaggo.js` ist das Referenzbeispiel):
```js
{ id, name, minor?:true (Kleinmonster: kein Rotglut/Flucht), hp, scale, bodyRadius (Kollisionskreis XZ),
  walk, run, detect, prefer,
  parts:[{ id, label, factor, breakHp?, jitter?, elem:{fire,shock}, blunt, stunPart (Kopf: Betäubung), lock:false?,
           spheres:[{ node:'head', offset:[x,y,z] (Modell-Einheiten), r (Modell-Einheiten, wird × scale) }] }],
  attacks:{ [id]: AttackDef }, build():{root, apply(pose), nodes, partMeshes:{partId:[Mesh]}, extra},
  onBreak(m, part), onRage(m, on) }
```
`partMeshes` müssen **eigene Materialien pro Teil** haben (`render/ps1.js → lambert()`), damit Telegraph-Blinken und Teilschaden-Jitter (`mat.userData.ps1.uJit.value`) pro Teil funktionieren. `game/monsters/raptor.js` ist ein fertiger Modell-Baukasten (Posen-Keys in `MREST`, `monster.js`); neue Modelle liefern `apply(pose)` mit denselben (oder eigenen) Pose-Keys.
**AttackDef** (Zeiten in „Def-Zeit" τ, Telegraph = τ < `telegraph`):
```js
{ id, range:[min,max], weight, cooldown, rageOnly, cond(m, ctx), telegraph (≥ 0.5!), flashParts:['legs'], duration,
  hits:[{ t0, t1, shape:'sphere'|'capsule', at|from,to (lokal, METER, +z vorn), radius, dmg, knock:'flinch'|'down'|'pin' }],
  motion(tau, a) → {x, z, yaw?, air?}   // reine Funktion der Startparameter; a = {origin, yaw0, dir, target, landing, r(i) (seeded 0..1), def}
  prepare(a), pose: mTrack([...]), marker:{at:'self'|'target'|'landing', radius}, markerUntil,
  events:[{t, call}], calls:{ call(m, ctx, inst) } }   // events laufen nur beim Host (Spawns etc.)
```
**Deterministisch/Netzwerk:** `AttackInstance` (`attack.js`) ist eine reine Funktion von `{attackId, t0, origin, yaw|dir, targetPos, seed, rage?}` → `sample(t)` (Position/Yaw/Luft), `hitsAt(t)` (Welt-Hitshapes). Rotglut wird über `rage:true` in den Parametern übertragen (Telegraph −20 % aber nie < 0,5 s, Rest 1,2× schneller). Host: `monster.startAttack(params)` emittiert `monsterAttack {monsterId, …params}` auf dem Hunt-Bus. Client: `monster.authority = false`, bei `atk`-Nachricht `monster.startAttack(params, elapsed)`, pro Frame `monster.tickRemote(dt)` (spielt Bewegung/Pose ab und prüft Treffer nur gegen lokale Spieler). Host-Zustand für `m`-Nachrichten: `monster.snapshot()`; `applyDamage(res)` ist der Host-Eingang für Gast-`hit`-Events (Format von `resolvePlayerHit`: `{dmg, elemDmg, partId, blunt, crit, weak, attackerId}`). `combat.applyMonsterHit` routet bei `ctx.net.isGuest` über `ctx.net.sendHit(monster, result)`.
**Brocken 2.0 (alle Felder optional, ohne sie verhält sich der Brocken wie vorher; `def.brocken2:false` schaltet Timing/Lehr/Anti-Spam/Retarget ab, Default = an, sobald eines der Felder gesetzt ist):**
```js
def: { chains:{ [lastAttackId]:[{ atk|null, w, cond(m,dist) }] },   // max 3 Glieder, Pause 0,1–0,25 s, End-recover ≥ 1,0 s
       phases:[{ at:0.7, name, cue, special:attackId, enter(m) }],   // m.phase = Anzahl betretener Phasen
       teachAttack:id, stamina:true, tiredAttack:id, flinchDmg:number|true (true = 6 % maxHp / 3 s), brocken2?:bool }
attack: { stam (Default 8), tgVar:false, punishRoll:true, needsBroken:'partId', lockedByBreak:'partId', phase:n, cue:{color,tone},
         noTeach:true (nie Lehrangriff, z. B. Aufflug), tempo (Default 1, ganzer Angriff schneller; Telegraph nie < 0,5 s), audit:[Distanzen] (Pflicht für neue Angriffe mit hits → automatisch im Fairness-Audit) }
params (zusätzlich, fehlend = Default): tgMul (Telegraph-Faktor, Protokoll 'k'), chainIdx ('c'), teach ('e')
```
Bus: `attackStart {monster, attackId, inst, chainIdx, teach, cue}` (alle Clients), `teach {monster, attackId}`, `monsterTired {monster,on}`, `monsterPhase {monster, idx, name, cue}`, `monsterFlinch {monster}`, `retarget {monster, playerId}`. Snapshot: Flag `tired` (MF.TIRED), `phase` (`ph`). Zufall nur beim Host (`beginAttack`/`_chainStep`), Replay nur aus params. Ziel wechselt nur zwischen Ketten/Angriffen (recover ≥ 0,5 s + Marker), globales Aggro-Budget `ctx._aggro` (0,6 s, Uhr = `hunt.time`). Lehrangriff = erster lehrbarer Angriff der Jagd (tgMul 1,4, keine Kette; auch wenn ein `def.combat`-Hook ihn startet). Kettenglieder prüfen `attack.cond` + `chain.cond`. Phasen-Special über `queued` prüft keine Reichweite (Special selbst muss Lücke schließen).
**Lesbarkeit (`src/game/cues.js`, `attach(hunt)`):** hört auf `attackStart` → Windup-Ton (`sfx 'windup'`, Klangfarbe aus `cue.tone` oder Hash der attackId, Länge = Telegraph), Farbglühen (emissive auf `monster.parts[].mats`, via Wrapper um `hunt.rig.update` – läuft nach den Monster-Visuals), Kamera-Framing `rig.frame(amount, s)` bei Kettengliedern/weiten Angriffen; Phase/Erschöpfung/Retarget → Ton + HUD. **Tod-Log** `src/meta/deathlog.js` (localStorage `mmh.deathlog.v1`, Cap 200, `playerDown` trägt `lastHit`), Anzeige im Spiegel → Erfolge.
KI: `wander → notice (Brüllen) → combat → enrage (Rotglut 45 s) → flee (≤30 %, `world.nestPoint`) → sleep (1 %/s, ×2 Schaden, Aufwachen ab 60 % oder bei Treffer)`; Teilbruch → 2 s Taumeln, Betäubung (Schwelle 150, ×1,5) → 6 s; Zielwahl nach Bedrohung der letzten 10 s (15 % Zufall). Zustandsnamen sind ein Teil des Netzprotokolls (`monsterState`-Event).
Jaggo ist komplett (4 Angriffe, brechbarer Kamm, Schwächen). `jaggling.js` ist ein **Platzhalter** (ein Biss) – Monster-Agent baut ihn aus.

## Hunt-Kontext (`src/game/hunt.js`)
`new Hunt(app, {quest, weapon, seed, god, nofx, aggro, solo, coop, name})`. Das Hunt-Objekt ist selbst der `ctx` für Entities: `{ world, players, monsters, player (lokal), fx, bus, rng, input, cameraYaw, time, timeLeft, teamKo, playerHit(), respawn(), spawnMonster(defId, {x,z,yaw,state,id}), countMonsters(defId), debugShape(), onItem(), onContext(), contextLabel, itemLabel, hud, camera, rig, scene, mainMonster, result }`. Pro Hunt eigener Event-Bus (`hunt.bus`), alle Events werden zusätzlich auf `app.bus` gespiegelt.
Events (Payload): `hit {player, monster, part, dmg, crit, weak, …}`, `partBreak {monster, part}`, `monsterState {monster, state, prev}`, `monsterAttack {monsterId, …params}`, `monsterStun`, `monsterDead {monster}`, `rage {monster, on}`, `playerHit {player, dmg, key}`, `playerDown {player}`, `glitchCounter {player}`, `questComplete {quest, time, stats}`, `questFailed {quest, reason}`, `sfx {name, pos, …}`.
Ende: Brocken tot → 2,2 s später `questComplete` + Overlay „Auftrag erfüllt" (Overlay mit `opts.noOverlay` abschaltbar; Zerlegen/Belohnung ist Sache des Meta-Agents → `questComplete` abonnieren). 3× `playerDown` oder Zeit abgelaufen → `questFailed`. Solo-Menü-Taste pausiert (Overlay „Pause"); mit `opts.coop` nicht.

## Welt-Interface (`src/game/world/`)
```js
world = {
  id, name, bounds:{minX,maxX,minZ,maxZ},
  heightAt(x, z) → y,
  collide(pos, radius) → pos      // schiebt pos (Vector3/{x,z}) aus Hindernissen/Begrenzung, mutiert in place
  spawnPoints:[{x,z,yaw}],         // Spieler 1..4
  campPoint:{x,z},                 // Respawn nach Umgekippt
  nestPoint:{x,z},                 // Fluchtziel/Schlafplatz des Brockens (optional; Fallback = Startpunkt)
  monsterSpawns:{ jaggo:{x,z}, default:{x,z} },
  zones:[{id, name, x, z, r}],     // Minimap/Routen
  env:{ background:'#hex', fog:{color, near, far} },
  update(dt, hunt),                // Sammelpunkte, Lava-Schaden etc.
  mesh: THREE.Object3D }           // enthält auch die Lichter; statische Geometrie mergen (BufferGeometryUtils.mergeGeometries)
```
`testArena.js` ist die Referenz. Materialien immer mit `render/ps1.js → lambert()` (Vertex-Snapping) und `tex()`.

## Render/FX
`createRenderer(container)` rendert intern 480 px (`settings.res`, 360 = „Extra-scuffed") und skaliert per CSS pixelated. `createFx({scene, camera, nofx})`: `spark(pos, n, color, speed)`, `number(pos, text, kind: hit|weak|crit|hurt|heal|glitch)`, `shake(amount, dur)`, `flash(color, dur)`, `glitch(dur)` (RGB-Shift via SVG-Filter + stärkeres Vertex-Snapping), `marker(key, pos, radius, color, disc)`/`clearMarker(key)` (Boden-Telegraphs). `render/ps1.js`: `ps1(material)`, `lambert(opts)`, `basic(opts)`, `setSnapScale(k)`, `setGlobalJitter(v)`. HUD-Größen immer in `vmin`.

## Gear-Optik [G] (GDD 8.6)
- **Daten:** `data/gearlook.js` – `makeGear({weapon:{type,tier,branch}, armor:{head,body,legs}, color})`, Set-Stufen (`SET_TIER`), Netz-Code `encodeGear(gear, colorIdx)` → 7 Zeichen (`g3bdeb2` = Waffe/Stufe/Ast, Set je Slot a–f, Farbindex), `decodeGear(code)` → `null` wenn kaputt (Aufrufer fallen auf Alt-Felder zurück).
- **Rig:** `buildHunterRig({ merged:true, gear, weaponMesh })` = ein verschmolzenes Vertex-Farben-Mesh pro Gelenk (6 Draw Calls) + Schatten + Waffe (1–2) + 1 Partikel-Points → ≤ 10. `rig.setGear(gear)` / `setColor(hex)` bauen live um, `rig.tick(dt)` pulst Glühen + Partikel (Player macht das selbst). Rüstung: `game/gear/armor.js` (Builder je Set und Slot, fügen nur Boxen/Pyramiden in die Gelenk-`GearParts`); Waffen: `game/gear/weaponLook.js` (`buildGreatswordLook/buildDualBladeLook/buildBowLook(tier, branch)`), `def.buildMesh({tier, branch})`.
- **Wiederverwendbar (Katana):** `render/gearfx.js` – `GearParts` (Vertex-Farbe + `glow`-Attribut), `gearMaterial()` (Glühen ohne Extra-Draw-Call), `bar/spike/tri`, `GearEmitter` (gepoolte Partikel: `ember|fire|shock|poison|aura`). Waffen-Mesh-`userData`: `glow` (Material), `gearGlow`/`glowBase` (Puls), `fx:[{kind,rate,at}]`, `twoHand:{lo,hi}` (Rig führt die linke Hand an den Griff, Klingenrichtung bleibt wie animiert; Pose-Key `th` 0..1 blendet), `hand:'L'` + `def.hand='L'` (links gehalten, Posen werden per `anim.mirrorPose` gespiegelt).
- **Netz:** Stadt-Präsenz `tp` bekommt `g` (Gear-Code); Session-Profil/Roster/Hello/`start.players` haben `gear`. Alt-Clients ohne Code: Standard-Rüstung + `weapon`/`tier` wie bisher.
- **Debug:** `?scene=gearlab` + `__SH.app.scene.show([{gear, anim:['overhead',0.38], noWeapon, weaponOnly}], {cam, look, fov})`.

## Input
`input.b.<name>` = `{down, pressed, released, heldMs, lastHeldMs}` für `attack, special, roll, lock, context, item, itemNext, itemPrev, menu`; `input.move {x,y}`, `input.sprint`, `input.takeCamera()`, `input.takeSlot()`. Quellen schreiben mit `input.set(name, down, sourceId)` / `input.setStick(x, y, sourceId)`; Kanten (`pressed/released`) gelten genau einen Sim-Schritt (`input.poll(dt)` am Anfang jedes Schritts, macht `Hunt.update`). Touch-Layout/Größen: `ui/ui.css` (`.btn-a` usw.), Touch-UI erscheint automatisch auf Touch-Geräten (oder `?touch=1`).

## Debug-/Test-API (`window.__SH`, Lead nutzt das für e2e)
`scene` (Name), `hunt`, `player`, `monsters` (Getter), `timeScale(x)`, `god(bool)`, `press(action, ms)` (`'A'|'B'|'attack'|'special'|'roll'|'lock'|'lockNext'|'lockPrev'|'context'|'item'|'itemNext'|'itemPrev'|'menu'`, ms = **simulierte** Zeit), `stick(x, y)`, `camera(dx, dy)`, `save` (Platzhalter-Objekt, Meta-Agent hängt Save-API ein), `goto(scene, opts)`, `step(n)` (n Sim-Schritte + Render), `sim(n)` (n Sim-Schritte **ohne** Render, schnell), `pause(bool)` (stoppt/startet die rAF-Schleife → danach deterministisch mit `step`/`sim`), `debugHitboxes(bool)` (gelb = Spieler, rot = Brocken), `input`, `app`, `time`.
URL-Parameter: `?scene=hunt&quest=jaggo&weapon=gs&seed=1&god=1&nofx=1` plus `aggro=1` (Brocken startet sofort im Kampf), `res=360`, `touch=1`, `peerhost=&peerport=` (Netz-Agent). `nofx=1` schaltet Funken/Shake/Glitch/Scanlines ab (Schadenszahlen bleiben als DOM `.dmg`).

## Neues Hinzufügen – Kurzrezepte
- **Waffe:** `weapons/<id>.js` nach dem Muster `greatsword.js` (Moves, anims, `buildMesh`, `status`), Zeile in `weapons/index.js`, Werte in `data/weapons.js`, Tests nach `tests/unit/weapon.test.js` (Harness `setup()` dort kopieren).
- **Brocken:** `monsters/<id>.js` (Def wie `jaggo.js`; Modell via `raptor.js` oder eigener `build()`), Zeile in `monsters/index.js`, Auftrag in `data/quests.js`; Telegraph ≥ 0,5 s und Determinismus prüft `tests/unit/monsterAttack.test.js` automatisch, wenn die Angriffe dort aufgelistet werden.
- **Item:** Daten in `data/items.js`, Nutzung über `Hunt.onItem`; Heilung `healVitals`, Statusentfernung/Buffs als Felder am Player (`v.costMul`, `dmgMul`, `protect`).
- **Szene:** Datei in `src/scenes/`, Zeile in `scenes/index.js`, DOM in `app.ui`.
- **Sound:** `SOUNDS`-Eintrag + `bus.emit('sfx', {name})`.


## Touch-Regeln (src/input/touch.js, touchLayout.js, lock.js)
Angewandt nach Spieler-Feedback (Tasten schwer zu treffen, Text nicht zentriert, Kontext-Taste überlappte, Lock-Zyklus unklar):
1. **Optik < Trefferfläche.** Jede Taste = unsichtbarer Kreis `.tbtn` (Trefferfläche) mit sichtbarem `.tv` darin. Sichtbar >= 44 px (A 66, Rest 48, Kontext 62 bei Größe M; S/M/L skalieren), Trefferfläche = sichtbar + 12 px (A: +16), A >= 56 px.
2. **Abstand:** Trefferkreise zweier Tasten überlappen nie (>= 2 px), sichtbarer Abstand >= 8 px. Ein Tap neben eine Taste gehört höchstens einer Taste. Der Solver `solveLayout(w, h, {size, mirror, insets, mode})` ist rein (kein DOM), `checkLayout` prüft alle Regeln (Tests: `tests/unit/touchLayout.test.js`, 844x390, 932x430, 740x360, 1024x500, 1180x820, 667x375, 568x320, jeweils S/M/L, beide Händigkeiten, mit/ohne Notch-Insets).
3. **Daumenbogen:** um den Mittelpunkt von A bei 182 Grad Rolle, 132 Grad B, 82 Grad Lock; Item links von Rolle; Kontext-Taste hat einen **eigenen, immer reservierten** Platz über Item (links von B). Item-Leiste (4x2 Slots à 44 px) links von Item. Nichts liegt in der Stick-Zone (äußere 40 % der Breite, min. 30 %).
4. **Safe-Area:** Insets werden per CSS `env(safe-area-inset-*)` (Probe-Element) gelesen; Tasten bleiben innerhalb. `viewport-fit=cover` in index.html. Neu berechnet bei resize/orientationchange und wenn Größe/Händigkeit/Town-Modus wechselt.
5. **Pointer Events mit Capture:** Ein Finger gehört dem Steuerelement, auf dem er begann (`setPointerCapture`, Zuordnung per pointerId). Auf eine andere Taste rutschen löst diese nicht aus; Halten (A aufladen, B-Finisher) läuft weiter. Stick + Tasten gleichzeitig (Multi-Touch) getestet per CDP `Input.dispatchTouchEvent`.
6. **Sofortiges Feedback:** Klasse `.down` im pointerdown (kein :active/Hover, kein 300-ms-Delay: `touch-action: none` auf Spiel-UI, `manipulation` auf Buttons), optional `navigator.vibrate` (Einstellung „Vibration", iOS ignoriert es).
7. **iOS:** `user-select:none`, `-webkit-touch-callout:none`, `-webkit-tap-highlight-color: transparent`, gesture*/dblclick/touchmove preventDefault (main.js), keine Bild-Drags.
8. **Lock = Schalter:** Tippen an/aus (Taste feuert beim Loslassen, damit Wischen nicht auch toggelt); Wischen hoch/runter auf Lock = nächstes/voriges Teil (`lockNext`/`lockPrev`); Zustand sichtbar auf der Taste (`input.lockOn`). Logik als reine State-Machine `stepLock` (src/input/lock.js), vom Spieler jeden Sim-Schritt in jedem Zustand aufgerufen (kein verlorener Tap im Angriff/Hitstop). Tot/>70 m = Lock aus. Q / RB = Toggle, F,V / R3 = Teil.
9. **Text in Buttons:** alle Buttons `display:flex` + `align-items/justify-content:center`, `line-height:1.2`, `text-align:center`, `white-space:normal`, `overflow-wrap:anywhere`, `text-wrap:balance`; Kontext-/Item-Label schrumpfen per `fitText` bis sie in den Kreis passen. Mindesthöhe 44 px für alle UI-Buttons.
10. **Layout-Option:** `settings.btnSize` ('S'|'M'|'L'), `settings.leftHand`, `settings.haptics` (localStorage `scuffedhunter.settings.v1`), UI im Optionen-Panel; `app.touch.relayout()` wendet sie sofort an. CSS-Variablen `--strip-*`, `--emote-*`, `--wheel-*` koppeln Item-Leiste und Stadt-Emote-Button an den Solver.

---

# Phase 3 (Balancing & Bugfixes) – Änderungen an Verträgen

- **Schaden:** `resolvePlayerHit(...).dmg` ist der **Gesamtschaden inkl. Element**; `elemDmg` ist nur der Elementanteil (Anzeige/Statistik). `Monster.applyDamage` zieht genau `res.dmg` ab.
- **Brocken-Angriffsgewicht:** `AttackDef.weight` darf eine Funktion `(monster, dist) => Zahl` sein. Brathalos-Aufflug nutzt `monster.flyCd` (nur am Boden herunterzählend, 21–33 s nach jeder Landung).
- **Kleinmonster-Culling:** `minor`-Monster weiter als 65 m von jedem lokalen Pirscher werden weder gezeichnet noch gepost; `hurtParts()`/`lockPoints()` liefern dann `[]`. `hurtParts()`/`lockPoints()` sind gepoolt und pro Pose-Update gecacht – Einträge nicht über Sim-Schritte hinweg aufbewahren.
- **Ambient-Packs:** `Hunt` spawnt beim Start (nur Host/Solo, `?noambient=1` schaltet ab) je 2 Rudel Jagglinge in Zone 1 und 2 (`spawnPack(..., {ambient:true})`, zählt nicht gegen das Rudelruf-Limit von 3). Gäste bekommen sie über die Brocken-Snapshots.
- **Netz:** Gast-Pfeile werden per `fx {k:'arrow'}` gespiegelt (nur Optik, Schaden bleibt Gast-`hit`). Sammeln im Koop ist host-arbitriert: Gast sendet `gather {id, c:1}`, Host antwortet an den Absender mit `{id,u,it:[…]}` (oder `deny`) und meldet den neuen Stand an die übrigen. Gameplay-Item-Effekte (`flash/stink/trap/bomb`) wirken nur beim Host/Solo, Gäste spielen die Optik.
- **Kamera:** `createCameraRig(camera, getGroundY, collide)` – Kollision gegen Gelände/Wände; `update({lockSize})` skaliert Abstand/Neigung mit `monster.bodyRadius`.
- **Tools:** `tools/weapon-dps.mjs` (DPS-Sweep), `tools/net-e2e.mjs` (2-Peer-Test, braucht PeerJS-Server auf :9000), `tools/perf-probe.mjs` (renderer.info + Allokationen). `P3_FULL=1 npx vitest run tests/unit/p3fairness.test.js` = volles Fairness-Audit (~2 min).

# Neutrale Tiere [L]
- `monsters/mampfer.js` (Mampfer/-bulle/-kalb, Hoppler; `neutral`, `minor`, `carve`, `dropId`), `skinned.js` (1 SkinnedMesh pro Tier), `herd.js` (Herde: graze/migrate/flee, `def.ai`-Hook in `Monster._ai`), `predation.js` (Jaggo/Brathalos `predator`: jagen Mampfer, Zustand `fressen` = Ueberraschungstreffer x2), `game/fauna.js` (Spawn, `?nofauna=1`), `game/ambientFauna.js` (Voegel/Gluehkaefer/Schmetterlinge, 4 Draw Calls, lokal). Weide-Daten: `world.pastures` (`layout.buildPastures`).
- Netz: Neutrale gehen mit 5 Hz, nur <= 75 m um einen Pirscher, ohne Teile, Gast-Puffer 0,3 s. Bullenstoss laeuft als normales `atk`.
- Zerlegen: `huntmeta` `#addFaunaCorpse` (1 Zerlegen pro Leiche/Pirscher, `rollCarveAll`), zaehlt nicht fuer das End-Zerlegefenster.
- Tools: `tools/fauna-e2e.mjs` (2-Peer-Divergenz).

## Glitch-Kern: Hook-API (src/game/glitch.js, GDD 16.2)

- `player.glitch = { energy, active, t }` (0-100, Modus 8 s, `t` = Restzeit); Getter `p.glitching` (bool), `p.glitchDmgMul` (1 | 1,3, in `hunt.playerHit` in `dmgMul` eingerechnet).
- Energie: Glitch-Konter +35 (Bus `glitchCounter`), Katana-Konterhaltung +25 (Bus `counter`), Teilbruch durch eigenen Treffer +15 (`partBreak` + `hunt.glitchSys.hitting`/Treffer <= 1 s zuvor), eigener Treffer +1 (`hit`). Multiplikator `hunt.mods?.player?.glitchGainMul ?? 1`. Kein Abbau, im Modus kein Sammeln.
- Start per Button `glitch` (Taste G, Gamepad LT/D-Pad oben, Touch-Button nur bei 100 sichtbar). API: `addGlitchEnergy(p, n, src)`, `activateGlitch(p)`, `endGlitch(p)`, `tickGlitch(p, dt)`.
- **Waffen-Glitch** = optionales Feld `glitch` am Waffen-Def (`p.def.glitch`): `{ name, onStart(p), onEnd(p), tick(p, dt), onHit(p, res, monster) }`. `onHit` nur fuer eigene Treffer im Modus (`res` = `hit`-Event: dmg, crit, weak, partId, ...).
- Bus: `glitchStart` / `glitchEnd` / `glitchReady` mit `{ player }`. Stats: `hunt.stats.glitchDmg` (lokal) neben `hunt.stats.damage`.
- Optik: `fx.glitchMode(on)`, `fx.glitchTear()`, Zahlen-Kind `gbig`, `sfx.setCrush(on)` (Bitcrush auf SFX), `glitchVisual(p, t)` (Emissive-Flackern am Mesh, keine neuen Materialien). Netz: `MSG.EV {k:'glitch', on}` (`encodeGlitch/decodeGlitch`), setzt `peer.player.glitch.active`.

## Mutatoren (Phase 2)
`src/data/mutators.js`: Mutator = reine Daten `{ id, name, desc, reward, monster:{…}, player:{…}, hunt:{…} }`. `resolveMods(ids)` → `hunt.mods = { monster, player, hunt, reward, ids }` (Muls multiplizieren, regenPct addiert, Flags ODER). Monster liest `ctx.mods.monster` (nur Brocken, nicht Kleinvieh; Host-autoritativ), Spieler-Seite in `hunt.js` (dmgMul, staminaMul → `p.v.regenMul`), `items.js` (healItems), `glitch.js` (glitchGainMul). Auftrag trägt `mutators` (questboard post/snapshot/start). Neue Mutatoren = nur Eintrag in `MUTATORS`, kein Brocken-Code.
