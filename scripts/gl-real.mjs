/**
 * Точный заём: на каком GL-вызове main thread ждёт GPU.
 * Использует НАСТОЯЩИЙ шейдер проекта (src/gfx/water.frag.glsl).
 * Запуск: node scripts/gl-real.mjs [cdpPort]
 */
import { readFileSync } from 'node:fs';

const CDP_PORT = Number(process.argv[2] || 9333);
const frag = readFileSync(new URL('../src/gfx/water.frag.glsl', import.meta.url), 'utf8');

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
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');

const src = JSON.stringify(frag);
const expr = `(() => {
  const t = [];
  const mark = (k) => t.push([k, performance.now()]);
  const c = document.createElement('canvas');
  c.width = 800; c.height = 600;
  mark('start');
  const gl = c.getContext('webgl2', { antialias:false, alpha:false, depth:false, stencil:false });
  mark('getContext');
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const vsSrc = '#version 300 es\\nlayout(location=0) in vec2 aPos;\\nvoid main(){ gl_Position = vec4(aPos,0.,1.); }';
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, vsSrc);
  gl.compileShader(vs);
  mark('compileVS');
  const vsOk = gl.getShaderParameter(vs, gl.COMPILE_STATUS);
  mark('statusVS');
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, ${src});
  gl.compileShader(fs);
  mark('compileFS');
  const fsOk = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
  mark('statusFS');
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  mark('link');
  const linkOk = gl.getProgramParameter(prog, gl.LINK_STATUS);
  mark('linkStatus');
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.viewport(0,0,800,600);
  mark('setup');
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  mark('draw');
  gl.finish();
  mark('finish');
  const out = [];
  for (let i = 1; i < t.length; i++) out.push(t[i][0] + '=' + (t[i][1]-t[i-1][1]).toFixed(1));
  return { renderer, steps: out, vsOk, fsOk, linkOk };
})()`;

const res = await evaluate(expr);
console.log(JSON.stringify(res, null, 2));

await fetch(`http://localhost:${CDP_PORT}/json/close/${page.id}`);
ws.close();
process.exit(0);
