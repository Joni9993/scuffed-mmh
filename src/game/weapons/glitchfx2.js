// Optik-Helfer fuer die Waffen-Glitches Spannbogen (Debug-Modus) und Katana (Desync-Schnitte).
// Alles wird pro Modus-Start EINMAL erzeugt/gepoolt (geteilte Geometrien + Materialien), pro Treffer entstehen keine Objekte.
import * as THREE from 'three';

// ---------------------------------------------------------------- Katana: Risse
export const MAX_CRACKS = 20;
let _crackGeo = null, _crackMat = null;
function crackGeo() { // gezackter Riss: drei duenne, gekreuzte Streifen in einer Geometrie
  if (_crackGeo) return _crackGeo;
  const quads = [[0, 0, 0.9, 0.05, 0.0], [0.2, 0.05, 0.6, 0.04, 1.1], [-0.15, -0.05, 0.7, 0.04, -0.9]];
  const pos = [];
  for (const [x, y, len, w, rot] of quads) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const pts = [[-len / 2, -w], [len / 2, -w], [len / 2, w], [-len / 2, -w], [len / 2, w], [-len / 2, w]];
    for (const [px, py] of pts) pos.push(x + px * c - py * s, y + px * s + py * c, 0);
  }
  _crackGeo = new THREE.BufferGeometry();
  _crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return _crackGeo;
}
function crackMat() {
  _crackMat ??= new THREE.MeshBasicMaterial({ color: 0xff1a2a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false, blending: THREE.AdditiveBlending });
  return _crackMat;
}

/** Pool aus `max` Riss-Meshes. spawn(node, local) haengt einen Riss am Node an, burst() laesst alle explodieren. */
export function createCrackPool(max = MAX_CRACKS) {
  const mat = crackMat();
  const items = [];
  for (let i = 0; i < max; i++) {
    const m = new THREE.Mesh(crackGeo(), mat);
    m.visible = false; m.renderOrder = 998; m.frustumCulled = false;
    items.push({ mesh: m, used: false, k: 1, seed: i * 1.7, boom: 0 });
  }
  return {
    items,
    spawn(node, local, scale = 1) {
      const it = items.find((x) => !x.used);
      if (!it || !node) return null;
      it.used = true; it.k = scale; it.boom = 0;
      it.mesh.position.set(local.x, local.y, local.z);
      it.mesh.rotation.set(0, 0, Math.random() * Math.PI);
      it.mesh.scale.setScalar(0.01);
      it.mesh.visible = true;
      node.add(it.mesh);
      return it;
    },
    /** Riss-Explosion: schnell aufblaehen und ausblenden (update raeumt auf). */
    burst() { for (const it of items) if (it.used) it.boom = 0.3; },
    update(time, dt) {
      mat.opacity = 0.55 + 0.45 * (Math.sin(time * 41) * Math.sin(time * 23) > -0.2 ? 1 : 0.2); // Flackern (ein Material fuer alle)
      for (const it of items) {
        if (!it.used) continue;
        const m = it.mesh;
        if (it.boom > 0) {
          it.boom -= dt;
          m.scale.setScalar(it.k * (1 + (0.3 - it.boom) * 14));
          if (it.boom <= 0) { it.used = false; m.visible = false; m.removeFromParent(); }
        } else {
          const pop = Math.min(1, (m.scale.x / it.k) + dt * 9);
          m.scale.setScalar(it.k * pop * (1 + 0.12 * Math.sin(time * 30 + it.seed)));
        }
      }
    },
    clear() { for (const it of items) { it.used = false; it.boom = 0; it.mesh.visible = false; it.mesh.removeFromParent(); } },
    count() { let n = 0; for (const x of items) if (x.used) n++; return n; },
  };
}

/** Zaehler-Sprites ueber dem Brocken (Canvas pro Sprite, Text nur bei Aenderung neu gemalt). */
export function createCounters(n = 3) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.6, 0.8, 1); sp.visible = false; sp.renderOrder = 999;
    list.push({ sp, cv, tex, text: '' });
  }
  return {
    list,
    set(slot, pos, text) {
      const c = list[slot];
      if (!c) return;
      c.sp.position.set(pos.x, pos.y, pos.z); c.sp.visible = true;
      if (c.text !== text) {
        c.text = text;
        const g = c.cv.getContext('2d');
        g.clearRect(0, 0, 128, 64);
        g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6; g.strokeStyle = '#300'; g.strokeText(text, 64, 32);
        g.fillStyle = '#ff3040'; g.fillText(text, 64, 32);
        c.tex.needsUpdate = true;
      }
    },
    hideFrom(slot) { for (let i = slot; i < list.length; i++) list[i].sp.visible = false; },
    dispose() { for (const c of list) { c.sp.removeFromParent(); c.tex.dispose(); c.sp.material.dispose(); } },
  };
}

