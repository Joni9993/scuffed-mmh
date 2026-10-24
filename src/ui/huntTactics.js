import { partTactic, partCondition } from '../data/partTactics.js';
import { esc } from './hubKit.js';
import './huntTactics.css';

export function createHuntTactics(h) {
  // Defensive guard: no DOM, text notifications or extra buttons during a real hunt.
  if (!h.training) return { notice() {}, update() {}, dispose() {} };
  const root = document.createElement('div'); root.className = 'hunt-tactics'; h.app.ui.appendChild(root);
  root.innerHTML = '<section class="tactics-panel"><div class="tactics-part"></div><div class="tactics-actions ui-hit"><button data-ping="focus">Dieses Teil!</button><button data-ping="trap">Falle hier</button><button data-ping="glitch">Glitch bereit</button></div></section><aside class="team-notice" role="status" aria-live="polite"></aside><aside class="break-notice" role="status"></aside>';
  const q = s => root.querySelector(s), partEl = q('.tactics-part'), actions = q('.tactics-actions'), noticeEl = q('.team-notice'), breakEl = q('.break-notice');
  let signature = '', noticeUntil = 0, breakUntil = 0, focus = null, cooldown = 0;
  const off = h.bus.on('teamNotice', e => {
    noticeEl.innerHTML = `<b>${esc(e.title)}</b><span>${esc(e.text)}</span>`; noticeEl.classList.add('show'); noticeUntil = h.time + (e.type === 'moment' ? 5 : 3);
    if (e.type === 'ping') {
      if (e.kind === 'focus') focus = { monster: e.monster, part: e.part, until: h.time + 6 };
      if (e.kind === 'trap') h.fx.marker?.('team-trap', { x: e.x, z: e.z, y: h.world.heightAt(e.x, e.z) }, 2, '#76e0c1', false);
    }
  });
  root.addEventListener('click', e => {
    const kind = e.target.closest('[data-ping]')?.dataset.ping;
    if (!kind || cooldown > h.time || h.panelOpen || h.result) return;
    if (kind === 'focus' && !h.player.lock) { h.toast?.('Erst ein Körperteil per Lock auswählen.'); return; }
    if (h.teamplay.requestPing(kind)) cooldown = h.time + 4;
  });
  return {
    notice(text) { if (text) { breakEl.textContent = text; breakEl.classList.add('show'); breakUntil = h.time + 6; } },
    update() {
      root.hidden = !h.training || !!h.school?.active || !!h.school?.menuOpen || !!h.cineLock || !!h.panelOpen || !!h.paused;
      if (root.hidden) return;
      const l = h.player.lock, points = l?.monster.lockPoints() ?? [], point = points.length ? points[l.idx % points.length] : null;
      const m = l?.monster, part = point && m.partById[point.partId];
      const sig = `${m?.id}:${part?.id}:${part && partCondition(part)}`;
      if (signature !== sig) {
        signature = sig;
        partEl.innerHTML = part ? `<b>${esc(part.label)} <small>${esc(partCondition(part))}</small></b>${part.breakHp ? `<span>${esc(part.broken ? partTactic(m, part).after : partTactic(m, part).before)}</span>` : '<span>Lock-Taste wischen: brechbares Körperteil wählen.</span>'}` : '';
      }
      const coop = h.players.length > 1 && !h.result;
      actions.hidden = !coop;
      for (const b of actions.querySelectorAll('button')) b.disabled = cooldown > h.time || b.dataset.ping === 'focus' && !part || b.dataset.ping === 'glitch' && (h.player.glitch.active || h.player.glitch.energy < 100);
      noticeEl.classList.toggle('show', h.time < noticeUntil);
      breakEl.classList.toggle('show', h.time < breakUntil);
      if (h.time >= noticeUntil) h.fx.clearMarker?.('team-trap');
      if (focus && h.time < focus.until) {
        const target = h.monsters.find(x => x.id === focus.monster), hp = target?.hurtParts().find(x => x.part.id === focus.part);
        if (hp) h.fx.marker?.('team-focus', { x: hp.pos.x, y: h.world.heightAt(hp.pos.x, hp.pos.z), z: hp.pos.z }, 1, '#76e0c1', false);
      } else { focus = null; h.fx.clearMarker?.('team-focus'); }
    },
    dispose() { off(); h.fx.clearMarker?.('team-trap'); h.fx.clearMarker?.('team-focus'); root.remove(); },
  };
}
