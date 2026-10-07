import { describe, expect, it } from 'vitest';
import { BIRDS, BIRD_ORDER } from '../src/game/birds';
import {
  BIRD_IDS,
  DAY_MS,
  MIN_FLAP_INTERVAL,
  SPEED_MULS,
  WEEK_MS,
  checkPlausible,
  clampLimit,
  resetsIn,
  sanitizeName,
  secsToPass,
  validateSubmission,
  weekStart,
} from '../shared/scoreRules';

const GID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const good = { v: 1, gid: GID, name: 'Sam', score: 20, secs: 40, flaps: 70, bird: 0 };

describe('constants mirror the game rules', () => {
  it('bird ids, speeds and the fastest flap match the game', () => {
    expect([...BIRD_IDS]).toEqual([...BIRD_ORDER]);
    BIRD_ORDER.forEach((id, i) => expect(SPEED_MULS[i]).toBe(BIRDS[id].speedMul));
    expect(MIN_FLAP_INTERVAL).toBe(Math.min(...BIRD_ORDER.map((id) => BIRDS[id].cooldown)));
  });
});

describe('sanitizeName', () => {
  it('keeps ordinary names in any script, and emoji', () => {
    expect(sanitizeName('Sam Dam')).toBe('Sam Dam');
    expect(sanitizeName('小明')).toBe('小明');
    expect(sanitizeName('張偉 🍉')).toBe('張偉 🍉');
    expect(sanitizeName('Zoë')).toBe('Zoë');
  });
  it('trims and collapses whitespace, including ideographic space and newlines', () => {
    expect(sanitizeName('  a \t\n  b  ')).toBe('a b');
    expect(sanitizeName('小\u3000\u3000明')).toBe('小 明');
    expect(sanitizeName('a\u2028b')).toBe('a b');
  });
  it('removes control, zero-width and bidi override characters', () => {
    expect(sanitizeName('a\u0000b\u0007c')).toBe('abc');
    expect(sanitizeName('ab\u200b\u200d\ufeffcd')).toBe('abcd');
    expect(sanitizeName('\u202eevil\u202c')).toBe('evil');
    expect(sanitizeName('x\u2066y\u2069')).toBe('xy');
  });
  it('removes private-use characters and unpaired surrogates', () => {
    expect(sanitizeName('a\ue000b')).toBe('ab');
    expect(sanitizeName('a\ud83db')).toBe('ab');
  });
  it('limits stacked combining marks and drops leading ones', () => {
    // NFC folds the first accent into the letter; of the rest, two survive.
    expect(sanitizeName('e' + '\u0301'.repeat(30))).toBe('\u00e9\u0301\u0301');
    expect(sanitizeName('a' + '\u0489'.repeat(30))).toBe('a\u0489\u0489');
    expect(Array.from(sanitizeName('\u0301\u0301abc'))).toEqual(['a', 'b', 'c']);
  });
  it('truncates to 16 code points without splitting an emoji', () => {
    expect(Array.from(sanitizeName('a'.repeat(40)))).toHaveLength(16);
    const melons = sanitizeName('🍉'.repeat(30));
    expect(Array.from(melons)).toHaveLength(16);
    expect(melons).toBe('🍉'.repeat(16));
  });
  it('returns an empty string when nothing usable is left', () => {
    expect(sanitizeName('')).toBe('');
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('\u200b\u200b')).toBe('');
    expect(sanitizeName(null)).toBe('');
    expect(sanitizeName(42)).toBe('');
    expect(sanitizeName({ toString: () => 'x' })).toBe('');
  });
  it('treats markup as plain text (rendering must use textContent)', () => {
    expect(sanitizeName('<b>x</b>')).toBe('<b>x</b>');
  });
});

describe('validateSubmission', () => {
  it('accepts a well-formed submission and returns the sanitised name', () => {
    const r = validateSubmission({ ...good, name: '  Sam\u200b ', gid: GID.toUpperCase() });
    expect(r).toEqual({ ok: true, value: { ...good, name: 'Sam', gid: GID } });
  });
  it('drops unknown fields', () => {
    const r = validateSubmission({ ...good, admin: true });
    expect(r.ok && Object.keys(r.value).sort()).toEqual(['bird', 'flaps', 'gid', 'name', 'score', 'secs', 'v']);
  });
  it.each([
    ['body', null],
    ['body', 'x'],
    ['body', [good]],
    ['v', { ...good, v: 2 }],
    ['gid', { ...good, gid: 'nope' }],
    ['gid', { ...good, gid: 7 }],
    ['name', { ...good, name: '   ' }],
    ['name', { ...good, name: undefined }],
    ['score', { ...good, score: 0 }],
    ['score', { ...good, score: -5 }],
    ['score', { ...good, score: 1.5 }],
    ['score', { ...good, score: '20' }],
    ['score', { ...good, score: 100_001 }],
    ['score', { ...good, score: Number.NaN }],
    ['secs', { ...good, secs: 0 }],
    ['secs', { ...good, secs: 86_401 }],
    ['flaps', { ...good, flaps: 0 }],
    ['bird', { ...good, bird: -1 }],
    ['bird', { ...good, bird: 6 }],
    ['bird', { ...good, bird: '0' }],
  ])('rejects a bad %s', (field, body) => {
    expect(validateSubmission(body)).toEqual({ ok: false, field });
  });
  it('accepts the boundary values', () => {
    expect(validateSubmission({ ...good, score: 1, secs: 1, flaps: 1, bird: 0 }).ok).toBe(true);
    expect(validateSubmission({ ...good, score: 100_000, secs: 86_400, bird: 5 }).ok).toBe(true);
  });
});

