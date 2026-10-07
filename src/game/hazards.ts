import { circleCircle, circleRect } from './collide';
import { GROUND_Y } from './constants';
import { dcos, dsin } from './dmath';

/**
 * Hazards are pure functions of the run clock t, so a run is fully determined by its inputs
 * and a checkpoint restart only has to restore t.
 */
export type Hazard =
  /** Spiky ball bobbing up and down (water). */
  | { kind: 'urchin'; x: number; y: number; amp: number; period: number; phase: number; r: number }
  /** Fireball leaping out of the lava floor (castle). `top` is the highest point of its centre. */
  | { kind: 'lava'; x: number; top: number; period: number; phase: number; r: number }
  /**
   * Cannon tower standing on the ground (or hanging from the top when `hang`), firing balls
   * to the left every `every` seconds. `edge` is the tower's free end: its top, or its bottom
   * when hanging.
   */
  | { kind: 'cannon'; x: number; edge: number; hang: boolean; every: number; offset: number; ballSpeed: number; range: number }
  /** Arm of fireballs turning around a pivot. */
  | { kind: 'wheel'; x: number; y: number; arm: number; balls: number; omega: number; phase: number };

export const CANNON_HALF_W = 8;
export const BALL_R = 4;
export const WHEEL_BALL_R = 3.5;
const TAU = Math.PI * 2;

export function urchinY(h: Extract<Hazard, { kind: 'urchin' }>, t: number): number {
  return h.y + h.amp * dsin((TAU * t) / h.period + h.phase);
}

/** Centre y of a lava fireball; below the floor (hidden) for half of each period. */
export function lavaY(h: Extract<Hazard, { kind: 'lava' }>, t: number): number {
  const s = dsin((TAU * t) / h.period + h.phase);
  const rest = GROUND_Y + h.r + 2;
  return s > 0 ? rest - (rest - h.top) * s : rest;
}

export function cannonMuzzleY(h: Extract<Hazard, { kind: 'cannon' }>): number {
  return h.hang ? h.edge - 7 : h.edge + 7;
}

/** World x of every ball in flight. */
export function cannonBalls(h: Extract<Hazard, { kind: 'cannon' }>, t: number): number[] {
  const out: number[] = [];
  const life = h.range / h.ballSpeed;
  const kMin = Math.max(0, Math.ceil((t - life - h.offset) / h.every));
  const kMax = Math.floor((t - h.offset) / h.every);
  for (let k = kMin; k <= kMax; k++) {
    const age = t - (h.offset + k * h.every);
    if (age < 0 || age > life) continue;
    out.push(h.x - CANNON_HALF_W - h.ballSpeed * age);
  }
  return out;
}

/** Centres of a wheel's fireballs. */
export function wheelBalls(h: Extract<Hazard, { kind: 'wheel' }>, t: number): Array<[number, number]> {
  const a = h.phase + h.omega * t;
  const out: Array<[number, number]> = [];
  for (let k = 0; k < h.balls; k++) {
    const d = (h.arm * k) / (h.balls - 1);
    out.push([h.x + dcos(a) * d, h.y + dsin(a) * d]);
  }
  return out;
}

/** Horizontal span in which the hazard can touch anything. */
export function hazardSpan(h: Hazard): [number, number] {
  switch (h.kind) {
    case 'urchin':
    case 'lava':
      return [h.x - h.r, h.x + h.r];
    case 'cannon':
      return [h.x - CANNON_HALF_W - h.range - BALL_R, h.x + CANNON_HALF_W];
    case 'wheel':
      return [h.x - h.arm - WHEEL_BALL_R, h.x + h.arm + WHEEL_BALL_R];
  }
}

export function hazardHit(h: Hazard, t: number, x: number, y: number, r: number): boolean {
  switch (h.kind) {
    case 'urchin':
      return circleCircle(x, y, r, h.x, urchinY(h, t), h.r);
    case 'lava':
      return circleCircle(x, y, r, h.x, lavaY(h, t), h.r);
    case 'cannon': {
      const y0 = h.hang ? -1e4 : h.edge;
      const y1 = h.hang ? h.edge : GROUND_Y + 64;
      if (circleRect(x, y, r, h.x - CANNON_HALF_W, y0, h.x + CANNON_HALF_W, y1)) return true;
      const my = cannonMuzzleY(h);
      if (Math.abs(y - my) >= r + BALL_R) return false;
      for (const bx of cannonBalls(h, t)) if (circleCircle(x, y, r, bx, my, BALL_R)) return true;
      return false;
    }
    case 'wheel':
      for (const [bx, by] of wheelBalls(h, t)) if (circleCircle(x, y, r, bx, by, WHEEL_BALL_R)) return true;
      return false;
  }
}
