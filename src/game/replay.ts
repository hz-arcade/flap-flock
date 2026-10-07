import { API_VERSION, BIRD_IDS, sanitizeName, type ClearRequest, type InputSegment } from '../../shared/scoreRules';
import { BIRDS } from './birds';
import { levelById } from './levels';
import { Run, starsFor, type InputLog } from './Run';

/**
 * Leaderboard proof for a level clear. The simulation is deterministic (fixed step, seeded
 * course, deterministic sine), so the inputs of a clear are a complete record of it: the
 * server re-flies them with this same code and gets the very same coins. Used by the game
 * (to encode) and by the Worker (to check).
 */
export const MAX_EVENTS = 6000;
/** Longest attempt accepted, in steps (about four minutes). */
export const MAX_TICKS = 30_000;

/** Increasing tick lists → gaps, which are small numbers and travel compactly as JSON. */
export function encodeLog(log: InputLog): InputSegment {
  const gaps = (xs: number[]) => xs.map((x, i) => x - (i ? (xs[i - 1] as number) : 0));
  return { p: gaps(log.p), h: gaps(log.h) };
}

export function decodeLog(seg: InputSegment): InputLog | null {
  const sums = (xs: unknown): number[] | null => {
    if (!Array.isArray(xs) || xs.length > MAX_EVENTS) return null;
    const out: number[] = [];
    let at = 0;
    for (const d of xs) {
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > MAX_TICKS) return null;
      at += d;
      if (at > MAX_TICKS) return null;
      out.push(at);
    }
    return out;
  };
  const p = sums(seg.p);
  const h = sums(seg.h);
  return p && h ? { p, h } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ClearValidation = { ok: true; value: ClearRequest; logs: InputLog[] } | { ok: false; field: string };

/** Shape and range check of a clear submission. On success the name is sanitised and the inputs decoded. */
export function validateClear(body: unknown): ClearValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, field: 'body' };
  const b = body as Record<string, unknown>;
  if (b.v !== API_VERSION) return { ok: false, field: 'v' };
  if (typeof b.key !== 'string' || !UUID.test(b.key)) return { ok: false, field: 'key' };
  const name = sanitizeName(b.name);
  if (!name) return { ok: false, field: 'name' };
  if (typeof b.level !== 'string' || !levelById(b.level)) return { ok: false, field: 'level' };
  if (typeof b.bird !== 'number' || !Number.isInteger(b.bird) || b.bird < 0 || b.bird >= BIRD_IDS.length) return { ok: false, field: 'bird' };
  if (!Array.isArray(b.segs) || b.segs.length < 1 || b.segs.length > 2) return { ok: false, field: 'segs' };
  const logs: InputLog[] = [];
  const segs: InputSegment[] = [];
  for (const s of b.segs as unknown[]) {
    if (typeof s !== 'object' || s === null) return { ok: false, field: 'segs' };
    const seg = { p: (s as InputSegment).p, h: (s as InputSegment).h ?? [] };
    const log = decodeLog(seg);
    if (!log) return { ok: false, field: 'segs' };
    logs.push(log);
    segs.push({ p: seg.p, h: seg.h });
  }
  return { ok: true, value: { v: API_VERSION, key: b.key.toLowerCase(), name, level: b.level, bird: b.bird, segs }, logs };
}

export type Verdict = { ok: true; coins: number; total: number; stars: 1 | 2 | 3 } | { ok: false; reason: string };

/**
 * Fly the recorded inputs and report what they achieve. Two segments mean: the attempt that
 * reached the halfway flag (stopped there), then a restart from the flag.
 */
export function verifyClear(levelId: string, birdIndex: number, logs: InputLog[]): Verdict {
  const def = levelById(levelId);
  const id = BIRD_IDS[birdIndex];
  if (!def || !id) return { ok: false, reason: 'unknown' };
  if (logs.length === 2 && !def.checkpoint) return { ok: false, reason: 'no-checkpoint' };
  const run = new Run({ mode: 'level', def, bird: BIRDS[id] });
  for (let s = 0; s < logs.length; s++) {
    const log = logs[s]!;
    const last = s === logs.length - 1;
    if (s > 0) {
      if (!run.checkpoint) return { ok: false, reason: 'no-checkpoint' };
      run.setHeld(false);
      run.retry();
    }
    let pi = 0;
    let hi = 0;
    for (let guard = 0; ; guard++) {
      if (guard > MAX_TICKS + 1000) return { ok: false, reason: 'too-long' };
      const next = run.flyTicks + 1;
      while (hi < log.h.length && log.h[hi] === next) {
        run.setHeld(!run.held);
        hi++;
      }
      while (pi < log.p.length && log.p[pi] === next) {
        run.press();
        pi++;
      }
      if (run.phase === 'ready' && !run.queuedPress) return { ok: false, reason: 'never-started' };
      run.tick();
      if (!last && run.checkpoint) break;
      if (run.phase === 'dying' || run.phase === 'dead') return { ok: false, reason: 'crashed' };
      if (run.phase === 'clearing') {
        if (!last) return { ok: false, reason: 'extra-segment' };
        const total = run.course.coins.length;
        return { ok: true, coins: run.coins, total, stars: starsFor(run.coins, total) };
      }
    }
  }
  return { ok: false, reason: 'unfinished' };
}
