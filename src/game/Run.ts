import { endlessSpeed } from '../../shared/scoreRules';
import { BIRDS, physics, type Bird, type Physics } from './birds';
import { CEIL_Y, COIN_R, GROUND_Y, LIP_W, RETRY_LOCK, START_Y, STEP } from './constants';
import { buildCourse, buildEndless, pipeHit, refY, type Coin, type Course } from './course';
import { hazardHit, hazardSpan } from './hazards';
import { endlessTheme, type LevelDef, type ThemeId } from './levels';

export type Phase = 'ready' | 'playing' | 'dying' | 'dead' | 'clearing' | 'cleared';
export type Cause = 'ground' | 'pipe' | 'hazard';
export type Mode = 'level' | 'endless';

/** The part of a run that moves. Small and flat so the planner can copy it cheaply. */
export interface Body {
  x: number;
  y: number;
  vy: number;
  /** Seconds of scrolling; every moving obstacle is a function of it. */
  t: number;
  cooldown: number;
  /** Pipes passed, which is also the index of the next pipe. */
  passed: number;
}

export interface Env {
  course: Course;
  phys: Physics;
  mode: Mode;
  /** Level scroll speed before the bird's multiplier (unused in endless mode). */
  speed: number;
  /** Flat [x0, x1, x0, x1, …] spans of the hazards, for a quick reject. */
  spans: number[];
}

export function makeEnv(course: Course, phys: Physics, mode: Mode, speed: number): Env {
  return { course, phys, mode, speed, spans: course.hazards.flatMap((h) => hazardSpan(h)) };
}

/** The cooldown is counted down in float steps; allow for rounding. */
export function canFlap(b: Body): boolean {
  return b.cooldown < STEP / 2;
}

export function speedOf(env: Env, passed: number): number {
  return (env.mode === 'endless' ? endlessSpeed(passed) : env.speed) * env.phys.speedMul;
}

/** Pelican glide: holding brakes a fall towards glideFall instead of stopping it dead. */
const GLIDE_BRAKE = 900;

/**
 * One fixed step of flight. Mutates `b` and returns what the bird hit, or null.
 * Shared by the real run and by every bot rollout, so bots fly exactly the same physics.
 */
export function stepBody(b: Body, env: Env, flap: boolean, held: boolean): Cause | null {
  const p = env.phys;
  if (flap) {
    b.vy = p.additive ? Math.max(-p.flap, b.vy - p.flap) : -p.flap;
    b.cooldown = p.cooldown;
  } else if (b.cooldown > 0) {
    b.cooldown -= STEP;
  }
  b.vy += p.gravity * STEP;
  if (p.glideFall !== null && held && b.vy > p.glideFall) b.vy = Math.max(p.glideFall, b.vy - GLIDE_BRAKE * STEP);
  if (b.vy > p.maxFall) b.vy = p.maxFall;
  b.y += b.vy * STEP;
  const currents = env.course.currents;
  for (let i = 0; i < currents.length; i++) {
    const c = currents[i]!;
    if (b.x >= c.x0 && b.x < c.x1) b.y += c.drift * p.currentMul * STEP;
  }
  b.x += speedOf(env, b.passed) * STEP;
  b.t += STEP;
  if (b.y < CEIL_Y) {
    b.y = CEIL_Y;
    if (b.vy < 0) b.vy = 0;
  }
  const r = p.radius;
  if (b.y + r >= GROUND_Y) return 'ground';
  const pipes = env.course.pipes;
  while (b.passed < pipes.length && b.x >= pipes[b.passed]!.x + LIP_W / 2) b.passed++;
  const prev = pipes[b.passed - 1];
  if (prev && pipeHit(prev, b.t, b.x, b.y, r)) return 'pipe';
  const next = pipes[b.passed];
  if (next && pipeHit(next, b.t, b.x, b.y, r)) return 'pipe';
  const spans = env.spans;
  for (let i = 0; i < spans.length; i += 2) {
    if (b.x + r < spans[i]! || b.x - r > spans[i + 1]!) continue;
    if (hazardHit(env.course.hazards[i >> 1]!, b.t, b.x, b.y, r)) return 'hazard';
  }
  return null;
}

export interface ClearResult {
  levelId: string;
  coins: number;
  total: number;
  stars: 1 | 2 | 3;
  /** Seconds from the first flap to the flag, counting from the last checkpoint restart too. */
  time: number;
}

export function starsFor(coins: number, total: number): 1 | 2 | 3 {
  if (total > 0 && coins >= total) return 3;
  if (coins >= Math.ceil(total / 2)) return 2;
  return 1;
}

export interface RunEvents {
  phase?(phase: Phase): void;
  flap?(): void;
  coin?(coin: Coin): void;
  pass?(passed: number): void;
  hit?(cause: Cause): void;
  land?(): void;
  checkpoint?(): void;
  clear?(result: ClearResult): void;
  theme?(theme: ThemeId): void;
}

