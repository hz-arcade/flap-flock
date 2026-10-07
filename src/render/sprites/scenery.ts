import { Pix } from '../pixel';

/** Everything but the birds: scenery, ground tiles, pipes, coins, hazards, flag and castle. */
const K = '#000000';
const W = '#fcfcfc';

// ---- Scenery ----

/** Rounded hill with a few darker dots; `h` is its height. */
export function hill(w: number, h: number, fill: string, dot: string, line: string): Pix {
  const p = new Pix(w + 2, h + 1);
  p.ellipse((w + 2) / 2, h + 1 + h * 0.15, w / 2, h * 1.15, fill);
  for (let y = 0; y < h + 1; y++) for (let x = 0; x < w + 2; x++) if (y >= h) p.set(x, y, null);
  p.outline(line);
  // Dots in pairs, like stitched patches.
  const dots: Array<[number, number]> = [
    [0.42, 0.35],
    [0.6, 0.5],
    [0.32, 0.65],
    [0.7, 0.75],
    [0.5, 0.82],
  ];
  for (const [fx, fy] of dots) {
    const x = Math.round(fx * w);
    const y = Math.round(fy * h);
    if (p.get(x, y) === fill && p.get(x + 1, y + 2) === fill) {
      p.set(x, y, dot).set(x, y + 1, dot).set(x + 1, y + 1, dot).set(x + 1, y + 2, dot);
    }
  }
  return p;
}

/** A bush or cloud: overlapping round puffs on a flat base. */
export function puffs(w: number, h: number, fill: string, shade: string, line: string, flatBottom = true): Pix {
  const p = new Pix(w + 2, h + 2);
  const n = Math.max(2, Math.round(w / (h * 0.9)));
  for (let i = 0; i < n; i++) {
    const cx = 1 + (w * (i + 0.5)) / n;
    const r = (i === 0 || i === n - 1 ? 0.78 : 1) * (h / 2);
    p.disc(cx + 0.4, 1 + h - r + 0.4, r, shade);
    p.disc(cx, 1 + h - r, r - 0.2, fill);
  }
  if (flatBottom) p.rect(1 + h * 0.35, 1 + h * 0.5, w - h * 0.7, h * 0.5, fill);
  else p.ellipse(1 + w / 2, 1 + h * 0.62, w / 2 - 1, h * 0.38, fill);
  p.outline(line);
  return p;
}

export function pine(h: number, leaf: string, snow: string, trunk: string): Pix {
  const w = Math.round(h * 0.62);
  const p = new Pix(w + 2, h + 2);
  const cx = (w + 2) / 2;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const top = 1 + (i * (h - 4)) / (tiers + 0.6);
    const bot = top + (h - 4) / 2.1;
    const half = ((i + 1.2) / (tiers + 0.2)) * (w / 2);
    p.poly([[cx, top], [cx + half, bot], [cx - half, bot]], leaf);
    p.line(cx - half * 0.5, bot - 1, cx - 1, top + 2, snow);
  }
  p.rect(Math.floor(cx) - 1, h - 3, 2, 4, trunk);
  p.outline(K);
  return p;
}

export function mountain(w: number, h: number, rock: string, cap: string): Pix {
  const p = new Pix(w + 2, h + 1);
  p.poly([[1, h + 1], [w / 2 + 1, 1], [w + 1, h + 1]], rock);
  p.poly([[w / 2 + 1 - w * 0.17, h * 0.34], [w / 2 + 1, 1], [w / 2 + 1 + w * 0.17, h * 0.34], [w / 2 + 1 + w * 0.06, h * 0.28], [w / 2 + 1, h * 0.36], [w / 2 + 1 - w * 0.08, h * 0.27]], cap);
  p.outline(K);
  return p;
}

export function cactus(h: number): Pix {
  const G = '#00a800';
  const L = '#58d854';
  const p = new Pix(16, h + 1);
  p.rect(6, 1, 4, h, G).rect(7, 1, 1, h, L);
  p.rect(2, 5, 3, 6, G).rect(2, 10, 6, 3, G);
  p.rect(11, 3, 3, 6, G).rect(9, 8, 5, 3, G);
  p.outline(K);
  return p;
}

export function stalactite(h: number, rock: string, light: string): Pix {
  const p = new Pix(10, h + 1);
  p.poly([[0, 0], [10, 0], [5.5, h]], rock);
  p.line(3, 0, 5, h - 3, light);
  p.outline(K);
  return p;
}

export function seaweed(h: number, frame: number): Pix {
  const p = new Pix(10, h + 1);
  for (let y = 0; y <= h; y++) {
    const sway = Math.round(Math.sin(y * 0.45 + frame * 1.6) * 1.6 * (1 - y / h));
    p.rect(4 + sway, y, 2, 1, y % 5 === 0 ? '#58d854' : '#00a800');
  }
  p.outline('#004000');
  return p;
}

