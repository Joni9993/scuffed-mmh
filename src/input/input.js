/**
 * Abstract input layer. Touch, keyboard, gamepad and the debug API all drive this same structure.
 *
 *  input.move   {x, y}      y>0 = forward (screen up). Magnitude 0..1.
 *  input.sprint boolean     explicit sprint held (keyboard Shift). Touch/pad sprint by full push (>=0.4 s).
 *  input.b[name]            {down, pressed, released, heldMs}  for attack, special, roll, lock, context,
 *                           item, itemNext, itemPrev, menu, lockNext, lockPrev. pressed/released are edges for exactly one sim step.
 *                           lock is a TOGGLE (pressed edge); lockNext/lockPrev cycle the locked part.
 *  input.lockOn             boolean set by the game each frame (touch Lock button shows the state)
 *  input.takeCamera()       -> {dx, dy} accumulated look delta in CSS px since last call
 *  input.takeSlot()         -> 0..7 or -1 (keyboard 1-8 item select)
 *  input.contextLabel / input.itemLabel   strings set by the game for touch button labels
 */
export const BUTTONS = ['attack', 'special', 'roll', 'lock', 'lockNext', 'lockPrev', 'context', 'item', 'itemNext', 'itemPrev', 'menu'];

export function createInput() {
  const b = {};
  const srcs = {};
  for (const n of BUTTONS) {
    b[n] = { down: false, pressed: false, released: false, heldMs: 0, lastHeldMs: 0, _pq: false, _rq: false };
    srcs[n] = new Set();
  }
  const sticks = new Map();
  const timers = [];
  let camDx = 0, camDy = 0, slot = -1;

  const input = {
    b, move: { x: 0, y: 0 }, sprint: false, contextLabel: null, itemLabel: '', hasTouch: false, locked: false, lockOn: false,
    sprintSrc: new Set(),

    set(name, down, src = 'x') {
      const s = srcs[name];
      if (!s) return;
      const was = s.size > 0;
      if (down) s.add(src); else s.delete(src);
      const now = s.size > 0;
      if (!was && now) b[name]._pq = true;
      else if (was && !now) b[name]._rq = true;
    },
    setStick(x, y, src = 'x') {
      if (x === 0 && y === 0) sticks.delete(src); else sticks.set(src, { x, y });
    },
    setSprint(on, src = 'x') { if (on) this.sprintSrc.add(src); else this.sprintSrc.delete(src); },
    addCamera(dx, dy) { camDx += dx; camDy += dy; },
    takeCamera() { const r = { dx: camDx, dy: camDy }; camDx = camDy = 0; return r; },
    selectSlot(n) { slot = n; },
    takeSlot() { const s = slot; slot = -1; return s; },

    /** Debug/test: hold an action for `ms` simulated ms. */
    press(name, ms = 100) {
      this.set(name, true, 'dbg');
      timers.push({ name, left: Math.max(ms, 1) / 1000 });
    },
    /** Called once at the start of every sim step. */
    poll(dt) {
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i];
        t.left -= dt;
        if (t.left <= 0) { this.set(t.name, false, 'dbg'); timers.splice(i, 1); }
      }
      for (const n of BUTTONS) {
        const k = b[n];
        k.pressed = k._pq; k.released = k._rq;
        k._pq = k._rq = false;
        const down = srcs[n].size > 0;
        if (k.pressed) k.heldMs = 0;
        if (down) k.heldMs += dt * 1000;
        if (k.released) { k.lastHeldMs = k.heldMs; if (!down) k.heldMs = 0; }
        k.down = down;
      }
      let bx = 0, by = 0, bm = 0;
      for (const s of sticks.values()) {
        const m = Math.hypot(s.x, s.y);
        if (m > bm) { bm = m; bx = s.x; by = s.y; }
      }
      this.move.x = bx; this.move.y = by;
      this.sprint = this.sprintSrc.size > 0;
    },
    reset() {
      for (const n of BUTTONS) { srcs[n].clear(); Object.assign(b[n], { down: false, pressed: false, released: false, heldMs: 0, _pq: false, _rq: false }); }
      sticks.clear(); timers.length = 0; this.sprintSrc.clear(); camDx = camDy = 0;
    },
  };
  return input;
}
