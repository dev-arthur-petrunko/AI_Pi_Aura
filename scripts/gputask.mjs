/** Что именно блокирует: GPUTask внутри окна v8.evaluateModule. */
import { readFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(process.argv[2] || 'lh-trace-0.trace.json', 'utf8'));
const ev = t.traceEvents.filter((e) => e.ph === 'X' && e.dur);
const gpu = ev.filter((e) => e.name === 'GPUTask').sort((a, b) => b.dur - a.dur);
console.log('--- top GPUTask ---');
for (const e of gpu.slice(0, 6)) {
  console.log(
    `dur=${(e.dur / 1000).toFixed(1)}ms pid=${e.pid} tid=${e.tid} ts=${e.ts} args=${JSON.stringify(e.args).slice(0, 400)}`,
  );
}
const mod = ev.filter((e) => e.name === 'v8.evaluateModule').sort((a, b) => b.dur - a.dur);
console.log('--- v8.evaluateModule ---');
for (const e of mod) {
  console.log(`dur=${(e.dur / 1000).toFixed(1)}ms pid=${e.pid} tid=${e.tid} ts=${e.ts}`);
}
console.log('--- pids ---');
const pids = {};
for (const e of ev) pids[e.pid] = (pids[e.pid] || 0) + 1;
console.log(JSON.stringify(pids));
console.log('--- process_name ---');
for (const e of t.traceEvents) {
  if (e.name === 'process_name' || e.name === 'thread_name') {
    console.log(`${e.name} pid=${e.pid} tid=${e.tid} ${e.args?.name}`);
  }
}
