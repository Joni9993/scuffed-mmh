/**
 * Touch button layout solver (pure, no DOM). See docs/ARCHITECTURE.md "Touch-Regeln".
 *
 * Thumb arc around the bottom-right corner (mirrored for left-handed):
 *
 *            [Lock]                    angles are measured around the centre of A
 *        [B]                           roll 182 deg, B 132 deg, Lock 82 deg
 *  [Ctx]        [A]                    Item sits left of Rolle, Ctx (own slot, always reserved) above Item
 *  [Item][Rolle]
 *
 * Every button has a visible circle (`vis`) and a bigger invisible hit circle (`hit`, = vis + 2 * pad). The hit circles of
 * different buttons never overlap, so a tap next to a button can only ever belong to one of them.
 */
export const SIZE_SCALE = { S: 0.85, M: 1, L: 1.2 };
// minimum visual diameters per size setting (CSS px); all >= 44
const FLOOR = {
  S: { a: 60, o: 44, c: 56 },
  M: { a: 66, o: 48, c: 62 },
  L: { a: 76, o: 56, c: 70 },
};
export const MIN_VIS = 44; // smallest visual size of anything tappable
export const MIN_HIT = 44;
export const MIN_HIT_PRIMARY = 56;
const SMALL_VIS = new Set(['menu', 'bar']); // small secondary buttons: 36 visual, 44 hit
export const MIN_GAP = 8; // visible gap between two buttons
const PAD = 6, PAD_A = 8, GAP_HIT = 2;
const ANG = { roll: 182, b: 132, lock: 82 };
export const STICK_ZONE = 0.4; // dynamic stick: outer 40 % of the width on the thumb side

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (d) => (d * Math.PI) / 180;

/**
 * @param w,h viewport in CSS px
 * @param opt {size:'S'|'M'|'L', mirror:boolean, insets:{l,r,t,b}, mode:'hunt'|'town'}
 * @returns {{u:number, mirror:boolean, stickZone:{x0:number,x1:number}, buttons:Object<string,{cx,cy,vis,hit,visible}>, strip:{x,y,w,h}}}
 */
export function solveLayout(w, h, opt = {}) {
  const size = SIZE_SCALE[opt.size] ? opt.size : 'M';
  const mirror = !!opt.mirror;
  const mode = opt.mode === 'town' ? 'town' : 'hunt';
  const ins = { l: 0, r: 0, t: 0, b: 0, ...(opt.insets || {}) };
  const s = SIZE_SCALE[size], fl = FLOOR[size];
  const vm = Math.min(w, h) / 100;
  const u = clamp(vm, 3.2, 6.4); // units are capped so tablets do not get giant buttons
  const margin = Math.max(12, 2.4 * u);

  const visA = Math.max(fl.a, 15.5 * u * s), visO = Math.max(fl.o, 10.8 * u * s), visC = Math.max(fl.c, 13.5 * u * s);
  const hitA = visA + 2 * PAD_A, hitO = visO + 2 * PAD, hitC = visC + 2 * PAD;

  // work in "right-handed" coordinates, mirror at the end. Safe edge on the thumb side uses that side's inset.
  const edgeIns = mirror ? ins.l : ins.r;
  const rightEdge = w - edgeIns - margin, bottomEdge = h - ins.b - margin;
  const A = { cx: rightEdge - hitA / 2, cy: bottomEdge - hitA / 2 };
  const arc = Math.max(hitA / 2 + hitO / 2 + GAP_HIT, (hitO + GAP_HIT) / (2 * Math.sin(rad((ANG.roll - ANG.b) / 2))) + 1);
  const at = (deg) => ({ cx: A.cx + arc * Math.cos(rad(deg)), cy: A.cy - arc * Math.sin(rad(deg)) });

  const raw = {};
  const put = (k, p, vis, hit, visible = true) => { raw[k] = { cx: p.cx, cy: p.cy, vis, hit, visible }; };
  const roll = at(ANG.roll);
  const item = { cx: roll.cx - (hitO + GAP_HIT), cy: roll.cy };
  if (mode === 'town') {
    put('ctx', A, visA, hitA);
    put('roll', roll, visO, hitO);
    put('emote', at(ANG.lock), visO, hitO);
    put('attack', A, visA, hitA, false); put('special', at(ANG.b), visO, hitO, false);
    put('lock', at(ANG.lock), visO, hitO, false); put('item', item, visO, hitO, false);
  } else {
    put('attack', A, visA, hitA);
    put('roll', roll, visO, hitO);
    put('special', at(ANG.b), visO, hitO);
    put('lock', at(ANG.lock), visO, hitO);
    put('item', item, visO, hitO);
    put('ctx', { cx: item.cx, cy: item.cy - hitO / 2 - hitC / 2 - GAP_HIT }, visC, hitC); // reserved slot, never shared
  }
  // item strip (quick select): collapsed by default, a small toggle sits left of the item button (same row);
  // expanded it is a compact block bottom aligned left of the toggle (below the player area, 40px hit slots)
  const SLOT = 40, SG = 2;
  const barHit = MIN_HIT, barVis = 36;
  const bar = { cx: item.cx - hitO / 2 - GAP_HIT - barHit / 2, cy: item.cy, vis: barVis, hit: barHit, visible: true };
  put('bar', bar, barVis, barHit, mode === 'hunt');
  const stripRight = bar.cx - barHit / 2 - MIN_GAP;
  let cols = 4, sw = 4 * SLOT + 3 * SG, sh = 2 * SLOT + SG;
  if (stripRight - sw < 4 + ins.l) { cols = 3; sw = 3 * SLOT + 2 * SG; sh = 3 * SLOT + 2 * SG; }
  const strip = { x: stripRight - sw, y: bottomEdge - sh, w: sw, h: sh, cols };

  // pause/menu button: small (36 visual, 44 hit), directly BELOW the minimap column (timer / KO / minimap, right aligned) so it can never overlap them
  const colW = 16.4 * vm, colRight = w - ins.r - 2 * vm, colTop = ins.t + 1.6 * vm;
  const colH = Math.max(7 * vm, 26) + colW; // timer + KO rows above the square minimap
  const mini = { x: colRight - colW, y: colTop, w: colW, h: colH };
  const menuHit = MIN_HIT, menuVis = 36;
  const menu = { cx: colRight - menuHit / 2, cy: colTop + colH + 6 + menuHit / 2, vis: menuVis, hit: menuHit, visible: mode === 'hunt' };

  // stick zone: 40 % of the width, but never wider than the free space left of the leftmost control (min 30 %)
  const leftmost = mode === 'hunt' ? bar.cx - barHit / 2 : Math.min(roll.cx - hitO / 2, A.cx - hitA / 2);
  const zoneW = clamp(Math.min(STICK_ZONE * w, leftmost - 4), 0.3 * w, STICK_ZONE * w);
  const flip = (x) => (mirror ? w - x : x);
  const buttons = {};
  for (const [k, b] of Object.entries(raw)) buttons[k] = { ...b, cx: flip(b.cx) };
  buttons.menu = menu;
  const stripX = mirror ? w - strip.x - strip.w : strip.x;
  return {
    u, mirror, size, mode,
    stickZone: mirror ? { x0: w - zoneW, x1: w } : { x0: 0, x1: zoneW },
    buttons, mini, strip: { x: stripX, y: strip.y, w: strip.w, h: strip.h, cols: strip.cols },
  };
}

