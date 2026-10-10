import * as THREE from 'three';
import { createWorld } from '../game/world/index.js';
import { buildRaptor } from '../game/monsters/raptor.js';
import { settings, saveSettings } from '../core/settings.js';
import { shouldHintA2hs, A2HS_TEXT } from '../ui/a2hs.js';
import { sfx } from '../audio/sfx.js';

/** Title: turntable Jaggo in the test arena + "Jagen". Other agents add hub/lobby via the scene registry. */
export const titleScene = {
  enter(app) {
    this.app = app;
    this.scene = new THREE.Scene();
    const world = createWorld('test');
    this.scene.background = new THREE.Color(world.env.background);
    this.scene.fog = new THREE.Fog(world.env.fog.color, 14, 60);
    this.scene.add(world.mesh);
    this.cam = new THREE.PerspectiveCamera(50, app.renderer.aspect, 0.1, 120);
    this.boss = buildRaptor({ scale: 1.3 });
    this.boss.apply({ bodyY: 0, bodyPitch: 0, bodyRoll: 0, neck: 0, head: 0, headYaw: 0, tailYaw: 0, tailPitch: 0, legL: 0, legR: 0 });
    this.boss.root.position.set(-14, world.heightAt(-14, 0), 0);
    this.scene.add(this.boss.root);
    this.t = 0;
    this._onResize = (a) => { this.cam.aspect = a; this.cam.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);

    const hint = shouldHintA2hs() && !settings.a2hsSeen; // iOS Safari, not installed: once
    if (hint) { settings.a2hsSeen = true; saveSettings(); }
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `<div class="panel ui-hit" style="margin-left:34vw">
      <h1>SCUFFED<br>HUNTER</h1>
      <p>Koop-Brockenjagd.<br>Nicht schön, aber fair.</p>
      <button class="btn red" data-a="hunt">Ins Rostnest</button><br>
      <button class="btn small" data-a="res">Auflösung: ${settings.res}</button>
      <button class="btn small" data-a="scan">Scanlines: ${settings.scanlines ? 'an' : 'aus'}</button>
      ${hint ? `<p class="small" style="max-width:34ch;font-size:max(9px,1.8vmin)">${A2HS_TEXT}</p>` : ''}
    </div>`;
    el.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (!a) return;
      sfx.unlock(); sfx.play('ui');
      if (a === 'hunt') app.goto('hub', { fresh: true }); // [T] title -> Rostnest (room choice happens in the town)
      if (a === 'res') { settings.autoRes = false; app.renderer.setResolution(settings.res === 480 ? 360 : 480); e.target.textContent = `Auflösung: ${settings.res}`; saveSettings(); }
      if (a === 'scan') { settings.scanlines = !settings.scanlines; document.body.classList.toggle('scan', settings.scanlines); e.target.textContent = `Scanlines: ${settings.scanlines ? 'an' : 'aus'}`; saveSettings(); }
    });
    app.ui.appendChild(el);
    this.el = el;
    document.body.classList.toggle('scan', settings.scanlines);
  },
  exit() {
    this.app.renderer.onResize.delete(this._onResize);
    this.el.remove();
  },
  update(dt) {
    this.t += dt;
    this.boss.apply({ bodyY: Math.sin(this.t * 2) * 0.03, bodyPitch: 0, bodyRoll: 0, neck: Math.sin(this.t * 0.9) * 0.1, head: 0, headYaw: Math.sin(this.t * 0.6) * 25, tailYaw: Math.sin(this.t * 1.1) * 12, tailPitch: 0, legL: 0, legR: 0 });
    this.boss.root.rotation.y = 0.6 + Math.sin(this.t * 0.3) * 0.25;
    const a = this.t * 0.12;
    this.cam.position.set(-14 + Math.sin(a) * 2 + 1, 2.4, -9);
    this.cam.lookAt(-18, 2.2, 0);
  },
  render() { this.app.renderer.render(this.scene, this.cam); },
};
