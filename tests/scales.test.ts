import { describe, expect, it } from 'vitest';
import { DRONE_FREQ, freqForDigit, freqForX, SCALES } from '../src/audio/scales.ts';

const MAJOR = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
const MINOR = [261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25, 698.46, 783.99, 932.33];

describe('scales: таблица цифра → нота', () => {
  it('мажорная пентатоника совпадает с таблицей ТЗ', () => {
    expect(SCALES.major).toHaveLength(10);
    for (let d = 0; d < 10; d++) {
      expect(freqForDigit(d, 'major')).toBeCloseTo(MAJOR[d], 2);
    }
  });

  it('минорная пентатоника: C, E♭, F, G, B♭ в двух октавах', () => {
    expect(SCALES.minor).toHaveLength(10);
    for (let d = 0; d < 10; d++) {
      expect(freqForDigit(d, 'minor')).toBeCloseTo(MINOR[d], 2);
    }
    // вторая октава — те же ноты ×2
    for (let d = 0; d < 5; d++) {
      expect(SCALES.minor[5 + d] / SCALES.minor[d]).toBeCloseTo(2, 3);
    }
  });

  it('цифра по умолчанию — мажор', () => {
    expect(freqForDigit(0)).toBe(261.63);
    expect(freqForDigit(9)).toBe(880.0);
  });

  it('все частоты положительные и отсортированы по возрастанию', () => {
    for (const id of ['major', 'minor'] as const) {
      const s = SCALES[id];
      for (let i = 0; i < s.length; i++) {
        expect(s[i]).toBeGreaterThan(0);
        if (i > 0) expect(s[i]).toBeGreaterThan(s[i - 1]);
      }
    }
  });

  it('x-позиция касания: слева → ниже, справа → выше', () => {
    const low = freqForX(0.05);
    const mid = freqForX(0.55);
    const high = freqForX(0.95);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(freqForX(-1)).toBe(SCALES.major[0]);
    expect(freqForX(2)).toBe(SCALES.major[9]);
  });

  it('дрон — C2 (65.41 Гц)', () => {
    expect(DRONE_FREQ).toBeCloseTo(65.41, 2);
  });
});
