import type { BirdId } from '../../game/birds';
import { Pix } from '../pixel';

export type Wing = 'up' | 'mid' | 'down';
type Pt = readonly [number, number];

const K = '#000000';
const W = '#fcfcfc';

interface BirdArt {
  w: number;
  h: number;
  /** Hitbox centre in sprite pixels. */
  ax: number;
  ay: number;
  body(p: Pix): void;
  wing: Record<Wing, readonly Pt[]>;
  wingFill: string;
  wingLine: string;
  /** Eye: white pixels, then the pupil. */
  eye: { white: readonly Pt[]; pupil: Pt };
}

/** Shaded blob: the shade colour shows along the lower right edge. */
function blob(p: Pix, cx: number, cy: number, rx: number, ry: number, c: string, shade: string): void {
  p.ellipse(cx + 0.4, cy + 0.4, rx, ry, shade);
  p.ellipse(cx, cy, rx - 0.3, ry - 0.3, c);
}

const ART: Record<BirdId, BirdArt> = {
  duck: {
    w: 24,
    h: 18,
    ax: 11,
    ay: 10,
    body(p) {
      const Y = '#f8d830';
      const S = '#d89000';
      p.poly([[1.5, 8], [6, 8.5], [6, 12.5], [2.5, 11]], Y);
      blob(p, 10, 11, 7, 4.6, Y, S);
      p.ellipse(14, 8.5, 2.6, 2.6, Y);
      blob(p, 16.2, 6.2, 3.8, 3.8, Y, S);
      p.poly([[19, 5.6], [23.4, 6.4], [23.4, 8.2], [19, 9.2]], '#f87818');
      p.line(19, 8, 22, 8, '#c84800');
      p.outline(K);
    },
    wing: {
      mid: [[4.5, 10], [11, 9.2], [12.5, 11.2], [10, 13.4], [5, 12.6]],
      up: [[5, 10.5], [11.5, 10.5], [10.5, 6.5], [9.5, 2.6], [8.2, 4.6], [7, 3.4], [5.6, 6]],
      down: [[5, 10.5], [11.5, 10.5], [11, 13.5], [10, 17], [8.8, 15], [7.4, 16.4], [5.6, 13]],
    },
    wingFill: '#fce0a8',
    wingLine: '#c88000',
    eye: { white: [[16, 4], [17, 4], [16, 5]], pupil: [17, 5] },
  },
  chicken: {
    w: 24,
    h: 20,
    ax: 11,
    ay: 12,
    body(p) {
      const C = '#fcfcfc';
      const S = '#bcbcbc';
      const R = '#e40058';
      p.poly([[1, 5], [6, 9], [6, 14], [2.5, 13]], C);
      p.poly([[0.5, 7.5], [4, 9], [3, 11.5]], S);
      blob(p, 10, 12.4, 7.4, 5.2, C, S);
      blob(p, 16.2, 7.4, 3.8, 3.8, C, S);
      p.disc(14.6, 3.6, 1.4, R).disc(16.6, 3, 1.5, R).disc(18.4, 3.9, 1.2, R);
      p.poly([[19.4, 6.4], [23, 7.9], [19.4, 9.4]], '#f8b800');
      p.ellipse(19.4, 10.6, 0.9, 1.5, R);
      p.outline(K);
    },
    wing: {
      mid: [[4.5, 11], [11.5, 10], [13, 12.5], [10, 15], [5, 14]],
      up: [[5, 11.5], [12, 11.5], [11, 7], [10, 3], [8.6, 5.2], [7.2, 3.8], [5.6, 6.6]],
      down: [[5, 11.5], [12, 11.5], [11.5, 14.5], [10.5, 18.6], [9, 16.4], [7.6, 17.8], [5.6, 14]],
    },
    wingFill: '#e0e0e0',
    wingLine: '#7c7c7c',
    eye: { white: [[16, 6]], pupil: [17, 6] },
  },
  pelican: {
    w: 30,
    h: 20,
    ax: 12,
    ay: 11,
    body(p) {
      const C = '#f0f0f0';
      const S = '#a4a4a4';
      p.poly([[1, 9.5], [6, 9], [6, 13.5], [1.5, 13]], S);
      blob(p, 10.5, 12, 8, 4.6, C, S);
      p.ellipse(15.5, 8.6, 2.4, 3.2, C);
      blob(p, 17, 5.6, 3.2, 3.2, C, S);
      p.poly([[18.5, 4.2], [28.6, 5.8], [28.6, 7], [18.5, 7]], '#f8b800');
      p.poly([[18.5, 7], [28.4, 7], [25, 10.6], [19.5, 10.6]], '#fca044');
      p.line(19, 7, 27, 7, '#c84800');
      p.outline(K);
    },
    wing: {
      mid: [[3.5, 10.5], [13.5, 9.5], [15, 12], [11.5, 14.6], [4, 13.6]],
      up: [[4.5, 11], [13, 11], [11.5, 6], [9.5, 0.6], [8, 3], [6.4, 1.4], [4.4, 5]],
      down: [[4.5, 11.5], [13, 11.5], [12.5, 15], [11, 19.6], [9.4, 17], [7.6, 19], [5, 15]],
    },
    wingFill: '#bcbcbc',
    wingLine: '#585858',
    eye: { white: [], pupil: [18, 4] },
  },
  sparrow: {
    w: 18,
    h: 14,
    ax: 8,
    ay: 8,
    body(p) {
      const B = '#c07830';
      const S = '#884818';
      p.poly([[0.5, 5.5], [4.5, 7], [4.5, 9.5], [0.5, 9.5]], S);
      blob(p, 7.8, 8.2, 4.9, 3.5, B, S);
      p.ellipse(8.8, 9.6, 3.4, 1.8, '#f0d0b0');
      blob(p, 12, 5, 2.9, 2.9, B, S);
      p.ellipse(11.6, 3.6, 2.4, 1.4, '#6c3008');
      p.set(12, 6, W).set(13, 6, W);
      p.poly([[14.4, 4.2], [16.8, 5.1], [14.4, 6.1]], '#383838');
      p.outline(K);
    },
    wing: {
      mid: [[3.5, 8], [9.5, 7], [10.5, 9], [5, 10.4]],
      up: [[4, 8.2], [9.5, 8.2], [8.6, 4.6], [7.6, 1.4], [6.6, 3], [5.4, 2], [4.2, 4.6]],
      down: [[4, 8.8], [9.5, 8.8], [9, 11], [8.4, 13.6], [7.4, 12], [6.2, 13.2], [4.6, 10.8]],
    },
    wingFill: '#a05820',
    wingLine: '#3c1c00',
    eye: { white: [], pupil: [13, 4] },
  },
  penguin: {
    w: 20,
    h: 20,
    ax: 10,
    ay: 10,
    body(p) {
      const D = '#3c4868';
      const S = '#202838';
      p.poly([[2.5, 14], [5.5, 12.5], [5.5, 16.5]], S);
      blob(p, 9.6, 10.6, 6.2, 6.6, D, S);
      blob(p, 13, 5.2, 3.6, 3.6, D, S);
      p.ellipse(11.2, 11.8, 3.9, 4.9, W);
      p.ellipse(14.3, 6.2, 1.6, 1.4, W);
      p.poly([[16.2, 4.8], [19.4, 5.9], [16.2, 7]], '#f87818');
      p.rect(8, 17, 2, 1, '#f87818').rect(11, 17, 2, 1, '#f87818');
      p.outline(K);
    },
    wing: {
      mid: [[4.5, 10], [10, 10], [9, 13.4], [5, 12.6]],
      up: [[5, 10.4], [9.5, 10.4], [7, 4], [4, 6]],
      down: [[5, 11], [9.5, 11], [8.5, 16.4], [5, 15.4]],
    },
    wingFill: '#283048',
    wingLine: K,
    eye: { white: [[14, 4]], pupil: [15, 4] },
  },
  eagle: {
    w: 26,
    h: 20,
    ax: 12,
    ay: 11,
    body(p) {
      const B = '#7c4418';
      const S = '#401c00';
      p.poly([[0.5, 9], [5.5, 8.5], [5.5, 13.5], [0.5, 12.5]], W);
      blob(p, 11, 11.2, 8, 4.6, B, S);
      blob(p, 17.6, 6.6, 3.7, 3.6, W, '#bcbcbc');
      p.ellipse(15.4, 9.2, 2.4, 2.4, W);
      p.poly([[20.4, 5.2], [23.8, 5.6], [24.6, 8.2], [23, 9.4], [20.4, 8.8]], '#f8b800');
      p.set(24, 9, '#c84800');
      p.outline(K);
      p.line(17, 4, 19, 4, K);
    },
    wing: {
      mid: [[3.5, 10.5], [15, 8.8], [16.5, 11.5], [12.5, 14.6], [4, 13.6]],
      up: [[4.5, 10.8], [14.5, 10.8], [13, 5.5], [11.5, 0.4], [10, 3], [8.4, 0.8], [6.8, 3.6], [5, 2.4], [4, 6]],
      down: [[4.5, 11.4], [14.5, 11.4], [14, 15], [12.8, 19.6], [11.2, 17], [9.6, 19.4], [8, 17], [6.2, 19], [4.6, 14.6]],
    },
    wingFill: '#5c3008',
    wingLine: '#1c0c00',
    eye: { white: [], pupil: [19, 5] },
  },
};

export interface BirdSprite {
  pix: Pix;
  ax: number;
  ay: number;
}

const cache = new Map<string, BirdSprite>();

/** A bird in one wing pose; `dead` swaps the eye for a cross. */
export function birdPix(id: BirdId, wing: Wing, dead = false): BirdSprite {
  const key = `${id}:${wing}:${dead ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = ART[id];
  const p = new Pix(a.w, a.h);
  a.body(p);
  const wp = new Pix(a.w, a.h).poly(a.wing[wing], a.wingFill).outline(a.wingLine);
  p.draw(wp);
  if (dead) {
    const [x, y] = a.eye.pupil;
    p.set(x - 1, y - 1, K).set(x + 1, y - 1, K).set(x, y, K).set(x - 1, y + 1, K).set(x + 1, y + 1, K);
  } else {
    for (const [x, y] of a.eye.white) p.set(x, y, W);
    p.set(a.eye.pupil[0], a.eye.pupil[1], K);
  }
  const s = { pix: p, ax: a.ax, ay: a.ay };
  cache.set(key, s);
  return s;
}

export const WINGS: readonly Wing[] = ['down', 'mid', 'up', 'mid'];
