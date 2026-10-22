/**
 * π · Aura — точка входа.
 * Связывает: цифры π → (нота + капля + плитка на дне) в одном кадре,
 * меню, жесты, рендер. Единый цикл анимации.
 */

import './styles.css';
import { AudioEngine } from './audio/engine.ts';
import { Renderer } from './gfx/renderer.ts';
import { PAL_HEX } from './gfx/palette.ts';
import { tilePos } from './gfx/ripples.ts';
import { initLang, onLangChange, setLang, t } from './i18n/index.ts';
import { Panel } from './ui/panel.ts';
import { DateDialog } from './ui/dateDialog.ts';
import { dateModePlan } from './pi/dateMode.ts';
import { FeynmanDetector } from './pi/feynman.ts';
import { PiStream } from './pi/piStream.ts';
import { loadMillion } from './pi/million.ts';
import { Gestures } from './ui/gestures.ts';
import { loadState, Menu } from './ui/menu.ts';
import { saveMoment } from './ui/save.ts';

initLang();

// Глобальный fallback для переключения языка (на случай кэша/делегации)
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest?.('[data-lang]') as HTMLElement | null;
  if (!btn) return;
  const l = btn.dataset.lang;
  if (l !== 'uk' && l !== 'en') return;
  setLang(l);
  try { panel.renderText(); } catch { /* ignore */ }
  try { menu.render(); } catch { /* ignore */ }
});

const STEP_BASE = 1400; // мс на цифру при скорости 1×
const FEYNMAN_INDEX = 762; // индекс (с 0) начала «999999»

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('water') as HTMLCanvasElement;

const panel = new Panel(app);
const dateDialog = new DateDialog(app, { onListen: (hit) => enterDateMode(hit) });
const renderer = new Renderer(canvas, () => undefined);
const engine = new AudioEngine();
const stream = new PiStream();
const detector = new FeynmanDetector();

const state = loadState();
engine.setScale(state.scale);
engine.setVolume(state.volume);
engine.setMuted(state.muted);

let theme: 'day' | 'night' = 'day';
try {
  const params = new URLSearchParams(window.location.search);
  const urlTheme = params.get('theme');
  if (urlTheme === 'night' || urlTheme === 'day') {
    theme = urlTheme;
  } else {
    const v = localStorage.getItem('pi.theme');
    if (v === 'night') theme = 'night';
  }
} catch { /* ignore */ }
document.documentElement.setAttribute('data-theme', theme);
panel.setTheme(theme);
renderer.setTheme(theme);
panel.onThemeChange = (t) => { theme = t; menu.setThemeUi(t); renderer.setTheme(t); };
panel.onMenuToggle = () => menu.toggle();
panel.onDateOpen = () => dateDialog.open();

let speed = state.speed;
let started = false;
let frozen = false;
let idx = stream.index;
let nextAt = 0;
let lastDigitTime = 0;
function primeMillionBackground(): void {
  void loadMillion().then((s) => stream.setMillion(s)).catch(() => {});
}

let dateMode: { prevIndex: number; start: number; len: number; endIndex: number } | null = null;
let dateCapsule: HTMLElement | null = null;

const histCounts = new Array(10).fill(0);
const lastDigits: number[] = [];
let feynmanAnnounced = false;

/** Цифра → нота + капля + панель + дно. Вызывается в одном кадре. */
function playDigit(digit: number, index: number): void {
  // звук (если аудио разблокировано)
  if (engine.ctx && engine.ctx.state === 'running') {
    const repeat = lastDigits.length > 0 && lastDigits[lastDigits.length - 1] === digit;
    engine.playDigit(digit, undefined, repeat ? 0.22 : 0.16);
  }

  // капля в симуляцию воды: падает на плитку текущей цифры
  const panelFrac = 0;
  const repeat = lastDigits.length > 0 && lastDigits[lastDigits.length - 1] === digit;
  const { x, y } = tilePos(index, canvas.clientWidth, canvas.clientHeight, panelFrac);
  const R = 0.075 - 0.045 * (digit / 9);
  const K = (0.026 - 0.012 * (digit / 9)) * (repeat ? 1.8 : 1);
  renderer.addDrop(x, y, R, K);

  // подсветка плитки на дне
  renderer.setActiveDigit(index);

  // призрак цифры (ghost digit) над плиткой
  const gh = document.getElementById('gh');
  if (gh) {
    const px = x * canvas.clientWidth;
    const py = (1 - y) * canvas.clientHeight;
    gh.textContent = String(digit);
    const half = 80;
    gh.style.left = Math.min(canvas.clientWidth - half, Math.max(half, px)) + 'px';
    gh.style.top = Math.min(canvas.clientHeight - half, Math.max(half, py)) + 'px';
    gh.style.setProperty('--gc', PAL_HEX[digit] ?? '#fff');
    gh.classList.remove('go');
    void gh.offsetWidth;
    gh.classList.add('go');
  }
  histCounts[digit]++;
  lastDigits.push(digit);
  if (lastDigits.length > 10) lastDigits.shift();

  if (dateMode) {
    console.debug('[dateMode] playing index', index, 'digit', digit, 'range', dateMode.start, dateMode.endIndex);
    if (index === dateMode.endIndex) {
      engine.feynmanChord();
    }
    if (index >= dateMode.endIndex + 6) {
      showDateCapsule();
    }
  }
  const future = stream.peek(15);
  panel.addDigit(digit, index, future);

  // точка Фейнмана
  if (index < FEYNMAN_INDEX) {
    panel.setFeynman(Math.max(0, FEYNMAN_INDEX - index));
  } else if (!feynmanAnnounced) {
    feynmanAnnounced = true;
    panel.setFeynmanDone();
    engine.feynmanChord();
  }
}

