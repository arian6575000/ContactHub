// Generates placeholder app icons (assets/icon.png, adaptive-icon.png, favicon.png) with no dependencies.
// Skips files that already exist, so dropping in your own artwork is enough to replace them.
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size, { bg, transparentBg }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const inRound = (x, y, x0, y0, x1, y1, r) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const s = size;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let px = transparentBg ? [0, 0, 0, 0] : bg;
      // white document page
      if (inRound(x, y, s * 0.28, s * 0.2, s * 0.72, s * 0.8, s * 0.05)) px = [255, 255, 255, 255];
      // text lines
      for (const [ly, lw] of [[0.34, 0.3], [0.46, 0.3], [0.58, 0.2]]) {
        if (inRound(x, y, s * 0.36, s * ly, s * (0.36 + lw), s * (ly + 0.045), s * 0.02)) px = [62, 107, 255, 255];
      }
      // signature check-dot
      if ((x - s * 0.62) ** 2 + (y - s * 0.7) ** 2 <= (s * 0.035) ** 2) px = [20, 196, 139, 255];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = px[3];
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('assets', { recursive: true });
const BLUE = [62, 107, 255, 255];
const targets = [
  ['assets/icon.png', 1024, { bg: BLUE }],
  ['assets/adaptive-icon.png', 1024, { bg: BLUE, transparentBg: true }],
  ['assets/favicon.png', 48, { bg: BLUE }],
];
for (const [file, size, opts] of targets) {
  if (existsSync(file)) { console.log(`keep ${file}`); continue; }
  writeFileSync(file, png(size, opts));
  console.log(`wrote ${file}`);
}
