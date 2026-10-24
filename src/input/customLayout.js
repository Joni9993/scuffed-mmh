import { checkLayout } from './touchLayout.js';

export const EDITABLE_CONTROLS = ['attack', 'roll', 'special', 'lock', 'item', 'ctx', 'glitch'];
export const CONTROL_NAMES = { attack: 'A', roll: 'Rolle', special: 'B', lock: 'Lock', item: 'Item', ctx: 'Aktion', glitch: 'Glitch', bar: '+', menu: 'Pause' };
export function cleanTouchOffsets(value) {
  const out = {};
  for (const key of EDITABLE_CONTROLS) {
    const p = value?.[key];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) out[key] = { x: Math.max(-.5, Math.min(.5, p.x)), y: Math.max(-.5, Math.min(.5, p.y)) };
  }
  return out;
}
export function customLayout(base, w, h, insets, offsets) {
  const layout = { ...base, buttons: Object.fromEntries(Object.entries(base.buttons).map(([key, b]) => [key, { ...b }])) };
  for (const [key, delta] of Object.entries(cleanTouchOffsets(offsets))) {
    const b = layout.buttons[key]; if (!b?.visible) continue;
    b.cx += delta.x * w * (base.mirror ? -1 : 1); b.cy += delta.y * h;
  }
  const issues = checkLayout(layout, w, h, insets);
  for (const [key, b] of Object.entries(layout.buttons)) {
    if (!b.visible || key === 'menu') continue;
    const m = layout.mini, x = Math.max(m.x, Math.min(b.cx, m.x + m.w)), y = Math.max(m.y, Math.min(b.cy, m.y + m.h));
    if (Math.hypot(b.cx - x, b.cy - y) < b.hit / 2) issues.push(`${key}: map`);
  }
  return { layout: issues.length ? base : layout, valid: !issues.length, issues };
}
