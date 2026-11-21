// Generates build/icon.png and build/icon.ico (256x256 PNG inside an ICO container) with no external tools.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const N = 256; const SS = 3;
const px = Buffer.alloc(N * N * 4);
const lerp = (a, b, t) => a + (b - a) * t;
const inRound = (x, y, s, r) => { const cx = Math.min(Math.max(x, r), s - r); const cy = Math.min(Math.max(y, r), s - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
const inTri = (x, y) => { const a = [96, 72], b = [96, 184], c = [192, 128]; const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]); const p = [x, y]; const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
    if (!inRound(fx, fy, N, 56)) continue;
    const t = (fx + fy) / (2 * N);
    let cr = lerp(139, 59, t), cg = lerp(92, 130, t), cb = lerp(246, 246, t);
    if (inTri(fx, fy)) { cr = cg = cb = 255; }
    r += cr; g += cg; b += cb; a += 255;
  }
  const n = SS * SS; const o = (y * N + x) * 4;
  const cov = a / (255 * n);
  px[o] = cov ? r / (cov * n) : 0; px[o + 1] = cov ? g / (cov * n) : 0; px[o + 2] = cov ? b / (cov * n) : 0; px[o + 3] = Math.round(cov * 255);
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
const ico = Buffer.alloc(22); ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico[6] = 0; ico[7] = 0; ico[8] = 0; ico[9] = 0; ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', png); writeFileSync('build/icon.ico', Buffer.concat([ico, png]));
console.log('icon written', png.length);
