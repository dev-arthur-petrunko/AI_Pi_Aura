/**
 * π · Aura — точка входа.
 * Связывает: цифры π → (нота + капля) в одном кадре, меню, HUD, жесты, рендер.
 * Единые часы — аудио-часы (с непрерывным offset), вода и звук стартуют вместе.
 */

import './styles.css';
import { AudioEngine } from './audio/engine.ts';
import { Ripples, dropParams } from './gfx/ripples.ts';
import { Renderer } from './gfx/renderer.ts';
import { initLang, onLangChange } from './i18n/index.ts';
import { Panel } from './ui/panel.ts';
import { FeynmanDetector } from './pi/feynman.ts';
import { PiStream } from './pi/piStream.ts';
import { Gestures } from './ui/gestures.ts';
import { loadState, Menu } from './ui/menu.ts';
import { saveMoment } from './ui/save.ts';
import { colorForDigit } from './gfx/palette.ts';

initLang();

const STORAGE_SPEED_STEP = 0.25;
const BASE_INTERVAL = 1.5; // секунд на цифру при 1×
const LOOKAHEAD = 0.12;

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('water') as HTMLCanvasElement;
const panel = new Panel(app);

const state = loadState();

const ripples = new Ripples();
const renderer = new Renderer(canvas, () => undefined);
const engine = new AudioEngine();
const stream = new PiStream();
const detector = new FeynmanDetector();

let speed = state.speed;
let started = false;
let frozen = false;
let waterTime = 0; // часы воды (секунды)
let clockOffset = 0; // непрерывность часов после создания AudioContext
let nextAt = 0; // план следующей ноты в часах воды
let lastFrame = performance.now();
let tiltTarget: [number, number] = [0, 0];
let tiltCur: [number, number] = [0, 0];
let pulse = 0;
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
    // stream.index — уже «сколько цифр сыграно», как в счётчике HUD
    void saveMoment(canvas, renderFrame, Math.max(0, stream.index - 1));
    menu.close();
  },
  onRestart: () => {
    if (frozen) toggleFreeze(); // иначе сдвиг паузы «съест» новый план
    stream.reset();
    detector.reset();
    lastDigits.length = 0;
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
  // тег <html lang> уже обновлён модулем i18n
});

/** Цифра из потока → нота + капля + счётчик + детектор Фейнмана. false — буфер пуст. */
function scheduleDigit(whenAudioOrSec: number): boolean {
  const item = stream.take();
  if (!item) {
    return false;
  }
  const { digit, index } = item;
  lastDigits.push(digit);
  if (lastDigits.length > 10) lastDigits.shift();

  // звук — в аудио-часах, свет — в часах воды; планируются в одном кадре
  const delay = Math.max(0, whenAudioOrSec - nowSec());
  engine.playDigit(digit, engine.ctx ? engine.ctx.currentTime + delay : undefined);

  const repeat = index > 0 && lastDigits[lastDigits.length - 2] === digit;
  const p = dropParams(digit, index, repeat, app.clientWidth > 0 ? Math.min(1, 344 / app.clientWidth) : 0);
  // позиция/сила/радиус — по формулам образца
  renderer.addDrop(p.x, p.y, p.R, p.K);
  panel.update(digit, index, stream.peek(3));

  if (detector.push(digit, index)) {
    engine.feynmanChord();
  }
  return true;
}

/** План: ноты по расписанию с небольшим упреждением (пилот-синхронизация). */
function scheduler(): void {
  if (!started || frozen) return;
  const now = nowSec();
  // возврат из фона/заморозки: план отстал — не «догоняем» ускоренным потоком
  if (now - nextAt > BASE_INTERVAL) nextAt = now + 0.2;
  let guard = 0;
  while (nextAt <= now + LOOKAHEAD && guard++ < 4) {
    if (scheduleDigit(nextAt)) {
      nextAt += BASE_INTERVAL / speed;
    } else {
      // буфер пуст — пробуем чуть позже, без пропуска такта
      nextAt = now + 0.1;
      break;
    }
  }
}

