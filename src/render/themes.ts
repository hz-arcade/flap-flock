import type { ThemeId } from '../game/levels';
import type { Pix } from './pixel';
import * as S from './sprites/scenery';

/** A row of repeating background decorations, scrolled at `k` × the camera speed. */
export interface LayerSpec {
  k: number;
  spacing: number;
  items: Pix[];
  /** ground: stands on the ground line; sky: hangs at band y; top: hangs from the top of the view. */
  anchor: 'ground' | 'sky' | 'top';
  y: number;
  yJitter: number;
  jitter: number;
  /** Animated items: frames cycle at this rate (per second). */
  fps?: number;
  frames?: Pix[][];
}

export type Ambient = 'none' | 'snow' | 'stars' | 'bubbles' | 'embers';

export interface ThemeSpec {
  id: ThemeId;
  /** Sky colours from the top of the band down to the horizon (equal bands). */
  sky: string[];
  /** Colour above the band on tall screens. */
  above: string;
  layers: LayerSpec[];
  ground: S.GroundKind;
  pipe: S.PipeColors;
  ambient: Ambient;
  /** Brick wall behind everything (castle). */
  wall?: { stone: string; mortar: string; light: string };
  /** Castle at the goal. */
  castle: { stone: string; mortar: string };
}

const K = '#000000';
const W = '#fcfcfc';

const GREEN_PIPE: S.PipeColors = { light: '#b8f818', base: '#00a800', dark: '#005800', line: K };
const STONE_CASTLE = { stone: '#c84c0c', mortar: '#000000' };