/**
 * Inputs of one attempt, by physics tick: `p` = presses, `h` = moments the button was pressed
 * or released (only recorded for a bird that can glide, the only one it matters for).
 * Ticks count the attempt's flying steps from 1; an input with tick n came in before step n.
 */
export interface InputLog {
  p: number[];
  h: number[];
}

interface Saved {
  x: number;
  y: number;
  t: number;
  passed: number;
  coins: number;
  nextCoin: number;
  coinBits: Uint8Array;
}

export interface RunOptions {
  mode: Mode;
  def?: LevelDef;
  bird?: Bird;
  /** Endless course seed. */
  seed?: number;
  events?: RunEvents;
}

export class Run {
  readonly mode: Mode;
  readonly def: LevelDef | null;
  readonly bird: Bird;
  readonly phys: Physics;
  readonly course: Course;
  readonly env: Env;
  readonly seed: number;
  body: Body;
  phase: Phase = 'ready';
  /** Ticks spent in the current phase. */
  phaseTicks = 0;
  /** Ticks since the run was created; drives idle animations. */
  clock = 0;
  coinBits: Uint8Array;
  coins = 0;
  flaps = 0;
  /** Button held (pelican glide). */
  held = false;
  cause: Cause | null = null;
  checkpoint: Saved | null = null;
  theme: ThemeId;
  result: ClearResult | null = null;
  /** Clock tick of the last flap, for the wing animation. */
  lastFlap = -1000;
  /** Flying steps in the current attempt; inputs are logged against it. */
  flyTicks = 0;
  /** Called at the start of every tick; bots press and hold from here. */
  controller: ((run: Run) => void) | null = null;
  events: RunEvents;
  private queued = false;
  private log: InputLog = { p: [], h: [] };
  /** Inputs of the attempt that reached the halfway flag, up to that moment. */
  private cpLog: InputLog | null = null;
  private fromCheckpoint = false;
  private nextCoin = 0;
  private flagT = 0;
  private acc = 0;

  constructor(opts: RunOptions) {
    this.mode = opts.mode;
    this.def = opts.def ?? null;
    this.bird = opts.bird ?? BIRDS.duck;
    this.seed = opts.seed ?? 1;
    this.events = opts.events ?? {};
    if (this.mode === 'level') {
      if (!this.def) throw new Error('a level run needs a level');
      this.course = buildCourse(this.def);
      this.theme = this.def.theme;
    } else {
      this.course = buildEndless(this.seed);
      this.theme = endlessTheme(0);
    }
    this.phys = physics(this.bird, this.def?.medium ?? 'air');
    this.env = makeEnv(this.course, this.phys, this.mode, this.def?.speed ?? 0);
    this.coinBits = new Uint8Array(this.course.coins.length);
    this.body = { x: 0, y: START_Y, vy: 0, t: 0, cooldown: 0, passed: 0 };
  }

  get speed(): number {
    return speedOf(this.env, this.body.passed);
  }

  get queuedPress(): boolean {
    return this.queued;
  }

  /** 0..1 of the way to the flag (levels only). */
  get progress(): number {
    return this.mode === 'level' ? Math.max(0, Math.min(1, this.body.x / this.course.flagX)) : 0;
  }

  get canRetry(): boolean {
    return this.phase === 'dead' && this.phaseTicks * STEP >= RETRY_LOCK;
  }

  /** A tap or key press. Starts the run, flaps, or (in a level) restarts after a crash. */
  press(): void {
    if (this.phase === 'ready' || this.phase === 'playing') {
      this.queued = true;
      this.log.p.push(this.flyTicks + 1);
    } else if (this.mode === 'level' && this.canRetry) this.retry();
  }

  setHeld(held: boolean): void {
    if (held === this.held) return;
    this.held = held;
    if (this.phys.glideFall !== null && (this.phase === 'ready' || this.phase === 'playing')) this.log.h.push(this.flyTicks + 1);
  }

  /**
   * The inputs behind a cleared level, for the leaderboard to replay: one attempt from the
   * start, or, after a restart at the halfway flag, the attempt that reached the flag (up to
   * it) followed by the attempt from there.
   */
  replay(): InputLog[] | null {
    if (!this.result && this.phase !== 'clearing') return null;
    const upTo = (log: InputLog, n: number): InputLog => ({ p: log.p.filter((t) => t <= n), h: log.h.filter((t) => t <= n) });
    const last = upTo(this.log, this.flyTicks);
    return this.fromCheckpoint && this.cpLog ? [this.cpLog, last] : [last];
  }

  /** Advance by real elapsed time using fixed steps. */
  frame(dtReal: number): void {
    this.acc += Math.min(Math.max(0, dtReal), 0.25);
    while (this.acc >= STEP) {
      this.tick();
      this.acc -= STEP;
    }
  }

