// Waffen-Glitch-Optik mit Treffern: SH_URL=... node tools/glitch-shot2.mjs [bow|kt] out.png
import { open } from './pw-lib.mjs';
const weapon = process.argv[2] || 'bow';
const { browser, page, errors } = await open(`scene=hunt&quest=jaggo&god=1&seed=2&weapon=${weapon}`);
await page.evaluate(() => document.querySelector('[data-a="ok"]')?.click());
const r = await page.evaluate((weapon) => {
  const SH = window.__SH, h = SH.hunt, p = h.player, m = h.mainMonster, inp = SH.input;
  m.update = () => {}; m.hp = m.maxHp = 1e7;
  const dist = weapon === 'bow' ? 9 : 2.4;
  const hd = m.lockPoints()[0].pos, dx = p.pos.x - hd.x, dz = p.pos.z - hd.z, d = Math.hypot(dx, dz) || 1;
  p.pos.x = hd.x + (dx / d) * dist; p.pos.z = hd.z + (dz / d) * dist; p.pos.y = h.world.heightAt(p.pos.x, p.pos.z);
  p.lock = { monster: m, idx: 0 };
  p.glitch.energy = 100; inp.set('glitch', true, 'bot'); SH.sim(1); inp.set('glitch', false, 'bot');
  for (let i = 0; i < 180; i++) { inp.set('attack', (i % (weapon === 'bow' ? 30 : 8)) < 4, 'bot'); SH.sim(1); }
  inp.set('attack', false, 'bot');
  return { active: p.glitching, dmg: Math.round(h.stats.damage), glitch: Math.round(h.stats.glitchDmg) };
}, weapon);
console.log(weapon, JSON.stringify(r));
await page.evaluate(() => window.__SH.step(1));
await page.screenshot({ path: process.argv[3] });
console.log('errors', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();
