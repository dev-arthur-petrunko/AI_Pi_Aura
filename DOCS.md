# π · Aura — Documentation

## 1. Обзор

**π · Aura** — одноэкранное веб-приложение: бесконечная мелодия и светящаяся вода, порождённые цифрами числа π.

- Каждая цифра π → **одна нота** пентатоники (2 октавы) + **одна капля**, которая шевелит поверхность воды.
- Цифры генерируются «краником» (spigot, алгоритм Гиббонса) в Web Worker — последовательность не зацикливается.
- Концепция «Бассейн π»: дно — кафельная плитка с цифрами π; каждая сыгранная цифра подсвечивает свою плитку и создаёт волну.
- Два языка: украинский (UK) и английский (EN), переключение мгновенное.
- Две темы: День («Aqua», по умолчанию) и Ночь («Deep»).
- Точка входа: открыл → чёрный экран → коснулся → началась музыка.

## 2. Технологии

| Область | Решение |
|---|---|
| Сборка | Vite + TypeScript (`vite.config.ts`) |
| Графика | WebGL2 напрямую, без three.js: полноэкранный треугольник + fragment shader |
| Звук | Web Audio API (ноты, дрон, реверберация генерируются кодом, аудиофайлов нет) |
| Цифры π | Web Worker + алгоритм Гиббонса (BigInt) |
| Языки | собственный мини-модуль i18n: `uk.json` + `en.json` |
| Тесты | Vitest (`tests/`) |
| Хранение | `localStorage`: язык, громкость, гамма, скорость, позиция в π |
| PWA | Service Worker + `manifest.webmanifest` + иконки 192/512 |
| Деплой | статическая папка `dist/` |

Запрещено: React/Vue, three.js, внешние CDN, аудиофайлы, трекеры/аналитика.

## 3. Структура репозитория

```
index.html
vite.config.ts
package.json
tsconfig.json
AGENTS.md
DOCS.md
public/
  manifest.webmanifest
  sw.js
  icon-192.png / icon-512.png
src/
  main.ts
  config.ts
  styles.css
  pi/
    spigot.ts piWorker.ts piStream.ts feynman.ts million.ts dateSearch.ts dateMode.ts
  audio/
    engine.ts voices.ts drone.ts reverb.ts scales.ts
  gfx/
    renderer.ts sim.ts floor.ts ripples.ts palette.ts
    shaders/ (fullscreen, sim, drop, render)
  ui/
    panel.ts menu.ts gestures.ts save.ts dateDialog.ts
  i18n/
    index.ts uk.json en.json
tests/
  pi.test.ts scales.test.ts i18n.test.ts ripples.test.ts
  pi1m.test.ts dateSearch.test.ts dateMode.test.ts
```

## 4. Запуск и сборка

```bash
npm install
npm run dev      # локальная разработка
npm test         # Vitest
npm run build    # tsc --noEmit && vite build
npm run preview  # просмотр dist/
```

## 5. Архитектура и поток данных

1. `main.ts` создаёт `PiStream`, `AudioEngine`, `Renderer`, `Panel`, `Menu`, `DateDialog`, `Gestures`.
2. После первого касания (`firstTouch`) разблокируется `AudioContext`, стартует музыка.
3. Каждую цифру (≈1.4 с при скорости 1×) вызывается `playDigit(digit, index)`:
   - звук: `engine.playDigit(...)`;
   - вода: `renderer.addDrop(...)` на плитке текущей цифры;
   - UI: `panel.addDigit(...)` и гистограмма.
4. `Renderer` ведёт единый `requestAnimationFrame`-цикл: симуляция воды + рендер.
5. Позиция в π сохраняется в `localStorage` (`pi.index`) через `PiStream.flush()`.

## 6. Модули

### 6.1 Цифры π (`src/pi/`)

- `spigot.ts`: генератор цифр π на `BigInt` (`piDigits`, `piSlice`).
- `piWorker.ts`: Web Worker, отдаёт пачки по ~64 цифры.
- `piStream.ts`: буфер (≥200 цифр вперёд), позиция/возобновление, `seek()`, резервный путь без Worker.
- `feynman.ts`: детектор точки Фейнмана (999999 на 762-й цифре).
- `million.ts` + `dateSearch.ts` + `dateMode.ts`: поиск даты в первом миллионе цифр и переход к ней.

### 6.2 Аудио (`src/audio/`)

