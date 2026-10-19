/**
 * Снимает серию кадров воды с разным числом капель (1, 5, 24)
 * и печатает измерения яркости для каждого.
 *
 * Запуск: node scripts/shots.mjs [port]
 */
import { execFileSync } from 'node:child_process';

const PORT = Number(process.argv[2] || 9222);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch(`http://localhost:${PORT}/json`).then((r) => r.json());
const page = list.find((t) => t.type === 'page');
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
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    if (msg.params.type === 'error') {
      errors.push('ERROR: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
  }
});

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
// без этого Chrome отдаёт закэшированный index.html со старым бандлом
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
// Сбрасываем позицию в π ДО запуска скриптов страницы. Порядок важен:
// 1) уводим старую страницу в about:blank — её pagehide допишет старый индекс;
// 2) на новом документе инъекция ставит pi.index = 0 до старта приложения.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('pi.index', '0'); } catch (e) {}`,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
await send('Page.navigate', { url: 'http://localhost:4173/?silent=1#debug' });
await sleep(2500);

await send('Runtime.evaluate', {
  expression: `(() => {
    const c = document.getElementById('water');
    const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', o));
    c.dispatchEvent(new PointerEvent('pointerup', o));
  })()`,
});
await sleep(1500);

for (const n of [1, 5, 24]) {
  await send('Runtime.evaluate', {
    expression: `window.__aura?.seed(${n})`,
    returnByValue: true,
  });
  await sleep(1400);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  const file = `shot-d${n}.png`;
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  const stats = execFileSync('node', ['scripts/pxstats.mjs', file], { encoding: 'utf8' });
  const s = JSON.parse(stats);
  console.log(
    `drops=${n}  mean=${s.meanLum}  max=${s.maxLum}  >0.05=${s.pctAbove['0.05']}%  >0.2=${s.pctAbove['0.20']}%`,
  );
}

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
ws.close();
process.exit(errors.length ? 2 : 0);
