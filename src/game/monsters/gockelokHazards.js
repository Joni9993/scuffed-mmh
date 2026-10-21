import * as THREE from 'three';
import { overlap, sphere, capsule } from '../hitbox.js';

// Arena-weite Stoerungen der wahren Form, gestapelt UEBER die normalen Angriffe.
// Alles ist eine reine Funktion von formTime + Augen-LP (beides per Snapshot synchron); Treffer loest
// jeder Client nur fuer seinen lokalen Pirscher auf (wie die Fehlkopien). Rollen-i-Frames greifen normal.
export const HAZ = {
  enrageAt: 180, warnAt: 150, // s im Auge: danach Speicherueberlauf (schneller, haerter, Zone eng)
  beamStart: 10, beamArm: 1.8, beamCycle: 8.5, beamFire: 2.8, beamIn: 4, beamOut: 27, beamR: .9, beamDmg: 70, beamCd: 1.2, beamSpin: .55, beamSpinEnrage: .8,
  shardStart: 16, shardArm: 1.35, shardSpeed: 7.5, shardTurn: 1.15, shardLife: 5, shardR: .8, shardDmg: 60,
  zoneMax: 27, zoneMin: 18, zoneEnrage: 14, zoneDmg: 30, zoneTick: .5,
};
export const eyeFrac = (m) => Math.max(0, Math.min(1, m.hp / (m.maxHp * (m.def.eyePool ?? .42))));
export const enraged = (m) => m.gockelForm === 'eye' && m.formTime >= HAZ.enrageAt;
export function beamCount(m) {
  if (m.gockelForm !== 'eye' || m.formTime < HAZ.beamStart) return 0;
  const f = eyeFrac(m);
  return (f > .66 ? 1 : f > .33 ? 2 : 3) + (enraged(m) ? 1 : 0);
}
export function zoneRadius(m) {
  if (enraged(m)) return HAZ.zoneEnrage;
  return HAZ.zoneMin + (HAZ.zoneMax - HAZ.zoneMin) * eyeFrac(m);
}
// Sweep cadence: a stable amber lane charges, sweeps briefly, then gives the arena a clear breathing window.
export function beamCycle(m) {
  const age=Math.max(0,m.formTime-HAZ.beamStart),cycle=Math.floor(age/HAZ.beamCycle),phase=age%HAZ.beamCycle;
  const active=m.formTime>=HAZ.beamStart && phase>=HAZ.beamArm && phase<HAZ.beamArm+HAZ.beamFire;
  return {active,visible:m.formTime>=HAZ.beamStart&&phase<HAZ.beamArm+HAZ.beamFire,
    charge:Math.min(1,phase/HAZ.beamArm),angle:cycle*1.1+Math.max(0,Math.min(HAZ.beamFire,phase-HAZ.beamArm))*(enraged(m)?HAZ.beamSpinEnrage:HAZ.beamSpin)};
}
const shardEvery = (m) => (enraged(m) ? 3.5 : eyeFrac(m) > .66 ? 9 : eyeFrac(m) > .33 ? 7 : 5);

function ensureVisuals(m, a) {
  if (a.hz || !m.ctx.scene) return a.hz ??= { beams: [], beamFills: [], ring: null, shell: null, shardGeo: null, shardMat: null };
  const hz = a.hz = { beams: [], beamFills: [] };
  const bm = new THREE.MeshBasicMaterial({ color: 0xff3d8b, transparent: true, opacity: .55 });
  const bg = new THREE.BoxGeometry(HAZ.beamR * 2, .25, HAZ.beamOut - HAZ.beamIn);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(bg, bm);b.name='Scanlinie';b.visible=false;a.group.add(b);hz.beams.push(b);
    const f=new THREE.Mesh(bg,new THREE.MeshBasicMaterial({color:0xffc26a,transparent:true,opacity:.55,depthWrite:false}));f.name='Scanlinie-Ladung';f.visible=false;a.group.add(f);hz.beamFills.push(f);
  }
  hz.ring = new THREE.Mesh(new THREE.TorusGeometry(1, .006, 4, 64), new THREE.MeshBasicMaterial({ color: 0xcd5bff }));
  hz.ring.rotation.x = Math.PI / 2; a.group.add(hz.ring);
  hz.shell = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), new THREE.MeshBasicMaterial({ color: 0x73f3ed, wireframe: true, transparent: true, opacity: .5 }));
  hz.shell.visible = false; a.group.add(hz.shell);
  hz.shardGeo = new THREE.OctahedronGeometry(.45, 0); hz.shardMat = new THREE.MeshBasicMaterial({ color: 0xff7ad9 });
  const keep = new THREE.Mesh(hz.shardGeo, hz.shardMat); keep.visible = false; a.group.add(keep); // traversal disposes the shared shard assets
  return hz;
}

