import { describe, expect, it } from 'vitest';
import { checkPlausible, endlessSpeed, secsToPass } from '../shared/scoreRules';
import { Autopilot } from '../src/game/autopilot';
import { BIRDS, BIRD_ORDER } from '../src/game/birds';
import { Rng } from '../src/game/rng';
import { Run } from '../src/game/Run';
import { BEGINNER, HumanBot } from './helpers/bots';

/** What the game submits for a finished endless run. */
const submission = (run: Run) => ({ score: run.body.passed, secs: Math.ceil(run.body.t), flaps: run.flaps, bird: BIRD_ORDER.indexOf(run.bird.id) });

function finish(run: Run): Run {
  for (let i = 0; i < 120 * 600 && run.phase !== 'dead'; i++) run.tick();
  return run;
}

describe('endless scores', () => {
  it('the game scrolls at the shared speed', () => {
    for (const id of BIRD_ORDER) {
      const run = new Run({ mode: 'endless', bird: BIRDS[id], seed: 3 });
      run.controller = new Autopilot().control;
      while (run.body.passed < 12) run.tick();
      expect(run.speed).toBeCloseTo(endlessSpeed(12) * BIRDS[id].speedMul);
      // Time to pass 12 pipes matches the shared formula to within a couple of ticks.
      expect(Math.abs(run.body.t - secsToPass(12, BIRDS[id].speedMul))).toBeLessThan(0.02);
    }
  });

  it('never rejects an honest run (planner, stopped anywhere)', () => {
    const rng = new Rng(99);
    for (const id of BIRD_ORDER) {
      for (const target of [1, 2, 7, 23, 60]) {
        const run = new Run({ mode: 'endless', bird: BIRDS[id], seed: target * 13 });
        run.controller = new Autopilot().control;
        while (run.body.passed < target) run.tick();
        // Fly on for a random part of the way to the next pipe, then crash.
        const extra = rng.range(0, 0.98) * (secsToPass(target + 1, BIRDS[id].speedMul) - secsToPass(target, BIRDS[id].speedMul));
        while (run.body.t < secsToPass(target, BIRDS[id].speedMul) + extra && run.body.passed === target) run.tick();
        run.controller = null;
        run.kill();
        const s = submission(finish(run));
        if (s.score < 1) continue;
        expect(checkPlausible(s), `${id} ${JSON.stringify(s)}`).toBeNull();
      }
    }
  });

  it('never rejects an honest run (beginner bot, natural crashes)', () => {
    for (const id of BIRD_ORDER) {
      for (let seed = 0; seed < 40; seed++) {
        const run = new Run({ mode: 'endless', bird: BIRDS[id], seed });
        run.controller = new HumanBot(BEGINNER, seed).control;
        const s = submission(finish(run));
        if (s.score < 1) continue;
        expect(checkPlausible(s), `${id} ${JSON.stringify(s)}`).toBeNull();
      }
    }
  });

  it('rejects a doctored score', () => {
    const run = new Run({ mode: 'endless', seed: 5 });
    run.controller = new Autopilot().control;
    while (run.body.passed < 10) run.tick();
    run.kill();
    const s = submission(finish(run));
    expect(checkPlausible({ ...s, score: 50 })).toBe('too-fast');
    expect(checkPlausible({ ...s, secs: s.secs + 30 })).toBe('too-slow');
  });
});
