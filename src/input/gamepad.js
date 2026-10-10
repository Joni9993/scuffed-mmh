const DEAD = 0.15;
const prev = { lbDir: 0 };

/** Poll connected gamepad once per frame. Standard mapping (GDD 9). */
export function pollGamepad(input) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((p) => p && p.connected);
  if (!gp) { input.setStick(0, 0, 'pad'); return; }
  const ax = (i) => (Math.abs(gp.axes[i] || 0) < DEAD ? 0 : gp.axes[i]);
  const bt = (i) => !!gp.buttons[i]?.pressed;
  const lb = bt(4);
  if (lb) {
    // LB + stick left/right cycles items; movement suppressed
    const dir = ax(0) > 0.6 ? 1 : ax(0) < -0.6 ? -1 : 0;
    if (dir !== prev.lbDir && dir !== 0) input.press(dir > 0 ? 'itemNext' : 'itemPrev', 30);
    prev.lbDir = dir;
    input.setStick(0, 0, 'pad');
  } else {
    prev.lbDir = 0;
    input.setStick(ax(0), -ax(1), 'pad');
  }
  input.addCamera(ax(2) * 14, ax(3) * 10);
  input.set('roll', bt(0), 'pad');
  input.set('context', bt(1), 'pad');
  input.set('attack', bt(2), 'pad');
  input.set('special', bt(3), 'pad');
  input.set('lock', bt(5), 'pad');
  input.set('lockNext', bt(11), 'pad'); // right stick click: next lock part
  input.set('item', bt(7), 'pad');
  input.set('menu', bt(9), 'pad');
}
