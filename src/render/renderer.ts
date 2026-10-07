import type { BirdId } from '../game/birds';
import { BAND_H, BIRD_X, COIN_R, GROUND_Y, LIP_H, LIP_W, PIPE_W, STEP } from '../game/constants';
import { pipeCenter } from '../game/course';
import { cannonBalls, cannonMuzzleY, CANNON_HALF_W, lavaY, urchinY, wheelBalls } from '../game/hazards';
import type { ThemeId } from '../game/levels';
import type { Run } from '../game/Run';
import { textPix } from './bitmapFont';
import type { Effects } from './effects';
import type { Pix } from './pixel';
import { birdPix, WINGS, type Wing } from './sprites/birds';
import * as S from './sprites/scenery';
import { themeSpec, type LayerSpec, type ThemeSpec } from './themes';

interface ThemeArt {
  spec: ThemeSpec;
  layers: Array<{ spec: LayerSpec; items: HTMLCanvasElement[]; frames: HTMLCanvasElement[][] | null }>;
  tile: HTMLCanvasElement;
  deep: HTMLCanvasElement;
  pipeBody: HTMLCanvasElement;
  lipTop: HTMLCanvasElement;
  lipBottom: HTMLCanvasElement;
  castle: HTMLCanvasElement;
  wall: HTMLCanvasElement | null;
}

export interface DrawOptions {
  /** Real seconds, for animation. */
  time: number;
  hud: boolean;
  /** Show the tapping hand while waiting to start. */
  hint: boolean;
  /** Endless scenery change: the theme being faded out, and how far the fade is (0..1). */
  prevTheme?: ThemeId | null;
  fade?: number;
}

/** Feather colours per bird, for the crash burst. */
export const FEATHERS: Record<BirdId, readonly string[]> = {
  duck: ['#f8d830', '#fce0a8', '#f87818'],
  chicken: ['#fcfcfc', '#bcbcbc', '#e40058'],
  pelican: ['#f0f0f0', '#bcbcbc', '#f8b800'],
  sparrow: ['#c07830', '#f0d0b0', '#6c3008'],
  penguin: ['#3c4868', '#fcfcfc', '#f87818'],
  eagle: ['#7c4418', '#fcfcfc', '#f8b800'],
};

