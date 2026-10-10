// Station panels (Rostnest): self-contained DOM panels that can be opened from anywhere (hub menu, 3D town, ...).
//   openStation(id, app, { onClose, adapter, store })   id: 'schmiede' | 'laden' | 'truhe' | 'kochtopf' | 'auftragsbrett' | 'spiegel' | 'optionen'
//   closeStation()
// Panels never pause anything; they only edit the save (autosave after every action) and call app.goto for hunts.
import { saveStore } from '../meta/save.js';
import { sfx } from '../audio/sfx.js';
import { esc } from './hubKit.js';
import { iconHtml } from './hubIcons.js';
import { createSchmiede, createTruhe, createLaden } from './hubPanelsA.js';
import { createHuntTruhe } from './huntTruhe.js';
import { createKochtopf, createBrett, createSpiegel, createOptionen } from './hubPanelsB.js';

export const STATIONS = {
  schmiede: { title: 'Schmiede', npc: 'Schmiedin Funke', icon: 'ore', make: createSchmiede },
  laden: { title: 'Krämerladen', npc: 'Krämer Kiesel', icon: 'coin', make: createLaden },
  truhe: { title: 'Truhe', npc: 'Deine Truhe', icon: 'plate', make: createTruhe },
  kochtopf: { title: 'Kochtopf', npc: 'Koch Brösel', icon: 'cake', make: createKochtopf },
  auftragsbrett: { title: 'Auftragsbrett', npc: 'Brettwart Ole', icon: 'trap', make: createBrett },
  spiegel: { title: 'Spiegel', npc: 'Der Spiegel', icon: 'gem', make: createSpiegel },
  hunttruhe: { title: 'Lager-Truhe', npc: 'Deine Truhe (Lager)', icon: 'plate', make: createHuntTruhe }, // in a hunt only (adapter = HuntChest)
  optionen: { title: 'Optionen', npc: 'Kleingedrucktes', icon: 'bone', make: createOptionen },
};
export const STATION_IDS = Object.keys(STATIONS).filter((id) => id !== 'hunttruhe'); // town stations

let current = null;

export function isStationOpen() { return !!current; }

export function closeStation() {
  if (!current) return;
  const c = current;
  current = null;
  try { c.panel.dispose?.(); } finally { c.root.remove(); } // a throwing dispose must never leave the panel up
  c.onClose?.(); // restores world input (touch controls)
}

export function openStation(id, app, { onClose, adapter, store = saveStore } = {}) {
  const def = STATIONS[id];
  if (!def) throw new Error(`unknown station "${id}"`);
  closeStation();
  const root = document.createElement('div');
  root.className = 'screen st-screen';
  root.innerHTML = `<div class="st-panel ui-hit" data-station="${id}">
    <div class="st-head"><span class="st-title">${iconHtml(def.icon)} ${esc(def.title)}</span><span class="st-npc">${esc(def.npc)}</span>
      <span class="st-stat"></span><button class="st-x" data-a="__close" aria-label="Schließen">X</button></div>
    <div class="st-body allow-scroll"></div><div class="st-msg"></div></div>`;
  const body = root.querySelector('.st-body'), msg = root.querySelector('.st-msg'), stat = root.querySelector('.st-stat');
  let msgT = 0;
  const ctx = {
    app, store, adapter,
    get save() { return store.get(); },
    commit() { store.flush(); },
    toast(text, bad = false) {
      msg.textContent = text; msg.className = `st-msg show${bad ? ' bad' : ''}`;
      clearTimeout(msgT); msgT = setTimeout(() => msg.classList.remove('show'), 2200);
      sfx.play?.(bad ? 'block' : 'ui');
    },
    rerender() { render(); },
    close: closeStation,
  };
  const panel = def.make(ctx);
  const render = () => {
    const s = store.get();
    stat.innerHTML = `${iconHtml('schrott')}${s.schrott} <span class="jr">JR ${s.jr}</span>`;
    const top = body.scrollTop;
    body.innerHTML = panel.render();
    body.scrollTop = top;
    panel.after?.(body);
  };
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-a]');
    if (!t) return;
    if (t.dataset.a === '__close') { closeStation(); return; }
    sfx.unlock?.();
    if (panel.click(t.dataset.a, t.dataset, e) !== false) render();
  });
  root.addEventListener('input', (e) => { if (panel.input?.(e) === true) render(); });
  app.ui.appendChild(root);
  current = { root, panel, onClose };
  render();
  return ctx;
}
