import {
  endlessGap,
  endlessMaxDelta,
  endlessMoverChance,
  endlessPitch,
} from '../../shared/scoreRules';
import { circleRect } from './collide';
import { dsin } from './dmath';
import { CASTLE_GAP, EDGE_MARGIN, GROUND_Y, LEAD_IN, LIP_H, LIP_W, PIPE_W, RUNOUT, START_Y } from './constants';
import { WHEEL_BALL_R, type Hazard } from './hazards';
import type { HazardKind, LevelDef } from './levels';
import { Rng } from './rng';

export interface PipePair {
  /** Centre x. */
  x: number;
  /** Gap centre at rest. */
  center: number;
  gap: number;
  /** Moving pipes slide by ±amp around `center`; amp 0 = static. */
  amp: number;
  period: number;
  phase: number;
}

export interface Coin {
  id: number;
  x: number;
  y: number;
}

/** A stretch of water that carries the bird up (drift < 0) or down at a steady speed, px/s. */
export interface Current {
  x0: number;
  x1: number;
  drift: number;
}

export interface Course {
  pipes: PipePair[];
  coins: Coin[];
  hazards: Hazard[];
  currents: Current[];
  checkpointX: number | null;
  /** Reaching this x clears the level; Infinity in endless mode. */
  flagX: number;
  castleX: number;
  /** Endless mode only: grows the course as the bird flies. */
  endless: EndlessGen | null;
}

const TAU = Math.PI * 2;
/** Half the length of the flat part of the reference path at each pipe. */
const FLAT = 24;
/**
 * Closest a hazard's surface comes to the reference path. A bird hopping along the path
 * swings about half a hop (~17 px) to each side, so hazards punish sloppy flying rather than
 * sitting in the way.
 */
const REACH = 28;
const URCHIN_R = 6;
const UPDRAFT = 0.45;
const URCHIN_AMP = 14;
const WHEEL_ARM = 21;
/** Room a hazard needs between the path and the ceiling or ground. */
const NEED: Record<HazardKind, number> = {
  urchin: REACH + 2 * URCHIN_R + 2 * URCHIN_AMP,
  lava: 0,
  cannon: 0,
  wheel: REACH + WHEEL_ARM + 2 * WHEEL_BALL_R,
};

export function pipeCenter(p: PipePair, t: number): number {
  return p.amp === 0 ? p.center : p.center + p.amp * dsin((TAU * t) / p.period + p.phase);
}

export function pipeHit(p: PipePair, t: number, x: number, y: number, r: number): boolean {
  if (x + r <= p.x - LIP_W / 2 || x - r >= p.x + LIP_W / 2) return false;
  const c = pipeCenter(p, t);
  const top = c - p.gap / 2;
  const bot = c + p.gap / 2;
  // Fully inside the opening: nothing to hit.
  if (y - r > top && y + r < bot) return false;
  return (
    circleRect(x, y, r, p.x - LIP_W / 2, top - LIP_H, p.x + LIP_W / 2, top) ||
    circleRect(x, y, r, p.x - PIPE_W / 2, -1e4, p.x + PIPE_W / 2, top - LIP_H) ||
    circleRect(x, y, r, p.x - LIP_W / 2, bot, p.x + LIP_W / 2, bot + LIP_H) ||
    circleRect(x, y, r, p.x - PIPE_W / 2, bot + LIP_H, p.x + PIPE_W / 2, GROUND_Y + 64)
  );
}

