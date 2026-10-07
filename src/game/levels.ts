import type { Medium } from './birds';

export type ThemeId = 'grass' | 'cave' | 'water' | 'snow' | 'sky' | 'desert' | 'castle';
export type SongId = 'grass' | 'cave' | 'airy' | 'castle';
export type HazardKind = 'urchin' | 'cannon' | 'lava' | 'wheel';

export interface HazardSpec {
  kind: HazardKind;
  count: number;
}

export interface LevelDef {
  id: string;
  world: 1 | 2 | 3 | 4;
  index: 1 | 2;
  theme: ThemeId;
  song: SongId;
  /** Layout seed: the same level is the same every try. */
  seed: number;
  /** Scroll speed, px/s. */
  speed: number;
  pipes: number;
  /** Vertical opening between the lips, px. */
  gap: number;
  /** Horizontal distance between pipes, px. */
  pitch: number;
  /** Largest change of gap centre from one pipe to the next. */
  maxDelta: number;
  /** Range of the gap centre. */
  centerMin: number;
  centerMax: number;
  /** Pipes that slide up and down (never among the first three). */
  movers?: { count: number; amp: number; period: number };
  hazards?: HazardSpec[];
  /** Water currents: corridors that carry the bird up or down at `drift` px/s. */
  currents?: { bands: number; drift: number };
  coins: number;
  medium: Medium;
  /** A flag halfway: after a crash the level restarts from there. */
  checkpoint: boolean;
}

export const LEVELS: readonly LevelDef[] = [
  { id: '1-1', world: 1, index: 1, theme: 'grass', song: 'grass', seed: 0x11, speed: 52, pipes: 9, gap: 134, pitch: 156, maxDelta: 16, centerMin: 96, centerMax: 128, coins: 11, medium: 'air', checkpoint: false },
  { id: '1-2', world: 1, index: 2, theme: 'grass', song: 'grass', seed: 0x12, speed: 58, pipes: 14, gap: 100, pitch: 144, maxDelta: 32, centerMin: 76, centerMax: 148, coins: 16, medium: 'air', checkpoint: false },
  { id: '2-1', world: 2, index: 1, theme: 'cave', song: 'cave', seed: 0x21, speed: 62, pipes: 16, gap: 90, pitch: 136, maxDelta: 40, centerMin: 68, centerMax: 156, movers: { count: 3, amp: 10, period: 3 }, coins: 18, medium: 'air', checkpoint: false },
  { id: '2-2', world: 2, index: 2, theme: 'water', song: 'cave', seed: 0x22, speed: 54, pipes: 16, gap: 88, pitch: 140, maxDelta: 44, centerMin: 64, centerMax: 160, hazards: [{ kind: 'urchin', count: 2 }], currents: { bands: 6, drift: 66 }, coins: 18, medium: 'water', checkpoint: false },
  { id: '3-1', world: 3, index: 1, theme: 'snow', song: 'airy', seed: 0x31, speed: 66, pipes: 18, gap: 84, pitch: 132, maxDelta: 48, centerMin: 60, centerMax: 164, movers: { count: 5, amp: 12, period: 3 }, coins: 20, medium: 'air', checkpoint: true },
  { id: '3-2', world: 3, index: 2, theme: 'sky', song: 'airy', seed: 0x32, speed: 70, pipes: 20, gap: 82, pitch: 132, maxDelta: 52, centerMin: 58, centerMax: 166, movers: { count: 8, amp: 18, period: 2.6 }, coins: 22, medium: 'air', checkpoint: true },
  { id: '4-1', world: 4, index: 1, theme: 'desert', song: 'castle', seed: 0x41, speed: 74, pipes: 22, gap: 78, pitch: 130, maxDelta: 56, centerMin: 56, centerMax: 168, movers: { count: 4, amp: 12, period: 3 }, hazards: [{ kind: 'cannon', count: 4 }], coins: 22, medium: 'air', checkpoint: true },
  { id: '4-2', world: 4, index: 2, theme: 'castle', song: 'castle', seed: 0x42, speed: 78, pipes: 24, gap: 76, pitch: 136, maxDelta: 60, centerMin: 56, centerMax: 168, movers: { count: 6, amp: 14, period: 2.8 }, hazards: [{ kind: 'wheel', count: 4 }, { kind: 'lava', count: 3 }, { kind: 'cannon', count: 2 }], coins: 24, medium: 'air', checkpoint: true },
];

export const WORLD_COUNT = 4;

export function levelById(id: string): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

export function nextLevel(id: string): LevelDef | undefined {
  const i = LEVELS.findIndex((l) => l.id === id);
  return i >= 0 ? LEVELS[i + 1] : undefined;
}

/** Endless mode rotates through these, one every ENDLESS_THEME_EVERY pipes. */
export const ENDLESS_THEMES: readonly ThemeId[] = ['grass', 'cave', 'snow', 'sky', 'desert', 'castle'];
export const ENDLESS_THEME_EVERY = 20;
export const THEME_SONG: Record<ThemeId, SongId> = { grass: 'grass', cave: 'cave', water: 'cave', snow: 'airy', sky: 'airy', desert: 'castle', castle: 'castle' };

export function endlessTheme(passed: number): ThemeId {
  return ENDLESS_THEMES[Math.floor(passed / ENDLESS_THEME_EVERY) % ENDLESS_THEMES.length] as ThemeId;
}
