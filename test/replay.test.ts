import { describe, expect, it } from 'vitest';
import { STARS_MAX } from '../shared/scoreRules';
import { Autopilot } from '../src/game/autopilot';
import { BIRDS, BIRD_ORDER, type BirdId } from '../src/game/birds';
import { LEVELS, levelById } from '../src/game/levels';
import { decodeLog, encodeLog, validateClear, verifyClear } from '../src/game/replay';
import { Run } from '../src/game/Run';
import { BEGINNER, HumanBot } from './helpers/bots';

const roundTrip = (run: Run) => run.replay()!.map((l) => decodeLog(encodeLog(l))!);

function clearWithPlanner(id: string, bird: BirdId): Run {
  const run = new Run({ mode: 'level', def: levelById(id)!, bird: BIRDS[bird] });
  run.controller = new Autopilot().control;
  for (let i = 0; i < 120 * 90 && run.phase !== 'cleared'; i++) run.tick();
  return run;
}

/** A human-like session: crash, wait, tap to retry (from the flag when there is one), until cleared. */
function clearLikeAHuman(id: string, bird: BirdId, seed: number): Run | null {
  const run = new Run({ mode: 'level', def: levelById(id)!, bird: BIRDS[bird] });
  let attempt = 0;
  let bot = new HumanBot(BEGINNER, seed);
  run.controller = (r) => {
    if (r.phase === 'dead' && r.canRetry) {
      r.setHeld(attempt % 3 === 0); // sometimes still holding the button when retrying
      r.press();
      attempt++;
      bot = new HumanBot(BEGINNER, seed + attempt);
      return;
    }
    bot.control(r);
  };
  for (let i = 0; i < 120 * 60 * 15 && run.phase !== 'cleared'; i++) run.tick();
  return run.phase === 'cleared' ? run : null;
}

describe('replays', () => {
  it('re-fly every level with every bird to the same coins', () => {
    for (const def of LEVELS) {
      for (const bird of BIRD_ORDER) {
        const run = clearWithPlanner(def.id, bird);
        expect(run.phase, `${def.id} ${bird}`).toBe('cleared');
        const v = verifyClear(def.id, BIRD_ORDER.indexOf(bird), roundTrip(run));
        expect(v, `${def.id} ${bird}`).toEqual({ ok: true, coins: run.coins, total: run.course.coins.length, stars: run.result!.stars });
      }
    }
  });

  it('cover crashes, restarts at the halfway flag and pelican glides', () => {
    const cases: Array<[string, BirdId, number]> = [
      ['1-1', 'pelican', 1],
      ['1-2', 'pelican', 2],
      ['3-1', 'duck', 3],
      ['3-1', 'pelican', 4],
      ['3-2', 'pelican', 5],
      ['4-1', 'chicken', 6],
      ['2-2', 'penguin', 7],
    ];
    let withFlag = 0;
    for (const [id, bird, seed] of cases) {
      const run = clearLikeAHuman(id, bird, seed);
      if (!run) continue;
      const logs = roundTrip(run);
      if (logs.length === 2) withFlag++;
      const v = verifyClear(id, BIRD_ORDER.indexOf(bird), logs);
      expect(v, `${id} ${bird}`).toEqual({ ok: true, coins: run.coins, total: run.course.coins.length, stars: run.result!.stars });
    }
    expect(withFlag).toBeGreaterThan(0);
  });

  it('a restart at the flag replays with the coins from before the flag', () => {
    const def = levelById('3-1')!;
    const run = new Run({ mode: 'level', def, bird: BIRDS.duck });
    run.controller = new Autopilot().control;
    while (!run.checkpoint) run.tick();
    run.controller = null;
    while (run.phase !== 'dead' || !run.canRetry) run.tick();
    run.press();
    run.controller = new Autopilot().control;
    while ((run.phase as string) !== 'cleared') run.tick();
    const logs = roundTrip(run);
    expect(logs).toHaveLength(2);
    expect(verifyClear('3-1', 0, logs)).toMatchObject({ ok: true, coins: run.coins });
  });

  it('rejects inputs that do not clear the level', () => {
    const run = clearWithPlanner('1-2', 'duck');
    const [log] = roundTrip(run);
    // Lose a run of presses in the middle: the bird falls.
    const holed = { p: log!.p.filter((_, i) => i < 20 || i > 26), h: log!.h };
    expect(verifyClear('1-2', 0, [holed]).ok).toBe(false);
    // Another bird with the same inputs does not make it either.
    expect(verifyClear('1-2', BIRD_ORDER.indexOf('eagle'), [log!]).ok).toBe(false);
    // No inputs at all, or a second segment on a level without a flag.
    expect(verifyClear('1-2', 0, [{ p: [], h: [] }])).toEqual({ ok: false, reason: 'never-started' });
    expect(verifyClear('1-2', 0, [log!, log!])).toEqual({ ok: false, reason: 'no-checkpoint' });
    // The inputs of 1-2 on the castle level.
    expect(verifyClear('4-2', 0, [log!]).ok).toBe(false);
  });

  it('encodes as small gaps and validates submissions', () => {
    expect(encodeLog({ p: [1, 40, 40, 95], h: [] })).toEqual({ p: [1, 39, 0, 55], h: [] });
    expect(decodeLog({ p: [1, 39, 0, 55], h: [2] })).toEqual({ p: [1, 40, 40, 95], h: [2] });
    expect(decodeLog({ p: [1, -1], h: [] })).toBeNull();
    expect(decodeLog({ p: [1.5], h: [] })).toBeNull();
    const good = { v: 1, key: '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', name: ' Sam ', level: '1-1', bird: 0, segs: [{ p: [1, 30], h: [] }] };
    const ok = validateClear(good);
    expect(ok.ok && ok.value.name).toBe('Sam');
    for (const [field, body] of [
      ['key', { ...good, key: 'x' }],
      ['name', { ...good, name: '' }],
      ['level', { ...good, level: '9-9' }],
      ['bird', { ...good, bird: 6 }],
      ['segs', { ...good, segs: [] }],
      ['segs', { ...good, segs: [{ p: 'x' }] }],
      ['segs', { ...good, segs: [good.segs[0], good.segs[0], good.segs[0]] }],
    ] as const) {
      expect(validateClear(body), field).toEqual({ ok: false, field });
    }
    expect(STARS_MAX).toBe(LEVELS.length * 3);
  });

  it('checks a clear quickly enough for a Worker', () => {
    const run = clearWithPlanner('4-2', 'pelican');
    const logs = roundTrip(run);
    verifyClear('4-2', 2, logs);
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) verifyClear('4-2', 2, logs);
    const ms = (performance.now() - t0) / 5;
    console.log(`verifyClear 4-2: ${ms.toFixed(2)} ms on this machine`);
    expect(ms).toBeLessThan(40);
  });
});
