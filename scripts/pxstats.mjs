/**
 * Измеряет «яркость» PNG-скриншота без внешних зависимостей.
 * Цель: проверить, что фон остаётся чёрным, а свечение локально,
 * а не превращает весь кадр в серо-синюю дымку.
 *
 * Запуск: node scripts/pxstats.mjs shot.png
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/pxstats.mjs <file.png>');
  process.exit(1);
}

const buf = readFileSync(file);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

let off = 8;
let width = 0;
let height = 0;
let bitDepth = 0;
let colorType = 0;
const idat = [];

while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString('ascii', off + 4, off + 8);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') break;
  off += 12 + len;
}

if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
if (!channels) throw new Error(`unsupported color type ${colorType}`);

const raw = inflateSync(Buffer.concat(idat));
const stride = width * channels;
const px = Buffer.alloc(height * stride);

// разворачиваем PNG-фильтры строк
for (let y = 0; y < height; y++) {
  const ft = raw[y * (stride + 1)];
  const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  const cur = px.subarray(y * stride, (y + 1) * stride);
  const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? cur[x - channels] : 0;
    const b = prev ? prev[x] : 0;
    const c = prev && x >= channels ? prev[x - channels] : 0;
    let v = src[x];
    if (ft === 1) v += a;
    else if (ft === 2) v += b;
    else if (ft === 3) v += (a + b) >> 1;
    else if (ft === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    cur[x] = v & 0xff;
  }
}

/** Относительная яркость (Rec.709) в 0..1 */
const lumAt = (x, y) => {
  const o = y * stride + x * channels;
  const r = px[o] / 255;
  const g = px[o + 1] / 255;
  const b = px[o + 2] / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

let sum = 0;
let max = 0;
let maxAt = [0, 0];
const hist = new Array(10).fill(0);
const thresholds = { t02: 0, t05: 0, t10: 0, t20: 0, t40: 0 };
let n = 0;
const lums = new Float64Array(width * height);

// гистограмма по «полосам»: верхние 15% строк — небо, нижние 25% — HUD
let topSum = 0;
let topN = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const l = lumAt(x, y);
    lums[y * width + x] = l;
    sum += l;
    n++;
    if (l > max) {
      max = l;
      maxAt = [x, y];
    }
    hist[Math.min(9, Math.floor(l * 10))]++;
    if (l > 0.02) thresholds.t02++;
    if (l > 0.05) thresholds.t05++;
    if (l > 0.1) thresholds.t10++;
    if (l > 0.2) thresholds.t20++;
    if (l > 0.4) thresholds.t40++;
    if (y < height * 0.15) {
      topSum += l;
      topN++;
    }
  }
}

// перцентили: показывают, что именно занимает кадр
const sorted = Float64Array.from(lums).sort();
const pctl = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const pct = (v) => +((v / n) * 100).toFixed(2);
const out = {
  file,
  size: `${width}x${height}`,
  meanLum: +(sum / n).toFixed(4),
  maxLum: +max.toFixed(4),
  maxAt,
  topBandMeanLum: +(topSum / topN).toFixed(4),
  percentiles: {
    p10: +pctl(0.1).toFixed(4),
    p50: +pctl(0.5).toFixed(4),
    p75: +pctl(0.75).toFixed(4),
    p90: +pctl(0.9).toFixed(4),
    p99: +pctl(0.99).toFixed(4),
  },
  hist: hist.map((c) => pct(c)),
  pctAbove: {
    '0.02': pct(thresholds.t02),
    '0.05': pct(thresholds.t05),
    '0.10': pct(thresholds.t10),
    '0.20': pct(thresholds.t20),
    '0.40': pct(thresholds.t40),
  },
};
console.log(JSON.stringify(out, null, 2));
