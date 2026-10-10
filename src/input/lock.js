/**
 * Lock-on state machine (GDD 3.4). Pure: no DOM, no three.js.
 *
 *   lock  = null | { monster, idx }          idx = locked body part
 *   ev    = { toggle, next, prev, acquire(), valid(monster), parts(monster) }
 *
 * - toggle while off -> lock onto acquire() (best target), stays off if there is none
 * - toggle while on  -> off
 * - next / prev      -> cycle the locked part (only while on)
 * - an invalid target (dead / out of range) switches the lock off by itself
 */
export function stepLock(lock, ev) {
  if (lock && !ev.valid(lock.monster)) lock = null;
  if (ev.toggle) {
    if (lock) return null;
    const m = ev.acquire();
    return m ? { monster: m, idx: 0 } : null;
  }
  if (lock && (ev.next || ev.prev)) {
    const n = Math.max(1, ev.parts(lock.monster) | 0);
    const idx = (((lock.idx + (ev.next ? 1 : 0) - (ev.prev ? 1 : 0)) % n) + n) % n;
    return { monster: lock.monster, idx };
  }
  return lock;
}
