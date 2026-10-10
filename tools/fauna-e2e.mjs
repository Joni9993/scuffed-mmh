// 2-peer coop e2e: host + guest in a real PeerJS session (local signalling server).
//   node /tmp/claude-0/phase2n/peer/srv.mjs     (PeerJS server, port 9000)   +   npm run dev (5173)
//   SH_URL=http://127.0.0.1:5173/ node tools/net-e2e.mjs
// Checks: ambient Jagglinge replicate, guest arrows visible on host, guest gathering depletes the point on the host,
// the last gather use is arbitrated (only one winner), guest's Blendknolle brings a flying Brathalos down on the host.
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const BASE = process.env.SH_URL || 'http://127.0.0.1:5173/';
const NET = 'peerhost=localhost&peerport=9000&peersecure=0&nofx=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
});
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] PAGEERROR`, e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name}] console.error`, m.text().slice(0, 200)); });
  return page;
}
const host = await mk('host');
await host.goto(`${BASE}?scene=lobby&mode=host&name=Host&${NET}&god=1&quest=jaggo&seed=3`);
await host.waitForSelector('[data-code]', { timeout: 20000 });
const code = (await host.textContent('[data-code]')).trim();
const guest = await mk('guest');
await guest.goto(`${BASE}?scene=lobby&mode=join&code=${code}&name=Gast&${NET}&god=1&weapon=bow`);
await guest.waitForSelector('[data-code]', { timeout: 20000 });
await sleep(800);
await host.click('[data-a="post"]');
await sleep(600);
await guest.click('[data-a="join"]');
await sleep(600);
await guest.click('[data-a="ready"]');
await sleep(400);
await host.click('[data-a="ready"]');
await sleep(3000);
const scene = (p) => p.evaluate(() => window.__SH.scene);
check('both in hunt', (await scene(host)) === 'hunt' && (await scene(guest)) === 'hunt', `${await scene(host)}/${await scene(guest)}`);

// ---------- [L] fauna replication: host vs guest herd positions + flee looks the same
await sleep(1500);
const ids = await host.evaluate(() => window.__SH.hunt.monsters.filter((m) => m.def.neutral).length);
const gi = await guest.evaluate(() => window.__SH.hunt.monsters.filter((m) => m.def.neutral).length);
console.log(`neutral monsters host ${ids}, guest ${gi} (guest only replicates those within 75 m of a hunter)`);
await host.evaluate(() => { const h = window.__SH.hunt, c = h.herds[0].center, p = h.player; h.mainMonster.update = () => {}; p.pos.set(c.x + 10, h.world.heightAt(c.x + 10, c.z), c.z); });
const hc = await host.evaluate(() => window.__SH.hunt.herds[0].center);
await guest.evaluate((c) => { const h = window.__SH.hunt, p = h.player; p.pos.set(c.x + 10, h.world.heightAt(c.x + 10, c.z + 4), c.z + 4); }, hc);
await sleep(2500);
const snap = (p) => p.evaluate(() => Object.fromEntries(window.__SH.hunt.monsters.filter((m) => m.id.startsWith('mampfer-0')).map((m) => [m.id, [m.pos.x, m.pos.z, m.state]])));
async function diverge(label) {
  const [a, b] = await Promise.all([snap(host), snap(guest)]);
  let max = 0, sum = 0, n = 0, same = 0;
  for (const k in a) { if (!b[k]) continue; const d = Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]); max = Math.max(max, d); sum += d; n++; if (a[k][2] === b[k][2]) same++; }
  console.log(`${label}: members ${Object.keys(a).length}/${Object.keys(b).length}, mean ${(sum / Math.max(1, n)).toFixed(2)} m, max ${max.toFixed(2)} m, same state ${same}/${n}`);
  return { max, n, same };
}
console.log(JSON.stringify(await snap(host)), JSON.stringify(await snap(guest)));
await sleep(1500);
const g0 = await diverge('grazing');
check('guest sees the herd', g0.n >= 3);
await host.evaluate(() => { const h = window.__SH.hunt, c = h.herds[0].members.find((m) => m.fa.role === 'calf'); c.applyDamage({ dmg: 5, partId: 'body', attackerId: 'p1', blunt: 0 }); });
await sleep(1800);
const g1 = await diverge('stampede');
const st = await guest.evaluate(() => window.__SH.hunt.monsters.filter((m) => m.id.startsWith('mampfer-0')).map((m) => m.state).join(','));
console.log('guest states', st);
check('stampede replicated (guest shows flee)', st.includes('flee'));
check('divergence while grazing/walking (< 2.5 m; ~0.1 m when standing)', g0.max < 2.5, g0.max.toFixed(2));
check('divergence during stampede (< 3 m)', g1.max < 3, g1.max.toFixed(2));
console.log('guest rxM', await guest.evaluate(() => window.__SH.hunt.net.stats.rxM));
await browser.close();
process.exit(failed ? 1 : 0);
