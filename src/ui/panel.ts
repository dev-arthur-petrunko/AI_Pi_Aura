/**
 * Левая панель «интерфейс сбоку» (Phase 2).
 * Ширина ≥ 1000 px: стеклянная панель 320 px, отступ 24 px.
 * Ширина < 1000 px: свёрнута — только название в углу + лента внизу.
 * Все значения синхронизируются с audioCtx.currentTime.
 */

import { formatNum, onLangChange, t } from '../i18n/index.ts';

const BREAKPOINT = 600;
const HISTORY_LIMIT = 200;

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
    this.digitNote.textContent = '–';
    this.panel.appendChild(this.digitNote);

    this.digitDot = document.createElement('div');
    this.digitDot.className = 'panel-digit-dot';
    this.panel.appendChild(this.digitDot);

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
    this.themeBtn.textContent = '☀';
    this.footer.appendChild(this.themeBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'panel-btn';
    saveBtn.textContent = t('menu.save');
    this.footer.appendChild(saveBtn);

    const menuBtn = document.createElement('button');
    menuBtn.className = 'panel-btn';
    menuBtn.textContent = t('menu.close');
    this.footer.appendChild(menuBtn);

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
    this.renderNow(digit, index, future);
  }

  private renderNow(digit: number, index: number, future: number[]): void {
    const d = Math.min(9, Math.max(0, Math.round(digit)));
    const notes = isEn() ? DIGIT_NOTES_EN : DIGIT_NOTES;
    const octave = 4 + Math.floor(d / 5);
    const noteBase = notes[d];
    const noteLabel = isEn() ? `${noteBase}${octave}` : noteBase;

    this.digitBig.textContent = String(d);
    this.digitBig.style.color = `var(--color-d${d})`;
    this.digitNote.textContent = noteLabel;
    this.digitDot.style.backgroundColor = `var(--color-d${d})`;
    this.digitDot.style.opacity = '1';

    this.renderTape(digit, index, future);
    this.renderCounter(digit, index);
    this.renderHistogram();
    this.renderFeynman(index);
  }

  private renderTape(_digit: number, _index: number, future: number[]): void {
    const all = [...this.history, this.currentDigit, ...future];
    const show = 15;
    const start = Math.max(0, all.length - show);
    const chunk = all.slice(start);
    const parts: string[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const isCurrent = i === chunk.length - 1;
      const d = chunk[i];
      const cls = isCurrent ? 'panel-tape-current' : 'panel-tape-digit';
      const color = `var(--color-d${d})`;
      parts.push(`<span class="${cls}" style="color:${color}">${d}</span>`);
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
      bar.style.backgroundColor = `var(--color-d${d})`;
      bar.style.opacity = '0.5';
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

  private renderText(): void {
    this.subEl.textContent = t('title.sub');
    const saveBtn = this.footer.querySelector('.panel-btn:nth-child(2)') as HTMLElement;
    const menuBtn = this.footer.querySelector('.panel-btn:nth-child(3)') as HTMLElement;
    if (saveBtn) saveBtn.textContent = t('menu.save');
    if (menuBtn) menuBtn.textContent = t('menu.close');
    this.renderCounter(this.currentDigit, this.currentIndex);
    this.renderFeynman(this.currentIndex);
  }

  setTheme(theme: 'day' | 'night'): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    this.themeBtn.textContent = theme === 'day' ? '🌙' : '☀';
  }

  dispose(): void {
    window.removeEventListener('resize', () => this.setLayout(window.innerWidth));
    this.panel.remove();
  }
}

