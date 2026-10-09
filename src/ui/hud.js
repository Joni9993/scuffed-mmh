
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Compact HUD (GDD 10, max ~15 % of the screen). Everything is sized in vmin (see ui.css).
 * Call update(hunt) once per rendered frame; DOM is only touched when values change.
 */
export function createHud(root) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <div class="hud-tl">
      <div class="hud-name"></div>
      <div class="bar hp"><i class="bruise"></i><i class="fill"></i></div>
      <div class="bar st"><i class="fill"></i></div>
      <div class="bar wu"><i class="fill"></i></div>
      <div class="wstat"></div>
    </div>
    <div class="hud-party"></div>
    <div class="hud-tr">
      <div class="hud-timer">20:00</div>
      <div class="hud-ko">Umgekippt 0/3</div>
      <canvas class="mini ui-hit" width="64" height="64"></canvas>
    </div>
    <div class="lockmark"></div>
    <div class="hud-banner"></div>
    <div class="hud-center"></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const refs = {
    name: q('.hud-name'), bruise: q('.bruise'), hp: q('.hp .fill'), st: q('.st'), stFill: q('.st .fill'), wu: q('.wu'), wuFill: q('.wu .fill'),
    wstat: q('.wstat'), party: q('.hud-party'), timer: q('.hud-timer'), ko: q('.hud-ko'), mini: q('.mini'),
    banner: q('.hud-banner'), lock: q('.lockmark'), center: q('.hud-center'),
  };
  const g = refs.mini.getContext('2d');
  g.imageSmoothingEnabled = false;
  refs.mini.addEventListener('click', () => {
    refs.mini.classList.toggle('big');
    const big = refs.mini.classList.contains('big');
    refs.mini.width = refs.mini.height = big ? 128 : 64;
  });
  const cache = {};
  const set = (k, v, fn) => { if (cache[k] !== v) { cache[k] = v; fn(v); } };
  let bannerT = 0, centerT = 0;

  const api = {
    el,
    banner(text, secs = 3) { refs.banner.textContent = text; refs.banner.classList.add('show'); bannerT = secs; },
    center(text, secs = 2) { refs.center.textContent = text; refs.center.classList.add('show'); centerT = secs; },
    update(hunt, dt = 0.016) {
      const p = hunt.player;
      if (!p) return;
      const v = p.v;
      set('name', p.name, (x) => (refs.name.textContent = x));
      const hp = Math.round((v.hp / v.maxHp) * 200) / 2, br = Math.round(((v.hp + v.bruise) / v.maxHp) * 200) / 2;
      set('hp', hp, (x) => (refs.hp.style.width = x + '%'));
      set('br', br, (x) => (refs.bruise.style.width = x + '%'));
      const st = Math.round((v.stamina / v.maxStamina) * 100);
      set('st', st, (x) => (refs.stFill.style.width = x + '%'));
      set('stout', v.exhaust > 0, (x) => refs.st.classList.toggle('out', x));
      const wu = Math.round(p.weapon.wucht);
      set('wu', wu, (x) => (refs.wuFill.style.width = x + '%'));
      set('wufull', wu >= 100, (x) => refs.wu.classList.toggle('full', x));
      const stat = p.def.status?.(p.weapon);
      const sk = stat ? `${stat.text}|${stat.level}|${stat.max}|${stat.sauber}` : '';
      set('stat', sk, () => {
        if (!stat) { refs.wstat.innerHTML = ''; refs.wstat.classList.remove('sauber'); return; }
        const pips = stat.max ? Array.from({ length: stat.max }, (_, i) => `<b class="${i < stat.level ? 'on' : ''}"></b>`).join('') : '';
        refs.wstat.innerHTML = `${pips}<span>${stat.sauber ? 'Sauber!' : stat.text}</span>`;
        refs.wstat.classList.toggle('sauber', !!stat.sauber);
      });
      set('timer', mmss(Math.max(0, hunt.timeLeft)), (x) => (refs.timer.textContent = x));
      set('ko', hunt.teamKo, (x) => { refs.ko.textContent = `Umgekippt ${x}/3`; refs.ko.classList.toggle('bad', x >= 2); });
      const others = hunt.players.filter((o) => o !== p);
      set('party', others.map((o) => `${o.name}${Math.round(o.v.hp)}`).join(','), () => {
        refs.party.innerHTML = others.map((o) => `<div>${o.name} <small>${Math.round((o.v.hp / o.v.maxHp) * 100)}%</small></div>`).join('');
      });
      bannerT -= dt; if (bannerT <= 0) refs.banner.classList.remove('show');
      centerT -= dt; if (centerT <= 0) refs.center.classList.remove('show');
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

  function drawMinimap(hunt) {
    const w = hunt.world, p = hunt.player, S = refs.mini.width;
    const b = w.bounds;
    const sx = (x) => ((x - b.minX) / (b.maxX - b.minX)) * S, sz = (z) => (1 - (z - b.minZ) / (b.maxZ - b.minZ)) * S;
    g.fillStyle = '#16301a';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#2c4a22';
    for (const z of w.zones || []) {
      if (z.r) { g.beginPath(); g.arc(sx(z.x), sz(z.z), (z.r / (b.maxX - b.minX)) * S, 0, 6.3); g.fill(); }
    }
    const px = S > 64 ? 3 : 2;
    for (const m of hunt.monsters) {
      if (!m.alive) continue;
      if (m.minor) { if (!m.discovered && m.state === 'wander') continue; g.fillStyle = '#ff9a3a'; g.fillRect(sx(m.pos.x) - 1, sz(m.pos.z) - 1, px - 1, px - 1); continue; }
      if (m.discovered || m.state !== 'wander') {
        if (Math.floor(performance.now() / 300) % 2) { g.fillStyle = '#ff3b3b'; g.fillRect(sx(m.pos.x) - px, sz(m.pos.z) - px, px * 2, px * 2); }
      } else {
        g.fillStyle = '#f4f0d0'; g.font = `${S / 5}px monospace`; g.fillText('?', sx(hunt.world.monsterSpawns?.default?.x ?? 0) - S / 14, sz(hunt.world.monsterSpawns?.default?.z ?? 0) + S / 14);
      }
    }
    for (const o of hunt.players) {
      g.fillStyle = o === p ? '#5ad8ff' : '#7dff7d';
      g.fillRect(sx(o.pos.x) - px / 2, sz(o.pos.z) - px / 2, px, px);
      if (o === p) { g.fillRect(sx(o.pos.x) + Math.sin(o.rot) * px * 1.6 - 0.5, sz(o.pos.z) - Math.cos(o.rot) * px * 1.6 - 0.5, 1.5, 1.5); }
    }
  }
  return api;
}

