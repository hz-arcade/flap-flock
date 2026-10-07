import { BIRDS, BIRD_ORDER, type BirdId } from './birds';
import { LEVELS, WORLD_COUNT, type LevelDef } from './levels';
import type { ClearResult } from './Run';

/** Minimal localStorage shape, so tests can pass an in-memory store. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LevelRecord {
  stars: 1 | 2 | 3;
  /** Most coins collected in one clear. */
  coins: number;
  /** Fastest clear, seconds. */
  time: number;
}

interface ProgressData {
  v: 1;
  levels: Record<string, LevelRecord>;
}

interface EndlessData {
  best: number;
  byBird: Partial<Record<BirdId, number>>;
}

export const KEYS = {
  progress: 'flap-flock.progress',
  endless: 'flap-flock.endless',
  bird: 'flap-flock.bird',
} as const;

export interface ClearOutcome {
  /** The level had not been cleared before. */
  first: boolean;
  /** Stars, coins or time improved. */
  improved: boolean;
  /** Birds this clear unlocked. */
  newBirds: BirdId[];
  /** The level this clear opened, if it was closed before. */
  opened: LevelDef | null;
}

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

function defaultStore(): KeyValueStore {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* storage blocked */
  }
  return memoryStore();
}

function isRecord(v: unknown): v is LevelRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (r.stars === 1 || r.stars === 2 || r.stars === 3) && typeof r.coins === 'number' && typeof r.time === 'number';
}

/**
 * Saved progress: best result per level and best endless scores. Unlocks are derived from
 * the results rather than stored, so they can never disagree with them.
 */
export class Progress {
  private data: ProgressData = { v: 1, levels: {} };
  private endless: EndlessData = { best: 0, byBird: {} };
  private birdId: BirdId = 'duck';
  /** Testing aid (?unlock=all): everything open, nothing saved differently. */
  allOpen = false;

  constructor(private store: KeyValueStore = defaultStore()) {
    this.load();
  }

  private read(key: string): unknown {
    try {
      const raw = this.store.getItem(key);
      return raw ? (JSON.parse(raw) as unknown) : null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.store.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    } catch {
      /* storage full or blocked: progress lives for this session only */
    }
  }

  private load(): void {
    const p = this.read(KEYS.progress);
    if (p && typeof p === 'object' && (p as ProgressData).v === 1 && typeof (p as ProgressData).levels === 'object') {
      for (const [id, rec] of Object.entries((p as ProgressData).levels ?? {})) {
        if (LEVELS.some((l) => l.id === id) && isRecord(rec)) this.data.levels[id] = { stars: rec.stars, coins: rec.coins, time: rec.time };
      }
    }
    const e = this.read(KEYS.endless);
    if (e && typeof e === 'object') {
      const best = (e as EndlessData).best;
      if (typeof best === 'number' && best >= 0) this.endless.best = Math.floor(best);
      const by = (e as EndlessData).byBird;
      if (by && typeof by === 'object') {
        for (const id of BIRD_ORDER) {
          const v = by[id];
          if (typeof v === 'number' && v >= 0) this.endless.byBird[id] = Math.floor(v);
        }
      }
    }
    try {
      const b = this.store.getItem(KEYS.bird);
      if (b && (BIRD_ORDER as readonly string[]).includes(b)) this.birdId = b as BirdId;
    } catch {
      /* ignore */
    }
    if (!this.isBirdOpen(this.birdId)) this.birdId = 'duck';
  }

  get bird(): BirdId {
    return this.birdId;
  }

  setBird(id: BirdId): boolean {
    if (!this.isBirdOpen(id)) return false;
    this.birdId = id;
    this.write(KEYS.bird, id);
    return true;
  }

  level(id: string): LevelRecord | null {
    return this.data.levels[id] ?? null;
  }

  isCleared(id: string): boolean {
    return id in this.data.levels;
  }

  isLevelOpen(id: string): boolean {
    if (this.allOpen) return true;
    const i = LEVELS.findIndex((l) => l.id === id);
    if (i < 0) return false;
    return i === 0 || this.isCleared(LEVELS[i - 1]!.id);
  }

  worldCleared(world: number): boolean {
    const levels = LEVELS.filter((l) => l.world === world);
    return levels.length > 0 && levels.every((l) => this.isCleared(l.id));
  }

  isBirdOpen(id: BirdId): boolean {
    if (this.allOpen) return true;
    const w = BIRDS[id].unlockWorld;
    return w === 0 || this.worldCleared(w);
  }

  /** The first level not yet cleared (or the last level when all are). */
  get frontier(): LevelDef {
    return LEVELS.find((l) => !this.isCleared(l.id)) ?? LEVELS[LEVELS.length - 1]!;
  }

  get totalStars(): number {
    return Object.values(this.data.levels).reduce((s, r) => s + r.stars, 0);
  }

  get allCleared(): boolean {
    return LEVELS.every((l) => this.isCleared(l.id));
  }

  record(result: ClearResult): ClearOutcome {
    const birdsBefore = BIRD_ORDER.filter((b) => this.isBirdOpen(b));
    const idx = LEVELS.findIndex((l) => l.id === result.levelId);
    const next = LEVELS[idx + 1] ?? null;
    const wasOpen = next ? this.isLevelOpen(next.id) : true;
    const old = this.data.levels[result.levelId];
    const merged: LevelRecord = old
      ? { stars: Math.max(old.stars, result.stars) as 1 | 2 | 3, coins: Math.max(old.coins, result.coins), time: Math.min(old.time, result.time) }
      : { stars: result.stars, coins: result.coins, time: result.time };
    const improved = !old || merged.stars > old.stars || merged.coins > old.coins || merged.time < old.time;
    this.data.levels[result.levelId] = merged;
    this.write(KEYS.progress, this.data);
    return {
      first: !old,
      improved,
      newBirds: BIRD_ORDER.filter((b) => this.isBirdOpen(b) && !birdsBefore.includes(b)),
      opened: next && !wasOpen && this.isLevelOpen(next.id) ? next : null,
    };
  }

  get endlessBest(): number {
    return this.endless.best;
  }

  endlessBestFor(id: BirdId): number {
    return this.endless.byBird[id] ?? 0;
  }

  /** Returns true when this is a new overall best. */
  recordEndless(bird: BirdId, score: number): boolean {
    const isBest = score > this.endless.best;
    if (isBest) this.endless.best = score;
    if (score > (this.endless.byBird[bird] ?? 0)) this.endless.byBird[bird] = score;
    this.write(KEYS.endless, this.endless);
    return isBest;
  }
}

export const WORLDS = Array.from({ length: WORLD_COUNT }, (_, i) => i + 1);
