/**
 * Левая панель «интерфейс сбоку» (Phase 2).
 * Ширина ≥ 1000 px: стеклянная панель 320 px, отступ 24 px.
 * Ширина < 1000 px: свёрнута — только название в углу + лента внизу.
 * Все значения синхронизируются с audioCtx.currentTime.
 */

import { formatNum, getLang, onLangChange, t } from '../i18n/index.ts';

declare const __BUILD_ID__: string;
const BUILD_ID = __BUILD_ID__;

const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>';
const SOUND = '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 010 7"/></svg>';

const BREAKPOINT = 900;
const HISTORY_LIMIT = 200;
const FEYNMAN_INDEX = 762 - 1; // индекс (с 0) начала «999999»

const DIGIT_NOTES: Record<number, string> = {
  0: 'До', 1: 'Ре', 2: 'Мі', 3: 'Соль', 4: 'Ля',
  5: 'До', 6: 'Ре', 7: 'Мі', 8: 'Соль', 9: 'Ля',
};
const DIGIT_NOTES_EN: Record<number, string> = {
  0: 'C', 1: 'D', 2: 'E', 3: 'G', 4: 'A',
  5: 'C', 6: 'D', 7: 'E', 8: 'G', 9: 'A',
};

function isEn(): boolean {
  return typeof navigator !== 'undefined' && (navigator.language ?? '').toLowerCase().startsWith('en');
}

export class Panel {
  private panel: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private digitBig: HTMLElement;
  private digitNote: HTMLElement;
  private digitDot: HTMLElement;
  private tapeEl: HTMLElement;
  private counterEl: HTMLElement;
  private histBars: HTMLElement[] = [];
  private feynmanEl: HTMLElement;
  private footer: HTMLElement;
  private themeBtn: HTMLElement;
  private soundBtn: HTMLElement;
  private langBtn: HTMLElement;
  private menuBtn: HTMLElement;
  private menuFab: HTMLElement;
  private copyLinkBtn: HTMLElement;
  private dateBtn: HTMLElement;
  private verEl: HTMLElement;
  private versionCorner: HTMLElement;
  private introEl: HTMLElement;
  private theme: 'day' | 'night' = 'day';
  public onThemeChange?: (theme: 'day' | 'night') => void;
  public onMenuToggle?: () => void;
  public onDateOpen?: () => void;

  private history: number[] = [];
  private histCounts = new Array(10).fill(0);
  private wide = true;
  private currentDigit = -1;
  private currentIndex = -1;