export function coral(): Pix {
  const C = '#f85898';
  const p = new Pix(18, 16);
  p.rect(8, 6, 2, 10, C).rect(3, 3, 2, 8, C).rect(3, 10, 6, 2, C).rect(13, 1, 2, 9, C).rect(9, 8, 5, 2, C);
  p.outline('#881400');
  return p;
}

export function dune(w: number, h: number): Pix {
  const p = new Pix(w, h + 1);
  p.ellipse(w / 2, h + 1 + h * 0.3, w / 2, h * 1.3, '#e8a050');
  for (let y = 0; y < h + 1; y++) for (let x = 0; x < w; x++) if (y >= h) p.set(x, y, null);
  for (let x = 0; x < w; x += 3) {
    const y = Math.round(h * 0.55 + Math.sin(x * 0.3) * 1.5);
    if (p.get(x, y)) p.set(x, y, '#c87830');
  }
  return p;
}

export function castleWindow(): Pix {
  const p = new Pix(14, 22);
  p.rect(2, 8, 10, 14, '#000000').ellipse(7, 8, 5, 6, '#000000');
  p.outline('#7c7c7c');
  return p;
}

// ---- Ground tiles (16 x 16) ----

export type GroundKind = 'grass' | 'cave' | 'water' | 'snow' | 'sky' | 'desert' | 'castle';

export function groundTile(kind: GroundKind): Pix {
  const p = new Pix(16, 16);
  switch (kind) {
    case 'grass': {
      p.rect(0, 0, 16, 16, '#c84c0c');
      p.rect(0, 0, 16, 1, K).rect(0, 1, 16, 2, '#58d854').rect(0, 3, 16, 2, '#00a800');
      for (const [x, y] of [[3, 5], [4, 5], [11, 9], [12, 9], [6, 12], [7, 12], [14, 13], [1, 10]] as const) p.set(x, y, '#fca044');
      for (const [x, y] of [[2, 8], [9, 6], [13, 11], [5, 14], [10, 14]] as const) p.set(x, y, '#882c00');
      p.set(4, 5, '#00a800').set(12, 5, '#00a800');
      break;
    }
    case 'cave': {
      p.rect(0, 0, 16, 16, '#3c5cb8');
      p.rect(0, 0, 16, 1, '#a4c4fc').rect(0, 7, 16, 1, '#1c2c78').rect(0, 15, 16, 1, '#1c2c78');
      p.rect(7, 0, 1, 7, '#1c2c78').rect(15, 8, 1, 7, '#1c2c78');
      p.rect(0, 8, 7, 1, '#7c9cf8').rect(8, 1, 7, 1, '#7c9cf8');
      break;
    }
    case 'water': {
      p.rect(0, 0, 16, 16, '#f0d0b0');
      p.rect(0, 0, 16, 1, '#a07040');
      for (let x = 0; x < 16; x++) p.set(x, 5 + Math.round(Math.sin(x * 0.8)), '#d8a878').set(x, 11 + Math.round(Math.cos(x * 0.7)), '#d8a878');
      break;
    }
    case 'snow': {
      p.rect(0, 0, 16, 16, '#5868a8');
      p.rect(0, 0, 16, 5, W).rect(0, 5, 16, 1, '#a4c4fc');
      p.set(3, 5, W).set(4, 6, W).set(11, 5, W).set(12, 6, W).set(12, 7, '#a4c4fc');
      for (const [x, y] of [[2, 10], [9, 9], [13, 13], [6, 14]] as const) p.set(x, y, '#3c4878');
      break;
    }
    case 'sky': {
      p.rect(0, 0, 16, 16, '#d8e8fc');
      p.disc(4, 4, 4, W).disc(12, 3, 4, W).rect(0, 4, 16, 3, W);
      p.rect(0, 12, 16, 4, '#b8c8f8');
      break;
    }
    case 'desert': {
      p.rect(0, 0, 16, 16, '#fca044');
      p.rect(0, 0, 16, 1, '#c84c0c');
      for (let x = 0; x < 16; x++) p.set(x, 6 + Math.round(Math.sin(x * 0.6) * 1.2), '#e45c10').set(x, 12 + Math.round(Math.sin(x * 0.6 + 2) * 1.2), '#e45c10');
      break;
    }
    case 'castle': {
      p.rect(0, 0, 16, 16, '#f83800');
      for (let y = 2; y < 16; y += 4) for (let x = (y / 2) % 4; x < 16; x += 6) p.rect(x, y, 2, 1, '#fca044');
      break;
    }
  }
  return p;
}

