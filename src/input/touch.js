/**
 * Touch controls (rules: docs/ARCHITECTURE.md "Touch-Regeln").
 * Dynamic stick on the thumb side (40 %), buttons on a thumb arc in the opposite bottom corner (positions from
 * touchLayout.js, mirrored for left-handed), swipe on the free area rotates the camera.
 * Everything is pointer-id based (multi-touch safe). A finger only ever belongs to the control it started on.
 */
import { settings } from '../core/settings.js';
import { solveLayout, STICK_ZONE, stickStep } from './touchLayout.js';

const BUTTONS = [
  { act: 'attack', key: 'attack', label: 'A', cls: 'btn-a' },
  { act: 'roll', key: 'roll', label: 'Rolle', cls: 'btn-roll' },
  { act: 'special', key: 'special', label: 'B', cls: 'btn-b' },
  { act: 'lock', key: 'lock', label: '', cls: 'btn-lock' },
  { act: 'item', key: 'item', label: '', cls: 'btn-item' },
  { act: 'glitch', key: 'glitch', label: 'GLITCH', cls: 'btn-glitch' },
  { act: 'context', key: 'ctx', label: '', cls: 'btn-ctx' },
  { act: 'bar', key: 'bar', label: '+', cls: 'btn-bar' },
];

/** shrink text until it fits (long station labels); wraps at spaces first. */
function fitText(span, box, base, min = 7) {
  let fs = base;
  span.style.fontSize = fs + 'px';
  while (fs > min && (span.scrollWidth > box.w + 0.5 || span.scrollHeight > box.h + 0.5)) { fs -= 0.5; span.style.fontSize = fs + 'px'; }
}

