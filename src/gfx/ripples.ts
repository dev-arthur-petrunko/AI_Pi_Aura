/**
 * Массив активных капель: не больше MAX_DROPS одновременно,
 * позиция детерминирована от индекса цифры (хеш из ТЗ).
 * Данные отдаются в шейдер как uniform-массив vec4(x, y, birth, code).
 *
 * Новое: положение капли зависит от значения цифры. Якорь цифры d лежит на
 * окружности радиуса R вокруг центра под углом -90° + d*36° (0 — сверху,
 * по часовой). К якорю добавляется маленький детерминированный сдвиг
 * (до 0.04·R) из hashPos(i), чтобы кольца не слипались.
 * Кроме того, 10 якорь-точек (по одной на цифру) постоянно видны едва заметно.
 */

export const MAX_DROPS = 24;

/** Максимальный возраст капли, секунды. После — капля исчезает совсем. */
export const DROP_LIFETIME = 6.0;

/** Радиус окружности якорей в долях min(w, h). */
export const ANCHOR_RADIUS = 0.30;

/** Базовая прозрачность якорь-точки. */
export const ANCHOR_ALPHA = 0.25;

/** Детерминированный pseudo-random: одна и та же цифра на одной позиции — одно место. */
export function hashPos(i: number): { x: number; y: number } {
  const f = (n: number): number => {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };
  // отбрасываем края, чтобы капли не падали под HUD
  return { x: 0.08 + f(i + 1) * 0.84, y: 0.12 + f(i + 7.13) * 0.76 };
}

/**
 * Якорь цифры d на окружности радиуса R с центром (cx, cy).
 * Угол = -90° + d·36°: цифра 0 — вверху, далее по часовой.
 * Возвращает координаты в тех же единицах, что и cx, cy, R (пиксели).
 */
export function anchorPos(
  d: number,
  cx: number,
  cy: number,
  R: number,
): { x: number; y: number } {
  const digit = Math.min(9, Math.max(0, Math.round(d)));
  const angle = -Math.PI / 2 + digit * (Math.PI * 0.2); // -90° + d*36°
  return { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
}

export interface Drop {
  x: number;
  y: number;
  birth: number; // часы синхронизации (audioCtx.currentTime)
  code: number; // цифра 0–9 → цвет из палитры
  weight: number; // «вес» капли (0..1) — сила кольца/метабола
}

export interface Anchor {
  x: number; // нормализовано 0..1
  y: number; // нормализовано 0..1
  code: number; // цифра 0–9
}

export class Ripples {
  private drops: Drop[] = [];
  private anchors: Anchor[] = [];
  private w = 0;
  private h = 0;

  /** Задать размер холста (пиксели). Пересчитывает якоря цифр. */
  setViewport(width: number, height: number): void {
    this.w = width;
    this.h = height;
    this.computeAnchors();
  }

  private computeAnchors(): void {
    if (this.w <= 0 || this.h <= 0) {
      this.anchors = [];
      return;
    }
    const cx = this.w / 2;
    const cy = this.h / 2;
    const R = Math.min(this.w, this.h) * ANCHOR_RADIUS;
    this.anchors = [];
    for (let d = 0; d < 10; d++) {
      const a = anchorPos(d, cx, cy, R);
      this.anchors.push({ x: a.x / this.w, y: a.y / this.h, code: d });
    }
  }

  get anchorCount(): number {
    return this.anchors.length;
  }

  /** Якорь цифры d (нормализованные координаты), либо null. */
  anchorForDigit(d: number): Anchor | null {
    const digit = Math.min(9, Math.max(0, Math.round(d)));
    return this.anchors[digit] ?? null;
  }

  add(x: number, y: number, code: number, time: number, weight = 0.7): void {
    this.drops.push({ x, y, birth: time, code, weight });
    // старые капли вытесняются — не больше MAX_DROPS
    while (this.drops.length > MAX_DROPS) this.drops.shift();
  }

  /**
   * Капля по индексу цифры: якорь цифры + детерминированный сдвиг из hashPos(i).
   * index — порядковый номер цифры в потоке, code — значение цифры (якорь).
   */
  addAtIndex(index: number, code: number, time: number, weight = 0.7): void {
    let x: number;
    let y: number;
    if (this.anchors.length === 10 && this.w > 0 && this.h > 0) {
      const anchor = this.anchors[code];
      const R = Math.min(this.w, this.h) * ANCHOR_RADIUS;
      const shift = 0.04 * R;
      const p = hashPos(index);
      const sx = (p.x - 0.5) * 2 * shift; // [-shift, +shift]
      const sy = (p.y - 0.5) * 2 * shift;
      x = (anchor.x * this.w + sx) / this.w;
      y = (anchor.y * this.h + sy) / this.h;
    } else {
      const p = hashPos(index);
      x = p.x;
      y = p.y;
    }
    this.add(x, y, code, time, weight);
  }

  clear(): void {
    this.drops = [];
  }

  /**
   * Убирает капли старше DROP_LIFETIME.
   * Без этого за 5 минут набирается 24 кольца и кадр превращается в паутину.
   */
  prune(time: number): void {
    if (this.drops.length === 0) return;
    const cutoff = time - DROP_LIFETIME;
    const keep = this.drops.filter((d) => d.birth > cutoff);
    if (keep.length !== this.drops.length) this.drops = keep;
  }

  get count(): number {
    return this.drops.length;
  }

  /** Заполняет Float32Array(24*4): x, y, birth, code*10 + weight. */
  write(target: Float32Array): void {
    target.fill(0);
    const n = Math.min(this.drops.length, MAX_DROPS);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      const o = i * 4;
      target[o] = d.x;
      target[o + 1] = d.y;
      target[o + 2] = d.birth;
      target[o + 3] = d.code + Math.min(0.99, Math.max(0, d.weight)); // целая часть — цифра, дробная — вес
    }
  }

  /**
   * Заполняет Float32Array(10*4): x, y, code, baseAlpha (0.25) для 10 якорей.
   * В шейдере вспышка ячейки playing-цифры считается по uFlashDigit/uFlashTime.
   */
  writeAnchors(target: Float32Array): void {
    target.fill(0);
    const n = Math.min(this.anchors.length, 10);
    for (let i = 0; i < n; i++) {
      const a = this.anchors[i];
      const o = i * 4;
      target[o] = a.x;
      target[o + 1] = a.y;
      target[o + 2] = a.code;
      target[o + 3] = ANCHOR_ALPHA;
    }
  }
}
