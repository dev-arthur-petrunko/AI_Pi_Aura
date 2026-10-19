import { readFileSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGS, formatNum, t, setLang, initLang } from '../src/i18n/index.ts';
import uk from '../src/i18n/uk.json';
import en from '../src/i18n/en.json';

const ROOT = join(process.cwd(), 'src');

const dict = { uk, en } as const;
const PLACEHOLDER = /\{(\w+)\}/g;

describe('i18n: uk.json ↔ en.json', () => {
  it('ключи совпадают 1 в 1', () => {
    const ukKeys = Object.keys(uk).sort();
    const enKeys = Object.keys(en).sort();
    expect(ukKeys).toEqual(enKeys);
  });

  it('нет пустых значений', () => {
    for (const lang of LANGS) {
      for (const [k, v] of Object.entries(dict[lang])) {
        expect(String(v).trim(), `${lang}:${k}`).not.toBe('');
      }
    }
  });

  it('одинаковые плейсхолдеры {n} в обоих языках', () => {
    for (const k of Object.keys(uk) as (keyof typeof uk)[]) {
      const ph = (s: string) =>
        [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();
      expect(ph(dict.uk[k]), k).toEqual(ph(dict.en[k]));
    }
  });

  it('украинский апостроф единообразно U+2019', () => {
    for (const v of Object.values(uk)) {
      // нет ASCII-апострофа ' в украинских значениях
      expect(v.includes("'"), v).toBe(false);
    }
    expect(uk['feynman']).toContain('’');
    expect(uk['feynman']).toContain('дев’яток');
  });

  it('в .ts нет «голых» строк с текстами интерфейса', () => {
    // ищем типичные украинские/английские строки из словаря в исходниках
    const texts = Object.values(uk).concat(Object.values(en));
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        return e.name.endsWith('.ts') ? [p] : [];
      });
    const files = walk(ROOT);
    for (const file of files) {
      if (file.includes(`i18n${sep}`)) continue;
      const src = readFileSync(file, 'utf8');
      for (const text of texts) {
        if (text.length > 8) {
          expect(src.includes(text), `${file}: "${text}"`).toBe(false);
        }
      }
    }
  });
});

describe('i18n: подстановка и числа', () => {
  it('t() подставляет {n}', () => {
    initLang();
    setLang('uk');
    expect(t('hud.digit', { n: 1247 })).toBe('π · цифра 1247');
    setLang('en');
    expect(t('hud.digit', { n: 1247 })).toBe('π · digit 1247');
  });

  it('числа через Intl.NumberFormat', () => {
    expect(formatNum(1247, 'en')).toBe('1,247');
    // в uk — группировка пробелоподобным символом, не запятая
    expect(formatNum(1247, 'uk')).toMatch(/^1[\s\u00A0\u2009\u202F]247$/);
  });

  it('все ключи из таблицы присутствуют', () => {
    const required = [
      'intro.touch', 'hud.digit', 'menu.title', 'menu.language', 'menu.sound',
      'menu.scale', 'menu.scale.major', 'menu.scale.minor', 'menu.speed',
      'menu.save', 'menu.about', 'menu.restart', 'menu.restart.confirm',
      'menu.close', 'feynman', 'infinite', 'resume', 'about.text', 'save.caption',
    ] as const;
    for (const k of required) {
      expect(Object.keys(uk)).toContain(k);
      expect(Object.keys(en)).toContain(k);
    }
  });
});
