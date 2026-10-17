// Felsengroll Festungs-Moves Screenshots: SH_URL=... node tools/pyrostur-predator-shots.mjs
import { open } from './pw-lib.mjs';
const out = 'docs/shots/felsengroll-fortress-';
const scen = [
  ['saeulenbruch', 'saeulenbruch', 16, 1.6, 0],
  ['rollangriff', 'rollangriff', 18, 1.2, 0],
  ['stampfer-ring', 'stampfer', 14, 1.9, 0],
  ['schlackespucke', 'schlackespucke', 16, 2.2, 0],
  ['meteor-landung', 'meteor', 16, 2.6, 1],
  ['weltenbruch', 'weltenbruch', 18, 3.6, 2],
];
const { browser, page, errors } = await open('scene=hunt&quest=felsengroll&weapon=gs&god=1&res=640&seed=7&nofauna=1&noambient=1');
await page.evaluate(() => document.querySelector('.ob .go')?.click());
for (const [name, atk, dist, T, phase] of scen) {
  const e0 = errors.length;
  const info = await page.evaluate(({ atk, dist, T, phase, VIEW }) => {
    const sh = window.__SH, h = sh.hunt, m = h.mainMonster, p = h.player;
    sh.input.reset(); m._interrupt(); m.chainNext = null; m.queued = null; m.stagT = m.stunT = m.phaseT = 0; m.recover = 999;
    const home = (window.__pyroHome ??= m.pos.clone()); m.pos.copy(home); m.extra.hazards && (m.extra.hazards.scorch.length = m.extra.hazards.rings.length = 0);
    m.setState('combat'); m.air = 0; m.rot = Math.PI; p.lock = null; m.hp = m.maxHp; m.phase = phase;
    p.spawnAt(m.pos.x, m.pos.z - dist, 0); p.god = true; m.target = p;
    h.rig.snap(p.pos, 0); h.rig.pitch = 0.12; sh.step(12);
    const a = m.def.attacks['felsengroll_' + atk]; if (!a) return 'missing attack ' + atk;
    m.recover = 999; m.beginAttack('felsengroll_' + atk, { seed: 1337, tgMul: 1, tempoMul: 1, rage: false });
    let n = 0; while (m.attack && m.attack.t < T && n++ < 1200) { m.recover = 999; p.invuln = 99; sh.step(1); }
    // Frame from a fixed vantage behind the hunter's lane so dives/landings never swallow the camera.
    p.spawnAt(m.pos.x, m.pos.z - VIEW, 0); h.rig.snap(p.pos, 0); h.rig.pitch = 0.12;
    h.hud.update(h, 2); sh.step(0);
    return `t=${m.attack?.t?.toFixed(2)} air=${m.air.toFixed(1)} frames=${n} boss=${m.pos.x.toFixed(1)},${m.pos.y.toFixed(1)},${m.pos.z.toFixed(1)} cam=${p.pos.y.toFixed(1)} hz=${(m.extra.hazards?.scorch.length??0)}/${(m.extra.hazards?.rings.length??0)}`;
  }, { atk, dist, T, phase, VIEW: +(process.env.VIEW ?? 16) });
  await page.screenshot({ path: out + name + '.png' });
  console.log(name, info, 'errors:', errors.slice(e0).map((s) => s.split('\n')[0]).join(' | ') || 'none');
}
console.log('total errors', errors.length, errors.join(' || ').slice(0,600));
await browser.close();
