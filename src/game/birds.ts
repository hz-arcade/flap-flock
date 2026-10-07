import { BIRD_IDS, SPEED_MULS } from '../../shared/scoreRules';

export type BirdId = (typeof BIRD_IDS)[number];
/** Index = leaderboard bird id. Append only. */
export const BIRD_ORDER: readonly BirdId[] = BIRD_IDS;

export interface Bird {
  id: BirdId;
  /** Downward acceleration, px/s². */
  gravity: number;
  /** Upward speed set by a flap, px/s. */
  flap: number;
  /** Terminal falling speed, px/s. */
  maxFall: number;
  /** Hitbox radius, px. The sprite is drawn larger, so near misses feel fair. */
  radius: number;
  /** Seconds between two flaps. A tap during the cooldown is kept and flaps when it ends. */
  cooldown: number;
  /** Multiplies the scroll speed. */
  speedMul: number;
  /** Pelican: while the button is held, falling is capped at this speed. */
  glideFall?: number;
  /** Penguin: swims instead of struggling in water levels. */
  swimmer?: boolean;
  /** 0 = available from the start; N = unlocked by clearing world N. */
  unlockWorld: 0 | 1 | 2 | 3;
}

export const BIRDS: Record<BirdId, Bird> = {
  duck: { id: 'duck', gravity: 900, flap: 250, maxFall: 270, radius: 5.5, cooldown: 0.1, speedMul: 1, unlockWorld: 0 },
  chicken: { id: 'chicken', gravity: 1250, flap: 290, maxFall: 380, radius: 6, cooldown: 0.1, speedMul: 1, unlockWorld: 0 },
  pelican: { id: 'pelican', gravity: 700, flap: 215, maxFall: 240, radius: 7.5, cooldown: 0.1, speedMul: 1, glideFall: 60, unlockWorld: 0 },
  sparrow: { id: 'sparrow', gravity: 1500, flap: 300, maxFall: 380, radius: 3.5, cooldown: 0.08, speedMul: 1, unlockWorld: 1 },
  penguin: { id: 'penguin', gravity: 1250, flap: 250, maxFall: 400, radius: 7, cooldown: 0.2, speedMul: 1, swimmer: true, unlockWorld: 2 },
  eagle: { id: 'eagle', gravity: 1100, flap: 280, maxFall: 360, radius: 6, cooldown: 0.1, speedMul: SPEED_MULS[5] ?? 1.1, unlockWorld: 3 },
};

export type Medium = 'air' | 'water';

/** The numbers the simulation actually uses, after the medium is applied. */
export interface Physics {
  gravity: number;
  flap: number;
  maxFall: number;
  radius: number;
  cooldown: number;
  speedMul: number;
  /** Flap adds to the current speed instead of setting it (struggling in water). */
  additive: boolean;
  glideFall: number | null;
  /** How strongly water currents push this bird. */
  currentMul: number;
}

export function physics(bird: Bird, medium: Medium = 'air'): Physics {
  const base: Physics = {
    gravity: bird.gravity,
    flap: bird.flap,
    maxFall: bird.maxFall,
    radius: bird.radius,
    cooldown: bird.cooldown,
    speedMul: bird.speedMul,
    additive: false,
    glideFall: bird.glideFall ?? null,
    currentMul: 1,
  };
  if (medium === 'air') return base;
  if (bird.swimmer) {
    // Swims: streamlined, quick strokes, and the currents do not move it.
    return { ...base, gravity: bird.gravity * 0.45, flap: bird.flap * 0.75, maxFall: bird.maxFall * 0.5, radius: bird.radius - 1.5, cooldown: 0.1, currentMul: 0 };
  }
  // Everyone else floats too, but gets shoved around by the currents.
  return { ...base, gravity: bird.gravity * 0.6, flap: bird.flap * 0.8, maxFall: bird.maxFall * 0.55 };
}

/** Height gained by one flap from rest (no cooldown or cap involved). */
export function apex(p: Pick<Physics, 'gravity' | 'flap'>): number {
  return (p.flap * p.flap) / (2 * p.gravity);
}

/** Seconds from a flap back down to the same height. */
export function hopTime(p: Pick<Physics, 'gravity' | 'flap'>): number {
  return (2 * p.flap) / p.gravity;
}

/** 0..1 bars for the bird screen, derived from the physics so they cannot drift. */
export function stats(bird: Bird): { lift: number; weight: number; agility: number; size: number } {
  const ids = BIRD_ORDER.map((id) => BIRDS[id]);
  const norm = (v: number, f: (b: Bird) => number) => {
    const vals = ids.map(f);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return 0.2 + (0.8 * (v - lo)) / (hi - lo || 1);
  };
  const lift = (b: Bird) => apex(b);
  const agility = (b: Bird) => 1 / hopTime(b);
  return {
    lift: norm(lift(bird), lift),
    weight: norm(bird.gravity, (b) => b.gravity),
    agility: norm(agility(bird), agility),
    size: norm(bird.radius, (b) => b.radius),
  };
}
