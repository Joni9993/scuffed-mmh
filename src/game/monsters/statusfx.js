// Brocken-Koerpersprache: Requisiten, die den Status am Koerper erzaehlen (kein Text).
// Sterne-Kranz = betaeubt, Atemwolken = erschoepft, Dampf = verbrueht, Blasen = vergiftet, Wolke am Kopf = Gestank, Rostflocken = verrostet.
// Alles lebt im (unskalierten) Monster-Root -> laeuft und dreht mit, Groesse per def.scale.
import * as THREE from 'three';

const STAR_GEO = (() => { const g = new THREE.OctahedronGeometry(0.2, 0); g.scale(1, 1, 0.35); return g; })();
const PUFF_GEO = new THREE.IcosahedronGeometry(0.5, 0);
const N_STARS = 4, N_PUFFS = 18;
const _v = new THREE.Vector3();

export class StatusFx {
  constructor(m) {
    this.m = m;
    this.k = Math.max(0.8, m.def.scale ?? 1);
    this.group = new THREE.Group();
    this.group.name = 'statusFx';
    this.starMat = new THREE.MeshBasicMaterial({ color: '#ffe14d', fog: false });
    this.stars = [];
    for (let i = 0; i < N_STARS; i++) {
      const s = new THREE.Mesh(STAR_GEO, this.starMat);
      s.visible = false; s.renderOrder = 3;
      this.group.add(s); this.stars.push(s);
    }
    this.puffs = [];
    for (let i = 0; i < N_PUFFS; i++) {
      const mesh = new THREE.Mesh(PUFF_GEO, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
      mesh.visible = false; mesh.renderOrder = 2;
      this.group.add(mesh);
      this.puffs.push({ mesh, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, op: 0.8 });
    }
    this.head = 0;
    this.starA = 0;
    this.acc = { breath: 0, scald: 0, poison: 0, stink: 0, rust: 0, drool: 0 };
    this.lastBr = 0;
    m.mesh.add(this.group);
  }

  /** Kopfposition im Root-Raum (Fallback: ueber dem Koerper). */
  _headLocal(out) {
    const m = this.m;
    if (m.nodes.head) { m.nodes.head.getWorldPosition(out); m.mesh.worldToLocal(out); }
    else out.set(0, (m.def.scale ?? 1) * 1.6, (m.def.scale ?? 1) * 0.8);
    return out;
  }

  puff(x, y, z, { color = '#ffffff', size = 1, vx = 0, vy = 1, vz = 0, life = 1, grow = 2.2, op = 0.75 } = {}) {
    if (this.m.ctx.fx?.nofx) return;
    const p = this.puffs[this.head]; this.head = (this.head + 1) % this.puffs.length;
    const k = this.k;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.set(color);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.vx = vx * k; p.vy = vy * k; p.vz = vz * k;
    p.s0 = size * k; p.s1 = size * k * grow; p.op = op;
    p.life = p.max = life;
    p.mesh.visible = true;
  }

  /** s: { stun, tired, breath (-1..1 Keuch-Takt), scald, poison, stink, rust, blind } */
  update(dt, s) {
    const m = this.m, k = this.k, acc = this.acc;
    const hd = this._headLocal(_v);

    // ---- Betaeubt: Sterne kreisen ueber dem Kopf
    const stun = !!s.stun;
    if (stun) this.starA += dt * 3.2;
    for (let i = 0; i < N_STARS; i++) {
      const st = this.stars[i];
      st.visible = stun;
      if (!stun) continue;
      const a = this.starA + (i / N_STARS) * Math.PI * 2;
      const r = 0.75 * k;
      st.position.set(hd.x + Math.cos(a) * r, hd.y + 0.7 * k + Math.sin(a * 2) * 0.12 * k, hd.z + Math.sin(a) * r);
      st.rotation.set(0, -a, this.starA * 4 + i);
      st.scale.setScalar(k * (0.9 + 0.25 * Math.sin(this.starA * 6 + i)));
    }

    // ---- Erschoepft: Atemwolke bei jedem Ausatmen + Sabberfaden
    if (s.tired) {
      const br = s.breath ?? 0;
      if (this.lastBr < 0.6 && br >= 0.6) this.puff(hd.x, hd.y - 0.1 * k, hd.z + 0.35 * k, { color: '#eef4ff', size: 0.9, vx: (Math.random() - 0.5) * 0.4, vy: 0.5, vz: 1.6, life: 0.9, grow: 2.8, op: 0.7 });
      this.lastBr = br;
      acc.drool += dt;
      if (acc.drool > 0.35) { acc.drool = 0; m.nodes.head?.getWorldPosition(_v); m.ctx.fx.spark({ x: _v.x, y: _v.y - 0.25 * k, z: _v.z }, 1, '#cfe6ff', 0.15); }
    } else this.lastBr = 0;

    // ---- Verbrueht: Dampf steigt vom ganzen Ruecken
    if (s.scald) {
      acc.scald += dt;
      while (acc.scald > 0.07) {
        acc.scald -= 0.07;
        const bx = (Math.random() - 0.5) * 1.6 * k, bz = (Math.random() - 0.6) * 2.0 * k;
        this.puff(bx, (1.1 + Math.random() * 0.5) * k, bz, { color: Math.random() < 0.5 ? '#ffd6e0' : '#ffffff', size: 0.6, vx: 0, vy: 2.2, vz: 0, life: 0.9, grow: 2.4, op: 0.7 });
      }
    } else acc.scald = 0;

    // ---- Gift: lila-gruene Blasen quellen aus dem Maul + Flanken
    if (s.poison) {
      acc.poison += dt;
      while (acc.poison > 0.18) {
        acc.poison -= 0.18;
        const mouth = Math.random() < 0.5;
        const x = mouth ? hd.x : (Math.random() - 0.5) * 1.4 * k, y = mouth ? hd.y - 0.2 * k : (0.6 + Math.random() * 0.8) * k, z = mouth ? hd.z + 0.2 * k : (Math.random() - 0.5) * 1.6 * k;
        this.puff(x, y, z, { color: Math.random() < 0.6 ? '#b04aff' : '#7dff3a', size: 0.35, vy: mouth ? -0.6 : 0.6, life: 0.8, grow: 1.5, op: 0.9 });
      }
    } else acc.poison = 0;

    // ---- Gestank: gruene Wolke klebt am Kopf
    if (s.stink) {
      acc.stink += dt;
      while (acc.stink > 0.1) {
        acc.stink -= 0.1;
        this.puff(hd.x + (Math.random() - 0.5) * 0.8 * k, hd.y + (Math.random() - 0.3) * 0.5 * k, hd.z + (Math.random() - 0.2) * 0.8 * k, { color: '#9ac040', size: 0.6, vy: 0.3, life: 0.8, grow: 2, op: 0.65 });
      }
    } else acc.stink = 0;

    // ---- Rost: orange Flocken rieseln ab
    if (s.rust) {
      acc.rust += dt;
      if (acc.rust > 0.12) {
        acc.rust = 0;
        _v.set((Math.random() - 0.5) * 1.6 * k, (0.8 + Math.random() * 0.8) * k, (Math.random() - 0.5) * 2 * k);
        m.mesh.localToWorld(_v);
        m.ctx.fx.spark(_v, 1, Math.random() < 0.5 ? '#c8661e' : '#7a3a14', 0.4);
      }
    }

    // ---- Puffs bewegen / ausblenden
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.mesh.visible = false; continue; }
      const u = 1 - p.life / p.max;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt;
      p.mesh.scale.setScalar(p.s0 + (p.s1 - p.s0) * u);
      p.mesh.material.opacity = p.op * (1 - u) * Math.min(1, u * 6 + 0.3);
    }
  }

  hideAll() {
    for (const s of this.stars) s.visible = false;
    for (const p of this.puffs) { p.life = 0; p.mesh.visible = false; }
  }
}
