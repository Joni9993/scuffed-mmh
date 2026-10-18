import * as THREE from 'three';
import { MUTATORS, MUTATOR_SHORT } from '../data/mutators.js';
import { FOODS } from '../data/foods.js';
import { COLORS as BUFF_COLORS, SYMBOL as BUFF_SYMBOL, BUFF_NAME, BUFF as BUFF_CFG, buffKey } from '../game/buffs.js'; // [KK] Krachkiste-Buffs

/** [KK] kleine Buff-Symbole ▲■● (Stufe als Zahl, Restzeit als Balken) fuer HP-Leiste und Party-Liste */
export function buffIcons(p) {
  let h = '';
  for (const c of BUFF_COLORS) {
    const b = p?.buffs?.[c];
    if (!b || b.t <= 0) continue;
    h += `<i class="bf ${c}" title="${BUFF_NAME[c]} Stufe ${b.lvl}" style="--k:${Math.round(Math.min(1, b.t / BUFF_CFG.DUR) * 5) * 20}%">${BUFF_SYMBOL[c]}${b.lvl > 1 ? `<sup>${b.lvl}</sup>` : ''}</i>`;
  }
  return h;
}
const buffSig = (p) => `${buffKey(p)}:${BUFF_COLORS.map((c) => Math.round(Math.min(1, Math.max(0, p?.buffs?.[c]?.t ?? 0) / BUFF_CFG.DUR) * 5)).join('')}`;

const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Compact HUD (GDD 10, max ~15 % of the screen). Everything is sized in vmin (see ui.css).
 * Call update(hunt) once per rendered frame; DOM is only touched when values change.
 */
/** Minimap-Symbol eines entdeckten Grossmonsters: burrow (Gorgo eingegraben, auch auf Gaesten per Snapshot) oder dot. */
const escName = (n) => String(n ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); // Mitspieler-Namen kommen übers Netz

export const minimapIcon = (m) => (m?.burrowed ? 'burrow' : m?.def?.apexZones && m.state === 'fly' ? 'flight' : 'dot');