- `engine.ts`: `AudioContext`, мастер-цепочка (компрессор → gain), полифония ≤12, AnalyserNode, mute/volume.
- `voices.ts`: голос ноты — `sine` + `triangle` с расстройкой ±6 центов, огибающая без щелчков.
- `drone.ts`: фоновый дрон C2 с LFO ~12 с.
- `reverb.ts`: процедурный импульс реверберации (шум × экспонента).
- `scales.ts`: мажорная/минорная пентатоника, частота по цифре и по x.

### 6.3 Графика (`src/gfx/`)

- `renderer.ts`: WebGL2-рендерер, авто `renderScale` 0.5–1.0, восстановление контекста, fallback.
- `sim.ts`: симуляция высоты воды (heightfield, ping-pong текстуры).
- `floor.ts`: дно бассейна — плитки с цифрами π → текстура.
- `ripples.ts`: планировщик капель (`tilePos`, радиус, сила, цифра).
- `palette.ts`: цвета цифр 0–9.
- `shaders/`: fullscreen vertex + sim/drop/render fragment shaders.

### 6.4 Интерфейс (`src/ui/`)

- `panel.ts`: HUD (цифра, лента, гистограмма, футер-кнопки), меню-фаб.
- `menu.ts`: стеклянный bottom sheet (язык, звук, гамма, тема, скорость, дата, сохранение, о π, сброс).
- `gestures.ts`: pointer/touch, свайп, удержание, клавиатура, гироскоп.
- `save.ts`: сохранение кадра WebGL в PNG.
- `dateDialog.ts`: ввод даты и результат поиска в π.

### 6.5 i18n (`src/i18n/`)

- `index.ts`: `t()`, `getLang()`, `setLang()`, `formatNum()` (Intl.NumberFormat).
- `uk.json`, `en.json`: все тексты только через ключи.

## 7. Ключевые функции

- **Точка Фейнмана (999999)**: особый аккорд C–E–G–A, зеркальная вода, надпись на текущем языке.
- **Повтор цифры подряд («55»)**: нота громче + октава вверх.
- **Заморозка (удержание 600 мс)**: вода замирает, показываются последние 10 цифр, мягкое арпеджио.
- **Режим покоя**: через 6 с без движения скрываются панель/меню; возврат по движению; `F` — fullscreen.
- **Ссылка на позицию**: `#d=N` (и `&m=L` для подсветки даты) в URL, кнопка копирования.
- **«Твоя дата в π»**: поиск нескольких форматов даты в первом миллионе цифр.
- **Сохранить момент**: PNG с подписью «π · цифра N».

## 8. Состояние и хранение

`localStorage`:
- `pi.lang` — язык (uk/en)
- `pi.index` — позиция в π
- `pi.volume`, `pi.muted`, `pi.scale`, `pi.speed`, `pi.theme`

URL: `#d=N`, `?theme=day|night`, `?silent=1`.

## 9. Производительность, доступность, PWA

- Цель: 60 FPS на средних телефонах; авто `renderScale` (> 20 мс → −0.1; < 12 мс → +0.1).
- `prefers-reduced-motion`: меньше движения, без вспышек.
- Потеря WebGL-контекста восстанавливается без перезагрузки; нет WebGL2 → Canvas 2D fallback.
- Пауза рендеринга при `document.hidden`.
- Контраст текста ≥ 4.5:1, клавиатурная навигация, `role="dialog"`, `aria-modal`.
- Офлайн после первой загрузки: Service Worker + manifest + иконки.

## 10. Тесты

- `pi.test.ts` — первые 50 цифр и точка Фейнмана (762).
- `scales.test.ts` — частоты гамм.
- `i18n.test.ts` — ключи uk/en совпадают, нет пустых значений.
- `ripples.test.ts` — позиция капли на плитке.
- `pi1m.test.ts`, `dateSearch.test.ts`, `dateMode.test.ts` — дата в π.

Текущий статус: `npm test` — 40/40 зелёные, `npm run build` проходит.

## 11. Конфигурация и URL-параметры

- `?silent=1` — без `AudioContext` (скриншоты/тесты).
- `?theme=day|night` — начальная тема.
- `#d=N` — перейти к позиции N в π.
- `#d=N&m=L` — подсветить L цифр начиная с N.

## 12. Соглашения

- Тексты только через i18n-ключи, без «голых» строк.
- Дизайн-токены только в `:root` и `data-theme`.
- Каждый осциллятор получает `stop()` и `disconnect()`.
- Не писать «цифры никогда не повторяются»; корректно: «последовательность никогда не зациклится».
