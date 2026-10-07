/**
 * A tiny pixel raster for building sprites in code: shapes are filled by testing pixel
 * centres, so everything stays on the pixel grid with hard edges, and `outline` adds the
 * dark contour that gives the 8-bit look. DOM-free until `toCanvas`, so it runs in tests.
 */
export type Color = string;

export class Pix {
  readonly data: (Color | null)[];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Array<Color | null>(w * h).fill(null);
  }

  static fromRows(rows: readonly string[], palette: Record<string, Color>): Pix {
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const p = new Pix(w, h);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = palette[row[x]!];
        if (c) p.set(x, y, c);
      }
    });
    return p;
  }

  get(x: number, y: number): Color | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.data[y * this.w + x] ?? null;
  }

  set(x: number, y: number, c: Color | null): this {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c: Color): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }

  /** Filled ellipse centred on (cx, cy) in pixel units (pixel centres are at +0.5). */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    return this;
  }

  disc(cx: number, cy: number, r: number, c: Color): this {
    return this.ellipse(cx, cy, r, r, c);
  }

  /** Filled polygon (even-odd rule on pixel centres). */
  poly(points: ReadonlyArray<readonly [number, number]>, c: Color): this {
    const ys = points.map((p) => p[1]);
    const xs = points.map((p) => p[0]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        if (inside(points, x + 0.5, y + 0.5)) this.set(x, y, c);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Color): this {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Paint `c` on every empty pixel that touches a filled one (4-neighbourhood, or 8 with `diagonal`). */
  outline(c: Color, diagonal = false): this {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n =
          this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1) ||
          (diagonal && (this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1)));
        if (n) add.push(y * this.w + x);
      }
    }
    for (const i of add) this.data[i] = c;
    return this;
  }

  /** Copy another raster on top of this one at (ox, oy); empty pixels stay transparent. */
  draw(src: Pix, ox = 0, oy = 0): this {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c) this.set(x + ox, y + oy, c);
    }
    return this;
  }

  /** Recolour: every pixel of colour `from` becomes `to`. */
  swap(map: Record<Color, Color>): Pix {
    const p = new Pix(this.w, this.h);
    this.data.forEach((c, i) => (p.data[i] = c ? (map[c] ?? c) : null));
    return p;
  }

  flipX(): Pix {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.data[y * this.w + x] = this.get(this.w - 1 - x, y);
    return p;
  }

  flipY(): Pix {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) p.data[y * this.w + x] = this.get(x, this.h - 1 - y);
    return p;
  }

  /** Bounding box of the filled pixels. */
  bounds(): { x0: number; y0: number; x1: number; y1: number } {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.get(x, y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  }

  toCanvas(scale = 1): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.w * scale;
    c.height = this.h * scale;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const col = this.get(x, y);
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  /** Crisp SVG of the raster (app icons). Runs of one colour on a row become one rect. */
  toSvgRects(scale = 1, ox = 0, oy = 0): string {
    let out = '';
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const c = this.get(x, y);
        if (!c) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < this.w && this.get(x + run, y) === c) run++;
        out += `<rect x="${ox + x * scale}" y="${oy + y * scale}" width="${run * scale}" height="${scale}" fill="${c}"/>`;
        x += run;
      }
    }
    return out;
  }
}

function inside(pts: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
