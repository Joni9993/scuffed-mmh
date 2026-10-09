/**
 * Touch controls. Dynamic stick in the left 40 % of the screen, buttons bottom right,
 * swipe on the free right area rotates the camera. Everything is pointer-id based (multi-touch safe).
 */
const BUTTONS = [
  { act: 'attack', label: 'A', cls: 'btn-a' },
  { act: 'roll', label: 'Rolle', cls: 'btn-roll' },
  { act: 'special', label: 'B', cls: 'btn-b' },
  { act: 'lock', label: 'Lock', cls: 'btn-lock' },
  { act: 'item', label: '', cls: 'btn-item' },
  { act: 'context', label: '', cls: 'btn-ctx' },
];

export function attachTouch(input, root) {
  const el = document.createElement('div');
  el.id = 'touch';
  el.innerHTML = `<div class="stick-base"><div class="stick-knob"></div></div>` +
    BUTTONS.map((b) => `<div class="tbtn ${b.cls}" data-act="${b.act}"><span>${b.label}</span></div>`).join('') +
    `<div class="tmenu" data-act="menu"><span>II</span></div>`;
  root.appendChild(el);
  if (navigator.maxTouchPoints > 0 || 'ontouchstart' in window || new URLSearchParams(location.search).get('touch') === '1') {
    input.hasTouch = true;
    document.body.classList.add('touch');
  }
  const base = el.querySelector('.stick-base'), knob = el.querySelector('.stick-knob');
  const ctxBtn = el.querySelector('.btn-ctx'), itemBtn = el.querySelector('.btn-item');
  const ptrs = new Map();
  let stickRadius = 44, active = true;

  const vmin = () => Math.min(window.innerWidth, window.innerHeight) / 100;
  const flag = () => { input.hasTouch = true; document.body.classList.add('touch'); };

  document.addEventListener('pointerdown', (e) => {
    if (!active || e.pointerType === 'mouse') return;
    if (e.target.closest?.('.ui-hit')) return;
    flag();
    e.preventDefault();
    const btn = e.target.closest?.('[data-act]');
    if (btn) {
      const act = btn.dataset.act;
      btn.classList.add('down');
      if (act === 'item') ptrs.set(e.pointerId, { kind: 'item', btn, x0: e.clientX, swiped: false });
      else { input.set(act, true, 't' + e.pointerId); ptrs.set(e.pointerId, { kind: 'btn', btn, act }); }
      return;
    }
    if (e.clientX < window.innerWidth * 0.4) {
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
      let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
      const d = Math.hypot(dx, dy);
      if (d > stickRadius) { // floating: origin follows the thumb
        const k = (d - stickRadius) / d;
        p.ox += dx * k; p.oy += dy * k;
        dx = e.clientX - p.ox; dy = e.clientY - p.oy;
        base.style.transform = `translate(${p.ox}px,${p.oy}px) translate(-50%,-50%)`;
      }
      const m = Math.min(1, Math.hypot(dx, dy) / stickRadius);
      const a = Math.atan2(dy, dx);
      const x = Math.cos(a) * m, y = Math.sin(a) * m;
      knob.style.transform = `translate(${x * stickRadius}px,${y * stickRadius}px) translate(-50%,-50%)`;
      input.setStick(x, -y, 't' + e.pointerId);
    } else if (p.kind === 'cam') {
      input.addCamera(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY;
    } else if (p.kind === 'item' && !p.swiped) {
      const dx = e.clientX - p.x0;
      if (Math.abs(dx) > vmin() * 4) { p.swiped = true; input.press(dx < 0 ? 'itemNext' : 'itemPrev', 30); }
    }
  });

  const end = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.kind === 'stick') { input.setStick(0, 0, 't' + e.pointerId); base.style.display = 'none'; }
    else if (p.kind === 'btn') { input.set(p.act, false, 't' + e.pointerId); p.btn.classList.remove('down'); }
    else if (p.kind === 'item') { p.btn.classList.remove('down'); if (!p.swiped && e.type === 'pointerup') input.press('item', 40); }
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);

  return {
    el,
    /** per-frame label sync */
    update() {
      const c = input.contextLabel;
      ctxBtn.style.display = c ? 'grid' : 'none';
      if (c) ctxBtn.firstChild.textContent = c;
      itemBtn.firstChild.textContent = input.itemLabel || 'Item';
    },
    setVisible(v) {
      active = v;
      el.style.display = v ? 'block' : 'none';
      if (!v) for (const id of [...ptrs.keys()]) end({ pointerId: id, type: 'pointercancel' });
    },
  };
}
