/**
 * Долгий прогон (soak): N секунд работы — проверяем, что поток не встаёт,
 * счётчик растёт, память стабильна и ошибок в консоли нет.
 *
 * Запуск: node scripts/soak.mjs [cdpPort] [previewPort] [seconds]
 *
 * Звук: страница открывается с ?silent=1 — AudioContext не создаётся вовсе.
 */
import { writeFileSync } from 'node:fs';

const CDP_PORT = Number(process.argv[2] || 9222);
const PREVIEW_PORT = Number(process.argv[3] || 4174);
const SECONDS = Number(process.argv[4] || 90);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const list = await fetch(`http://localhost:${CDP_PORT}/json`).then((r) => r.json());
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) {
  console.error('no page target');
  process.exit(1);
}

// Своя вкладка: soak не должен драться с другими скриптами за одну страницу.
const created = await fetch(`http://localhost:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
const target = await created.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
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
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('pi.index', '0'); } catch (e) {}`,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?silent=1&v=${nonce}#debug` });
await sleep(2500);

await evaluate(`(() => {
  const c = document.getElementById('water');
  const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
  c.dispatchEvent(new PointerEvent('pointerdown', o));
  c.dispatchEvent(new PointerEvent('pointerup', o));
})()`);

const sample = async () => {
  const s = await evaluate(`(() => ({
    counter: document.getElementById('counter')?.textContent ?? '',
    heap: performance.memory?.usedJSHeapSize ?? 0,
    fps: window.__aura?.state?.().fps ?? null,
    drops: window.__aura?.state?.().drops ?? null,
    mode: window.__aura?.state?.().mode ?? null,
    scale: window.__aura?.state()?.fps ?? null,
  }))()`);
  const n = Number(String(s?.counter ?? '').replace(/\D+/g, '')) || 0;
  return { n, ...s };
};

const samples = [];
const t0 = Date.now();
let next = t0 + 10000;
while ((Date.now() - t0) / 1000 < SECONDS) {
  await sleep(2000);
  const s = await sample();
  samples.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
  if (Date.now() >= next) {
    next = Date.now() + 10000;
    const last = samples[samples.length - 1];
    console.log(
      `t=${last.t}s  digits=${last.n}  heap=${(last.heap / 1048576).toFixed(1)}MB  drops=${last.drops}  fps=${last.fps}  mode=${last.mode}`,
    );
  }
}

const first = samples[0];
const last = samples[samples.length - 1];
const grew = last.n > first.n;
const heapGrowMb = (last.heap - first.heap) / 1048576;

console.log('\n--- итог ---');
console.log(`цифр: ${first.n} → ${last.n} (+${last.n - first.n})`);
console.log(`heap: ${(first.heap / 1048576).toFixed(1)}MB → ${(last.heap / 1048576).toFixed(1)}MB (Δ ${heapGrowMb.toFixed(1)}MB)`);
console.log(`режим: ${last.mode}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('shot-soak.png', Buffer.from(shot.result.data, 'base64'));

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
const ok = grew && heapGrowMb < 60 && errors.length === 0;
console.log(ok ? 'SOAK: OK' : 'SOAK: PROBLEMS');
await fetch(`http://localhost:${CDP_PORT}/json/close/${target.id}`);
ws.close();
process.exit(ok ? 0 : 2);
