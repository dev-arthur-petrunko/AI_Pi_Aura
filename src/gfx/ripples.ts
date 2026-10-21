/**
 * Планировщик капель: собирает запросы на капли от звука и взаимодействия,
 * отдаёт их в симуляцию воды (Sim). Больше ничего не рисует.
 *
 * Каждая капля: позиция, время рождения, цифра (для цвета подсветки плитки),
 * радиус и сила (зависят от высоты ноты).
 *
 * Формулы позиции/силы/радиуса — из образца reference-water.html.
 */

/**
 * Чистая функция: позиция капли (в нормализованных координатах 0..1)
 * на плитке текущей цифры. Капля падает на плитку, а не по высоте ноты.
 * panelFrac — доля ширины экрана, занятая левой панелью (0..1).
 * col — колонка текущей цифры (i % 16).
 */
export function tilePos(
  i: number,
  w: number,
  h: number,
  panelFrac: number,
): { x: number; y: number } {
  const z = Math.max(h / 9, w * (1 - panelFrac) / 16);
  const col = i % 16;
  return {
    x: 0.5 + panelFrac / 2 + (col + 0.5 - 8) * z / w,
    y: 0.58 + (col / 16) * z / h,
  };
}

export const DROP_LIFETIME = 6.0;

export function hashPos(i: number): { x: number; y: number } {
  const f = (n: number): number => {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };
  return { x: 0.08 + f(i + 1) * 0.84, y: 0.12 + f(i + 7.13) * 0.76 };
}

export interface Drop {
  x: number; // нормализовано 0..1
  y: number; // нормализовано 0..1
  birth: number; // часы sync
  code: number; // цифра 0–9
  radius: number; // радиус волны (0..1)
  strength: number; // сила (0..1)
}

/** Чистая функция: параметры капли для цифры d по формулам из образца.
 *  panelFrac — доля ширины экрана, занятая левой панелью (0..1).
 *  repeat — цифра повторилась подряд (сила ×1.8).
 */
export function dropParams(
  d: number,
  idx: number,
  repeat: boolean,
  panelFrac: number,
): { x: number; y: number; R: number; K: number } {
  const { x, y } = tilePos(idx, 1200, 800, panelFrac); // placeholder dims; real dims passed separately
  const R = 0.075 - 0.045 * (d / 9);
  const K = (0.026 - 0.012 * (d / 9)) * (repeat ? 1.8 : 1);
  return { x, y, R, K };
}

export interface RippleDrop {
  x: number; // нормализовано 0..1
  y: number; // нормализовано 0..1
  birth: number; // часы sync
  code: number; // цифра 0–9
  radius: number; // радиус волны (0..1)
  strength: number; // сила (0..1)
}

export class Ripples {
  private drops: RippleDrop[] = [];

  /** Добавить каплю по детерминированной позиции цифры (якорь + сдвиг). Возвращает созданную каплю. */
  addAtIndex(index: number, code: number, time: number, weight = 0.7): RippleDrop {
    const p = hashPos(index);
    // якорь цифры по x: низкие ноты слева, высокие справа
    const ax = 0.15 + 0.70 * (code / 9);
    // небольшой детерминированный разброс, чтобы кольца не слипались
    const sx = (p.x - 0.5) * 0.04;
    const sy = (p.y - 0.5) * 0.04;
    const x = ax + sx;
    const y = 0.5 + sy;
    // сила и радиус зависят от веса (ноты): низкая нота = больше и сильнее
    const strength = 0.06 + weight * 0.10;
    const radius = 0.08 + weight * 0.12;
    const drop: RippleDrop = { x, y, birth: time, code, radius, strength };
    this.drops.push(drop);
    return drop;
  }

  /** Добавить каплю в точку (x, y). */
  add(x: number, y: number, code: number, time: number, weight = 0.7): void {
    const strength = 0.06 + weight * 0.10;
    const radius = 0.08 + weight * 0.12;
    this.drops.push({ x, y, birth: time, code, radius, strength });
  }

  /** Возвращает копию активных капель для передачи в Sim. */
  getDrops(): RippleDrop[] {
    return [...this.drops];
  }

  clear(): void {
    this.drops = [];
  }

  prune(time: number): void {
    if (this.drops.length === 0) return;
    const cutoff = time - DROP_LIFETIME;
    const keep = this.drops.filter((d) => d.birth > cutoff);
    if (keep.length !== this.drops.length) this.drops = keep;
  }

  get count(): number {
    return this.drops.length;
  }
}

