// Разбор trace-файла Lighthouse: ищем самые длинные задачи главного потока.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const raw = JSON.parse(readFileSync(file, 'utf8'));
const evs = raw.traceEvents ?? raw;

const byName = new Map();
for (const e of evs) {
  if (!e.dur) continue;
  byName.set(e.name, (byName.get(e.name) || 0) + e.dur);
}
console.log('--- cumulative duration by event name (top 25) ---');
console.log(
  [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([k, v]) => `${(v / 1000).toFixed(1).padStart(9)}ms  ${k}`)
    .join('\n'),
);

// v8.evaluateModule по процессам/потокам и по URL
console.log('\n--- v8.evaluateModule events (top 15) ---');
const mods = evs.filter((e) => e.name === 'v8.evaluateModule' && e.dur);
const modByUrl = new Map();
for (const e of mods) {
  const url = e.args?.data?.url ?? e.args?.data?.fileName ?? '(no url)';
  const k = `${url} [pid=${e.pid} tid=${e.tid}]`;
  modByUrl.set(k, (modByUrl.get(k) || 0) + e.dur);
}
console.log(
  [...modByUrl.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, v]) => `${(v / 1000).toFixed(1).padStart(8)}ms  ${k}`)
    .join('\n'),
);

console.log('\n--- longest evaluateModule / callFunction single events ---');
for (const e of evs
  .filter((x) => x.dur && /v8\.(evaluateModule|callFunction|compile|parse)/.test(x.name))
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 12)) {
  const d = e.args?.data ?? {};
  console.log(
    `  ${(e.dur / 1000).toFixed(1).padStart(7)}ms  ${e.name}  pid=${e.pid} tid=${e.tid}  ${(d.url ?? d.fileName ?? '').slice(-60)}`,
  );
}

// Кто был "busy" в main thread: сумма по pid/tid
console.log('\n--- total RunTask time per pid/tid ---');
const perThread = new Map();
for (const e of evs) {
  if (e.name !== 'RunTask') continue;
  const k = `pid=${e.pid} tid=${e.tid}`;
  perThread.set(k, (perThread.get(k) || 0) + e.dur);
}
console.log(
  [...perThread.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `${(v / 1000).toFixed(1).padStart(9)}ms  ${k}`)
    .join('\n'),
);
console.log('\n--- все v8.evaluateModule события (детально) ---');
for (const e of evs
  .filter((x) => x.name === 'v8.evaluateModule' && x.dur)
  .sort((a, b) => b.dur - a.dur)
  .slice(0, 4)) {
  console.log(`\nevaluateModule ${(e.dur / 1000).toFixed(1)}ms pid=${e.pid} tid=${e.tid} ts=${e.ts}`);
  console.log('  args:', JSON.stringify(e.args).slice(0, 300));
  const inside = evs
    .filter(
      (x) =>
        x.dur &&
        x.pid === e.pid &&
        x.tid === e.tid &&
        x.ts > e.ts &&
        x.ts + x.dur <= e.ts + e.dur &&
        x.name !== 'v8.evaluateModule',
    )
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 12)
    .map((x) => `   ${(x.dur / 1000).toFixed(1).padStart(7)}ms  ${x.name}  ${JSON.stringify(x.args?.data ?? {}).slice(0, 110)}`);
  console.log(inside.join('\n'));
}

const mainThread = evs.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain');
const mainPid = mainThread?.pid;
const mainTid = mainThread?.args?.tid;

const inMain = (e) => e.pid === mainPid && e.tid === mainTid;

const tasks = evs
  .filter((e) => e.dur && inMain(e) && /RunTask|Task|ThreadControllerImpl/i.test(e.name))
  .sort((a, b) => b.dur - a.dur);

console.log(`\n--- thread_name events ---`);
for (const e of evs.filter((x) => x.name === 'thread_name').slice(0, 12)) {
  console.log(`  pid=${e.pid} tid=${e.args?.tid} name=${e.args?.name}`);
}
console.log(`mainPid=${mainPid} mainTid=${mainTid}`);

// RunTask по всем потокам
const allRunTasks = evs.filter((e) => e.name === 'RunTask').sort((a, b) => b.dur - a.dur);
console.log(`\n--- top 10 RunTask overall (of ${allRunTasks.length}) ---`);
for (const t of allRunTasks.slice(0, 10)) {
  console.log(`  ${(t.dur / 1000).toFixed(1).padStart(8)}ms  pid=${t.pid} tid=${t.tid} @ts=${t.ts}`);
}

if (!tasks.length) {
  console.log('\n(нет RunTask в main — ищем по вложенности в самый длинный RunTask)');
  const longest = allRunTasks[0];
  if (longest) {
    console.log(`longest RunTask ${(longest.dur / 1000).toFixed(1)}ms pid=${longest.pid} tid=${longest.tid}`);
    const inside = evs
      .filter(
        (e) =>
          e.dur &&
          e.pid === longest.pid &&
          e.tid === longest.tid &&
          e.ts >= longest.ts &&
          e.ts + e.dur <= longest.ts + longest.dur &&
          e.name !== 'RunTask',
      )
      .sort((a, b) => b.dur - a.dur)
      .slice(0, 20)
      .map(
        (e) =>
          `   ${(e.dur / 1000).toFixed(1).padStart(7)}ms  ${e.name}  ${JSON.stringify(e.args?.data ?? e.args ?? {}).slice(0, 160)}`,
      );
    console.log(inside.join('\n'));
  }
}

for (const t of tasks.slice(0, 5)) {
  console.log(`\nTASK ${(t.dur / 1000).toFixed(1)}ms @ts=${t.ts} name=${t.name}`);
  const inside = evs
    .filter((e) => e.dur && inMain(e))
    .filter((e) => e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 15)
    .map(
      (e) =>
        `   ${(e.dur / 1000).toFixed(1).padStart(7)}ms  ${e.name}  ${JSON.stringify(e.args?.data ?? e.args ?? {}).slice(0, 160)}`,
    );
  console.log(inside.join('\n'));
}
