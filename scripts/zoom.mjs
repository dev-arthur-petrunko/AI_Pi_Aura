/**
 * Снимает увеличенный фрагмент кадра вокруг одной капли — чтобы рассмотреть
 * форму кольца, ядра и «лучей» вблизи, а не в общем плане.
 *
 * Запуск: node scripts/zoom.mjs [cdpPort] [previewPort] [outPng] [dropIndex] [drops] [cx] [cy]
 *   dropIndex — индекс капли (для drops=1); при drops>1 берётся центр (cx,cy).
 *
 * Звук: страница открывается с ?silent=1 — AudioContext не создаётся вовсе.
 */
import { writeFileSync } from 'node:fs';

const CDP_PORT = Number(process.argv[2] || 9222);
const PREVIEW_PORT = Number(process.argv[3] || 4174);
const OUT = process.argv[4] || 'zoom.png';
const DROP_INDEX = Number(process.argv[5] || 0);
const DROPS = Number(process.argv[6] || 1);
const FORCE_CX = process.argv[7] !== undefined ? Number(process.argv[7]) : null;
const FORCE_CY = process.argv[8] !== undefined ? Number(process.argv[8]) : null;
const CLIP = Number(process.argv[9] || 150);
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

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });

// 4x по плотности пикселей — на телефоне 2x, нам нужно больше деталей
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 4, mobile: true,
});

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('pi.index', '0'); } catch (e) {}`,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?silent=1&v=${nonce}#debug` });
await sleep(2500);

// стартуем поток (иначе кадр пустой) и сажаем ровно одну каплю
await send('Runtime.evaluate', {
  expression: `(() => {
    const c = document.getElementById('water');
    const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', o));
    c.dispatchEvent(new PointerEvent('pointerup', o));
  })()`,
});
await sleep(1200);
await send('Runtime.evaluate', {
  expression: `window.__aura?.seed(${DROPS})`,
  returnByValue: true,
});
await sleep(1200);

// позиция капли — та же формула, что в src/gfx/ripples.ts
const pos = await send('Runtime.evaluate', {
  expression: `(() => {
    const f = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };
    return { x: 0.08 + f(${DROP_INDEX} + 1) * 0.84, y: 0.12 + f(${DROP_INDEX} + 7.13) * 0.76 };
  })()`,
  returnByValue: true,
});
const p = pos.result.result.value;
const x = FORCE_CX !== null ? FORCE_CX : p.x;
const y = FORCE_CY !== null ? FORCE_CY : p.y;

// клип вокруг капли: CLIPxCLIP CSS-пикселей.
// ВАЖНО: в шейдере gl_FragCoord.y растёт снизу вверх, а координаты клипа
// CDP — сверху вниз. Поэтому y_css = (1 - y) * height, иначе клип промахнётся.
const cssX = x * 390;
const cssY = (1 - y) * 844;
const clip = {
  x: Math.max(0, Math.min(390 - CLIP, cssX - CLIP / 2)),
  y: Math.max(0, Math.min(844 - CLIP, cssY - CLIP / 2)),
  width: CLIP,
  height: CLIP,
  scale: 3,
};

const shot = await send('Page.captureScreenshot', { format: 'png', clip });
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));

console.log(`drop ${DROP_INDEX} at (${x.toFixed(3)}, ${y.toFixed(3)}) -> ${OUT}`);
console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
ws.close();
process.exit(errors.length ? 2 : 0);