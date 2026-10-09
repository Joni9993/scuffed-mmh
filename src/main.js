import './ui/ui.css';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachTouch } from './input/touch.js';
import { pollGamepad } from './input/gamepad.js';
import { createLoop, DT } from './core/loop.js';
import { time } from './core/time.js';
import { appBus } from './core/events.js';
import { settings } from './core/settings.js';
import { scenes } from './scenes/index.js';
import { sfx } from './audio/sfx.js';
import { saveStore } from './meta/save.js'; // [P]

const params = new URLSearchParams(location.search);
const flag = (k) => params.get(k) === '1' || params.get(k) === 'true';

// session-only overrides (not persisted)
if (flag('nofx')) { settings.scanlines = false; settings.nofx = true; }
if (params.get('res')) settings.res = Number(params.get('res')) === 360 ? 360 : 480;

const stage = document.getElementById('stage');
const ui = document.getElementById('ui');
const renderer = createRenderer(stage);
const input = createInput();
attachKeyboard(input, renderer.canvas);
const touch = attachTouch(input, ui);
touch.setVisible(false);

// no scroll / zoom / callouts
for (const ev of ['gesturestart', 'gesturechange', 'contextmenu', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (!e.target.closest?.('.allow-scroll')) e.preventDefault(); }, { passive: false });

const app = {
  renderer, input, touch, ui, bus: appBus, settings, sfx,
  sceneName: null, scene: null,
  goto(name, opts = {}) {
    const next = scenes[name];
    if (!next) throw new Error(`unknown scene "${name}"`);
    if (app.scene) app.scene.exit?.();
    ui.querySelectorAll('.screen').forEach((n) => n.remove());
    app.scene = next;
    app.sceneName = name;
    return next.enter(app, opts);
  },
};

const loop = createLoop({
  update: (dt) => { pollGamepad(input); app.scene?.update(dt); },
  render: (alpha) => app.scene?.render(alpha),
});

// Debug / test API (docs/ARCHITECTURE.md "Debug")
const ACTIONS = { A: 'attack', B: 'special', attack: 'attack', special: 'special', roll: 'roll', lock: 'lock', context: 'context', item: 'item', itemNext: 'itemNext', itemPrev: 'itemPrev', menu: 'menu' };
window.__SH = {
  get scene() { return app.sceneName; },
  get hunt() { return app.scene?.hunt ?? null; },
  get player() { return app.scene?.hunt?.player ?? null; },
  get monsters() { return app.scene?.hunt?.monsters ?? []; },
  timeScale(x) { time.manual = x; },
  god(b = true) { const p = this.player; if (p) p.god = !!b; },
  press(action, ms = 100) { const a = ACTIONS[action]; if (!a) throw new Error(`unknown action ${action}`); input.press(a, ms); },
  stick(x = 0, y = 0) { input.setStick(x, y, 'dbg'); },
  camera(dx, dy) { input.addCamera(dx, dy); },
  save: saveStore, // [P] get() set(obj) reset() give(id, n) flush() exportCode() importCode(code) update(fn)
  goto: (name, opts) => app.goto(name, opts),
  step: (n = 1) => loop.step(n),
  /** n sim steps WITHOUT rendering (fast, deterministic) */
  sim(n = 1) { for (let i = 0; i < n; i++) { time.tick(DT); app.scene?.update(DT * time.scale); } },
  pause: (b = true) => (b ? loop.stop() : loop.start()),
  debugHitboxes(b = true) { const h = this.hunt; if (h) h.viz.enabled = !!b; },
  input, app, time,
};

const sceneName = params.get('scene') || 'title';
const startOpts = {
  quest: params.get('quest') || 'jaggo',
  weapon: params.get('weapon') || 'gs',
  seed: Number(params.get('seed') || 1),
  god: flag('god'),
  nofx: flag('nofx'),
  aggro: flag('aggro'),
};
app.goto(sceneName, startOpts);
loop.start();