export function attachTouch(input, root) {
  const el = document.createElement('div');
  el.id = 'touch';
  el.innerHTML = `<div class="stick-base"><div class="stick-knob"></div></div>` +
    BUTTONS.map((b) => `<div class="tbtn ${b.cls}" data-act="${b.act}"><div class="tv">${b.act === 'lock' ? '<span class="l1">Lock</span><span class="l2">aus</span>' : `<span>${b.label}</span>`}</div></div>`).join('') +
    `<div class="tmenu" data-act="menu"><div class="tv"><span>II</span></div></div>`;
  root.appendChild(el);
  // safe-area probe (CSS env() -> numbers)
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:var(--sat) var(--sar) var(--sab) var(--sal)';
  document.body.appendChild(probe);

  if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window || new URLSearchParams(location.search).get('touch') === '1') {
    input.hasTouch = true;
    document.body.classList.add('touch');
  }
  const base = el.querySelector('.stick-base'), knob = el.querySelector('.stick-knob');
  const ctxBtn = el.querySelector('.btn-ctx'), itemBtn = el.querySelector('.btn-item'), lockBtn = el.querySelector('.btn-lock');
  const glBtn = el.querySelector('.btn-glitch');
  const el$ = Object.fromEntries(BUTTONS.map((b) => [b.key, el.querySelector('.' + b.cls)]));
  el$.menu = el.querySelector('.tmenu');
  const ptrs = new Map();
  let stickRadius = 44, active = true, layout = null, lastKey = '', lastCtx = null, lastItem = null, lastGl = null;

  const vmin = () => Math.min(window.innerWidth, window.innerHeight) / 100;
  const flag = () => { input.hasTouch = true; document.body.classList.add('touch'); };
  const buzz = (ms = 8) => { if (settings.haptics !== false) { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } } };

  function insets() {
    const cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  /** (re)compute positions and write them as plain px styles + CSS variables for neighbours (item strip, town emote). */
  function relayout() {
    const w = window.innerWidth, h = window.innerHeight;
    const town = document.body.classList.contains('town');
    const ins = insets();
    layout = solveLayout(w, h, { size: settings.btnSize, mirror: !!settings.leftHand, insets: ins, mode: town ? 'town' : 'hunt' });
    for (const [k, b] of Object.entries(layout.buttons)) {
      const node = el$[k];
      if (!node) continue;
      node.style.display = b.visible && (k !== 'ctx' || input.contextLabel) && (k !== 'glitch' || input.glitchReady) ? '' : 'none';
      node.style.left = (b.cx - b.hit / 2).toFixed(1) + 'px';
      node.style.top = (b.cy - b.hit / 2).toFixed(1) + 'px';
      node.style.width = node.style.height = b.hit.toFixed(1) + 'px';
      node.style.setProperty('--vis', b.vis.toFixed(1) + 'px');
      node.style.setProperty('--fs', Math.max(9, Math.min(b.vis * 0.26, 22)).toFixed(1) + 'px');
    }
    const rs = document.documentElement.style, S = layout.strip, em = layout.buttons.emote;
    rs.setProperty('--strip-x', S.x.toFixed(1) + 'px'); rs.setProperty('--strip-y', S.y.toFixed(1) + 'px');
    rs.setProperty('--strip-w', S.w.toFixed(1) + 'px'); rs.setProperty('--strip-h', S.h.toFixed(1) + 'px'); rs.setProperty('--strip-cols', String(S.cols));
    if (em) {
      rs.setProperty('--emote-x', (em.cx - em.hit / 2).toFixed(1) + 'px'); rs.setProperty('--emote-y', (em.cy - em.hit / 2).toFixed(1) + 'px');
      rs.setProperty('--emote-s', em.hit.toFixed(1) + 'px'); rs.setProperty('--emote-vis', em.vis.toFixed(1) + 'px');
      // wheel: bottom edge aligned with the emote button, on the free side
      rs.setProperty('--wheel-b', (h - (em.cy + em.hit / 2)).toFixed(1) + 'px');
      if (layout.mirror) { rs.setProperty('--wheel-l', (em.cx + em.hit / 2 + 8).toFixed(1) + 'px'); rs.setProperty('--wheel-r', 'auto'); }
      else { rs.setProperty('--wheel-r', (w - (em.cx - em.hit / 2) + 8).toFixed(1) + 'px'); rs.setProperty('--wheel-l', 'auto'); }
    }
    document.body.classList.toggle('lefty', !!settings.leftHand);
    lastCtx = lastItem = lastGl = null; // re-fit labels
    lastKey = key();
  }
  const key = () => `${window.innerWidth}x${window.innerHeight}|${settings.btnSize}|${settings.leftHand}|${document.body.classList.contains('town')}`;
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', () => setTimeout(relayout, 120));

  const inStickZone = (x) => { const z = layout?.stickZone ?? { x0: 0, x1: window.innerWidth * STICK_ZONE }; return x >= z.x0 && x <= z.x1; };

  document.addEventListener('pointerdown', (e) => {
    if (!active || e.pointerType === 'mouse') return;
    const slot = e.target.closest?.('.hh-slot[data-i]');
    if (slot) { flag(); ptrs.set(e.pointerId, { kind: 'slot', btn: slot, x0: e.clientX, y0: e.clientY }); return; }
    if (e.target.closest?.('.ui-hit')) return;
    flag();
    e.preventDefault();
    const btn = e.target.closest?.('[data-act]');
    if (btn) {
      const act = btn.dataset.act;
      btn.classList.add('down');
      try { btn.setPointerCapture(e.pointerId); } catch { /* capture is a nicety */ }
      buzz(act === 'attack' ? 10 : 7);
      if (act === 'bar') ptrs.set(e.pointerId, { kind: 'bar', btn });
      else if (act === 'item') ptrs.set(e.pointerId, { kind: 'item', btn, x0: e.clientX, swiped: false });
      else if (act === 'lock') ptrs.set(e.pointerId, { kind: 'lock', btn, y0: e.clientY, swiped: false });
      else { input.set(act, true, 't' + e.pointerId); ptrs.set(e.pointerId, { kind: 'btn', btn, act }); }
      return;
    }
    if (inStickZone(e.clientX)) {
      stickRadius = vmin() * 11;
      ptrs.set(e.pointerId, { kind: 'stick', ox: e.clientX, oy: e.clientY, t0: performance.now() });
      base.style.display = 'block';
      base.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
      knob.style.transform = 'translate(-50%,-50%)';
    } else {
      ptrs.set(e.pointerId, { kind: 'cam', x: e.clientX, y: e.clientY });
    }
  });

  document.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'stick') {
      const ox = p.ox, oy = p.oy;
      const { x, y } = stickStep(p, e.clientX, e.clientY, stickRadius, settings.stickMode);
      if (p.ox !== ox || p.oy !== oy) base.style.transform = `translate(${p.ox}px,${p.oy}px) translate(-50%,-50%)`;
      knob.style.transform = `translate(${x * stickRadius}px,${y * stickRadius}px) translate(-50%,-50%)`;
      input.setStick(x, -y, 't' + e.pointerId);
    } else if (p.kind === 'cam') {
      input.addCamera(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    } else if (p.kind === 'item' && !p.swiped) {
      const dx = e.clientX - p.x0;
      if (Math.abs(dx) > vmin() * 4) { p.swiped = true; buzz(5); input.press(dx < 0 ? 'itemNext' : 'itemPrev', 30); }
    } else if (p.kind === 'lock' && !p.swiped) {
      const dy = e.clientY - p.y0;
      if (Math.abs(dy) > Math.max(16, vmin() * 3.6)) { p.swiped = true; buzz(5); input.press(dy < 0 ? 'lockNext' : 'lockPrev', 30); } // swipe up = next part, down = previous
    }
  });

  // Item strip slots: select on pointerup (a 2nd finger's click is dropped by Chrome while another finger holds the stick).
  // The native touch click is swallowed, the synthetic one (flagged) goes through to hubHuntHud's click handler.
  let synth = false;
  document.addEventListener('click', (e) => {
    if (synth || e.pointerType !== 'touch' || !e.target.closest?.('.hh-slot')) return;
    e.stopImmediatePropagation(); e.preventDefault();
  }, true);

  const end = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.kind === 'slot') {
      if (e.type === 'pointerup' && p.btn.isConnected && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < vmin() * 4) { synth = true; try { p.btn.click(); } finally { synth = false; } }
    } else if (p.kind === 'stick') { input.setStick(0, 0, 't' + e.pointerId); base.style.display = 'none'; }
    else if (p.kind === 'btn') { input.set(p.act, false, 't' + e.pointerId); p.btn.classList.remove('down'); }
    else if (p.kind === 'bar') { p.btn.classList.remove('down'); if (e.type === 'pointerup') document.dispatchEvent(new CustomEvent('sh:strip-toggle')); }
    else if (p.kind === 'item') { p.btn.classList.remove('down'); if (!p.swiped && e.type === 'pointerup') input.press('item', 40); }
    else if (p.kind === 'lock') { p.btn.classList.remove('down'); if (!p.swiped && e.type === 'pointerup') input.press('lock', 40); } // tap = toggle
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  const releaseAll = () => { for (const id of [...ptrs.keys()]) end({ pointerId: id, type: 'pointercancel' }); };
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  relayout();
  return {
    el,
    get layout() { return layout; },
    relayout,
    /** per-frame label sync */
    update() {
      if (key() !== lastKey) relayout();
      const c = input.contextLabel || null;
      ctxBtn.style.display = c ? '' : 'none';
      const gr = !!input.glitchReady && !!layout.buttons.glitch?.visible;
      if (gr !== lastGl) { lastGl = gr; glBtn.style.display = gr ? '' : 'none'; }
      if (c !== lastCtx) {
        lastCtx = c;
        const span = ctxBtn.querySelector('span');
        if (c) {
          span.textContent = c;
          const vis = layout.buttons.ctx.vis;
          fitText(span, { w: vis * 0.8, h: vis * 0.62 }, Math.max(9, Math.min(vis * 0.19, 15)));
        }
      }
      const it = input.itemLabel || 'Item';
      if (it !== lastItem) {
        lastItem = it;
        const span = itemBtn.querySelector('span');
        span.textContent = it;
        const vis = layout.buttons.item.vis;
        fitText(span, { w: vis * 0.84, h: vis * 0.3 }, Math.max(7, Math.min(vis * 0.17, 11)), 6);
      }
      const on = !!input.lockOn;
      if (lockBtn.classList.contains('on') !== on) {
        lockBtn.classList.toggle('on', on);
        lockBtn.querySelector('.l2').textContent = on ? 'AN' : 'aus';
      }
    },
    setVisible(v) {
      active = v;
      el.style.display = v ? 'block' : 'none';
      if (!v) releaseAll();
      else relayout();
    },
  };
}
