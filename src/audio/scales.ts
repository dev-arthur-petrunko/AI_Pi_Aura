/**
 * Гаммы: пентатоника, 10 цифр → 10 нот (две октавы).
 * Частоты из ТЗ. Сравнение в тестах — с допуском на округление.
 */

export type ScaleId = 'major' | 'minor';

export const SCALES: Record<ScaleId, readonly number[]> = {
  // Мажорная пентатоника от До: C4 D4 E4 G4 A4 C5 D5 E5 G5 A5
  major: [
    261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
  ],
  // Минорная пентатоника от До: C, E♭, F, G, B♭ в двух октавах
  minor: [
    261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25, 698.46, 783.99, 932.33,
  ],
};

/** Нота для цифры 0–9 в текущей гамме. */
export function freqForDigit(digit: number, scale: ScaleId = 'major'): number {
  const d = Math.min(9, Math.max(0, Math.round(digit)));
  return SCALES[scale][d];
}

/** Нота по позиции x (0..1) в текущей гамме — для касаний экрана. */
export function freqForX(x: number, scale: ScaleId = 'major'): number {
  const d = Math.min(9, Math.max(0, Math.floor(x * 10)));
  return SCALES[scale][d];
}

export const DRONE_FREQ = 65.41; // C2
