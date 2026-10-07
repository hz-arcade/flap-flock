import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import { BIRDS, BIRD_ORDER } from '../src/game/birds';
import { LEVELS } from '../src/game/levels';
import { Run } from '../src/game/Run';

/** Fly a run with the planner until it ends (or, in endless mode, reaches `pipes`). */
export function fly(run: Run, pipes = 150, maxSeconds = 600): Run {
  run.controller = new Autopilot().control;
  const limit = Math.round(maxSeconds * 120);
  for (let i = 0; i < limit; i++) {
    run.tick();
    if (run.phase === 'dead' || run.phase === 'cleared') break;
    if (run.mode === 'endless' && run.body.passed >= pipes) break;
  }
  return run;
}

describe('feasibility', () => {
  for (const def of LEVELS) {
    it(`every bird clears ${def.id} with every coin`, () => {
      for (const id of BIRD_ORDER) {
        const run = fly(new Run({ mode: 'level', def, bird: BIRDS[id] }));
        expect(run.phase, `${id} ${run.cause} at pipe ${run.body.passed}`).toBe('cleared');
        expect(run.result?.stars, id).toBe(3);
      }
    });
  }

  it('every bird survives 150 endless pipes', () => {
    for (const id of BIRD_ORDER) {
      const run = fly(new Run({ mode: 'endless', bird: BIRDS[id], seed: 1234 }));
      expect(run.body.passed, `${id} ${run.cause}`).toBeGreaterThanOrEqual(150);
    }
  });
});
