import { apex } from '../../src/game/birds';
import { GROUND_Y, STEP } from '../../src/game/constants';
import { pipeCenter } from '../../src/game/course';
import { Rng } from '../../src/game/rng';
import type { Run } from '../../src/game/Run';

/**
 * A model of a human player. It anticipates its own reaction time: it looks at where the bird
 * will be in `reaction` seconds and, if that is half a hop below the next gap, taps after
 * roughly that long. What makes it human is the noise: tap timing jitter, a per-pipe aiming
 * error and the odd hesitation. It does not see currents or hazards.
 */
export interface BotProfile {
  reaction: number;
  /** Standard deviation of tap timing, seconds. */
  sigma: number;
  /** Standard deviation of the aim point per pipe, px. */
  aim: number;
  /** Chance that a tap comes 0.12 s late. */
  hesitate: number;
}

export const BEGINNER: BotProfile = { reaction: 0.22, sigma: 0.035, aim: 5, hesitate: 0.02 };
export const PRACTISED: BotProfile = { reaction: 0.22, sigma: 0.025, aim: 4, hesitate: 0.01 };

export class HumanBot {
  private rng: Rng;
  private tapAt = -1;
  private releaseAt = -1;
  private lastDecision = -1;
  private aimFor = -1;
  private aimErr = 0;

  constructor(
    private profile: BotProfile,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  private gauss(): number {
    const u = 1 - this.rng.next();
    const v = this.rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  readonly control = (run: Run): void => {
    const now = run.clock * STEP;
    if (run.phase === 'ready') {
      if (this.tapAt < 0) this.tapAt = now + 0.4;
    }
    if (this.releaseAt >= 0 && now >= this.releaseAt) {
      run.setHeld(false);
      this.releaseAt = -1;
    }
    if (this.tapAt >= 0 && now >= this.tapAt) {
      run.press();
      run.setHeld(true);
      this.releaseAt = now + Math.max(0.03, 0.07 + 0.02 * this.gauss());
      this.tapAt = -1;
      return;
    }
    if (run.phase !== 'playing' || this.tapAt >= 0 || now - this.lastDecision < 0.15) return;

    const p = run.phys;
    const b = run.body;
    const pipe = run.course.pipes[b.passed];
    const look = this.profile.reaction;
    let target = (GROUND_Y - 0) / 2;
    if (pipe && pipe.x - b.x < 170) {
      if (this.aimFor !== b.passed) {
        this.aimFor = b.passed;
        this.aimErr = this.profile.aim * this.gauss();
      }
      target = pipeCenter(pipe, b.t + look) + this.aimErr;
    }
    // Where will the bird be in `look` seconds without a flap? A player sees the bird being
    // pushed by a current and allows for it, but does not foresee the next one.
    const here = run.course.currents.find((c) => b.x >= c.x0 && b.x < c.x1);
    const drift = here ? here.drift * p.currentMul : 0;
    const g = p.gravity;
    let y = b.y;
    let vy = b.vy;
    for (let i = 0, n = Math.round(look / STEP); i < n; i++) {
      vy = Math.min(vy + g * STEP, p.maxFall);
      y += (vy + drift) * STEP;
    }
    // Players learn how high a flap lifts the bird, including the weak strokes in water.
    const after = p.additive ? Math.max(-p.flap, vy - p.flap) : -p.flap;
    const rise = after < 0 ? Math.min((after * after) / (2 * g), apex(p)) - (drift * -after) / g : 0;
    if (y > target + rise / 2) {
      let delay = look + this.profile.sigma * this.gauss();
      if (this.rng.chance(this.profile.hesitate)) delay += 0.12;
      this.tapAt = now + Math.max(0.1, delay);
      this.lastDecision = now;
    }
  };
}

/** Fly a level with a bot; returns true if it reached the flag without crashing. */
export function flyOnce(run: Run, control: (run: Run) => void, until: 'clear' | 'checkpoint' = 'clear', maxSeconds = 120): boolean {
  run.controller = control;
  const limit = Math.round(maxSeconds / STEP);
  for (let i = 0; i < limit; i++) {
    run.tick();
    if (run.phase === 'dead' || run.phase === 'dying') return false;
    if (run.phase === 'clearing' || run.phase === 'cleared') return true;
    if (until === 'checkpoint' && run.checkpoint) return true;
  }
  return false;
}