  constructor(_root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.style.position = 'fixed';
    this.panel.style.pointerEvents = 'auto';
    this.panel.style.zIndex = '10';
    this.panel.style.transition =
      'all 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
    _root.appendChild(this.panel);

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'panel-title';
    this.titleEl.textContent = 'π · Aura';
    this.panel.appendChild(this.titleEl);

    this.subEl = document.createElement('div');
    this.subEl.className = 'panel-sub';
    this.subEl.textContent = t('title.sub');
    this.panel.appendChild(this.subEl);

    this.digitBig = document.createElement('div');
    this.digitBig.className = 'panel-digit-big';
    this.digitBig.textContent = '–';
    this.panel.appendChild(this.digitBig);

    this.digitNote = document.createElement('div');
    this.digitNote.className = 'panel-digit-note';
    this.digitNote.style.display = 'flex';
    this.digitNote.style.alignItems = 'center';
    this.digitNote.style.gap = '8px';

    this.digitDot = document.createElement('div');
    this.digitDot.className = 'panel-digit-dot';
    this.digitNote.appendChild(this.digitDot);

    const noteText = document.createElement('span');
    noteText.className = 'panel-note-text';
    noteText.textContent = '–';
    this.digitNote.appendChild(noteText);
    this.panel.appendChild(this.digitNote);

    this.tapeEl = document.createElement('div');
    this.tapeEl.className = 'panel-tape';
    this.panel.appendChild(this.tapeEl);

    this.counterEl = document.createElement('div');
    this.counterEl.className = 'panel-counter';
    this.panel.appendChild(this.counterEl);

    // гистограмма
    const histLabel = document.createElement('div');
    histLabel.className = 'panel-hist-label';
    histLabel.textContent = t('panel.hist');
    this.panel.appendChild(histLabel);

    const histWrap = document.createElement('div');
    histWrap.className = 'panel-hist';
    for (let d = 0; d < 10; d++) {
      const bar = document.createElement('div');
      bar.className = 'panel-hist-bar';
      bar.dataset.digit = String(d);
      const label = document.createElement('div');
      label.className = 'panel-hist-label-digit';
      label.textContent = String(d);
      bar.appendChild(label);
      histWrap.appendChild(bar);
      this.histBars.push(bar);
    }
    this.panel.appendChild(histWrap);

    this.feynmanEl = document.createElement('div');
    this.feynmanEl.className = 'panel-feynman';
    this.panel.appendChild(this.feynmanEl);

    // футер
    this.footer = document.createElement('div');
    this.footer.className = 'panel-footer';
    this.panel.appendChild(this.footer);

    this.themeBtn = document.createElement('button');
    this.themeBtn.className = 'panel-btn';
    this.themeBtn.innerHTML = this.theme === 'day' ? MOON : SUN;
    this.themeBtn.setAttribute('aria-label', t('theme.day'));
    this.themeBtn.addEventListener('click', () => {
      const next = this.theme === 'day' ? 'night' : 'day';
      this.setTheme(next);
      try { localStorage.setItem('pi.theme', next); } catch { /* ignore */ }
      this.onThemeChange?.(next);
    });
    this.footer.appendChild(this.themeBtn);

    this.soundBtn = document.createElement('button');
    this.soundBtn.className = 'panel-btn';
    this.soundBtn.innerHTML = SOUND;
    this.soundBtn.setAttribute('aria-label', t('menu.sound'));
    this.footer.appendChild(this.soundBtn);

    this.langBtn = document.createElement('button');
    this.langBtn.className = 'panel-btn';
    this.langBtn.textContent = getLang() === 'uk' ? 'УКР' : 'ENG';
    this.langBtn.setAttribute('aria-label', t('menu.language'));
    this.footer.appendChild(this.langBtn);

    // Кнопка меню (три точки)
    this.menuBtn = document.createElement('button');
    this.menuBtn.className = 'panel-btn';
    this.menuBtn.innerHTML = '⋯';
    this.menuBtn.setAttribute('aria-label', t('menu.title'));
    this.menuBtn.setAttribute('aria-haspopup', 'dialog');
    this.menuBtn.addEventListener('click', () => this.onMenuToggle?.());
    this.footer.appendChild(this.menuBtn);

    // Кнопка даты
    this.dateBtn = document.createElement('button');
    this.dateBtn.className = 'panel-btn';
    this.dateBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    this.dateBtn.setAttribute('aria-label', t('date.title'));
    this.dateBtn.addEventListener('click', () => this.onDateOpen?.());
    this.footer.appendChild(this.dateBtn);

    // E4: copy link button
    this.copyLinkBtn = document.createElement('button');
    this.copyLinkBtn.className = 'panel-btn';
    this.copyLinkBtn.textContent = '🔗';
    this.copyLinkBtn.setAttribute('aria-label', 'Copy link');
    this.copyLinkBtn.addEventListener('click', () => {
      const url = `${window.location.origin}${window.location.pathname}#d=${this.currentIndex}`;
      try {
        navigator.clipboard?.writeText(url);
      } catch { /* ignore */ }
    });
    this.footer.appendChild(this.copyLinkBtn);

    this.verEl = document.createElement('span');
    this.verEl.className = 'panel-ver';
    this.verEl.textContent = `v3 · ${BUILD_ID}`;
    this.footer.appendChild(this.verEl);

    // Версия в углу экрана
    this.versionCorner = document.createElement('div');
    this.versionCorner.className = 'app-version';
    this.versionCorner.textContent = `v3 · ${BUILD_ID}`;
    _root.appendChild(this.versionCorner);

    // подсказка первого касания (стеклянная капсула, как в образце)
    this.introEl = document.createElement('div');
    this.introEl.id = 'intro';
    this.introEl.textContent = t('intro.touch');
    this.introEl.style.position = 'fixed';
    this.introEl.style.left = 'calc(50% + 172px)';
    this.introEl.style.top = '50%';
    this.introEl.style.transform = 'translate(-50%,-50%)';
    this.introEl.style.padding = '14px 24px';
    this.introEl.style.borderRadius = '999px';
    this.introEl.style.background = 'var(--glass)';
    this.introEl.style.border = '1px solid var(--glass-border)';
    this.introEl.style.backdropFilter = 'blur(20px)';

    this.introEl.style.fontSize = '15px';
    this.introEl.style.letterSpacing = '0.02em';
    this.introEl.style.transition = 'opacity 1s';
    this.introEl.style.pointerEvents = 'none';
    this.introEl.style.zIndex = '20';
    document.body.appendChild(this.introEl);

    try {
      const raw = localStorage.getItem('pi.hist');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length === 10) {
          this.histCounts = arr.map((n: any) => (Number.isFinite(n) ? n : 0));
        }
      }
    } catch { /* ignore */ }

    // Плавающая кнопка меню для узких экранов (телефоны)
    this.menuFab = document.createElement('button');
    this.menuFab.className = 'menu-fab';
    this.menuFab.innerHTML = '◌';
    this.menuFab.setAttribute('aria-label', t('menu.title'));
    this.menuFab.setAttribute('aria-haspopup', 'dialog');
    this.menuFab.addEventListener('click', () => this.onMenuToggle?.());
    document.body.appendChild(this.menuFab);

    this.setLayout(window.innerWidth);
    window.addEventListener('resize', () => this.setLayout(window.innerWidth));
    onLangChange(() => this.renderText());
  }
  private setLayout(width: number): void {
    this.wide = width >= BREAKPOINT;
    if (this.wide) {
      this.panel.style.left = '24px';
      this.panel.style.top = '24px';
      this.panel.style.bottom = '24px';
      this.panel.style.width = '320px';
      this.panel.style.transform = 'none';
      this.panel.style.backdropFilter = 'blur(24px) saturate(160%)';
      this.panel.style.background = 'var(--glass)';
      this.panel.style.border = '1px solid var(--glass-border)';
      this.panel.style.borderRadius = 'var(--radius)';
      this.panel.style.padding = '20px';
      this.panel.style.display = 'flex';
      this.panel.style.flexDirection = 'column';
      this.panel.style.gap = '14px';
      this.panel.style.overflow = 'hidden';
      this.panel.style.maxWidth = 'none';
      this.titleEl.style.display = 'block';
      this.subEl.style.display = 'block';
      this.digitBig.style.display = 'block';
      this.digitNote.style.display = 'block';
      this.digitDot.style.display = 'block';
      this.tapeEl.style.display = 'block';
      this.counterEl.style.display = 'block';
      this.footer.style.display = 'flex';
      this.footer.style.justifyContent = 'space-between';
      this.footer.style.marginTop = 'auto';
      this.menuFab.style.display = 'none';
    } else {
      this.panel.style.left = '12px';
      this.panel.style.top = '12px';
      this.panel.style.bottom = 'auto';
      this.panel.style.width = 'auto';
      this.panel.style.height = 'auto';
      this.panel.style.transform = 'none';
      this.panel.style.backdropFilter = 'blur(12px) saturate(160%)';
      this.panel.style.background = 'var(--glass)';
      this.panel.style.border = '1px solid var(--glass-border)'
      this.panel.style.borderRadius = 'var(--radius)'
      this.panel.style.padding = '10px'
      this.panel.style.display = 'flex';
      this.panel.style.flexDirection = 'column';
      this.panel.style.gap = '0';
      this.panel.style.overflow = 'visible';
      this.panel.style.maxWidth = 'calc(100vw - 36px)';
      this.panel.style.padding = '10px 14px 10px 10px';
      this.menuFab.style.display = 'grid';
      this.titleEl.style.display = 'block';
      this.subEl.style.display = 'none';
      this.digitBig.style.display = 'none';
      this.digitNote.style.display = 'none';
      this.digitDot.style.display = 'none';
      this.tapeEl.style.display = 'block';
      this.counterEl.style.display = 'none';
      this.footer.style.display = 'none';
    }
    if (this.currentDigit >= 0) {
      this.renderNow(this.currentDigit, this.currentIndex, []);
    }
  }

  /** Новая цифра сыграна. Вызывается из основного цикла под камеру звука. */
  update(digit: number, index: number, future: number[]): void {
    this.currentDigit = digit;
    this.currentIndex = index;
    this.history.push(digit);
    if (this.history.length > HISTORY_LIMIT) this.history = this.history.slice(-HISTORY_LIMIT);
    this.histCounts[digit]++;
    try { localStorage.setItem('pi.hist', JSON.stringify(this.histCounts)); } catch { /* ignore */ }
    this.renderNow(digit, index, future);
  }

  resetCounts(): void {
    this.histCounts = new Array(10).fill(0);
    try { localStorage.removeItem('pi.hist'); } catch { /* ignore */ }
    if (this.currentDigit >= 0) this.renderHistogram();
  }

  private renderNow(digit: number, index: number, future: number[]): void {
    const d = Math.min(9, Math.max(0, Math.round(digit)));
    const notes = isEn() ? DIGIT_NOTES_EN : DIGIT_NOTES;
    const octave = 4 + Math.floor(d / 5);
    const noteBase = notes[d];
    const noteLabel = isEn() ? `${noteBase}${octave}` : noteBase;

    this.digitBig.textContent = String(d);
    this.digitBig.style.color = 'var(--ink)';
    this.digitBig.style.textShadow = `0 0 24px var(--color-d${d})`;
    // fallback for alpha
    this.digitBig.style.setProperty('--glow', `var(--color-d${d})`);
    this.digitNote.querySelector('.panel-note-text')!.textContent = noteLabel;
    this.digitDot.style.backgroundColor = `var(--color-d${d})`;
    this.digitDot.style.opacity = '1';

    this.renderTape(digit, index, future);
    this.renderCounter(digit, index);
    this.renderHistogram();
    this.renderFeynman(index);
  }

  private renderTape(_digit: number, _index: number, future: number[]): void {
    const all = [...this.history, ...future];
    const show = 15;
    const start = Math.max(0, all.length - show);
    const chunk = all.slice(start);
    const currentAllIdx = this.history.length - 1;
    const parts: string[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const allIdx = start + i;
      const isCurrent = allIdx === currentAllIdx;
      const d = chunk[i];
      const cls = isCurrent ? 'panel-tape-current' : 'panel-tape-digit';
      const color = isCurrent ? 'var(--ink)' : 'var(--ink-dim)';
      parts.push(`<span class="${cls}" style="color:${color}; opacity:${isCurrent ? 1 : 0.45}">${d}</span>`);
      if ((i + 1) % 5 === 0 && i < chunk.length - 1) parts.push('<span class="panel-tape-sep">·</span>');
    }
    this.tapeEl.innerHTML = parts.join(' ');
  }

  private renderCounter(_digit: number, index: number): void {
    this.counterEl.textContent = t('panel.digitOf', { n: formatNum(index + 1) });
  }

  private renderHistogram(): void {
    const max = Math.max(1, ...this.histCounts);
    for (let d = 0; d < 10; d++) {
      const bar = this.histBars[d];
      const h = this.histCounts[d] / max;
      bar.style.height = `${Math.max(6, h * 40)}px`;
      if (d === this.currentDigit) {
        bar.style.background = `var(--color-d${d})`;
      } else {
        bar.style.background = 'linear-gradient(var(--bar), transparent)';
      }
      bar.style.opacity = '1';
    }
  }

  private renderFeynman(index: number): void {
    const FEYNman_INDEX = 762 - 1; // индекс с 0 для начала «999999»
    if (index < FEYNman_INDEX) {
      const remaining = FEYNman_INDEX - index;
      this.feynmanEl.textContent = t('panel.feynmanIn', { n: formatNum(remaining) });
      this.feynmanEl.style.opacity = '1';
    } else {
      this.feynmanEl.textContent = t('panel.feynmanDone');
      this.feynmanEl.style.opacity = '0.6';
    }
  }

  setTheme(theme: 'day' | 'night'): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    this.themeBtn.innerHTML = theme === 'day' ? MOON : SUN;
    this.theme = theme;
  }

  /** Скрыть подсказку первого касания. */
  hideIntro(): void {
    this.introEl.style.opacity = '0';
  }

  /** Новая цифра сыграна (публичный alias для update). */
  addDigit(digit: number, index: number, future: number[]): void {
    this.update(digit, index, future);
  }

  /** Отсчёт до точки Фейнмана (оставшееся количество цифр). */
  setFeynman(remaining: number): void {
    if (remaining <= 0) {
      this.feynmanEl.textContent = t('panel.feynmanDone');
      this.feynmanEl.style.opacity = '0.6';
      return;
    }
    this.feynmanEl.textContent = t('panel.feynmanIn', { n: formatNum(remaining) });
    this.feynmanEl.style.opacity = '1';
  }

  /** Точка Фейнмана пройдена. */
  setFeynmanDone(): void {
    this.feynmanEl.textContent = t('panel.feynmanDone');
    this.feynmanEl.style.opacity = '0.6';
  }

  /** Метка заморозки (последние цифры или null). */
  setFreezeLabel(digits: number[] | null): void {
    if (!digits) {
      this.feynmanEl.style.opacity = '0.6';
      return;
    }
    this.feynmanEl.textContent = `${t('gesture.freeze')}: ${digits.join(' · ')}`;
    this.feynmanEl.style.opacity = '1';
  }

  /** Обновить подпись скорости в UI. */
  setSpeedUi(v: number): void {
    const label = this.footer.querySelector('.panel-speed-val');
    if (label) label.textContent = `${Math.round(v * 100) / 100}×`;
  }

  /** Перерисовать текстовые элементы при смене языка. */
  renderText(): void {
    this.subEl.textContent = t('title.sub');
    this.introEl.textContent = t('intro.touch');
    const saveBtn = this.footer.querySelector('.panel-btn:nth-child(2)') as HTMLElement;
    const menuBtn = this.footer.querySelector('.panel-btn:nth-child(3)') as HTMLElement;
    if (saveBtn) saveBtn.textContent = t('menu.save');
    if (menuBtn) menuBtn.textContent = t('menu.close');
    this.langBtn.textContent = getLang() === 'uk' ? 'УКР' : 'ENG';
    this.themeBtn.setAttribute('aria-label', t('theme.day'));
    this.soundBtn.setAttribute('aria-label', t('menu.sound'));
    this.langBtn.setAttribute('aria-label', t('menu.language'));
    this.renderCounter(this.currentDigit, this.currentIndex);
    this.renderFeynman(this.currentIndex);
  }

  /** Сброс состояния («Начать сначала»). */
  reset(): void {
    this.currentDigit = -1;
    this.currentIndex = -1;
    this.history = [];
    this.histCounts.fill(0);
    this.digitBig.textContent = 'π';
    this.digitBig.style.color = 'var(--ink)';
    this.digitNote.textContent = '–';
    this.digitDot.style.opacity = '0';
    this.tapeEl.innerHTML = '';
    this.renderCounter(-1, -1);
    this.renderHistogram();
    this.feynmanEl.textContent = t('panel.feynmanIn', { n: formatNum(FEYNMAN_INDEX + 1) });
    this.feynmanEl.style.opacity = '1';
  }

  setDateBadge(on: boolean): void {
    // minimal: toggle data attribute; UI badge optional
    this.panel.dataset.dateMode = on ? '1' : '0';
  }

  dispose(): void {
    this.menuFab.remove();
    this.introEl.remove();
    this.versionCorner.remove();
    this.panel.remove();
  }
}

