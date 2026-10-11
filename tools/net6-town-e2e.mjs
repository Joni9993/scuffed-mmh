// 6-player e2e through the REAL hub/town flow (host: "Eigenes Rostnest", guests: join by code), distinct names/colours/weapons.
// Checks what is rendered: session.members, town remotes (distinct ids, visible, distinct positions), then questboard -> hunt:
// hunt.players, remote meshes in scene + moving, name tags.  Needs PeerJS server :9000 + vite :5173 (both 127.0.0.1).
//   SH_URL=http://127.0.0.1:5173/ node tools/net6-town-e2e.mjs
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const BASE = process.env.SH_URL || 'http://127.0.0.1:5173/';
const NET = 'peerhost=localhost&peerport=9000&peersecure=0&nofx=1&god=1&res=360';
const DEF = process.env.DEFCOL === '1'; // everybody keeps the default colour/weapon (typical real players) -> room must still show 6 distinct looks
const COLORS = DEF ? Array(6).fill('#5ad8ff') : ['#5ad8ff', '#ff6b6b', '#7dff7d', '#ffd84a', '#c08aff', '#ff9a3a'];
const WEAPONS = DEF ? Array(6).fill('gs') : ['gs', 'db', 'bow', 'kt', 'kk', 'ga'];
const NAMES = ['Host', 'Anna', 'Bert', 'Cleo', 'Dirk', 'Emma'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, errs = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
async function mk(i) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.addInitScript(([name, color, weapon]) => {
    try {
      const k = 'scuffedhunter.save.v1';
      if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ version: 2, name, nameSet: true, color, loadout: { weapon } }));
    } catch { /* ignore */ }
  }, [NAMES[i], COLORS[i], WEAPONS[i]]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log(`[${NAMES[i]}] PAGEERROR`, e.message); errs++; });
  return page;
}
const sh = (p, fn, arg) => p.evaluate(fn, arg);

const pages = [];
pages.push(await mk(0));
await pages[0].goto(`${BASE}?scene=hub&mode=host&${NET}&seed=3`);
await pages[0].waitForFunction(() => window.__SH?.town?.session?.code, null, { timeout: 30000 });
const code = await pages[0].evaluate(() => window.__SH.town.session.code);
console.log('room', code);
// guests join while others are mid-join (staggered 300 ms) like real players
for (let i = 1; i < 6; i++) {
  const g = await mk(i);
  pages.push(g);
  g.goto(`${BASE}?scene=hub&mode=join&code=${code}&${NET}`).catch(() => {});
  await sleep(Number(process.env.STAGGER ?? 300));
}
await Promise.all(pages.slice(1).map((g) => g.waitForFunction(() => window.__SH?.town?.session?.role === 'guest' && window.__SH.town.session.members.length > 0 && window.__SH.town.flow === 'town', null, { timeout: 40000 }).catch(() => console.log('guest join timeout'))));
// everybody walks to a different place in town so positions are distinct and updating
await Promise.all(pages.map((p, i) => p.evaluate((i) => window.__SH.town.teleport(-12 + i * 5, -8 + (i % 2) * 4), i)));
await sleep(3500);

const info = await Promise.all(pages.map((p) => p.evaluate(() => {
  const h = window.__SH.town, s = h.session;
  return { me: s.myId, members: s.members.map((m) => `${m.id}:${m.name}${m.you ? '*' : ''}`), colors: s.members.map((m) => m.colorIdx), remotes: h.remotes, flow: h.flow, myColor: h.player.gear?.color };
})));
for (let i = 0; i < 6; i++) {
  const x = info[i], ids = x.members.map((m) => m.split(':')[0]), names = x.members.map((m) => m.split(':')[1].replace('*', ''));
  const rid = x.remotes.map((r) => r.id);
  console.log(`      [${NAMES[i]}] me=${x.me} members=${x.members.join(',')} colors=${x.colors} remotes=${rid.join(',')}`);
  check(`town ${NAMES[i]}: 6 distinct member ids, own once`, new Set(ids).size === 6 && ids.filter((d) => d === x.me).length === 1 && x.members.filter((m) => m.endsWith('*')).length === 1);
  check(`town ${NAMES[i]}: 6 distinct names`, new Set(names).size === 6, names.join(','));
  check(`town ${NAMES[i]}: 5 distinct remotes, none = me`, new Set(rid).size === 5 && !rid.includes(x.me));
  check(`town ${NAMES[i]}: remotes visible, distinct positions`, x.remotes.every((r) => r.visible) && new Set(x.remotes.map((r) => r.x.toFixed(1) + ',' + r.z.toFixed(1))).size === 5, x.remotes.map((r) => `${r.id}@${r.x.toFixed(0)},${r.z.toFixed(0)}`).join(' '));
  check(`town ${NAMES[i]}: rendered colours (me + 5 remotes) all distinct`, new Set([x.myColor, ...x.remotes.map((r) => r.color)]).size === 6, [x.myColor, ...x.remotes.map((r) => r.color)].join(' '));
  check(`town ${NAMES[i]}: distinct colours`, new Set(x.colors).size === 6, x.colors.join(','));
}

