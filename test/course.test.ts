import { describe, expect, it } from 'vitest';
import { EDGE_MARGIN, GROUND_Y, LEAD_IN } from '../src/game/constants';
import { buildCourse, buildEndless, pipeCenter, pipeHit, refY, type PipePair } from '../src/game/course';
import { BALL_R, WHEEL_BALL_R, cannonBalls, cannonMuzzleY, lavaY, urchinY, wheelBalls } from '../src/game/hazards';
import { LEVELS } from '../src/game/levels';
import { endlessGap, endlessPipeX } from '../shared/scoreRules';

describe('course', () => {
  it('is the same every time', () => {
    for (const def of LEVELS) expect(JSON.stringify(buildCourse(def))).toBe(JSON.stringify(buildCourse(def)));
  });

  it('keeps every gap clear of the ceiling and ground, moving pipes included', () => {
    for (const def of LEVELS) {
      const c = buildCourse(def);
      expect(c.pipes).toHaveLength(def.pipes);
      c.pipes.forEach((p, i) => {
        expect(p.center - p.gap / 2 - p.amp, `${def.id} #${i}`).toBeGreaterThanOrEqual(EDGE_MARGIN);
        expect(p.center + p.gap / 2 + p.amp, `${def.id} #${i}`).toBeLessThanOrEqual(GROUND_Y - EDGE_MARGIN);
        expect(p.x).toBe(LEAD_IN + i * def.pitch);
        if (i < 3) expect(p.amp, `${def.id} #${i} moves`).toBe(0);
        if (i > 0) expect(Math.abs(p.center - c.pipes[i - 1]!.center), `${def.id} #${i}`).toBeLessThanOrEqual(def.maxDelta + 1);
      });
      expect(c.pipes.filter((p) => p.amp > 0)).toHaveLength(def.movers?.count ?? 0);
      expect(c.flagX).toBeGreaterThan(c.pipes[def.pipes - 1]!.x);
      expect(c.castleX).toBeGreaterThan(c.flagX);
    }
  });

  it('places the promised coins near the path', () => {
    for (const def of LEVELS) {
      const c = buildCourse(def);
      expect(c.coins, def.id).toHaveLength(def.coins);
      c.coins.forEach((coin, i) => {
        expect(coin.id).toBe(i);
        if (i > 0) expect(coin.x).toBeGreaterThan(c.coins[i - 1]!.x);
        expect(Math.abs(coin.y - refY(c, coin.x, 0)), `${def.id} coin ${i}`).toBeLessThanOrEqual(def.maxDelta / 2 + 1);
      });
    }
  });

  it('keeps hazards at least 20 px from where players fly', () => {
    for (const def of LEVELS) {
      const c = buildCourse(def);
      expect(c.hazards.length, def.id).toBe((def.hazards ?? []).reduce((s, h) => s + h.count, 0));
      for (const h of c.hazards) {
        const i = c.pipes.findIndex((p) => p.x > h.x);
        const a = c.pipes[i - 1] as PipePair;
        const b = c.pipes[i] as PipePair;
        expect(i, `${def.id} ${h.kind} not in the first corridors`).toBeGreaterThanOrEqual(3);
        const low = Math.max(a.center + a.amp, b.center + b.amp);
        const high = Math.min(a.center - a.amp, b.center - b.amp);
        const clearance = (y: number, r: number) => (y >= low ? y - r - low : y <= high ? high - (y + r) : -1);
        let worst = Infinity;
        for (let t = 0; t < 12; t += 1 / 30) {
          switch (h.kind) {
            case 'urchin':
              worst = Math.min(worst, clearance(urchinY(h, t), h.r));
              break;
            case 'lava':
              worst = Math.min(worst, clearance(lavaY(h, t), h.r));
              break;
            case 'wheel':
              for (const [, y] of wheelBalls(h, t)) worst = Math.min(worst, clearance(y, WHEEL_BALL_R));
              break;
            case 'cannon':
              worst = Math.min(worst, clearance(h.edge, 0));
              if (cannonBalls(h, t).length) worst = Math.min(worst, clearance(cannonMuzzleY(h), BALL_R));
              break;
          }
        }
        expect(worst, `${def.id} ${h.kind} at ${h.x}`).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it('puts currents only in water and the checkpoint halfway', () => {
    for (const def of LEVELS) {
      const c = buildCourse(def);
      expect(c.currents.length > 0, def.id).toBe(def.medium === 'water');
      if (def.checkpoint) {
        expect(c.checkpointX).toBeGreaterThan(c.flagX * 0.35);
        expect(c.checkpointX).toBeLessThan(c.flagX * 0.65);
      } else expect(c.checkpointX).toBeNull();
    }
  });

  it('pipe collisions: lips, bodies and the opening', () => {
    const p: PipePair = { x: 100, center: 100, gap: 80, amp: 0, period: 1, phase: 0 };
    expect(pipeHit(p, 0, 100, 100, 6)).toBe(false);
    expect(pipeHit(p, 0, 100, 63, 6)).toBe(true); // touching the top lip
    expect(pipeHit(p, 0, 100, 137, 6)).toBe(true); // bottom lip
    expect(pipeHit(p, 0, 100, -500, 6)).toBe(true); // top pipe reaches above the screen
    expect(pipeHit(p, 0, 70, 50, 6)).toBe(false); // in front of the pipe
    expect(pipeHit(p, 0, 83, 59, 6)).toBe(true); // lip corner
    const m: PipePair = { ...p, amp: 10, period: 2, phase: 0 };
    expect(pipeCenter(m, 0.5)).toBeCloseTo(110);
  });

  it('endless follows the shared ramp', () => {
    const c = buildEndless(42);
    c.endless!.ensure(5000);
    expect(c.pipes.length).toBeGreaterThan(30);
    c.pipes.forEach((p, i) => {
      expect(p.x).toBeCloseTo(endlessPipeX(i), 6);
      expect(p.gap).toBe(endlessGap(i));
      expect(p.center - p.gap / 2 - p.amp).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(p.center + p.gap / 2 + p.amp).toBeLessThanOrEqual(GROUND_Y - EDGE_MARGIN);
    });
    expect(JSON.stringify(buildEndless(42).pipes.slice(0, 3))).toBe(JSON.stringify(c.pipes.slice(0, 3)));
    expect(JSON.stringify(buildEndless(43).pipes.slice(0, 3))).not.toBe(JSON.stringify(c.pipes.slice(0, 3)));
  });
});
