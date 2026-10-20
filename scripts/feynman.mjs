/**
 * Живая проверка точки Фейнмана: шесть девяток подряд (позиция 762 после
 * запятой) вызывают аккорд, зеркальную воду и локализованную надпись.
 *
 * Запуск: node scripts/feynman.mjs [cdpPort] [previewPort]
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

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});

// Стартуем за 3 цифры до точки Фейнмана (девятки — индексы 762…767).
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('pi.index', '759'); } catch (e) {}`,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?silent=1&v=${nonce}` });
await sleep(2500);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// касание — запускаем поток
await evaluate(`(() => {
  const c = document.getElementById('water');
  const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
  c.dispatchEvent(new PointerEvent('pointerdown', o));
  c.dispatchEvent(new PointerEvent('pointerup', o));
})()`);

// ждём, пока поток дойдёт до девяток (8 цифр ≈ 12 с при 1×)
let toast = '';
let counter = '';
for (let i = 0; i < 40; i++) {
  await sleep(700);
  const s = await evaluate(`(() => ({
    toast: document.getElementById('toast')?.textContent ?? '',
    visible: document.getElementById('toast')?.classList.contains('is-visible') ?? false,
    counter: document.getElementById('counter')?.textContent ?? '',
  }))()`);
  toast = s?.toast ?? '';
  counter = s?.counter ?? '';
  if (/дев|dev|nine/i.test(toast)) break;
}

check('счётчик дошёл до точки Фейнмана', /(цифра|digit) 76[0-9]/.test(counter), counter);
check(
  'показана надпись о шести девятках',
  /дев’яток поспіль|Six nines in a row/.test(toast),
  toast,
);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('shot-feynman.png', Buffer.from(shot.result.data, 'base64'));

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено`);
ws.close();
process.exit(failed.length || errors.length ? 2 : 0);
