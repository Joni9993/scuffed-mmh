// Meta layer of a hunt: loadout, inventory, item use, gathering pickups, carving (Zerlegen), end flow -> results.
// Created by Hunt; Hunt forwards onItem/onContext/update/render/finish/dispose here.
import { HuntInventory } from './inventory.js';
import { ItemSystem } from './items.js';
import { applyLoadout } from './loadout.js';
import { createHuntHud } from '../ui/hubHuntHud.js';
import { defaultLoadout } from '../meta/loadout.js';
import { buildRewards } from '../meta/progression.js';
import { rollCarve, rollCarveAll, CARVES_PER_PLAYER, TAIL_CARVES } from '../data/drops.js';
import { createRng, hashSeed } from '../core/rng.js';
import { itemName } from '../data/items.js';
import { showOnboarding } from '../ui/onboarding.js';
import { HuntChest } from '../meta/huntChest.js';
import { saveStore, PLAYER_COLORS } from '../meta/save.js';
import { makeGear, encodeGear } from '../data/gearlook.js';

export const CARVE_HOLD = 0.8;
export const CARVE_WINDOW = 45;
export const FREE_SUPPLIES = { flickbrause: 2 };
export const CHEST_RADIUS = 3.2; // how close to the camp chest the 'Truhe' context shows up

export class HuntMeta {
  constructor(hunt, loadout) {
    this.hunt = hunt;
    this.loadout = loadout;
    const p = hunt.player;
    this.inv = hunt.inventory = new HuntInventory({ brought: loadout.items, free: FREE_SUPPLIES });
    this.applied = applyLoadout(p, loadout);
    this.items = new ItemSystem(hunt, p, this.inv);
    this.items.speedBonus = this.applied.food.itemSpeed;
    this.hud = createHuntHud(hunt.app.ui);
    this.chest = new HuntChest(saveStore.get(), this.inv, loadout, { inCombat: () => this.inCombat(), apply: (lo) => this.applyGear(lo) });
    this.hud.onSlot((i) => this.inv.select(i));
    this.hud.onDone(() => this.proceed());
    hunt.toast = (t, id) => this.hud.toast(t, id);
    if (typeof document !== 'undefined' && hunt.app?.ui) this.onboarding = showOnboarding(hunt.app.ui, p.weaponId);

    this.rng = createRng(hunt.opts.lootSeed ?? hashSeed(`${hunt.seed}:${Date.now()}`));
    this.corpses = [];
    this.breaks = [];
    this.holding = false;
    this.holdT = 0;
    this.carveCount = 0;
    this.phase = 'fight'; // fight | carve | leaving
    this.carveT = 0;
    this.endT = 0;
    this.finalResult = null;

    const on = (type, fn) => hunt.bus.on(type, fn);
    on('gathered', (e) => this.#onGathered(e));
    on('monsterDead', ({ monster }) => { if (hunt.bosses?.includes(monster) || monster === hunt.mainMonster) this.#addCorpse(monster, false); else if (monster.def.carve) this.#addFaunaCorpse(monster); });
    on('tailSevered', (e) => this.#addCorpse(e.monster, true, e.pos));
    on('partBreak', ({ part }) => { this.breaks.push(part); });
  }

  // ---- hooks from Hunt
  onItem(player, action, slot) { if (player === this.hunt.player) this.items.onItem(action, slot); }
  onContext(player, kind) {
    if (player !== this.hunt.player) return;
    if (kind === 'hold') this.holding = true;
    else if (kind === 'press' && this.hunt.contextLabel === 'Truhe') this.openChest();
  }

  // ---- camp chest (Lager-Truhe)
  chestPos() { return this.hunt.world?.layout?.campProps?.chest ?? null; }
  nearChest() {
    const c = this.chestPos(), p = this.hunt.player;
    return !!c && p.state === 'free' && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) <= CHEST_RADIUS;
  }
  openChest() {
    const h = this.hunt;
    if (h.result || this.phase === 'leaving' || h.panelOpen) return;
    h.openPanel('hunttruhe', this.chest);
  }
  /** a Brocken (or pack) is actively fighting: no weapon swaps */
  inCombat() {
    const h = this.hunt;
    return h.player.state !== 'free' || !!h.player.weapon?.move || h.monsters.some((m) => m.alive && !m.def.neutral && (m.state === 'combat' || m.state === 'enrage'));
  }
  /** chest changed weapon/armor: rebuild stats, rig and (co-op) tell the others */
  applyGear(lo) {
    const h = this.hunt, p = h.player, w = lo.weapon;
    if (p.weaponId !== w.type || p.weaponTier !== w.tier || p.weaponBranch !== w.branch) p.setWeapon(w.type, w.tier, w.branch);
    this.loadout = h.loadout = lo;
    this.applied = applyLoadout(p, lo, { reapply: true });
    this.items.speedBonus = this.applied.food.itemSpeed;
    const gear = makeGear(lo);
    p.setGear(gear);
    const col = Math.max(0, PLAYER_COLORS.indexOf(lo.color));
    h.net?.sendGear?.(encodeGear(gear, col));
  }

  #onGathered({ items = [] }) {
    for (const it of items) {
      const n = this.inv.add(it.id, it.n);
      if (n > 0) this.hud.toast(`+${n} ${itemName(it.id)}`, it.id);
      else this.hud.toast(`${itemName(it.id)}: Beutel voll`, it.id);
    }
    this.#checkGatherQuest();
  }

  #checkGatherQuest() {
    const q = this.hunt.quest;
    if (q.type !== 'gather' || this.phase !== 'fight' || this.hunt.result || this.hunt.winTimer > 0) return;
    if (this.inv.count(q.gather.id) >= q.gather.n) this.hunt.winTimer = 1.2;
  }

  #addCorpse(monster, tail, pos) {
    if (!monster || monster.minor) return;
    this.corpses.push({ monster, tail, pos: pos ?? monster.pos, left: tail ? TAIL_CARVES : CARVES_PER_PLAYER });
  }

