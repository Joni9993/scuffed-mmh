import './ui/ui.css';
import { createRenderer } from './render/renderer.js';
import { createInput } from './input/input.js';
import { attachKeyboard } from './input/keyboard.js';
import { attachTouch } from './input/touch.js';
import { pollGamepad } from './input/gamepad.js';
import { createLoop, DT } from './core/loop.js';
import { time } from './core/time.js';
import { appBus } from './core/events.js';
import { settings, RES_STEPS, lowerRes } from './core/settings.js';
import { initInstall } from './ui/install.js';
import { scenes } from './scenes/index.js';
import { sfx } from './audio/sfx.js';
import { AutoQuality } from './core/autoquality.js';
import { saveStore } from './meta/save.js'; // [P]

const params = new URLSearchParams(location.search);
const flag = (k) => params.get(k) === '1' || params.get(k) === 'true';

// session-only overrides (not persisted)
if (flag('nofx')) { settings.scanlines = false; settings.nofx = true; }
if (params.get('res')) settings.res = RES_STEPS.includes(Number(params.get('res'))) ? Number(params.get('res')) : 640;
initInstall();

// first tap: Fullscreen API + landscape lock (Android; iOS has neither, ignore errors)
function goFullscreen() {
  try {
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen && !window.matchMedia?.('(display-mode: fullscreen)').matches) {
      Promise.resolve(d.requestFullscreen({ navigationUI: 'hide' })).then(() => screen.orientation?.lock?.('landscape')?.catch(() => {})).catch(() => {});
    } else screen.orientation?.lock?.('landscape')?.catch?.(() => {});
  } catch { /* unsupported */ }
}
if (navigator.maxTouchPoints > 0 && !params.get('nofs')) document.addEventListener('pointerup', goFullscreen, { once: true });

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

const aq = new AutoQuality();
let lastRender = 0, aqScene = null;
const loop = createLoop({
  update: (dt) => { pollGamepad(input); app.scene?.update(dt); },
  render: (alpha) => {
    app.scene?.render(alpha);
    const t = performance.now(), dt = (t - lastRender) / 1000;
    lastRender = t;
    if (app.sceneName !== aqScene) { aqScene = app.sceneName; aq.t = 0; aq.n = 0; }
    if (app.sceneName === 'hunt' && settings.autoRes && settings.res > 360 && !document.hidden && aq.sample(dt)) {
      renderer.setResolution(lowerRes(settings.res)); aq.reset(); // session only (not saved); may step down again
      app.scene?.hunt?.toast?.('Grafik reduziert');
    }
  },
});

// Debug / test API (docs/ARCHITECTURE.md "Debug")
const ACTIONS = { A: 'attack', B: 'special', attack: 'attack', special: 'special', roll: 'roll', lock: 'lock', lockNext: 'lockNext', lockPrev: 'lockPrev', context: 'context', item: 'item', itemNext: 'itemNext', itemPrev: 'itemPrev', menu: 'menu' };
window.__SH = {
  get scene() { return app.sceneName; },
  get hunt() { return app.scene?.hunt ?? null; },
  get player() { return app.scene?.hunt?.player ?? null; },
  get town() { return app.scene?.api ?? null; }, // [T] town debug API: teleport, toStation, open, stations, remotes, lastCalls
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
  noAmbient: flag('noambient'), // [B] ?noambient=1 disables the ambient Jagglinge packs
  noFauna: flag('nofauna'), // [L] ?nofauna=1 disables Mampfer/Hoppler + ambient decoration
  mode: params.get('mode') || undefined, // [N] lobby: host | join
  code: params.get('code') || undefined,
  name: params.get('name') || undefined,
  world: params.get('world') || undefined, // [K] ?world=arena for the flat test arena
};
app.goto(sceneName, startOpts);
loop.start();