/** Следующая цифра из потока. */
function beat(): void {
  const item = stream.take();
  if (!item) return; // буфер пуст — попробуем позже
  idx = item.index;
  playDigit(item.digit, idx);
}

/** Первое касание: разблокировать звук и начать. */
(window as any).__setMillion = (s: string) => stream.setMillion(s);

function firstTouch(): void {
  if (started) return;
  started = true;
  engine.init();
  nextAt = performance.now() + 350;
  panel.hideIntro();
  try {
    const ric = (window as any).requestIdleCallback;
    if (typeof ric === 'function') ric(() => primeMillionBackground());
    else setTimeout(primeMillionBackground, 1000);
  } catch { /* ignore */ }
}

/** Заморозка: стоп новых нот, мягкое арпеджио последних цифр. */
function toggleFreeze(): void {
  if (!started) return;
  frozen = !frozen;
  engine.setFrozen(frozen);
  if (frozen) {
    engine.arpeggio([...lastDigits]);
    panel.setFreezeLabel(lastDigits);
  } else {
    panel.setFreezeLabel(null);
  }
}

/** Смена скорости. */
function changeSpeed(delta: number): void {
  speed = Math.min(3, Math.max(0.5, Math.round((speed + delta) * 100) / 100));
  panel.setSpeedUi(speed);
  menu.setSpeedUi(speed);
}

/** Вход в режим «Дата». */
async function enterDateMode(hit: { index: number; len: number }): Promise<void> {
  if (!started) firstTouch();
  // гарантируем, что поток работает поверх миллиона цифр (мгновенный seek)
  try {
    const s = await loadMillion();
    stream.setMillion(s);
    (window as any).__piMillion = s;
  } catch { /* fallback: seek через воркер/основной поток */ }
  const prevIndex = stream.index;
  const plan = dateModePlan(hit.index, hit.len, 0, 6);
  stream.setPersist(false);
  stream.seek(Math.max(0, plan.start));
  idx = Math.max(0, plan.start);
  renderer.setHighlight(hit.index, hit.len);
  renderer.setActiveDigit(hit.index);
  panel.setDateBadge(true);
  dateMode = { prevIndex, start: hit.index, len: hit.len, endIndex: hit.index + hit.len - 1 };
  lastDigits.length = 0;
  nextAt = performance.now();
}

function exitDateMode(stay: boolean): void {
  if (!dateMode) return;
  if (stay) {
    stream.setPersist(true);
    stream.flush();
  } else {
    const prev = dateMode.prevIndex;
    stream.seek(prev);
    idx = prev;
    stream.setPersist(true);
    stream.flush();
  }
  renderer.clearHighlight();
  panel.setDateBadge(false);
  if (dateCapsule) {
    dateCapsule.remove();
    dateCapsule = null;
  }
  dateMode = null;
}

function showDateCapsule(): void {
  if (dateCapsule || !dateMode) return;
  const cap = document.createElement('div');
  cap.className = 'date-capsule glass';
  cap.innerHTML = `<button id="date-keep">${t('date.keep')}</button><button id="date-back">${t('date.back')}</button>`;
  document.body.appendChild(cap);
  dateCapsule = cap;
  const timer = window.setTimeout(() => {
    if (dateCapsule === cap) exitDateMode(true);
  }, 30000);
  cap.querySelector('#date-keep')?.addEventListener('click', () => { clearTimeout(timer); exitDateMode(true); });
  cap.querySelector('#date-back')?.addEventListener('click', () => { clearTimeout(timer); exitDateMode(false); });
}
const menu = new Menu(app, state, {
  onVolume: (v) => engine.setVolume(v),
  onMute: (m) => engine.setMuted(m),
  onScale: (s) => engine.setScale(s),
  onSpeed: (s) => {
    speed = s;
    panel.setSpeedUi(s);
  },
  onTheme: (t) => {
    theme = t;
    panel.setTheme(t);
    renderer.setTheme(t);
    menu.setThemeUi(t);
  },
  onSave: () => {
    void saveMoment(canvas, renderFrameNow, Math.max(0, stream.index - 1));
    menu.close();
  },
  onRestart: () => {
    if (frozen) toggleFreeze();
    stream.reset();
    detector.reset();
    lastDigits.length = 0;
    histCounts.fill(0);
    panel.resetCounts();
    idx = -1;
    nextAt = performance.now() + 350;
    feynmanAnnounced = false;
    panel.reset();
  },
  onLang: () => {
    /* i18n обновит панель и меню через onLangChange */
  },
  onDate: () => dateDialog.open(),
});