export function themeSpec(id: ThemeId): ThemeSpec {
  switch (id) {
    case 'grass':
      return {
        id,
        sky: ['#5c94fc'],
        above: '#5c94fc',
        layers: [
          { k: 0.12, spacing: 170, anchor: 'sky', y: 18, yJitter: 46, jitter: 50, items: [S.puffs(30, 12, W, '#a4e4fc', K, false), S.puffs(46, 14, W, '#a4e4fc', K, false), S.puffs(22, 10, W, '#a4e4fc', K, false)] },
          { k: 0.3, spacing: 230, anchor: 'ground', y: 0, yJitter: 0, jitter: 60, items: [S.hill(84, 38, '#00a800', '#005800', K), S.hill(52, 24, '#00a800', '#005800', K)] },
          { k: 0.6, spacing: 190, anchor: 'ground', y: 0, yJitter: 0, jitter: 70, items: [S.puffs(34, 12, '#58d854', '#00a800', K), S.puffs(50, 14, '#58d854', '#00a800', K), S.puffs(22, 10, '#58d854', '#00a800', K)] },
        ],
        ground: 'grass',
        pipe: GREEN_PIPE,
        ambient: 'none',
        castle: STONE_CASTLE,
      };
    case 'cave':
      return {
        id,
        sky: ['#000000'],
        above: '#000000',
        layers: [
          { k: 0.25, spacing: 150, anchor: 'ground', y: 0, yJitter: 0, jitter: 40, items: [S.mountain(70, 50, '#101848', '#1c2c78'), S.mountain(46, 30, '#101848', '#1c2c78')] },
          { k: 0.5, spacing: 70, anchor: 'top', y: 0, yJitter: 0, jitter: 24, items: [S.stalactite(26, '#3c5cb8', '#7c9cf8'), S.stalactite(16, '#3c5cb8', '#7c9cf8'), S.stalactite(36, '#3c5cb8', '#7c9cf8')] },
        ],
        ground: 'cave',
        pipe: GREEN_PIPE,
        ambient: 'none',
        castle: { stone: '#3c5cb8', mortar: '#101848' },
      };
    case 'water':
      return {
        id,
        sky: ['#3c5cfc', '#2c48e8', '#2038d8', '#1830c0'],
        above: '#3c5cfc',
        layers: [
          { k: 0.25, spacing: 160, anchor: 'ground', y: 0, yJitter: 0, jitter: 40, items: [S.mountain(80, 46, '#1828a0', '#2038d8'), S.mountain(50, 28, '#1828a0', '#2038d8')] },
          {
            k: 0.6,
            spacing: 90,
            anchor: 'ground',
            y: 0,
            yJitter: 0,
            jitter: 30,
            items: [S.seaweed(34, 0), S.coral(), S.seaweed(22, 0)],
            fps: 2,
            frames: [0, 1, 2, 3].map((f) => [S.seaweed(34, f), S.coral(), S.seaweed(22, f)]),
          },
        ],
        ground: 'water',
        pipe: { light: '#f8b8f8', base: '#f85898', dark: '#a80020', line: K },
        ambient: 'bubbles',
        castle: { stone: '#f0d0b0', mortar: '#a07040' },
      };
    case 'snow':
      return {
        id,
        sky: ['#0c1040', '#101850', '#18205c', '#202c70', '#283c88'],
        above: '#0c1040',
        layers: [
          { k: 0.15, spacing: 140, anchor: 'ground', y: 0, yJitter: 0, jitter: 50, items: [S.mountain(110, 80, '#3c4878', W), S.mountain(70, 52, '#3c4878', W)] },
          { k: 0.55, spacing: 64, anchor: 'ground', y: 0, yJitter: 0, jitter: 26, items: [S.pine(40, '#005800', W, '#503000'), S.pine(28, '#005800', W, '#503000'), S.pine(52, '#005800', W, '#503000')] },
        ],
        ground: 'snow',
        pipe: { light: '#b8f8d8', base: '#00a888', dark: '#004058', line: K, cap: W },
        ambient: 'snow',
        castle: { stone: '#bcbcbc', mortar: '#3c4878' },
      };
    case 'sky':
      return {
        id,
        sky: ['#6888fc', '#7ca4fc', '#a4c8fc', '#c8e0fc'],
        above: '#6888fc',
        layers: [
          { k: 0.1, spacing: 130, anchor: 'sky', y: 10, yJitter: 60, jitter: 40, items: [S.puffs(60, 22, W, '#d8e8fc', '#a4c4fc', false), S.puffs(40, 16, W, '#d8e8fc', '#a4c4fc', false)] },
          { k: 0.45, spacing: 150, anchor: 'sky', y: 110, yJitter: 80, jitter: 60, items: [S.puffs(36, 12, W, '#d8e8fc', K, false), S.puffs(24, 10, W, '#d8e8fc', K, false)] },
        ],
        ground: 'sky',
        pipe: { light: '#d8f8f0', base: '#58f898', dark: '#00a844', line: K },
        ambient: 'none',
        castle: { stone: '#fcfcfc', mortar: '#a4c4fc' },
      };
    case 'desert':
      return {
        id,
        sky: ['#c84c78', '#f87858', '#fca044', '#fcc878', '#fce0a8'],
        above: '#c84c78',
        layers: [
          { k: 0.2, spacing: 170, anchor: 'ground', y: 0, yJitter: 0, jitter: 50, items: [S.dune(120, 34), S.dune(80, 22)] },
          { k: 0.6, spacing: 140, anchor: 'ground', y: 0, yJitter: 0, jitter: 60, items: [S.cactus(26), S.cactus(18)] },
        ],
        ground: 'desert',
        pipe: { light: '#fce0a8', base: '#d88038', dark: '#a04000', line: K },
        ambient: 'none',
        castle: { stone: '#e45c10', mortar: '#881400' },
      };
    case 'castle':
      return {
        id,
        sky: ['#202020'],
        above: '#202020',
        wall: { stone: '#383838', mortar: '#202020', light: '#505050' },
        layers: [{ k: 0.5, spacing: 96, anchor: 'sky', y: 70, yJitter: 0, jitter: 0, items: [S.castleWindow()] }],
        ground: 'castle',
        pipe: { light: '#fcfcfc', base: '#bcbcbc', dark: '#7c7c7c', line: K },
        ambient: 'embers',
        castle: { stone: '#7c7c7c', mortar: '#383838' },
      };
  }
}

export const THEME_IDS: readonly ThemeId[] = ['grass', 'cave', 'water', 'snow', 'sky', 'desert', 'castle'];