/** Sanity check used by tests and the dev console: returns a list of human-readable problems (empty = fine). */
export function checkLayout(L, w, h, insets = {}) {
  const ins = { l: 0, r: 0, t: 0, b: 0, ...insets };
  const bad = [];
  const list = Object.entries(L.buttons).filter(([, b]) => b.visible);
  for (const [k, b] of list) {
    if (b.vis < (SMALL_VIS.has(k) ? 36 : MIN_VIS)) bad.push(`${k}: visual ${b.vis.toFixed(1)} < ${MIN_VIS}`);
    if (b.hit < MIN_HIT) bad.push(`${k}: hit ${b.hit.toFixed(1)} < ${MIN_HIT}`);
    if (b.hit < b.vis + 8) bad.push(`${k}: hit area not larger than visual`);
    if ((k === 'attack' || k === 'ctx') && b.hit < MIN_HIT_PRIMARY) bad.push(`${k}: primary hit < ${MIN_HIT_PRIMARY}`);
    const r = b.hit / 2;
    if (b.cx - r < ins.l - 0.01 || b.cx + r > w - ins.r + 0.01 || b.cy - r < ins.t - 0.01 || b.cy + r > h - ins.b + 0.01) bad.push(`${k}: hit area outside the safe area`);
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [ka, a] = list[i], [kb, b] = list[j];
      const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
      if (d < a.hit / 2 + b.hit / 2 - 0.01) bad.push(`${ka}/${kb}: hit areas overlap`);
      if (d - a.vis / 2 - b.vis / 2 < MIN_GAP - 0.01) bad.push(`${ka}/${kb}: visual gap ${(d - a.vis / 2 - b.vis / 2).toFixed(1)} < ${MIN_GAP}`);
    }
  }
  // item strip must not touch any hit circle nor reach into the stick zone
  const st = L.strip, hunt = L.mode === 'hunt';
  for (const [k, b] of hunt ? list : []) {
    const nx = Math.max(st.x, Math.min(b.cx, st.x + st.w)), ny = Math.max(st.y, Math.min(b.cy, st.y + st.h));
    if (Math.hypot(b.cx - nx, b.cy - ny) < b.hit / 2) bad.push(`strip/${k}: overlap`);
  }
  if (hunt && (st.x < ins.l || st.x + st.w > w - ins.r)) bad.push('strip outside the safe area');
  // pause button must not touch the minimap column (timer / KO / minimap)
  const mb = L.buttons.menu, mn = L.mini;
  if (hunt && mb?.visible && mn && mb.cx + mb.hit / 2 > mn.x && mb.cx - mb.hit / 2 < mn.x + mn.w && mb.cy + mb.hit / 2 > mn.y && mb.cy - mb.hit / 2 < mn.y + mn.h) bad.push('menu: overlaps the minimap');
  // no button inside the stick zone
  for (const [k, b] of list) {
    if (k === 'menu') continue;
    const inside = L.mirror ? b.cx + b.hit / 2 > L.stickZone.x0 : b.cx - b.hit / 2 < L.stickZone.x1;
    if (inside) bad.push(`${k}: inside the stick zone`);
  }
  return bad;
}

/** Hit test: which visible button owns the point (nearest hit circle containing it). */
export function hitButton(L, x, y) {
  let best = null, bd = 1e9;
  for (const [k, b] of Object.entries(L.buttons)) {
    if (!b.visible) continue;
    const d = Math.hypot(x - b.cx, y - b.cy);
    if (d <= b.hit / 2 && d < bd) { bd = d; best = k; }
  }
  return best;
}
