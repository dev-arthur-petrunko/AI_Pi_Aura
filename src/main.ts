/**
 * π · Aura — точка входа.
 * Связывает: цифры π → (нота + капля) в одном кадре, меню, HUD, жесты, рендер.
 * Единые часы — аудио-часы (с непрерывным offset), вода и звук стартуют вместе.
 */

import './styles.css';
import { AudioEngine } from './audio/engine.ts';
import { Ripples } from './gfx/ripples.ts';
import { Renderer } from './gfx/renderer.ts';
import { formatNum, getLang, initLang, onLangChange } from './i18n/index.ts';
import { FeynmanDetector } from './pi/feynman.ts';
import { PiStream } from './pi/piStream.ts';
import { Gestures } from './ui/gestures.ts';
import { Hud } from './ui/hud.ts';
import { loadState, Menu } from './ui/menu.ts';
import { saveMoment } from './ui/save.ts';

initLang();

const STORAGE_SPEED_STEP = 0.25;
const BASE_INTERVAL = 1.5; // секунд на цифру при 1×
const LOOKAHEAD = 0.12;

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('water') as HTMLCanvasElement;
const core = document.getElementById('core') as HTMLElement;

const state = loadState();
const reducedMotion =
  typeof matchMedia === 'function' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const ripples = new Ripples();
const renderer = new Renderer(canvas, ripples, () => undefined);
const engine = new AudioEngine();
const hud = new Hud(app);
const stream = new PiStream();
const detector = new FeynmanDetector();

let speed = state.speed;
let started = false;
let frozen = false;
let waterTime = 0; // часы воды (секунды)
let clockOffset = 0; // непрерывность часов после создания AudioContext
let nextAt = 0; // план следующей ноты в часах воды
let lastFrame = performance.now();
let pulse = 0;
let mirrorStart = -1; // момент точки Фейнмана в часах воды
let tiltTarget: [number, number] = [0, 0];
let tiltCur: [number, number] = [0, 0];
const lastDigits: number[] = [];
let pauseStartedAt = 0;

const nowSec = (): number => {
  const ctx = engine.ctx;
  if (!ctx) return performance.now() / 1000;
  if (ctx.state !== 'running') {
    // аудио ещё не разблокировано (autoplay-политика) — часы не стоят:
    // держим offset свежим, чтобы при запуске ctx не было скачка
    clockOffset = performance.now() / 1000 - ctx.currentTime;
    return performance.now() / 1000;
  }
  return ctx.currentTime + clockOffset;
};

/** Меню и его действия. */
const menu = new Menu(app, state, {
  onVolume: (v) => engine.setVolume(v),
  onMute: (m) => engine.setMuted(m),
  onScale: (s) => engine.setScale(s),
  onSpeed: (s) => {
    speed = s;
  },
  onSave: () => {
    void saveMoment(canvas, renderFrame, stream.index);
    menu.close();
  },
  onRestart: () => {
    stream.reset();
    detector.reset();
    lastDigits.length = 0;
    hud.setDigit(0);
    nextAt = nowSec() + 0.3;
  },
  onLang: () => {
    /* onLangChange ниже обновляет HUD и меню */
  },
});

engine.setScale(state.scale);
engine.setVolume(state.volume);
engine.setMuted(state.muted);

onLangChange(() => {
  // тег <html lang> уже обновлён модулем i18n — HUD перерисован там же
  if (stream.index > 0) hud.setDigit(stream.index - 1);
});

/** Цифра из потока → нота + капля + счётчик + детектор Фейнмана. */
function scheduleDigit(whenAudioOrSec: number): void {
  const item = stream.take();
  if (!item) {
    // буфер пуст — пробуем чуть позже
    nextAt = nowSec() + 0.1;
    stream.onDigits(() => undefined);
    return;
  }
  const { digit, index } = item;
  lastDigits.push(digit);
  if (lastDigits.length > 10) lastDigits.shift();

  // звук — в аудио-часах, свет — в часах воды; планируются в одном кадре
  const delay = Math.max(0, whenAudioOrSec - nowSec());
  engine.playDigit(digit, engine.ctx ? engine.ctx.currentTime + delay : undefined);

  const birth = waterTime + delay;
  ripples.addAtIndex(index, digit, birth, 0.7);

  hud.setDigit(index);
  hud.beat();
  core.classList.remove('is-beating');
  void core.offsetWidth;
  core.classList.add('is-beating');
  pulse = 1;

  if (detector.push(digit, index)) {
    engine.feynmanChord();
    mirrorStart = waterTime;
    hud.flash('feynman', undefined, 6000);
  }
}

/** План: ноты по расписанию с небольшим упреждением (пилот-синхронизация). */
function scheduler(): void {
  if (!started || frozen) return;
  const now = nowSec();
  let guard = 0;
  while (nextAt <= now + LOOKAHEAD && guard++ < 4) {
    scheduleDigit(nextAt);
    nextAt += BASE_INTERVAL / speed;
  }
}

/** «Ныряние»: 5 минут вниз, ~20 с плавно вверх, 10 с покоя. */
function diveAt(t: number): number {
  const cycle = t % 330;
  if (cycle < 300) {
    const u = cycle / 300;
    return u * u * (3 - 2 * u);
  }
  if (cycle < 320) {
    const u = (cycle - 300) / 20;
    return 1 - u * u * (3 - 2 * u);
  }
  return 0;
}

