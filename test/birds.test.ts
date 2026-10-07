import { describe, expect, it } from 'vitest';
import { BIRD_IDS, SPEED_MULS } from '../shared/scoreRules';
import { BIRDS, BIRD_ORDER, apex, hopTime, physics, stats } from '../src/game/birds';

describe('birds', () => {
  it('match the leaderboard ids and speed multipliers', () => {
    expect([...BIRD_ORDER]).toEqual([...BIRD_IDS]);
    BIRD_ORDER.forEach((id, i) => expect(BIRDS[id].speedMul, id).toBe(SPEED_MULS[i]));
    for (const id of BIRD_ORDER) expect(BIRDS[id].id).toBe(id);
  });

  it('have flyable hops', () => {
    for (const id of BIRD_ORDER) {
      for (const medium of ['air', 'water'] as const) {
        const p = physics(BIRDS[id], medium);
        expect(apex(p), `${id} ${medium}`).toBeGreaterThan(20);
        expect(apex(p), `${id} ${medium}`).toBeLessThan(50);
        expect(hopTime(p), `${id} ${medium}`).toBeGreaterThan(0.35);
        expect(hopTime(p), `${id} ${medium}`).toBeLessThan(0.9);
        expect(p.cooldown).toBeGreaterThanOrEqual(0.08);
      }
    }
  });

  it('start with duck, chicken and pelican; one more per world', () => {
    expect(BIRD_ORDER.filter((id) => BIRDS[id].unlockWorld === 0)).toEqual(['duck', 'chicken', 'pelican']);
    expect(BIRDS.sparrow.unlockWorld).toBe(1);
    expect(BIRDS.penguin.unlockWorld).toBe(2);
    expect(BIRDS.eagle.unlockWorld).toBe(3);
  });

  it('the duck is the forgiving default', () => {
    const d = BIRDS.duck;
    // Only the floaty pelican falls slower.
    for (const id of BIRD_ORDER) if (id !== 'duck' && id !== 'pelican') expect(d.maxFall, id).toBeLessThanOrEqual(BIRDS[id].maxFall);
    expect(physics(d).glideFall).toBeNull();
  });

  it('water: everyone floats, only the penguin ignores currents', () => {
    for (const id of BIRD_ORDER) {
      const air = physics(BIRDS[id]);
      const water = physics(BIRDS[id], 'water');
      expect(water.gravity).toBeLessThan(air.gravity);
      expect(water.maxFall).toBeLessThan(air.maxFall);
      expect(water.currentMul).toBe(id === 'penguin' ? 0 : 1);
    }
    expect(physics(BIRDS.penguin, 'water').radius).toBeLessThan(BIRDS.penguin.radius);
  });

  it('stat bars stay in range', () => {
    for (const id of BIRD_ORDER) {
      for (const v of Object.values(stats(BIRDS[id]))) {
        expect(v).toBeGreaterThanOrEqual(0.2);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(stats(BIRDS.pelican).size).toBe(1);
    expect(stats(BIRDS.sparrow).size).toBeCloseTo(0.2);
  });
});
