/**
 * Проверка аудио-части: AudioContext создаётся ТОЛЬКО после первого касания,
 * голоса играют и гасятся, дрон на месте.
 *
 * Запуск: node scripts/audio.mjs [cdpPort] [previewPort]
 *
 * ВНИМАНИЕ: страница открывается БЕЗ ?silent=1 — звук реальный.
 * Chrome запущен с --mute-audio, поэтому ничего не слышно, но граф строится.
 */
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
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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

// Считаем создания AudioContext и следим за живыми осцилляторами.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__acCount = 0;
    window.__acLive = [];
    const RealAC = window.AudioContext;
    class CountingAudioContext extends RealAC {
      constructor(...args) {
        super(...args);
        window.__acCount++;
        window.__acLive.push(this);
        const realCreateOsc = this.createOscillator.bind(this);
        this.createOscillator = () => {
          const o = realCreateOsc();
          window.__oscCount = (window.__oscCount || 0) + 1;
          const realStop = o.stop.bind(o);
          o.stop = (...a) => { window.__oscStopped = (window.__oscStopped || 0) + 1; return realStop(...a); };
          return o;
        };
      }
    }
    window.AudioContext = CountingAudioContext;
    window.webkitAudioContext = CountingAudioContext;
    try { localStorage.setItem('pi.index', '0'); } catch (e) {}
  `,
});
await send('Page.navigate', { url: 'about:blank' });
await sleep(600);
const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?v=${nonce}` });
await sleep(2500);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const before = await evaluate(`window.__acCount ?? -1`);
check('AudioContext не создан до касания', before === 0, `создано: ${before}`);

await evaluate(`(() => {
  const c = document.getElementById('water');
  const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
  c.dispatchEvent(new PointerEvent('pointerdown', o));
  c.dispatchEvent(new PointerEvent('pointerup', o));
})()`);
await sleep(4000);

const after = await evaluate(`(() => ({
  count: window.__acCount ?? -1,
  state: window.__acLive?.[0]?.state ?? null,
  time: window.__acLive?.[0]?.currentTime ?? null,
  osc: window.__oscCount ?? 0,
  stopped: window.__oscStopped ?? 0,
}))()`);
check('AudioContext создан после касания', after?.count === 1, `создано: ${after?.count}`);
check('контекст работает (running)', after?.state === 'running', `state=${after?.state}`);
check('аудио-часы идут', (after?.time ?? 0) > 1, `currentTime=${after?.time?.toFixed(2)}`);
check('голоса играют (осцилляторы созданы)', (after?.osc ?? 0) > 0, `osc=${after?.osc}`);

// Полифония не должна расти бесконечно: ждём и смотрим, что старые гасятся.
await sleep(9000);
const later = await evaluate(`(() => ({
  osc: window.__oscCount ?? 0,
  stopped: window.__oscStopped ?? 0,
}))()`);
check('осцилляторы останавливаются', (later?.stopped ?? 0) > 0, `stopped=${later?.stopped}`);
console.log(
  `осцилляторов создано: ${later?.osc}, остановлено: ${later?.stopped} (разница = активные)`,
);

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено`);
ws.close();
process.exit(failed.length || errors.length ? 2 : 0);
