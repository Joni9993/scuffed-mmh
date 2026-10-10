import * as THREE from 'three';
import { buildHunterRig } from '../game/rig.js';
import { getWeapon } from '../game/weapons/index.js';
import { REST, mirrorPose } from '../game/anim.js';
import { makeGear, encodeGear } from '../data/gearlook.js';
import { ps1Globals } from '../render/ps1.js';
import './gearPreview.css';

// [G] Rotating gear preview for the station panels (Truhe: what you wear, Schmiede: what you are about to craft).
// One small canvas with its OWN tiny WebGL renderer (96x120, CSS-upscaled, pixelated); the rig is rebuilt only when the gear changes.
const W = 96, H = 120;
const SHOW = { gs: { arx: 42, sw: 125 }, db: { arx: 35, sw: 130, alx: 35, sl: 130, arz: 14, alz: 14 }, bow: { arx: 20, sw: -20 } };

export class GearPreview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gpv-canvas';
    this.canvas.width = W; this.canvas.height = H;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight('#a89ac0', 1.2));
    const sun = new THREE.DirectionalLight('#ffc490', 1.2);
    sun.position.set(-3, 6, 5);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#6a8aff', 0.35);
    fill.position.set(4, 2, -3);
    this.scene.add(fill);
    this.camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 50);
    this.camera.position.set(0, 1.5, 6.0);
    this.camera.lookAt(0, 1.3, 0);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(W, H, false);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch { this.renderer = null; } // no WebGL: the slot just stays empty
    this.rig = null; this.code = ''; this.yaw = 0.5; this.last = 0; this.raf = 0; this.dead = false;
    this.snap = new THREE.Vector2(W / 3, H / 3.65);
  }

  /** gear: { weapon:{type,tier,branch}, armor:{head,body,legs}, color }. Rebuilds only when something changed. */
  set(gear) {
    const g = makeGear(gear);
    const code = encodeGear(g) + g.color;
    if (code === this.code || !this.renderer) return;
    this.code = code;
    if (this.rig) { this.scene.remove(this.rig.root); this.rig.dispose(); }
    const def = getWeapon(g.weapon.type);
    const mesh = def.buildMesh?.({ tier: g.weapon.tier, branch: g.weapon.branch }) ?? null;
    this.rig = buildHunterRig({ merged: true, gear: g, weaponMesh: mesh });
    this.pose = { ...REST, ...def.rest, ...SHOW[g.weapon.type] }; // display pose: weapon raised so its silhouette reads
    if (def.hand === 'L') mirrorPose(this.pose);
    this.pose.th = 1;
    this.def = def;
    this.scene.add(this.rig.root);
    this.rig.apply(this.pose);
    this.#draw();
  }

  /** Mount into a placeholder element and (re)start the render loop. */
  attach(el) {
    if (!el || this.dead) return;
    if (this.canvas.parentNode !== el) el.appendChild(this.canvas);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.#frame(t)); }
  }

  #frame(t) {
    this.raf = 0;
    if (this.dead) return;
    if (!this.canvas.isConnected) return; // panel closed / re-rendering: attach() restarts the loop
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.yaw += dt * 0.9;
    this.#draw(dt);
    this.raf = requestAnimationFrame((x) => this.#frame(x));
  }

  #draw(dt = 0) {
    if (!this.rig || !this.renderer) return;
    this.rig.root.rotation.y = this.yaw;
    this.rig.apply(this.pose);
    this.rig.tick(dt);
    // the PS1 snap grid is global: use the preview's own grid while drawing, then restore
    const keep = ps1Globals.uSnap.value.clone();
    ps1Globals.uSnap.value.copy(this.snap);
    this.renderer.render(this.scene, this.camera);
    ps1Globals.uSnap.value.copy(keep);
  }

  dispose() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.rig?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.canvas.remove();
  }
}

/** HTML for the preview column (the canvas is attached by `after`). */
export const previewSlot = () => '<div class="gpv-slot" data-gpv></div>';
