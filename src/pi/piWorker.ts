import { piDigits } from './spigot.ts';

/**
 * Web Worker: генерирует цифры π пачками по BATCH_SIZE
 * и отдаёт их основному потоку через postMessage.
 */

const BATCH_SIZE = 64;

const gen = piDigits();
let skipped = 0;
let skipTarget = 0;
let running = false;

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

function pump() {
  if (!running) return;
  const batch = nextBatch();
  if (batch.length > 0) {
    (self as unknown as Worker).postMessage({ type: 'digits', digits: batch });
    // уступаем кадру/интерфейсу: следующая пачка — асинхронно
    setTimeout(pump, 0);
  }
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as { type: string; from?: number };
  if (msg.type === 'start') {
    skipTarget = msg.from ?? 0;
    skipped = 0;
    running = true;
    pump();
  } else if (msg.type === 'need') {
    if (!running) {
      running = true;
      pump();
    }
  }
};
