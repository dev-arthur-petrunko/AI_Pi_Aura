/**
 * Извлечь из Lighthouse-трейса события v8.evaluateModule и связанные с ними
 * дочерние события, чтобы понять, какой модуль вызвал долгую нативную блокировку.
 * Запуск: node scripts/trace-module.mjs [traceFile]
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2] || 'lh-trace.json';
const raw = JSON.parse(readFileSync(file, 'utf8'));
const events = Array.isArray(raw) ? raw : raw.traceEvents;
console.log('файл:', file, 'событий:', events.length);

const evs = events
  .filter((e) => e.ph === 'X' || e.ph === 'B' || e.ph === 'I')
  .map((e) => ({ ...e, dur: e.dur || 0 }))
  .filter((e) => e.dur > 0)
  .sort((a, b) => a.ts - b.ts);

// Топ-15 самых долгих событий на main thread
const mainThread = new Map();
for (const e of evs) {
  if (e.name === 'thread_name' && e.args?.name) mainThread.set(e.pid, e.args.name);
}
const byPid = new Map();
for (const e of evs) {
  if (!byPid.has(e.pid)) byPid.set(e.pid, []);
  byPid.get(e.pid).push(e);
}

for (const [pid, list] of byPid) {
  const tname = mainThread.get(pid) || '?';
  const top = list
    .filter((e) => e.dur > 20000)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 12);
  if (!top.length) continue;
  console.log(`\n=== pid ${pid} (${tname}) — события > 20 мс ===`);
  for (const e of top) {
    const d = (e.dur / 1000).toFixed(1);
    const det = e.args?.data ? JSON.stringify(e.args.data).slice(0, 200) : '';
    console.log(`${d}ms  ${e.name}  ${det}`);
  }
}

// События v8.evaluateModule: найти самые долгие и всё, что внутри них
const modules = evs.filter((e) => e.name === 'v8.evaluateModule');
modules.sort((a, b) => b.dur - a.dur);
console.log('\n=== v8.evaluateModule (топ-10) ===');
for (const m of modules.slice(0, 10)) {
  console.log(
    `${(m.dur / 1000).toFixed(1)}ms pid=${m.pid} tid=${m.tid} ts=${m.ts} args=${JSON.stringify(m.args ?? {}).slice(0, 300)}`,
  );
}

// Всё, что попадает внутрь самого долгого v8.evaluateModule
if (modules.length) {
  const big = modules[0];
  const t0 = big.ts;
  const t1 = big.ts + big.dur;
  console.log(
    `\n=== содержимое окна v8.evaluateModule ${(big.dur / 1000).toFixed(1)}ms (pid=${big.pid} tid=${big.tid}) ===`,
  );
  const inside = evs
    .filter((e) => e.pid === big.pid && e.tid === big.tid && e.ts >= t0 && e.ts <= t1)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 40);
  for (const e of inside) {
    console.log(
      `  +${((e.ts - t0) / 1000).toFixed(1)}ms ${(e.dur / 1000).toFixed(1)}ms ${e.name} ${JSON.stringify(e.args ?? {}).slice(0, 220)}`,
    );
  }
}

// GL/GPU-события во всём трейсе
const glNames = evs.filter(
  (e) => /GPUTask|GLProgram|WebGL|shader|Shader|Compile|compile/i.test(e.name),
);
console.log(`\n=== GL/compile-события (${glNames.length}) ===`);
for (const e of glNames.sort((a, b) => b.dur - a.dur).slice(0, 20)) {
  console.log(
    `  pid=${e.pid} tid=${e.tid} ${(e.dur / 1000).toFixed(1)}ms ${e.name} ${JSON.stringify(e.args ?? {}).slice(0, 220)}`,
  );
}

// Пересечение: GPUTask и v8.evaluateModule по времени
const gpuTasks = evs.filter((e) => e.name === 'GPUTask' && e.dur > 50000);
if (modules.length) {
  const big = modules[0];
  console.log(
    `\n=== пересечение GPUTask с v8.evaluateModule [${(big.ts / 1000).toFixed(1)} … ${((big.ts + big.dur) / 1000).toFixed(1)}] ===`,
  );
  for (const g of gpuTasks.sort((a, b) => a.ts - b.ts)) {
    const inWindow = g.ts <= big.ts + big.dur && g.ts + g.dur >= big.ts;
    console.log(
      `  ${inWindow ? 'ВНУТРИ' : '     '} ts=${(g.ts / 1000).toFixed(1)} dur=${(g.dur / 1000).toFixed(1)}ms pid=${g.pid} ${JSON.stringify(g.args ?? {}).slice(0, 160)}`,
    );
  }
}
