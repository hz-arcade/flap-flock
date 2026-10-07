import { Pix } from './pixel';

/** 5 x 7 pixel digits and a few symbols for the in-game HUD (menus use real fonts). */
const GLYPHS: Record<string, readonly string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/** Text as a raster with a 1 px dark outline. */
export function textPix(text: string, color: string, outline = '#000000'): Pix {
  const chars = [...text].filter((c) => GLYPHS[c]);
  const w = chars.length * (GLYPH_W + 1) + 1;
  const p = new Pix(w + 2, GLYPH_H + 2);
  chars.forEach((ch, i) => {
    const g = GLYPHS[ch]!;
    g.forEach((row, y) => {
      for (let x = 0; x < GLYPH_W; x++) if (row[x] === '#') p.set(1 + i * (GLYPH_W + 1) + x + 1, y + 1, color);
    });
  });
  p.outline(outline, true);
  return p;
}

export function hasGlyph(ch: string): boolean {
  return ch in GLYPHS;
}
