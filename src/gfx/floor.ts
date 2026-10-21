/**
 * Дно бассейна: сетка плиток с цифрами числа π.
 *
 * Рисуется в 2D-холст, который используется как текстура для водяного шейдера.
 * Плитки уходят вглубь экрана (вдоль оси Y), создавая ощущение бесконечности.
 * Сыгранная цифра подсвечивается мягким светом.
 */

import { piSlice } from '../pi/spigot.ts';

export interface FloorConfig {
  cols: number;
  rows: number;
  tilePx: number;
  fontPx: number;
}

const DEFAULT: FloorConfig = {
  cols: 16,
  rows: 12,
  tilePx: 80,
  fontPx: 44,
};

/** Цвета цифр для дна (спокойные, как мыльный пузырь). */
export const FLOOR_PALETTE_HEX = [
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

const FLOOR_PALETTE_RGB: [number, number, number][] = FLOOR_PALETTE_HEX.map(
  (h) => hexToRgb(h),
);

export class Floor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly cols: number;
  private readonly rows: number;
  private readonly tilePx: number;
  private readonly fontPx: number;
  private digits: number[] = [];
  /** Какая цифра сейчас подсвечена (индекс в потоке). */
  private activeIndex = -1;
  /** Смещение сетки по Y (пиксели), для прокрутки вглубь. */
  private scrollY = 0;
  /** Стартовый индекс цифр в массиве digits. */
  private digitStart = 0;

  constructor(cfg: Partial<FloorConfig> = {}) {
    const c = { ...DEFAULT, ...cfg };
    this.cols = c.cols;
    this.rows = c.rows;
    this.tilePx = c.tilePx;
    this.fontPx = c.fontPx;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols * this.tilePx;
    this.canvas.height = this.rows * this.tilePx;
    const c2d = this.canvas.getContext('2d');
    if (!c2d) throw new Error('Floor: Canvas 2D недоступен');
    this.ctx = c2d;

    this.ctx.textBaseline = 'middle';
    this.ctx.textAlign = 'center';
    this.loadDigits(0, this.cols * this.rows);
  }

  /** Загрузить цифры π начиная с индекса `from` (0 = «3»). */
  loadDigits(from = 0, count = this.cols * this.rows): void {
    this.digitStart = from;
    this.digits = piSlice(from, count);
    this.draw();
  }

  /** Подсветить плитку текущей цифры (по индексу в потоке). */
  setActive(index: number): void {
    this.activeIndex = index;
    // Загрузить цифры π вокруг текущего индекса (как в образце: r0 = floor(idx/cols) - 4)
    const row = Math.floor(index / this.cols);
    const from = Math.max(0, row - 4) * this.cols;
    this.loadDigits(from, this.cols * this.rows);
  }

  /** Сместить сетку вглубь (положительное = ближе к viewer, отрицательное = уходит). */
  setScroll(y: number): void {
    this.scrollY = y;
    this.draw();
  }

  /** Текущий flat-индекс цифры (строка × cols + колонка). */
  flatIndex(row: number, col: number): number {
    return row * this.cols + col;
  }

  /** Перерисовать сетку плиток (визуал как в образце reference-water.html). */
  private draw(): void {
    const c = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const tile = this.tilePx;

    // фон дна (нейтральный, шейдер затонирует по теме через uDay)
    c.fillStyle = '#BFEAF2';
    c.fillRect(0, 0, w, h);

    // цифры на плитках
    for (let row = 0; row < this.rows; row++) {
      const worldY = row * tile - this.scrollY;
      if (worldY < -tile || worldY > h + tile) continue;
      for (let col = 0; col < this.cols; col++) {
        const flatIndex = row * this.cols + col;
        const digit = this.digits[flatIndex];
        if (digit === undefined) continue;
        const x = col * this.tilePx + this.tilePx / 2;
        const y = worldY + this.tilePx / 2;
        const globalIndex = this.digitStart + flatIndex;
        const isActive = this.activeIndex === globalIndex;

        // оттенок плитки по хешу от индекса (как в образце)
        const hv = Math.abs(Math.sin(globalIndex * 12.9898) * 43758.5453) % 1;
        c.fillStyle = `hsl(190 ${55 + hv * 10}% ${61 + hv * 5}%)`;
        c.fillRect(x + 2, y + 2, this.tilePx - 4, this.tilePx - 4);

        // прозрачность цифры: сыгранные бледнее, текущая ярко, будущие очень бледно
        const a = globalIndex < this.activeIndex ? 0.34 : globalIndex === this.activeIndex ? 1 : 0.2;
        const [r, g, b] = FLOOR_PALETTE_RGB[digit];
        c.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
        c.font = `${isActive ? 700 : 300} ${this.fontPx}px -apple-system, 'SF Pro Display', Inter, system-ui, sans-serif`;
        c.fillText(String(digit), x, y + 2);
      }
    }
  }

  /** Ширина текстуры (пиксели). */
  get width(): number {
    return this.canvas.width;
  }

  /** Высота текстуры (пиксели). */
  get height(): number {
    return this.canvas.height;
  }

  get textureWidth(): number {
    return this.cols * this.tilePx;
  }

  get textureHeight(): number {
    return this.rows * this.tilePx;
  }
}
