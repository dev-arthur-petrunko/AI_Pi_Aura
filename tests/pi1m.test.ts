import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { piSlice } from '../src/pi/spigot.ts';

function unpack(): string {
  const buf = readFileSync(resolve(process.cwd(), 'public/pi-1m.bin'));
  let s = '';
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    s += String.fromCharCode(48 + ((b >> 4) & 0x0f));
    s += String.fromCharCode(48 + (b & 0x0f));
  }
  return s;
}

describe('pi-1m', () => {
  const s = unpack();
  it('length 500000 bytes', () => {
    const buf = readFileSync(resolve(process.cwd(), 'public/pi-1m.bin'));
    expect(buf.length).toBe(500000);
  });
  it('first 50 digits', () => {
    expect(s.slice(0, 50)).toBe('31415926535897932384626433832795028841971693993751');
  });
  it('feynman at 762', () => {
    expect(s.slice(762, 768)).toBe('999999');
  });
  it('first 3000 match spigot', () => {
    const sp = piSlice(0, 3000).map((d) => String(d)).join('');
    expect(s.slice(0, 3000)).toBe(sp);
  });
  it('sha256', () => {
    const buf = readFileSync(resolve(process.cwd(), 'public/pi-1m.bin'));
    const h = createHash('sha256').update(buf).digest('hex');
    expect(h).toBe('2fd073e51666cf55e6e5d36dd2f10562fa71dcf1f4e297476af39a9691e19e8f');
  });
});