/** Top row of lava, animated: frame 0..3. */
export function lavaSurface(frame: number): Pix {
  const p = new Pix(16, 6);
  for (let x = 0; x < 16; x++) {
    const h = 2 + Math.round(1.5 + 1.5 * Math.sin((x + frame * 4) * (Math.PI / 8)));
    p.rect(x, 6 - h, 1, h, '#fca044');
    p.set(x, 6 - h, '#fce0a8');
  }
  return p;
}

// ---- Pipes ----

export interface PipeColors {
  light: string;
  base: string;
  dark: string;
  line: string;
  /** Snow or moss on the lips. */
  cap?: string;
}

function pipeColumn(w: number, c: PipeColors): string[] {
  const cols: string[] = [];
  for (let x = 0; x < w; x++) {
    const f = x / (w - 1);
    cols.push(x === 0 || x === w - 1 ? c.line : f < 0.12 ? c.base : f < 0.32 ? c.light : f < 0.7 ? c.base : f < 0.8 ? c.dark : f < 0.88 ? c.base : c.dark);
  }
  return cols;
}

/** One row of pipe body; the renderer stretches it vertically. */
export function pipeBody(w: number, c: PipeColors): Pix {
  const p = new Pix(w, 1);
  pipeColumn(w, c).forEach((col, x) => p.set(x, 0, col));
  return p;
}

/** Pipe lip; `top` = the lip at the bottom of a hanging pipe (cap shown on the bottom pipe only). */
export function pipeLip(w: number, h: number, c: PipeColors, top: boolean): Pix {
  const p = new Pix(w, h);
  const cols = pipeColumn(w, c);
  for (let y = 0; y < h; y++) cols.forEach((col, x) => p.set(x, y, col));
  p.rect(0, 0, w, 1, c.line).rect(0, h - 1, w, 1, c.line);
  if (c.cap && !top) {
    p.rect(1, 1, w - 2, 2, c.cap);
    p.set(3, 3, c.cap).set(4, 3, c.cap).set(w - 6, 3, c.cap);
  }
  return p;
}

// ---- Coins, items, flag, castle ----

/** Spinning coin, frames 0..3: face, turning, edge, turning. */
export function coin(frame: number): Pix {
  const G = '#f8b800';
  const D = '#ac7c00';
  const L = '#fce0a8';
  const p = new Pix(10, 12);
  const widths = [4.6, 3, 1, 3];
  const rx = widths[frame % 4]!;
  p.ellipse(5, 6, rx, 5.6, G);
  if (rx > 2) {
    p.ellipse(5, 6, rx - 1.6, 3.8, D);
    p.ellipse(5 - 0.3, 6, Math.max(0.6, rx - 2.6), 2.8, G);
    p.set(Math.round(5 - rx + 1), 3, L).set(Math.round(5 - rx + 1), 4, L);
  } else p.rect(4, 1, 2, 10, D);
  p.outline(K);
  return p;
}

export function sparkle(frame: number): Pix {
  const p = new Pix(7, 7);
  const r = [1, 2, 3, 2][frame % 4]!;
  for (let i = -r; i <= r; i++) p.set(3 + i, 3, W).set(3, 3 + i, W);
  if (r > 1) p.set(3, 3, '#f8d878');
  return p;
}

/** Goal pole with its ball; height in px. */
export function flagPole(h: number): Pix {
  const p = new Pix(8, h);
  p.rect(3, 6, 2, h - 6, '#58d854').rect(3, 6, 1, h - 6, '#b8f818');
  p.disc(4, 3.5, 3.2, '#00a800').set(3, 2, '#b8f818');
  p.rect(1, h - 6, 6, 6, '#7c7c7c');
  p.outline(K);
  return p;
}

/** The goal flag: a feather on white. */
export function flag(): Pix {
  const p = new Pix(16, 13);
  p.poly([[16, 0], [16, 13], [1, 6.5]], W);
  p.line(13, 3, 7, 9, '#00a800').line(12, 5, 9, 6, '#58d854').line(13, 7, 10, 8, '#58d854');
  p.outline(K);
  return p;
}

/** Halfway flag: small pennant, grey until reached. */
export function pennant(reached: boolean): Pix {
  const p = new Pix(12, 24);
  p.rect(1, 1, 1, 22, '#7c7c7c');
  p.poly([[2, 1], [11, 4.5], [2, 8]], reached ? '#f83800' : '#bcbcbc');
  p.outline(K);
  return p;
}

