// Brathalos low-HP flee must reach its nest (or turn and fight), never run into a wall forever.
//   SH_URL=http://127.0.0.1:5173/ node tools/flee-e2e.mjs [shot.png]
import { open } from './pw-lib.mjs';
const { browser, page, errors } = await open('scene=hunt&quest=brathalos&god=1&nofx=1');
const r = await page.evaluate(() => {
  const SH = window.__SH, m = SH.monsters.find((x) => x.def.id === 'brathalos');
  const nest = SH.hunt.world.nestFor('brathalos');
  m.discovered = true; m.target = SH.player;
  m.hp = m.maxHp * 0.25; m.state = 'combat'; m.attack = null;
  SH.sim(10);
  const log = [];
  for (let i = 0; i < 120; i++) {
    SH.sim(60);
    log.push([m.state, +m.pos.x.toFixed(0), +m.pos.z.toFixed(0), +Math.hypot(m.pos.x - nest.x, m.pos.z - nest.z).toFixed(0)]);
    if (m.state === 'sleep') break;
  }
  return { nest, log: log.filter((_, i) => i % 6 === 0 || i === log.length - 1), final: log[log.length - 1] };
});
console.log(JSON.stringify(r));
await page.evaluate(() => window.__SH.step(2));
await page.screenshot({ path: process.argv[2] || 'flee.png' });
console.log('errors', errors.length);
await browser.close();
