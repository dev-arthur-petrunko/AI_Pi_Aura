import { piDigits } from './spigot.ts';

/**
 * Web Worker: генерирует цифры π пачками по BATCH_SIZE
 * и отдаёт их основному потоку через postMessage.
 */

const BATCH_SIZE = 64;

let gen = piDigits();
let skipped = 0;
let skipTarget = 0;
let pending = false;

function nextBatch(): number[] {
  const batch: number[] = [];
  while (batch.length < BATCH_SIZE) {
    const r = gen.next();
    if (r.done) break;
    if (skipped < skipTarget) {
      skipped++;
      continue;
    }
    batch.push(r.value as number);
  }
  return batch;
}

/** Отдаёт ровно одну пачку — воркер производит только по запросу (без раздувания буфера). */
function sendBatch(): void {
  if (pending) return;
  pending = true;
  const batch = nextBatch();
  pending = false;
  if (batch.length > 0) {
    (self as unknown as Worker).postMessage({ type: 'digits', digits: batch });
  }
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; from?: number };
  if (msg.type === 'start') {
    // новый генератор: «Начать сначала» реально начинает π заново
    gen = piDigits();
    skipTarget = msg.from ?? 0;
    skipped = 0;
    sendBatch();
  } else if (msg.type === 'need') {
    sendBatch();
  }
};
