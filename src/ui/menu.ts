/**
 * Стеклянный bottom sheet: язык, звук, гамма, скорость, сохранить,
 * про π, начать сначала. role="dialog", aria-modal, клавиатура.
 */

import { getLang, onLangChange, setLang, t, type Lang } from '../i18n/index.ts';
import type { ScaleId } from '../audio/scales.ts';

export interface MenuState {
  volume: number;
  muted: boolean;
  scale: ScaleId;
  speed: number;
}

export interface MenuActions {
  onVolume(v: number): void;
  onMute(m: boolean): void;
  onScale(s: ScaleId): void;
  onSpeed(s: number): void;
  onSave(): void;
  onRestart(): void;
  onLang(l: Lang): void;
}

const STORE = {
  volume: 'pi.volume',
  muted: 'pi.muted',
  scale: 'pi.scale',
  speed: 'pi.speed',
} as const;

function storeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storeSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* нет storage */
  }
}

export function loadState(): MenuState {
  const num = (k: string, d: number): number => {
    const raw = storeGet(k);
    if (raw === null) return d;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : d;
  };
  return {
    volume: Math.min(1, Math.max(0, num(STORE.volume, 0.8))),
    muted: storeGet(STORE.muted) === '1',
    scale: storeGet(STORE.scale) === 'minor' ? 'minor' : 'major',
    speed: Math.min(2, Math.max(0.5, num(STORE.speed, 1))),
  };
}

export class Menu {
  private sheet: HTMLElement;
  private backdrop: HTMLElement;
  private confirmTimer = 0;
  private actions: MenuActions;
  private state: MenuState;

  constructor(root: HTMLElement, state: MenuState, actions: MenuActions) {
    this.state = state;
    this.actions = actions;

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'menu-backdrop';
    this.backdrop.id = 'menu-backdrop';

    this.sheet = document.createElement('section');
    this.sheet.className = 'menu-sheet glass';
    this.sheet.id = 'menu-sheet';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.sheet.setAttribute('aria-hidden', 'true');
    this.sheet.setAttribute('aria-label', t('menu.title'));

    root.appendChild(this.backdrop);
    root.appendChild(this.sheet);
    this.render();
    onLangChange(() => this.render());

    this.backdrop.addEventListener('click', () => this.close());
    document.addEventListener('keydown', this.onKey);
    let startY = 0;
    this.sheet.addEventListener(
      'pointerdown',
      (e) => {
        startY = e.clientY;
      },
      { passive: true },
    );
    this.sheet.addEventListener(
      'pointerup',
      (e) => {
        if (e.clientY - startY > 70) this.close();
      },
      { passive: true },
    );
  }

