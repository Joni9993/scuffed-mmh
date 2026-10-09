// In-hunt item use (GDD 7). Using an item commits the hunter: rooted for the use time, no attacking,
// roll-cancel only once the effect has landed (`applyAt`). Taking a hit cancels the use before it lands.
import { ITEMS } from '../data/items.js';
import { healVitals } from './vitals.js';

const BUFFER = 0.25; // an item press during an attack is remembered this long

/** Timing of one use. speedBonus (Pilzpfanne 0.2) shortens it. cancelAt = first moment a roll may cancel. */
export function itemTiming(def, speedBonus = 0) {
  const dur = def.time * (1 - speedBonus);
  const applyAt = dur * (def.applyAt ?? 0.5);
  return { dur, applyAt, cancelAt: applyAt };
}
export const canRollCancel = (use) => !!use && use.t >= use.cancelAt;

export class ItemSystem {
  /** hunt: ctx ({fx, bus, spawnEffect, monsters, toast?}); player: local Player; inv: HuntInventory */
  constructor(hunt, player, inv) {
    this.hunt = hunt; this.player = player; this.inv = inv;
    this.using = null;
    this.buffer = 0;
    this.heals = [];
    this.buffs = []; // {kind:'stamina', t}
    this.speedBonus = 0; // Pilzpfanne
    this.baseCostMul = player.v.costMul ?? 1;
  }

  /** Hunt.onItem(player, action, slot) */
  onItem(action, slot) {
    if (action === 'use') this.request();
    else if (action === 'next') this.inv.cycle(1);
    else if (action === 'prev') this.inv.cycle(-1);
    else if (action === 'slot') this.inv.select(slot);
  }

  canStart() {
    const p = this.player;
    return !this.using && p.alive && p.state === 'free' && !p.weapon.busy;
  }

  request() {
    if (this.using) return false;
    if (!this.canStart()) { this.buffer = BUFFER; return false; }
    return this.start();
  }

  start() {
    const id = this.inv.selectedId;
    const def = ITEMS[id];
    if (!def) return false;
    if (this.inv.count(id) <= 0) { this.hunt.toast?.(`${def.name}: leer`); return false; }
    const t = itemTiming(def, this.speedBonus);
    // bow tips: nothing happens unless a bow is in hand
    if (def.effect?.type === 'tip' && this.player.weaponId !== 'bow') { this.hunt.toast?.('Spitzen gehen nur mit dem Bogen'); return false; }
    this.using = { id, def, t: 0, applied: false, ...t };
    this.player.itemUse = this.using; // read by Player (rooted)
    this.buffer = 0;
    this.hunt.bus.emit('sfx', { name: 'ui', pos: this.player.pos });
    return true;
  }

  #end() { this.using = null; this.player.itemUse = null; }

  update(dt) {
    const p = this.player;
    this.#tickBuffs(dt);
    this.buffer = Math.max(0, this.buffer - dt);
    if (this.using) {
      const u = this.using;
      if (p.itemUse !== u) { this.using = null; return; } // rolled out (Player cleared it)
      if (p.state !== 'free') { this.#end(); return; } // hit / KO before finishing
      u.t += dt;
      if (!u.applied && u.t >= u.applyAt) { u.applied = true; this.#apply(u); }
      if (u.t >= u.dur) this.#end();
    } else if (this.buffer > 0 && this.canStart()) this.start();
  }

  #tickBuffs(dt) {
    const v = this.player.v;
    for (let i = this.heals.length - 1; i >= 0; i--) {
      const h = this.heals[i];
      const amt = Math.min(h.left, h.rate * dt);
      healVitals(v, amt, false);
      h.left -= amt;
      if (h.left <= 0.001) this.heals.splice(i, 1);
    }
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.t -= dt;
      if (b.t <= 0) { this.buffs.splice(i, 1); if (!this.buffs.some((x) => x.kind === 'stamina')) v.costMul = this.baseCostMul; }
    }
  }

  #top() { const p = this.player.pos; return { x: p.x, y: p.y + 2.1, z: p.z }; }

  #apply(u) {
    const { id, def } = u;
    const e = def.effect, p = this.player, hunt = this.hunt;
    if (e.type === 'tip') {
      p.ammoTip = p.ammoTip === id ? null : id;
      hunt.fx.number(this.#top(), p.ammoTip ? def.name : 'Normale Pfeile', 'heal');
      hunt.bus.emit('itemUsed', { player: p, id, tip: p.ammoTip });
      return;
    }
    if (!this.inv.consume(id, 1)) return;
    switch (e.type) {
      case 'heal':
        this.heals.push({ left: e.hp, rate: e.hp / e.over });
        if (e.bruise) p.v.bruise = 0;
        hunt.fx.number(this.#top(), `+${e.hp}`, 'heal');
        break;
      case 'stamina':
        p.v.costMul = this.baseCostMul * e.mul;
        this.buffs = this.buffs.filter((b) => b.kind !== 'stamina');
        this.buffs.push({ kind: 'stamina', t: e.secs });
        hunt.fx.number(this.#top(), 'Puste x0.5', 'heal');
        break;
      case 'cleanse':
        if (p.clearStatus) p.clearStatus(); else if (p.status) for (const k of Object.keys(p.status)) delete p.status[k];
        hunt.fx.number(this.#top(), 'Sauber', 'heal');
        break;
      case 'throw': {
        const to = this.throwTarget(e.range);
        hunt.spawnEffect?.(e.fx, { from: { x: p.pos.x, y: p.pos.y + 1.4, z: p.pos.z }, to, owner: p.id });
        break;
      }
      case 'place': {
        const x = p.pos.x + Math.sin(p.rot) * 1.5, z = p.pos.z + Math.cos(p.rot) * 1.5;
        hunt.spawnEffect?.(e.fx, { pos: { x, y: hunt.world.heightAt(x, z), z }, owner: p.id, item: id });
        break;
      }
      default: break;
    }
    hunt.bus.emit('itemUsed', { player: p, id });
  }

  /** Landing point of a throw: at the lock target if within range, else straight ahead. */
  throwTarget(range = 6) {
    const p = this.player;
    const lp = p.lockPoint?.();
    let dx = Math.sin(p.rot), dz = Math.cos(p.rot), d = range;
    if (lp) {
      const ax = lp.x - p.pos.x, az = lp.z - p.pos.z, ad = Math.hypot(ax, az) || 1;
      dx = ax / ad; dz = az / ad; d = Math.min(range, ad);
    }
    return { x: p.pos.x + dx * d, z: p.pos.z + dz * d };
  }
}