function hash(i: number, salt: number): number {
  let h = (Math.imul(i, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * Draws the world at a low logical resolution into an offscreen buffer, then scales it up to
 * the screen with smoothing off, so every sprite pixel is a crisp square. The gameplay band is
 * always 256 px tall; the view is 180..480 px wide depending on the screen's shape, and tall
 * screens see extra sky and ground around the band.
 */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  readonly buf: HTMLCanvasElement;
  private b: CanvasRenderingContext2D;
  viewW = 180;
  viewH = BAND_H;
  bandTop = 0;
  scale = 1;
  private offX = 0;
  private offY = 0;
  minViewW = 180;
  maxViewW = 480;
  /** Fixed scale (cover image); null = fit the screen. */
  forceScale: number | null = null;
  private themes = new Map<ThemeId, ThemeArt>();
  private sprites = new Map<string, HTMLCanvasElement>();
  private texts = new Map<string, HTMLCanvasElement>();
  /** Draw hitboxes (?debug). */
  debug = false;
  /** Height of the notch / status bar in CSS px; the HUD stays below it. */
  safeTopCss = 0;
  private hudTop = 4;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.buf = document.createElement('canvas');
    this.b = this.buf.getContext('2d')!;
  }

  resize(): void {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const devW = Math.max(1, Math.round(rect.width * dpr));
    const devH = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== devW || this.canvas.height !== devH) {
      this.canvas.width = devW;
      this.canvas.height = devH;
    }
    let s = this.forceScale ?? Math.min(devH / BAND_H, devW / this.minViewW);
    const si = Math.floor(s);
    if (this.forceScale === null && si >= 2 && devW / si <= this.maxViewW && devH / si >= BAND_H) s = si;
    this.scale = s;
    this.viewW = Math.min(this.maxViewW, Math.ceil(devW / s));
    this.viewH = Math.max(BAND_H, Math.ceil(devH / s));
    this.bandTop = Math.floor((this.viewH - BAND_H) * 0.6);
    if (this.buf.width !== this.viewW || this.buf.height !== this.viewH) {
      this.buf.width = this.viewW;
      this.buf.height = this.viewH;
    }
    this.hudTop = 4 + Math.ceil((this.safeTopCss * dpr) / s);
    this.offX = Math.round((devW - this.viewW * s) / 2);
    this.offY = Math.round((devH - this.viewH * s) / 2);
  }

  // ---- Art caches ----

  private canvasOf(key: string, make: () => Pix): HTMLCanvasElement {
    let c = this.sprites.get(key);
    if (!c) {
      c = make().toCanvas();
      this.sprites.set(key, c);
    }
    return c;
  }

  private theme(id: ThemeId): ThemeArt {
    let t = this.themes.get(id);
    if (t) return t;
    const spec = themeSpec(id);
    const tilePix = S.groundTile(spec.ground);
    const deepPix = S.groundTile(spec.ground);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) deepPix.set(x, y, tilePix.get(x, y + 8));
    t = {
      spec,
      layers: spec.layers.map((l) => ({ spec: l, items: l.items.map((p) => p.toCanvas()), frames: l.frames ? l.frames.map((f) => f.map((p) => p.toCanvas())) : null })),
      tile: tilePix.toCanvas(),
      deep: deepPix.toCanvas(),
      pipeBody: S.pipeBody(PIPE_W, spec.pipe).toCanvas(),
      lipTop: S.pipeLip(LIP_W, LIP_H, spec.pipe, true).toCanvas(),
      lipBottom: S.pipeLip(LIP_W, LIP_H, spec.pipe, false).toCanvas(),
      castle: S.castle(spec.castle.stone, spec.castle.mortar).toCanvas(),
      wall: spec.wall ? S.brickBlock(spec.wall.stone, spec.wall.mortar, spec.wall.light).toCanvas() : null,
    };
    this.themes.set(id, t);
    return t;
  }

  birdCanvas(id: BirdId, wing: Wing, dead = false): { c: HTMLCanvasElement; ax: number; ay: number } {
    const s = birdPix(id, wing, dead);
    return { c: this.canvasOf(`bird:${id}:${wing}:${dead}`, () => s.pix), ax: s.ax, ay: s.ay };
  }

  private text(t: string, color: string): HTMLCanvasElement {
    const key = `${t}|${color}`;
    let c = this.texts.get(key);
    if (!c) {
      if (this.texts.size > 200) this.texts.clear();
      c = textPix(t, color).toCanvas();
      this.texts.set(key, c);
    }
    return c;
  }

  // ---- Frame ----

  cameraX(run: Run): number {
    const x = run.body.x - BIRD_X;
    if (run.mode !== 'level') return x;
    const c = run.course;
    return Math.min(x, Math.max(c.flagX - BIRD_X, c.castleX + 40 - this.viewW));
  }

  draw(run: Run, fx: Effects, opts: DrawOptions): void {
    const b = this.b;
    b.imageSmoothingEnabled = false;
    const th = this.theme(run.theme);
    const camX = Math.round(this.cameraX(run));
    const shake = fx.shake > 0 ? Math.round(Math.sin(opts.time * 80) * 2 * Math.min(1, fx.shake / 0.15)) : 0;
    b.save();
    b.translate(0, shake);
    if (opts.prevTheme && opts.prevTheme !== run.theme && (opts.fade ?? 1) < 1) {
      this.drawBackground(this.theme(opts.prevTheme), camX, opts.time);
      b.globalAlpha = opts.fade ?? 1;
      this.drawBackground(th, camX, opts.time);
      b.globalAlpha = 1;
    } else this.drawBackground(th, camX, opts.time);
    this.drawCurrents(run, camX, opts.time);
    this.drawGoal(run, th, camX);
    this.drawPipes(run, th, camX);
    this.drawHazards(run, camX, opts.time);
    this.drawCoins(run, camX, opts.time);
    this.drawBird(run, camX, opts.time);
    if (opts.prevTheme && opts.prevTheme !== run.theme && (opts.fade ?? 1) < 1) {
      this.drawGround(this.theme(opts.prevTheme), camX, opts.time);
      b.globalAlpha = opts.fade ?? 1;
      this.drawGround(th, camX, opts.time);
      b.globalAlpha = 1;
    } else this.drawGround(th, camX, opts.time);
    this.drawAmbient(th, camX, opts.time);
    this.drawEffects(fx, camX);
    if (opts.hint && run.phase === 'ready') this.drawHint(run, camX, opts.time);
    b.restore();
    if (opts.hud) this.drawHud(run);
    if (fx.flash > 0) {
      b.fillStyle = 'rgba(252,252,252,0.75)';
      b.fillRect(0, 0, this.viewW, this.viewH);
    }
    this.blit();
  }

  /** Scale the buffer onto the screen canvas. */
  blit(): void {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    if (this.offX > 0 || this.offY > 0) {
      ctx.fillStyle = '#101010';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    ctx.drawImage(this.buf, 0, 0, this.viewW, this.viewH, this.offX, this.offY, this.viewW * this.scale, this.viewH * this.scale);
  }

  private get groundTop(): number {
    return this.bandTop + GROUND_Y;
  }

  private drawBackground(th: ThemeArt, camX: number, time: number): void {
    const b = this.b;
    const sky = th.spec.sky;
    b.fillStyle = th.spec.above;
    b.fillRect(0, 0, this.viewW, this.bandTop + 1);
    const bandH = Math.ceil(GROUND_Y / sky.length);
    sky.forEach((c, i) => {
      b.fillStyle = c;
      const y0 = i === 0 ? 0 : this.bandTop + i * bandH;
      const y1 = i === sky.length - 1 ? this.groundTop : this.bandTop + (i + 1) * bandH;
      b.fillRect(0, y0, this.viewW, y1 - y0);
    });
    if (th.wall) {
      const off = mod(camX * 0.5, 32);
      for (let y = this.groundTop - 16; y > -16; y -= 16) {
        const shift = (Math.floor((this.groundTop - y) / 16) % 2) * 8;
        for (let x = -off - shift; x < this.viewW; x += 16) b.drawImage(th.wall, Math.round(x), y);
      }
    }
    if (th.spec.ambient === 'stars') this.drawStars(camX, time);
    if (th.spec.id === 'snow') {
      // Moon.
      const mx = this.viewW - 46 - mod(camX * 0.02, 40);
      b.fillStyle = '#fce0a8';
      b.beginPath();
      b.arc(Math.round(mx), this.bandTop + 34, 11, 0, Math.PI * 2);
      b.fill();
      b.fillStyle = th.spec.sky[0]!;
      b.beginPath();
      b.arc(Math.round(mx) + 5, this.bandTop + 31, 9, 0, Math.PI * 2);
      b.fill();
      this.drawStars(camX, time);
    }
    if (th.spec.id === 'desert') {
      const sx = this.viewW * 0.7 - mod(camX * 0.02, 30);
      b.fillStyle = '#fce0a8';
      b.beginPath();
      b.arc(Math.round(sx), this.bandTop + 150, 22, 0, Math.PI * 2);
      b.fill();
    }
    th.layers.forEach((layer, li) => this.drawLayer(layer, li, camX, time));
  }

  private drawLayer(layer: ThemeArt['layers'][number], li: number, camX: number, time: number): void {
    const b = this.b;
    const l = layer.spec;
    const items = layer.frames ? layer.frames[Math.floor(time * (l.fps ?? 1)) % layer.frames.length]! : layer.items;
    const lx = camX * l.k;
    const first = Math.floor((lx - 140) / l.spacing);
    const last = Math.ceil((lx + this.viewW + 20) / l.spacing);
    for (let i = first; i <= last; i++) {
      const h = hash(i, li * 7 + 3);
      const item = items[Math.floor(h * items.length)]!;
      const x = Math.round(i * l.spacing + (hash(i, li * 7 + 4) - 0.5) * l.jitter - lx);
      if (x > this.viewW || x + item.width < 0) continue;
      let y: number;
      if (l.anchor === 'ground') y = this.groundTop - item.height + 1 + l.y;
      else if (l.anchor === 'top') y = l.y - 1;
      else y = this.bandTop + l.y + Math.round(hash(i, li * 7 + 5) * l.yJitter);
      b.drawImage(item, x, y);
    }
  }

  private drawStars(camX: number, time: number): void {
    const b = this.b;
    for (let i = 0; i < 30; i++) {
      const x = Math.round(mod(i * 67.3 - camX * 0.04, this.viewW));
      const y = Math.round(mod(i * 23.7, 130)) + 3;
      const tw = Math.sin(time * 2.6 + i * 1.7);
      b.fillStyle = i % 4 === 0 ? '#f8d878' : '#fcfcfc';
      b.fillRect(x, y, 1, 1);
      if (tw > 0.75) {
        b.fillRect(x - 1, y, 3, 1);
        b.fillRect(x, y - 1, 1, 3);
      }
    }
  }

  private drawGround(th: ThemeArt, camX: number, time: number): void {
    const b = this.b;
    const off = mod(camX, 16);
    const top = this.groundTop;
    for (let y = top, row = 0; y < this.viewH; y += 16, row++) {
      const tile = row === 0 ? th.tile : th.deep;
      for (let x = -off; x < this.viewW; x += 16) b.drawImage(tile, x, y);
    }
    if (th.spec.ground === 'castle') {
      const surf = this.canvasOf(`lava:${Math.floor(time * 6) % 4}`, () => S.lavaSurface(Math.floor(time * 6) % 4));
      for (let x = -mod(camX, 16); x < this.viewW; x += 16) b.drawImage(surf, x, top - 4);
    }
  }

  private drawPipes(run: Run, th: ThemeArt, camX: number): void {
    const b = this.b;
    const t = run.body.t;
    for (const p of run.course.pipes) {
      const sx = Math.round(p.x - camX);
      if (sx < -LIP_W || sx > this.viewW + LIP_W) continue;
      const c = pipeCenter(p, t);
      const gapTop = Math.round(this.bandTop + c - p.gap / 2);
      const gapBot = Math.round(this.bandTop + c + p.gap / 2);
      const bodyTop = gapTop - LIP_H;
      if (bodyTop > 0) b.drawImage(th.pipeBody, 0, 0, PIPE_W, 1, sx - PIPE_W / 2, 0, PIPE_W, bodyTop);
      b.drawImage(th.lipTop, sx - LIP_W / 2, gapTop - LIP_H);
      b.drawImage(th.lipBottom, sx - LIP_W / 2, gapBot);
      const bodyH = this.groundTop - (gapBot + LIP_H);
      if (bodyH > 0) b.drawImage(th.pipeBody, 0, 0, PIPE_W, 1, sx - PIPE_W / 2, gapBot + LIP_H, PIPE_W, bodyH);
      if (this.debug) {
        b.strokeStyle = '#ff00ff';
        b.strokeRect(sx - LIP_W / 2 + 0.5, gapTop + 0.5, LIP_W - 1, gapBot - gapTop - 1);
      }
    }
  }

  private drawCurrents(run: Run, camX: number, time: number): void {
    const b = this.b;
    const bub = this.canvasOf('bubble:1', () => S.bubble(1.5));
    for (const c of run.course.currents) {
      const x0 = Math.round(c.x0 - camX);
      const x1 = Math.round(c.x1 - camX);
      if (x1 < 0 || x0 > this.viewW) continue;
      const up = c.drift < 0;
      b.fillStyle = up ? 'rgba(164,228,252,0.16)' : 'rgba(0,0,40,0.22)';
      b.fillRect(x0, this.bandTop, x1 - x0, GROUND_Y);
      const w = x1 - x0;
      const n = Math.max(4, Math.round(w / 9));
      for (let i = 0; i < n; i++) {
        const x = x0 + Math.round(mod(i * 37.1, w));
        const speed = 40 + (i % 3) * 18;
        const yy = mod(i * 53.3 + time * speed, GROUND_Y);
        const y = Math.round(this.bandTop + (up ? GROUND_Y - yy : yy));
        if (up) b.drawImage(bub, x - 2, y - 2);
        else {
          b.fillStyle = 'rgba(8,16,72,0.7)';
          b.fillRect(x - 2, y - 2, 1, 1);
          b.fillRect(x - 1, y - 1, 1, 1);
          b.fillRect(x, y, 1, 1);
          b.fillRect(x + 1, y - 1, 1, 1);
          b.fillRect(x + 2, y - 2, 1, 1);
        }
      }
    }
  }

  private drawHazards(run: Run, camX: number, time: number): void {
    const b = this.b;
    const t = run.body.t;
    const f2 = Math.floor(time * 8) % 2;
    for (const h of run.course.hazards) {
      const sx = Math.round(h.x - camX);
      if (sx < -140 || sx > this.viewW + 140) continue;
      switch (h.kind) {
        case 'urchin': {
          const img = this.canvasOf(`urchin:${f2}`, () => S.urchin(f2));
          b.drawImage(img, sx - 9, Math.round(this.bandTop + urchinY(h, t)) - 9);
          break;
        }
        case 'lava': {
          const y = lavaY(h, t);
          if (y > GROUND_Y + h.r) break;
          const img = this.canvasOf(`fire:${h.r}:${f2}`, () => S.fireball(h.r, f2));
          b.drawImage(img, sx - img.width / 2, Math.round(this.bandTop + y - img.height / 2));
          break;
        }
        case 'cannon': {
          const block = this.canvasOf('cannonBlock', () => S.brickBlock('#7c7c7c', '#383838', '#bcbcbc'));
          if (h.hang) {
            for (let y = this.bandTop + h.edge - 16; y > -16; y -= 16) b.drawImage(block, sx - CANNON_HALF_W, Math.round(y));
          } else {
            for (let y = this.bandTop + h.edge; y < this.groundTop; y += 16) b.drawImage(block, sx - CANNON_HALF_W, Math.round(y));
          }
          const my = Math.round(this.bandTop + cannonMuzzleY(h));
          const barrel = this.canvasOf('barrel', () => S.cannonBarrel());
          b.drawImage(barrel, sx - CANNON_HALF_W - 6, my - 6);
          const ball = this.canvasOf('cannonball', () => S.cannonball());
          for (const bx of cannonBalls(h, t)) b.drawImage(ball, Math.round(bx - camX) - 5, my - 5);
          break;
        }
        case 'wheel': {
          const fire = this.canvasOf(`fire:3:${f2}`, () => S.fireball(3, f2));
          const balls = wheelBalls(h, t);
          b.drawImage(this.canvasOf('pivot', () => S.pivot()), sx - 5, Math.round(this.bandTop + h.y) - 5);
          for (const [bx, by] of balls.slice(1)) b.drawImage(fire, Math.round(bx - camX - fire.width / 2), Math.round(this.bandTop + by - fire.height / 2));
          break;
        }
      }
    }
  }

  private drawCoins(run: Run, camX: number, time: number): void {
    const b = this.b;
    run.course.coins.forEach((c, i) => {
      if (run.coinBits[i]) return;
      const sx = Math.round(c.x - camX);
      if (sx < -10 || sx > this.viewW + 10) return;
      const f = Math.floor(time * 8 + i * 0.7) % 4;
      const img = this.canvasOf(`coin:${f}`, () => S.coin(f));
      b.drawImage(img, sx - 5, Math.round(this.bandTop + c.y) - 6);
      if (this.debug) {
        b.strokeStyle = '#ffff00';
        b.beginPath();
        b.arc(sx, this.bandTop + c.y, COIN_R, 0, Math.PI * 2);
        b.stroke();
      }
    });
  }

  private drawGoal(run: Run, th: ThemeArt, camX: number): void {
    if (run.mode !== 'level') return;
    const b = this.b;
    const c = run.course;
    if (c.checkpointX !== null) {
      const sx = Math.round(c.checkpointX - camX);
      if (sx > -20 && sx < this.viewW + 20) {
        const img = this.canvasOf(`pennant:${!!run.checkpoint}`, () => S.pennant(!!run.checkpoint));
        b.drawImage(img, sx - 2, this.groundTop - img.height);
      }
    }
    const fx = Math.round(c.flagX - camX);
    if (fx < -80 || fx > this.viewW + 120) return;
    const poleH = GROUND_Y - 40;
    const pole = this.canvasOf(`pole:${poleH}`, () => S.flagPole(poleH));
    const castleImg = th.castle;
    b.drawImage(castleImg, Math.round(c.castleX - camX) - 32, this.groundTop - castleImg.height);
    b.drawImage(pole, fx - 4, this.groundTop - poleH);
    const flag = this.canvasOf('flag', () => S.flag());
    let k = 0;
    if (run.phase === 'clearing') k = Math.min(1, (run.phaseTicks * STEP) / 1.0);
    else if (run.phase === 'cleared') k = 1;
    const fy = Math.round(this.groundTop - poleH + 8 + k * (poleH - 30));
    b.drawImage(flag, fx - 16, fy);
  }

  private drawBird(run: Run, camX: number, time: number): void {
    const b = this.b;
    const body = run.body;
    if ((run.phase === 'clearing' || run.phase === 'cleared') && body.x >= run.course.castleX - 3) return;
    const p = run.phys;
    let y = body.y;
    let angle = 0;
    let wing: Wing = 'mid';
    const dead = run.phase === 'dying' || run.phase === 'dead';
    const since = (run.clock - run.lastFlap) * STEP;
    if (run.phase === 'ready') {
      y += Math.sin(time * 5) * 2.5;
      wing = WINGS[Math.floor(time * 8) % 4]!;
    } else if (dead) {
      angle = run.phase === 'dead' ? Math.PI / 2 : Math.min(Math.PI / 2, body.vy < 0 ? 0.2 : 0.2 + (body.vy / 260) * 1.4);
    } else if (run.phase === 'clearing' || run.phase === 'cleared') {
      wing = WINGS[Math.floor(time * 10) % 4]!;
    } else {
      angle = body.vy < 0 ? -0.35 : Math.min(1.1, (body.vy / p.maxFall) * 1.1);
      if (since < 0.24) wing = WINGS[Math.floor(since / 0.06)]!;
      else if (p.glideFall !== null && run.held && body.vy > 0) wing = 'up';
      else if (body.vy < 0) wing = WINGS[Math.floor(time * 10) % 4]!;
      if (p.glideFall !== null && run.held && body.vy > 0) angle = Math.min(angle, 0.25);
    }
    const q = Math.round(angle / (Math.PI / 16)) * (Math.PI / 16);
    const art = this.birdCanvas(run.bird.id, wing, dead);
    const sx = Math.round(body.x - camX);
    const sy = Math.round(this.bandTop + y);
    b.save();
    b.translate(sx, sy);
    if (q) b.rotate(q);
    b.drawImage(art.c, -art.ax, -art.ay);
    b.restore();
    if (this.debug) {
      b.strokeStyle = '#ff0000';
      b.beginPath();
      b.arc(sx, sy, p.radius, 0, Math.PI * 2);
      b.stroke();
    }
  }

  private drawAmbient(th: ThemeArt, camX: number, time: number): void {
    const b = this.b;
    switch (th.spec.ambient) {
      case 'snow':
        b.fillStyle = '#fcfcfc';
        for (let i = 0; i < 40; i++) {
          const x = Math.round(mod(i * 47.3 - camX * 0.7 - time * 8 + Math.sin(time * 1.3 + i) * 4, this.viewW + 20) - 10);
          const y = Math.round(mod(i * 31.7 + time * (16 + (i % 5) * 5), this.viewH + 10) - 5);
          const s = i % 3 === 0 ? 2 : 1;
          b.fillRect(x, y, s, s);
        }
        break;
      case 'bubbles': {
        const small = this.canvasOf('bubble:1', () => S.bubble(1.5));
        const big = this.canvasOf('bubble:2', () => S.bubble(2.5));
        for (let i = 0; i < 14; i++) {
          const x = Math.round(mod(i * 53.1 - camX * 0.6 + Math.sin(time * 2 + i) * 3, this.viewW));
          const y = Math.round(this.groundTop - mod(time * (14 + (i % 4) * 6) + i * 41, GROUND_Y + 20));
          b.drawImage(i % 3 ? small : big, x, y);
        }
        break;
      }
      case 'embers':
        for (let i = 0; i < 18; i++) {
          const x = Math.round(mod(i * 41.7 - camX * 0.8 + Math.sin(time * 3 + i) * 3, this.viewW));
          const y = Math.round(this.groundTop - mod(time * (20 + (i % 5) * 6) + i * 37, 170));
          b.fillStyle = i % 2 ? '#fca044' : '#f83800';
          b.fillRect(x, y, 1, 1);
        }
        break;
      default:
        break;
    }
  }

  private drawEffects(fx: Effects, camX: number): void {
    const b = this.b;
    for (const p of fx.list) {
      const x = Math.round(p.x - camX);
      const y = Math.round(this.bandTop + p.y);
      if (p.kind === 'sparkle') {
        const f = Math.min(3, Math.floor((p.age / p.life) * 4));
        b.drawImage(this.canvasOf(`sparkle:${f}`, () => S.sparkle(f)), x - 3, y - 3);
      } else {
        b.globalAlpha = p.kind === 'puff' ? Math.max(0, 1 - p.age / p.life) : 1;
        b.fillStyle = p.color;
        b.fillRect(x, y, p.kind === 'puff' ? 2 : p.size, p.kind === 'puff' ? 2 : p.size);
        b.globalAlpha = 1;
      }
    }
  }

  private drawHint(run: Run, camX: number, time: number): void {
    const pressed = Math.floor(time * 2.5) % 2 === 1;
    const img = this.canvasOf(`hand:${pressed}`, () => S.hand(pressed));
    const x = Math.round(run.body.x - camX) + 4;
    const y = Math.round(this.bandTop + run.body.y) + 22;
    this.b.drawImage(img, x, y);
  }

  private drawHud(run: Run): void {
    const b = this.b;
    const top = this.hudTop;
    if (run.mode === 'endless') {
      const t = this.text(String(run.body.passed), '#fcfcfc');
      const w = t.width * 2;
      b.drawImage(t, 0, 0, t.width, t.height, Math.round(this.viewW / 2 - w / 2), top + 8, w, t.height * 2);
      return;
    }
    const coin = this.canvasOf('coin:0', () => S.coin(0));
    b.drawImage(coin, 4, top);
    const total = run.course.coins.length;
    const txt = this.text(`${run.coins}/${total}`, run.coins === total && total > 0 ? '#f8d878' : '#fcfcfc');
    b.drawImage(txt, 15, top + 2);
    // Progress bar between the coin counter and the corner buttons.
    const x0 = 15 + txt.width + 6;
    const x1 = this.viewW - 44;
    if (x1 - x0 < 24) return;
    const y = top + 4;
    b.fillStyle = '#000000';
    b.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 5);
    b.fillStyle = '#383838';
    b.fillRect(x0, y, x1 - x0, 3);
    b.fillStyle = '#58d854';
    b.fillRect(x0, y, Math.round((x1 - x0) * run.progress), 3);
    const cp = run.course.checkpointX;
    if (cp !== null) {
      b.fillStyle = run.checkpoint ? '#f83800' : '#bcbcbc';
      b.fillRect(x0 + Math.round(((x1 - x0) * cp) / run.course.flagX), y - 2, 1, 7);
    }
    b.fillStyle = '#fcfcfc';
    b.fillRect(x1 - 1, y - 2, 1, 7);
  }

  /** Bird portrait for menus, scaled up with crisp pixels. */
  birdIcon(id: BirdId, scale: number, wing: Wing = 'mid'): HTMLCanvasElement {
    const s = birdPix(id, wing);
    return s.pix.toCanvas(scale);
  }
}
