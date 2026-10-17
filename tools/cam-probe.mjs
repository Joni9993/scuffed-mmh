// Kamera-Probe (echte Jagd, Lock an): Pirscher umkreist den Brocken im Nahkampf. Misst max. Drehrate der Kamera und
// wie oft der Brocken aus dem Bild faellt. SH_URL=... node tools/cam-probe.mjs [quest] [outPng]
import { open } from './pw-lib.mjs';
const quest = process.argv[2] || 'barrotz';
const { browser, page, errors } = await open(`scene=hunt&quest=${quest}&weapon=gs&seed=1&god=1&aggro=1&nofx=1&noambient=1&nofauna=1`);
const r = await page.evaluate(async () => {
  const sh = window.__SH, h = sh.hunt, p = h.player, m = h.monsters.find((x) => !x.minor);
  p.spawnAt(m.pos.x, m.pos.z - 6, 0); h.rig.snap(p.pos, 0); sh.step(30);
  sh.press('lock'); sh.step(10);
  let maxRate = 0, prev = h.rig.yaw, off = 0, n = 0;
  const v = new (h.camera.position.constructor)();
  for (let i = 0; i < 900; i++) { // 15 s: im Kreis um den Brocken laufen (Stick seitlich), dazu ab und zu angreifen
    const t = i / 60;
    sh.stick(Math.cos(t * 0.7) > 0 ? 1 : -1, -0.35);
    if (i % 50 === 0) sh.press('attack');
    sh.step(1);
    const d = Math.abs(((h.rig.yaw - prev + Math.PI * 3) % (Math.PI * 2)) - Math.PI); prev = h.rig.yaw;
    maxRate = Math.max(maxRate, d * 60);
    h.camera.updateMatrixWorld(true); v.set(m.pos.x, m.pos.y + 1.5, m.pos.z).project(h.camera);
    if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1 || v.z > 1) off++;
    n++;
  }
  sh.stick(0, 0);
  return { locked: !!p.lock, maxRate: +maxRate.toFixed(2), offscreenPct: +(100 * off / n).toFixed(1), dist: +h.rig.dist.toFixed(1) };
});
console.log(JSON.stringify(r));
if (process.argv[3]) { await page.evaluate(() => { window.__SH.pause(false); }); await page.waitForTimeout(400); await page.screenshot({ path: process.argv[3] }); }
console.log('errors', errors.length, errors.slice(0, 2).join(' | '));
await browser.close();