export function castle(stone: string, mortar: string): Pix {
  const p = new Pix(64, 64);
  p.rect(8, 28, 48, 36, stone);
  p.rect(18, 8, 28, 20, stone);
  for (let x = 8; x < 56; x += 8) p.rect(x, 22, 5, 6, stone);
  for (let x = 18; x < 46; x += 7) p.rect(x, 2, 4, 6, stone);
  // Mortar lines.
  for (let y = 31; y < 64; y += 5) p.rect(8, y, 48, 1, mortar);
  for (let y = 11; y < 28; y += 5) p.rect(18, y, 28, 1, mortar);
  for (let y = 31; y < 64; y += 10) for (let x = 12; x < 56; x += 10) p.rect(x, y, 1, 5, mortar).rect(x + 5, y + 5, 1, 5, mortar);
  // Door and windows.
  p.rect(26, 44, 12, 20, K).ellipse(32, 44, 6, 6, K);
  p.rect(23, 13, 5, 8, K).rect(36, 13, 5, 8, K);
  p.outline(K);
  return p;
}

export function hand(pressed: boolean): Pix {
  const p = new Pix(14, 16);
  const y0 = pressed ? 2 : 0;
  p.rect(5, y0, 3, 8, W);
  p.ellipse(7.5, y0 + 10.5, 5, 4.6, W);
  p.rect(3, y0 + 7, 9, 4, W);
  p.line(8, y0 + 7, 8, y0 + 9, '#bcbcbc').line(10, y0 + 7, 10, y0 + 9, '#bcbcbc');
  p.outline(K);
  return p;
}

// ---- Hazards ----

export function urchin(frame: number): Pix {
  const p = new Pix(18, 18);
  const spikes = 8;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * Math.PI * 2 + (frame % 2) * (Math.PI / spikes);
    p.line(9 + Math.cos(a) * 5, 9 + Math.sin(a) * 5, 9 + Math.cos(a) * 8.4, 9 + Math.sin(a) * 8.4, '#3c1c78');
  }
  p.disc(9, 9, 6, '#9878f8').disc(8, 8, 4, '#b8b8f8').disc(9.4, 9.4, 3.2, '#9878f8');
  p.outline(K);
  return p;
}

export function fireball(r: number, frame: number): Pix {
  const s = Math.ceil(r * 2 + 6);
  const p = new Pix(s, s);
  const c = s / 2;
  p.disc(c, c, r + 1, '#f83800');
  p.disc(c, c, r, '#fca044');
  p.disc(c - 0.8, c - 0.8, Math.max(1, r - 2), '#fce0a8');
  if (frame % 2) p.set(Math.round(c + r), Math.round(c - r * 0.6), '#f83800').set(Math.round(c - r), Math.round(c + r * 0.6), '#f83800');
  else p.set(Math.round(c + r * 0.6), Math.round(c + r), '#f83800').set(Math.round(c - r * 0.6), Math.round(c - r), '#f83800');
  p.outline('#881400');
  return p;
}

export function cannonball(): Pix {
  const p = new Pix(10, 10);
  p.disc(5, 5, 4, '#202020').set(3, 3, '#7c7c7c').set(4, 3, '#bcbcbc');
  p.outline(K);
  return p;
}

export function cannonBarrel(): Pix {
  const p = new Pix(14, 12);
  p.rect(2, 2, 12, 8, '#383838').rect(0, 1, 3, 10, '#202020').rect(4, 3, 9, 2, '#7c7c7c');
  p.outline(K);
  return p;
}

export function brickBlock(stone: string, mortar: string, light: string): Pix {
  const p = new Pix(16, 16);
  p.rect(0, 0, 16, 16, stone);
  p.rect(0, 0, 16, 1, light).rect(0, 7, 16, 1, mortar).rect(0, 15, 16, 1, mortar);
  p.rect(7, 0, 1, 7, mortar).rect(3, 8, 1, 7, mortar).rect(11, 8, 1, 7, mortar);
  return p;
}

export function pivot(): Pix {
  const p = new Pix(10, 10);
  p.rect(1, 1, 8, 8, '#bcbcbc').rect(1, 1, 8, 1, W).rect(2, 2, 2, 2, '#7c7c7c').rect(6, 6, 2, 2, '#7c7c7c');
  p.outline(K);
  return p;
}

export function bubble(r: number): Pix {
  const s = Math.ceil(r * 2 + 2);
  const p = new Pix(s, s);
  p.disc(s / 2, s / 2, r, '#a4e4fc');
  // Hollow it out: only the rim stays.
  const inner = new Pix(s, s).disc(s / 2, s / 2, Math.max(0.5, r - 1), W);
  inner.data.forEach((c, i) => {
    if (c) p.data[i] = null;
  });
  if (r >= 2) p.set(Math.floor(s / 2 - r / 2), Math.floor(s / 2 - r / 2), W);
  return p;
}
