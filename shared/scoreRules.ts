/**
 * Endless-mode course rules and leaderboard rules, shared by the Worker, the game client and
 * the tests. Pure TypeScript: no DOM, no Workers APIs, no imports from the game, so both sides
 * compile it as-is.
 *
 * The endless ramp lives here (not in src/game) because the Worker needs it to check that a
 * submitted score could have been flown in the submitted time. test/endless.test.ts fails if
 * the game and these rules drift apart.
 */
export const API_VERSION = 1;
export const NAME_MAX = 16;
export const SCORE_MAX = 100_000;
export const SECS_MAX = 86_400;
export const FLAPS_MAX = 2_000_000;
export const LIMIT_DEFAULT = 20;
export const LIMIT_MAX = 50;
export const BODY_MAX_BYTES = 1024;

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/** Birds by leaderboard id. Append only: the index is stored with every score. */
export const BIRD_IDS = ['duck', 'chicken', 'pelican', 'sparrow', 'penguin', 'eagle'] as const;
/** Scroll speed multiplier of each bird, same order as BIRD_IDS. */
export const SPEED_MULS: readonly number[] = [1, 1, 1, 1, 1, 1.1];
/** Shortest flap cooldown of any bird, in seconds. */
export const MIN_FLAP_INTERVAL = 0.08;

/** World x of the first pipe's centre; the bird starts at x = 0. */
export const LEAD_IN = 200;
/** Width of a pipe's lip; a pipe counts as passed once the bird is past its right edge. */
export const LIP_W = 28;

// ---- Endless ramp (n = pipe index, 0-based) ----

/** Scroll speed in px/s while `passed` pipes have been passed. */
export function endlessSpeed(passed: number): number {
  return Math.min(88, 58 + 0.6 * passed);
}
/** Vertical opening of pipe n. */
export function endlessGap(n: number): number {
  return Math.max(70, 104 - 0.68 * n);
}
/** Horizontal distance from pipe n - 1 to pipe n (n >= 1). */
export function endlessPitch(n: number): number {
  return Math.max(124, 156 - 0.64 * n);
}
/** Largest change of gap centre from pipe n - 1 to pipe n. */
export function endlessMaxDelta(n: number): number {
  return Math.min(64, 24 + 0.8 * n);
}
/** Chance that pipe n moves up and down. */
export function endlessMoverChance(n: number): number {
  return n < 50 ? 0 : Math.min(0.3, 0.01 * (n - 50));
}
/** World x of pipe n's centre. */
export function endlessPipeX(n: number): number {
  let x = LEAD_IN;
  for (let k = 1; k <= n; k++) x += endlessPitch(k);
  return x;
}

/** Seconds of scrolling needed to pass `n` pipes with a bird of the given speed multiplier. */
export function secsToPass(n: number, speedMul = 1): number {
  let secs = 0;
  for (let k = 0; k < n; k++) {
    const seg = k === 0 ? LEAD_IN + LIP_W / 2 : endlessPitch(k);
    secs += seg / (endlessSpeed(k) * speedMul);
  }
  return secs;
}

// ---- Leaderboard ----

export interface Entry {
  id: number;
  name: string;
  score: number;
  /** Server time of submission, epoch ms. */
  at: number;
  /** Index into BIRD_IDS. */
  bird: number;
}

export interface Board {
  /** Rows on this board, including those beyond `top`. */
  total: number;
  top: Entry[];
}

export interface Boards {
  now: number;
  weekStart: number;
  weekEnd: number;
  all: Board;
  week: Board;
}

export interface SubmitRequest {
  v: number;
  /** Client-generated id of the run; makes retries and double clicks idempotent. */
  gid: string;
  name: string;
  /** Pipes passed. */
  score: number;
  /** Whole seconds of scrolling (rounded up). */
  secs: number;
  flaps: number;
  /** Index into BIRD_IDS. */
  bird: number;
}

export interface SubmitResponse {
  ok: true;
  /** True when this run had already been submitted; `entry` is the stored row. */
  duplicate: boolean;
  entry: Entry;
  rank: { all: number; week: number };
  boards: Boards;
}

export type ErrorCode = 'bad-json' | 'invalid' | 'origin' | 'too-large' | 'implausible' | 'rate' | 'busy' | 'not-found' | 'server';

