/**
 * Проверка «Сохранить момент»: кадр → PNG с подписью «π · цифра N».
 * Перехватываем скачивание и проверяем, что файл — валидный PNG нужного размера.
 *
 * Запуск: node scripts/save.mjs [cdpPort] [previewPort]
 *
 * Звук: страница открывается с ?silent=1 — AudioContext не создаётся вовсе.
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

// Перехватываем клик по <a download>: вместо скачивания читаем blob.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__saved = null;
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith('blob:')) {
        window.__saved = { name: this.download, href: this.href };
        return;
      }
      return realClick.apply(this, arguments);
    };
    try { localStorage.setItem('pi.index', '0'); } catch (e) {}
  `,
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

// запускаем поток, чтобы было что сохранять
await evaluate(`(() => {
  const c = document.getElementById('water');
  const o = { bubbles: true, pointerId: 1, clientX: 195, clientY: 420, isPrimary: true };
  c.dispatchEvent(new PointerEvent('pointerdown', o));
  c.dispatchEvent(new PointerEvent('pointerup', o));
})()`);
await sleep(2500);

// открываем меню и жмём «Сохранить момент»
await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }))`);
await sleep(600);
await evaluate(`document.getElementById('btn-save')?.click()`);
await sleep(1500);

const saved = await evaluate(`window.__saved ? { name: window.__saved.name, href: window.__saved.href } : null`);
check('сохранение вызвало скачивание файла', !!saved, JSON.stringify(saved));
check('имя файла содержит номер цифры', /^pi-aura-\d+\.png$/.test(saved?.name ?? ''), saved?.name);

// читаем сам PNG и проверяем заголовок + размеры
const png = await evaluate(`(async () => {
  if (!window.__saved) return null;
  const res = await fetch(window.__saved.href);
  const buf = new Uint8Array(await res.arrayBuffer());
  const sig = Array.from(buf.slice(0, 8)).join(',');
  // PNG IHDR: ширина и высота на байтах 16..23 (big-endian)
  const view = new DataView(buf.buffer);
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  return { size: buf.length, sig, w, h };
})()`);
check('файл — валидный PNG', png?.sig === '137,80,78,71,13,10,26,10', JSON.stringify(png));
check('кадр непустой', (png?.size ?? 0) > 10000, `${png?.size} байт`);
check(
  'высота = кадр + подпись (12%)',
  Math.abs((png?.h ?? 0) / (png?.w ?? 1) - 844 / 390 * 1.12) < 0.2,
  `${png?.w}×${png?.h}`,
);

console.log(errors.length ? 'CONSOLE ISSUES:\n' + errors.join('\n') : 'CONSOLE: clean');
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} проверок пройдено`);
ws.close();
process.exit(failed.length || errors.length ? 2 : 0);
