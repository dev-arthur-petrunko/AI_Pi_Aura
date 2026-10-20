/**
 * Замер: из чего складывается старт (инициализация WebGL, первый кадр, компиляция шейдера).
 * Запуск: node scripts/perf-probe.mjs [cdpPort] [previewPort]
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

// Своя вкладка — чтобы не драться с soak/другими скриптами за одну страницу.
const created = await fetch(`http://localhost:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' });
const target = await created.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
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
  return r.result?.result?.value ?? null;
};

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true,
});
await send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[4] || 4) });

// Перехватываем rAF и компиляцию шейдера ДО загрузки приложения.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__raf = [];
    const origRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => origRaf((t) => {
      const t0 = performance.now();
      try { cb(t); } finally {
        window.__raf.push({ dur: +(performance.now() - t0).toFixed(1), t: Math.round(t0) });
      }
    });

    window.__longtasks = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__longtasks.push({ dur: Math.round(e.duration), start: Math.round(e.startTime) });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch (e) { window.__longtasksErr = String(e); }

    // Атрибуция: сколько стоит компиляция/линковка шейдера.
    window.__gl = { compile: [], link: [], create: [], uniform: [], draw: [], viewport: [] };
    const P = WebGL2RenderingContext && WebGL2RenderingContext.prototype;
    if (P) {
      const cs = P.compileShader;
      P.compileShader = function (sh) {
        const t0 = performance.now();
        const r = cs.call(this, sh);
        window.__gl.compile.push(Math.round(performance.now() - t0));
        return r;
      };
      const lp = P.linkProgram;
      P.linkProgram = function (pr) {
        const t0 = performance.now();
        const r = lp.call(this, pr);
        window.__gl.link.push(Math.round(performance.now() - t0));
        return r;
      };
      const ul = P.getUniformLocation;
      P.getUniformLocation = function (pr, name) {
        const t0 = performance.now();
        const r = ul.call(this, pr, name);
        window.__gl.uniform.push({ name, ms: +(performance.now() - t0).toFixed(1) });
        return r;
      };
      // getShaderParameter/getProgramParameter форсируют отложенную компиляцию в ANGLE.
      const gsp = P.getShaderParameter;
      P.getShaderParameter = function (sh, p) {
        const t0 = performance.now();
        const r = gsp.call(this, sh, p);
        const ms = +(performance.now() - t0).toFixed(1);
        if (ms > 1) (window.__gl.shaderParam ||= []).push({ p, ms });
        return r;
      };
      const gpp = P.getProgramParameter;
      P.getProgramParameter = function (pr, p) {
        const t0 = performance.now();
        const r = gpp.call(this, pr, p);
        const ms = +(performance.now() - t0).toFixed(1);
        if (ms > 1) (window.__gl.progParam ||= []).push({ p, ms });
        return r;
      };
      const da = P.drawArrays;
      P.drawArrays = function (...a) {
        const t0 = performance.now();
        const r = da.apply(this, a);
        const ms = performance.now() - t0;
        window.__gl.draw.push(+ms.toFixed(1));
        // Первый draw = реальная трансляция шейдера драйвером (ANGLE/D3D11).
        if (window.__gl.draw.length <= 3) {
          window.__gl.firstDraw = { ms: +ms.toFixed(1), t: Math.round(t0) };
        }
        return r;
      };
      const vp = P.viewport;
      P.viewport = function (...a) {
        const t0 = performance.now();
        const r = vp.apply(this, a);
        window.__gl.viewport.push(+(performance.now() - t0).toFixed(1));
        return r;
      };
    }
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, opts) {
      if (String(type).startsWith('webgl')) {
        const t0 = performance.now();
        const ctx = origGetContext.call(this, type, opts);
        window.__gl.create.push({ type, ms: Math.round(performance.now() - t0) });
        return ctx;
      }
      return origGetContext.call(this, type, opts);
    };
  `,
});

await send('Page.navigate', { url: 'about:blank' });
await sleep(400);

const nonce = Date.now().toString(36);

// CPU-профиль загрузки: показываем, кто реально ест главный поток.
await send('Profiler.enable');
await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');
await send('Page.navigate', { url: `http://localhost:${PREVIEW_PORT}/?v=${nonce}` });
await sleep(4000);
const stopMsg = await send('Profiler.stop');
const profile = stopMsg.result?.profile ?? stopMsg.profile;
if (!profile) {
  console.error('no profile:', JSON.stringify(stopMsg).slice(0, 300));
  process.exit(1);
}

const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const total = profile.samples.length;
for (const id of profile.samples) {
  const n = byId.get(id);
  if (!n) continue;
  const f = n.callFrame;
  const key = `${f.functionName || '(anonymous)'} @ ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + 1);
}
const top = [...self.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 22)
  .map(([k, v]) => `${((v / total) * 100).toFixed(1).padStart(5)}%  ${(v * 0.2).toFixed(0).padStart(6)}ms  ${k}`);
console.log('--- CPU profile (total samples ' + total + ') ---');
console.log(top.join('\n'));

const rafStats = await evaluate(`(() => {
  const a = window.__raf || [];
  const sorted = [...a].sort((x, y) => y.dur - x.dur);
  return {
    total: a.length,
    totalMs: Math.round(a.reduce((s, x) => s + x.dur, 0)),
    top3: sorted.slice(0, 3),
  };
})()`);
console.log('raf:', JSON.stringify(rafStats));

// --- Trace: что именно внутри long task -----------------------------------
await send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline',
  transferMode: 'ReturnAsStream',
});
await send('Page.reload', { ignoreCache: true });
await sleep(6000);

const chunks = [];
const traceDone = new Promise((resolve) => {
  const onMsg = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Tracing.dataCollected') chunks.push(...msg.params.value);
    if (msg.method === 'Tracing.tracingComplete') resolve();
  };
  ws.addEventListener('message', onMsg);
});
await send('Tracing.end');
await traceDone;

const evs = chunks.filter((e) => e.dur && e.dur > 3000);
const byName = new Map();
for (const e of evs) byName.set(e.name, (byName.get(e.name) || 0) + e.dur);
console.log('--- trace: cumulative time by event (top 20, >3ms) ---');
console.log(
  [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)}ms  ${k}`)
    .join('\n'),
);

// Самая длинная RunTask — что внутри неё
const tasks = evs.filter((e) => /RunTask|Task$/i.test(e.name));
if (tasks.length) {
  const longest = tasks.reduce((a, b) => (b.dur > a.dur ? b : a));
  console.log(`--- longest task: ${(longest.dur / 1000).toFixed(0)}ms ---`);
  console.log(
    evs
      .filter((e) => e.ts >= longest.ts && e.ts <= longest.ts + longest.dur)
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 20)
      .map((e) => `${(e.dur / 1000).toFixed(0).padStart(6)}ms  ${e.name}`)
      .join('\n'),
  );
}

await fetch(`http://localhost:${CDP_PORT}/json/close/${target.id}`);
ws.close();
process.exit(0);