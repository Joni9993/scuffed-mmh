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
await host.goto(`${BASE}?scene=lobby&mode=host&name=Host&${NET}&god=1&aggro=1&quest=brathalos&seed=3`);
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

// ---------- A. ambient Jagglinge replicate
await sleep(1500);
const jag = (p) => p.evaluate(() => window.__SH.hunt.monsters.filter((m) => m.def.id === 'jaggling').length);
const [jh, jg] = [await jag(host), await jag(guest)];
check('ambient Jagglinge spawned on host and replicated to guest', jh >= 8 && jg === jh, `host ${jh}, guest ${jg}`);

// quiet the arena: park the Brocken on the host, put both hunters at camp, no ambient fights
await host.evaluate(() => { const h = window.__SH.hunt; for (const m of h.monsters) if (m.def.id === 'jaggling') { m.update = () => {}; } });

// ---------- B. arrows
const wp = await guest.evaluate(() => window.__SH.hunt.player.weaponId);
check('guest holds the bow', wp === 'bow', wp);
await host.evaluate(() => { window.__SH.hunt.net.stats.arrowsMirrored = 0; });
for (let i = 0; i < 4; i++) {
  await guest.evaluate(() => {
    const h = window.__SH.hunt, m = h.mainMonster, p = h.player;
    p.pos.set(m.pos.x + 11, m.pos.y, m.pos.z);
    p.rot = -Math.PI / 2;
    window.__SH.press('attack', 60);
  });
  await sleep(500);
}
const mirrored = await host.evaluate(() => window.__SH.hunt.net.stats.arrowsMirrored ?? 0);
const hostArrows = await host.evaluate(() => window.__SH.hunt.projectiles.stats.spawned);
check('guest arrows are spawned (mirrored) on the host', mirrored >= 4, `mirrored ${mirrored}, host projectile spawns ${hostArrows}`);
const owner = await host.evaluate(() => { const l = window.__SH.hunt.projectiles.list.concat(window.__SH.hunt.projectiles.stuck); return l.length; });
console.log('      (live+stuck arrow objects on host:', owner, ')');

// ---------- C. gathering
const pts = await host.evaluate(() => window.__SH.hunt.world.gatherPoints.slice(0, 40).map((g) => ({ id: g.id, x: g.pos.x, y: g.pos.y, z: g.pos.z, u: g.usesLeft, mu: g.maxUses })));
const P = pts.find((g) => g.mu >= 2) ?? pts[0];
const stand = (page, dx, who) => page.evaluate(({ P, dx }) => { const p = window.__SH.hunt.player; p.pos.set(P.x + dx, P.y, P.z); p.rot = 0; }, { P, dx });
const lootSum = (page) => page.evaluate(() => { const i = window.__SH.hunt.inventory ?? window.__SH.hunt.meta.inv; return Object.values(i.loot).reduce((a, b) => a + b, 0); });
const uses = (page) => page.evaluate((id) => window.__SH.hunt.world.gatherPoints.find((g) => g.id === id).usesLeft, P.id);
await stand(guest, 0.6); await stand(host, 40);
await host.evaluate(() => window.__SH.hunt.net.stats.gathersGranted = 0);
const g0 = await lootSum(guest), u0 = await uses(host);
await guest.evaluate(() => window.__SH.press('context', 1300));
await sleep(2500);
const g1 = await lootSum(guest), uh = await uses(host), ug = await uses(guest);
check('guest gather: items granted to guest', g1 > g0, `loot ${g0} -> ${g1}`);
check('guest gather: point depleted on host', uh === u0 - 1, `host uses ${u0} -> ${uh}, guest ${ug}`);

// race for the last use
await host.evaluate((id) => window.__SH.hunt.world.setGatherState(id, 1), P.id);
await guest.evaluate((id) => window.__SH.hunt.world.setGatherState(id, 1), P.id);
await sleep(300);
await stand(guest, 0.6); await stand(host, -0.6);
await host.evaluate(() => { window.__SH.input.set('context', false, 'x'); });
const [hl0, gl0] = [await lootSum(host), await lootSum(guest)];
await Promise.all([host.evaluate(() => window.__SH.press('context', 1300)), guest.evaluate(() => window.__SH.press('context', 1300))]);
await sleep(3000);
const [hl1, gl1] = [await lootSum(host), await lootSum(guest)];
const winners = (hl1 > hl0 ? 1 : 0) + (gl1 > gl0 ? 1 : 0);
check('gather race: exactly one of two players got the last use', winners === 1, `host loot ${hl0}->${hl1}, guest loot ${gl0}->${gl1}`);
check('gather race: point empty everywhere', (await uses(host)) === 0 && (await uses(guest)) === 0);

// race again, host is 400 ms late -> the guest must win this time
await host.evaluate((id) => window.__SH.hunt.world.setGatherState(id, 1), P.id);
await guest.evaluate((id) => window.__SH.hunt.world.setGatherState(id, 1), P.id);
await sleep(300);
await stand(guest, 0.6); await stand(host, -0.6);
const [hl2, gl2] = [await lootSum(host), await lootSum(guest)];
await Promise.all([guest.evaluate(() => window.__SH.press('context', 1300)), sleep(400).then(() => host.evaluate(() => window.__SH.press('context', 1300)))]);
await sleep(3000);
const [hl3, gl3] = [await lootSum(host), await lootSum(guest)];
check('gather race (guest first): only the guest got the last use', gl3 > gl2 && hl3 === hl2, `host loot ${hl2}->${hl3}, guest loot ${gl2}->${gl3}`);

// ---------- D. Blendknolle thrown by the guest at a flying Brathalos
await host.evaluate(() => {
  const h = window.__SH.hunt, m = h.mainMonster;
  m.recover = 0; m.attack = null; m.setState('combat'); m.stunT = 0;
  m.beginAttack('brathalos_aufflug');
});
await sleep(3500);
const hs = () => host.evaluate(() => { const m = window.__SH.hunt.mainMonster; return `${m.state}/${m.air.toFixed(1)}`; });
const gsState = () => guest.evaluate(() => { const m = window.__SH.hunt.mainMonster; return `${m.state}/${m.air.toFixed(1)}`; });
const before = await hs();
check('brathalos is flying (host + guest view)', before.startsWith('fly') && (await gsState()).startsWith('fly'), `${before} guest ${await gsState()}`);
await guest.evaluate(() => {
  const h = window.__SH.hunt, m = h.mainMonster, p = h.player, inv = h.inventory ?? h.meta.inv;
  inv.add('blendknolle', 2);
  inv.select(inv.bar.indexOf('blendknolle'));
  p.pos.set(m.pos.x + 8, h.world.heightAt(m.pos.x + 8, m.pos.z), m.pos.z); // 8 m from the flier, locked on (throw range 6)
  p.lock = { monster: m, idx: 0 };
  p.state = 'free';
  window.__SH.press('item', 80);
});
let after = before;
for (let i = 0; i < 12 && !after.startsWith('fall'); i++) { await sleep(300); after = await hs(); }
check('guest Blendknolle brings the flying Brathalos down (host)', after.startsWith('fall') || after.startsWith('combat'), `host ${before} -> ${after}`);
await sleep(1200);
check('guest sees the fall too', ['fall', 'combat'].includes((await gsState()).split('/')[0]), await gsState());
const stunH = await host.evaluate(() => window.__SH.hunt.mainMonster.stunT);
check('Brathalos is helpless on the host after the fall', stunH > 0, `stunT ${stunH.toFixed(1)}`);

await browser.close();
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
