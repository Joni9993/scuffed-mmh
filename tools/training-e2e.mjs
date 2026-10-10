// Übungsplatz prüfen: ?scene=hunt&quest=training lädt, Puppe sichtbar, Glitch nach <= 6 s bereit. SH_URL=... node tools/training-e2e.mjs [out.png]
import { open } from './pw-lib.mjs';
const { browser, page, errors } = await open('scene=hunt&quest=training&weapon=gs&seed=1');
await page.evaluate(() => document.querySelector('[data-a="ok"]')?.click());
const r = await page.evaluate(() => {
  const SH = window.__SH, p = SH.player, h = SH.hunt, m = h.mainMonster;
  p.v.hp = 20; p.v.stamina = 0;
  let t = 0;
  while (!(p.glitch.energy >= 100) && t < 10) { SH.step(6); t += 0.1; }
  const out = { glitchReadyAfter: +t.toFixed(1), hp: p.v.hp === p.v.maxHp, st: p.v.stamina === p.v.maxStamina, dummy: m?.def.id, state: m?.state, timer: document.querySelector('.hud-timer')?.textContent };
  for (let i = 0; i < 20; i++) m.applyDamage({ dmg: 900, partId: 'body', elemDmg: 0, blunt: 1, attackerId: 'p1' });
  SH.step(6);
  out.alive = m.alive; out.hpPct = +(m.hp / m.maxHp).toFixed(2);
  return out;
});
console.log(JSON.stringify(r));
await page.screenshot({ path: process.argv[2] || 'training.png' });
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