// ---------------------------------------------------------------- Bogen: Debug-Welt
const GREEN = 0x39ff6a, LIME = 0xc8ff3a;
let _sphGeo = null;
/**
 * Debug-Optik: Wireframe-Toggle der Welt- und Brocken-Materialien, gruener Nebel/Hintergrund, Boden-Gitter um den Spieler,
 * Trefferzonen als Draht-Kugeln (Schwachstellen groesser + pulsierend). Alles gepoolt, keine Materialien pro Frame.
 */
export function createDebugWorld(ctx, { zones = 24 } = {}) {
  const scene = ctx.scene;
  _sphGeo ??= new THREE.SphereGeometry(1, 10, 6);
  const mats = [new THREE.MeshBasicMaterial({ color: GREEN, wireframe: true, transparent: true, opacity: 0.8, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: LIME, wireframe: true, transparent: true, opacity: 0.95, depthTest: false })];
  const spheres = [];
  const group = new THREE.Group(); group.visible = false;
  for (let i = 0; i < zones; i++) {
    const m = new THREE.Mesh(_sphGeo, mats[0]);
    m.visible = false; m.renderOrder = 997; m.frustumCulled = false;
    group.add(m); spheres.push(m);
  }
  const grid = new THREE.GridHelper(40, 40, GREEN, 0x1a8f3a);
  grid.material.transparent = true; grid.material.opacity = 0.55;
  group.add(grid);
  const saved = { wire: [], bg: null, fog: null };
  let on = false;
  const wireTargets = () => {
    const out = new Set();
    const add = (root) => root?.traverse?.((o) => { const m = o.material; if (m && !o.isSprite && !o.isLine && !o.isPoints && 'wireframe' in m) out.add(m); });
    add(ctx.world?.mesh);
    for (const mo of ctx.monsters ?? []) add(mo.mesh);
    return out;
  };
  return {
    group, spheres, get on() { return on; },
    start() {
      if (on) return;
      on = true;
      saved.wire = [];
      for (const m of wireTargets()) { saved.wire.push([m, m.wireframe]); m.wireframe = true; }
      if (scene?.background?.isColor) { saved.bg = scene.background.clone(); scene.background.setHex(0x021a0a); }
      if (scene?.fog) { saved.fog = scene.fog.color.clone(); scene.fog.color.setHex(0x031f0c); }
      scene?.add(group); group.visible = true;
    },
    stop() {
      if (!on) return;
      on = false;
      for (const [m, w] of saved.wire) m.wireframe = w;
      saved.wire = [];
      if (saved.bg) { scene.background.copy(saved.bg); saved.bg = null; }
      if (saved.fog) { scene.fog.color.copy(saved.fog); saved.fog = null; }
      group.visible = false; group.removeFromParent();
      for (const s of spheres) s.visible = false;
    },
    /** pro Frame: Gitter folgt dem Spieler, Zonen-Kugeln folgen den Hurtboxen. */
    update(p, time) {
      if (!on) return;
      const gy = (ctx.world?.heightAt?.(p.pos.x, p.pos.z) ?? p.pos.y) + 0.06;
      grid.position.set(Math.round(p.pos.x), gy, Math.round(p.pos.z)); // gerastet, damit das Gitter nicht schwimmt
      let n = 0;
      for (const mo of ctx.monsters ?? []) {
        if (!mo.alive || !mo.hurtParts) continue;
        for (const hp of mo.hurtParts()) {
          if (n >= spheres.length) break;
          const s = spheres[n++], weak = hp.part.factor >= 0.9;
          s.visible = true;
          s.material = weak ? mats[1] : mats[0];
          const k = weak ? 1.3 + 0.22 * Math.sin(time * 9) : 1;
          s.position.set(hp.sphere.x, hp.sphere.y, hp.sphere.z);
          s.scale.setScalar(hp.sphere.r * k);
        }
      }
      for (let i = n; i < spheres.length; i++) spheres[i].visible = false;
    },
    dispose() { this.stop(); mats.forEach((m) => m.dispose()); grid.geometry.dispose(); grid.material.dispose(); },
  };
}