/** «Ныряние»: 5 минут вниз, ~20 с плавно вверх, 10 с покоя. */
/** Один кадр воды. Вызывается из rAF и из «Сохранить момент». */
function renderFrame(): void {
  tiltCur[0] += (tiltTarget[0] - tiltCur[0]) * 0.06;
  tiltCur[1] += (tiltTarget[1] - tiltCur[1]) * 0.06;
  // направление света реагирует на наклон телефона
  const light: [number, number, number] = [
    0.3 + tiltCur[0] * 0.4,
    0.5 + tiltCur[1] * 0.4,
    0.9,
  ];
  const day = document.documentElement.dataset.theme === 'day' ? 1 : 0;
  // вспышка текущей цифры на дне: затухает после звука
  const flash = Math.min(1, pulse);
  const curDigit = lastDigits.length > 0 ? lastDigits[lastDigits.length - 1] : 0;
  const flashColor = colorForDigit(curDigit);
  const col = Math.floor(curDigit % 16);
  const row = Math.floor(curDigit / 16);
  renderer.render({
    time: waterTime,
    light,
    sky: [0.4, 0.7, 0.9],
    waterDeep: [0.02, 0.06, 0.12],
    perturb: 0.035,
    day,
    flash,
    flashColor,
    flashCenter: [col + 0.5, row + 0.5],
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
  ripples.prune(waterTime);
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
  nextAt = nowSec() + 0.35;

  const saved = stream.index;
  if (saved > 0) {
  } else {
  }
}

/** Заморозка: вода замирает, последние 10 цифр — мягким арпеджио. */
function toggleFreeze(): void {
  if (!started) return;
  frozen = !frozen;
  engine.setFrozen(frozen);
  if (frozen) {
    pauseStartedAt = nowSec();
    engine.arpeggio([...lastDigits]);
  } else {
    nextAt += nowSec() - pauseStartedAt;
  }
}

function changeSpeed(delta: number): void {
  speed = Math.min(2, Math.max(0.5, Math.round((speed + delta) * 100) / 100));
  menu.setSpeedUi(speed);
}

new Gestures(canvas, {
  onFirstTouch: firstTouch,
  onTap: (x, y) => {
    if (!started || frozen) return;
    // нота по x (слева → ниже) + капля ровно в этой точке
    engine.playX(x);
    const code = Math.min(9, Math.max(0, Math.floor(x * 10)));
    ripples.add(x, y, code, waterTime, 0.85);
    renderer.addDrop(x, y, 0.08 + 0.85 * 0.12, 0.06 + 0.85 * 0.10);
    pulse = Math.max(pulse, 0.8);
  },
  onSwipe: (up) => {
    if (!menu.isOpen) changeSpeed(up ? STORAGE_SPEED_STEP : -STORAGE_SPEED_STEP);
  },
  onFreeze: () => {
    if (!menu.isOpen) toggleFreeze();
  },
  onMenuToggle: () => menu.toggle(),
  onClose: () => menu.close(),
  onSpeedKey: (dir) => {
    if (!menu.isOpen) changeSpeed(dir * STORAGE_SPEED_STEP);
  },
  onTilt: (alpha, beta) => {
    tiltTarget[0] = Math.max(-1, Math.min(1, (alpha - 180) / 45));
    tiltTarget[1] = Math.max(-1, Math.min(1, (beta - 45) / 45));
  },
});

/** Сохранение позиции в π при уходе со страницы. */
window.addEventListener('pagehide', () => {
  stream.flush();
  renderer.dispose();
  panel.dispose();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stream.flush();
    lastFrame = performance.now();
  }
});

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => renderer.resize());

// PWA: офлайн-кэш после первой загрузки (не в dev — чтобы видеть свежую версию)
if (!import.meta.env.DEV && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=3').catch(() => {
      /* офлайн-режим не критичен */
    });
  });
}


// старт цикла
lastFrame = performance.now();
requestAnimationFrame(frame);
