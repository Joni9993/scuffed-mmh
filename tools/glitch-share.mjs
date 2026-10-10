// Glitch-Anteil am Schaden über eine ganze Jagd (Bot hält Abstand zum Kopf, haut drauf, startet Glitch sobald bereit, rollt nie; god an).
//   SH_URL=... node tools/glitch-share.mjs [weapon=gs] [quest=jaggo]   Ziel GDD §16.2: 40–50 %
import { open } from './pw-lib.mjs';
const weapon = process.argv[2] || 'gs', quest = process.argv[3] || 'jaggo';
const { browser, page, errors } = await open(`scene=hunt&quest=${quest}&weapon=${weapon}&seed=4&god=1&aggro=1&nofx=1`);
const r = await page.evaluate((weapon) => {
  const SH = window.__SH, h = SH.hunt, p = h.player, m = h.mainMonster, inp = SH.input;
  let t = 0, act = 0, kills = false;
  const melee = weapon !== 'bow', dist = melee ? 2.4 : 11;
  for (let i = 0; i < 60 * 900 && m.alive; i++) {
    t += 1 / 60;
    if (p.state === 'free' && !p.weapon.busy) {
      const hd = m.lockPoints()[0].pos, dx = p.pos.x - hd.x, dz = p.pos.z - hd.z, d = Math.hypot(dx, dz) || 1;
      p.pos.x = hd.x + (dx / d) * dist; p.pos.z = hd.z + (dz / d) * dist; p.pos.y = h.world.heightAt(p.pos.x, p.pos.z);
      p.lock = { monster: m, idx: 0 };
    }
    const A = weapon === 'gs' ? (i % 90) < 60 : weapon === 'bow' ? (i % 40) < 25 : (i % 6) < 3;
    inp.set('attack', A, 'bot');
    const ready = p.glitch.energy >= 100 && !p.glitching;
    inp.set('glitch', ready, 'bot');
    if (ready) act++;
    SH.sim(1);
  }
  return { min: +(t / 60).toFixed(2), alive: m.alive, dmg: Math.round(h.stats.damage), glitch: Math.round(h.stats.glitchDmg), share: +(h.stats.glitchDmg / h.stats.damage * 100).toFixed(1), activations: act };
}, weapon);
console.log(weapon, quest, JSON.stringify(r), 'errors', errors.length);
await browser.close();
