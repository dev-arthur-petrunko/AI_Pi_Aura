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
  const out: number[] = [];
  const it = piDigits();
  for (let i = 0; i < from + count; i++) {
    const d = it.next();
    if (d.done) break;
    if (i >= from) out.push(d.value as number);
  }
  return out;
}