  get isOpen(): boolean {
    return this.sheet.classList.contains('is-open');
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen) {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key === 'Tab' && this.isOpen) {
      const focusables = this.sheet.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  open(): void {
    this.sheet.classList.add('is-open');
    this.backdrop.classList.add('is-visible');
    this.sheet.setAttribute('aria-hidden', 'false');
    const first = this.sheet.querySelector<HTMLElement>('button, input');
    first?.focus();
  }

  close(): void {
    this.sheet.classList.remove('is-open');
    this.backdrop.classList.remove('is-visible');
    this.sheet.setAttribute('aria-hidden', 'true');
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private render(): void {
    const s = this.state;
    const lang = getLang();
    this.sheet.setAttribute('aria-label', t('menu.title'));
    this.sheet.innerHTML = `
      <div class="menu-handle" aria-hidden="true"></div>
      <h2 class="menu-title">${t('menu.title')}</h2>

      <div class="menu-group">
        <span class="menu-label" id="lb-lang">${t('menu.language')}</span>
        <div class="segment" role="radiogroup" aria-labelledby="lb-lang">
          <button class="segment__btn ${lang === 'uk' ? 'is-active' : ''}" data-lang="uk" role="radio" aria-checked="${lang === 'uk'}">УКР</button>
          <button class="segment__btn ${lang === 'en' ? 'is-active' : ''}" data-lang="en" role="radio" aria-checked="${lang === 'en'}">ENG</button>
        </div>
      </div>

      <div class="menu-group">
        <span class="menu-label" id="lb-sound">${t('menu.sound')}</span>
        <div class="menu-row">
          <button class="icon-btn" id="btn-mute" aria-label="${t('menu.sound')}" aria-pressed="${s.muted}">${s.muted ? '🔇' : '🔊'}</button>
          <input type="range" id="volume" min="0" max="100" value="${Math.round(s.volume * 100)}" aria-labelledby="lb-sound" />
        </div>
      </div>

      <div class="menu-group">
        <span class="menu-label" id="lb-scale">${t('menu.scale')}</span>
        <div class="segment" role="radiogroup" aria-labelledby="lb-scale">
          <button class="segment__btn ${s.scale === 'major' ? 'is-active' : ''}" data-scale="major" role="radio" aria-checked="${s.scale === 'major'}">${t('menu.scale.major')}</button>
          <button class="segment__btn ${s.scale === 'minor' ? 'is-active' : ''}" data-scale="minor" role="radio" aria-checked="${s.scale === 'minor'}">${t('menu.scale.minor')}</button>
        </div>
      </div>

      <div class="menu-group">
        <span class="menu-label" id="lb-speed">${t('menu.speed')} · <span id="speed-val">${speedLabel(s.speed)}</span></span>
        <input type="range" id="speed" min="50" max="200" step="25" value="${Math.round(s.speed * 100)}" aria-labelledby="lb-speed" />
      </div>

      <div class="menu-actions">
        <button class="text-btn" id="btn-save">${t('menu.save')}</button>
        <details class="about">
          <summary class="text-btn" id="btn-about">${t('menu.about')}</summary>
          <p class="about-text">${t('about.text')}</p>
        </details>
        <button class="text-btn text-btn--danger" id="btn-restart">${t('menu.restart')}</button>
      </div>

      <button class="menu-close" id="btn-close" aria-label="${t('menu.close')}">${t('menu.close')}</button>
    `;

    this.bind();
  }

  private bind(): void {
    const q = <T extends HTMLElement>(sel: string): T | null =>
      this.sheet.querySelector<T>(sel);

    q<HTMLButtonElement>('#btn-close')?.addEventListener('click', () => this.close());

    this.sheet.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) =>
      b.addEventListener('click', () => {
        const l = b.dataset.lang as Lang;
        setLang(l);
        this.actions.onLang(l);
      }),
    );

    this.sheet.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach((b) =>
      b.addEventListener('click', () => {
        const sc = b.dataset.scale as ScaleId;
        this.state.scale = sc;
        storeSet(STORE.scale, sc);
        this.actions.onScale(sc);
      }),
    );

    const vol = q<HTMLInputElement>('#volume');
    vol?.addEventListener('input', () => {
      const v = Number(vol.value) / 100;
      this.state.volume = v;
      if (v > 0 && this.state.muted) {
        this.state.muted = false;
        storeSet(STORE.muted, '0');
        this.actions.onMute(false);
      }
      storeSet(STORE.volume, String(v));
      this.actions.onVolume(v);
    });

    const mute = q<HTMLButtonElement>('#btn-mute');
    mute?.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      storeSet(STORE.muted, this.state.muted ? '1' : '0');
      this.actions.onMute(this.state.muted);
      this.render();
    });

    const speed = q<HTMLInputElement>('#speed');
    speed?.addEventListener('input', () => {
      const v = Number(speed.value) / 100;
      this.state.speed = v;
      storeSet(STORE.speed, String(v));
      const label = q<HTMLElement>('#speed-val');
      if (label) label.textContent = speedLabel(v);
      this.actions.onSpeed(v);
    });

    q<HTMLButtonElement>('#btn-save')?.addEventListener('click', () => {
      this.actions.onSave();
    });

    const restart = q<HTMLButtonElement>('#btn-restart');
    restart?.addEventListener('click', () => {
      if (restart.classList.contains('is-confirming')) {
        clearTimeout(this.confirmTimer);
        restart.classList.remove('is-confirming');
        restart.textContent = t('menu.restart');
        this.actions.onRestart();
      } else {
        restart.classList.add('is-confirming');
        restart.textContent = t('menu.restart.confirm');
        this.confirmTimer = window.setTimeout(() => {
          restart.classList.remove('is-confirming');
          restart.textContent = t('menu.restart');
        }, 4000);
      }
    });
  }

  /** Обновить подпись скорости (напр. свайпом). */
  setSpeedUi(v: number): void {
    this.state.speed = v;
    storeSet(STORE.speed, String(v)); // сохраняем и свайп/клавиши, не только ползунок
    const label = this.sheet.querySelector<HTMLElement>('#speed-val');
    if (label) label.textContent = speedLabel(v);
    const input = this.sheet.querySelector<HTMLInputElement>('#speed');
    if (input) input.value = String(Math.round(v * 100));
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey);
    this.sheet.remove();
    this.backdrop.remove();
  }
}

function speedLabel(v: number): string {
  return `${String(Math.round(v * 100) / 100)}×`;
}
