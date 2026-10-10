// Glitch-Modus visuell prüfen: Energie füllen, Modus starten, Screenshot. SH_URL=... node tools/glitch-shot.mjs [weapon] [out.png]
import { open } from './pw-lib.mjs';
const weapon = process.argv[2] || 'gs';
const { browser, page, errors } = await open(`scene=hunt&quest=jaggo&god=1&aggro=1&seed=2&weapon=${weapon}`);
await page.evaluate(() => document.querySelector('[data-a="ok"]')?.click());
const r = await page.evaluate(() => {
  const SH = window.__SH, p = SH.player, h = SH.hunt;
  p.glitch.energy = 100; SH.press('glitch');
  SH.step(0.5);
  return { active: p.glitching, t: +p.glitch.t.toFixed(2), mul: p.glitchDmgMul, hud: !!document.querySelector('[class*=glitch]') };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: process.argv[3] || 'glitch.png' });
console.log('errors', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();
