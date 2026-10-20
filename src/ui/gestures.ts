/**
 * Жесты (pointer events, единый ввод мышь/палец):
 * - тап → капля-нота;
 * - свайп вверх/вниз → скорость;
 * - удержание 600 мс → «заморозка»;
 * - клавиатура: Space — пауза, M — меню, ←/→ — скорость, Esc — закрыть;
 * - гироскоп (DeviceOrientation) → сдвиг бликов; на iOS — requestPermission по касанию.
 */

export interface GestureCallbacks {
  onFirstTouch(): void;
  onTap(x: number, y: number): void;
  onSwipe(up: boolean): void;
  onFreeze(): void;
  onMenuToggle(): void;
  onClose(): void;
  onSpeedKey(dir: 1 | -1): void;
  onTilt(alpha: number, beta: number): void;
}

const LONG_PRESS_MS = 600;
const SWIPE_MIN = 60;

export class Gestures {
  private cbs: GestureCallbacks;
  private started = false;
  private downX = 0;
  private downY = 0;
  private moved = false;
  private longTimer = 0;
  private longFired = false;
  private pointerId = -1;
  private orientationAsked = false;

  constructor(target: HTMLElement, cbs: GestureCallbacks) {
    this.cbs = cbs;
    target.style.touchAction = 'none';

    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    document.addEventListener('keydown', this.onKey);
  }

  /** Разрешение на гироскоп — только по жесту (iOS). */
  requestOrientation(): void {
    if (this.orientationAsked) return;
    this.orientationAsked = true;
    type WithPerm = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    const D = window.DeviceOrientationEvent as WithPerm | undefined;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission()
        .then((res) => {
          if (res === 'granted') window.addEventListener('deviceorientation', this.onOrient);
        })
        .catch(() => {
          /* отказ — тихо работаем без наклона */
        });
    } else if (D) {
      window.addEventListener('deviceorientation', this.onOrient);
    }
  }

  private onOrient = (e: DeviceOrientationEvent): void => {
    if (e.alpha === null || e.beta === null) return;
    this.cbs.onTilt(e.alpha, e.beta);
  };

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== -1) return;
    this.pointerId = e.pointerId;
    this.downX = e.clientX;
    this.downY = e.clientY;
    this.moved = false;
    this.longFired = false;
    if (!this.started) {
      this.started = true;
      this.cbs.onFirstTouch();
      this.requestOrientation();
    }
    clearTimeout(this.longTimer);
    this.longTimer = window.setTimeout(() => {
      if (!this.moved) {
        this.longFired = true;
        this.cbs.onFreeze();
      }
    }, LONG_PRESS_MS);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    if (
      Math.abs(e.clientX - this.downX) > 12 ||
      Math.abs(e.clientY - this.downY) > 12
    ) {
      this.moved = true;
      clearTimeout(this.longTimer);
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = -1;
    clearTimeout(this.longTimer);
    if (this.longFired) return;

    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;

    if (Math.abs(dy) > SWIPE_MIN && Math.abs(dy) > Math.abs(dx)) {
      this.cbs.onSwipe(dy < 0); // вверх → быстрее
      return;
    }
    if (this.moved) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const y = 1 - (e.clientY - rect.top) / Math.max(rect.height, 1);
    this.cbs.onTap(x, y);
  };

  private onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (!this.started && (e.key === ' ' || e.key === 'Enter')) {
      this.started = true;
      this.cbs.onFirstTouch();
      e.preventDefault();
      return;
    }
    switch (e.key) {
      case ' ':
        // пробел на кнопке — это activation кнопки, не пауза
        if (target && target.tagName === 'BUTTON') break;
        e.preventDefault();
        this.cbs.onFreeze();
        break;
      case 'm':
      case 'M':
      case 'ь':
      case 'Ь':
        this.cbs.onMenuToggle();
        break;
      case 'ArrowRight':
        this.cbs.onSpeedKey(1);
        break;
      case 'ArrowLeft':
        this.cbs.onSpeedKey(-1);
        break;
      case 'Escape':
        this.cbs.onClose();
        break;
    }
  };

  dispose(): void {
    clearTimeout(this.longTimer);
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('deviceorientation', this.onOrient);
  }
}
