import { millionCached } from './million.ts';

let _cache: number[] = [];
let _gen: Generator<number> | null = null;

/**
 * Алгоритм Гиббонса (spigot) для числа π на BigInt.
 * Выдаёт десятичные цифры по одной, бесконечно: 3, 1, 4, 1, 5, 9, ...
 */
export function* piDigits(): Generator<number> {
  let q = 1n,
    r = 0n,
    t = 1n,
    k = 1n,
    n = 3n,
    l = 3n;
  while (true) {
    if (4n * q + r - t < n * t) {
      yield Number(n);
      const nr = 10n * (r - n * t);
      n = (10n * (3n * q + r)) / t - 10n * n;
      q *= 10n;
      r = nr;
    } else {
      const nr = (2n * q + r) * l;
      const nn = (q * (7n * k) + 2n + r * l) / (t * l);
      q *= k;
      t *= l;
      l += 2n;
      k += 1n;
      n = nn;
      r = nr;
    }
  }
}

/** Следующие `count` цифр, начиная с индекса `from` (0 = «3» перед запятой). */
export function piSlice(from: number, count: number): number[] {
  if (from < 0) from = 0;
  if (count < 0) count = 0;
  const m = millionCached();
  if (m && from + count <= m.length) {
    const out: number[] = [];
    for (let i = from; i < from + count; i++) out.push(m.charCodeAt(i) - 48);
    return out;
  }
  const need = from + count;
  if (_cache.length < need) {
    if (!_gen) _gen = piDigits();
    while (_cache.length < need) {
      const r = _gen.next();
      if (r.done) break;
      _cache.push(r.value as number);
    }
  }
  return _cache.slice(from, from + count);
}
