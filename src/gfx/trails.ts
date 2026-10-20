/**
 * Дуги-«рисунок музыки».
 *
 * Отдельный 2D-слой над водой (pointer-events: none). При каждой новой цифре
 * рисуется дуга от якоря предыдущей цифры к якорю новой (квадратичная кривая
 * Безье, градиент цвета цифр). Каждый кадр холст слегка зачищается
 * (destination-out), поэтому старые дуги тают. Под слоем — размытая копия
 * (bloom). Весь слой медленно вращается (1 оборот за 300 с).
 */

import { anchorPos } from './ripples.ts';
import { colorForDigit } from './palette.ts';

const ANCHOR_RADIUS = 0.30;
const FADE_ALPHA = 0.015; // зачистка холста каждый кадр
const ARC_MAX_AGE = 30; // секунды жизни дуги
const ROTATION_PERIOD = 300; // секунд на 1 оборот
const FEYNMAN_MS = 3000;

interface Arc {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cpx: number;
  cpy: number;
  c0: string;
  c1: string;
  width: number;
  birth: number;
}

function rgbStr([r, g, b]: [number, number, number]): string {
  const R = Math.round(r * 255);
  const G = Math.round(g * 255);
  const B = Math.round(b * 255);
  return `rgb(${R},${G},${B})`;
}

const reducedMotion =
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;
export class Trails {
  readonly container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private bloom: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bctx: CanvasRenderingContext2D;
  private arcs: Arc[] = [];
  private dpr = 1;
  private scale = 1;
  private w = 0;
  private h = 0;
  private feynmanUntil = -1;
  private frozen = false;
  private prevDigit: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    this.container.style.transformOrigin = 'center';
    this.container.style.width = '100%';
    this.container.style.height = '100%';

    this.bloom = document.createElement('canvas');
    this.bloom.style.position = 'fixed';
    this.bloom.style.inset = '0';
    this.bloom.style.width = '100%';
    this.bloom.style.height = '100%';
    this.bloom.style.pointerEvents = 'none';
    this.bloom.style.filter = 'blur(10px)';
    this.bloom.style.opacity = '0.6';

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'fixed';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';

    this.container.appendChild(this.bloom);
    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    const ctx = this.canvas.getContext('2d');
    const bctx = this.bloom.getContext('2d');
    if (!ctx || !bctx) {
      throw new Error('Trails: Canvas 2D недоступен');
    }
    this.ctx = ctx;
    this.bctx = bctx;
  }

  setScale(scale: number, dpr: number): void {
    this.dpr = dpr;
    this.scale = Math.min(scale, 1.5 * dpr);
    this.resize();
  }

  private resize(): void {
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr * this.scale));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr * this.scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.bloom.width = w;
      this.bloom.height = h;
      this.w = w;
      this.h = h;
    }
  }
  /** Сообщить о новой цифре — нарисуется дуга от якоря предыдущей к якорю новой. */
  onDigit(toDigit: number, time: number): void {
    if (this.w === 0 || this.h === 0 || this.prevDigit === null) {
      this.prevDigit = toDigit;
      return;
    }
    const cx = this.w / 2;
    const cy = this.h / 2;
    const R = Math.min(this.w, this.h) * ANCHOR_RADIUS;
    const a0 = anchorPos(this.prevDigit, cx, cy, R);
    const a1 = anchorPos(toDigit, cx, cy, R);
    // контрольная точка: 0.35*R от центра к середине хорды
    const mx = (a0.x + a1.x) / 2;
    const my = (a0.y + a1.y) / 2;
    const dx = mx - cx;
    const dy = my - cy;
    const dLen = Math.hypot(dx, dy) || 1;
    const cpx = cx + (dx / dLen) * (0.35 * R);
    const cpy = cy + (dy / dLen) * (0.35 * R);
    this.arcs.push({
      x0: a0.x,
      y0: a0.y,
      x1: a1.x,
      y1: a1.y,
      cpx,
      cpy,
      c0: rgbStr(colorForDigit(this.prevDigit)),
      c1: rgbStr(colorForDigit(toDigit)),
      width: 1.5 + Math.random() * 0.6,
      birth: time,
    });
    this.prevDigit = toDigit;
    this.prune(time);
  }

  setFeynman(active: boolean, time: number): void {
    if (active) this.feynmanUntil = time + FEYNMAN_MS / 1000;
    else if (time >= this.feynmanUntil) this.feynmanUntil = -1;
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  private prune(time: number): void {
    const cutoff = time - ARC_MAX_AGE;
    while (this.arcs.length > 0 && this.arcs[0].birth < cutoff) {
      this.arcs.shift();
    }
  }

  render(time: number): void {
    this.resize();
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    if (w === 0 || h === 0) return;

    // затемнение холста (зачистка) — кроме заморозки
    if (!this.frozen) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    const feynman = this.feynmanUntil >= 0 && time < this.feynmanUntil;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const arc of this.arcs) {
      const age = time - arc.birth;
      if (age < 0 || age > ARC_MAX_AGE) continue;
      const life = 1 - age / ARC_MAX_AGE;
      const g = ctx.createLinearGradient(arc.x0, arc.y0, arc.x1, arc.y1);
      const c0 = feynman ? '#FFFFFF' : arc.c0;
      const c1 = feynman ? '#FFFFFF' : arc.c1;
      g.addColorStop(0, c0);
      g.addColorStop(1, c1);
      ctx.beginPath();
      ctx.moveTo(arc.x0, arc.y0);
      ctx.quadraticCurveTo(arc.cpx, arc.cpy, arc.x1, arc.y1);
      ctx.strokeStyle = g;
      ctx.lineWidth = arc.width;
      ctx.globalAlpha = feynman ? 0.95 : 0.7 * life;
      ctx.stroke();
    }
    ctx.restore();

    // bloom: копия кадра под слоем с размытием
    this.bctx.save();
    this.bctx.globalCompositeOperation = 'copy';
    this.bctx.drawImage(this.canvas, 0, 0);
    this.bctx.restore();

    // медленное вращение слоя
    const angle = reducedMotion ? 0 : (time / ROTATION_PERIOD) * 360;
    this.container.style.transform = `rotate(${angle}deg)`;
  }

  dispose(): void {
    this.container.remove();
  }
}
