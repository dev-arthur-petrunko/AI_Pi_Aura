/**
 * Мини-i18n: два JSON, подстановка {n}, числа через Intl.NumberFormat.
 * Новый язык = один новый JSON; код знает только список поддерживаемых языков.
 */

import uk from './uk.json';
import en from './en.json';

export const LANGS = ['uk', 'en'] as const;
export type Lang = (typeof LANGS)[number];
export type TKey = keyof typeof uk;

const DICTS: Record<Lang, Record<string, string>> = { uk, en };

let current: Lang = 'uk';
const listeners = new Set<(lang: Lang) => void>();

export function detectLang(): Lang {
  let saved: string | null = null;
  try {
    saved = globalThis.localStorage?.getItem('pi.lang') ?? null;
  } catch {
    /* нет storage */
  }
  if (saved === 'uk' || saved === 'en') return saved;
  const nav =
    typeof navigator !== 'undefined' ? (navigator.language ?? '').toLowerCase() : '';
  return nav.startsWith('uk') ? 'uk' : 'en';
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (!LANGS.includes(lang)) return;
  current = lang;
  try {
    globalThis.localStorage?.setItem('pi.lang', lang);
  } catch {
    /* нет storage */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  for (const cb of listeners) cb(lang);
}

export function onLangChange(cb: (lang: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Перевод с подстановкой параметров: t('hud.digit', { n: 42 }). */
export function t(key: TKey, params?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? String(key);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** Локализованное число: uk → «1 247», en → «1,247». */
export function formatNum(n: number, lang: Lang = current): string {
  return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-US').format(n);
}

/** Инициализация: язык из storage/браузера, тег <html lang>. */
export function initLang(): Lang {
  current = detectLang();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
  }
  return current;
}
