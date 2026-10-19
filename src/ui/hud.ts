/**
 * HUD: подсказка первого касания, счётчик цифр снизу,
 * временные сообщения (точка Фейнмана, «resume», «infinite»).
 */

import { formatNum, onLangChange, t, type TKey } from '../i18n/index.ts';

export class Hud {
  private root: HTMLElement;
  private intro: HTMLElement;
  private counter: HTMLElement;
  private toast: HTMLElement;
  private pulse: HTMLElement;
  private digit = 0;
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-intro" id="intro" role="status">
        <span class="hud-intro__text"></span>
      </div>
      <div class="hud-bottom">
        <span class="hud-counter" id="counter" aria-live="polite"></span>
        <button class="hud-menu-dot" id="menu-dot" aria-label="" aria-haspopup="dialog">◌</button>
      </div>
      <div class="hud-toast" id="toast" role="status" aria-live="polite"></div>
      <div class="hud-pulse" id="pulse" aria-hidden="true"></div>
    `;
    this.intro = root.querySelector('#intro') as HTMLElement;
    this.counter = root.querySelector('#counter') as HTMLElement;
    this.toast = root.querySelector('#toast') as HTMLElement;
    this.pulse = root.querySelector('#pulse') as HTMLElement;
    this.apply();
    onLangChange(() => this.apply());
  }

  private apply(): void {
    (this.intro.querySelector('.hud-intro__text') as HTMLElement).textContent =
      t('intro.touch');
    this.renderCounter();
    const dot = this.root.querySelector('#menu-dot') as HTMLElement;
    dot.setAttribute('aria-label', t('menu.title'));
  }

  private renderCounter(): void {
    this.counter.textContent = t('hud.digit', {
      n: formatNum(this.digit + 1),
    });
  }

  get menuButton(): HTMLElement {
    return this.root.querySelector('#menu-dot') as HTMLElement;
  }

  /** Обновить счётчик цифр (n — номер текущей цифры с 0). */
  setDigit(n: number): void {
    this.digit = n;
    this.renderCounter();
  }

  hideIntro(): void {
    this.intro.classList.add('is-hidden');
  }

  showIntro(): void {
    this.intro.classList.remove('is-hidden');
  }

  /** Короткое локализованное сообщение по центру. */
  flash(key: TKey, params?: Record<string, string | number>, ms = 4200): void {
    this.toast.textContent = t(key, params);
    this.toast.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
    }, ms);
  }

  /** Произвольная строка (напр. «0.8×» при свайпе). */
  flashRaw(text: string, ms = 900): void {
    this.toast.textContent = text;
    this.toast.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
    }, ms);
  }

  /** Пульс ядра π в такт ноте. */
  beat(): void {
    this.pulse.classList.remove('is-beating');
    // форсируем reflow, чтобы анимация перезапускалась
    void this.pulse.offsetWidth;
    this.pulse.classList.add('is-beating');
  }

  setFrozenLabel(digits: number[] | null): void {
    if (!digits) {
      this.toast.classList.remove('is-visible');
      return;
    }
    this.toast.textContent = `${t('gesture.freeze')}: ${digits.join(' · ')}`;
    this.toast.classList.add('is-visible');
  }
}