/** Конверт точки Фейнмана: вспышка ~3 с, затем вода возвращается (~7 с). */
function mirrorAt(t: number): number {
  if (mirrorStart < 0) return 0;
  const age = t - mirrorStart;
  if (age > 7) {
    mirrorStart = -1;
    return 0;
  }
  const rise = Math.min(1, age / 0.8);
  const fall = age < 4.5 ? 1 : 1 - (age - 4.5) / 2.5;
  const env = Math.max(0, Math.min(rise, fall));
  return env * (reducedMotion ? 0.4 : 1);
}

/** Один кадр воды. Вызывается из rAF и из «Сохранить момент». */
function renderFrame(): void {
  tiltCur[0] += (tiltTarget[0] - tiltCur[0]) * 0.06;
  tiltCur[1] += (tiltTarget[1] - tiltCur[1]) * 0.06;
  renderer.render({
    time: waterTime,
    dive: diveAt(waterTime),
    mirror: mirrorAt(waterTime),
    motion: reducedMotion ? 0.5 : 1,
    tilt: tiltCur,
    pulse,
  });
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (document.hidden) return; // пауза рендеринга при скрытой вкладке

  if (!frozen) {
    waterTime += dt;
    scheduler();
  }
  pulse *= Math.exp(-dt * 2.2);
  if (pulse < 0.01) pulse = 0;
  renderFrame();
}

/** Первое касание: разблокировать звук и начать музыку. */
function firstTouch(): void {
  if (started) return;
  started = true;
  engine.init();
  if (engine.ctx) {
    // делаем аудио-часы непрерывными с часами воды/производительности
    clockOffset = performance.now() / 1000 - engine.ctx.currentTime;
  }
  hud.hideIntro();
  nextAt = nowSec() + 0.35;

  const saved = stream.index;
  if (saved > 0) {
    hud.flash('resume', { n: formatNum(saved, getLang()) }, 5200);
  } else {
    hud.flash('infinite', { n: 1 }, 5200);
  }
}

/** Заморозка: вода замирает, последние 10 цифр — мягким арпеджио. */
function toggleFreeze(): void {
  if (!started) return;
  frozen = !frozen;
  engine.setFrozen(frozen);
  if (frozen) {
    pauseStartedAt = nowSec();
    hud.setFrozenLabel([...lastDigits]);
    engine.arpeggio([...lastDigits]);
  } else {
    // продолжаем с места остановки — часы плана сдвигаются на время паузы
    nextAt += nowSec() - pauseStartedAt;
    hud.setFrozenLabel(null);
  }
}

function changeSpeed(delta: number): void {
  speed = Math.min(2, Math.max(0.5, Math.round((speed + delta) * 100) / 100));
  menu.setSpeedUi(speed);
  hud.flashRaw(`${speed}×`, 900);
}

new Gestures(canvas, {
  onFirstTouch: firstTouch,
  onTap: (x, y) => {
    if (!started || frozen) return;
    // нота по x (слева → ниже) + капля ровно в этой точке
    engine.playX(x);
    ripples.add(x, y, Math.min(9, Math.max(0, Math.floor(x * 10))), waterTime, 0.85);
    hud.beat();
    pulse = Math.max(pulse, 0.8);
  },
  onSwipe: (up) => changeSpeed(up ? STORAGE_SPEED_STEP : -STORAGE_SPEED_STEP),
  onFreeze: toggleFreeze,
  onMenuToggle: () => menu.toggle(),
  onClose: () => menu.close(),
  onSpeedKey: (dir) => changeSpeed(dir * STORAGE_SPEED_STEP),
  onTilt: (alpha, beta) => {
    tiltTarget[0] = Math.max(-1, Math.min(1, (alpha - 180) / 45));
    tiltTarget[1] = Math.max(-1, Math.min(1, (beta - 45) / 45));
  },
});

hud.menuButton.addEventListener('click', () => menu.toggle());

/** Сохранение позиции в π при уходе со страницы. */
window.addEventListener('pagehide', () => stream.flush());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stream.flush();
    lastFrame = performance.now();
  }
});

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => renderer.resize());

// PWA: офлайн-кэш после первой загрузки
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* офлайн-режим не критичен */
    });
  });
}

// старт цикла
lastFrame = performance.now();
requestAnimationFrame(frame);

// debug-хук для приёмочных проверок: открывать с #debug
if (location.hash.startsWith('#debug')) {
  (window as unknown as { __aura: object }).__aura = {
    seed(n: number): void {
      ripples.clear();
      for (let i = 0; i < n; i++) {
        const code = (i * 3 + 2) % 10;
        ripples.add(
          i * 0.04 + 0.12,
          0.15 + ((i * 37) % 70) / 100,
          code,
          waterTime - (i % 4) * 0.8,
          0.7,
        );
      }
    },
    state(): Record<string, unknown> {
      return {
        waterTime,
        speed,
        started,
        frozen,
        drops: ripples.count,
        fps: renderer.rendererStats.fps,
        mode: renderer.rendererStats.mode,
      };
    },
  };
}
