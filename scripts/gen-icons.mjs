/**
 * Генератор PWA-иконок: тёмный фон + мягкое светящееся кольцо (аура воды).
 * Без зависимостей: чистый Node (zlib) и простейший PNG-кодер.
 * Запуск: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.3;
  const ringW = size * 0.05;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      // фон: вертикальный градиент #05060D → #0A0F24
      const g = y / size;
      let r = 5 + (10 - 5) * g;
      let gr = 6 + (15 - 6) * g;
      let b = 13 + (36 - 13) * g;

      // кольцо-волна
      const ring = Math.exp(-((d - ringR) ** 2) / (2 * ringW * ringW));
      // мягкое свечение в центре
      const glow = Math.exp(-(d * d) / (2 * (size * 0.14) ** 2)) * 0.5;

      r += ring * 110 + glow * 90;
      gr += ring * 175 + glow * 150;
      b += ring * 235 + glow * 220;

      // внешняя дымка
      const halo = Math.exp(-((d - ringR) ** 2) / (2 * (size * 0.16) ** 2)) * 0.35;
      r += halo * 30;
      gr += halo * 55;
      b += halo * 95;

      px[i] = Math.min(255, Math.round(r));
      px[i + 1] = Math.min(255, Math.round(gr));
      px[i + 2] = Math.min(255, Math.round(b));
      px[i + 3] = 255;
    }
  }
  return encodePng(size, px);
}

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'icon-192.png'), makeIcon(192));
writeFileSync(join(root, 'public', 'icon-512.png'), makeIcon(512));
console.log('icons: public/icon-192.png, public/icon-512.png');
