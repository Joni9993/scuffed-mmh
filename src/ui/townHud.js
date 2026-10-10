import './town.css';
import { EMOTES } from '../game/town/emotes.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * Minimal town HUD: room chip (code + copy), small member list, menu button, emote button + wheel, toast line, keyboard hint.
 * handlers: { onMenu(), onEmote(i), onCopy() }
 */
export function createTownHud(root, handlers) {
  const el = document.createElement('div');
  el.id = 'town-hud';
  el.innerHTML = `
    <div class="th-tl"><div class="th-chip"></div><div class="th-members"></div></div>
    <button class="th-menu ui-hit" data-a="menu" aria-label="Menü">=</button>
    <button class="th-emote ui-hit" data-a="emote" aria-label="Emotes"><span>···</span></button>
    <div class="th-wheel ui-hit">${EMOTES.map((t, i) => `<button class="ui-hit" data-a="e${i}">${esc(t)}</button>`).join('')}</div>
    <div class="th-toast"></div>
    <div class="th-hint"></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const chip = q('.th-chip'), members = q('.th-members'), toastEl = q('.th-toast'), hint = q('.th-hint'), wheel = q('.th-wheel');
  let toastT = 0, toastTimer = 0;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'menu') handlers.onMenu?.();
    else if (a === 'emote') wheel.classList.toggle('open');
    else if (a === 'copy') { handlers.onCopy?.(); }
    else if (a === 'share') { handlers.onShare?.(); }
    else if (/^e\d$/.test(a)) { wheel.classList.remove('open'); handlers.onEmote?.(Number(a[1])); }
  });
  const api = {
    el,
    setRoom({ code, solo }) {
      chip.innerHTML = solo ? '<span class="th-solo">Solo</span>' : `<span>Raum</span> <b class="th-code" data-code>${esc(code)}</b> <button class="ui-hit th-copy" data-a="copy">Kopieren</button> <button class="ui-hit th-copy" data-a="share">Link teilen</button>`;
    },
    setMembers(list) {
      members.innerHTML = list.length > 1 || !list[0] ? list.map((m) => `<div><i style="background:${m.color}"></i>${esc(m.name)}${m.hunting ? ' <small>(Jagd)</small>' : ''}</div>`).join('') : '';
    },
    toast(text, ms = 3200) {
      toastEl.textContent = text;
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    },
    setHint(t) { if (hint.textContent !== t) hint.textContent = t; },
    closeWheel() { wheel.classList.remove('open'); },
    setVisible(v) { el.style.display = v ? '' : 'none'; },
    dispose() { clearTimeout(toastTimer); el.remove(); },
  };
  return api;
}
