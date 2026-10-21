import { getLang, onLangChange, t } from '../i18n/index.ts';
import { loadMillion } from '../pi/million.ts';
import { validateDate, candidates, findAll, type Hit, type DateParts } from '../pi/dateSearch.ts';

export interface DateDialogActions { onListen: (hit: Hit) => void; }

export class DateDialog {
  private backdrop: HTMLElement;
  private sheet: HTMLElement;
  private actions: DateDialogActions;
  private state: 'input' | 'loading' | 'found' | 'notfound' = 'input';
  private hits: Hit[] = [];
  private selectedHit: Hit | null = null;
  private viewY = new Date().getFullYear();
  private viewM = new Date().getMonth();
  private viewMode: 'd' | 'm' | 'y' = 'd';
  private selDate: { y?: number; m: number; d: number } | null = null;
  private noYear = false;

  constructor(root: HTMLElement, actions: DateDialogActions) {
    this.actions = actions;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'menu-backdrop';
    this.sheet = document.createElement('section');
    this.sheet.className = 'menu-sheet glass date-sheet';
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-modal', 'true');
    this.sheet.setAttribute('aria-hidden', 'true');
    root.appendChild(this.backdrop);
    root.appendChild(this.sheet);
    this.backdrop.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
    onLangChange(() => this.render());
  }
  isOpen(): boolean { return this.sheet.classList.contains('is-open'); }
  open(): void {
    this.state = 'input';
    this.selectedHit = null;
    const now = new Date();
    if (this.selDate) {
      this.viewY = this.selDate.y ?? now.getFullYear();
      this.viewM = this.selDate.m;
      this.noYear = this.selDate.y === undefined;
    } else {
      this.viewY = now.getFullYear();
      this.viewM = now.getMonth();
      this.noYear = false;
    }
    this.viewMode = 'd';
    this.render();
    requestAnimationFrame(() => { this.backdrop.classList.add('is-visible'); this.sheet.classList.add('is-open'); this.sheet.setAttribute('aria-hidden', 'false'); });
  }
  close(): void { this.backdrop.classList.remove('is-visible'); this.sheet.classList.remove('is-open'); this.sheet.setAttribute('aria-hidden', 'true'); }

  private locale(): string { return getLang() === 'uk' ? 'uk-UA' : 'en-US'; }
  private dim(y: number, m: number): number { return new Date(y, m + 1, 0).getDate(); }

  private render(): void {
    if (this.state === 'loading') { this.renderLoading(); return; }
    if (this.state === 'found' && this.selectedHit) { this.renderFound(); return; }
    if (this.state === 'notfound') { this.renderNotFound(); return; }
    this.renderInput();
  }

  private renderLoading(): void {
    this.sheet.innerHTML = `
      <button class="menu-close" aria-label="${t('menu.close')}">✕</button>
      <h2 class="menu-title">${t('date.title')}</h2>
      <p class="date-sub">${t('date.loading')}</p>
    `;
    this.bindClose();
  }

  private renderInput(): void {
    this.sheet.innerHTML = `
      <div class="hd">
        <h2 id="date-title-h">${t('date.title')}</h2>
        <button class="ib sm" data-x aria-label="${t('menu.close')}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <p class="date-sub">${t('date.sub')}</p>
      <div class="nav">
        <button class="ib nv" id="date-prev" type="button" aria-label="prev"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button>
        <button class="tt" id="date-title" type="button"></button>
        <button class="ib nv" id="date-next" type="button" aria-label="next"><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button>
      </div>
      <div class="wk" id="date-wk"></div>
      <div class="grid" id="date-grid"></div>
      <div id="pv"></div>
      <div style="margin-bottom:14px"><button class="chip" id="date-noyear" type="button" aria-pressed="false">${t('date.noYear')}</button></div>
      <button class="pri" id="date-find" type="button" disabled>${t('date.find')}</button>
      <p class="date-privacy">${t('date.privacy')}</p>
    `;
    this.bindClose();
    this.renderCal();
    this.bindCal();
    this.sheet.querySelector('#date-find')?.addEventListener('click', () => this.find());
  }

