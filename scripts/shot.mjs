/**
 * Быстрый снимок страницы: открыть URL, подождать, снять PNG.
 *
 * Запуск: node scripts/shot.mjs [url] [outfile] [cdpPort] [waitMs] [tap]
 *   tap=1 — коснуться воды перед снимком (запустить поток)
 */
import { writeFileSync } from 'node:fs';

const URL_ = process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || 'shot-local.png';
const CDP_PORT = Number(process.argv[4] || 9222);
const WAIT = Number(process.argv[5] || 3000);
const TAP = process.argv[6] === '1';
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
  return r.result?.result?.value ?? null;
};

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);
await send('Page.navigate', { url: URL_ });
await sleep(WAIT);

if (TAP) {
  await evaluate(`(() => {
    const c = document.getElementById('water');
    const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', o));
    c.dispatchEvent(new PointerEvent('pointerup', o));
  })()`);
  await sleep(2500);
}

const state = await evaluate(`(() => ({
  counter: document.getElementById('counter')?.textContent ?? '',
  hasCanvas: !!document.getElementById('water'),
  lang: document.documentElement.lang,
}))()`);
console.log('state:', JSON.stringify(state));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
console.log('saved:', OUT);
console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
ws.close();
process.exit(errors.length ? 2 : 0);
