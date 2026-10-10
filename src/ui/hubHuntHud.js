// In-hunt overlay of the meta layer: pickup toasts, item strip + item button icon, carve progress, carve-window panel.
// Compact (vmin units, see hub.css). Touch: strip slots are .ui-hit (tap selects), item button itself is the phase-1 touch button.
import { ITEMS } from '../data/items.js';
import { iconUrl } from './hubIcons.js';

export function createHuntHud(root) {
  const el = document.createElement('div');
  el.className = 'hh';
  el.innerHTML = `
    <div class="hh-toasts"></div>
    <div class="hh-strip ui-hit"></div>
    <div class="hh-carve"><i></i><span>Zerlegen</span></div>
    <div class="hh-window ui-hit"><span class="hh-wt">Zerlegen: 45</span><button class="btn small">Fertig</button></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const toasts = q('.hh-toasts'), strip = q('.hh-strip'), carve = q('.hh-carve'), win = q('.hh-window');
  let onSlot = () => {}, onDone = () => {};
  let open = false, openT = 0;
  const setOpen = (v) => { open = v; clearTimeout(openT); if (v) openT = setTimeout(() => setOpen(false), 5000); strip.classList.toggle('open', open && strip.childElementCount > 0); document.body.classList.toggle('strip-open', open); };
  const onToggle = () => setOpen(!open);
  document.addEventListener('sh:strip-toggle', onToggle);
  strip.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { onSlot(Number(b.dataset.i)); setOpen(false); } });
  win.querySelector('button').addEventListener('click', () => onDone());

  // icon decoration inside the phase-1 item button
  const btn = document.querySelector('.btn-item');
  let ico = null;
  if (btn) { ico = document.createElement('img'); ico.className = 'hh-btnico'; ico.draggable = false; (btn.querySelector('.tv') || btn).appendChild(ico); }

  const cache = {};
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };

  return {
    el,
    onSlot(fn) { onSlot = fn; },
    onDone(fn) { onDone = fn; },
    toast(text, itemId) {
      const t = document.createElement('div');
      t.className = 'hh-toast';
      t.innerHTML = `${itemId ? `<img class="ico" src="${iconUrl(itemId)}" alt="">` : ''}<span></span>`;
      t.lastChild.textContent = text;
      toasts.appendChild(t);
      while (toasts.children.length > 4) toasts.firstChild.remove();
      setTimeout(() => t.classList.add('out'), 2000);
      setTimeout(() => t.remove(), 2400);
    },
    /** inv = HuntInventory, items = ItemSystem (for the in-use highlight) */
    update(inv, items) {
      const bar = inv.items;
      const key = bar.map((b) => `${b.id}${b.n}`).join() + '|' + inv.sel + '|' + (items?.using?.id ?? '');
      set('strip', key, () => {
        document.body.classList.toggle('has-bar', bar.length > 1);
        if (bar.length <= 1) setOpen(false);
        strip.innerHTML = bar.map((b, i) => `<button class="hh-slot${i === inv.sel ? ' sel' : ''}${b.n <= 0 ? ' empty' : ''}" data-i="${i}"><img src="${iconUrl(b.id)}" alt=""><b>${b.n}</b></button>`).join('');
      });
      const cur = inv.selectedId;
      set('btn', cur + ':' + inv.selectedCount, () => {
        if (ico) { ico.src = cur ? iconUrl(cur) : ''; ico.style.display = cur ? 'block' : 'none'; ico.classList.toggle('empty', inv.selectedCount <= 0); }
      });
    },
    carveProgress(p) {
      set('cp', p === null ? -1 : Math.round(p * 20), () => {
        carve.style.display = p === null ? 'none' : 'block';
        if (p !== null) carve.firstChild.style.width = `${Math.round(p * 100)}%`;
      });
    },
    carveWindow(secs) {
      set('cw', secs === null ? -1 : Math.ceil(secs), (s) => {
        win.style.display = s < 0 ? 'none' : 'flex';
        if (s >= 0) win.firstChild.textContent = `Zerlegen: ${s}`;
      });
    },
    dispose() { document.removeEventListener('sh:strip-toggle', onToggle); clearTimeout(openT); document.body.classList.remove('has-bar', 'strip-open'); el.remove(); ico?.remove(); },
  };
}

export const itemLabelText = (id, n) => (id ? `${ITEMS[id]?.name ?? id} x${n}` : '');
