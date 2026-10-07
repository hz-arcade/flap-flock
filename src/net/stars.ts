import type { InputSegment } from '../../shared/scoreRules';
import { LEVELS } from '../game/levels';
import { newGameId, type KeyValueStore } from './leaderboard';

/**
 * What this device keeps for the Adventure board: a random secret key (the server only ever
 * stores its hash, so it can tell a returning player without knowing who they are), whether
 * the player chose to be on the board, and the best recorded clear of each level, which is
 * what the server replays.
 */
export interface StoredClear {
  bird: number;
  stars: number;
  coins: number;
  segs: InputSegment[];
  /** Confirmed by the server (or refused for good). */
  sent: boolean;
}

export interface PlayerState {
  key: string;
  joined: boolean;
  /** Public row id, to highlight it on the board. */
  id: number | null;
  stars: number;
  rank: number;
}

const PLAYER_KEY = 'flap-flock.player';
const CLEARS_KEY = 'flap-flock.replays';

function deviceStore(): KeyValueStore | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* storage blocked */
  }
  return null;
}

function isClear(v: unknown): v is StoredClear {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return Number.isInteger(c.bird) && Number.isInteger(c.stars) && Number.isInteger(c.coins) && Array.isArray(c.segs) && typeof c.sent === 'boolean';
}

export class StarsStore {
  private memory = new Map<string, string>();

  constructor(private store: KeyValueStore | null = deviceStore()) {}

  private read(k: string): unknown {
    try {
      const raw = this.store ? this.store.getItem(k) : (this.memory.get(k) ?? null);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  private write(k: string, v: unknown): void {
    const raw = JSON.stringify(v);
    try {
      if (this.store) this.store.setItem(k, raw);
      else this.memory.set(k, raw);
    } catch {
      this.memory.set(k, raw);
    }
  }

  player(): PlayerState {
    const p = this.read(PLAYER_KEY) as Partial<PlayerState> | null;
    if (p && typeof p.key === 'string' && /^[0-9a-f-]{36}$/i.test(p.key)) {
      return { key: p.key, joined: p.joined === true, id: Number.isInteger(p.id) ? (p.id as number) : null, stars: Number(p.stars) || 0, rank: Number(p.rank) || 0 };
    }
    const fresh: PlayerState = { key: newGameId(), joined: false, id: null, stars: 0, rank: 0 };
    this.write(PLAYER_KEY, fresh);
    return fresh;
  }

  updatePlayer(change: Partial<PlayerState>): PlayerState {
    const p = { ...this.player(), ...change };
    this.write(PLAYER_KEY, p);
    return p;
  }

  clears(): Record<string, StoredClear> {
    const raw = this.read(CLEARS_KEY);
    const out: Record<string, StoredClear> = {};
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (LEVELS.some((l) => l.id === k) && isClear(v)) out[k] = v;
    }
    return out;
  }

  /** Keep a clear if it beats the stored one (stars, then coins). Returns true when kept. */
  offer(level: string, c: Omit<StoredClear, 'sent'>): boolean {
    const all = this.clears();
    const old = all[level];
    if (old && (old.stars > c.stars || (old.stars === c.stars && old.coins >= c.coins))) return false;
    all[level] = { ...c, sent: false };
    this.write(CLEARS_KEY, all);
    return true;
  }

  markSent(level: string): void {
    const all = this.clears();
    const c = all[level];
    if (!c) return;
    c.sent = true;
    this.write(CLEARS_KEY, all);
  }

  /** Levels whose best clear the server has not confirmed yet, in level order. */
  pending(): string[] {
    const all = this.clears();
    return LEVELS.map((l) => l.id).filter((id) => all[id] && !all[id]!.sent);
  }
}
