// Pfeilregen-Schaden: Wucht 100, B, Brocken eingefroren. Usage: (npm run dev) node tools/rain-probe.mjs [quest=jaggo] [runs=6]
import { open } from './pw-lib.mjs';
const quest = process.argv[2] || 'jaggo', runs = Number(process.argv[3] || 6), weapon = process.env.W || 'bow', dist = Number(process.env.D || 11);
const out = [];
for (let seed = 1; seed <= runs; seed++) {
  const { browser, page, errors } = await open(`scene=hunt&quest=${quest}&weapon=${weapon}&seed=${seed}&nofx=1&god=1`);
  const r = await page.evaluate(({ lockIdx, dist }) => {
    const SH = window.__SH, h = SH.hunt, p = h.player, m = h.mainMonster, inp = SH.input;
    m.update = () => {}; m.hp = m.maxHp = 1e8;
    const lp = m.lockPoints();
    const hd = (lp[lockIdx] ?? lp[0]).pos;
    const dx = hd.x - m.pos.x, dz = hd.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
    p.pos.x = hd.x + (dx / d) * dist; p.pos.z = hd.z + (dz / d) * 11; p.pos.y = h.world.heightAt(p.pos.x, p.pos.z);
    p.lock = { monster: m, idx: Math.min(lockIdx, lp.length - 1) };
    SH.sim(20);
    p.weapon.wucht = 100;
    const dmg0 = h.stats.damage, hits0 = h.stats.hits;
    inp.set('special', true, 'bot'); SH.sim(2); inp.set('special', false, 'bot');
    SH.sim(200);
    return { dmg: h.stats.damage - dmg0, hits: h.stats.hits - hits0, power: p.stats.power, move: p.weapon.data.rainDropped };
  }, { lockIdx: seed % 3, dist });
  out.push(r);
  if (errors.length) console.log(errors.slice(0, 3));
  await browser.close();
}
for (const r of out) console.log(JSON.stringify(r));
const avg = (k) => out.reduce((a, r) => a + r[k], 0) / out.length;
console.log('avg dmg', avg('dmg').toFixed(0), 'avg hits', avg('hits').toFixed(1));
