/** Таймлайн главного потока в окне long task. */
import { readFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(process.argv[2] || 'lh-trace-0.trace.json', 'utf8'));
const ev = t.traceEvents.filter((e) => e.ph === 'X' && e.dur);
const RENDERER_MAIN = 43088;
const MAIN_TID = 5364;

const mod = ev
  .filter((e) => e.name === 'v8.evaluateModule' && e.pid === RENDERER_MAIN)
  .sort((a, b) => b.dur - a.dur)[0];
const t0 = mod.ts;
const t1 = mod.ts + mod.dur;
console.log(`v8.evaluateModule: ts=${t0} dur=${(mod.dur / 1000).toFixed(1)}ms`);

const win = ev
  .filter((e) => e.pid === RENDERER_MAIN && e.tid === MAIN_TID)
  .filter((e) => e.ts + e.dur > t0 && e.ts < t1)
  .sort((a, b) => a.ts - b.ts);

console.log('--- main thread, dur > 0.5ms, inside window ---');
for (const e of win) {
  if (e.dur < 500) continue;
  console.log(
    `+${((e.ts - t0) / 1000).toFixed(1)}ms  dur=${(e.dur / 1000).toFixed(1)}ms  ${e.name}  ${JSON.stringify(e.args ?? {}).slice(0, 160)}`,
  );
}

// что ещё в этом окне на любых потоках
console.log('--- ALL threads, dur > 8ms, inside window ---');
for (const e of ev) {
  if (e.ts + e.dur <= t0 || e.ts >= t1) continue;
  if (e.dur < 8000) continue;
  console.log(
    `+${((e.ts - t0) / 1000).toFixed(1)}ms dur=${(e.dur / 1000).toFixed(1)}ms pid=${e.pid} tid=${e.tid} ${e.name}`,
  );
}
