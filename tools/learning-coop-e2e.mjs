// PW_MODULE may point at a bundled Playwright package; PW_CHROMIUM at its browser binary.
// node tools/learning-coop-e2e.mjs [output directory]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_MODULE || '/opt/node-tools/node_modules/playwright');
const out = resolve(process.argv[2] || 'docs/shots/learning-coop'); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], results = [];
const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
page.on('pageerror', e => errors.push(e.stack));
const base = process.env.SH_URL || 'http://127.0.0.1:5173/';
const check = (name, pass, info) => { results.push({ name, pass: !!pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, info ?? ''); };
await page.goto(base + '?scene=hunt&quest=training&weapon=gs&nofx=1&res=640');
await page.waitForSelector('.school-menu');
await page.evaluate(() => window.__SH.pause(true));
await page.screenshot({ path: join(out, '01-waffenschule.png') });
check('all seven practice weapons are available', await page.locator('[data-school-weapon]').count() === 7);
const saveBefore = await page.evaluate(() => window.__SH.save.exportCode());
for (const id of ['gs', 'db', 'bow', 'kt', 'kk', 'ga', 'lb']) {
  if (!(await page.locator('.school-menu').count())) await page.locator('[data-school="open"]').click();
  await page.locator(`[data-school-weapon="${id}"]`).click();
  await page.locator('[data-school-step="0"]').click();
  const r = await page.evaluate(() => {
    const S = window.__SH, h = S.hunt, p = S.player;
    S.press('lock', 50); S.step(10);
    return { weapon: p.weaponId, locked: !!p.lock, complete: h.school.progress.done, full: p.weapon.wucht };
  });
  check(`${id}: switching, positioning and actual lock complete first lesson`, r.weapon === id && r.locked && r.complete && r.full < 100, r);
  await page.locator('[data-school="open"]').click();
  const finIndex = await page.evaluate(id => import('/src/data/weaponLessons.js').then(m => m.WEAPON_LESSONS[id].steps.findIndex(s => s.wucht)), id);
  await page.locator(`[data-school-step="${finIndex}"]`).click();
  const fin = await page.evaluate(id => {
    const S = window.__SH; S.press('B', ['gs', 'bow'].includes(id) ? 100 : 400); S.step(70);
    return { complete: S.hunt.school.progress.done, move: S.player.weapon.moveId };
  }, id);
  check(`${id}: real input performs taught finisher`, fin.complete, fin);
}
// Every remaining course objective is exercised with actual input / the live weapon state.
for (const id of ['gs', 'db', 'bow', 'kt', 'kk', 'ga', 'lb']) {
  const steps = await page.evaluate(id => import('/src/data/weaponLessons.js').then(m => m.WEAPON_LESSONS[id].steps.map((s, i) => ({ id: s.id, i }))), id);
  for (const s of steps.filter(s => !['lock', 'finisher', 'counter', 'reload'].includes(s.id))) {
    if (!(await page.locator('.school-menu').count())) await page.locator('[data-school="open"]').click();
    await page.locator(`[data-school-weapon="${id}"]`).click(); await page.locator(`[data-school-step="${s.i}"]`).click();
    const r = await page.evaluate(({ id, step }) => {
      const S = window.__SH, h = S.hunt, p = S.player;
      p.lock = { monster: h.mainMonster, idx: 0 };
      const sim = n => { S.sim(n); h.render(); };
      const tap = (key, n = 40) => { S.press(key, 70); sim(n); };
      const hold = (key, n) => { S.input.set(key === 'A' ? 'attack' : 'special', true, 'dbg'); sim(n); S.input.set(key === 'A' ? 'attack' : 'special', false, 'dbg'); sim(2); };
      if (step === 'evade' || step === 'guard') {
        if (step === 'guard') S.input.set('special', true, 'dbg');
        let triggered = false;
        for (let i = 0; i < 900 && !h.school.progress.done; i++) {
          const text = document.querySelector('.school-signal')?.textContent ?? '';
          if (step === 'evade' && text.includes('JETZT') && !triggered) { S.press('roll', 50); triggered = true; }
          if (!text.includes('JETZT')) triggered = false;
          S.sim(1); h.render();
        }
        S.input.set('special', false, 'dbg');
      } else if (step === 'glitch') {
        tap('glitch', 20);
        for (let i = 0; i < 30 && !h.school.progress.done; i++) { if (id === 'gs') hold('A', 15); else tap('A', 18); }
      } else if (step === 'charge' || step === 'draw' && id === 'kt') {
        S.input.set('attack', true, 'dbg');
        for (let i = 0; i < 180 && !p.weapon.sauberOpen; i++) S.sim(1);
        S.input.set('attack', false, 'dbg'); sim(100);
      } else if (step === 'draw' && id === 'bow') { hold('A', 68); sim(60); hold('A', 68); sim(60); }
      else if (step === 'dodgeDraw' || step === 'jump' || step === 'hop') {
        // Aim the follow-up from its real post-roll position, then close the distance again if needed.
        S.press('roll', 50); sim(30);
        p.spawnAt(h.mainMonster.pos.x, h.mainMonster.pos.z - (id === 'bow' || id === 'lb' ? 10 : 2.5), 0);
        if (id === 'bow') hold('A', 30); else tap('A', 60);
      } else if (step === 'tackle') { tap('B', 20); hold('A', 22); sim(70); }
      else if (step === 'switch') {
        for (let i = 0; i < 300 && !p.weapon.data.blitzT; i++) S.sim(1);
        tap('B', 60);
      } else if (step === 'play') { for (let i = 0; i < 6; i++) tap('A', 40); tap('B', 100); }
      else if (step === 'mine') tap('B', 60);
      else if (step === 'shots') { hold('A', 160); sim(30); }
      else if (step === 'sword' || step === 'discharge') {
        for (let i = 0; i < 10 && (p.weapon.data.druck ?? 0) < 30; i++) tap('A', 43);
        tap('B', 44);
        if (step === 'discharge') { hold('B', 35); sim(100); } else for (let i = 0; i < 8 && !h.school.progress.done; i++) tap('A', 35);
      } else {
        if (step === 'rage') tap('B', 30);
        for (let i = 0; i < 30 && !h.school.progress.done; i++) tap('A', ['db', 'kt'].includes(id) ? 22 : 40);
      }
      return { complete: h.school.progress.done, count: h.school.progress.count, move: p.weapon.moveId, mode: p.weapon.data.mode, pos: [p.pos.x, p.pos.z] };
    }, { id, step: s.id });
    check(`${id}/${s.id}: actual technique completes objective`, r.complete, r);
  }
}
check('practice leaves saved equipment and inventory untouched', await page.evaluate(() => window.__SH.save.exportCode()) === saveBefore);
// A real timed counter, then clean reload: no synthetic success event is injected.
await page.locator('[data-school="open"]').click(); await page.locator('[data-school-weapon="kt"]').click();
const ctr = await page.evaluate(() => import('/src/data/weaponLessons.js').then(m => m.WEAPON_LESSONS.kt.steps.findIndex(s => s.id === 'counter')));
await page.locator(`[data-school-step="${ctr}"]`).click();
const counter = await page.evaluate(() => {
  const S = window.__SH; let fired = false;
  for (let i = 0; i < 900 && !S.hunt.school.progress.done; i++) {
    const text = document.querySelector('.school-signal')?.textContent ?? '';
    if (text.includes('JETZT') && !fired) { S.press('B', 70); fired = true; }
    if (!text.includes('JETZT')) fired = false;
    S.step(1);
  }
  return { done: S.hunt.school.progress.done, count: S.hunt.school.progress.count, schliff: S.player.weapon.data.schliff };
});
check('two correctly timed real Katana counters complete lesson', counter.done && counter.schliff >= 2, counter);
await page.screenshot({ path: join(out, '02-katana-konter.png') });
await page.locator('[data-school="open"]').click(); await page.locator('[data-school-weapon="lb"]').click();
const reloadIdx = await page.evaluate(() => import('/src/data/weaponLessons.js').then(m => m.WEAPON_LESSONS.lb.steps.findIndex(s => s.id === 'reload')));
await page.locator(`[data-school-step="${reloadIdx}"]`).click();
const reload = await page.evaluate(() => {
  const S = window.__SH; S.press('A', 4000); S.step(260);
  S.input.set('attack', false, 'dbg'); S.step(4);
  for (let i = 0; i < 500 && !S.hunt.school.progress.done; i++) {
    const d = S.player.weapon.data;
    if (d.rel?.kind === 'reload' && d.rel.t >= .46 && d.rel.t < .56) S.press('A', 50);
    else if (!d.rel && !S.player.weapon.busy) S.press('A', 40);
    S.step(1);
  }
  return { done: S.hunt.school.progress.done, clean: S.player.weapon.data.sauberMag };
});
check('real fresh A press in reload window completes Ratterbüchse lesson', reload.done && reload.clean, reload);
await page.screenshot({ path: join(out, '03-ratterbuechse.png') });
// Use two independent HuntNet instances and a serialized event transport (same browser,
// no signalling service dependency). This exercises the actual guest-hit/host-event path.
const coop = await page.evaluate(async () => {
  const { HuntNet } = await import('/src/net/sync.js');
  const { createTeamplay } = await import('/src/game/teamplay.js');
  const { createBus } = await import('/src/core/events.js');
  const { MSG, encodeHit } = await import('/src/net/protocol.js');
  const S = window.__SH; S.goto('hunt', { quest: 'barrotz', weapon: 'gs', world: 'arena', nofx: true, noFauna: true, noAmbient: true, god: true, seed: 1 }); S.pause(true);
  const host = S.hunt; host.meta.onboarding?.close(); host.player.name = 'Mara';
  const listeners = {}, guestListeners = {}, delivered = [];
  const guest = { time: 0, players: [{ id: 'guest', name: 'Ben', alive: true, pos: { x: 0, z: 0 }, glitch: { energy: 0 } }], player: null, monsters: [], bus: createBus(), net: { isGuest: true } };
  guest.player = guest.players[0]; guest.teamplay = createTeamplay(guest);
  const guestTransport = { isHost: false, myId: 'guest', hostId: host.player.id, on(t, fn) { guestListeners[t] = fn; return () => {}; }, onLeave() {}, onLost() {}, sendAll() {}, sendHost() {}, dispose() {} };
  guest.net = new HuntNet(guest, guestTransport, { players: [] });
  const transport = { isHost: true, myId: host.player.id, hostId: host.player.id,
    on(t, fn) { listeners[t] = fn; return () => {}; }, onLeave() {}, onLost() {}, rttOf() { return 0; },
    sendAll(t, d) { delivered.push(JSON.parse(JSON.stringify({ t, d }))); if (t === MSG.EV) guestListeners[MSG.EV]?.(JSON.parse(JSON.stringify(d)), host.player.id); }, sendHost() {}, dispose() {},
  };
  host.net = new HuntNet(host, transport, { players: [{ id: 'guest', name: 'Ben', weapon: 'gs', slot: 1 }] });
  const m = host.mainMonster; host.time = 20; m.partById.tail.hp = 10;
  // Guest breaks the tail through the real network hit handler. Host follows up.
  listeners[MSG.HIT](encodeHit(m.id, { dmg: 15, partId: 'tail' }, 'guest', 101), 'guest');
  host.playerHit(host.player, m, m.hurtParts().find(p => p.part.id === 'head'), { hit: { mv: 200, wucht: 0, hitstop: 'none' } });
  host.player.lock = { monster: m, idx: 0 }; S.step(1); host.render();
  guestListeners[MSG.EV]({ k: 'teamEvent', event: { type: 'moment', id: 9999, title: 'Forged' } }, 'intruder');
  return { host: host.teamplay.summary(), guest: guest.teamplay.summary(), broken: m.partById.tail.broken, messages: delivered.filter(e => e.d.k === 'teamEvent').length };
});
check('guest break is credited and host follow-up shared identically', coop.broken && coop.host.length >= 1 && JSON.stringify(coop.host) === JSON.stringify(coop.guest), coop);
await page.screenshot({ path: join(out, '04-koop-vorlage.png') });
await page.setViewportSize({ width: 1280, height: 720 });
await page.screenshot({ path: join(out, '05-koop-desktop.png') });
check('no browser runtime errors', errors.length === 0, errors);
console.log(JSON.stringify(results, null, 2));
await browser.close();
if (results.some(r => !r.pass)) process.exitCode = 1;
