/**
 * Flap Flock leaderboard (endless mode): a Worker in front of one SQLite-backed Durable Object.
 *
 *   GET    /scores?limit=20   → Boards (all-time and this week)
 *   POST   /scores            → SubmitResponse (saved entry, ranks, fresh boards)
 *   GET    /adventure?limit=20 → AdventureBoard (players by total stars)
 *   POST   /adventure         → ClearResponse; the clear's inputs are replayed first
 *   DELETE /scores/:id        → admin only; needs the ADMIN_TOKEN secret
 *   GET    /healthz
 *
 * Validation and plausibility rules live in shared/scoreRules.ts so the client and the
 * tests use the very same code. They reject impossible results, floods and duplicates;
 * they cannot prove that a possible result was really played.
 *
 * Level clears are stronger: they carry the button presses, and the Worker re-flies them
 * with the game's own deterministic simulation (src/game/replay.ts). Only what the replay
 * achieves is stored.
 */
import { DurableObject } from 'cloudflare:workers';
import { validateClear, verifyClear } from '../../src/game/replay';
import {
  BODY_MAX_BYTES,
  CLEAR_BODY_MAX_BYTES,
  DAY_MS,
  WEEK_MS,
  checkPlausible,
  clampLimit,
  validateSubmission,
  weekStart,
  type Board,
  type AdventureBoard,
  type Boards,
  type ClearResponse,
  type Entry,
  type PlayerEntry,
  type ErrorCode,
  type ErrorResponse,
  type SubmitRequest,
  type SubmitResponse,
} from '../../shared/scoreRules';

export interface Env {
  SCORES: DurableObjectNamespace<Scoreboard>;
  ALLOWED_ORIGINS?: string;
  ALLOW_LOCALHOST?: string;
  ADMIN_TOKEN?: string;
}

/** Submissions allowed per address in a 10 minute window, and per day. */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_PER_WINDOW = 10;
const RATE_PER_DAY = 60;
/** Ceiling on new rows per day from everyone together. */
const INSERTS_PER_DAY = 5000;
/** Level clears per address (joining uploads up to eight at once). */
const CLEAR_RATE_PER_WINDOW = 40;
const CLEAR_RATE_PER_DAY = 400;
/** Ceiling on new adventure players per day. */
const PLAYERS_PER_DAY = 2000;
/** Players kept on the adventure board. */
const KEEP_PLAYERS = 3000;
/** Rows kept: the best of all time, and the best of this week and last week. */
const KEEP_ALL = 1000;
const KEEP_WEEK = 5000;
const PRUNE_ABOVE = 8000;

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'origin', ...extra },
  });
}

function fail(error: ErrorCode, status: number, headers: Record<string, string>, more: Partial<ErrorResponse> = {}): Response {
  const body: ErrorResponse = { ok: false, error, ...more };
  return json(body, status, headers);
}

