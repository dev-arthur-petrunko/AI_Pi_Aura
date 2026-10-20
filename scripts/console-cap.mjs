/**
 * Сбор console-сообщений при загрузке страницы (для этапов инициализации).
 * Запуск: node scripts/console-cap.mjs [cdpPort] [previewPort]
 */
const CDP_PORT = Number(process.argv[2] || 9223);
const PREVIEW_PORT = Number(process.argv[3] || 4174);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const created = await fetch(`http://localhost:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
const target = await created.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const txt = (msg.params.args || [])
      .map((a) => a.value ?? a.description ?? a.type)
      .join(' ');
    logs.push(`[console] ${txt}`);
  }
  if (msg.method === 'Log.entryAdded') {
    logs.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
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
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[4] || 4) });
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/` });
await sleep(6000);
console.log(logs.join('\n') || '(нет сообщений)');
await fetch(`http://localhost:${CDP_PORT}/json/close/${target.id}`);
process.exit(0);
