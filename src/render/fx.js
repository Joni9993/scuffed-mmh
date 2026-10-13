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


  // ---- Blitze (gezackte, kamerazugewandte Bänder, additiv), Strahlen (Kegel mit scrollender Textur), Schockringe
  const MAX_BOLTS = 18, BOLT_SEG = 10, BR_N = 2, BR_SEG = 4, BOLT_MAXSEG = BOLT_SEG + BR_N * BR_SEG;
  const bolts = [];
  for (let i = 0; i < MAX_BOLTS; i++) {
    const g = new THREE.BufferGeometry();
    const bp = new Float32Array(BOLT_MAXSEG * 2 * 6 * 3), bc = new Float32Array(BOLT_MAXSEG * 2 * 6 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    g.setAttribute('color', new THREE.BufferAttribute(bc, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 3;
    scene.add(mesh);
    bolts.push({ mesh, bp, bc, life: 0, max: 1, a: new THREE.Vector3(), b: new THREE.Vector3(), pts: [], col: new THREE.Color(), width: 0.3, jag: 1, rejag: 0, nseg: 0 });
  }
  let boltHead = 0;
  const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Vector3(), _q = new THREE.Vector3();
  const jagPath = (bo) => {
    const { a, b } = bo, len = a.distanceTo(b);
    _d.subVectors(b, a).normalize();
    _u.set(0, 1, 0); if (Math.abs(_d.y) > 0.9) _u.set(1, 0, 0);
    _w.crossVectors(_d, _u).normalize(); _u.crossVectors(_w, _d).normalize();
    const amp = Math.min(1.6, len * 0.09) * bo.jag;
    const pts = bo.pts; pts.length = 0;
    const main = [];
    for (let i = 0; i <= BOLT_SEG; i++) {
      const t = i / BOLT_SEG, k = Math.sin(Math.PI * t) * amp;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i > 0 && i < BOLT_SEG) p.addScaledVector(_u, (Math.random() - 0.5) * 2 * k).addScaledVector(_w, (Math.random() - 0.5) * 2 * k);
      main.push(p);
    }
    for (let i = 0; i < BOLT_SEG; i++) pts.push([main[i], main[i + 1], 1]);
    for (let br = 0; br < BR_N; br++) { // Seitenäste
      let p = main[2 + ((Math.random() * (BOLT_SEG - 4)) | 0)].clone();
      const dir = new THREE.Vector3().copy(_d).addScaledVector(_u, (Math.random() - 0.5) * 1.6).addScaledVector(_w, (Math.random() - 0.5) * 1.6).normalize();
      const step = len * 0.07;
      for (let j = 0; j < BR_SEG; j++) {
        const q = p.clone().addScaledVector(dir, step).addScaledVector(_u, (Math.random() - 0.5) * step * 0.8).addScaledVector(_w, (Math.random() - 0.5) * step * 0.8);
        pts.push([p, q, 0.55 - j * 0.1]); p = q;
      }
    }
    bo.nseg = pts.length;
  };
  const writeBolt = (bo) => {
    const { bp, bc, pts } = bo, cam = camera.position;
    const fade = Math.min(1, bo.life / bo.max * 2.2);
    let o = 0;
    for (let layer = 0; layer < 2; layer++) { // 0 = farbiger Schein (breit), 1 = weißer Kern (schmal)
      const wk = layer ? 0.32 : 1, cr = layer ? 1 : bo.col.r, cg = layer ? 1 : bo.col.g, cb = layer ? 1 : bo.col.b;
      for (let i = 0; i < BOLT_MAXSEG; i++) {
        if (i >= bo.nseg) { for (let k = 0; k < 18; k++) bp[o + k] = 0; for (let k = 0; k < 18; k++) bc[o + k] = 0; o += 18; continue; }
        const [p0, p1, wMul] = pts[i];
        _m.addVectors(p0, p1).multiplyScalar(0.5);
        _s.subVectors(p1, p0); _q.subVectors(cam, _m); _s.cross(_q).normalize().multiplyScalar(bo.width * wk * wMul * 0.5);
        const v = [p0.x - _s.x, p0.y - _s.y, p0.z - _s.z, p0.x + _s.x, p0.y + _s.y, p0.z + _s.z, p1.x + _s.x, p1.y + _s.y, p1.z + _s.z,
          p0.x - _s.x, p0.y - _s.y, p0.z - _s.z, p1.x + _s.x, p1.y + _s.y, p1.z + _s.z, p1.x - _s.x, p1.y - _s.y, p1.z - _s.z];
        for (let k = 0; k < 18; k++) bp[o + k] = v[k];
        for (let k = 0; k < 6; k++) { bc[o + k * 3] = cr * fade; bc[o + k * 3 + 1] = cg * fade; bc[o + k * 3 + 2] = cb * fade; }
        o += 18;
      }
    }
    bo.mesh.geometry.attributes.position.needsUpdate = true;
    bo.mesh.geometry.attributes.color.needsUpdate = true;
  };

  // Strahl-Textur: helle Schlieren/Puffs (16 px, PS1)
  const jetCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let jetTex = null;
  if (jetCanvas) {
    jetCanvas.width = jetCanvas.height = 16;
    const g2 = jetCanvas.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v2 = 150 + Math.random() * 105; g2.fillStyle = `rgba(${v2},${v2},${v2 + 10},${0.25 + Math.random() * 0.75})`; g2.fillRect(x, y, 1, 1); }
    jetTex = new THREE.CanvasTexture(jetCanvas);
    jetTex.magFilter = THREE.NearestFilter; jetTex.minFilter = THREE.NearestFilter;
    jetTex.wrapS = jetTex.wrapT = THREE.RepeatWrapping; jetTex.repeat.set(2, 3);
  }
  const jetGeo = new THREE.CylinderGeometry(0.55, 1, 1, 10, 1, true); // Strahl: vorn schmaler, hinten voll (radius)
  jetGeo.translate(0, 0.5, 0);
  const jets = new Map();
  const _up = new THREE.Vector3(0, 1, 0);

  const rings = [];
  for (let i = 0; i < 10; i++) {
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    r.visible = false; r.renderOrder = 2; scene.add(r);
    rings.push({ mesh: r, life: 0, max: 1, r0: 0, r1: 1 });
  }
  let ringHead = 0;

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

  // Brocken-Glitch-Overlays (Hacker-Neongruen #39ff14, nie Cyan/Magenta): Weissblitz (Blendax) + kaputter Bildschirm. Reines CSS (ui.css .mon-*), Zaehler laufen in update().
  let whiteEl = null, whiteT = 0, whiteTail = 0, brokenEl = null, brokenT = 0;
  const monEl = (cls, html = '') => {
    const e = document.createElement('div');
    e.className = cls;
    e.innerHTML = html;
    (document.body ?? layer).appendChild(e);
    return e;
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
    number(p, text, kind = 'hit', remote = false) {
      const mode = settings.dmgNumbers;
      if (mode === 'off' || mode === false || (remote && mode !== 'all')) return; // 'own': nur eigene; remote = Treffer von Mitspielern
      const n = nums[numHead]; numHead = (numHead + 1) % MAX_NUMBERS;
      n.age = 0; n.x = p.x; n.y = p.y; n.z = p.z; n.vx = (Math.random() - 0.5) * 0.8;
      n.el.textContent = text;
      n.el.className = 'dmg ' + kind + (remote ? ' remote' : '');
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

    /** Vollbild weiss fuer `dur` s (Geblendet), die letzten `staticTail` s mit Bildrauschen. Greift auch mit nofx (Spielmechanik, kein Schmuck). */
    whiteout(dur = 1, { staticTail = 0.2 } = {}) {
      whiteEl ??= monEl('mon-white');
      whiteEl.classList.remove('tail');
      whiteEl.classList.add('on');
      whiteT = dur; whiteTail = Math.min(staticTail, dur);
    },
    clearWhiteout() { whiteT = 0; whiteEl?.classList.remove('on', 'tail'); },
    /** Kaputter Bildschirm (Blendax-Warnung): versetzte Streifen, neongruene Scanlines, 20-Hz-Flackern, Riesentext. Kein Schaden, nur Warnung. */
    brokenScreen(dur = 1, text = 'NICHT HINSEHEN!') {
      if (nofx) return;
      brokenEl ??= monEl('mon-broken', '<i class="mb-scan"></i><i class="mb-tear a"></i><i class="mb-tear b"></i><i class="mb-tear c"></i><b class="mb-text"></b>');
      brokenEl.querySelector('.mb-text').textContent = text;
      brokenEl.classList.remove('on'); void brokenEl.offsetWidth; brokenEl.classList.add('on');
      brokenT = dur;
    },
    /** Verwirrt-/Schleim-Overlay (Hacker-Gruen): Zeilenverschiebung + Vignette, KEIN RGB-Split. */
    monGlitch(dur = 1) { fx.brokenScreen(dur, ''); },

    /** Blitz von a nach b (gezackt, flackert, Seitenäste). opts: color, width (m), life (s), jag (Zackigkeit). */
    bolt(a, b, { color = '#9fe8ff', width = 0.35, life = 0.22, jag = 1 } = {}) {
      if (nofx) return;
      const bo = bolts[boltHead]; boltHead = (boltHead + 1) % MAX_BOLTS;
      bo.a.set(a.x, a.y, a.z); bo.b.set(b.x, b.y, b.z);
      bo.col.set(color); bo.width = width; bo.life = bo.max = life; bo.jag = jag; bo.rejag = 0;
      jagPath(bo); bo.mesh.visible = true;
    },
    /** Blitzeinschlag vom Himmel auf p (+ Schockring, kleiner Bildblitz). */
    strike(p, { color = '#9fe8ff', radius = 2.2, height = 22 } = {}) {
      if (nofx) return;
      fx.bolt({ x: p.x + (Math.random() - 0.5) * 3, y: p.y + height, z: p.z + (Math.random() - 0.5) * 3 }, p, { color, width: 0.55, life: 0.26, jag: 1.3 });
      fx.bolt({ x: p.x + (Math.random() - 0.5) * 5, y: p.y + height * 0.8, z: p.z + (Math.random() - 0.5) * 5 }, p, { color, width: 0.3, life: 0.16, jag: 1.6 });
      fx.ring(p, radius * 0.3, radius * 1.15, { color, life: 0.35 });
      fx.spark({ x: p.x, y: p.y + 0.6, z: p.z }, 18, '#d0f4ff', 7);
    },
    /** Kegelstrahl (Dampf/Wasser) von from nach to; erneuern, solange er läuft (key = Besitzer). */
    jet(key, from, to, { radius = 1.4, color = '#e8f0f4', life = 0.2, opacity = 0.7 } = {}) {
      if (nofx) return;
      let j = jets.get(key);
      if (!j) {
        const mesh = new THREE.Mesh(jetGeo, new THREE.MeshBasicMaterial({ map: jetTex, color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
        mesh.renderOrder = 3; scene.add(mesh);
        j = { mesh, life: 0, max: life, op: opacity }; jets.set(key, j);
      }
      _d.set(to.x - from.x, to.y - from.y, to.z - from.z);
      const len = _d.length() || 1;
      j.mesh.position.set(from.x, from.y, from.z);
      j.mesh.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
      j.mesh.scale.set(radius, len, radius);
      j.mesh.material.color.set(color);
      j.life = j.max = life; j.op = opacity; j.mesh.visible = true;
    },
    /** Sich ausbreitender Boden-Schockring (von r0 auf r1). */
    ring(p, r0, r1, { color = '#ffffff', life = 0.4 } = {}) {
      if (nofx) return;
      const r = rings[ringHead]; ringHead = (ringHead + 1) % rings.length;
      r.mesh.position.set(p.x, p.y + 0.12, p.z); r.mesh.material.color.set(color);
      r.r0 = r0; r.r1 = r1; r.life = r.max = life; r.mesh.visible = true;
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
      // Blitze: Flackern (neu zacken), ausblenden
      for (const bo of bolts) {
        if (bo.life <= 0) continue;
        bo.life -= dt;
        if (bo.life <= 0) { bo.mesh.visible = false; continue; }
        bo.rejag -= dt;
        if (bo.rejag <= 0) { bo.rejag = 0.045; jagPath(bo); }
        writeBolt(bo);
      }
      for (const j of jets.values()) {
        if (j.life <= 0) continue;
        j.life -= dt;
        if (j.life <= 0) { j.mesh.visible = false; continue; }
        j.mesh.material.opacity = j.op * Math.min(1, j.life / j.max * 3);
      }
      if (jetTex) jetTex.offset.y -= dt * 3.2;
      for (const r of rings) {
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        const k = 1 - r.life / r.max;
        r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)));
        r.mesh.material.opacity = 0.9 * (1 - k);
      }
      // shake
      if (shakeT > 0) {
        shakeT -= dt;
        const k = trauma * trauma;
        shakeOffset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k).multiplyScalar(0.9);
        trauma = Math.max(0, trauma - dt * 1.8);
      } else { shakeOffset.set(0, 0, 0); trauma = 0; }
      if (whiteT > 0) {
        whiteT -= dt;
        if (whiteT <= whiteTail) whiteEl?.classList.add('tail');
        if (whiteT <= 0) whiteEl?.classList.remove('on', 'tail');
      }
      if (brokenT > 0) { brokenT -= dt; if (brokenT <= 0) brokenEl?.classList.remove('on'); }
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
      for (const bo of bolts) { scene.remove(bo.mesh); bo.mesh.geometry.dispose(); bo.mesh.material.dispose(); }
      for (const j of jets.values()) { scene.remove(j.mesh); j.mesh.material.dispose(); }
      for (const r of rings) { scene.remove(r.mesh); r.mesh.material.dispose(); }
      jetGeo.dispose(); jetTex?.dispose();
      whiteEl?.remove(); whiteEl = null; brokenEl?.remove(); brokenEl = null;
      glEl?.remove(); glEl = null; document.body.classList.remove('glitch-mode');
      setSnapScale(1); setGlobalJitter(0);
      canvas?.classList.remove('glitch');
    },
  };
  return fx;
}
