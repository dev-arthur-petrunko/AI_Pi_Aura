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
  fontPx: 48,
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
  private theme: 'day' | 'night' = 'day';
  /** Смещение сетки по Y (пиксели), для прокрутки вглубь. */
  private scrollY = 0;

  setTheme(theme: 'day' | 'night'): void {
    this.theme = theme;
    this.draw();
  }
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

  private highlightStart = -1;
  private highlightLen = 0;

  setHighlight(start: number, len: number): void {
    this.highlightStart = start;
    this.highlightLen = len;
    // load digits around highlight
    const row = Math.floor(start / this.cols);
    const from = Math.max(0, row - 4) * this.cols;
    this.loadDigits(from, this.cols * this.rows);
  }

  clearHighlight(): void {
    this.highlightStart = -1;
    this.highlightLen = 0;
    this.draw();
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

    // фон дна (как в образце)
    const day = this.theme === 'day';
    c.fillStyle = day ? '#5FB5C9' : '#04141F';
    c.fillRect(0, 0, w, h);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `200 ${this.fontPx}px -apple-system, 'SF Pro Display', Inter, system-ui, sans-serif`;

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

        const isHit =
          this.highlightLen > 0 &&
          globalIndex >= this.highlightStart &&
          globalIndex < this.highlightStart + this.highlightLen;

        const hv = Math.abs(Math.sin(globalIndex * 12.9898) * 43758.5453) % 1;
        if (day) {
          c.fillStyle = isHit ? 'rgba(255,217,138,0.35)' : `hsl(190 ${55 + hv * 10}% ${52 + hv * 5}%)`;
        } else {
          c.fillStyle = isHit ? 'rgba(255,217,138,0.25)' : `hsl(200 55% ${9 + hv * 3}%)`;
        }
        c.fillRect(x + 2, y + 2, this.tilePx - 4, this.tilePx - 4);

        if (isHit) {
          c.strokeStyle = '#FFD98A';
          c.lineWidth = 2;
          c.strokeRect(x + 2, y + 2, this.tilePx - 4, this.tilePx - 4);
        }

        const a = day
          ? globalIndex < this.activeIndex
            ? 0.55
            : globalIndex === this.activeIndex
              ? 1
              : 0.35
          : globalIndex < this.activeIndex
            ? 0.34
            : globalIndex === this.activeIndex
              ? 1
              : 0.2;
        c.fillStyle = isHit
          ? '#FFD98A'
          : day
            ? `rgba(6, 43, 69, ${a})`
            : `rgba(170, 240, 255, ${a})`;
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
