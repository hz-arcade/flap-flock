import { describe, expect, it } from 'vitest';
import { LEAD_IN, RUNOUT } from '../src/game/constants';
import { ENDLESS_THEMES, LEVELS, endlessTheme, levelById, nextLevel } from '../src/game/levels';

const duration = (l: (typeof LEVELS)[number]) => (LEAD_IN + (l.pipes - 1) * l.pitch + RUNOUT) / l.speed;

describe('levels', () => {
  it('four worlds of two levels, in order', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']);
    for (const l of LEVELS) expect(l.id).toBe(`${l.world}-${l.index}`);
    expect(levelById('2-2')?.medium).toBe('water');
    expect(nextLevel('1-2')?.id).toBe('2-1');
    expect(nextLevel('4-2')).toBeUndefined();
  });

  it('each level takes 30 to 60 seconds', () => {
    for (const l of LEVELS) {
      expect(duration(l), l.id).toBeGreaterThanOrEqual(30);
      expect(duration(l), l.id).toBeLessThanOrEqual(60);
    }
  });

  it('1-1 is gentle', () => {
    const l = LEVELS[0]!;
    expect(l.gap).toBeGreaterThanOrEqual(130);
    expect(l.speed).toBeLessThanOrEqual(55);
    expect(l.maxDelta).toBeLessThanOrEqual(16);
    expect(l.pipes).toBeLessThanOrEqual(10);
    expect(l.movers).toBeUndefined();
    expect(l.hazards).toBeUndefined();
  });

  it('gaps narrow and speeds rise (the slower water level aside)', () => {
    const air = LEVELS.filter((l) => l.medium === 'air');
    for (let i = 1; i < air.length; i++) {
      expect(air[i]!.gap, air[i]!.id).toBeLessThanOrEqual(air[i - 1]!.gap);
      expect(air[i]!.speed, air[i]!.id).toBeGreaterThanOrEqual(air[i - 1]!.speed);
    }
  });

  it('checkpoints only in the long late levels', () => {
    for (const l of LEVELS) expect(l.checkpoint, l.id).toBe(l.world >= 3);
  });

  it('endless rotates through the land themes', () => {
    expect(endlessTheme(0)).toBe('grass');
    expect(endlessTheme(19)).toBe('grass');
    expect(endlessTheme(20)).toBe('cave');
    expect(endlessTheme(20 * ENDLESS_THEMES.length)).toBe('grass');
    expect(ENDLESS_THEMES).not.toContain('water');
  });
});
