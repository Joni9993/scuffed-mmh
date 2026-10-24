import { solveLayout } from '../input/touchLayout.js';
import { customLayout, cleanTouchOffsets, EDITABLE_CONTROLS, CONTROL_NAMES } from '../input/customLayout.js';
import { settings, saveSettings } from '../core/settings.js';
import './touchEditor.css';

/** Standalone overlay: cancel preserves settings; every accepted drag respects reserved controls and safe areas. */
export function openTouchEditor(app) {
  const root = document.createElement('div'); root.className = 'touch-editor screen ui-hit';
  root.innerHTML = `<div class="te-playfield"></div><section class="te-panel allow-scroll" role="dialog" aria-modal="true" aria-label="Touch-Steuerung anpassen"><b>Deine Daumen. Dein Layout.</b><button data-te="fold" aria-expanded="true">Hinweise einklappen</button><p>Ziehe die Tasten. Pause, Karte und Itemleiste bleiben frei. Versteckte Aktion- und Glitch-Tasten sind zur Planung eingeblendet.</p><label>Deckkraft <input type="range" min="40" max="100" step="1" value="${Math.round((settings.touchOpacity ?? .82) * 100)}" aria-label="Deckkraft der Touch-Tasten"></label><div class="te-status" role="status">Abstände und sichere Bildschirmränder werden berücksichtigt.</div><footer><button data-te="save">Übernehmen</button><button data-te="reset">Standard</button><button data-te="cancel">Abbrechen</button></footer></section>`;
  app.ui.appendChild(root);
  const field = root.querySelector('.te-playfield'), status = root.querySelector('.te-status');
  const originalTouch = app.touch?.el?.style.display !== 'none';
  app.touch?.setVisible(false); app.input.reset();
  let offsets = cleanTouchOffsets(settings.touchOffsets), opacity = settings.touchOpacity ?? .82, base, ins, drag = null;
  function resize() {
    drag = null;
    const cs = getComputedStyle(root);
    ins = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
    base = solveLayout(innerWidth, innerHeight, { size: settings.btnSize, mirror: settings.leftHand, insets: ins });
    if (!customLayout(base, innerWidth, innerHeight, ins, offsets).valid) { offsets = {}; status.textContent = 'Für dieses Bildschirmformat wurde das sichere Standardlayout geladen.'; }
    draw();
  }
  function draw() {
    const L = customLayout(base, innerWidth, innerHeight, ins, offsets).layout;
    field.innerHTML = `<div class="te-zone" style="left:${L.stickZone.x0}px;width:${L.stickZone.x1 - L.stickZone.x0}px">Joystick</div><div class="te-reserved" style="left:${L.mini.x}px;top:${L.mini.y}px;width:${L.mini.w}px;height:${L.mini.h}px">Karte</div><div class="te-reserved" style="left:${L.strip.x}px;top:${L.strip.y}px;width:${L.strip.w}px;height:${L.strip.h}px">Itemleiste</div>` + Object.entries(L.buttons).filter(([, b]) => b.visible).map(([key, b]) => `<button type="button" class="te-control${EDITABLE_CONTROLS.includes(key) ? '' : ' fixed'}" data-control="${key}" aria-label="${CONTROL_NAMES[key]}${EDITABLE_CONTROLS.includes(key) ? ' verschieben' : ' reserviert'}" style="left:${b.cx - b.hit / 2}px;top:${b.cy - b.hit / 2}px;width:${b.hit}px;height:${b.hit}px;opacity:${opacity}">${CONTROL_NAMES[key]}</button>`).join('');
  }
  field.addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-control]'), key = b?.dataset.control;
    if (!EDITABLE_CONTROLS.includes(key)) return;
    e.preventDefault(); b.setPointerCapture(e.pointerId);
    const current = customLayout(base, innerWidth, innerHeight, ins, offsets).layout.buttons[key];
    drag = { key, id: e.pointerId, node: b, dx: e.clientX - current.cx, dy: e.clientY - current.cy };
  });
  field.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const b = base.buttons[drag.key], x = e.clientX - drag.dx, y = e.clientY - drag.dy;
    const candidate = { ...offsets, [drag.key]: { x: (x - b.cx) / innerWidth * (base.mirror ? -1 : 1), y: (y - b.cy) / innerHeight } };
    if (!customLayout(base, innerWidth, innerHeight, ins, candidate).valid) { status.textContent = 'Hier ist zu wenig Platz. Mehr Abstand zu Tasten, Karte oder Joystick lassen.'; return; }
    offsets = candidate; drag.node.style.left = `${x - b.hit / 2}px`; drag.node.style.top = `${y - b.hit / 2}px`;
    status.textContent = `${CONTROL_NAMES[drag.key]} verschoben. Das Layout passt.`;
  });
  const end = e => { if (drag?.id === e.pointerId) { drag = null; draw(); } };
  field.addEventListener('pointerup', end); field.addEventListener('pointercancel', end);
  root.querySelector('input').addEventListener('input', e => { opacity = Number(e.target.value) / 100; for (const b of field.querySelectorAll('.te-control')) b.style.opacity = String(opacity); });
  let closed = false;
  function close() { if (closed) return; closed = true; window.removeEventListener('resize', resize); root.remove(); app.input.reset(); app.touch?.setVisible(originalTouch); }
  root.addEventListener('click', e => {
    const action = e.target.closest('[data-te]')?.dataset.te;
    if (action === 'fold') { const panel = root.querySelector('.te-panel'), folded = panel.classList.toggle('folded'); e.target.textContent = folded ? 'Hinweise zeigen' : 'Hinweise einklappen'; e.target.setAttribute('aria-expanded', String(!folded)); }
    if (action === 'reset') { offsets = {}; opacity = .82; root.querySelector('input').value = '82'; resize(); }
    if (action === 'save') { settings.touchOffsets = cleanTouchOffsets(offsets); settings.touchOpacity = opacity; saveSettings(); close(); }
    if (action === 'cancel') close();
  });
  window.addEventListener('resize', resize); resize();
  return close;
}
