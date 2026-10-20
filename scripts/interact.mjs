/**
 * Живая проверка интеракций: resume-позиция в π, «Начать сначала»,
 * переключение языка, открытие/закрытие меню, игнорирование жестов
 * при открытом меню.
 *
 * Запуск: node scripts/interact.mjs [cdpPort] [previewPort]
 *
 * Звук: страница открывается с ?silent=1 — AudioContext не создаётся вовсе.
 */
import { writeFileSync } from 'node:fs';

const CDP_PORT = Number(process.argv[2] || 9222);
const PREVIEW_PORT = Number(process.argv[3] || 4174);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch(`http://localhost:${CDP_PORT}/json`).then((r) => r.json());
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) {
  console.error('no page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    errors.push('EXCEPTION: ' + (msg.params.exceptionDetails?.exception?.description || ''));
  } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('ERROR: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
});

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.result?.exceptionDetails) {
    errors.push('EVAL: ' + (r.result.exceptionDetails.exception?.description ?? ''));
    return null;
  }
  return r.result?.result?.value ?? null;
};

/** Касание воды в CSS-координатах. */
const touch = async (x, y, id = 1) => {
  const o = JSON.stringify({ bubbles: true, pointerId: id, clientX: x, clientY: y, isPrimary: true });
  await evaluate(`(() => {
    const c = document.getElementById('water');
    c.dispatchEvent(new PointerEvent('pointerdown', ${o}));
    c.dispatchEvent(new PointerEvent('pointerup', ${o}));
  })()`);
};

/** Свайп по воде: от (x, y1) к (x, y2). */
const swipe = async (x, y1, y2, id = 2) => {
  const mk = (type, yy) =>
    `new PointerEvent('${type}', { bubbles: true, pointerId: ${id}, clientX: ${x}, clientY: ${yy}, isPrimary: true })`;
  await evaluate(`(() => {
    const c = document.getElementById('water');
    c.dispatchEvent(${mk('pointerdown', y1)});
    c.dispatchEvent(${mk('pointermove', y2)});
    c.dispatchEvent(${mk('pointerup', y2)});
  })()`);
};

const readStore = (key) =>
  evaluate(`(() => { try { return localStorage.getItem(${JSON.stringify(key)}); } catch { return null; } })()`);

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});

// Позиция в π ставится ДО старта скриптов страницы: иначе pagehide старой
// страницы допишет свой индекс поверх нашего.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('pi.index', '500'); } catch (e) {}`,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?silent=1&v=${nonce}` });
await sleep(2500);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
// PLACEHOLDER_CHECKS

// 1. Первое касание запускает поток с сохранённой позиции
await touch(195, 420);
await sleep(1800);
const afterTap = await evaluate(`(() => ({
  counter: document.getElementById('counter')?.textContent ?? null,
  index: (() => { try { return localStorage.getItem('pi.index'); } catch { return null; } })(),
  introHidden: document.getElementById('intro')?.classList.contains('is-hidden') ?? null,
}))()`);
check(
  'первое касание запускает поток',
  /(цифра|digit) 50[1-9]/.test(afterTap?.counter ?? ''),
  JSON.stringify(afterTap),
);
check('intro скрыта после касания', afterTap?.introHidden === true);
check('позиция в π сохранена', Number(afterTap?.index ?? 0) >= 500, `pi.index=${afterTap?.index}`);

// 2. Меню открывается клавишей M
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))`);
await sleep(700);
const menuOpen = await evaluate(`document.getElementById('menu-sheet')?.classList.contains('is-open') ?? false`);
check('меню открывается по клавише M', menuOpen === true);

// 3. Смена языка мгновенно переводит интерфейс
await evaluate(`document.querySelector('[data-lang="en"]')?.click()`);
await sleep(400);
const en = await evaluate(`(() => ({
  lang: document.documentElement.lang,
  counter: document.getElementById('counter')?.textContent ?? null,
  title: document.getElementById('menu-sheet')?.querySelector('.menu-title')?.textContent ?? null,
  intro: document.querySelector('.hud-intro__text')?.textContent ?? null,
}))()`);
check('язык переключается мгновенно', en?.lang === 'en' && /digit/.test(en?.counter ?? ''), JSON.stringify(en));
check('заголовок меню переведён', en?.title === 'Settings');

// 4. Свайп при открытом меню НЕ меняет скорость
const speedBefore = await readStore('pi.speed');
await swipe(195, 600, 500);
await sleep(400);
const speedAfter = await readStore('pi.speed');
check('свайп при открытом меню игнорируется', speedBefore === speedAfter, `${speedBefore} → ${speedAfter}`);

// 5. «Начать сначала»: подтверждение, затем сброс позиции
await evaluate(`document.getElementById('btn-restart')?.click()`);
await sleep(300);
const confirmText = await evaluate(`document.getElementById('btn-restart')?.textContent ?? null`);
// язык к этому моменту английский — сверяем оба варианта подтверждения
check(
  'перезапуск спрашивает подтверждение',
  /Скинути/.test(confirmText ?? '') || /Reset your place/.test(confirmText ?? ''),
  confirmText,
);
await evaluate(`document.getElementById('btn-restart')?.click()`);
await sleep(1500);
const afterRestart = await evaluate(`(() => ({
  counter: document.getElementById('counter')?.textContent ?? null,
  index: (() => { try { return localStorage.getItem('pi.index'); } catch { return null; } })(),
}))()`);
check(
  '«Начать сначала» возвращает к началу π',
  /(цифра|digit) [1-5]$/.test(afterRestart?.counter ?? '') && Number(afterRestart?.index ?? 1) < 10,
  JSON.stringify(afterRestart),
);

// 6. Скорость сохраняется после свайпа (меню закрыто)
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await sleep(400);
await swipe(195, 600, 480, 3);
await sleep(500);
const speedSwipe = await readStore('pi.speed');
check('свайп сохраняет скорость', speedSwipe !== null && speedSwipe !== '1', `pi.speed=${speedSwipe}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('shot-interact.png', Buffer.from(shot.result.data, 'base64'));

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено`);
ws.close();
process.exit(failed.length || errors.length ? 2 : 0);