/** Index of the first pipe whose right lip edge is at or beyond x (pipes.length if none). */
export function pipeIndexAt(pipes: readonly PipePair[], x: number): number {
  let lo = 0;
  let hi = pipes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((pipes[mid] as PipePair).x + LIP_W / 2 < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The line a careful player would fly: flat through each gap, straight ramps in between,
 * then down to the castle door. Moving pipes are followed at time t. Bots aim along it, coins
 * sit on it.
 */
export function refY(course: Course, x: number, t: number): number {
  const pipes = course.pipes;
  // First pipe whose flat part ends at or after x.
  let lo = 0;
  let hi = pipes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((pipes[mid] as PipePair).x + FLAT < x) lo = mid + 1;
    else hi = mid;
  }
  const j = lo;
  const next = pipes[j];
  const prev = pipes[j - 1];
  if (!next) {
    const last = prev ? pipeCenter(prev, t) : START_Y;
    if (x <= course.flagX) return last;
    const door = GROUND_Y - 12;
    const k = Math.min(1, (x - course.flagX) / (course.castleX - course.flagX));
    return last + (door - last) * k;
  }
  const cNext = pipeCenter(next, t);
  if (x >= next.x - FLAT) return cNext;
  const x0 = prev ? prev.x + FLAT : 0;
  const y0 = prev ? pipeCenter(prev, t) : START_Y;
  const x1 = next.x - FLAT;
  const k = x1 > x0 ? (x - x0) / (x1 - x0) : 1;
  return y0 + (cNext - y0) * Math.max(0, Math.min(1, k));
}

function placeCenter(rng: Rng, prev: number | null, maxDelta: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) / 2;
  if (prev === null) return Math.round(Math.max(lo, Math.min(hi, 112 + rng.range(-maxDelta / 2, maxDelta / 2))));
  let c = prev + rng.range(-maxDelta, maxDelta);
  // Reflect off the limits so the course does not hug them, then stay within reach of the previous gap.
  if (c < lo) c = lo + (lo - c);
  if (c > hi) c = hi - (c - hi);
  const a = Math.max(lo, prev - maxDelta);
  const b = Math.min(hi, prev + maxDelta);
  c = a <= b ? Math.max(a, Math.min(b, c)) : prev < lo ? lo : hi;
  return Math.round(c);
}

/** Build a level's course. Deterministic: the same definition always gives the same course. */
export function buildCourse(def: LevelDef): Course {
  const rng = new Rng(def.seed * 7919 + 17);
  const n = def.pipes;

  // Which pipes move (never the first three).
  const moving = new Set<number>();
  if (def.movers) {
    const pool = Array.from({ length: n - 3 }, (_, i) => i + 3);
    rng.shuffle(pool);
    for (const i of pool.slice(0, def.movers.count)) moving.add(i);
  }

  const pipes: PipePair[] = [];
  let prev: number | null = null;
  for (let i = 0; i < n; i++) {
    const amp = moving.has(i) && def.movers ? def.movers.amp : 0;
    const lo = Math.max(def.centerMin, def.gap / 2 + EDGE_MARGIN + amp);
    const hi = Math.min(def.centerMax, GROUND_Y - EDGE_MARGIN - def.gap / 2 - amp);
    const center = placeCenter(rng, prev, def.maxDelta, lo, hi);
    pipes.push({
      x: LEAD_IN + i * def.pitch,
      center,
      gap: def.gap,
      amp,
      period: def.movers?.period ?? 1,
      phase: amp ? rng.range(0, TAU) : 0,
    });
    prev = center;
  }

  const last = pipes[n - 1] as PipePair;
  const flagX = last.x + RUNOUT;
  const castleX = flagX + CASTLE_GAP;
  const course: Course = { pipes, coins: [], hazards: [], currents: [], checkpointX: null, flagX, castleX, endless: null };

  // Corridors are the open stretches between pipe k and k + 1.
  const cpCorridor = def.checkpoint ? Math.floor(n / 2) - 1 : -1;
  if (def.checkpoint) {
    const a = pipes[cpCorridor] as PipePair;
    const b = pipes[cpCorridor + 1] as PipePair;
    course.checkpointX = (a.x + b.x) / 2;
  }

  const free = Array.from({ length: n - 1 }, (_, i) => i).filter((k) => k >= 2 && k !== cpCorridor);
  rng.shuffle(free);
  const take = (): number | null => free.shift() ?? null;

  let side = rng.chance(0.5) ? 1 : -1;
  for (const spec of def.hazards ?? []) {
    let placed = 0;
    const skipped: number[] = [];
    while (placed < spec.count) {
      const k = take();
      if (k === null) break;
      const a = pipes[k] as PipePair;
      const b = pipes[k + 1] as PipePair;
      const mx = (a.x + b.x) / 2;
      // Players fly level with the next gap, not along the ramp, so keep clear of both centres.
      const lowPath = Math.max(a.center + a.amp, b.center + b.amp);
      const highPath = Math.min(a.center - a.amp, b.center - b.amp);
      const lowEdge = Math.max(a.center + a.gap / 2 + a.amp, b.center + b.gap / 2 + b.amp);
      const highEdge = Math.min(a.center - a.gap / 2 - a.amp, b.center - b.gap / 2 - b.amp);
      const room = (dir: number) => (dir > 0 ? GROUND_Y - 8 - lowPath : highPath - 8);
      const need = NEED[spec.kind];
      side = -side;
      if (room(side) < need) side = -side;
      if (room(side) < need) {
        skipped.push(k);
        continue;
      }
      const base = side > 0 ? lowPath : highPath;
      placed++;
      switch (spec.kind) {
        case 'urchin':
          course.hazards.push({ kind: 'urchin', x: mx, y: base + side * (REACH + URCHIN_R + URCHIN_AMP), amp: URCHIN_AMP, period: 2.4, phase: rng.range(0, TAU), r: URCHIN_R });
          break;
        case 'lava': {
          const r = 5;
          course.hazards.push({ kind: 'lava', x: mx, top: Math.min(GROUND_Y - 24, Math.max(lowEdge, lowPath + REACH + r)), period: 2.6, phase: rng.range(0, TAU), r });
          break;
        }
        case 'cannon': {
          const hang = side < 0 && highEdge > 40;
          const edge = hang ? Math.min(highEdge, highPath - REACH) : Math.max(lowEdge, lowPath + REACH, GROUND_Y - 96);
          course.hazards.push({
            kind: 'cannon',
            x: b.x - LIP_W / 2 - 22,
            edge: Math.min(GROUND_Y - 16, edge),
            hang,
            every: 2.2,
            offset: rng.range(0, 2.2),
            ballSpeed: 60,
            range: b.x - a.x - LIP_W - 30,
          });
          break;
        }
        case 'wheel':
          course.hazards.push({ kind: 'wheel', x: mx, y: base + side * (WHEEL_ARM + WHEEL_BALL_R + REACH), arm: WHEEL_ARM, balls: 4, omega: (TAU / 3.2) * (rng.chance(0.5) ? 1 : -1), phase: rng.range(0, TAU) });
          break;
      }
    }
    free.unshift(...skipped);
  }

  if (def.currents) {
    for (let c = 0; c < def.currents.bands; c++) {
      const k = take();
      if (k === null) break;
      const a = pipes[k] as PipePair;
      const b = pipes[k + 1] as PipePair;
      // Rising bubbles are gentler than sinking water: a strong updraft makes every flap a huge hop.
      const drift = c % 2 === 0 ? def.currents.drift : -def.currents.drift * UPDRAFT;
      course.currents.push({ x0: a.x + LIP_W / 2 + 6, x1: b.x - LIP_W / 2 - 6, drift });
    }
    course.currents.sort((p, q) => p.x0 - q.x0);
  }

  // Coins: the centre of every static gap, and the middle of every corridor without a hazard.
  const spots: Array<[number, number]> = [];
  pipes.forEach((p, i) => {
    if (p.amp === 0) spots.push([p.x, p.center]);
    const q = pipes[i + 1];
    if (q && !course.hazards.some((h) => h.x > p.x && h.x < q.x)) spots.push([(p.x + q.x) / 2, Math.round((p.center + q.center) / 2)]);
  });
  const chosen = rng.shuffle(spots.slice()).slice(0, def.coins);
  chosen.sort((p, q) => p[0] - q[0]);
  course.coins = chosen.map(([x, y], id) => ({ id, x, y }));
  return course;
}

