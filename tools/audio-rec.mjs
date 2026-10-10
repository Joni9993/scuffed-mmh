// Echtes Spiel-Audio aufnehmen (Musik + SFX + Ambient) → WebM. SH_URL=... node tools/audio-rec.mjs <hub|hunt|rost> <sekunden> out.webm
import { createRequire } from 'module';
import { writeFileSync } from 'node:fs';
const require = createRequire('/opt/node-tools/');
const { chromium } = require('playwright');
const [scene = 'hub', secs = '30', out = 'rec.webm'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...a) {
    const r = orig.call(this, dst, ...a);
    if (dst instanceof AudioDestinationNode) {
      const c = dst.context;
      if (!c.__tap) { c.__tap = c.createMediaStreamDestination(); window.__tapCtx = c; }
      orig.call(this, c.__tap);
    }
    return r;
  };
});
const q = scene === 'hunt' ? 'scene=hunt&quest=jaggo&god=1&seed=3&weapon=gs' : scene === 'rost' ? 'scene=hunt&quest=jaggo&god=1&seed=3&weapon=gs&music=rost' : 'scene=hub&nofs=1&mode=solo';
await page.goto(`${process.env.SH_URL}?${q}`);
await page.waitForTimeout(2500);
await page.mouse.click(420, 200); await page.keyboard.press('KeyW');
await page.waitForTimeout(800);
const b64 = await page.evaluate(async ({ secs, scene }) => {
  const c = window.__tapCtx; if (!c) return null;
  if (scene === 'rost') { // Rostwerke-Vorhören: 0–12 s Erkunden, 12 s Kampf, 24 s Rotglut, 36 s Glitch, 48 s Sieg-Stinger
    const fight = () => { const h = window.__SH.hunt, m = h.mainMonster, p = h.player; m.target = p; m.discovered = true; m.setState('combat'); m.pos.set(p.pos.x + 6, m.pos.y, p.pos.z + 6); };
    setTimeout(fight, 12000);
    setTimeout(() => window.__SH.hunt.mainMonster._enrage(), 24000);
    setTimeout(() => { const p = window.__SH.player; p.glitch.energy = 100; window.__SH.press('glitch'); }, 36000);
  }
  if (scene === 'hunt') { // Jagd: nach 10 s Kampf erzwingen (aggro), nach 20 s Glitch → Intensität steigt
    setTimeout(() => { const h = window.__SH.hunt, m = h.mainMonster, p = h.player; m.target = p; m.discovered = true; m.setState('combat'); m.pos.set(p.pos.x + 6, m.pos.y, p.pos.z + 6); }, 10000);
    setTimeout(() => { const p = window.__SH.player; p.glitch.energy = 100; window.__SH.press('glitch'); }, 20000);
  }
  const rec = new MediaRecorder(c.__tap.stream, { mimeType: 'audio/webm' }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); rec.start(500);
  await new Promise((r) => setTimeout(r, secs * 1000)); rec.stop(); await new Promise((r) => (rec.onstop = r));
  const buf = await new Blob(parts).arrayBuffer(); let s = ''; const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return btoa(s);
}, { secs: Number(secs), scene });
if (b64) writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(scene, b64 ? 'ok' : 'NO AUDIO CTX', 'errors', errs.length, errs.slice(0, 2).join(' | '));
await browser.close();