describe('checkPlausible', () => {
  const secsFor = (score: number, bird = 0) => Math.ceil((secsToPass(score, SPEED_MULS[bird]) + secsToPass(score + 1, SPEED_MULS[bird])) / 2);
  it('accepts results a real run can produce', () => {
    for (const score of [1, 5, 20, 75, 150]) {
      const secs = secsFor(score);
      expect(checkPlausible({ score, secs, flaps: Math.round(secs * 2.2), bird: 0 }), `score ${score}`).toBeNull();
    }
    // The eagle scrolls faster, so the same score takes less time.
    expect(secsToPass(30, SPEED_MULS[5])).toBeLessThan(secsToPass(30));
    expect(checkPlausible({ score: 30, secs: secsFor(30, 5), flaps: 100, bird: 5 })).toBeNull();
  });
  it.each([
    ['too-fast', { score: 50, secs: 20, flaps: 60, bird: 0 }],
    ['too-slow', { score: 2, secs: 60, flaps: 120, bird: 0 }],
    ['flaps-per-second', { score: 20, secs: secsFor(20), flaps: 5000, bird: 0 }],
    ['too-few-flaps', { score: 20, secs: secsFor(20), flaps: 1, bird: 0 }],
  ])('rejects %s', (rule, r) => {
    expect(checkPlausible(r)).toBe(rule);
  });
  it('the time window is tight: one pipe more or less does not fit', () => {
    const secs = secsFor(40);
    expect(checkPlausible({ score: 40, secs, flaps: 90, bird: 0 })).toBeNull();
    expect(checkPlausible({ score: 46, secs, flaps: 90, bird: 0 })).toBe('too-fast');
    expect(checkPlausible({ score: 34, secs, flaps: 90, bird: 0 })).toBe('too-slow');
  });
});

describe('weekStart', () => {
  const monday = Date.UTC(2026, 8, 21); // Monday 2026-09-21
  it('is the Monday 00:00 UTC on or before the instant', () => {
    expect(new Date(monday).getUTCDay()).toBe(1);
    expect(weekStart(monday)).toBe(monday);
    expect(weekStart(monday + 1)).toBe(monday);
    expect(weekStart(monday + 3 * DAY_MS + 12345)).toBe(monday);
    expect(weekStart(monday + WEEK_MS - 1)).toBe(monday); // Sunday 23:59:59.999
    expect(weekStart(monday + WEEK_MS)).toBe(monday + WEEK_MS);
    expect(weekStart(monday - 1)).toBe(monday - WEEK_MS);
  });
  it('handles the epoch, which was a Thursday', () => {
    expect(weekStart(0)).toBe(-3 * DAY_MS);
    expect(new Date(weekStart(0)).getUTCDay()).toBe(1);
  });
  it('always lands on a Monday at midnight', () => {
    for (let i = 0; i < 400; i++) {
      const t = Date.UTC(2026, 0, 1) + i * (DAY_MS + 3_600_000 * 5);
      const w = new Date(weekStart(t));
      expect(w.getUTCDay()).toBe(1);
      expect(w.getUTCHours() + w.getUTCMinutes() + w.getUTCSeconds() + w.getUTCMilliseconds()).toBe(0);
      expect(t - weekStart(t)).toBeLessThan(WEEK_MS);
      expect(t - weekStart(t)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('resetsIn and clampLimit', () => {
  it('reports whole days and hours, rounding up', () => {
    expect(resetsIn(0, WEEK_MS)).toEqual({ d: 7, h: 0 });
    expect(resetsIn(0, DAY_MS + 3_600_000 + 1)).toEqual({ d: 1, h: 2 });
    expect(resetsIn(0, 1)).toEqual({ d: 0, h: 1 });
    expect(resetsIn(10, 5)).toEqual({ d: 0, h: 0 });
  });
  it('clamps the limit parameter', () => {
    expect(clampLimit(null)).toBe(20);
    expect(clampLimit('5')).toBe(5);
    expect(clampLimit('0')).toBe(1);
    expect(clampLimit('999')).toBe(50);
    expect(clampLimit('abc')).toBe(20);
  });
});