export function inArena(m, p) {
  const a = m.eyeArena;
  return !!a && p.pos.y > a.y - 40 && Math.hypot(p.pos.x - a.center.x, p.pos.z - a.center.z) < 60;
}

export function tickHazards(m, dt) {
  const a = m.eyeArena;
  if (!a) return;
  const hz = ensureVisuals(m, a), c = a.center, on = m.alive && m.gockelForm === 'eye' && !m.ctx.result;
  const st = m.hazard ??= { beamN: 0, armT: 0, beamHit: {}, zoneT: {}, zoneR:HAZ.zoneMax, shardT: 3, shards: [], seed: 12345, warned: 0 };
  // Strahlen: gleichmaessig verteilt, drehen gemeinsam; nach jeder Anzahl-Aenderung 1,5 s harmlos sichtbar (Telegraph).
  const cadence=beamCycle(m),quiet=['grid','collapse'].includes(m.attack?.inst?.def.tell?.kind);
  const n = on && cadence.visible && !quiet ? beamCount(m) : 0;
  if (n !== st.beamN) { st.beamN = n; st.armT = HAZ.beamArm; }
  st.armT = Math.max(0, st.armT - dt);
  const base = cadence.angle;
  const beams = [];
  for (let i = 0; i < n; i++) beams.push(base + i * Math.PI * 2 / n);
  const active=cadence.active&&st.armT<=0;
  const charge=Math.min(cadence.charge,1-st.armT/HAZ.beamArm);
  // Exact player-centre capsule reach includes the hunter's 0.4 m collision radius.
  for(let i=0;i<4;i++){
    const key=m.id+':hazard:beam:'+i;
    if(i>=n){m.ctx.fx.clearMarker?.(key);continue;}
    const ang=beams[i],sx=Math.sin(ang),sz=Math.cos(ang);
    const ax=c.x+sx*HAZ.beamIn,az=c.z+sz*HAZ.beamIn,bx=c.x+sx*HAZ.beamOut,bz=c.z+sz*HAZ.beamOut;
    m.ctx.fx.attackMarker?.(key,{ax,az,bx,bz,x:(ax+bx)/2,z:(az+bz)/2,r:HAZ.beamR+.4},a.y,charge,active,'#ffc26a');
  }
  hz.beams.forEach((b, i) => {
    b.visible=i<n&&(!m.ctx.fx.attackMarker||active);if(i>=n)return;
    const ang = beams[i], mid = (HAZ.beamIn + HAZ.beamOut) / 2;
    b.position.set(c.x + Math.sin(ang) * mid, a.y + .15, c.z + Math.cos(ang) * mid); b.rotation.y = ang;
    b.material.color.set(active?'#ff526e':'#ffc26a');b.material.opacity=active?.72:.18;
    const fill=hz.beamFills[i];fill.visible=!active&&!m.ctx.fx.attackMarker;fill.position.copy(b.position);fill.position.y+=.02;fill.rotation.y=b.rotation.y;
    fill.scale.set(Math.max(.03,cadence.charge),1,1);
  });
  hz.beamFills.forEach((f,i)=>{if(i>=n)f.visible=false;
  });
  const desiredR=zoneRadius(m);
  st.zoneR=Math.max(desiredR,st.zoneR-dt*.7);const R=st.zoneR;
  if (hz.ring) { hz.ring.visible = on; hz.ring.scale.setScalar(R);hz.ring.material.color.set(m.ctx.players.some(p=>p.local&&p.alive&&inArena(m,p)&&Math.hypot(p.pos.x-c.x,p.pos.z-c.z)>R-.5)?'#ffad65':'#9776dc'); hz.ring.position.set(c.x, a.y + .1, c.z); }
  if (hz.shell) { hz.shell.visible = on && !!m.eyeShield; hz.shell.position.set(m.pos.x, m.pos.y + 2.2, m.pos.z); hz.shell.rotation.y += dt * 1.3; }
  if (on && st.warned < 1 && m.formTime >= HAZ.warnAt) { st.warned = 1; m.ctx.hud?.center('Das Auge überhitzt … 30 Sekunden bis zum Speicherüberlauf!', 3); }
  if (on && st.warned < 2 && m.formTime >= HAZ.enrageAt) { st.warned = 2; m.ctx.hud?.center('SPEICHERÜBERLAUF — das Auge rast!', 3); m.ctx.bus.emit('sfx', { name: 'heavy', pos: m.pos }); }

  const local = m.ctx.players.filter((p) => p.local && p.alive && inArena(m, p));
  // Splitter (lokal, je Pirscher): spawnen am Rand und lenken auf ihn ein.
  if (on && !quiet && m.formTime >= HAZ.shardStart && local.length) {
    st.shardT -= dt;
    if (st.shardT <= 0) {
      st.shardT = shardEvery(m);
      for (let k = 0; k < 2; k++) {
        st.seed = (st.seed * 1103515245 + 12345) % 2147483648;
        const ang = st.seed / 2147483648 * Math.PI * 2, p = local[k % local.length];
        const s = { x: c.x + Math.sin(ang) * 26, z: c.z + Math.cos(ang) * 26, yaw: ang + Math.PI, t: HAZ.shardLife + HAZ.shardArm, arm:HAZ.shardArm, p, key: `${m.id}:shard:${m.formTime.toFixed(2)}:${k}` };
        if (hz.shardGeo) {
          s.mesh=new THREE.Mesh(hz.shardGeo,hz.shardMat);a.group.add(s.mesh);
          s.tell=new THREE.Mesh(new THREE.RingGeometry(.55,.7,16),new THREE.MeshBasicMaterial({color:0xffc26a,side:THREE.DoubleSide,transparent:true,opacity:.7,depthWrite:false}));
          s.tell.rotation.x=-Math.PI/2;s.tell.name='Splitter-Ladung';a.group.add(s.tell);
        }
        st.shards.push(s);
      }
    }
  }
  for (const s of [...st.shards]) {
    s.t -= dt;
    s.arm=Math.max(0,s.arm-dt);
    const p = s.p, want = Math.atan2(p.pos.x - s.x, p.pos.z - s.z);
    let d = want - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    s.yaw += Math.max(-HAZ.shardTurn * dt, Math.min(HAZ.shardTurn * dt, d));
    if(s.arm<=0){s.x += Math.sin(s.yaw) * HAZ.shardSpeed * dt; s.z += Math.cos(s.yaw) * HAZ.shardSpeed * dt;}
    if(s.tell){s.tell.visible=s.arm>0;s.tell.position.set(s.x,a.y+.06,s.z);s.tell.scale.setScalar(.6+1.6*s.arm/HAZ.shardArm);}
    if (s.mesh) { s.mesh.position.set(s.x, a.y + 1, s.z); s.mesh.rotation.y += dt * 8; }
    let gone = s.t <= 0 || !on || !p.alive;
    if (!gone && s.arm<=0 && p.local && p.hitCapsules().some((h) => overlap(h, sphere(s.x, a.y + 1, s.z, HAZ.shardR)))) {
      p.takeHit({ dmg: HAZ.shardDmg * m.dmgMul, knock: 'flinch', key: s.key, sourcePos: { x: s.x, y: a.y, z: s.z }, attackId: 'gockelok_splitter', monster: m, noPerfect: true });
      gone = true; m.ctx.bus.emit('sfx', { name: 'heavy', pos: p.pos });
    }
    if (gone) { s.mesh?.removeFromParent();s.tell?.removeFromParent();s.tell?.geometry.dispose();s.tell?.material.dispose(); st.shards.splice(st.shards.indexOf(s), 1); }
  }
  if (!on) return;
  for (const p of local) {
    if (cadence.active && st.armT <= 0 && !quiet) {
      for (let i = 0; i < n; i++) {
        if ((st.beamHit[p.id+':'+i] ?? 0) > m.formTime) continue;
        const ang = beams[i], sx = Math.sin(ang), sz = Math.cos(ang);
        const shape = capsule({ x: c.x + sx * HAZ.beamIn, y: a.y + 1, z: c.z + sz * HAZ.beamIn }, { x: c.x + sx * HAZ.beamOut, y: a.y + 1, z: c.z + sz * HAZ.beamOut }, HAZ.beamR);
        if (p.hitCapsules().some((h) => overlap(h, shape))) {
          const r = p.takeHit({ dmg: HAZ.beamDmg * m.dmgMul, knock: 'flinch', key: `${m.id}:beam:${i}:${Math.floor(m.formTime / HAZ.beamCd)}`, sourcePos: { x: c.x, y: a.y, z: c.z }, attackId: 'gockelok_scanlinie', monster: m, noPerfect: true });
          if (r === 'hit' || r === 'block') st.beamHit[p.id+':'+i] = m.formTime + HAZ.beamCd;
        }
      }
    }
    // Schrumpfende Zone: ausserhalb frisst die Datenleere stetig LP.
    if (Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > R) {
      st.zoneT[p.id]=(st.zoneT[p.id]??.8)-dt;
      if (st.zoneT[p.id] <= 0) { st.zoneT[p.id] = HAZ.zoneTick; p.takeHit({ dmg: HAZ.zoneDmg * m.dmgMul, knock: 'none', key: `${m.id}:zone:${m.formTime.toFixed(2)}`, sourcePos: null, attackId: 'gockelok_datenleere', monster: m, noPerfect: true }); }
    } else st.zoneT[p.id] = .8;
  }
}

export function clearHazards(m) {
  for(let i=0;i<4;i++)m.ctx.fx.clearMarker?.(m.id+':hazard:beam:'+i);
  for (const s of m.hazard?.shards ?? []) {s.mesh?.removeFromParent();s.tell?.removeFromParent();s.tell?.geometry.dispose();s.tell?.material.dispose();}
  m.hazard = null;
}
