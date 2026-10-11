// 6-player coop e2e: 1 host + 5 guests (+ 7th rejected). Needs PeerJS server on :9000 (bind 127.0.0.1) + vite on 5173.
//   SH_URL=http://127.0.0.1:5173/ node tools/net6-e2e.mjs      (RES=360 to lower resolution)
import { createRequire } from 'module';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');

const BASE = process.env.SH_URL || 'http://127.0.0.1:5173/';
const RES = process.env.RES || '360';
const NET = `peerhost=localhost&peerport=9000&peersecure=0&nofx=1&god=1&res=${RES}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) failed++; };

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
});
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log(`[${name}] PAGEERROR`, e.message); errs++; });
  return page;
}
let errs = 0;
const members = (p) => p.evaluate(() => { const h = [...document.querySelectorAll('h2')].find((e) => /Pirscher/.test(e.textContent)); const m = h?.textContent.match(/\((\d+)\//); return m ? +m[1] : -1; });
const scene = (p) => p.evaluate(() => window.__SH.scene);

const host = await mk('host');
await host.goto(`${BASE}?scene=lobby&mode=host&name=Host&${NET}&quest=brathalos&seed=3`);
await host.waitForSelector('[data-code]', { timeout: 30000 });
const code = (await host.textContent('[data-code]')).trim();
const guests = [];
for (let i = 1; i <= 5; i++) {
  const g = await mk('g' + i);
  await g.goto(`${BASE}?scene=lobby&mode=join&code=${code}&name=G${i}&${NET}`);
  await g.waitForSelector('[data-code]', { timeout: 30000 });
  guests.push(g);
}
await sleep(1500);
const counts = [await members(host), ...await Promise.all(guests.map(members))];
check('1: 6 in lobby (host+guests see 6/6)', counts.every((c) => c === 6), counts.join(','));

// 2: 7th rejected
const g7 = await mk('g7');
await g7.goto(`${BASE}?scene=lobby&mode=join&code=${code}&name=G7&${NET}`);
await sleep(4000);
const errTxt = await g7.evaluate(() => document.querySelector('.err')?.textContent ?? '');
const g7in = await g7.evaluate(() => !!document.querySelector('[data-code]'));
console.log('      7th err text:', JSON.stringify(errTxt));
check('2: 7th guest rejected (full)', !g7in && /voll|full/i.test(errTxt), `err="${errTxt}" inLobby=${g7in}`);
check('2b: host still 6', (await members(host)) === 6);
await g7.context().close();

// 3: quest + ready
await host.click('[data-a="post"]');
await sleep(1200);
for (const g of guests) { await g.click('[data-a="join"]'); await sleep(300); }
await sleep(800);
for (const g of guests) { await g.click('[data-a="ready"]'); await sleep(200); }
await sleep(500);
await host.click('[data-a="ready"]');
let scenes = [];
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  scenes = await Promise.all([host, ...guests].map(scene));
  if (scenes.every((s) => s === 'hunt')) break;
}
check('3: all 6 scene==hunt', scenes.every((s) => s === 'hunt'), scenes.join(','));
await sleep(2000);

// 4: players + coop hp
const all = [host, ...guests];
const np = await Promise.all(all.map((p) => p.evaluate(() => window.__SH.hunt?.players.length)));
check('4a: host hunt.players=6, each guest sees 6', np.every((n) => n === 6), np.join(','));
const mon = await Promise.all(all.map((p) => p.evaluate(() => { const m = window.__SH.hunt.mainMonster; return { mul: m.coopMul, max: m.maxHp, hp: m.hp }; })));
console.log('      monsters', JSON.stringify(mon));
check('4b: host coopMul===3.24', mon[0].mul === 3.24, `mul ${mon[0].mul}, maxHp ${mon[0].max}, base ${(mon[0].max / 3.24).toFixed(1)}`);
check('4c: guest maxHp/hp mirror host', mon.slice(1).every((m) => Math.abs(m.max - mon[0].max) < 1 && Math.abs(m.hp - mon[0].hp) < mon[0].max * 0.02), mon.slice(1).map((m) => `${m.max}/${m.hp.toFixed(0)}`).join(' '));

// 5: spawn spread
const pos = await host.evaluate(() => window.__SH.hunt.players.map((p) => [p.pos.x, p.pos.z]));
let minD = 1e9;
for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) minD = Math.min(minD, Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1]));
check('5: pairwise player distance > 1.5 m', pos.length === 6 && minD > 1.5, `min ${minD.toFixed(2)} m`);

// 6: run 10 s, bandwidth
const bytes0 = await host.evaluate(() => { const s = window.__SH.hunt.net?.stats ?? {}; return JSON.stringify(s); });
await sleep(10000);
const bytes1 = await host.evaluate(() => JSON.stringify(window.__SH.hunt.net?.stats ?? {}));
console.log('      host net.stats', bytes0, '->', bytes1);
const after = await Promise.all(all.map(scene));
check('6: 10 s run, no pageerror, still in hunt', errs === 0 && after.every((s) => s === 'hunt'), `errs ${errs}, ${after.join(',')}`);

await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
