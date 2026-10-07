import { describe, expect, it } from 'vitest';
import { KEYS, Progress } from '../src/game/progress';
import { LEVELS } from '../src/game/levels';
import { MemStore } from './helpers/memStore';

const clear = (levelId: string, stars: 1 | 2 | 3 = 1, coins = 0, time = 40) => ({ levelId, stars, coins, total: 20, time });

describe('progress', () => {
  it('starts with 1-1 open and the three starter birds', () => {
    const p = new Progress(new MemStore());
    expect(p.isLevelOpen('1-1')).toBe(true);
    expect(p.isLevelOpen('1-2')).toBe(false);
    expect(p.isBirdOpen('duck') && p.isBirdOpen('chicken') && p.isBirdOpen('pelican')).toBe(true);
    expect(p.isBirdOpen('sparrow')).toBe(false);
    expect(p.bird).toBe('duck');
    expect(p.frontier.id).toBe('1-1');
  });

  it('clearing opens the next level; a world opens its bird', () => {
    const p = new Progress(new MemStore());
    expect(p.record(clear('1-1')).opened?.id).toBe('1-2');
    const out = p.record(clear('1-2'));
    expect(out.opened?.id).toBe('2-1');
    expect(out.newBirds).toEqual(['sparrow']);
    expect(p.record(clear('1-2')).opened).toBeNull();
    expect(p.frontier.id).toBe('2-1');
  });

  it('keeps the best stars, coins and time separately', () => {
    const p = new Progress(new MemStore());
    p.record(clear('1-1', 2, 8, 40));
    expect(p.record(clear('1-1', 1, 3, 35)).improved).toBe(true);
    expect(p.level('1-1')).toEqual({ stars: 2, coins: 8, time: 35 });
    expect(p.record(clear('1-1', 1, 3, 50)).improved).toBe(false);
  });

  it('survives a reload and ignores junk', () => {
    const s = new MemStore();
    const p = new Progress(s);
    p.record(clear('1-1', 3, 11, 31));
    p.record(clear('1-2'));
    p.setBird('sparrow');
    p.recordEndless('sparrow', 12);
    const q = new Progress(s);
    expect(q.level('1-1')?.stars).toBe(3);
    expect(q.bird).toBe('sparrow');
    expect(q.endlessBest).toBe(12);
    expect(q.endlessBestFor('sparrow')).toBe(12);
    expect(q.totalStars).toBe(4);

    const junk = new MemStore();
    junk.setItem(KEYS.progress, '{not json');
    junk.setItem(KEYS.endless, '{"best":"lots"}');
    junk.setItem(KEYS.bird, 'eagle');
    const r = new Progress(junk);
    expect(r.totalStars).toBe(0);
    expect(r.endlessBest).toBe(0);
    expect(r.bird).toBe('duck'); // eagle is still locked
  });

  it('a locked bird cannot be chosen', () => {
    const p = new Progress(new MemStore());
    expect(p.setBird('eagle')).toBe(false);
    expect(p.bird).toBe('duck');
    p.allOpen = true;
    expect(p.setBird('eagle')).toBe(true);
  });

  it('endless best per bird', () => {
    const p = new Progress(new MemStore());
    expect(p.recordEndless('duck', 5)).toBe(true);
    expect(p.recordEndless('chicken', 3)).toBe(false);
    expect(p.endlessBestFor('chicken')).toBe(3);
    expect(p.endlessBest).toBe(5);
  });

  it('every level clears in order to the end', () => {
    const p = new Progress(new MemStore());
    for (const l of LEVELS) {
      expect(p.isLevelOpen(l.id)).toBe(true);
      p.record(clear(l.id));
    }
    expect(p.allCleared).toBe(true);
    expect(p.isBirdOpen('eagle')).toBe(true);
  });
});
