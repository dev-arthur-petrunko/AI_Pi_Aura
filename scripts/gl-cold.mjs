/**
 * Изоляция стоимости компиляции шейдера: сколько мс занимает синхронная
 * инициализация WebGL2 (getContext + compileShader) на ХОЛОДНОМ профиле.
 * Запуск: node scripts/gl-cold.mjs [cdpPort] [previewPort]
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
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');

await send('Page.navigate', { url: 'about:blank' });
await sleep(300);

// Замер внутри страницы: синхронная компиляция шейдера
const cold = await evaluate(`(() => {
  const t0 = performance.now();
  const gl = document.createElement('canvas').getContext('webgl2');
  const t1 = performance.now();
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, '#version 300 es\\nlayout(location=0) in vec2 p; void main(){gl_Position=vec4(p,0.,1.);}');
  gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, '#version 300 es\\nprecision highp float; out vec4 o; void main(){o=vec4(1.);}');
  gl.compileShader(fs);
  const t2 = performance.now();
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  const t3 = performance.now();
  return { getContext: +(t1-t0).toFixed(1), compile: +(t2-t1).toFixed(1), link: +(t3-t2).toFixed(1) };
})()`);
console.log('COLD GL compile:', JSON.stringify(cold));

// Второй раз в той же сессии (кэш драйвера прогрет)
const warm = await evaluate(`(() => {
  const t0 = performance.now();
  const gl = document.createElement('canvas').getContext('webgl2');
  const t1 = performance.now();
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, '#version 300 es\\nprecision highp float; out vec4 o; void main(){o=vec4(1.);}');
  gl.compileShader(fs);
  const t2 = performance.now();
  return { getContext: +(t1-t0).toFixed(1), compile: +(t2-t1).toFixed(1) };
})()`);
console.log('WARM GL compile:', JSON.stringify(warm));

await fetch(`http://localhost:${CDP_PORT}/json/close/${page.id}`);
ws.close();
process.exit(0);
