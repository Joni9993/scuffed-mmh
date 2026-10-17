// Voltiris Duellant-Screenshots: SH_URL=... node tools/voltiris-duel-shots.mjs  (VIEW=16 changes the camera distance)
import { open } from './pw-lib.mjs';
const out = 'docs/shots/voltiris-duel-';
// [name, attack, distance of the hunter, attack time to freeze at, phase, extra setup]
const scen = [
  ['blink-marker', 'blink', 16, .45, 0, ''],
  ['blitzraster-lanes', 'blitzraster', 16, 2.4, 0, ''],
  ['zickzack-hover', 'zickzacklaser', 18, .9, 1, ''],
  ['nachbilder', 'nachbildserie', 16, 1.6, 1, ''],
  ['kettenblitz', 'kettenblitz', 16, 1.1, 1, 'echo'],
  ['entladung-countdown', 'doppelblitz', 16, .4, 0, 'charge'],
  ['gewitterkaefig', 'gewitterkaefig', 14, 7, 2, ''],
];
const { browser, page, errors } = await open('scene=hunt&quest=voltiris&weapon=gs&god=1&res=640&seed=7&nofauna=1&noambient=1');
await page.evaluate(() => document.querySelector('.ob .go')?.click());
for (const [name, atk, dist, T, phase, extra] of scen) {
  const e0 = errors.length;
  const info = await page.evaluate(({ atk, dist, T, phase, extra, VIEW }) => {
    const sh = window.__SH, h = sh.hunt, m = h.mainMonster, p = h.player;
    sh.input.reset(); m._interrupt(); m.chainNext = null; m.queued = null; m.stagT = m.stunT = m.phaseT = 0; m.recover = 999;
    const home = (window.__voltHome ??= m.pos.clone()); m.pos.copy(home);
    const v = m.extra.volt; if (v) { v.echoes.length = 0; v.lanes.length = 0; v.cage = null; }
    m.setState('combat'); m.air = 0; m.rot = Math.PI; p.lock = null; m.hp = m.maxHp; m.phase = phase; m.cds = {};
    p.spawnAt(m.pos.x, m.pos.z - dist, 0); p.god = true; m.target = p;
    h.rig.snap(p.pos, 0); h.rig.pitch = 0.12; sh.step(12);
    if (extra === 'echo') { for (const k of [0, 1]) { m.recover = 0; m.beginAttack('voltiris_blink', { seed: 11 + k, tgMul: 1, tempoMul: 1 }); let g = 0; while (m.attack && g++ < 300) sh.step(1); m.pos.copy(home); } }
    const a = m.def.attacks['voltiris_' + atk]; if (!a) return 'missing attack ' + atk;
    m.recover = 999; m.beginAttack('voltiris_' + atk, { seed: 1337, tgMul: 1, tempoMul: 1, rage: false });
    let n = 0; while (m.attack && m.attack.t < T && n++ < 1800) { m.recover = 999; p.invuln = 99; sh.step(1); }
    if (extra === 'charge') { const c = (p.voltCharge ??= { n: 0, cd: 0, countdown: 0, ranged: 0, laneT: 0, wasRoll: false }); c.n = 3; c.countdown = .8; }
    p.spawnAt(m.pos.x, m.pos.z - VIEW, 0); h.rig.snap(p.pos, 0); h.rig.pitch = 0.12;
    h.hud.update(h, 2); sh.step(0);
    const vs = m.extra.volt;
    return `t=${m.attack?.t?.toFixed(2)} air=${m.air.toFixed(1)} frames=${n} boss=${m.pos.x.toFixed(1)},${m.pos.y.toFixed(1)},${m.pos.z.toFixed(1)} echoes=${vs?.echoes.length} lanes=${vs?.lanes.length} cage=${!!vs?.cage}`;
  }, { atk, dist, T, phase, extra, VIEW: +(process.env.VIEW ?? 16) });
  await page.screenshot({ path: out + name + '.png' });
  console.log(name, info, 'errors:', errors.slice(e0).map((s) => s.split('\n')[0]).join(' | ') || 'none');
}
console.log('total errors', errors.length, errors.join(' || ').slice(0, 600));
await browser.close();
