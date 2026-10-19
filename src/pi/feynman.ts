/** Точка Фейнмана: шесть девяток подряд. */

export const FEYNMAN = '999999';

/**
 * Детектор последовательности, устойчивый к границам пачек:
 * скользящее окно из последних цифр.
 */
export class FeynmanDetector {
  private window = '';
  /** Позиция (с 0) первой цифры последовательности в общем потоке, либо -1. */
  private foundAt = -1;

  push(digit: number, absoluteIndex: number): boolean {
    if (this.foundAt >= 0) return false;
    this.window += String(digit);
    if (this.window.length > FEYNMAN.length) {
      this.window = this.window.slice(-FEYNMAN.length);
    }
    if (this.window === FEYNMAN) {
      this.foundAt = absoluteIndex - FEYNMAN.length + 1;
      return true;
    }
    return false;
  }

  get position(): number {
    return this.foundAt;
  }

  reset(): void {
    this.window = '';
    this.foundAt = -1;
  }
}

import { piSlice } from './spigot.ts';

/**
 * Позиция 999999 после запятой (нумерация с 1) в потоке цифр.
 * Индекс 0 — «3» перед запятой; после запятой нумерация начинается с 1 (индекс 1).
 * Проверяет префикс потока, ограниченный `maxDigits` (для тестов — 1000).
 */
export function feynmanPosition(maxDigits = 1000): number {
  const digits = piSlice(1, maxDigits);
  const window: number[] = [];
  for (let i = 0; i < digits.length; i++) {
    window.push(digits[i]);
    if (window.length > FEYNMAN.length) window.shift();
    if (window.length === FEYNMAN.length && window.join('') === FEYNMAN) {
      return i - FEYNMAN.length + 2; // +1 — после запятой, +1 — позиция начала окна
    }
  }
  return -1;
}

