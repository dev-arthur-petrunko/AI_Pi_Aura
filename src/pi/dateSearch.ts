export type Lang = 'uk' | 'en';
export type DateParts = { d: number; m: number; y?: number };
export type Hit = { fmt: string; digits: string; index: number; len: number };

export function validateDate(p: DateParts): 'ok' | 'day' | 'month' | 'year' {
  if (!Number.isInteger(p.m) || p.m < 1 || p.m > 12) return 'month';
  const now = new Date().getFullYear();
  if (p.y !== undefined) {
    if (!Number.isInteger(p.y) || p.y < 1900 || p.y > now) return 'year';
  }
  // day validation with month/year
  const year = p.y ?? 2000; // leap check only matters for Feb 29
  const leap = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0));
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(p.d) || p.d < 1 || p.d > daysInMonth[p.m - 1]) return 'day';
  // if year not provided and day is 29 Feb, accept (treat as leap)
  return 'ok';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function yearVariants(y: number): string[] {
  const full = String(y);
  const short = full.slice(-2);
  return [full, short];
}

export function candidates(p: DateParts, lang: Lang): { fmt: string; digits: string }[] {
  const out: { fmt: string; digits: string }[] = [];
  const seen = new Set<string>();
  const add = (fmt: string, digits: string) => {
    if (!digits) return;
    const key = fmt + '|' + digits;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ fmt, digits });
  };

  const D = pad2(p.d);
  const M = pad2(p.m);
  const Dnz = String(p.d);
  const Mnz = String(p.m);

  // preference order within same length
  // uk: ДМГ, МДГ, ГМД ; en: МДГ, ДМГ, ГМД
  const pushDateOnly = () => {
    // length 4: DDMM and MMDD
    if (lang === 'uk') {
      add('DDMM', D + M);
      add('MMDD', M + D);
    } else {
      add('MMDD', M + D);
      add('DDMM', D + M);
    }
  };

  if (p.y !== undefined) {
    const ys = yearVariants(p.y);
    // long formats first (8 digits), then 6 digits, then no-zero 6
    // uk preference: DMG, MDG, GMD
    const longs: { fmt: string; digits: string }[] = [];
    for (const y of ys) {
      // full year only for 8-digit
      if (y.length === 4) {
        longs.push({ fmt: 'DDMMYYYY', digits: D + M + y });
        longs.push({ fmt: 'MMDDYYYY', digits: M + D + y });
        longs.push({ fmt: 'YYYYMMDD', digits: y + M + D });
      }
    }
    // apply language preference by reordering
    const pref = lang === 'uk' ? ['DDMMYYYY', 'MMDDYYYY', 'YYYYMMDD'] : ['MMDDYYYY', 'DDMMYYYY', 'YYYYMMDD'];
    const sortedLongs: { fmt: string; digits: string }[] = [];
    for (const f of pref) {
      for (const l of longs) if (l.fmt === f) sortedLongs.push(l);
    }
    for (const l of sortedLongs) add(l.fmt, l.digits);

    // 6-digit: DDMMYY
    const shortYs = ys.filter((y) => y.length === 2);
    const sixes: { fmt: string; digits: string }[] = [];
    for (const y of shortYs) {
      sixes.push({ fmt: 'DDMMYY', digits: D + M + y });
      sixes.push({ fmt: 'MMDDYY', digits: M + D + y });
    }
    const pref6 = lang === 'uk' ? ['DDMMYY', 'MMDDYY'] : ['MMDDYY', 'DDMMYY'];
    const sorted6: { fmt: string; digits: string }[] = [];
    for (const f of pref6) for (const s6 of sixes) if (s6.fmt === f) sorted6.push(s6);
    for (const s6 of sorted6) add(s6.fmt, s6.digits);

    // no-zero variants (e.g. 1.3.1995 -> 131995)
    add('DMY', Dnz + Mnz + String(p.y));
    add('MDY', Mnz + Dnz + String(p.y));
  }

  // without year (or fallback)
  pushDateOnly();

  // dedupe by digits? requirement: без дубликатов. Dedupe exact duplicate digit strings too.
  const seenDigits = new Set<string>();
  const filtered: { fmt: string; digits: string }[] = [];
  for (const c of out) {
    if (seenDigits.has(c.digits)) continue;
    seenDigits.add(c.digits);
    filtered.push(c);
  }
  return filtered;
}

export function findAll(s: string, p: DateParts, lang: Lang, max = 6): Hit[] {
  const cands = candidates(p, lang);
  const hits: Hit[] = [];
  for (const c of cands) {
    const idx = s.indexOf(c.digits);
    if (idx >= 0) {
      hits.push({ fmt: c.fmt, digits: c.digits, index: idx, len: c.digits.length });
    }
    if (hits.length >= max) break;
  }
  // longest first
  hits.sort((a, b) => b.len - a.len || a.index - b.index);
  return hits.slice(0, max);
}

export function chance(len: number, n = 1_000_000): number {
  // 1 - exp(-(n - len + 1) / 10**len)
  const denom = Math.pow(10, len);
  const x = (n - len + 1) / denom;
  return 1 - Math.exp(-x);
}
