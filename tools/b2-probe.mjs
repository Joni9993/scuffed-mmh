// Brocken 2.0 Probe: echte Jagd im Browser, zählt KI-Events (Ketten, Phasen, Erschöpfung, Lehrangriff) + Konsolenfehler.
//   SH_URL=http://127.0.0.1:8080/ node tools/b2-probe.mjs [jaggo|barrotz|brathalos] [shot.png]
import { open } from './pw-lib.mjs';
const quest = process.argv[2] || 'jaggo';
const { browser, page, errors } = await open(`scene=hunt&quest=${quest}&god=1&aggro=1&seed=3`);
const r = await page.evaluate(() => {
  const SH = window.__SH, hunt = SH.hunt, m = hunt.mainMonster;
  const ev = {}, seq = [];
  for (const k of ['attackStart', 'teach', 'monsterTired', 'monsterPhase', 'monsterFlinch', 'retarget', 'playerDown']) hunt.bus.on(k, (e) => {
    ev[k] = (ev[k] ?? 0) + 1;
    if (k === 'attackStart') seq.push(e.attackId.replace(/^[a-z]+_/, '') + (e.chainIdx ? `#${e.chainIdx}` : '') + (e.teach ? '*' : ''));
  });
  for (let i = 0; i < 90; i++) { SH.sim(60); if (m.hp > m.maxHp * 0.3) m.hp -= m.maxHp * 0.007; } // ~90 s, HP sinkt langsam -> Phasen
  return { ev, seq: seq.slice(0, 40).join(' '), hpPct: +(m.hp / m.maxHp).toFixed(2), state: m.state, glow: hunt.rig.frameK ?? null };
});
console.log(JSON.stringify(r));
await page.evaluate(() => window.__SH.step(1));
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
console.log('errors', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();
