/**
 * Массив активных капель: не больше MAX_DROPS одновременно,
 * позиция детерминирована от индекса цифры (хеш из ТЗ).
 * Данные отдаются в шейдер как uniform-массив vec4(x, y, birth, code).
 */

export const MAX_DROPS = 24;

/** Максимальный возраст капли, секунды. После — капля исчезает совсем. */
export const DROP_LIFETIME = 9.0;

/** Детерминированный pseudo-random: одна и та же цифра на одной позиции — одно место. */
export function hashPos(i: number): { x: number; y: number } {
  const f = (n: number): number => {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  };
  // отбрасываем края, чтобы капли не падали под HUD
  return { x: 0.08 + f(i + 1) * 0.84, y: 0.12 + f(i + 7.13) * 0.76 };
}

export interface Drop {
  x: number;
  y: number;
  birth: number; // часы синхронизации (audioCtx.currentTime)
  code: number; // цифра 0–9 → цвет из палитры
  weight: number; // «вес» капли (0..1) — сила кольца/метабола
}

export class Ripples {
  private drops: Drop[] = [];

  add(x: number, y: number, code: number, time: number, weight = 0.7): void {
    this.drops.push({ x, y, birth: time, code, weight });
    // старые капли вытесняются — не больше MAX_DROPS
    while (this.drops.length > MAX_DROPS) this.drops.shift();
  }

  /** Капля по индексу цифры: детерминированное место. */
  addAtIndex(index: number, code: number, time: number, weight = 0.7): void {
    const p = hashPos(index);
    this.add(p.x, p.y, code, time, weight);
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
}
