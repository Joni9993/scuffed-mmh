// Generates public/icon-{180,192,512}.png (pixel-art crosshair on dark purple). Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const cx = size / 2, bg = [18, 13, 28], red = [214, 40, 40], gold = [255, 216, 74];
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cx + 0.5, r = Math.hypot(dx, dy) / size;
      let c = bg;
      if (r > 0.27 && r < 0.34) c = red; // ring
      else if (r < 0.07) c = gold; // dot
      else if (r < 0.42 && (Math.abs(dx) < size * 0.025 || Math.abs(dy) < size * 0.025) && r > 0.2) c = gold; // ticks
      const o = y * (size * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('public', { recursive: true });
for (const s of [180, 192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
