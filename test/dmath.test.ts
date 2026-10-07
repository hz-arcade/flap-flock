import { describe, expect, it } from 'vitest';
import { dcos, dsin } from '../src/game/dmath';

describe('deterministic sine', () => {
  it('matches Math.sin and Math.cos closely over the range the game uses', () => {
    let worst = 0;
    for (let x = -50; x <= 500; x += 0.0137) {
      worst = Math.max(worst, Math.abs(dsin(x) - Math.sin(x)), Math.abs(dcos(x) - Math.cos(x)));
    }
    expect(worst).toBeLessThan(1e-9);
  });
  it('hits the landmarks', () => {
    expect(dsin(0)).toBe(0);
    expect(dsin(Math.PI / 2)).toBeCloseTo(1, 12);
    expect(dcos(0)).toBeCloseTo(1, 12);
    expect(dsin(-Math.PI / 2)).toBeCloseTo(-1, 12);
  });
  it('is odd and periodic', () => {
    for (const x of [0.3, 1.2, 2.9, 7.7]) {
      expect(dsin(-x)).toBeCloseTo(-dsin(x), 14);
      expect(dsin(x + 2 * Math.PI)).toBeCloseTo(dsin(x), 12);
    }
  });
});
