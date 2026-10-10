// In-hunt inventory (hunt.inventory). Contract: count(id), add(id, n), consume(id, n) -> bool, items (the item bar).
// Three pools: `free` (chest supplies, vanish after the hunt), `loot` (gathered/carved, goes to the box), `brought`
// (taken from the box; leftovers simply stay there, spent ones are deducted afterwards).
// Consume order: free -> loot -> brought.
import { ITEMS, BOX_MAX } from '../data/items.js';

export const BAR_MAX = 8;
const carryable = (id) => ITEMS[id]?.kind === 'consumable' || ITEMS[id]?.kind === 'ammo';

export class HuntInventory {
  constructor({ brought = [], free = {} } = {}) {
    this.free = {}; this.loot = {}; this.brought = {}; this.brought0 = {};
    this.bar = []; this.sel = 0;
    this.carved = {}; // carve log (subset of loot)
    for (const e of brought) {
      if (!ITEMS[e.id] || e.n <= 0) continue;
      this.brought[e.id] = this.brought0[e.id] = Math.min(e.n, ITEMS[e.id].max);
      this.#toBar(e.id);
    }
    // free supplies go to the front so Flickbrause is always the first thing selected
    for (const [id, n] of Object.entries(free)) { this.free[id] = n; this.#toBar(id, true); }
  }

  #toBar(id, front = false) {
    if (!carryable(id) || this.bar.includes(id)) return;
    if (front) this.bar.unshift(id); else this.bar.push(id);
    if (this.bar.length > BAR_MAX) this.bar.length = BAR_MAX;
  }

  count(id) { return (this.free[id] ?? 0) + (this.loot[id] ?? 0) + (this.brought[id] ?? 0); }

  /** Add to the loot pool. Returns how many fit (consumables respect the carry limit). */
  add(id, n = 1, { carve = false } = {}) {
    const def = ITEMS[id];
    if (!def || n <= 0) return 0;
    const cap = carryable(id) ? def.max : BOX_MAX;
    const added = Math.max(0, Math.min(n, cap - this.count(id)));
    if (added > 0) {
      this.loot[id] = (this.loot[id] ?? 0) + added;
      if (carve) this.carved[id] = (this.carved[id] ?? 0) + added;
      this.#toBar(id);
    }
    return added;
  }

  consume(id, n = 1) {
    if (n < 0 || this.count(id) < n) return false;
    let left = n;
    for (const pool of [this.free, this.loot, this.brought]) {
      const k = Math.min(left, pool[id] ?? 0);
      if (k > 0) { pool[id] -= k; left -= k; if (!pool[id]) delete pool[id]; }
    }
    return true;
  }

  /** The item bar as [{id, n}] with live counts. */
  get items() { return this.bar.map((id) => ({ id, n: this.count(id) })); }
  get selectedId() { return this.bar[this.sel] ?? null; }
  get selectedCount() { return this.selectedId ? this.count(this.selectedId) : 0; }

  select(i) { if (i >= 0 && i < this.bar.length) this.sel = i; return this.selectedId; }
  /** Cycle to the next/previous slot that still has items (stays put if all are empty). */
  cycle(dir = 1) {
    const n = this.bar.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.sel + dir * k + n * k) % n;
      if (this.count(this.bar[i]) > 0) { this.sel = i; break; }
    }
    return this.selectedId;
  }

  /** Camp chest: take consumables/ammo from the box into the brought pool (caller checked the box stock). -> how many fit */
  bring(id, n = 1) {
    if (!carryable(id) || n <= 0) return 0;
    if (!this.bar.includes(id) && this.bar.length >= BAR_MAX) return 0; // would vanish from the bar
    const k = Math.max(0, Math.min(n, ITEMS[id].max - this.count(id)));
    if (k > 0) { this.brought[id] = (this.brought[id] ?? 0) + k; this.brought0[id] = (this.brought0[id] ?? 0) + k; this.#toBar(id); }
    return k;
  }
  /** Camp chest: give brought items back (only the brought pool; free/loot stay). Spent count (brought0 - brought) is unchanged. */
  unbring(id, n = 1) {
    const k = Math.min(Math.max(0, n), this.brought[id] ?? 0);
    if (k > 0) {
      this.brought[id] -= k; this.brought0[id] -= k;
      if (!this.brought[id]) delete this.brought[id];
      if (!this.brought0[id]) delete this.brought0[id];
    }
    return k;
  }

  /** Spent from the box stock -> { id: n } (for Hub accounting). */
  used() {
    const out = {};
    for (const [id, n0] of Object.entries(this.brought0)) { const d = n0 - (this.brought[id] ?? 0); if (d > 0) out[id] = d; }
    return out;
  }
  /** Gathered (not carved) materials still held -> { id: n } */
  gathered() {
    const out = {};
    for (const [id, n] of Object.entries(this.loot)) { const g = n - (this.carved[id] ?? 0); if (g > 0) out[id] = g; }
    return out;
  }
}