(window as any).__setLang = (l: string) => {
  if (l !== 'uk' && l !== 'en') return;
  setLang(l as 'uk' | 'en');
  try { panel.renderText(); } catch { /* ignore */ }
  try { menu.render(); } catch { /* ignore */ }
};

onLangChange(() => {
  panel.renderText();
});

/** Рендер одного кадра воды. */
function renderFrameNow(): void {
  const day = theme === 'day' ? 1 : 0;
  const light = [0.3, 0.6, 0.7] as [number, number, number];
  const sky = [0.3, 0.8, 0.95] as [number, number, number];
  const waterDeep = [0.01, 0.10, 0.16] as [number, number, number];
  const flashColor = [1, 1, 1] as [number, number, number];

  // sc = scroll offset for floor texture (reference formula)
  const ph = started ? Math.min(1, (performance.now() - lastDigitTime) / (STEP_BASE / speed)) : 0;
  const sc = (idx + ph) / 16 - Math.floor(idx / 16);

  renderer.render({
    time: performance.now() / 1000,
    sc,
    light,
    sky,
    waterDeep,
    perturb: started ? 1 : 0,
    day,
    flash: feynmanAnnounced ? 1 : 0,
    flashColor,
    flashCenter: [idx % 16 + 0.5, 5.5] as [number, number],
    age: started ? (performance.now() - lastDigitTime) / 1000 : 99,
    pf: 0,
  });
}

/** Один кадр анимации. */
function frame(now: number): void {
  requestAnimationFrame(frame);
  restCheck();

  if (!started) {
    // тихие случайные капли до первого касания
    if (now - lastDigitTime > 2600) {
      lastDigitTime = now;
      const x = 0.4 + Math.random() * 0.55;
      const y = 0.3 + Math.random() * 0.4;
      renderer.addDrop(x, y, 0.05, 0.02);
    }
    renderFrameNow();
    return;
  }

  if (document.hidden) return;

  if (!frozen && now >= nextAt) {
    nextAt = now + STEP_BASE / speed;
    beat();
  }

  renderFrameNow();
}

// Жесты
new Gestures(canvas, {
  onFirstTouch: firstTouch,
  onTap: (x, y) => {
    if (!started || frozen) return;
    engine.playX(x);
    renderer.addDrop(x, y, 0.06, 0.03);
  },
  onSwipe: (up) => {
    if (!menu.isOpen) changeSpeed(up ? 0.25 : -0.25);
  },
  onFreeze: () => {
    if (!menu.isOpen) toggleFreeze();
  },
  onMenuToggle: () => menu.toggle(),
  onClose: () => menu.close(),
  onSpeedKey: (dir) => {
    if (!menu.isOpen) changeSpeed(dir * 0.25);
  },
  onTilt: () => {
    // наклон сдвигает направление света (можно передать через renderer)
  },
});

// Сохранение позиции при уходе
window.addEventListener('pagehide', () => {
  stream.flush();
  renderer.dispose();
  panel.dispose();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stream.flush();
  }
});

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => renderer.resize());

// PWA: офлайн-кэш (не в dev)
if (!import.meta.env.DEV && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* ignore */ }
    navigator.serviceWorker.register('./sw.js?v=11').catch(() => {
      /* офлайн-режим не критичен */
    });
  });
}

// E4: ссылка на позицию #d=N (и &m=L для подсветки даты)
try {
  const hash = window.location.hash;
  const m = hash.match(/#d=(\d+)/);
  if (m) {
    const pos = parseInt(m[1], 10);
    if (Number.isFinite(pos) && pos >= 0) {
      stream.seek(pos);
      idx = pos;
      const mm = hash.match(/[?&]m=(\d+)/);
      if (mm) {
        const len = parseInt(mm[1], 10);
        if (Number.isFinite(len) && len > 0) {
          renderer.setHighlight(pos, len);
        }
      }
    }
  }
} catch { /* ignore */ }

// E1: режим покоя
let lastInteraction = performance.now();
let restMode = false;
function setRestMode(on: boolean): void {
  restMode = on;
  document.body.classList.toggle('rest-mode', on);
}
function markInteraction(): void {
  lastInteraction = performance.now();
  if (restMode) setRestMode(false);
}

const restCheck = (): void => {
  if (performance.now() - lastInteraction > 6000 && !restMode) {
    setRestMode(true);
  }
};
document.addEventListener('pointermove', markInteraction, { passive: true });
document.addEventListener('pointerdown', markInteraction, { passive: true });
document.addEventListener('keydown', markInteraction);

// Клавиша D — окно даты
document.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    if (!menu.isOpen) dateDialog.open();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
});

// Esc — выход из режима даты
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dateMode) {
    exitDateMode(false);
  }
});
requestAnimationFrame(frame);