  private renderCal(dir?: number): void {
    const titleEl = this.sheet.querySelector('#date-title') as HTMLElement | null;
    const wkEl = this.sheet.querySelector('#date-wk') as HTMLElement | null;
    const gridEl = this.sheet.querySelector('#date-grid') as HTMLElement | null;
    const previewEl = this.sheet.querySelector('#pv') as HTMLElement | null;
    const noYearBtn = this.sheet.querySelector('#date-noyear') as HTMLButtonElement | null;
    const findBtn = this.sheet.querySelector('#date-find') as HTMLButtonElement | null;
    if (!titleEl || !wkEl || !gridEl || !previewEl) return;
    const L = this.locale();
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const monthName = (i: number) => new Intl.DateTimeFormat(L, { month: 'long' }).format(new Date(2000, i, 1));
    let html = '';
    let title = '';
    if (this.viewMode === 'd') {
      title = cap(monthName(this.viewM)) + (this.noYear ? '' : ' ' + this.viewY);
      const first = (new Date(this.viewY, this.viewM, 1).getDay() + 6) % 7;
      const total = this.dim(this.viewY, this.viewM);
      const now = new Date();
      for (let i = 0; i < first; i++) html += `<i></i>`;
      for (let day = 1; day <= total; day++) {
        const sel = !!this.selDate && this.selDate.d === day && this.selDate.m === this.viewM && (this.noYear || this.selDate.y === this.viewY);
        const td = !this.noYear && now.getFullYear() === this.viewY && now.getMonth() === this.viewM && now.getDate() === day;
        html += `<button class="c${sel ? ' sel' : ''}${td ? ' td' : ''}" data-d="${day}">${day}</button>`;
      }
      wkEl.style.display = '';
      wkEl.innerHTML = Array.from({ length: 7 }, (_, i) => `<span>${new Intl.DateTimeFormat(L, { weekday: 'short' }).format(new Date(2024, 0, 1 + i))}</span>`).join('');
    } else if (this.viewMode === 'm') {
      title = String(this.viewY);
      for (let i = 0; i < 12; i++) {
        const sel = !!this.selDate && this.selDate.m === i && (this.noYear || this.selDate.y === this.viewY);
        html += `<button class="c${sel ? ' sel' : ''}" data-m="${i}">${cap(monthName(i))}</button>`;
      }
      wkEl.style.display = 'none';
      wkEl.innerHTML = '';
    } else {
      const y0 = Math.floor(this.viewY / 20) * 20;
      title = y0 + '–' + (y0 + 19);
      const nowY = new Date().getFullYear();
      for (let y = y0; y < y0 + 20; y++) {
        const sel = !!this.selDate && this.selDate.y === y;
        const disabled = y < 1900 || y > nowY;
        html += `<button class="c${sel ? ' sel' : ''}" data-y="${y}" ${disabled ? 'disabled' : ''}>${y}</button>`;
      }
      wkEl.style.display = 'none';
      wkEl.innerHTML = '';
    }
    gridEl.className = 'grid' + (this.viewMode === 'm' ? ' m' : this.viewMode === 'y' ? ' y' : '');
    gridEl.innerHTML = html;
    if (dir) { gridEl.classList.remove('nx', 'pv'); void gridEl.offsetWidth; gridEl.classList.add(dir > 0 ? 'nx' : 'pv'); }
    titleEl.textContent = title;
    if (noYearBtn) noYearBtn.setAttribute('aria-pressed', String(this.noYear));
    if (!this.selDate) {
      previewEl.innerHTML = `<small>${t('date.pickDay')}</small>`;
      if (findBtn) findBtn.disabled = true;
    } else {
      const s = String(this.selDate.d).padStart(2, '0') + String(this.selDate.m + 1).padStart(2, '0') + (this.noYear || this.selDate.y === undefined ? '' : String(this.selDate.y));
      const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
      if (!this.noYear && this.selDate.y !== undefined) o.year = 'numeric';
      const date = new Date(this.noYear || this.selDate.y === undefined ? 2000 : this.selDate.y!, this.selDate.m, this.selDate.d);
      previewEl.innerHTML = `<span>${new Intl.DateTimeFormat(L, o).format(date)}</span><small>${t('date.searchFor')}: <b>${s}</b></small>`;
      if (findBtn) findBtn.disabled = false;
    }
  }