export interface ErrorResponse {
  ok: false;
  error: ErrorCode;
  field?: string;
  /** Seconds until another attempt may succeed (rate limiting). */
  retryAfter?: number;
}

/** Start of the UTC week (Monday 00:00) containing `ms`. */
export function weekStart(ms: number): number {
  const day = Math.floor(ms / DAY_MS);
  // 1970-01-01 was a Thursday, so with Monday = 0 the weekday of epoch day d is (d + 3) % 7.
  return (day - ((day + 3) % 7)) * DAY_MS;
}

/** Whole days and hours left until the weekly board resets. */
export function resetsIn(now: number, weekEnd: number): { d: number; h: number } {
  const hours = Math.max(0, Math.ceil((weekEnd - now) / 3_600_000));
  return { d: Math.floor(hours / 24), h: hours % 24 };
}

/**
 * Clean a player-typed name for public display. Keeps letters of any script and emoji;
 * removes control characters, invisible formatting (zero-width, bidi overrides), private-use
 * and unpaired surrogates; limits stacked combining marks; collapses whitespace.
 * Returns '' when nothing usable is left.
 */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.slice(0, 256).normalize('NFC');
  // Invisible formatting goes first: JavaScript counts U+FEFF as whitespace, and it must
  // vanish rather than turn into a visible space.
  s = s.replace(/[\p{Cf}\p{Co}\p{Cs}\p{Cn}]/gu, '');
  s = s.replace(/[\p{Zl}\p{Zp}\s]+/gu, ' ');
  s = s.replace(/\p{Cc}/gu, '');
  s = s.replace(/(\p{M}{2})\p{M}+/gu, '$1');
  s = s.replace(/^[\p{M}\s]+/u, '');
  s = s.replace(/ {2,}/g, ' ').trim();
  s = Array.from(s).slice(0, NAME_MAX).join('').trim();
  return s;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function int(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

export type Validation = { ok: true; value: SubmitRequest } | { ok: false; field: string };

/** Shape and range check of a submission. On success the name is already sanitised. */
export function validateSubmission(body: unknown): Validation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, field: 'body' };
  const b = body as Record<string, unknown>;
  if (b.v !== API_VERSION) return { ok: false, field: 'v' };
  if (typeof b.gid !== 'string' || !UUID.test(b.gid)) return { ok: false, field: 'gid' };
  const name = sanitizeName(b.name);
  if (!name) return { ok: false, field: 'name' };
  if (!int(b.score, 1, SCORE_MAX)) return { ok: false, field: 'score' };
  if (!int(b.secs, 1, SECS_MAX)) return { ok: false, field: 'secs' };
  if (!int(b.flaps, 1, FLAPS_MAX)) return { ok: false, field: 'flaps' };
  if (!int(b.bird, 0, BIRD_IDS.length - 1)) return { ok: false, field: 'bird' };
  return {
    ok: true,
    value: { v: API_VERSION, gid: b.gid.toLowerCase(), name, score: b.score, secs: b.secs, flaps: b.flaps, bird: b.bird },
  };
}

/**
 * Could a real run have produced these numbers? Returns the name of the first rule that
 * fails, or null when the submission is consistent with the game rules. The endless course
 * scrolls at a fixed, known speed, so the time needed for a score is exact; this rules out
 * impossible results but cannot prove that a possible result was actually flown.
 */
export function checkPlausible(r: Pick<SubmitRequest, 'score' | 'secs' | 'flaps' | 'bird'>): string | null {
  const mul = SPEED_MULS[r.bird] ?? 1;
  if (r.secs < Math.ceil(secsToPass(r.score, mul)) - 1) return 'too-fast';
  if (r.secs > Math.ceil(secsToPass(r.score + 1, mul)) + 1) return 'too-slow';
  // Flaps are rate limited by the cooldown.
  if (r.flaps > r.secs / MIN_FLAP_INTERVAL + 2) return 'flaps-per-second';
  // Nothing stays up without flapping; a pelican gliding from the ceiling lasts about 4 s.
  if (r.flaps < Math.max(1, Math.floor(0.2 * r.secs) - 2)) return 'too-few-flaps';
  return null;
}

export function clampLimit(raw: string | null): number {
  const n = raw === null ? LIMIT_DEFAULT : Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return LIMIT_DEFAULT;
  return Math.min(LIMIT_MAX, Math.max(1, n));
}
