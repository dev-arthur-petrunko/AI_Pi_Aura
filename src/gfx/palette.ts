/** Палитра цифр 0–9 из ТЗ (полупрозрачные, как мыльный пузырь). */

export const PALETTE_HEX = [
  '#2B2A8F', // 0 глубокий индиго
  '#2F52D0', // 1 сапфир
  '#1F86E0', // 2 океан
  '#14B8D6', // 3 лазурь
  '#1FD9BC', // 4 бирюза
  '#7CF0CC', // 5 мята
  '#B6F2E4', // 6 аквамарин-жемчуг
  '#C6B6FF', // 7 лаванда
  '#E7A6F2', // 8 орхидея
  '#FFD3EE', // 9 перламутровый розовый
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Цвета в линейном диапазоне 0..1 для шейдера (10 × vec3). */
export const PALETTE_RGB: Float32Array = (() => {
  const arr = new Float32Array(30);
  PALETTE_HEX.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  });
  return arr;
})();

export function colorForDigit(digit: number): [number, number, number] {
  const d = Math.min(9, Math.max(0, Math.round(digit)));
  return [PALETTE_RGB[d * 3], PALETTE_RGB[d * 3 + 1], PALETTE_RGB[d * 3 + 2]];
}
