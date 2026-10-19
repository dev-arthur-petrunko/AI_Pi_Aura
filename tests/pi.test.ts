import { describe, expect, it } from 'vitest';
import { piDigits, piSlice } from '../src/pi/spigot.ts';
import { FEYNMAN, FeynmanDetector, feynmanPosition } from '../src/pi/feynman.ts';

/**
 * Первые цифры π (без «3» перед запятой) — эталон из ТЗ:
 * 51 цифра после запятой, первые 50 входят в неё как префикс.
 */
const FIRST_AFTER_POINT =
  '141592653589793238462643383279502884197169399375105';

describe('spigot: алгоритм Гиббонса', () => {
  it('первые цифры после запятой совпадают с эталоном ТЗ', () => {
    const digits = piSlice(1, FIRST_AFTER_POINT.length);
    expect(digits.join('')).toBe(FIRST_AFTER_POINT);
  });

  it('с потоком: 3, 1, 4, 1, 5, 9, 2, 6, 5, 3', () => {
    const it = piDigits();
    const first: number[] = [];
    for (let i = 0; i < 10; i++) first.push(it.next().value as number);
    expect(first.join('')).toBe('3141592653');
  });

  it('первая цифра — 3 (целая часть)', () => {
    const it = piDigits();
    expect(it.next().value).toBe(3);
  });

  it('буфер держится впереди: пачка из 200+ цифр подряд', () => {
    const slice = piSlice(0, 250);
    expect(slice.length).toBe(250);
    expect(slice[0]).toBe(3);
    expect(slice[1]).toBe(1);
  });
});

describe('точка Фейнмана', () => {
  it('999999 найдена на 762-й цифре после запятой', () => {
    expect(feynmanPosition()).toBe(762);
  });

  it('FEYNMAN — ровно шесть девяток', () => {
    expect(FEYNMAN).toBe('999999');
    expect(FEYNMAN.length).toBe(6);
  });

  it('детектор ловит последовательность на границе пачек', () => {
    const d = new FeynmanDetector();
    const digits = piSlice(755, 20); // 755..774 после запятой (индекс 755 с 0 — см. ниже)
    // индексы: цифра после запятой с позицией P (с 1) имеет индекс P
    let hit = false;
    digits.forEach((digit, i) => {
      const absolute = 755 + i;
      if (d.push(digit, absolute)) hit = true;
    });
    expect(hit).toBe(true);
    expect(d.position).toBe(762);
  });

  it('детектор не срабатывает раньше времени', () => {
    const d = new FeynmanDetector();
    const digits = piSlice(1, 761);
    digits.forEach((digit, i) => expect(d.push(digit, i + 1)).toBe(false));
  });
});
