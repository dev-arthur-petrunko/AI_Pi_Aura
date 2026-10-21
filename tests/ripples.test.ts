import { describe, expect, it } from 'vitest';
import { tilePos } from '../src/gfx/ripples.ts';

const W = 2000;
const H = 800;
const PF = 344 / W;

describe('tilePos: капля падает на плитку текущей цифры', () => {
  it('колонка 0 правее края панели (x > panelFrac)', () => {
    const { x } = tilePos(0, W, H, PF);
    expect(x).toBeGreaterThan(PF);
  });

  it('колонка 15 в пределах экрана (x < 1)', () => {
    const { x } = tilePos(15, W, H, PF);
    expect(x).toBeLessThan(1);
  });

  it('y растёт с колонкой', () => {
    const a = tilePos(0, W, H, PF);
    const b = tilePos(15, W, H, PF);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it('без панели (panelFrac=0) колонка 0 в левой части', () => {
    const { x } = tilePos(0, W, H, 0);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.5);
  });

  it('x в диапазоне 0..1 для всех колонок', () => {
    for (let i = 0; i < 16; i++) {
      const { x } = tilePos(i, W, H, PF);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
    }
  });
});