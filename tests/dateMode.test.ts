import { describe, expect, it } from 'vitest';

import { dateModePlan } from '../src/pi/dateMode.ts';

describe('dateMode', () => {
  it('plan', () => {
    const p = dateModePlan(100, 8);
    expect(p.start).toBe(94);
    expect(p.end).toBe(114);
  });
  it('not below 0', () => {
    const p = dateModePlan(3, 4);
    expect(p.start).toBe(0);
  });
});