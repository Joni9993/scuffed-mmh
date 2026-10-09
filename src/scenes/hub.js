import * as THREE from 'three';
import { lambert } from '../render/ps1.js';
import { saveStore } from '../meta/save.js';
import { openStation, closeStation, STATIONS, STATION_IDS } from '../ui/stations.js';
import { iconHtml } from '../ui/hubIcons.js';
import { esc } from '../ui/hubKit.js';
import { settings } from '../core/settings.js';
import '../ui/hub.css';

/**
 * Rostnest hub – TEMPORARY menu scene: a campfire backdrop and one button per station panel.
 * The walkable 3D town replaces this; the panels (ui/stations.js) are reusable as they are.
 */
export const hubScene = {
  enter(app, opts = {}) {
    this.app = app;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1a1024');
    this.scene.fog = new THREE.Fog('#1a1024', 8, 40);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 12), lambert({ color: '#3a3024' }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground, new THREE.AmbientLight('#8a7aa0', 0.9));
    this.fire = new THREE.PointLight('#ff9040', 2.2, 18);
    this.fire.position.set(0, 1, 0);
    this.scene.add(this.fire);
    const logs = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 5), lambert({ color: '#ff7a30', emissive: '#a03000' }));
    logs.position.y = 0.5;
    this.scene.add(logs);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + 0.4;
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.6, 4), lambert({ color: ['#7a4a3a', '#4a5a6a', '#6a6a3a'][i % 3] }));
      tent.position.set(Math.cos(a) * 7, 1.3, Math.sin(a) * 7);
      tent.rotation.y = a;
      this.scene.add(tent);
    }
    this.cam = new THREE.PerspectiveCamera(55, app.renderer.aspect, 0.1, 80);
    this._onResize = (a) => { this.cam.aspect = a; this.cam.updateProjectionMatrix(); };
    app.renderer.onResize.add(this._onResize);
    document.body.classList.toggle('scan', settings.scanlines);
    this.t = 0;

    const el = document.createElement('div');
    el.className = 'screen hub-menu';
    this.el = el;
    this.menu();
    app.ui.appendChild(el);
    // first launch: the mirror asks for a name
    if (!saveStore.get().nameSet) {
      openStation('spiegel', app, { onClose: () => { saveStore.get().nameSet = true; saveStore.flush(); this.menu(); } });
    } else if (opts.station) openStation(opts.station, app, { onClose: () => this.menu() });
  },
  menu() {
    const s = saveStore.get();
    this.el.innerHTML = `<div class="hub-wrap ui-hit"><div class="hub-top"><b>Rostnest</b><span style="color:${s.color}">${esc(s.name)}</span><span>JR ${s.jr}</span><span>${iconHtml('schrott')}${s.schrott}</span></div>
      <div class="hub-grid">${STATION_IDS.map((id) => `<button class="btn hub-btn${id === 'auftragsbrett' ? ' red' : ''}" data-a="${id}">${iconHtml(STATIONS[id].icon)}<span>${STATIONS[id].title}</span><small>${STATIONS[id].npc}</small></button>`).join('')}</div></div>`;
    this.el.onclick = (e) => {
      const id = e.target.closest('[data-a]')?.dataset.a;
      if (id) openStation(id, this.app, { onClose: () => this.menu() });
    };
  },
  exit() {
    closeStation();
    this.app.renderer.onResize.delete(this._onResize);
    this.el?.remove();
  },
  update(dt) {
    this.t += dt;
    this.fire.intensity = 2.2 + Math.sin(this.t * 17) * 0.3 + Math.sin(this.t * 7.3) * 0.2;
    this.cam.position.set(Math.sin(this.t * 0.12) * 9, 3.2, Math.cos(this.t * 0.12) * 9);
    this.cam.lookAt(0, 1.2, 0);
  },
  render() { this.app.renderer.render(this.scene, this.cam); },
};
