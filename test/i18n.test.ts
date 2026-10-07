import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGS, TABLES, detectLang, matchLang, setLang, t } from '../src/i18n';
import { en } from '../src/i18n/en';

const keys = Object.keys(en).sort();
const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(',');

describe('i18n', () => {
  it('every language has exactly the English keys with the same placeholders', () => {
    for (const lang of LANGS) {
      const table = TABLES[lang] as Record<string, string>;
      expect(Object.keys(table).sort(), lang).toEqual(keys);
      for (const k of keys) {
        expect(placeholders(table[k] ?? ''), `${lang}:${k}`).toBe(placeholders((en as Record<string, string>)[k] ?? ''));
        expect((table[k] ?? '').length, `${lang}:${k}`).toBeGreaterThan(0);
      }
    }
  });

describe('every key the code builds at runtime exists', () => {
  it('birds, themes and their traits', async () => {
    const { BIRD_ORDER } = await import('../src/game/birds');
    const { LEVELS } = await import('../src/game/levels');
    for (const id of BIRD_ORDER) {
      expect(keys).toContain(`bird.${id}`);
      expect(keys).toContain(`bird.${id}.trait`);
    }
    for (const l of LEVELS) expect(keys).toContain(`theme.${l.theme}`);
    for (const th of ['grass', 'cave', 'water', 'snow', 'sky', 'desert', 'castle']) expect(keys).toContain(`theme.${th}`);
  });
});

  it('every data-i18n key used in index.html exists', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const used = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1] as string);
    // Most copy is built in code; index.html only carries the corner buttons.
    expect(used.length).toBeGreaterThanOrEqual(3);
    for (const k of used) expect(keys, k).toContain(k);
  });

describe('every key the code builds at runtime exists', () => {
  it('birds, themes and their traits', async () => {
    const { BIRD_ORDER } = await import('../src/game/birds');
    const { LEVELS } = await import('../src/game/levels');
    for (const id of BIRD_ORDER) {
      expect(keys).toContain(`bird.${id}`);
      expect(keys).toContain(`bird.${id}.trait`);
    }
    for (const l of LEVELS) expect(keys).toContain(`theme.${l.theme}`);
    for (const th of ['grass', 'cave', 'water', 'snow', 'sky', 'desert', 'castle']) expect(keys).toContain(`theme.${th}`);
  });
});

  it('matches browser tags and substitutes params', () => {
    expect(matchLang('es-MX')).toBe('es');
    expect(matchLang('zh-Hant-HK')).toBe('zh-TW');
    expect(matchLang('zh')).toBe('zh-CN');
    expect(matchLang('en-GB')).toBe('en');
    expect(matchLang('fr')).toBeNull();
    expect(detectLang('?lang=es', ['zh-CN'])).toBe('es');
    expect(detectLang('', ['fr', 'zh-TW'])).toBe('zh-TW');
    expect(detectLang('', ['de'])).toBe('en');
    setLang('es', false);
    expect(t('map.world', { n: 4 })).toBe('Mundo 4');
    setLang('zh-TW', false);
    expect(t('clear.coins', { n: 3, total: 9 })).toBe('金幣 3/9');
    setLang('en', false);
    expect(t('map.world', { n: 4 })).toBe('World 4');
  });

describe('every key the code builds at runtime exists', () => {
  it('birds, themes and their traits', async () => {
    const { BIRD_ORDER } = await import('../src/game/birds');
    const { LEVELS } = await import('../src/game/levels');
    for (const id of BIRD_ORDER) {
      expect(keys).toContain(`bird.${id}`);
      expect(keys).toContain(`bird.${id}.trait`);
    }
    for (const l of LEVELS) expect(keys).toContain(`theme.${l.theme}`);
    for (const th of ['grass', 'cave', 'water', 'snow', 'sky', 'desert', 'castle']) expect(keys).toContain(`theme.${th}`);
  });
});
});

describe('every key the code builds at runtime exists', () => {
  it('birds, themes and their traits', async () => {
    const { BIRD_ORDER } = await import('../src/game/birds');
    const { LEVELS } = await import('../src/game/levels');
    for (const id of BIRD_ORDER) {
      expect(keys).toContain(`bird.${id}`);
      expect(keys).toContain(`bird.${id}.trait`);
    }
    for (const l of LEVELS) expect(keys).toContain(`theme.${l.theme}`);
    for (const th of ['grass', 'cave', 'water', 'snow', 'sky', 'desert', 'castle']) expect(keys).toContain(`theme.${th}`);
  });
});
