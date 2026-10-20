/**
 * Барабан цифр: показывает сыгранные, текущую и ближайшие будущие цифры π.
 * Ширина ≥ 900 px — вертикальная панель слева по центру (линза вокруг текущей).
 * Ширина < 900 px — горизонтальная лента внизу (последние ~15 цифр, группы по 5).
 * Сдвиг на одну позицию за 500 мс, синхронно со звуком (audioCtx.currentTime).
 */

import { formatNum, onLangChange, t } from '../i18n/index.ts';

const LETTERS = 'CDEGA';
const ROWS = 7;
const CURRENT_ROW = 3;
const NARROW_WIDTH = 900;
const HISTORY_LIMIT = 40;

function isEn(): boolean {
  return typeof navigator !== 'undefined' && (navigator.language ?? '').toLowerCase().startsWith('en');
}

export class Drum {
  private panel: HTMLElement;
  private wideContainer: HTMLElement;
  private rows: HTMLElement[] = [];
  private noteEl: HTMLElement;
  private numEl: HTMLElement;
  private narrowContainer: HTMLElement;
  private stripDigits: HTMLElement[] = [];
  private history: number[] = [];
  private wide = true;

  constructor(root: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.className = 'drum';
    this.panel.style.position = 'fixed';
    this.panel.style.pointerEvents = 'none';
    this.panel.style.zIndex = '2';
    this.panel.style.transition =
      'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
    root.appendChild(this.panel);

    this.wideContainer = document.createElement('div');
    this.wideContainer.className = 'drum--wide';
    this.panel.appendChild(this.wideContainer);

    for (let i = 0; i < ROWS; i++) {
      const row = document.createElement('div');
      row.className = 'drum-row';
      const digit = document.createElement('div');
      digit.className = 'drum-digit';
      row.appendChild(digit);
      this.wideContainer.appendChild(row);
      this.rows.push(row);
    }

    this.noteEl = document.createElement('div');
    this.noteEl.className = 'drum-note';
    this.wideContainer.appendChild(this.noteEl);

    this.numEl = document.createElement('div');
    this.numEl.className = 'drum-number';
    this.wideContainer.appendChild(this.numEl);

    this.narrowContainer = document.createElement('div');
    this.narrowContainer.className = 'drum--narrow';
    const strip = document.createElement('div');
    strip.className = 'drum-strip';
    for (let i = 0; i < 15; i++) {
      const chip = document.createElement('span');
      chip.className = 'drum-strip-digit';
      strip.appendChild(chip);
      this.stripDigits.push(chip);
    }
    this.narrowContainer.appendChild(strip);
    this.panel.appendChild(this.narrowContainer);

    this.setLayout(window.innerWidth);
    window.addEventListener('resize', () => this.setLayout(window.innerWidth));
    onLangChange(() => this.render());
  }
  private setLayout(width: number): void {
    const next = width >= NARROW_WIDTH;
    if (next === this.wide) return;
    this.wide = next;
    if (next) {
      this.narrowContainer.style.display = 'none';
      this.wideContainer.style.display = 'flex';
      this.panel.style.left = `max(16px, env(safe-area-inset-left))`;
      this.panel.style.top = '50%';
      this.panel.style.transform = 'translateY(-50%)';
      this.panel.style.width = '260px';
      this.panel.style.padding = '16px';
      this.panel.style.flexDirection = 'column';
      this.panel.style.alignItems = 'center';
      this.panel.style.gap = '10px';
    } else {
      this.wideContainer.style.display = 'none';
      this.narrowContainer.style.display = 'flex';
      this.panel.style.left = '0';
      this.panel.style.right = '0';
      this.panel.style.bottom = `max(16px, env(safe-area-inset-bottom))`;
      this.panel.style.transform = 'none';
      this.panel.style.width = '100%';
      this.panel.style.padding = '10px 0';
      this.panel.style.flexDirection = 'column';
      this.panel.style.alignItems = 'center';
      this.panel.style.gap = '0';
    }
    this.render();
  }

  update(digit: number, index: number, future: number[]): void {
    this.history.push(digit);
    if (this.history.length > HISTORY_LIMIT) this.history = this.history.slice(-HISTORY_LIMIT);
    this.renderNow(digit, index, future);
  }

  private renderNow(digit: number, index: number, future: number[]): void {
    const d = Math.min(9, Math.max(0, Math.round(digit)));
    const letter = LETTERS[d % 5];
    const octave = 4 + Math.floor(d / 5);
    type NoteKey = 'note.C' | 'note.D' | 'note.E' | 'note.G' | 'note.A';
    const noteKey = `note.${letter}` as NoteKey;
    const noteBase = t(noteKey);
    const noteLabel = isEn() ? `${noteBase}${octave}` : noteBase;
    this.noteEl.textContent = noteLabel;
    this.numEl.textContent = t('drum.number', { n: formatNum(index + 1) });

    if (this.wide) {
      this.renderWide(digit, future);
    } else {
      this.renderNarrow(digit);
    }
  }

  private renderWide(digit: number, future: number[]): void {
    const played = this.history.slice(Math.max(0, this.history.length - 4), -1);
    for (let i = 0; i < ROWS; i++) {
      const row = this.rows[i];
      const digitEl = row.querySelector('.drum-digit') as HTMLElement;
      const pos = i - CURRENT_ROW;
      row.className = 'drum-row';
      digitEl.style.transition =
        'all 0.5s cubic-bezier(0.22, 1, 0.36, 1)';
      if (pos === 0) {
        row.classList.add('is-current');
        digitEl.textContent = String(digit);
        digitEl.style.opacity = '1';
        digitEl.style.filter = 'none';
        digitEl.style.fontSize = '44px';
        digitEl.style.fontWeight = '200';
      } else if (pos < 0) {
        const playedIndex = played.length + pos;
        const p = played[playedIndex];
        if (p !== undefined) {
          digitEl.textContent = String(p);
          const opacity = pos === -1 ? 0.6 : pos === -2 ? 0.35 : 0.15;
          digitEl.style.opacity = String(opacity);
          digitEl.style.filter = 'none';
          digitEl.style.fontSize = '22px';
          digitEl.style.fontWeight = '300';
        } else {
          digitEl.textContent = '';
          digitEl.style.opacity = '0';
        }
      } else {
        const f = future[pos - 1];
        if (f !== undefined) {
          digitEl.textContent = String(f);
          digitEl.style.opacity = '0.25';
          digitEl.style.filter = 'blur(2px)';
          digitEl.style.fontSize = '20px';
          digitEl.style.fontWeight = '300';
        } else {
          digitEl.textContent = '';
          digitEl.style.opacity = '0';
        }
      }
    }
  }

  private renderNarrow(digit: number): void {
    const show = this.history.slice(-15);
    const all = [...show, digit];
    for (let i = 0; i < 15; i++) {
      const chip = this.stripDigits[i];
      const d = all[i];
      if (d !== undefined) {
        chip.textContent = String(d);
        chip.style.opacity = '1';
        chip.style.filter = 'none';
        if (d === digit && i === all.length - 1) {
          chip.classList.add('is-current');
        } else {
          chip.classList.remove('is-current');
          chip.style.opacity = i < all.length - 1 ? '0.55' : '1';
        }
      } else {
        chip.textContent = '';
        chip.style.opacity = '0';
      }
    }
  }

  private render(): void {
    if (this.history.length > 0) {
      const last = this.history[this.history.length - 1];
      this.renderNow(last, this.history.length - 1, []);
    }
  }

  dispose(): void {
    window.removeEventListener('resize', () => this.setLayout(window.innerWidth));
    this.panel.remove();
  }
}