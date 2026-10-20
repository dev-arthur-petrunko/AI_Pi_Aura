/** Палитра цифр 0–9 из образца (спокойные, как мыльный пузырь). */
export const PAL_HEX = [
  '#2B6CB0', // 0
  '#2F8FD0', // 1
  '#1FB0D8', // 2
  '#19C7C7', // 3
  '#3ED6B0', // 4
  '#7FE3B8', // 5
  '#B4EBD6', // 6
  '#C9C3F0', // 7
  '#E6B9E8', // 8
  '#F7D6E6', // 9
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Цвета в линейном диапазоне 0..1 для шейдера (10 × vec3). */
export const PAL_RGB: Float32Array = (() => {
  const arr = new Float32Array(30);
  PAL_HEX.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    arr[i * 3] = r;
    arr[i * 3 + 1] = g;
    arr[i * 3 + 2] = b;
  });
  return arr;
})();

export function colorForDigit(digit: number): [number, number, number] {
  const d = Math.min(9, Math.max(0, Math.round(digit)));
  return [PAL_RGB[d * 3], PAL_RGB[d * 3 + 1], PAL_RGB[d * 3 + 2]];
}
