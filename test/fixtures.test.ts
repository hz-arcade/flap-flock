import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import { BIRDS } from '../src/game/birds';
import { levelById } from '../src/game/levels';
import { encodeLog, decodeLog, verifyClear } from '../src/game/replay';
import { Run } from '../src/game/Run';
import { BEGINNER, HumanBot } from './helpers/bots';

/**
 * Recorded clears for scripts/scores-e2e.mjs and scripts/smoke-lb.mjs (which cannot run the
 * TypeScript game). Regenerate with UPDATE_FIXTURES=1 npx vitest run test/fixtures.test.ts
 * after a change to the physics or the levels; this test fails until then.
 */
const FILE = new URL('../scripts/fixtures/clears.json', import.meta.url);

interface Fixture {
  level: string;
  bird: number;
  stars: number;
  coins: number;
  segs: ReturnType<typeof encodeLog>[];
}

function planner(id: string): Run {
  const run = new Run({ mode: 'level', def: levelById(id)!, bird: BIRDS.duck });
  run.controller = new Autopilot().control;
  while (run.phase !== 'cleared') run.tick();
  return run;
}

function build(): Record<string, Fixture> {
  const out: Record<string, Fixture> = {};
  const put = (name: string, run: Run) => {
    out[name] = { level: run.def!.id, bird: 0, stars: run.result!.stars, coins: run.coins, segs: run.replay()!.map(encodeLog) };
  };
  put('1-1', planner('1-1'));
  put('1-2', planner('1-2'));
  // A sloppier clear of 1-1 with fewer stars.
  for (let seed = 0; seed < 200; seed++) {
    const run = new Run({ mode: 'level', def: levelById('1-1')!, bird: BIRDS.duck });
    run.controller = new HumanBot(BEGINNER, seed).control;
    for (let i = 0; i < 120 * 60 && run.phase !== 'cleared' && run.phase !== 'dead'; i++) run.tick();
    if (run.phase === 'cleared' && run.result!.stars < 3) {
      put('1-1-low', run);
      break;
    }
  }
  // 3-1 with a crash after the halfway flag and a restart from it.
  const run = new Run({ mode: 'level', def: levelById('3-1')!, bird: BIRDS.duck });
  run.controller = new Autopilot().control;
  while (!run.checkpoint) run.tick();
  run.controller = null;
  while (run.phase !== 'dead' || !run.canRetry) run.tick();
  run.press();
  run.controller = new Autopilot().control;
  while ((run.phase as string) !== 'cleared') run.tick();
  put('3-1-flag', run);
  return out;
}

describe('replay fixtures', () => {
  it('are current', () => {
    if (process.env.UPDATE_FIXTURES || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(build(), null, 1) + '\n');
    const fixtures = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, Fixture>;
    expect(Object.keys(fixtures).sort()).toEqual(['1-1', '1-1-low', '1-2', '3-1-flag']);
    expect(fixtures['3-1-flag']!.segs).toHaveLength(2);
    expect(fixtures['1-1-low']!.stars).toBeLessThan(3);
    for (const [name, f] of Object.entries(fixtures)) {
      const v = verifyClear(f.level, f.bird, f.segs.map((s) => decodeLog(s)!));
      expect(v, `${name}: regenerate with UPDATE_FIXTURES=1`).toEqual({ ok: true, coins: f.coins, total: levelById(f.level)!.coins, stars: f.stars });
    }
  });
});
