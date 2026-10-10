const KEYS = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
};
const ACT = { Space: 'roll', KeyQ: 'lock', KeyF: 'lockNext', KeyV: 'lockPrev', KeyE: 'context', KeyR: 'item', Escape: 'menu', KeyP: 'menu' };

export function attachKeyboard(input, canvas) {
  const held = new Set();
  const refresh = () => {
    const x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    const y = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    const m = Math.hypot(x, y) || 1;
    // 0.8 = run; sprint is Shift (explicit), so WASD never auto-sprints
    input.setStick((x / m) * 0.8, (y / m) * 0.8, 'kbd');
  };
  const onKey = (down) => (e) => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (KEYS[e.code]) { down ? held.add(KEYS[e.code]) : held.delete(KEYS[e.code]); refresh(); e.preventDefault(); return; }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { input.setSprint(down, 'kbd'); return; }
    if (ACT[e.code]) { if (!e.repeat) input.set(ACT[e.code], down, 'kbd'); e.preventDefault(); return; }
    if (down && /^Digit[1-8]$/.test(e.code)) input.selectSlot(Number(e.code.slice(5)) - 1);
  };
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));
  window.addEventListener('blur', () => { held.clear(); refresh(); input.setSprint(false, 'kbd'); });

  const fine = matchMedia('(pointer: fine)').matches;
  if (!fine) return;
  canvas.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) input.set('attack', true, 'mouse');
    if (e.button === 2) input.set('special', true, 'mouse');
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.set('attack', false, 'mouse');
    if (e.button === 2) input.set('special', false, 'mouse');
  });
  window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) input.addCamera(e.movementX, e.movementY);
  });
  window.addEventListener('wheel', (e) => {
    if (e.deltaY > 0) { input.press('itemNext', 30); } else if (e.deltaY < 0) { input.press('itemPrev', 30); }
  }, { passive: true });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
}
