/**
 * Дуги-«рисунок музыки» (отключены в Phase 2 — возвращаются за флагом ?trails=1).
 * Заглушка, чтобы не ломать сборку.
 */

export class Trails {
  private container: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  setScale(_scale: number, _dpr: number): void {}
  onDigit(_toDigit: number, _time: number): void {}
  setFeynman(_active: boolean, _time: number): void {}
  setFrozen(_frozen: boolean): void {}
  render(_time: number): void {}
  dispose(): void {
    this.container.remove();
  }
}
﻿
