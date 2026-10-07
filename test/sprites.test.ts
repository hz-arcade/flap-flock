import { describe, expect, it } from 'vitest';
import { BIRDS, BIRD_ORDER } from '../src/game/birds';
import { birdPix } from '../src/render/sprites/birds';
import * as S from '../src/render/sprites/scenery';
import { THEME_IDS, themeSpec } from '../src/render/themes';
import { textPix } from '../src/render/bitmapFont';

describe('sprites', () => {
  it('every bird has every pose, and the hitbox is well inside the drawing', () => {
    for (const id of BIRD_ORDER) {
      for (const wing of ['up', 'mid', 'down'] as const) {
        for (const dead of [false, true]) {
          const s = birdPix(id, wing, dead);
          const b = s.pix.bounds();
          expect(b.x1, id).toBeGreaterThan(b.x0);
          // The anchor (hitbox centre) is on the body.
          expect(s.pix.get(s.ax, s.ay), `${id} anchor`).not.toBeNull();
          const w = b.x1 - b.x0 + 1;
          const h = b.y1 - b.y0 + 1;
          expect(BIRDS[id].radius * 2, `${id} hitbox vs sprite`).toBeLessThanOrEqual(Math.min(w, h) * 0.9);
        }
      }
    }
  });

  it('dead and alive differ only at the eye', () => {
    for (const id of BIRD_ORDER) {
      const a = birdPix(id, 'mid').pix.data;
      const d = birdPix(id, 'mid', true).pix.data;
      const diff = a.filter((c, i) => c !== d[i]).length;
      expect(diff).toBeGreaterThan(0);
      expect(diff).toBeLessThanOrEqual(6);
    }
  });

  it('themes build without empty art', () => {
    for (const id of THEME_IDS) {
      const t = themeSpec(id);
      expect(t.sky.length).toBeGreaterThan(0);
      for (const l of t.layers) for (const p of l.items) expect(p.bounds().x1, `${id} layer`).toBeGreaterThanOrEqual(0);
      const tile = S.groundTile(t.ground);
      expect(tile.data.every((c) => c !== null), `${id} ground tile is solid`).toBe(true);
    }
  });

  it('coins spin through four frames and the HUD font covers the counter', () => {
    const frames = [0, 1, 2, 3].map((f) => S.coin(f).data.filter(Boolean).length);
    expect(frames[0]).toBeGreaterThan(frames[2]!);
    expect(textPix('12/24', '#fff').w).toBeGreaterThan(textPix('1', '#fff').w);
  });
});
