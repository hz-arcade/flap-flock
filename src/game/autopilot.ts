import { apex } from './birds';
import { COIN_R, STEP } from './constants';
import { refY } from './course';
import { canFlap, speedOf, stepBody, type Body, type Env, type Run } from './Run';

/**
 * Planner bot. Every tick on which it could flap, it tries a few simple flying policies a
 * short way into the future with the real physics (stepBody) and does whatever the best one
 * does first. Deterministic: the same run always gets the same flaps.
 *
 * Used by the feasibility tests (every level is clearable by every bird, with every coin),
 * the title-screen attract mode, the smoke tests and the cover image.
 */
export interface AutopilotOptions {
  /** Look-ahead in seconds. */
  horizon?: number;
  /** Go for coins (true) or only survive. */
  coins?: boolean;
}

interface Outcome {
  alive: number;
  coins: number;
  dev: number;
  first: boolean;
}

const OFFSETS = [-10, 10, -20, 20, -30, 30];

export class Autopilot {
  private readonly ticks: number;
  private readonly wantCoins: boolean;
  private scratch: Body = { x: 0, y: 0, vy: 0, t: 0, cooldown: 0, passed: 0 };

  constructor(opts: AutopilotOptions = {}) {
    this.ticks = Math.round((opts.horizon ?? 0.9) / STEP);
    this.wantCoins = opts.coins ?? true;
  }

  /** Plug into run.controller. */
  readonly control = (run: Run): void => {
    if (run.phase === 'ready') {
      run.press();
      return;
    }
    if (run.phase !== 'playing' || run.queuedPress || !canFlap(run.body)) return;
    if (this.decide(run)) run.press();
  };

  /** Should the bird flap on this tick? */
  decide(run: Run): boolean {
    const base = this.rollout(run, 0, null);
    const other = this.rollout(run, 0, !base.first);
    let best = better(base, other) ? base : other;
    const coinAhead = this.wantCoins && this.uncollectedAhead(run);
    if (best.alive < this.ticks || (coinAhead && best.coins === 0)) {
      for (const o of OFFSETS) {
        const r = this.rollout(run, o, null);
        if (better(r, best)) best = r;
        if (best.alive >= this.ticks && (!coinAhead || best.coins > 0)) break;
      }
    }
    return best.first;
  }

  private uncollectedAhead(run: Run): boolean {
    const coins = run.course.coins;
    const x0 = run.body.x;
    const x1 = x0 + speedOf(run.env, run.body.passed) * this.ticks * STEP;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i]!;
      if (c.x > x1) break;
      if (c.x >= x0 && !run.coinBits[i]) return true;
    }
    return false;
  }

  /**
   * Fly `ticks` steps following the tracking policy aimed `offset` px off the reference line.
   * `force` overrides the first decision (true = flap now, false = wait).
   */
  private rollout(run: Run, offset: number, force: boolean | null): Outcome {
    const env: Env = run.env;
    const b = this.scratch;
    Object.assign(b, run.body);
    const course = env.course;
    const p = env.phys;
    const hop = apex(p);
    const coins = course.coins;
    const reach = p.radius + COIN_R;
    let coinIdx = 0;
    while (coinIdx < coins.length && coins[coinIdx]!.x < b.x - reach) coinIdx++;
    let got = 0;
    let dev = 0;
    let first = false;
    for (let i = 0; i < this.ticks; i++) {
      let flap = false;
      if (canFlap(b)) {
        if (i === 0 && force !== null) flap = force;
        else {
          const target = refY(course, b.x, b.t) + offset;
          flap = b.y > target + hop / 2 && b.vy > -p.flap * 0.5;
        }
      }
      if (i === 0) first = flap;
      if (stepBody(b, env, flap, false)) return { alive: i, coins: got, dev: dev / (i + 1), first };
      dev += Math.abs(b.y - refY(course, b.x, b.t));
      while (coinIdx < coins.length && coins[coinIdx]!.x < b.x - reach) coinIdx++;
      for (let k = coinIdx; k < coins.length; k++) {
        const c = coins[k]!;
        if (c.x > b.x + reach) break;
        if (run.coinBits[k]) continue;
        const dx = c.x - b.x;
        const dy = c.y - b.y;
        if (dx * dx + dy * dy < reach * reach) {
          got++;
          // Count each coin once per rollout.
          coinIdx = k + 1;
          break;
        }
      }
    }
    return { alive: this.ticks, coins: got, dev: dev / this.ticks, first };
  }
}

function better(a: Outcome, b: Outcome): boolean {
  if (a.alive !== b.alive) return a.alive > b.alive;
  if (a.coins !== b.coins) return a.coins > b.coins;
  return a.dev < b.dev;
}