  /** [L] neutral animals (Mampfer, Hoppler): one carve per corpse and player, whole drop list at once; not part of the end-of-hunt carve window */
  #addFaunaCorpse(monster) {
    if (this.corpses.some((c) => c.monster === monster)) return;
    this.corpses.push({ monster, tail: false, fauna: true, dropId: monster.def.dropId ?? monster.def.id, pos: monster.pos, left: 1 });
  }

  nearCorpse() {
    const p = this.hunt.player;
    for (const c of this.corpses) {
      if (c.left <= 0) continue;
      const r = c.tail ? 3 : (c.monster.bodyRadius ?? 2) + 2.4;
      if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) <= r) return c;
    }
    return null;
  }

  // ---- per step (before players update): item system
  update(dt) {
    if (this.phase === 'leaving') return;
    const h = this.hunt;
    if (h.player.state === 'ko') this.holdT = 0;
    this.items.update(dt);
    if (this.phase === 'carve') {
      this.carveT -= dt;
      const left = this.corpses.reduce((s, c) => s + (c.fauna ? 0 : c.left), 0);
      if (this.carveT <= 0 || (left === 0 && this.carveT < CARVE_WINDOW - 1)) { this.#leaveSoon(left === 0 ? 1.0 : 0); }
    }
    if (this.endT > 0) { this.endT -= dt; if (this.endT <= 0) this.proceed(); }
  }

  #leaveSoon(t) { if (t <= 0) this.proceed(); else if (!(this.endT > 0)) this.endT = t; }

  // ---- after world.update: carving + context label
  late(dt) {
    const h = this.hunt, p = h.player;
    const c = this.nearCorpse();
    if (!c && this.phase !== 'leaving' && !h.result && this.nearChest()) h.contextLabel = 'Truhe';
    else if (h.contextLabel === 'Truhe') h.contextLabel = null;
    if (c && this.phase !== 'leaving') {
      h.contextLabel = 'Zerlegen';
      if (this.holding && p.state === 'free' && p.speed < 1.5) {
        this.holdT += dt;
        if (this.holdT >= CARVE_HOLD) { this.holdT = 0; this.#carve(c); }
      } else this.holdT = 0;
    } else {
      this.holdT = 0;
      if (h.contextLabel === 'Zerlegen') h.contextLabel = null;
    }
    this.holding = false;
    const cnt = this.inv.selectedCount;
    h.itemLabel = this.inv.selectedId ? `x${cnt}` : '';
  }

  #carve(c) {
    c.left--;
    if (c.fauna) { this.#carveFauna(c); return; }
    this.carveCount++;
    const q = this.hunt.quest;
    const r = rollCarve(c.monster?.def?.id ?? q.monster, this.rng, { tail: c.tail, matMul: this.matMul() });
    if (!r) return;
    const n = this.inv.add(r.id, r.n, { carve: true });
    this.hud.toast(`Zerlegt: ${n || r.n}x ${itemName(r.id)}`, r.id);
    const hp = this.hunt;
    hp.fx.spark({ x: c.pos.x + (Math.random() - 0.5), y: c.pos.y + 1, z: c.pos.z + (Math.random() - 0.5) }, 10, '#ffe0a0', 4);
    hp.bus.emit('sfx', { name: 'hit', pos: c.pos });
    hp.bus.emit('carved', { player: hp.player, item: r.id, n });
  }

  #carveFauna(c) {
    const hp = this.hunt;
    const list = rollCarveAll(c.dropId, this.rng) ?? [];
    for (const r of list) {
      const n = this.inv.add(r.id, r.n, { carve: true });
      this.hud.toast(n > 0 ? `Zerlegt: ${n}x ${itemName(r.id)}` : `${itemName(r.id)}: Beutel voll`, r.id);
      hp.bus.emit('carved', { player: hp.player, item: r.id, n });
    }
    hp.fx.spark({ x: c.pos.x + (Math.random() - 0.5), y: c.pos.y + 0.6, z: c.pos.z + (Math.random() - 0.5) }, 8, '#ffb0a0', 3);
    hp.bus.emit('sfx', { name: 'hit', pos: c.pos });
    c.monster.carved = true;
  }

  render() {
    this.hud.update(this.inv, this.items);
    this.hud.carveProgress(this.holdT > 0 ? this.holdT / CARVE_HOLD : null);
    this.hud.carveWindow(this.phase === 'carve' ? Math.max(0, this.carveT) : null);
  }

  // ---- end of hunt
  onFinish(result, reason) {
    this.finalResult = { result, reason };
    const h = this.hunt;
    if (h.opts.noOverlay) return false;
    if (result === 'win' && this.corpses.some((c) => !c.tail && !c.fauna) && h.quest.type !== 'gather') {
      this.phase = 'carve';
      this.carveT = CARVE_WINDOW;
      h.hud.center('Auftrag erfüllt! Zerlegen!', 3);
    } else {
      this.phase = 'fight';
      h.hud.center(result === 'win' ? 'Auftrag erfüllt!' : 'Auftrag gescheitert', 2.4);
      this.endT = 2.6;
    }
    return true;
  }

  /** Pause menu "Aufgeben" */
  abandon() { this.hunt.forceFinish?.('fail', 'Aufgegeben'); this.proceed(); }

  /** Beute-Multiplikator: Auftrag (inkl. fester Mutatoren) x Brett-Mutatoren x hunt.matMul (GDD 16.5). */
  matMul() { const h = this.hunt, m = h.mods; return (h.quest.matMul ?? 1) * (h.boardMods?.reward ?? 1) * (m?.hunt?.matMul ?? 1); }

  rewards(result) {
    const h = this.hunt;
    return buildRewards({
      quest: { ...h.quest, matMul: this.matMul() }, result, gathered: this.inv.gathered(), carved: this.inv.carved, breaks: this.breaks,
      used: h.opts.loadout?.debug ? {} : this.inv.used(), chest: this.chest.result(), rng: this.rng, rpMul: h.boardMods?.reward ?? 1,
    });
  }

  proceed() {
    if (this.phase === 'leaving') return;
    const h = this.hunt;
    if (h.training) { // Übungsplatz: keine Belohnung, keine Statistik, kein Ergebnis-Bildschirm -> direkt zurück an die Puppe
      this.phase = 'leaving';
      queueMicrotask(() => h.app.goto('hub', { fromTraining: true }));
      return;
    }
    const result = h.result ?? 'fail';
    this.phase = 'leaving';
    const payload = { result, reason: h.reason ?? this.finalResult?.reason ?? '', quest: h.quest, rewards: this.rewards(result), time: (h.timeLimit ?? h.quest.timeLimit) - h.timeLeft, stats: h.stats, carves: this.carveCount, debug: !!this.loadout.debug };
    queueMicrotask(() => h.app.goto('results', payload));
  }

  dispose() { this.onboarding?.close(); this.hud.dispose(); }
}

export function resolveLoadout(opts) {
  return opts.loadout ?? defaultLoadout({ weapon: opts.weapon ?? 'gs', tier: opts.tier ?? 1, name: opts.name ?? 'Pirscher' });
}
