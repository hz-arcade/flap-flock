import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import { BIRDS } from '../src/game/birds';
import { CEIL_Y, GROUND_Y, START_Y, STEP } from '../src/game/constants';
import { LEVELS } from '../src/game/levels';
import { Run, starsFor, type Phase } from '../src/game/Run';

const l11 = LEVELS[0]!;
const level = (id: string) => LEVELS.find((l) => l.id === id)!;

describe('run', () => {
  it('waits on Get Ready: no gravity, no scrolling', () => {
    const run = new Run({ mode: 'level', def: l11 });
    run.step(2);
    expect(run.phase).toBe('ready');
    expect(run.body.x).toBe(0);
    expect(run.body.y).toBe(START_Y);
  });

  it('the first press starts and flaps', () => {
    const run = new Run({ mode: 'level', def: l11 });
    run.press();
    run.tick();
    expect(run.phase).toBe('playing');
    expect(run.body.vy).toBeLessThan(0);
    expect(run.flaps).toBe(1);
  });

  it('a press during the cooldown is kept, not lost', () => {
    const run = new Run({ mode: 'level', def: l11 });
    run.press();
    run.tick();
    run.press();
    run.tick();
    expect(run.flaps).toBe(1);
    run.step(BIRDS.duck.cooldown);
    expect(run.flaps).toBe(2);
  });

  it('falls at terminal speed and dies on the ground', () => {
    const run = new Run({ mode: 'level', def: l11 });
    run.press();
    run.step(0.85);
    expect(run.body.vy).toBeCloseTo(BIRDS.duck.maxFall);
    run.step(2);
    expect(run.phase).toBe('dead');
    expect(run.cause).toBe('ground');
    expect(run.body.y).toBeCloseTo(GROUND_Y - BIRDS.duck.radius);
  });

  it('the ceiling stops the bird without killing it', () => {
    const run = new Run({ mode: 'level', def: l11 });
    let top = Infinity;
    for (let i = 0; i < 120 * 1.2; i++) {
      run.press();
      run.tick();
      top = Math.min(top, run.body.y);
    }
    expect(run.phase).toBe('playing');
    expect(top).toBe(CEIL_Y);
  });

  it('hitting a pipe: dying, then dead on landing, then a tap retries', () => {
    const run = new Run({ mode: 'level', def: l11 });
    const phases: Phase[] = [];
    run.events.phase = (p) => phases.push(p);
    run.press();
    run.tick();
    // Hover just under the ceiling until the first pipe.
    for (let i = 0; i < 120 * 6 && run.phase === 'playing'; i++) {
      if (run.body.y > 10 && run.body.vy > 0) run.press();
      run.tick();
    }
    expect(run.cause).toBe('pipe');
    run.step(2);
    expect(phases).toEqual(['playing', 'dying', 'dead']);
    run.press();
    expect(run.phase).toBe('ready');
    expect(run.body.x).toBe(0);
  });

  it('a tap right after landing does not retry yet', () => {
    const run = new Run({ mode: 'level', def: l11 });
    run.press();
    while (run.phase !== 'dead') run.tick();
    run.press();
    expect(run.phase).toBe('dead');
    run.step(0.5);
    run.press();
    expect(run.phase).toBe('ready');
  });

  it('counts passes and coins once', () => {
    const run = new Run({ mode: 'level', def: l11 });
    const passes: number[] = [];
    let coins = 0;
    run.events.pass = (n) => passes.push(n);
    run.events.coin = () => coins++;
    run.controller = new Autopilot().control;
    run.step(60);
    expect(run.phase).toBe('cleared');
    expect(passes).toEqual(Array.from({ length: l11.pipes }, (_, i) => i + 1));
    expect(coins).toBe(run.course.coins.length);
    expect(run.coins).toBe(coins);
    expect(run.result).toMatchObject({ levelId: '1-1', coins, total: coins, stars: 3 });
    expect(run.result!.time).toBeGreaterThan(25);
  });

  it('restarts from the checkpoint with the coins it had there', () => {
    const def = level('3-1');
    const run = new Run({ mode: 'level', def });
    run.controller = new Autopilot().control;
    while (!run.checkpoint) run.tick();
    const cp = run.checkpoint;
    run.controller = null;
    run.step(4);
    expect(run.phase).toBe('dead');
    expect(run.coins).toBeGreaterThanOrEqual(cp.coins);
    run.step(1);
    run.press();
    expect(run.phase).toBe('ready');
    expect(run.body.x).toBe(cp.x);
    expect(run.body.t).toBe(cp.t);
    expect(run.coins).toBe(cp.coins);
    expect(Array.from(run.coinBits)).toEqual(Array.from(cp.coinBits));
  });

  it('pelican glides only while held', () => {
    const fall = (held: boolean) => {
      const run = new Run({ mode: 'level', def: l11, bird: BIRDS.pelican });
      run.press();
      run.tick();
      run.setHeld(held);
      run.step(0.9);
      return run.body.vy;
    };
    expect(fall(true)).toBeCloseTo(BIRDS.pelican.glideFall!);
    expect(fall(false)).toBeGreaterThan(150);
    // Other birds ignore holding.
    const duck = new Run({ mode: 'level', def: l11 });
    duck.press();
    duck.tick();
    duck.setHeld(true);
    duck.step(0.9);
    expect(duck.body.vy).toBeGreaterThan(150);
  });

  it('frame() with irregular frame times matches fixed ticks', () => {
    const a = new Run({ mode: 'level', def: l11 });
    const b = new Run({ mode: 'level', def: l11 });
    a.press();
    b.press();
    const dts = [0.016, 0.017, 0.008, 0.033, 0.001, 0.05, 0.0125];
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const dt = dts[i % dts.length]!;
      total += dt;
      a.frame(dt);
    }
    b.step(Math.floor(total / STEP + 1e-9) * STEP);
    expect(a.body).toEqual(b.body);
  });

  it('stars: all coins for three, half for two', () => {
    expect(starsFor(12, 12)).toBe(3);
    expect(starsFor(6, 12)).toBe(2);
    expect(starsFor(5, 12)).toBe(1);
    expect(starsFor(0, 12)).toBe(1);
  });

  it('endless: speeds up, changes scenery and never ends on its own', () => {
    const run = new Run({ mode: 'endless', seed: 7 });
    const themes: string[] = [];
    run.events.theme = (t) => themes.push(t);
    run.controller = new Autopilot().control;
    const start = run.speed;
    while (run.body.passed < 41) run.tick();
    expect(run.speed).toBeGreaterThan(start);
    expect(themes).toEqual(['cave', 'snow']);
    expect(run.progress).toBe(0);
    run.kill();
    run.step(2);
    expect(run.phase).toBe('dead');
    run.press();
    expect(run.phase).toBe('dead');
  });
});
