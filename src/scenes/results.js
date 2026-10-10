import * as THREE from 'three';
import { saveStore } from '../meta/save.js';
import { applyHuntResult } from '../meta/progression.js';
import { ITEMS } from '../data/items.js';
import { iconHtml } from '../ui/hubIcons.js';
import { esc } from '../ui/hubKit.js';
import { settings } from '../core/settings.js';
import { sfx } from '../audio/sfx.js';
import { pickAwards } from '../meta/awards.js';
import '../ui/hub.css';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const list = (title, map) => {
  const e = Object.entries(map ?? {}).filter(([, n]) => n > 0);
  if (!e.length) return '';
  return `<div class="rs-sec"><div class="sub">${title}</div><div class="rs-items">${e.map(([id, n]) => `<span class="chip ok">${iconHtml(id)}<span class="nm">${esc(ITEMS[id]?.name ?? id)}</span> ×${n}</span>`).join('')}</div></div>`;
};

/** Results: applies rewards + progression to the save exactly once, autosaves, shows the summary. */
export const resultsScene = {
  enter(app, opts = {}) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(opts.result === 'win' ? '#1c2a1c' : '#2a1c1c');
    this.cam = new THREE.PerspectiveCamera(50, app.renderer.aspect, 0.1, 10);
    const { quest, rewards, result = 'fail' } = opts;
    let sum = null, jrBefore = 1;
    if (quest && rewards) {
      sum = saveStore.update((s) => { jrBefore = s.jr; return applyHuntResult(s, quest, rewards, { time: opts.time, kos: opts.stats?.kos, glitch: opts.stats?.perfect, carves: opts.carves }); });
    }
    const awards = pickAwards({ ...opts.stats, time: opts.time }, opts.coopStats);
    const win = result === 'win';
    const p = rewards?.parts ?? {};
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `<div class="st-panel rs-panel ui-hit allow-scroll">
      <div class="st-head"><span class="st-title ${win ? 'win' : 'lose'}">${win ? 'Auftrag erfüllt' : 'Auftrag gescheitert'}</span>
        <span class="st-npc">${esc(quest?.name ?? '')}${opts.time ? ` · ${mmss(opts.time)}` : ''}</span></div>
      <div class="st-body">
        <div class="note">${win ? 'Geschafft. Der Brocken sieht das anders, aber der hat auch keine Stimme.' : `${esc(opts.reason || 'Pech')}. Gesammeltes behältst du trotzdem.`}</div>
        <div class="rs-sec"><div class="sub">Auszeichnungen</div>${awards.map((a) => `<div class="note"><b>${esc(a.title)}</b> – ${esc(a.text)}</div>`).join('')}</div>
        ${rewards?.schrott ? `<div class="rs-big">${iconHtml('schrott')} +${rewards.schrott} Schrott</div>` : ''}
        ${sum?.overflowSchrott ? `<div class="note">Truhe voll: Überschuss für ${sum.overflowSchrott} Schrott verkauft.</div>` : ''}
        ${list('Zerlegt', p.carved)}${list('Teilbruch-Bonus', p.breaks)}${list('Auftragsbonus', p.reward)}${list('Gesammelt', p.gathered)}
        ${rewards?.parts?.handedIn && Object.keys(p.handedIn).length ? `<div class="note">Abgegeben: ${Object.entries(p.handedIn).map(([id, n]) => `${n}× ${esc(ITEMS[id]?.name ?? id)}`).join(', ')}</div>` : ''}
        ${Object.keys(rewards?.used ?? {}).length ? list('Verbraucht', rewards.used) : ''}
        ${sum?.jrUp ? `<div class="rs-jr">Jägerrang ${jrBefore} → ${sum.jrUp}! Neue Aufträge am Brett.</div>` : ''}
        ${!Object.keys(rewards?.items ?? {}).length && !rewards?.schrott ? '<div class="note">Mit leeren Händen. Mindestens sauber.</div>' : ''}
      </div><div class="rs-foot"><button class="btn red" data-a="hub">Weiter</button> <!-- [T] --></div></div>`;
    el.addEventListener('click', (e) => { if (e.target.closest('[data-a="hub"]')) { sfx.play('ui'); app.goto('hub'); } });
    app.ui.appendChild(el);
    this.el = el;
    document.body.classList.toggle('scan', settings.scanlines);
  },
  exit() { this.el?.remove(); },
  update() {},
  render() { this.app.renderer.render(this.scene, this.cam); },
};