// quest board: host posts, guests join + ready, host ready
await pages[0].evaluate(() => window.__SH.town.board.post('jaggo'));
await sleep(1500);
for (let i = 1; i < 6; i++) { const pid = await pages[i].evaluate(() => window.__SH.town.board.getPosted()[0]?.postId); await pages[i].evaluate((id) => window.__SH.town.board.join(id), pid); await sleep(250); }
await sleep(1000);
const bm = await Promise.all(pages.map((p) => p.evaluate(() => window.__SH.town.board.getPosted()[0]?.members.length)));
check('board: every page sees 6 members on the post', bm.every((n) => n === 6), bm.join(','));
for (let i = 1; i < 6; i++) { await pages[i].evaluate(() => window.__SH.town.board.setReady(true)); await sleep(200); }
await pages[0].evaluate(() => window.__SH.town.board.setReady(true));
let scenes = [];
for (let i = 0; i < 60; i++) { await sleep(1000); scenes = await Promise.all(pages.map((p) => p.evaluate(() => window.__SH.scene))); if (scenes.every((s) => s === 'hunt')) break; }
check('hunt: all 6 in hunt', scenes.every((s) => s === 'hunt'), scenes.join(','));
await sleep(4000);

const h1 = await Promise.all(pages.map((p) => p.evaluate(() => {
  const h = window.__SH.hunt;
  return h.players.map((q) => ({ id: q.id, name: q.name, local: q.local !== false, x: q.pos.x, z: q.pos.z, inScene: !!q.mesh.parent, vis: q.mesh.visible, tag: q.mesh.children.some((c) => c.isSprite), color: q.gear?.color, local: q.local !== false }));
})));
await Promise.all(pages.map((p) => p.evaluate(() => { const h = window.__SH.hunt; const me = h.players.find((q) => q.local !== false && q.id === h.net.myId) ?? h.players[0]; })));
// move every local player a bit so remotes must update
await Promise.all(pages.map((p, i) => p.evaluate((i) => { const h = window.__SH.hunt; const me = h.players.find((q) => q.id === h.net.myId); if (me) me.pos.x += 6 + i; }, i)));
await sleep(2500);
const h2 = await Promise.all(pages.map((p) => p.evaluate(() => window.__SH.hunt.players.map((q) => ({ id: q.id, x: q.pos.x, z: q.pos.z })))));
for (let i = 0; i < 6; i++) {
  const a = h1[i], ids = a.map((q) => q.id), names = a.map((q) => q.name);
  console.log(`      [${NAMES[i]}] hunt.players=${a.map((q) => q.id + ':' + q.name).join(',')}`);
  check(`hunt ${NAMES[i]}: 6 distinct players, names match`, new Set(ids).size === 6 && new Set(names).size === 6 && NAMES.every((n) => names.includes(n)), names.join(','));
  check(`hunt ${NAMES[i]}: all meshes in scene+visible+tag`, a.every((q) => q.inScene && q.vis && (q.local || q.tag)))
  check(`hunt ${NAMES[i]}: 6 distinct rendered colours`, new Set(a.map((q) => q.color)).size === 6, a.map((q) => q.color).join(' '));
  const moved = h2[i].filter((q, k) => Math.abs(q.x - a[k].x) > 3).map((q) => q.id);
  check(`hunt ${NAMES[i]}: all 6 positions updated (moved: ${moved.length})`, moved.length === 6, moved.join(','));
}
check('no pageerrors', errs === 0, String(errs));
await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