/** Endless course: pipes are generated ahead of the bird as it flies, from the shared ramp. */
export class EndlessGen {
  private rng: Rng;
  private prev: number | null = null;
  private nextX: number;

  constructor(
    private course: Course,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    this.nextX = LEAD_IN;
  }

  /** Make sure pipes exist up to world x. */
  ensure(x: number): void {
    const pipes = this.course.pipes;
    while (this.nextX <= x + 640) {
      const i = pipes.length;
      const gap = endlessGap(i);
      const amp = this.rng.chance(endlessMoverChance(i)) ? this.rng.range(10, 16) : 0;
      const lo = gap / 2 + EDGE_MARGIN + amp + 4;
      const hi = GROUND_Y - EDGE_MARGIN - gap / 2 - amp - 4;
      const center = placeCenter(this.rng, this.prev, endlessMaxDelta(i), lo, hi);
      pipes.push({ x: this.nextX, center, gap, amp, period: this.rng.range(2.4, 3.2), phase: amp ? this.rng.range(0, TAU) : 0 });
      this.prev = center;
      this.nextX += endlessPitch(i + 1);
    }
  }
}

export function buildEndless(seed: number): Course {
  const course: Course = { pipes: [], coins: [], hazards: [], currents: [], checkpointX: null, flagX: Infinity, castleX: Infinity, endless: null };
  course.endless = new EndlessGen(course, seed);
  course.endless.ensure(0);
  return course;
}
