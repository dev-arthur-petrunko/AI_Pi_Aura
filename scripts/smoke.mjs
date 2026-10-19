/**
 * Живая smoke-проверка через Chrome DevTools Protocol:
 * открывает страницу, «касает» воду, собирает ошибки консоли и делает скриншот.
 * Запуск: node scripts/smoke.mjs <cdpPort> <outPng> [seed] [previewPort]
 * Страница открывается с ?silent=1 — AudioContext не создаётся вовсе,
 * поэтому проверка полностью беззвучна.
 */
const DEBUG_PORT = Number(process.argv[2] || 9222);
const OUT = process.argv[3] || 'shot-clicked.png';
const SEED = Number(process.argv[4] || 0); // посеять N капель (#debug)
const PREVIEW_PORT = Number(process.argv[5] || 4174);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. находим страницу
const list = await fetch(`http://localhost:${DEBUG_PORT}/json`).then((r) => r.json());
const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!page) {
  console.error('no page target');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
const errors = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) {
    events.push(msg);
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push('EXCEPTION: ' + JSON.stringify(msg.params.exceptionDetails?.exception?.description || msg.params));
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const type = msg.params.type;
      if (type === 'error' || type === 'warning') {
        errors.push(`${type.toUpperCase()}: ` + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('LOG: ' + msg.params.entry.text);
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
await send('Log.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__auraAudioContexts = 0;
    const RealAC = window.AudioContext;
    if (RealAC) {
      class CountingAudioContext extends RealAC {
        constructor(...args) { super(...args); window.__auraAudioContexts++; }
      }
      window.AudioContext = CountingAudioContext;
      window.webkitAudioContext = CountingAudioContext;
    }
    // Чистое состояние: позиция в π не влияет на внешний вид.
    // Ставим ДО старта приложения — иначе pagehide старой страницы
    // допишет старый индекс поверх сброса.
    try { localStorage.setItem('pi.index', '0'); } catch (e) {}
  `,
});
// Уводим старую страницу в about:blank, чтобы её pagehide не восстановил позицию.
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
// Nonce в query: иначе переход на тот же URL+hash — same-document navigation,
// Chrome не перезагружает страницу и мы проверяем старый бандл.
const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?silent=1&v=${nonce}#debug` });
await sleep(3000);

// 2. «первое касание» — pointerdown/pointerup по центру воды
const evalRes = await send('Runtime.evaluate', {
  expression: `(() => {
    const c = document.getElementById('water');
    const opts = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
    c.dispatchEvent(new PointerEvent('pointerdown', opts));
    c.dispatchEvent(new PointerEvent('pointerup', opts));
    return {
      url: location.href,
      hasApp: !!document.getElementById('app'),
      appLen: document.getElementById('app')?.innerHTML.length ?? -1,
      introHidden: document.getElementById('intro')?.classList.contains('is-hidden') ?? null,
      counter: document.getElementById('counter')?.textContent ?? null,
      htmlLang: document.documentElement.lang,
    };
  })()`,
  returnByValue: true,
});
if (evalRes.result?.exceptionDetails) {
  console.log('EVAL EXCEPTION:', JSON.stringify(evalRes.result.exceptionDetails.exception?.description ?? evalRes.result.exceptionDetails));
}
console.log('after tap:', JSON.stringify(evalRes.result?.result?.value));

// 3. даём потечь музыке/воде ~6 секунд
for (const wait of [2000, 2000, 2000]) {
  await sleep(wait);
  const s = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      counter: document.getElementById('counter')?.textContent ?? null,
      speedStored: (() => { try { return localStorage.getItem('pi.speed'); } catch { return null; } })(),
      indexStored: (() => { try { return localStorage.getItem('pi.index'); } catch { return null; } })(),
    })`,
    returnByValue: true,
  });
  console.log('t+', wait, s.result?.result?.value);
}

const state = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    counter: document.getElementById('counter')?.textContent ?? null,
    coreBeating: document.getElementById('core')?.classList.contains('is-beating') ?? null,
    introHidden: document.getElementById('intro')?.classList.contains('is-hidden') ?? null,
    lang: document.documentElement.lang,
    audioState: (typeof window !== 'undefined' && window.__auraAudioState) || null,
    audioContextsCreated: window.__auraAudioContexts ?? null,
  })`,
  returnByValue: true,
});
console.log('after 6s:', state.result?.result?.value);

// 3.4 проверка тишины: AudioContext не должен создаваться вовсе
const acCount = JSON.parse(state.result?.result?.value || '{}').audioContextsCreated;
if (acCount !== 0) {
  errors.push(`SILENCE VIOLATION: created ${acCount} AudioContext(s) in ?silent=1 mode`);
}

// 3.5 посев капель для приёмочного кадра (если задан)
if (SEED > 0) {
  await send('Runtime.evaluate', {
    expression: `window.__aura?.seed(${SEED})`,
    returnByValue: true,
  });
  await sleep(1200);
}

// 4. скриншот
const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('node:fs');
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
console.log('screenshot:', OUT);

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
ws.close();
process.exit(errors.length ? 2 : 0);