  /** Advance by a number of seconds of game time (tests, bots, smoke tests). */
  step(seconds: number): void {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) this.tick();
  }

  tick(): void {
    this.clock++;
    this.phaseTicks++;
    this.controller?.(this);
    switch (this.phase) {
      case 'ready':
        if (this.queued) {
          this.setPhase('playing');
          this.fly();
        }
        break;
      case 'playing':
        this.fly();
        break;
      case 'dying':
        this.fall();
        break;
      case 'clearing':
        this.glideHome();
        break;
      default:
        break;
    }
  }

  /** Restart after a crash: from the checkpoint flag if one was reached. */
  retry(): void {
    const cp = this.checkpoint;
    this.body = { x: cp?.x ?? 0, y: cp?.y ?? START_Y, vy: 0, t: cp?.t ?? 0, cooldown: 0, passed: cp?.passed ?? 0 };
    this.coinBits = cp ? cp.coinBits.slice() : new Uint8Array(this.course.coins.length);
    this.coins = cp?.coins ?? 0;
    this.nextCoin = cp?.nextCoin ?? 0;
    if (!cp) this.flaps = 0;
    this.queued = false;
    this.flyTicks = 0;
    this.fromCheckpoint = !!cp;
    // A button still held from the last attempt counts as pressed at the first step.
    this.log = { p: [], h: this.held && this.phys.glideFall !== null ? [1] : [] };
    this.cause = null;
    this.setPhase('ready');
  }

  /** End the run as if the bird had crashed (smoke tests). */
  kill(): void {
    if (this.phase === 'playing' || this.phase === 'ready') this.die('pipe');
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTicks = 0;
    this.events.phase?.(p);
  }

  private fly(): void {
    this.flyTicks++;
    const b = this.body;
    let flap = false;
    if (this.queued && canFlap(b)) {
      flap = true;
      this.queued = false;
      this.flaps++;
      this.lastFlap = this.clock;
      this.events.flap?.();
    }
    this.course.endless?.ensure(b.x);
    const before = b.passed;
    const hit = stepBody(b, this.env, flap, this.held);
    for (let n = before + 1; n <= b.passed; n++) {
      this.events.pass?.(n);
      if (this.mode === 'endless') {
        const th = endlessTheme(n);
        if (th !== this.theme) {
          this.theme = th;
          this.events.theme?.(th);
        }
      }
    }
    this.collectCoins();
    const cpx = this.course.checkpointX;
    if (cpx !== null && !this.checkpoint && b.x >= cpx) {
      this.checkpoint = {
        x: b.x,
        y: refY(this.course, b.x, b.t),
        t: b.t,
        passed: b.passed,
        coins: this.coins,
        nextCoin: this.nextCoin,
        coinBits: this.coinBits.slice(),
      };
      this.cpLog = { p: this.log.p.filter((t) => t <= this.flyTicks), h: this.log.h.filter((t) => t <= this.flyTicks) };
      this.events.checkpoint?.();
    }
    if (hit) {
      this.die(hit);
      return;
    }
    if (b.x >= this.course.flagX) {
      this.flagT = b.t;
      this.setPhase('clearing');
    }
  }

  private collectCoins(): void {
    const coins = this.course.coins;
    const b = this.body;
    const r = this.phys.radius + COIN_R;
    while (this.nextCoin < coins.length && coins[this.nextCoin]!.x < b.x - r) this.nextCoin++;
    for (let i = this.nextCoin; i < coins.length; i++) {
      const c = coins[i]!;
      if (c.x > b.x + r) break;
      if (this.coinBits[i]) continue;
      const dx = c.x - b.x;
      const dy = c.y - b.y;
      if (dx * dx + dy * dy < r * r) {
        this.coinBits[i] = 1;
        this.coins++;
        this.events.coin?.(c);
      }
    }
  }

  private die(cause: Cause): void {
    this.cause = cause;
    this.queued = false;
    this.events.hit?.(cause);
    const b = this.body;
    if (cause === 'ground') {
      b.y = GROUND_Y - this.phys.radius;
      b.vy = 0;
      this.setPhase('dead');
      this.events.land?.();
      return;
    }
    b.vy = -110;
    this.setPhase('dying');
  }

  private fall(): void {
    const b = this.body;
    b.vy = Math.min(b.vy + this.phys.gravity * STEP, Math.max(this.phys.maxFall, 260));
    b.y += b.vy * STEP;
    if (b.y + this.phys.radius >= GROUND_Y) {
      b.y = GROUND_Y - this.phys.radius;
      b.vy = 0;
      this.setPhase('dead');
      this.events.land?.();
    }
  }

  private glideHome(): void {
    const b = this.body;
    const door = GROUND_Y - 12;
    b.x = Math.min(this.course.castleX, b.x + this.speed * STEP);
    b.y += (door - b.y) * Math.min(1, 3 * STEP);
    b.vy = 0;
    if (b.x >= this.course.castleX && this.phaseTicks * STEP >= 1.2) {
      const total = this.course.coins.length;
      this.result = { levelId: this.def?.id ?? '', coins: this.coins, total, stars: starsFor(this.coins, total), time: this.flagT };
      this.setPhase('cleared');
      this.events.clear?.(this.result);
    }
  }
}