  private step(n: number): void {
    if (this.viewMode === 'd') {
      this.viewM += n;
      if (this.viewM < 0) { this.viewM = 11; this.viewY--; }
      if (this.viewM > 11) { this.viewM = 0; this.viewY++; }
    } else if (this.viewMode === 'm') {
      this.viewY += n;
    } else {
      this.viewY += 20 * n;
    }
    const maxY = this.noYear ? 2000 : new Date().getFullYear();
    this.viewY = Math.max(1900, Math.min(maxY, this.viewY));
    this.renderCal(n);
  }

  private bindClose(): void {
    this.sheet.querySelector('.menu-close')?.addEventListener('click', () => this.close());
    this.sheet.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => this.close()));
  }

  private bindCal(): void {
    this.sheet.querySelector('#date-prev')?.addEventListener('click', () => this.step(-1));
    this.sheet.querySelector('#date-next')?.addEventListener('click', () => this.step(1));
    this.sheet.querySelector('#date-title')?.addEventListener('click', () => {
      if (this.viewMode === 'd') this.viewMode = this.noYear ? 'd' : 'm';
      else if (this.viewMode === 'm') this.viewMode = this.noYear ? 'd' : 'y';
      else this.viewMode = 'd';
      this.renderCal(1);
    });
    this.sheet.querySelector('#date-noyear')?.addEventListener('click', () => {
      this.noYear = !this.noYear;
      if (this.noYear) { this.viewY = 2000; this.viewMode = 'd'; }
      this.renderCal(1);
    });
    const grid = this.sheet.querySelector('#date-grid');
    grid?.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('.c') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.d) {
        this.selDate = { y: this.noYear ? undefined : this.viewY, m: this.viewM, d: parseInt(b.dataset.d, 10) };
        this.renderCal();
      } else if (b.dataset.m) {
        this.viewM = parseInt(b.dataset.m, 10);
        this.viewMode = 'd';
        this.renderCal(1);
      } else if (b.dataset.y) {
        this.viewY = parseInt(b.dataset.y, 10);
        this.viewMode = 'm';
        this.renderCal(1);
      }
    });
  }

  private async find(): Promise<void> {
    if (!this.selDate) return;
    const d = this.selDate.d;
    const m = this.selDate.m + 1;
    const y = this.selDate.y;
    const parts: DateParts = { d, m, y };
    const v = validateDate(parts);
    if (v !== 'ok') {
      const err = document.createElement('div');
      err.className = 'date-err';
      err.setAttribute('aria-live', 'polite');
      err.textContent = t(v === 'day' ? 'date.err.day' : v === 'month' ? 'date.err.month' : 'date.err.year');
      this.sheet.querySelector('.date-preview')?.appendChild(err);
      return;
    }
    this.state = 'loading';
    this.render();
    try {
      const s = await loadMillion();
      (window as any).__piMillion = s;
      (window as any).__setMillion?.(s);
      const hits = findAll(s, parts, getLang(), 6);
      if (hits.length === 0) {
        this.state = 'notfound';
        this.hits = [];
      } else {
        this.hits = hits;
        this.selectedHit = hits[0];
        this.state = 'found';
      }
    } catch {
      this.state = 'input';
      alert(t('date.loadFail'));
    }
    this.render();
  }

  private renderNotFound(): void {
    const tried = this.hits.length ? this.hits.map((h) => h.fmt).join(', ') : candidates({ d: this.selDate?.d || 0, m: (this.selDate?.m ?? 0) + 1, y: this.selDate?.y }, getLang()).map((c) => c.fmt).join(', ');
    this.sheet.innerHTML = `
      <button class="menu-close" aria-label="${t('menu.close')}">✕</button>
      <h2 class="menu-title">${t('date.title')}</h2>
      <p class="date-sub">${t('date.notFound')}</p>
      <p class="date-tried">${t('date.tried', { f: tried })}</p>
      <div class="nav">
        <button class="ib nv" id="date-prev" type="button" aria-label="prev"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button>
        <button class="tt" id="date-title" type="button"></button>
        <button class="ib nv" id="date-next" type="button" aria-label="next"><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></svg></button>
      </div>
      <div class="wk" id="date-wk"></div>
      <div class="grid" id="date-grid"></div>
      <div id="pv"></div>
      <div style="margin-bottom:14px"><button class="chip" id="date-noyear" type="button" aria-pressed="false">${t('date.noYear')}</button></div>
      <button class="pri" id="date-find" type="button">${t('date.find')}</button>
      <p class="date-privacy">${t('date.privacy')}</p>
    `;
    this.bindClose();
    this.renderCal();
    this.bindCal();
    this.sheet.querySelector('#date-find')?.addEventListener('click', () => this.find());
  }

  private renderFound(): void {
    if (!this.selectedHit) return;
    const h = this.selectedHit;
    const chanceText = h.len <= 4 ? t('date.chance4') : h.len === 6 ? t('date.chance6') : t('date.chance8');
    const s = (window as any).__piMillion || '';
    const before = s.slice(Math.max(0, h.index - 6), h.index);
    const after = s.slice(h.index + h.len, h.index + h.len + 6);
    const other = this.hits.filter((x) => x !== h);
    this.sheet.innerHTML = `
      <button class="menu-close" aria-label="${t('menu.close')}">✕</button>
      <h2 class="menu-title">${t('date.found')}</h2>
      <p class="date-at">${t('date.at', { n: new Intl.NumberFormat(getLang() === 'uk' ? 'uk-UA' : 'en-US').format(h.index + 1) })}</p>
      <p class="date-digits">${before}<span class="date-hit">${h.digits}</span>${after}</p>
      <p class="date-fmt">${t('date.fmt', { f: h.fmt })}</p>
      <p class="date-chance">${chanceText}</p>
      ${other.length ? `<details class="date-other"><summary>${t('date.other')}</summary>${other.map((o) => `<button class="menu-action-btn" data-hit="${this.hits.indexOf(o)}">${o.fmt} · ${o.digits}</button>`).join('')}</details>` : ''}
      <div class="menu-btn-row">
        <button class="menu-action-btn" id="date-listen">${t('date.listen')}</button>
        <button class="menu-action-btn" id="date-share">${t('date.share')}</button>
      </div>
    `;
    this.bindClose();
    this.sheet.querySelector('#date-listen')?.addEventListener('click', () => { this.actions.onListen(this.selectedHit!); this.close(); });
    this.sheet.querySelector('#date-share')?.addEventListener('click', () => this.share(this.selectedHit!));
    this.sheet.querySelectorAll<HTMLButtonElement>('[data-hit]').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number(b.dataset.hit);
        this.selectedHit = this.hits[i];
        this.render();
      });
    });
  }

  private async share(hit: Hit): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}#d=${hit.index}&m=${hit.len}`;
    const text = t('date.shareText', { n: hit.index + 1 });
    try {
      if (navigator.share) { await navigator.share({ title: t('date.title'), text, url }); return; }
    } catch { /* ignore */ }
    try {
      await navigator.clipboard?.writeText(url);
      const toast = document.createElement('div');
      toast.className = 'date-toast';
      toast.textContent = t('date.copied');
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1800);
    } catch { /* ignore */ }
  }
}
