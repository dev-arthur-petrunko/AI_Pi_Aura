import { describe, expect, it } from 'vitest';
import { anchorPos } from '../src/gfx/ripples.ts';

describe('anchorPos: якоря цифр на окружности', () => {
  it('цифра 0 — вверху (angle = -90°)', () => {
    const a = anchorPos(0, 100, 100, 50);
    expect(a.x).toBeCloseTo(100, 4);
    expect(a.y).toBeCloseTo(50, 4); // cy - R
  });

  it('цифра 5 — внизу (angle = -90° + 180° = 90°)', () => {
    const a = anchorPos(5, 100, 100, 50);
    expect(a.x).toBeCloseTo(100, 4);
    expect(a.y).toBeCloseTo(150, 4); // cy + R
  });

  it('цифры распределены через 36° по окружности', () => {
    const cx = 200;
    const cy = 200;
    const R = 100;
    const pts = [];
    for (let d = 0; d < 10; d++) {
      pts.push(anchorPos(d, cx, cy, R));
    }
    // соседние точки на расстоянии 2*R*sin(18°) ≈ 61.8
    const step = 2 * R * Math.sin(Math.PI / 10);
    for (let i = 0; i < 10; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % 10];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      expect(dist).toBeCloseTo(step, 4);
    }
    // все точки на расстоянии R от центра
    for (const p of pts) {
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(R, 4);
    }
  });

  it('некорректные цифры clampются к 0..9', () => {
    const a1 = anchorPos(-1, 0, 0, 10);
    const a2 = anchorPos(0, 0, 0, 10);
    expect(a1).toEqual(a2);
    const a3 = anchorPos(99, 0, 0, 10);
    const a4 = anchorPos(9, 0, 0, 10);
    expect(a3).toEqual(a4);
  });
});