function isLocalhost(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

/** The request's Origin if it may use this API, else null. */
function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  if (env.ALLOW_LOCALHOST === 'true' && isLocalhost(origin)) return origin;
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function cors(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

/** Rate-limit key for a client address: IPv6 is reduced to its /64 network. */
export function addressKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...new Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < ea.length; i++) diff |= (ea[i] as number) ^ (eb[i % Math.max(1, eb.length)] ?? 0);
  return diff === 0;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = allowedOrigin(req, env);
    const headers = cors(origin);
    try {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, vary: 'origin' } });
      if (url.pathname === '/healthz') return json({ ok: true }, 200, headers);

      const board = env.SCORES.get(env.SCORES.idFromName('global'));

      const del = url.pathname.match(/^\/scores\/(\d{1,15})$/);
      if (del && req.method === 'DELETE') {
        // Not a browser route: no CORS, and it does not exist until a token is configured.
        if (!env.ADMIN_TOKEN) return fail('not-found', 404, {});
        const auth = req.headers.get('authorization') ?? '';
        if (!timingSafeEqual(auth, `Bearer ${env.ADMIN_TOKEN}`)) return fail('origin', 403, {});
        const removed = await board.remove(Number(del[1]));
        return removed ? json({ ok: true }) : fail('not-found', 404, {});
      }

      if (url.pathname === '/adventure') {
        if (req.method === 'GET') {
          if (req.headers.has('origin') && !origin) return fail('origin', 403, {});
          return json(await board.adventure(clampLimit(url.searchParams.get('limit'))), 200, headers);
        }
        if (req.method !== 'POST') return fail('not-found', 405, { ...headers, allow: 'GET, POST, OPTIONS' });
        if (!origin) return fail('origin', 403, {});
        const declared = Number(req.headers.get('content-length') ?? '0');
        if (declared > CLEAR_BODY_MAX_BYTES) return fail('too-large', 413, headers);
        const text = await req.text();
        if (new TextEncoder().encode(text).length > CLEAR_BODY_MAX_BYTES) return fail('too-large', 413, headers);
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return fail('bad-json', 400, headers);
        }
        const checked = validateClear(body);
        if (!checked.ok) return fail('invalid', 400, headers, { field: checked.field });
        const { value } = checked;
        // Re-fly the clear. Only what the replay achieves counts.
        const verdict = verifyClear(value.level, value.bird, checked.logs);
        if (!verdict.ok) {
          console.log(JSON.stringify({ event: 'replay-failed', reason: verdict.reason, level: value.level, bird: value.bird }));
          return fail('implausible', 422, headers);
        }
        const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
        const result = await board.submitClear(
          { pid: await sha256(value.key), name: value.name, level: value.level, bird: value.bird, stars: verdict.stars, coins: verdict.coins },
          addressKey(ip),
          clampLimit(url.searchParams.get('limit')),
        );
        if (result.ok) return json(result, 200, headers);
        if (result.error === 'rate') {
          return fail('rate', 429, { ...headers, 'retry-after': String(result.retryAfter ?? 600) }, { retryAfter: result.retryAfter });
        }
        return fail(result.error, 503, headers);
      }

      if (url.pathname !== '/scores') return fail('not-found', 404, headers);

      if (req.method === 'GET') {
        // Reads are public data. Browsers from other sites are refused; tools without an
        // Origin header (curl, uptime checks) may read.
        if (req.headers.has('origin') && !origin) return fail('origin', 403, {});
        return json(await board.boards(clampLimit(url.searchParams.get('limit'))), 200, headers);
      }

      if (req.method === 'POST') {
        if (!origin) return fail('origin', 403, {});
        const declared = Number(req.headers.get('content-length') ?? '0');
        if (declared > BODY_MAX_BYTES) return fail('too-large', 413, headers);
        const text = await req.text();
        if (new TextEncoder().encode(text).length > BODY_MAX_BYTES) return fail('too-large', 413, headers);
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return fail('bad-json', 400, headers);
        }
        const checked = validateSubmission(body);
        if (!checked.ok) return fail('invalid', 400, headers, { field: checked.field });
        const rule = checkPlausible(checked.value);
        if (rule) {
          console.log(JSON.stringify({ event: 'implausible', rule, score: checked.value.score, secs: checked.value.secs, flaps: checked.value.flaps, bird: checked.value.bird }));
          return fail('implausible', 422, headers);
        }
        const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
        const result = await board.submit(checked.value, addressKey(ip), clampLimit(url.searchParams.get('limit')));
        if (result.ok) return json(result, 200, headers);
        if (result.error === 'rate') {
          return fail('rate', 429, { ...headers, 'retry-after': String(result.retryAfter ?? 600) }, { retryAfter: result.retryAfter });
        }
        return fail(result.error, 503, headers);
      }

      return fail('not-found', 405, { ...headers, allow: 'GET, POST, OPTIONS' });
    } catch (err) {
      console.error(JSON.stringify({ event: 'error', message: err instanceof Error ? err.message : String(err) }));
      return fail('server', 500, headers);
    }
  },
} satisfies ExportedHandler<Env>;

type Row = Record<string, SqlStorageValue>;

function toPlayer(r: Row): PlayerEntry {
  return { id: Number(r.id), name: String(r.name), stars: Number(r.stars), bird: Number(r.bird), at: Number(r.at) };
}

export interface VerifiedClear {
  /** Hash of the player's device key. */
  pid: string;
  name: string;
  level: string;
  bird: number;
  stars: number;
  coins: number;
}

