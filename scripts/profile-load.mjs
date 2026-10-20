/**
 * CPU-профиль загрузки: ищем, чем занят главный поток (длинный task в Lighthouse).
 * Запуск: node scripts/profile-load.mjs [cdpPort] [previewPort] [throttle]
 */
const CDP_PORT = Number(process.argv[2] || 9222);
const PREVIEW_PORT = Number(process.argv[3] || 4174);
const THROTTLE = Number(process.argv[4] || 4); // Lighthouse по умолчанию замедляет CPU в 4 раза
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

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id;
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true,
});
await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);

await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');

const nonce = Date.now().toString(36);
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?v=${nonce}` });
await sleep(4000);

const { result } = await send('Profiler.stop');

// Суммируем self-time по узлам
const nodes = new Map();
for (const n of result.profile.nodes) nodes.set(n.id, n);

const selfTime = new Map();
const deltas = result.profile.timeDeltas ?? [];
for (let i = 0; i < result.profile.samples.length; i++) {
  const id2 = result.profile.samples[i];
  const dt = deltas[i] ?? 0;
  selfTime.set(id2, (selfTime.get(id2) ?? 0) + dt);
}

const rows = [];
for (const [nid, t] of selfTime) {
  const n = nodes.get(nid);
  if (!n) continue;
  const f = n.callFrame;
  rows.push({
    ms: Math.round(t),
    fn: f.functionName || '(anonymous)',
    url: (f.url || '').split('/').pop(),
    line: f.lineNumber,
  });
}
rows.sort((a, b) => b.ms - a.ms);
console.log('--- top self-time (ms) ---');
for (const r of rows.slice(0, 15)) {
  console.log(`${r.ms}\t${r.fn}\t${r.url}:${r.line}`);
}

const total = rows.reduce((a, b) => a + b.ms, 0);
console.log('total sampled:', total, 'ms');

ws.close();
process.exit(0);