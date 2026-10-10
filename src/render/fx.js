import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { setSnapScale, setGlobalJitter } from './ps1.js';

const MAX_SPARKS = 320;
const MAX_NUMBERS = 28;

/**
 * Visual effects for one scene: pixel sparks (Points), small floating damage numbers (DOM),
 * screen shake, ground markers, Glitch-Konter screen effect.
 * `nofx` disables sparks/shake/glitch/flash (damage numbers stay, they are info).
 */
export function createFx({ scene, camera, layer = document.getElementById('fxlayer'), nofx = false }) {
  // ---- sparks
  const pos = new Float32Array(MAX_SPARKS * 3), col = new Float32Array(MAX_SPARKS * 3);
  const vel = new Float32Array(MAX_SPARKS * 3), life = new Float32Array(MAX_SPARKS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 3, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true,
  }));
  points.frustumCulled = false;
  scene.add(points);
  pos.fill(-9999);
  let sparkHead = 0;
  const tmpC = new THREE.Color();

  // ---- numbers
  const nums = [];
  for (let i = 0; i < MAX_NUMBERS; i++) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.display = 'none';
    layer.appendChild(el);
    nums.push({ el, age: 99, x: 0, y: 0, z: 0, vx: 0 });
  }
  let numHead = 0;

  // ---- ground markers
  const markers = new Map();
  const ringGeo = new THREE.RingGeometry(0.88, 1, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const discGeo = new THREE.CircleGeometry(1, 20);
  discGeo.rotateX(-Math.PI / 2);

  let trauma = 0, shakeT = 0;
  const shakeOffset = new THREE.Vector3();
  let glitchT = 0;
  const canvas = document.getElementById('game');
  const flashEl = document.getElementById('flash');
  const rgbShift = document.getElementById('sh-rgb-r');
  const v = new THREE.Vector3();

  // Glitch-Modus overlay (CSS only, no per-frame JS): frame noise + scanlines at the screen edge, tear on entry
  let glEl = null, glTearT = 0;
  const glOverlay = () => {
    if (glEl || !layer) return glEl;
    glEl = document.createElement('div');
    glEl.id = 'glitchfx';
    glEl.innerHTML = '<i class="gl-frame"></i><i class="gl-scan"></i><i class="gl-tear"></i><i class="gl-tear b"></i>';
    layer.appendChild(glEl);
    return glEl;
  };

  const fx = {
    nofx,
    shakeOffset,

    spark(p, n = 8, color = '#ffd070', speed = 4) {
      if (nofx) return;
      tmpC.set(color);
      for (let i = 0; i < n; i++) {
        const k = sparkHead; sparkHead = (sparkHead + 1) % MAX_SPARKS;
        pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
        const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2, s = speed * (0.4 + Math.random() * 0.8);
        vel[k * 3] = Math.cos(a) * s; vel[k * 3 + 1] = e * s + 1.5; vel[k * 3 + 2] = Math.sin(a) * s;
        life[k] = 0.35 + Math.random() * 0.3;
        col[k * 3] = tmpC.r; col[k * 3 + 1] = tmpC.g; col[k * 3 + 2] = tmpC.b;
      }
    },

    /** kind: 'hit' (white) | 'weak' (yellow) | 'crit' | 'hurt' (red, player) | 'heal' */
    number(p, text, kind = 'hit') {
      if (!settings.dmgNumbers) return;
      const n = nums[numHead]; numHead = (numHead + 1) % MAX_NUMBERS;
      n.age = 0; n.x = p.x; n.y = p.y; n.z = p.z; n.vx = (Math.random() - 0.5) * 0.8;
      n.el.textContent = text;
      n.el.className = 'dmg ' + kind;
      n.el.style.display = 'block';
    },

    shake(amount = 0.2, dur = 0.2) {
      if (nofx) return;
      trauma = Math.min(1, Math.max(trauma, amount));
      shakeT = Math.max(shakeT, dur);
    },

    flash(color = 'rgba(255,40,40,.35)', dur = 0.15) {
      if (nofx || !flashEl) return;
      flashEl.style.background = color;
      flashEl.style.opacity = '1';
      flashEl.style.transition = 'none';
      requestAnimationFrame(() => { flashEl.style.transition = `opacity ${dur}s`; flashEl.style.opacity = '0'; });
    },

    /** Glitch-Konter: RGB shift + stronger vertex snapping for `dur` seconds. */
    glitch(dur = 0.35) {
      if (nofx) return;
      glitchT = dur;
      canvas?.classList.add('glitch');
    },

    /** Glitch-Modus an/aus: Randrahmen mit Pixelrauschen + Scanlines (CSS), ausserdem body.glitch-mode. */
    glitchMode(on) {
      if (nofx) return;
      glOverlay()?.classList.toggle('on', !!on);
      document.body.classList.toggle('glitch-mode', !!on);
    },
    /** Eintritts-Effekt: Bildriss (zwei versetzte Streifen) + RGB-Shift. */
    glitchTear(dur = 0.45) {
      if (nofx) return;
      const e = glOverlay();
      if (!e) return;
      e.classList.remove('tear'); void e.offsetWidth; e.classList.add('tear');
      glTearT = dur;
      fx.glitch(Math.max(dur, 0.35));
      fx.flash('rgba(90,216,255,.45)', 0.25);
    },

    /** Ground ring/disc marker for telegraphs. key identifies the owner. */
    marker(key, p, radius, color = '#ff3030', disc = false) {
      let m = markers.get(key);
      if (!m) {
        m = new THREE.Mesh(disc ? discGeo : ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, fog: false, depthWrite: false }));
        m.renderOrder = 2;
        scene.add(m);
        markers.set(key, m);
      }
      m.geometry = disc ? discGeo : ringGeo;
      m.material.color.set(color);
      m.position.set(p.x, p.y + 0.08, p.z);
      m.scale.setScalar(radius);
      m.visible = true;
    },
    clearMarker(key) { const m = markers.get(key); if (m) m.visible = false; },

    update(dt) {
      // sparks
      for (let i = 0; i < MAX_SPARKS; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
        vel[i * 3 + 1] -= 14 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      // shake
      if (shakeT > 0) {
        shakeT -= dt;
        const k = trauma * trauma;
        shakeOffset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k).multiplyScalar(0.9);
        trauma = Math.max(0, trauma - dt * 1.8);
      } else { shakeOffset.set(0, 0, 0); trauma = 0; }
      if (glTearT > 0) { glTearT -= dt; if (glTearT <= 0) glEl?.classList.remove('tear'); }
      // glitch
      if (glitchT > 0) {
        glitchT -= dt;
        setSnapScale(2.2);
        setGlobalJitter(0.035);
        if (rgbShift) rgbShift.setAttribute('dx', String(Math.round((Math.random() - 0.3) * 14)));
        if (glitchT <= 0) { setSnapScale(1); setGlobalJitter(0); canvas?.classList.remove('glitch'); }
      }
    },

    /** Project DOM numbers; call once per rendered frame after the camera moved. */
    updateNumbers(dt) {
      const w = layer.clientWidth, h = layer.clientHeight;
      for (const n of nums) {
        if (n.age > 1) { if (n.el.style.display !== 'none') n.el.style.display = 'none'; continue; }
        n.age += dt;
        const rise = n.age * 1.4;
        v.set(n.x + n.vx * n.age, n.y + rise, n.z).project(camera);
        if (v.z > 1) { n.el.style.display = 'none'; continue; }
        n.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w) | 0}px,${((-v.y * 0.5 + 0.5) * h) | 0}px) translate(-50%,-50%)`;
        n.el.style.opacity = String(Math.min(1, (1 - n.age) * 2.5));
      }
    },

    dispose() {
      scene.remove(points);
      geo.dispose();
      for (const n of nums) n.el.remove();
      for (const m of markers.values()) scene.remove(m);
      glEl?.remove(); glEl = null; document.body.classList.remove('glitch-mode');
      setSnapScale(1); setGlobalJitter(0);
      canvas?.classList.remove('glitch');
    },
  };
  return fx;
}
