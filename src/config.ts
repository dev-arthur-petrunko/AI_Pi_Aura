/**
 * Глобальные флаги окружения.
 *
 * `?silent=1` — режим тишины: AudioContext не создаётся вообще.
 * Нужен для автотестов и скриншотов, чтобы агент ничего не слышал.
 */

function readFlag(name: string): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get(name) === '1';
  } catch {
    return false;
  }
}

/** Режим тишины: звук полностью отключён, приложение работает как визуальное. */
export const SILENT = readFlag('silent');
