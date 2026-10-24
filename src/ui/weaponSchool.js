import { WEAPON_LESSONS, newLessonProgress, recordLesson } from '../data/weaponLessons.js';
import { settings, saveSettings } from '../core/settings.js';
import { endGlitch } from '../game/glitch.js';
import { esc } from './hubKit.js';
import './weaponSchool.css';

/** Local training only. Practice weapons never change the inventory or equipped weapon in the save. */
export function createWeaponSchool(h) {
  const root = document.createElement('div'); root.className = 'weapon-school'; h.app.ui.appendChild(root);
  const saved = settings.weaponSchool && typeof settings.weaponSchool === 'object' ? settings.weaponSchool : {};
  let progress = newLessonProgress(h.player.weaponId), active = false, menuOpen = false, briefing = false, lastView = '', pulse = null, pulseN = 0, wait = 1;
  let message = '', messageUntil = 0;
  const course = () => WEAPON_LESSONS[progress.weapon];
  const step = () => course().steps[progress.index];
  const completed = (id) => Array.isArray(saved[id]) ? saved[id] : [];
  const distance = () => Math.hypot(h.player.pos.x - h.mainMonster.pos.x, h.player.pos.z - h.mainMonster.pos.z);
  const clearPulse = () => { pulse = null; h.fx.clearMarker?.('school-strike'); h.fx.clearMarker?.('school-position'); };
  function success() {
    if (!progress.done) return;
    if (!completed(progress.weapon).includes(step().id)) {
      saved[progress.weapon] = [...completed(progress.weapon), step().id]; settings.weaponSchool = saved; saveSettings();
    }
    h.bus.emit('sfx', { name: 'charge', pos: h.player.pos, level: 3 });
    clearPulse(); render(true);
  }
  function event(type, e = {}) {
    if (!active || menuOpen || e.player && e.player !== h.player) return;
    const p = h.player, w = p.weapon;
    const payload = { ...e, moveId: e.moveId ?? w.moveId, sauber: e.sauber ?? w.flags.sauber, rausch: !!w.data.rausch, mode: w.data.mode, distance: distance() };
    const wasDone = progress.done;
    recordLesson(progress, type, payload);
    if (type === 'hit' && p.glitching) recordLesson(progress, 'glitchHit', payload);
    if (!wasDone && progress.done) success();
  }
  const offs = ['weaponMove', 'weaponTechnique', 'hit', 'counter', 'kkPlay'].map(type => h.bus.on(type, e => event(type, e)));
  function setMenu(on, lesson = false) {
    menuOpen = on; briefing = lesson; h.input.reset(); h.app.touch?.setVisible(!on); clearPulse(); lastView = ''; render(true);
  }
  function prepare(index) {
    clearPulse(); const p = h.player, m = h.mainMonster;
    endGlitch(p); p.weapon.cancel(); p.weapon.data = {}; p.weapon.reset(); p.weapon.wucht = 0; p.glitch.energy = 100;
    p.sinceRoll = 99; p.glitchT = 0; p.perfectKeys.clear();
    p.state = 'free'; p.stateT = 0; p.hitstop = 0; p.invuln = 0; p.glitchCd = 0;
    p.v.stamina = p.v.maxStamina; p.v.exhaust = 0;
    // Remove delayed projectiles/effects from the previous attempt before opening its next objective.
    h.projectiles.clear();
    progress = newLessonProgress(p.weaponId, index); message = ''; messageUntil = 0;
    if (index === 0) p.lock = null;
    if (step().wucht) p.weapon.wucht = 100;
    if (step().setup === 'switch') { p.weapon.data.mode = 'schwert'; p.weapon.data.druck = 8; }
    const dist = ['bow', 'lb'].includes(p.weaponId) ? 10 : 2.5;
    p.spawnAt(m.pos.x + Math.sin(m.rot) * dist, m.pos.z + Math.cos(m.rot) * dist, m.rot + Math.PI);
    h.rig.snap(p.pos, p.rot); wait = 1.2; active = true; setMenu(true, true);
  }
  function switchWeapon(id) {
    if (!WEAPON_LESSONS[id]) return;
    clearPulse(); const p = h.player; endGlitch(p); p.weapon.cancel(); p.setWeapon(id, 1); p.lock = null; p.ammoTip = null;
    h.inventory.setWeapon(id);
    progress = newLessonProgress(id); active = false; message = ''; lastView = ''; render(true);
  }
  function render(force = false) {
    const c = course(), s = step(), n = progress.index;
    const sig = `${menuOpen}|${briefing}|${active}|${progress.weapon}|${n}|${progress.done}`;
    // Keep tappable DOM nodes alive during countdowns and charge signals (including a held iOS tap).
    if (!force && sig === lastView) { updateCoach(); return; } lastView = sig;
    if (menuOpen && briefing) {
      root.innerHTML = `<div class="school-backdrop ui-hit"><section class="school-menu school-briefing allow-scroll" role="dialog" aria-modal="true" aria-label="Anleitung zur Lektion">
        <div class="school-eyebrow">${esc(c.name)} · LEKTION ${n + 1}/${c.steps.length}</div><h2>${esc(s.title)}</h2>
        <p class="school-how">${esc(s.how)}</p><h3>Warum / Tipp</h3><p>${esc(s.why)}</p>
        <p>Beim Üben bleibt nur der kurze Hinweis sichtbar. Über „Anleitung“ kannst du hier jederzeit nachlesen.</p>
        <footer><button data-school="practice">${progress.done ? 'Weiter üben' : 'Jetzt üben'} →</button><button data-school="retry">Neu aufstellen</button><button data-school="open">Kurs / Waffe</button></footer>
      </section></div>`;
      return;
    }
    if (menuOpen) {
      root.innerHTML = `<div class="school-backdrop ui-hit"><section class="school-menu allow-scroll" role="dialog" aria-label="Waffenschule">
        <div class="school-eyebrow">ROSTNEST · WAFFENSCHULE</div><h2>Deine Waffe. Dein Rhythmus.</h2>
        <p>Jede Technik wird erklärt und praktisch geprüft. Kein Zeitdruck, kein Materialverbrauch. Alle sieben Übungswaffen stehen bereit. HP sind unendlich; Puste verhält sich im Kurs wie auf der Jagd.</p>
        <div class="school-weapons">${Object.entries(WEAPON_LESSONS).map(([id, v]) => `<button data-school-weapon="${id}" class="${id === progress.weapon ? 'selected' : ''}">${v.name}<small>${completed(id).length}/${v.steps.length}</small></button>`).join('')}</div>
        <div class="school-start"><button data-school="continue">${active ? 'Übung fortsetzen →' : 'Geführten Kurs starten →'}</button><button data-school="free">Frei üben</button></div>
        <h3>${c.name}</h3><p class="school-role">${c.role}</p><p>${c.rhythm}</p>
        <div class="school-controls"><b>Touch</b> A / B · Rolle · Lock · Glitch<br><b>Maus</b> Linksklick = A · Rechtsklick = B · Leertaste = Rolle · Q = Lock · G = Glitch (ins Spiel klicken für Maussteuerung)<br><b>Gamepad</b> West = A · Nord = B · Süd = Rolle · RB = Lock · LT = Glitch</div>
        <ol class="school-lessons">${c.steps.map((x, i) => `<li><button data-school-step="${i}"><span>${completed(progress.weapon).includes(x.id) ? '✓' : String(i + 1).padStart(2, '0')}</span>${x.title}<small>${completed(progress.weapon).includes(x.id) ? 'Wiederholen' : 'Üben'}</small></button></li>`).join('')}</ol>
        <footer><button data-school="continue">${active ? 'Übung fortsetzen' : 'Kurs starten'}</button><button data-school="free">Frei üben</button><button data-school="leave">Zurück ins Dorf</button></footer>
      </section></div>`;
      return;
    }
    if (!active) { root.innerHTML = '<button class="school-open ui-hit" data-school="open">Waffenschule öffnen</button>'; return; }
    root.innerHTML = `<section class="school-coach ${progress.done ? 'complete' : ''}">
      <div class="school-reminder"><header><span>${n + 1}/${c.steps.length} · ${esc(s.title)}</span><span class="school-status" role="status"></span></header>
      <div class="school-signal" aria-live="off"></div></div>
      <button class="ui-hit" data-school="why" aria-label="Anleitung und Tipps zur aktuellen Lektion">Anleitung</button>
      ${progress.done ? `<button class="next ui-hit" data-school="next">${n + 1 < c.steps.length ? 'Weiter →' : 'Fertig ✓'}</button>` : ''}
    </section>`;
    updateCoach();
  }
  function updateCoach() {
    const status = root.querySelector('.school-status'), prompt = root.querySelector('.school-signal');
    if (!status || !prompt) return;
    const s = step(), live = h.player.weapon.sauberOpen || h.player.weapon.data.blitzT > 0;
    status.textContent = progress.done ? '✓' : `${progress.count}/${s.rule.count ?? 1}`;
    prompt.classList.toggle('now', !progress.done && (!!live || !!pulse && pulse.left <= .18));
    prompt.textContent = progress.done ? 'Geschafft! Weiter üben oder nächste Lektion.'
      : live ? (s.setup === 'switch' ? 'JETZT: B kurz tippen!' : 'JETZT: A loslassen!')
      : s.defense && pulse ? (pulse.left <= .18 ? s.defense === 'counter' ? 'JETZT: B kurz tippen!' : s.defense === 'dodge' ? 'JETZT: zur Seite rollen!' : 'JETZT: B halten!' : `Schlag in ${pulse.left.toFixed(1)} s · ${s.cue}`)
      : message && h.time < messageUntil ? message : s.cue;
  }
  root.addEventListener('click', e => {
    const weapon = e.target.closest('[data-school-weapon]')?.dataset.schoolWeapon;
    if (weapon) { switchWeapon(weapon); return; }
    const index = e.target.closest('[data-school-step]')?.dataset.schoolStep;
    if (index !== undefined) { prepare(Number(index)); return; }
    switch (e.target.closest('[data-school]')?.dataset.school) {
      case 'open': setMenu(true); break;
      case 'continue': if (active) setMenu(false); else prepare(0); break;
      case 'practice': wait = 1.2; setMenu(false); break;
      case 'free': active = false; setMenu(false); break;
      case 'retry': prepare(progress.index); break;
      case 'next': if (progress.index + 1 < course().steps.length) prepare(progress.index + 1); else { active = false; setMenu(true); } break;
      case 'why': setMenu(true, true); break;
      case 'leave': h.abandon(); break;
    }
  });
  setMenu(true);
  return {
    get menuOpen() { return menuOpen; }, get active() { return active; }, get progress() { return progress; },
    get fillWucht() { return !active || !!step().wucht; },
    render() { root.hidden = !!h.paused || !!h.panelOpen || !!h.cineLock; },
    update(dt) {
      if (!active || menuOpen || h.panelOpen || h.paused) return;
      const p = h.player, s = step(), m = h.mainMonster;
      if (!s.wucht) p.weapon.wucht = Math.min(90, p.weapon.wucht);
      if (s.rule.state === 'pressure' && p.weapon.data.mode === 'axt' && p.weapon.data.druck >= 25 && !progress.done) { progress.done = true; progress.count = 1; success(); }
      if (s.rule.state === 'position' && !progress.done) {
        const dist = ['bow', 'lb'].includes(p.weaponId) ? 10 : 2.5;
        const at = { x: m.pos.x + Math.sin(m.rot) * dist, z: m.pos.z + Math.cos(m.rot) * dist };
        h.fx.marker?.('school-position', { ...at, y: h.world.heightAt(at.x, at.z) }, .8, '#77e5cf', false);
        if (p.lock?.monster === m && Math.abs(distance() - dist) < 1.5) { progress.done = true; progress.count = 1; success(); }
      }
      if (s.defense && !progress.done) {
        if (!pulse) {
          wait -= dt;
          if (wait <= 0) { pulse = { left: 1.5, at: { x: p.pos.x, y: p.pos.y, z: p.pos.z } }; h.bus.emit('sfx', { name: 'charge', pos: m.pos, level: 1 }); }
        } else {
          pulse.left -= dt;
          h.fx.marker?.('school-strike', pulse.at, 3, pulse.left <= .18 ? '#fff0a0' : '#ff9857', true);
          if (pulse.left <= 0) {
            const at = pulse.at; clearPulse(); wait = 2;
            const result = Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= 3
              ? p.takeHit({ dmg: 10, knock: 'none', sourcePos: m.pos, key: 'school:' + ++pulseN, attackId: 'training_strike', monster: m }) : 'miss';
            event('trainingDefense', { player: p, result });
            if (!progress.done) { message = result === 'block' ? 'Geblockt! Noch einmal.' : result === 'perfect' ? 'Perfekt! Noch einmal mit demselben Timing.' : 'Noch einmal: zur Puppe schauen und das JETZT-Signal abwarten.'; messageUntil = h.time + 2; }
          }
        }
      }
      render();
    },
    dispose() { clearPulse(); offs.forEach(off => off()); root.remove(); },
  };
}
