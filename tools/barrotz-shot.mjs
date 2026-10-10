// Barrotz Walze + 360°-Feger visuell prüfen: SH_URL=... node tools/barrotz-shot.mjs out-prefix
import { open } from './pw-lib.mjs';
const pre = process.argv[2] || 'barrotz';
const { browser, page, errors } = await open('scene=hunt&quest=barrotz&god=1&aggro=1&nofx=1&seed=2');
for (const [atk, at, name] of [['barrotz_waelzer', 1.5, 'walze'], ['barrotz_feger', 0.95, 'feger']]) {
  const r = await page.evaluate(([atk, at]) => {
    const SH = window.__SH, m = SH.hunt.mainMonster, p = SH.player;
    m.armor = null; m.attack = null; m.recover = 99;
    p.pos.set(m.pos.x + Math.sin(m.rot) * 8, p.pos.y, m.pos.z + Math.cos(m.rot) * 8);
    m.target = p;
    const inst = m.beginAttack(atk);
    const start = { x: m.pos.x, z: m.pos.z, rot: m.rot };
    const steps = Math.round(at * 60);
    for (let i = 0; i < steps; i++) { m.recover = 99; SH.sim(1); }
    return { atk, dur: +inst.duration.toFixed(2), moved: +Math.hypot(m.pos.x - start.x, m.pos.z - start.z).toFixed(1), dRot: +(m.rot - start.rot).toFixed(2), roll: +(m.pose.bodyRoll ?? 0).toFixed(0) };
  }, [atk, at]);
  console.log(JSON.stringify(r));
  await page.evaluate(() => window.__SH.step(1));
  await page.screenshot({ path: `${pre}-${name}.png` });
}
console.log('errors', errors.length);
await browser.close();