export function createHud(root) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div class="hud-tl">
      <div class="hud-name"></div>
      <div class="bar hp"><i class="bruise"></i><i class="fill"></i><i class="bonus"></i></div>
      <div class="bar st"><i class="fill"></i><i class="bonus"></i></div>
      <div class="hud-food"></div><!-- Essens-Buff (Koch / Grillsteak) -->
      <div class="bar wu"><i class="fill"></i></div>
      <div class="bar gl"><i class="fill"></i></div><!-- Glitch-Energie -->
      <div class="hud-glitch"><i class="fill"></i><span><b>GLITCH</b><b class="gt"></b></span></div>
      <div class="wstat"></div>
      <div class="hud-buffs"></div><!-- [KK] Krachkiste-Buffs -->
      <div class="hud-status"></div><!-- [M] -->
      <div class="hud-party"></div><!-- im Fluss unter allen Status-Zeilen: wächst mit, nie überlappend (bis 6 Pirscher) -->
    </div>
    <div class="hud-tr">
      <div class="hud-timer">20:00</div>
      <div class="hud-ko">Umgekippt 0/3</div>
      <div class="hud-mut" style="display:none"></div>
      <div class="hud-train" style="display:none;font:700 1.9vmin/1.35 monospace;color:#ffe9a0;text-shadow:0 0 3px #000,0 0 3px #000;text-align:right;white-space:nowrap"></div>
      <canvas class="mini ui-hit" width="64" height="64"></canvas>
    </div>
    <div class="hud-reload"><i class="win"></i><i class="cur"></i><b></b></div>
    <div class="lockmark"></div>
    <div class="hud-banner"></div>
    <div class="hud-zone"></div>
    <div class="hud-center"></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const refs = {
    name: q('.hud-name'), bruise: q('.bruise'), hp: q('.hp .fill'), hpBar: q('.bar.hp'), hpBonus: q('.bar.hp .bonus'), stBonus: q('.bar.st .bonus'), food: q('.hud-food'), st: q('.st'), stFill: q('.st .fill'), wu: q('.wu'), wuFill: q('.wu .fill'), gl: q('.bar.gl'), glFill: q('.bar.gl .fill'), glMode: q('.hud-glitch'), glModeFill: q('.hud-glitch .fill'), glTime: q('.hud-glitch .gt'),
    rel: q('.hud-reload'), wstat: q('.wstat'), buffs: q('.hud-buffs'), status: q('.hud-status'), party: q('.hud-party'), timer: q('.hud-timer'), ko: q('.hud-ko'), train: q('.hud-train'), mut: q('.hud-mut'), mini: q('.mini'),
    banner: q('.hud-banner'), lock: q('.lockmark'), center: q('.hud-center'), zone: q('.hud-zone'),
  };
  const g = refs.mini.getContext('2d');
  g.imageSmoothingEnabled = false;
  // [K] minimap: small (64 px) / enlarged overlay (240 px) on tap
  const MM_SMALL = 64, MM_BIG = 240;
  refs.mini.addEventListener('click', () => {
    refs.mini.classList.toggle('big');
    refs.mini.width = refs.mini.height = refs.mini.classList.contains('big') ? MM_BIG : MM_SMALL;
    g.imageSmoothingEnabled = false;
  });
  const cache = {};
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
  let bannerT = 0, centerT = 0, zoneT = 0, zoneShown = 0, zoneCand = 0, zoneCandT = 0; // [K] zone toast state

  const api = {
    el,
    banner(text, secs = 3) { refs.banner.classList.remove('mut'); refs.banner.textContent = text; refs.banner.classList.add('show'); bannerT = secs; },
    center(text, secs = 2, mon = false) { refs.center.classList.toggle('mon', !!mon); refs.center.textContent = text; refs.center.classList.add('show'); centerT = secs; },
    update(hunt, dt = 0.016) {
      const p = hunt.player;
      if (!p) return;
      const v = p.v;
      if (!cache.mutInit) { // aktive Mutatoren: dauerhaft klein + 3 s Banner beim Start
        cache.mutInit = true;
        const ids = hunt.mods?.ids ?? [];
        if (ids.length && !hunt.training) {
          refs.mut.style.display = '';
          refs.mut.innerHTML = ids.map((i) => `<b title="${MUTATORS[i]?.desc ?? ''}">${MUTATOR_SHORT[i] ?? MUTATORS[i]?.name ?? i}</b>`).join('');
          api.banner(`Mutatoren: ${ids.map((i) => MUTATORS[i]?.name ?? i).join(' + ')}`, 3);
          refs.banner.classList.add('mut');
        }
        hunt.bus?.on('mutfx', (e) => { // Speicherleck: Lock-Marke flackert gruen
          if (e.kind !== 'heal') return;
          refs.lock.classList.remove('mheal'); void refs.lock.offsetWidth; refs.lock.classList.add('mheal');
        });
      }
      set('name', p.name, (x) => (refs.name.textContent = x));
      const hp = Math.round((v.hp / v.maxHp) * 200) / 2, br = Math.round(((v.hp + v.bruise) / v.maxHp) * 200) / 2;
      set('hp', hp, (x) => (refs.hp.style.width = x + '%'));
      set('br', br, (x) => (refs.bruise.style.width = x + '%'));
      // Max-HP/-Puste sichtbar: Balken wird länger (Basis 100 = Standardbreite), Essens-Anteil am Ende goldgerahmt
      const baseHp = p._baseMaxHp ?? 100, baseSt = p._baseMaxStamina ?? 100;
      set('hpw', Math.round(Math.min(1.6, v.maxHp / baseHp) * 100), (x) => (refs.hpBar.style.width = x + '%'));
      set('stw', Math.round(Math.min(1.9, v.maxStamina / baseSt) * 85), (x) => (refs.st.style.width = x + '%'));
      set('hpb', Math.round(((p.foodHp ?? 0) / v.maxHp) * 1000) / 10, (x) => { refs.hpBonus.style.width = x + '%'; refs.hpBonus.style.display = x > 0 ? '' : 'none'; });
      set('stb', Math.round(((p.foodStamina ?? 0) / v.maxStamina) * 1000) / 10, (x) => { refs.stBonus.style.width = x + '%'; refs.stBonus.style.display = x > 0 ? '' : 'none'; });
      const meal = p.mealId ? (FOODS[p.mealId]?.name ?? '') : '', gc = p.grillCount ?? 0;
      set('food', `${meal}|${gc}`, () => {
        const parts = [meal && `${meal}`, gc && 'Grillsteak'].filter(Boolean);
        refs.food.style.visibility = parts.length ? 'visible' : 'hidden';
        refs.food.textContent = parts.length ? '◆ ' + parts.join(' · ') : '';
      });
      const st = Math.round((v.stamina / v.maxStamina) * 100);
      set('st', st, (x) => (refs.stFill.style.width = x + '%'));
      set('stout', v.exhaust > 0, (x) => refs.st.classList.toggle('out', x));
      const wu = Math.round(p.weapon.wucht);
      set('wu', wu, (x) => (refs.wuFill.style.width = x + '%'));
      set('wufull', wu >= 100, (x) => refs.wu.classList.toggle('full', x));
      const gs = p.glitch;
      if (gs) { // Glitch-Energie (Leiste) + Modus-Balken mit Restzeit
        const ge = Math.round(gs.energy);
        set('gl', ge, (x) => { refs.glFill.style.width = x + '%'; refs.gl.classList.toggle('full', x >= 100 && !gs.active); });
        set('glon', gs.active, (x) => { refs.glMode.classList.toggle('on', x); refs.gl.style.visibility = x ? 'hidden' : 'visible'; });
        if (gs.active) {
          set('glt', Math.ceil(gs.t * 10), (x) => { refs.glTime.textContent = (x / 10).toFixed(1) + 's'; refs.glModeFill.style.width = Math.max(0, (gs.t / 8) * 100).toFixed(0) + '%'; });
        }
      }
      set('buffs', buffSig(p), () => { refs.buffs.innerHTML = buffIcons(p); }); // [KK]
      const stat = p.def.status?.(p.weapon);
      const sk = stat ? `${stat.text}|${stat.level}|${stat.max}|${stat.sauber}|${stat.slots?.join('') ?? ''}` : '';
      // [LB] Nachlade-Balken (Mitte unten, klein): gelbes Fenster + Zeiger
      const rl = stat?.reload;
      set('rel', rl ? 1 : 0, (x) => refs.rel.classList.toggle('show', !!x));
      if (rl) {
        const r = refs.rel;
        r.firstChild.style.left = (rl.win[0] / rl.dur) * 100 + '%'; r.firstChild.style.width = ((rl.win[1] - rl.win[0]) / rl.dur) * 100 + '%';
        r.children[1].style.left = Math.min(100, (rl.t / rl.dur) * 100) + '%';
        r.classList.toggle('hot', !!rl.hot); r.classList.toggle('jam', !!rl.jam);
        r.lastChild.textContent = rl.hint ?? (rl.hot ? 'B!' : '');
      }
      set('stat', sk, () => {
        refs.wstat.classList.toggle('kk', !!stat?.slots); // [KK]
        if (!stat) { refs.wstat.innerHTML = ''; refs.wstat.classList.remove('sauber'); return; }
        if (stat.slots) { // [KK] Krachkiste: 3 Sample-Slots ▲■● in Zonen-Farbe (+ REMIX / Hinweis)
          refs.wstat.innerHTML = `<span class="kk-bar${stat.remix ? ' remix' : ''}">${stat.slots.map((c) => `<i class="kk-s ${c}">${BUFF_SYMBOL[c] ?? '·'}</i>`).join('')}</span><em class="kk-t">${stat.remix && !stat.sauber ? 'REMIX' : stat.text}</em>`;
          refs.wstat.classList.toggle('sauber', false);
          refs.wstat.classList.toggle('kk-sauber', !!stat.sauber);
          return;
        }
        refs.wstat.classList.remove('kk-sauber');
        const pips = stat.max ? Array.from({ length: stat.max }, (_, i) => `<b class="${i < stat.level ? 'on' : ''}"></b>`).join('') : '';
        refs.wstat.innerHTML = `${pips}<span>${stat.sauber ? 'Sauber!' : stat.text}</span>`;
        refs.wstat.classList.toggle('sauber', !!stat.sauber);
      });
      // [M] player status icons (Schlamm / Brennen / Gift), tiny
      const vc = p.voltCharge; // Voltiris: Ladung 0-3 (Blitz-Pips), Countdown = Entladung
      const stKeys = Object.keys(p.status || {}).concat(p.glitchT > 0 ? ['konter'] : [], vc?.n > 0 ? [vc.countdown > 0 ? 'voltx' : `volt${vc.n}`] : []).join(','); // [B] Glitch-Konter bonus ready (1.5 s)
      set('pstatus', stKeys, (x) => {
        const names = { fehlkopie: 'FEHLKOPIE • Abdruck verlassen', mud: 'Schlamm', burn: 'Brennt', poison: 'Gift', rost: 'Rost', blend: 'Geblendet', verwirrt: 'VERKEHRT!', itemlock: 'Item-Sperre', schleim: 'SCHLEIM! ROLLEN!', konter: 'Konter x1,5', volt1: '⚡◇◇', volt2: '⚡⚡◇', volt3: '⚡⚡⚡', voltx: 'ENTLADUNG! ROLLEN!' };
        refs.status.innerHTML = x ? x.split(',').map((k) => `<span class="st-${k.startsWith('volt') && k !== 'voltx' ? 'volt' : k}">${names[k] ?? k}</span>`).join('') : '';
      });
      if (hunt.training) { // Übungsplatz: kein Zeitlimit, keine KOs, dafür DPS + Combo
        set('timer', 'Übung', (x) => { refs.timer.textContent = x; refs.ko.style.display = 'none'; refs.train.style.display = ''; });
        const tr = hunt.train;
        set('train', `${tr.dps.toFixed(0)}|${tr.combo}|${tr.best}`, () => { refs.train.innerHTML = `Schaden letzte 10 s: ${tr.dps.toFixed(0)} / s<br>Combo-Treffer: ${tr.combo} (Best ${tr.best})`; });
      } else {
        set('timer', mmss(Math.max(0, hunt.timeLeft)), (x) => (refs.timer.textContent = x));
        set('ko', hunt.teamKo, (x) => { refs.ko.textContent = `Umgekippt ${x}/3`; refs.ko.classList.toggle('bad', x >= 2); });
      }
      const others = hunt.players.filter((o) => o !== p);
      set('party', others.map((o) => `${o.name}${Math.round(o.v.hp)}${buffSig(o)}`).join(','), () => { // [N] name + mini HP bar (+ [KK] Buff-Symbole)
        refs.party.innerHTML = others.map((o) => `<div><span class="pn">${escName(o.name)}</span><span class="party-bar"><b style="width:${Math.round((o.v.hp / o.v.maxHp) * 100)}%"></b></span>${buffIcons(o)}</div>`).join('');
      });
      bannerT -= dt; if (bannerT <= 0) refs.banner.classList.remove('show');
      centerT -= dt; if (centerT <= 0) refs.center.classList.remove('show');
      zoneToast(hunt, dt); // [K]
      bossArrows(hunt); // Multi-Jagd: Pfeil zum Brocken außerhalb des Bildes
      drawMinimap(hunt);
    },
    /** screen position in 0..1 or null */
    lock(pos) {
      if (!pos) { if (cache.lk) { cache.lk = false; refs.lock.style.display = 'none'; } return; }
      cache.lk = true;
      refs.lock.style.display = 'block';
      refs.lock.style.transform = `translate(${(pos.x * 100).toFixed(1)}vw,${(pos.y * 100).toFixed(1)}vh) translate(-50%,-50%)`;
    },
    dispose() { el.remove(); },
  };

  // ---------------------------------------------------------------- Multi-Jagd: Offscreen-Marker
  const _bv = new THREE.Vector3();
  const arrows = [];
  function bossArrows(hunt) {
    const list = hunt.bosses;
    if (!list || list.length < 2 || !hunt.camera) return;
    for (let i = 0; i < list.length; i++) {
      let a = arrows[i];
      if (!a) {
        a = arrows[i] = document.createElement('div');
        a.className = 'hud-boss-arrow';
        a.style.cssText = 'position:fixed;left:0;top:0;display:none;pointer-events:none;z-index:5;font:700 1.9vmin/1.1 monospace;color:#ff6a4a;text-shadow:0 0 3px #000,0 0 3px #000;text-align:center;white-space:nowrap';
        el.appendChild(a);
      }
      const m = list[i];
      if (!m.alive) { a.style.display = 'none'; continue; }
      _bv.set(m.pos.x, m.pos.y + 3, m.pos.z).project(hunt.camera);
      const behind = _bv.z > 1;
      let x = behind ? -_bv.x : _bv.x, y = behind ? -_bv.y : _bv.y;
      if (!behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.86) { a.style.display = 'none'; continue; }
      const k = 0.88 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
      x *= k; y *= k;
      const d = Math.round(Math.hypot(m.pos.x - hunt.player.pos.x, m.pos.z - hunt.player.pos.z));
      const ang = Math.atan2(x, y); // 0 = nach oben
      a.style.display = 'block';
      a.style.transform = `translate(${((0.5 + x * 0.5) * 100).toFixed(1)}vw,${((0.5 - y * 0.5) * 100).toFixed(1)}vh) translate(-50%,-50%)`;
      const txt = `<div style="transform:rotate(${ang.toFixed(2)}rad);font-size:3.2vmin">▲</div>${m.gockelForm === 'eye' ? 'Auge des Glitch' : m.def.name} ${d} m`;
      if (a._t !== txt) { a._t = txt; a.innerHTML = txt; }
    }
  }

  // ---------------------------------------------------------------- [K] zone toast + minimap
  function zoneToast(hunt, dt) {
    const w = hunt.world, p = hunt.player;
    if (!w.zoneAt || !p || (w.zones?.length ?? 0) < 2) return;
    const z = w.zoneAt(p.pos.x, p.pos.z);
    if (z !== zoneShown) {
      if (z !== zoneCand) { zoneCand = z; zoneCandT = 0; }
      zoneCandT += dt;
      if (zoneCandT > (zoneShown === 0 ? 0 : 0.35)) {
        zoneShown = z;
        refs.zone.textContent = `Zone ${z} – ${w.zoneName?.(z) ?? ''}`;
        refs.zone.classList.add('show');
        zoneT = 2.8;
      }
    } else zoneCand = z;
    zoneT -= dt; if (zoneT <= 0) refs.zone.classList.remove('show');
  }

  const mm = { base: null, world: null, seen: new Set(), first: new Map() };
  function baseMap(w) {
    if (mm.world === w) return mm.base;
    mm.world = w; mm.base = null; mm.seen.clear(); mm.first.clear();
    if (w.minimap) {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = w.minimap.size;
        c.getContext('2d').putImageData(new ImageData(w.minimap.data, w.minimap.size, w.minimap.size), 0, 0);
        mm.base = c;
      } catch { mm.base = null; }
    }
    return mm.base;
  }

  function drawMinimap(hunt) {
    const w = hunt.world, p = hunt.player, S = refs.mini.width, big = S > MM_SMALL;
    const b = w.bounds, span = b.maxX - b.minX;
    const sx = (x) => ((x - b.minX) / span) * S, sz = (z) => (1 - (z - b.minZ) / (b.maxZ - b.minZ)) * S;
    g.imageSmoothingEnabled = false;
    const base = baseMap(w);
    if (base) g.drawImage(base, 0, 0, S, S);
    else { // worlds without a precomputed map (test arena)
      g.fillStyle = '#16301a'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#2c4a22';
      for (const z of w.zones || []) if (z.r) { g.beginPath(); g.arc(sx(z.x), sz(z.z), (z.r / span) * S, 0, 6.3); g.fill(); }
    }
    // zone numbers
    if (base && w.zones?.length > 1) {
      g.font = `bold ${Math.round(S / (big ? 11 : 8))}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const z of w.zones) {
        const cx = sx(z.x), cz = sz(z.z);
        g.fillStyle = 'rgba(0,0,0,.7)'; g.fillText(String(z.id), cx + 1, cz + 1);
        g.fillStyle = '#f4f0d0'; g.fillText(String(z.id), cx, cz);
      }
    }
    // camp
    if (w.campPoint) { g.fillStyle = '#fff'; g.fillRect(Math.round(sx(w.campPoint.x)) - 1, Math.round(sz(w.campPoint.z)) - 1, big ? 4 : 3, big ? 4 : 3); g.fillStyle = '#c8553a'; g.fillRect(Math.round(sx(w.campPoint.x)), Math.round(sz(w.campPoint.z)), big ? 2 : 1, big ? 2 : 1); }
    const px = big ? 3 : 2;
    // monsters: icon only once discovered (seen within 30 m, or roared / aware)
    const blink = Math.floor(performance.now() / 300) % 2;
    for (const m of hunt.monsters) {
      if (!m.alive) continue;
      if (!mm.first.has(m)) mm.first.set(m, { x: m.pos.x, z: m.pos.z });
      const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
      if (d < 30 || m.discovered || (m.state && m.state !== 'wander' && m.state !== 'sleep')) mm.seen.add(m);
      if (mm.seen.has(m)) {
        if (m.minor) { if (d < 45 || m.discovered) { g.fillStyle = m.def.neutral ? '#9ae06a' : '#ff9a3a'; g.fillRect(sx(m.pos.x) - 1, sz(m.pos.z) - 1, px - 1, px - 1); } continue; }
        if (minimapIcon(m) === 'flight') {
          const x = sx(m.pos.x), y = sz(m.pos.z), wing = big ? 6 : 4;
          g.fillStyle = '#0a0d18'; g.beginPath(); g.arc(x, y, wing, 0, 6.3); g.fill();
          g.strokeStyle = '#d4eaff'; g.lineWidth = big ? 2 : 1;
          g.beginPath(); g.moveTo(x - wing, y - 2); g.lineTo(x, y + 1); g.lineTo(x + wing, y - 2); g.stroke();
          const a = m.attack;
          if (a?.id === 'apex_migration' && a.inst.sample(a.t).tau >= 3.85) {
            const to = a.inst.target;
            g.strokeStyle = '#ff4a35'; g.beginPath(); g.arc(sx(to.x), sz(to.z), Math.max(2, 7 / span * S), 0, 6.3); g.stroke();
          }
          continue;
        }
        if (minimapIcon(m) === 'burrow') { // Gorgo eingegraben: pulsierende orange Welle statt Brocken-Punkt
          const ph = (performance.now() / 900) % 1, cx = sx(m.pos.x), cy = sz(m.pos.z), rr = px + 1 + ph * (big ? 7 : 5);
          g.strokeStyle = `rgba(255,150,40,${(1 - ph).toFixed(2)})`; g.lineWidth = big ? 2 : 1;
          g.beginPath(); g.arc(cx, cy, rr, 0, 6.3); g.stroke();
          g.strokeStyle = '#ff8a2a'; g.beginPath(); g.arc(cx, cy, px, 0, 6.3); g.stroke();
          continue;
        }
        if (blink) { g.fillStyle = '#000'; g.fillRect(sx(m.pos.x) - px - 1, sz(m.pos.z) - px - 1, px * 2 + 2, px * 2 + 2); g.fillStyle = '#ff3b3b'; g.fillRect(sx(m.pos.x) - px, sz(m.pos.z) - px, px * 2, px * 2); }
      } else if (!m.minor && m === hunt.mainMonster) {
        const f = mm.first.get(m), zid = w.zoneAt?.(f.x, f.z), zc = w.zones?.find((z) => z.id === zid) ?? f;
        g.font = `bold ${Math.round(S / (big ? 7 : 5))}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#000'; g.fillText('?', sx(zc.x ?? f.x) + 1, sz(zc.z ?? f.z) + 1 + S / 12);
        g.fillStyle = '#f4f0d0'; g.fillText('?', sx(zc.x ?? f.x), sz(zc.z ?? f.z) + S / 12);
      }
    }
    // players: others are green dots, the local one is an arrow showing the facing direction
    for (const o of hunt.players) {
      if (o === p) continue;
      g.fillStyle = '#7dff7d'; g.fillRect(Math.round(sx(o.pos.x)) - 1, Math.round(sz(o.pos.z)) - 1, px, px);
    }
    const ax = sx(p.pos.x), az = sz(p.pos.z), dx = Math.sin(p.rot), dz = -Math.cos(p.rot), r = big ? 6 : 4;
    g.fillStyle = '#000';
    g.beginPath(); g.moveTo(ax + dx * (r + 1.5), az + dz * (r + 1.5)); g.lineTo(ax - dx * r * 0.7 - dz * (r * 0.8 + 1), az - dz * r * 0.7 + dx * (r * 0.8 + 1)); g.lineTo(ax - dx * r * 0.7 + dz * (r * 0.8 + 1), az - dz * r * 0.7 - dx * (r * 0.8 + 1)); g.closePath(); g.fill();
    g.fillStyle = '#5ad8ff';
    g.beginPath(); g.moveTo(ax + dx * r, az + dz * r); g.lineTo(ax - dx * r * 0.7 - dz * r * 0.8, az - dz * r * 0.7 + dx * r * 0.8); g.lineTo(ax - dx * r * 0.7 + dz * r * 0.8, az - dz * r * 0.7 - dx * r * 0.8); g.closePath(); g.fill();
  }
  return api;
}

