import { piDigits } from './spigot.ts';

/**
 * Поток цифр π для основного потока.
 * - держит буфер впереди минимум на BUFFER_MIN цифр;
 * - позиция (сколько цифр уже отдано) хранится в localStorage (`pi.index`);
 * - при перезапуске продолжает с места остановки;
 * - если Web Worker недоступен — генерирует цифры в основном потоке.
 */

const BUFFER_MIN = 200;
const BATCH = 64;
const STORE_KEY = 'pi.index';

export type DigitsListener = (digit: number, index: number) => void;

function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* приватный режим — просто не сохраняем */
  }
}

export class PiStream {
  /** Позиция: сколько цифр уже отдано потребителям (индекс следующей цифры). */
  private consumed = 0;
  private buffer: number[] = [];
  private generator: Generator<number> | null = null;
  private worker: Worker | null = null;
  private waiters: DigitsListener[] = [];
  private savedUpTo = 0;
  /** Сколько цифр надо пропустить в основном потоке (запасной путь). */
  private skipLeft = 0;

  constructor(startIndex = PiStream.loadIndex()) {
    this.consumed = startIndex;
    this.savedUpTo = startIndex;
    this.start(startIndex);
  }

  static loadIndex(): number {
    const raw = storageGet(STORE_KEY);
    const n = raw === null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  static resetIndex(): void {
    storageSet(STORE_KEY, '0');
  }

  get index(): number {
    return this.consumed;
  }

  get ahead(): number {
    return this.buffer.length;
  }

  private start(from: number): void {
    try {
      this.worker = new Worker(new URL('./piWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { type: string; digits: number[] };
        if (msg.type === 'digits') {
          this.buffer.push(...msg.digits);
          this.notify();
          if (this.buffer.length < BUFFER_MIN) this.requestMore();
        }
      };
      this.worker.onerror = () => {
        // воркер сломался — переходим на основной поток
        this.worker?.terminate();
        this.worker = null;
        this.useMainThread(from);
      };
      this.worker.postMessage({ type: 'start', from });
    } catch {
      this.worker = null;
      this.useMainThread(from);
    }
  }

  /** Запасной путь: генерация в основном потоке, с пропуском до `from`. */
  private useMainThread(from: number): void {
    this.generator = piDigits();
    this.skipLeft = from;
    this.pumpMain();
  }

  private requestMore(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'need' });
    } else {
      this.pumpMain();
    }
  }

  /** Запасной путь: генерация в основном потоке. */
  private pumpMain(): void {
    if (!this.generator) this.generator = piDigits();
    // сперва пропускаем цифры до сохранённой позиции
    while (this.skipLeft > 0) {
      const r = this.generator.next();
      if (r.done) {
        this.skipLeft = 0;
        break;
      }
      this.skipLeft--;
    }
    let made = 0;
    while (made < BATCH) {
      const r = this.generator.next();
      if (r.done) break;
      this.buffer.push(r.value as number);
      made++;
    }
    if (this.buffer.length < BUFFER_MIN && made > 0) {
      // не блокируем интерфейс большими порциями
      if (typeof queueMicrotask === 'function') queueMicrotask(() => this.pumpMain());
      else setTimeout(() => this.pumpMain(), 0);
    }
    this.notify();
  }

  /**
   * Взять следующую цифру. Возвращает null, если буфер пока пуст
   * (потребитель должен подписаться через onDigits и повторить попытку).
   */
  take(): { digit: number; index: number } | null {
    if (this.buffer.length === 0) {
      this.requestMore();
      return null;
    }
    const digit = this.buffer.shift() as number;
    const index = this.consumed;
    this.consumed++;
    this.persist();
    if (this.buffer.length < BUFFER_MIN) this.requestMore();
    return { digit, index };
  }

  /** Подписка на готовность цифр (вызывается, когда take() вернул null). */
  onDigits(cb: DigitsListener): void {
    this.waiters.push(cb);
  }

  private notify(): void {
    if (this.buffer.length === 0) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w(this.buffer[0], this.consumed);
  }

  private persist(): void {
    // пишем в localStorage не чаще, чем раз в 10 цифр
    if (this.consumed - this.savedUpTo >= 10) {
      this.savedUpTo = this.consumed;
      storageSet(STORE_KEY, String(this.consumed));
    }
  }

  /** Сброс позиции («Начать сначала»). */
  reset(): void {
    this.buffer = [];
    this.consumed = 0;
    this.savedUpTo = 0;
    this.skipLeft = 0;
    PiStream.resetIndex();
    if (this.worker) {
      this.worker.postMessage({ type: 'start', from: 0 });
    } else {
      this.useMainThread(0);
    }
  }

  /** Форсированное сохранение (pagehide / visibilitychange). */
  flush(): void {
    storageSet(STORE_KEY, String(this.consumed));
    this.savedUpTo = this.consumed;
  }

  dispose(): void {
    this.flush();
    this.worker?.terminate();
    this.worker = null;
  }
}