function toEntry(r: Row): Entry {
  return { id: Number(r.id), name: String(r.name), score: Number(r.score), at: Number(r.at), bird: Number(r.bird) };
}

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export class Scoreboard extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        score INTEGER NOT NULL,
        at INTEGER NOT NULL,
        week INTEGER NOT NULL,
        secs INTEGER NOT NULL,
        flaps INTEGER NOT NULL,
        bird INTEGER NOT NULL,
        v INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS scores_all ON scores(score DESC, id);
      CREATE INDEX IF NOT EXISTS scores_week ON scores(week, score DESC, id);
      CREATE TABLE IF NOT EXISTS rate (
        ip TEXT NOT NULL,
        win INTEGER NOT NULL,
        n INTEGER NOT NULL,
        PRIMARY KEY (ip, win)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        stars INTEGER NOT NULL,
        bird INTEGER NOT NULL,
        at INTEGER NOT NULL,
        seen INTEGER NOT NULL,
        joined INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS players_rank ON players(stars DESC, at, id);
      CREATE TABLE IF NOT EXISTS clears (
        pid TEXT NOT NULL,
        level TEXT NOT NULL,
        stars INTEGER NOT NULL,
        coins INTEGER NOT NULL,
        bird INTEGER NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (pid, level)
      ) WITHOUT ROWID;
    `);
  }

  private count(query: string, ...args: SqlStorageValue[]): number {
    return Number(this.sql.exec(query, ...args).one().n);
  }

  private board(limit: number, week: number | null): Board {
    if (week === null) {
      return {
        total: this.count('SELECT COUNT(*) AS n FROM scores'),
        top: this.sql.exec('SELECT id, name, score, at, bird FROM scores ORDER BY score DESC, id LIMIT ?', limit).toArray().map(toEntry),
      };
    }
    return {
      total: this.count('SELECT COUNT(*) AS n FROM scores WHERE week = ?', week),
      top: this.sql.exec('SELECT id, name, score, at, bird FROM scores WHERE week = ? ORDER BY score DESC, id LIMIT ?', week, limit).toArray().map(toEntry),
    };
  }

  async boards(limit: number, now = Date.now()): Promise<Boards> {
    const start = weekStart(now);
    return { now, weekStart: start, weekEnd: start + WEEK_MS, all: this.board(limit, null), week: this.board(limit, start) };
  }

  /** 1-based position; equal scores rank in order of submission. */
  private rank(score: number, id: number, week: number | null): number {
    if (week === null) return 1 + this.count('SELECT COUNT(*) AS n FROM scores WHERE score > ?1 OR (score = ?1 AND id < ?2)', score, id);
    return 1 + this.count('SELECT COUNT(*) AS n FROM scores WHERE week = ?3 AND (score > ?1 OR (score = ?1 AND id < ?2))', score, id, week);
  }

  /** A daily random salt, so stored address hashes cannot be linked across days or reversed by lookup. */
  private salt(day: number): string {
    const key = `salt:${day}`;
    const found = this.sql.exec('SELECT v FROM meta WHERE k = ?', key).toArray()[0];
    if (found) return String(found.v);
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const value = hex(bytes.buffer);
    this.sql.exec("DELETE FROM meta WHERE k LIKE 'salt:%'");
    this.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?)', key, value);
    return value;
  }

  private async respond(row: Row, duplicate: boolean, limit: number, now: number): Promise<SubmitResponse> {
    const entry = toEntry(row);
    const week = Number(row.week);
    return {
      ok: true,
      duplicate,
      entry,
      // A row from an earlier week has no place on the current weekly board.
      rank: { all: this.rank(entry.score, entry.id, null), week: week === weekStart(now) ? this.rank(entry.score, entry.id, week) : 0 },
      boards: await this.boards(limit, now),
    };
  }

  async submit(
    req: SubmitRequest,
    address: string,
    limit: number,
  ): Promise<SubmitResponse | { ok: false; error: 'rate' | 'busy'; retryAfter?: number }> {
    const now = Date.now();

    // The same run again (double click, retry after a lost response): answer with the stored row.
    const existing = this.sql.exec('SELECT * FROM scores WHERE gid = ?', req.gid).toArray()[0];
    if (existing) return this.respond(existing, true, limit, now);

    const day = Math.floor(now / DAY_MS);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${this.salt(day)}|${address}`));
    const ip = hex(digest).slice(0, 16);
    const win = Math.floor(now / RATE_WINDOW_MS);
    const firstWinOfDay = Math.floor((day * DAY_MS) / RATE_WINDOW_MS);
    const inWindow = this.count('SELECT COALESCE(SUM(n), 0) AS n FROM rate WHERE ip = ? AND win = ?', ip, win);
    if (inWindow >= RATE_PER_WINDOW) return { ok: false, error: 'rate', retryAfter: Math.ceil(((win + 1) * RATE_WINDOW_MS - now) / 1000) };
    const inDay = this.count('SELECT COALESCE(SUM(n), 0) AS n FROM rate WHERE ip = ? AND win >= ?', ip, firstWinOfDay);
    if (inDay >= RATE_PER_DAY) return { ok: false, error: 'rate', retryAfter: Math.ceil(((day + 1) * DAY_MS - now) / 1000) };
    if (this.count('SELECT COUNT(*) AS n FROM scores WHERE at >= ?', day * DAY_MS) >= INSERTS_PER_DAY) return { ok: false, error: 'busy' };

    this.sql.exec('INSERT INTO rate (ip, win, n) VALUES (?, ?, 1) ON CONFLICT (ip, win) DO UPDATE SET n = n + 1', ip, win);
    const row = this.sql
      .exec(
        'INSERT INTO scores (gid, name, score, at, week, secs, flaps, bird, v) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
        req.gid,
        req.name,
        req.score,
        now,
        weekStart(now),
        req.secs,
        req.flaps,
        req.bird,
        req.v,
      )
      .one();

    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + DAY_MS);
    if (this.count('SELECT COUNT(*) AS n FROM scores') > PRUNE_ABOVE) this.prune(now);
    return this.respond(row, false, limit, now);
  }

  // ---- Adventure board ----

  async adventure(limit: number, now = Date.now()): Promise<AdventureBoard> {
    return {
      now,
      total: this.count('SELECT COUNT(*) AS n FROM players'),
      top: this.sql.exec('SELECT id, name, stars, bird, at FROM players ORDER BY stars DESC, at, id LIMIT ?', limit).toArray().map(toPlayer),
    };
  }

  /** 1-based position: more stars first, then whoever reached that total first. */
  private playerRank(p: PlayerEntry): number {
    return 1 + this.count('SELECT COUNT(*) AS n FROM players WHERE stars > ?1 OR (stars = ?1 AND (at < ?2 OR (at = ?2 AND id < ?3)))', p.stars, p.at, p.id);
  }

  /** Rate limit shared by the window and the day; returns seconds to wait, or 0. */
  private async limited(address: string, tag: string, perWindow: number, perDay: number, now: number): Promise<number> {
    const day = Math.floor(now / DAY_MS);
    const ip = (await sha256(`${this.salt(day)}|${address}|${tag}`)).slice(0, 16);
    const win = Math.floor(now / RATE_WINDOW_MS);
    const firstWinOfDay = Math.floor((day * DAY_MS) / RATE_WINDOW_MS);
    if (this.count('SELECT COALESCE(SUM(n), 0) AS n FROM rate WHERE ip = ? AND win = ?', ip, win) >= perWindow) return Math.ceil(((win + 1) * RATE_WINDOW_MS - now) / 1000);
    if (this.count('SELECT COALESCE(SUM(n), 0) AS n FROM rate WHERE ip = ? AND win >= ?', ip, firstWinOfDay) >= perDay) return Math.ceil(((day + 1) * DAY_MS - now) / 1000);
    this.sql.exec('INSERT INTO rate (ip, win, n) VALUES (?, ?, 1) ON CONFLICT (ip, win) DO UPDATE SET n = n + 1', ip, win);
    return 0;
  }

  async submitClear(c: VerifiedClear, address: string, limit: number): Promise<ClearResponse | { ok: false; error: 'rate' | 'busy'; retryAfter?: number }> {
    const now = Date.now();
    const wait = await this.limited(address, 'clear', CLEAR_RATE_PER_WINDOW, CLEAR_RATE_PER_DAY, now);
    if (wait) return { ok: false, error: 'rate', retryAfter: wait };

    let player = this.sql.exec('SELECT * FROM players WHERE pid = ?', c.pid).toArray()[0];
    if (!player) {
      const day = Math.floor(now / DAY_MS);
      if (this.count('SELECT COUNT(*) AS n FROM players WHERE joined >= ?', day * DAY_MS) >= PLAYERS_PER_DAY) {
        return { ok: false, error: 'busy' };
      }
    }

    // Keep the best clear of each level: more stars, then more coins.
    const old = this.sql.exec('SELECT stars, coins FROM clears WHERE pid = ? AND level = ?', c.pid, c.level).toArray()[0];
    const improved = !old || c.stars > Number(old.stars) || (c.stars === Number(old.stars) && c.coins > Number(old.coins));
    if (improved) {
      this.sql.exec(
        'INSERT INTO clears (pid, level, stars, coins, bird, at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (pid, level) DO UPDATE SET stars = excluded.stars, coins = excluded.coins, bird = excluded.bird, at = excluded.at',
        c.pid,
        c.level,
        c.stars,
        c.coins,
        c.bird,
        now,
      );
    }
    const total = this.count('SELECT COALESCE(SUM(stars), 0) AS n FROM clears WHERE pid = ?', c.pid);
    if (!player) {
      this.sql.exec('INSERT INTO players (pid, name, stars, bird, at, seen, joined) VALUES (?, ?, ?, ?, ?, ?, ?)', c.pid, c.name, total, c.bird, now, now, now);
    } else if (total > Number(player.stars)) {
      this.sql.exec('UPDATE players SET name = ?, stars = ?, bird = ?, at = ?, seen = ? WHERE pid = ?', c.name, total, c.bird, now, now, c.pid);
    } else {
      this.sql.exec('UPDATE players SET name = ?, seen = ? WHERE pid = ?', c.name, now, c.pid);
    }
    player = this.sql.exec('SELECT id, name, stars, bird, at FROM players WHERE pid = ?', c.pid).one();
    const entry = toPlayer(player);
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(now + DAY_MS);
    const best = this.sql.exec('SELECT stars, coins FROM clears WHERE pid = ? AND level = ?', c.pid, c.level).one();
    return {
      ok: true,
      level: { id: c.level, stars: Number(best.stars), coins: Number(best.coins), improved },
      player: { ...entry, rank: this.playerRank(entry) },
      board: await this.adventure(limit, now),
    };
  }

  async remove(id: number): Promise<boolean> {
    const before = this.count('SELECT COUNT(*) AS n FROM scores WHERE id = ?', id);
    if (before === 0) return false;
    this.sql.exec('DELETE FROM scores WHERE id = ?', id);
    console.log(JSON.stringify({ event: 'removed', id }));
    return true;
  }

  /** Keep the all-time best plus the best of this week and last week; forget old address hashes. */
  private prune(now: number): void {
    const thisWeek = weekStart(now);
    const lastWeek = thisWeek - WEEK_MS;
    this.sql.exec(
      `DELETE FROM scores WHERE id NOT IN (
         SELECT id FROM (SELECT id FROM scores ORDER BY score DESC, id LIMIT ?1)
         UNION SELECT id FROM (SELECT id FROM scores WHERE week = ?3 ORDER BY score DESC, id LIMIT ?2)
         UNION SELECT id FROM (SELECT id FROM scores WHERE week = ?4 ORDER BY score DESC, id LIMIT ?2)
       )`,
      KEEP_ALL,
      KEEP_WEEK,
      thisWeek,
      lastWeek,
    );
    this.sql.exec('DELETE FROM rate WHERE win < ?', Math.floor((now - DAY_MS) / RATE_WINDOW_MS));
    // Adventure: keep the best players and their clears.
    if (this.count('SELECT COUNT(*) AS n FROM players') > KEEP_PLAYERS) {
      this.sql.exec('DELETE FROM players WHERE id NOT IN (SELECT id FROM players ORDER BY stars DESC, at, id LIMIT ?)', KEEP_PLAYERS);
      this.sql.exec('DELETE FROM clears WHERE pid NOT IN (SELECT pid FROM players)');
    }
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    this.prune(now);
    await this.ctx.storage.setAlarm(now + DAY_MS);
  }
}
