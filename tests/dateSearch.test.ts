import { describe, expect, it } from 'vitest';

import { validateDate, candidates, findAll, chance } from '../src/pi/dateSearch.ts';

describe('dateSearch', () => {
  it('validateDate', () => {
    expect(validateDate({ d: 30, m: 2, y: 2000 })).toBe('day');
    expect(validateDate({ d: 31, m: 4 })).toBe('day');
    expect(validateDate({ d: 29, m: 2, y: 1996 })).toBe('ok');
    expect(validateDate({ d: 29, m: 2, y: 1995 })).toBe('day');
    expect(validateDate({ d: 1, m: 13 })).toBe('month');
  });
  it('candidates order and dedup', () => {
    const p = { d: 14, m: 3, y: 1995 };
    const uk = candidates(p, 'uk');
    expect(uk[0].digits.length).toBe(8);
    // both contain 8-digit
    expect(uk.some((c) => c.digits === '14031995')).toBe(true);
    // no dup digits
    const digits = uk.map((c) => c.digits);
    expect(new Set(digits).size).toBe(digits.length);
  });
  it('1.3.1995 variants', () => {
    const p = { d: 1, m: 3, y: 1995 };
    const c = candidates(p, 'uk');
    expect(c.some((x) => x.digits === '01031995')).toBe(true);
    expect(c.some((x) => x.digits === '131995')).toBe(true);
  });
  it('uk vs en preference', () => {
    const p = { d: 1, m: 2, y: 2000 };
    const uk = candidates(p, 'uk');
    const en = candidates(p, 'en');
    // first 8-digit differs order
    const ukFirst8 = uk.find((c) => c.digits.length === 8)?.fmt;
    const enFirst8 = en.find((c) => c.digits.length === 8)?.fmt;
    expect(ukFirst8).toBe('DDMMYYYY');
    expect(enFirst8).toBe('MMDDYYYY');
  });
  it('findAll synthetic', () => {
    const s = 'xx14031995yy';
    const hits = findAll(s, { d: 14, m: 3, y: 1995 }, 'uk');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].index).toBe(2);
  });
  it('chance', () => {
    expect(chance(4)).toBeGreaterThan(0.99);
    expect(chance(8)).toBeLessThan(0.02);
    expect(chance(8)).toBeGreaterThan(0.009);
  });
});