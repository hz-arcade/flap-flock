import { describe, expect, it } from 'vitest';
import { Autopilot } from '../src/game/autopilot';
import { BIRDS, type BirdId } from '../src/game/birds';
import { LEVELS, type LevelDef } from '../src/game/levels';
import { Run } from '../src/game/Run';
import { BEGINNER, PRACTISED, HumanBot, flyOnce, type BotProfile } from './helpers/bots';

/**
 * Difficulty calibration: seeded human-like bots (test/helpers/bots.ts) fly every level many
 * times. The numbers are deterministic, so this cannot flake; it fails when a tuning change
 * makes level 1 hard for beginners or breaks the difficulty curve. `npm run calibrate` uses
 * more trials and prints the same table.
 *
 * full = clears the whole level in one go. half = for levels with a checkpoint flag, the
 * pass rate of the harder half, which is what a player retrying from the flag experiences.
 */
const TRIALS = Number(process.env.CALIBRATE_TRIALS ?? 120);

type Saved = NonNullable<Run['checkpoint']>;
const checkpoints = new Map<string, Saved>();
/** The checkpoint state as reached by the planner, computed once per level and bird. */
function checkpointOf(def: LevelDef, bird: BirdId): Saved {
  const key = `${def.id}:${bird}`;
  let cp = checkpoints.get(key);
  if (!cp) {
    const run = new Run({ mode: 'level', def, bird: BIRDS[bird] });
    flyOnce(run, new Autopilot({ coins: false }).control, 'checkpoint');
    cp = run.checkpoint!;
    checkpoints.set(key, cp);
  }
  return cp;
}

interface Rate {
  full: number;
  half: number;
}

const cache = new Map<string, Rate>();
function rate(def: LevelDef, bird: BirdId, profile: BotProfile): Rate {
  const key = `${profile === BEGINNER ? 'b' : 'p'}:${bird}:${def.id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let full = 0;
  let first = 0;
  let second = 0;
  for (let i = 0; i < TRIALS; i++) {
    const seed = i * 7919 + def.seed * 31 + bird.length;
    const run = new Run({ mode: 'level', def, bird: BIRDS[bird] });
    const bot = new HumanBot(profile, seed);
    if (flyOnce(run, bot.control)) full++;
    if (run.checkpoint) first++;
    if (!def.checkpoint) continue;
    // Second half: restart from the checkpoint flag, as a player does after a crash.
    const run2 = new Run({ mode: 'level', def, bird: BIRDS[bird] });
    run2.checkpoint = checkpointOf(def, bird);
    run2.retry();
    if (flyOnce(run2, new HumanBot(profile, seed + 1).control)) second++;
  }
  const r = { full: full / TRIALS, half: def.checkpoint ? Math.min(first, second) / TRIALS : full / TRIALS };
  cache.set(key, r);
  return r;
}

const pct = (v: number) => `${Math.round(v * 100)}`;

describe('calibration', () => {
  it('prints the table', () => {
    const rows: string[] = [`trials ${TRIALS}         ` + LEVELS.map((l) => l.id.padStart(8)).join(''), `full / harder half (checkpoint levels)`];
    const lines: Array<[string, BirdId, BotProfile]> = [
      ['beginner', 'duck', BEGINNER],
      ['beginner', 'chicken', BEGINNER],
      ['beginner', 'pelican', BEGINNER],
      ['beginner', 'sparrow', BEGINNER],
      ['beginner', 'penguin', BEGINNER],
      ['beginner', 'eagle', BEGINNER],
      ['practised', 'duck', PRACTISED],
      ['practised', 'pelican', PRACTISED],
      ['practised', 'eagle', PRACTISED],
    ];
    for (const [tag, bird, profile] of lines) {
      rows.push(
        `${tag.padEnd(9)} ${bird.padEnd(8)}` +
          LEVELS.map((l) => {
            const r = rate(l, bird, profile);
            return (l.checkpoint ? `${pct(r.full)}/${pct(r.half)}` : pct(r.full)).padStart(8);
          }).join(''),
      );
    }
    console.log(rows.join('\n'));
  });

  it('level 1-1 is easy for beginners', () => {
    const l11 = LEVELS[0]!;
    expect(rate(l11, 'duck', BEGINNER).full).toBeGreaterThanOrEqual(0.92);
    expect(rate(l11, 'pelican', BEGINNER).full).toBeGreaterThanOrEqual(0.85);
    expect(rate(l11, 'chicken', BEGINNER).full).toBeGreaterThanOrEqual(0.7);
    // The eagle is the expert bird.
    expect(rate(l11, 'eagle', BEGINNER).full).toBeLessThan(rate(l11, 'duck', BEGINNER).full);
  });

  it('levels get harder', () => {
    for (const bird of ['duck', 'pelican'] as const) {
      for (let i = 1; i < LEVELS.length; i++) {
        const prev = rate(LEVELS[i - 1]!, bird, BEGINNER).full;
        expect(rate(LEVELS[i]!, bird, BEGINNER).full, `${bird} ${LEVELS[i]!.id}`).toBeLessThanOrEqual(prev + 0.05);
      }
    }
  });

  it('every level is possible for a practised player, and the last one is hard', () => {
    for (const l of LEVELS) expect(rate(l, 'duck', PRACTISED).half, l.id).toBeGreaterThanOrEqual(0.1);
    const last = rate(LEVELS[LEVELS.length - 1]!, 'duck', PRACTISED).half;
    expect(last).toBeLessThanOrEqual(0.6);
  });

  it('practice helps on every level', () => {
    for (const l of LEVELS) expect(rate(l, 'duck', PRACTISED).full + 0.03, l.id).toBeGreaterThanOrEqual(rate(l, 'duck', BEGINNER).full);
  });

  it('the penguin is the bird for water', () => {
    const water = LEVELS.find((l) => l.medium === 'water')!;
    expect(rate(water, 'penguin', BEGINNER).full).toBeGreaterThanOrEqual(rate(water, 'duck', BEGINNER).full + 0.1);
  });
});
