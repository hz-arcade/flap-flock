/**
 * End-to-end check of the leaderboard Worker, run against a local `wrangler dev` with a
 * throwaway database. Nothing is deployed and no Cloudflare account is needed.
 *   npm run scores:e2e
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const LOCAL = 'http://localhost:5183';
const FOREIGN = 'https://evil.example';
let failures = 0;
let checks = 0;

function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function startWorker(port, vars) {
  const dir = mkdtempSync(path.join(tmpdir(), 'flap-flock-scores-'));
  const args = ['wrangler', 'dev', '--local', '--port', String(port), '--config', 'worker/wrangler.toml', '--persist-to', dir];
  for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
  const proc = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let log = '';
  proc.stdout.on('data', (d) => (log += d));
  proc.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const stop = () => {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    rmSync(dir, { recursive: true, force: true });
  };
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) return { base, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`worker did not start on port ${port}\n${log.slice(-2000)}`);
}

/**
 * Plausible endless runs: pipes passed and the whole seconds that takes (duck). These pairs are
 * also checked against shared/scoreRules.ts by test/scoreRules.test.ts.
 */
const RUNS = { 10: 28, 20: 50, 30: 69, 50: 101 };
const run = (score) => ({ score, secs: RUNS[score], flaps: RUNS[score] * 2 });
const sub = (over = {}) => ({ v: 1, gid: randomUUID(), name: 'Sam', ...run(20), bird: 0, ...over });

async function post(base, body, origin = LOCAL, raw = false, route = '/scores') {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  const r = await fetch(`${base}${route}`, { method: 'POST', headers, body: raw ? body : JSON.stringify(body) });
  return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
}

/** Recorded level clears (test/fixtures.test.ts keeps them in step with the game). */
const CLEARS = JSON.parse(readFileSync(new URL('./fixtures/clears.json', import.meta.url), 'utf8'));
const clear = (name, over = {}) => ({ v: 1, key: KEY_A, name: 'Ann', level: CLEARS[name].level, bird: CLEARS[name].bird, segs: CLEARS[name].segs, ...over });
const KEY_A = randomUUID();
const KEY_B = randomUUID();
const postClear = (base, body, origin = LOCAL) => post(base, body, origin, false, '/adventure');

async function main() {
  console.log('worker with localhost allowed and an admin token');
  const w = await startWorker(8792, { ALLOW_LOCALHOST: 'true', ADMIN_TOKEN: 'test-token' });
  try {
    const { base } = w;

    let r = await fetch(`${base}/healthz`);
    check('healthz', r.status === 200 && (await r.json()).ok === true);

    r = await fetch(`${base}/scores`);
    let b = await r.json();
    check('empty boards readable without Origin', r.status === 200 && b.all.total === 0 && b.week.top.length === 0, JSON.stringify(b));
    check('week window is 7 days starting on a Monday', b.weekEnd - b.weekStart === 7 * 86400000 && new Date(b.weekStart).getUTCDay() === 1 && b.weekStart <= b.now && b.now < b.weekEnd);
    check('responses are not cacheable', r.headers.get('cache-control') === 'no-store');

    r = await fetch(`${base}/scores`, { headers: { origin: FOREIGN } });
    check('GET from a foreign origin is refused without CORS headers', r.status === 403 && !r.headers.get('access-control-allow-origin'));

    r = await fetch(`${base}/scores`, { method: 'OPTIONS', headers: { origin: LOCAL, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    check('preflight from an allowed origin', r.status === 204 && r.headers.get('access-control-allow-origin') === LOCAL && /content-type/.test(r.headers.get('access-control-allow-headers') ?? ''));
    r = await fetch(`${base}/scores`, { method: 'OPTIONS', headers: { origin: FOREIGN, 'access-control-request-method': 'POST' } });
    check('preflight from a foreign origin grants nothing', !r.headers.get('access-control-allow-origin'));

    let p = await post(base, sub(), null);
    check('POST without Origin is refused', p.status === 403 && p.json?.error === 'origin', JSON.stringify(p.json));
    p = await post(base, sub(), FOREIGN);
    check('POST from a foreign origin is refused', p.status === 403 && p.json?.error === 'origin');

    const first = sub({ name: '  Sam \u200b Dam ' });
    p = await post(base, first);
    check('valid submission is saved', p.status === 200 && p.json?.ok === true && p.json.duplicate === false, JSON.stringify(p.json));
    check('name comes back sanitised', p.json?.entry?.name === 'Sam Dam', JSON.stringify(p.json?.entry));
    check('first entry ranks 1 on both boards', p.json?.rank?.all === 1 && p.json?.rank?.week === 1);
    check('response carries fresh boards', p.json?.boards?.all?.total === 1 && p.json.boards.week.top[0]?.id === p.json.entry.id);
    check('CORS header on the response', p.headers.get('access-control-allow-origin') === LOCAL);
    check('only public fields are exposed', JSON.stringify(Object.keys(p.json.entry).sort()) === '["at","bird","id","name","score"]');
    check('the bird is stored', p.json.entry.bird === 0);
    const firstId = p.json.entry.id;

    p = await post(base, { ...first, name: 'Other', ...run(50) });
    check('same run again returns the stored row', p.status === 200 && p.json?.duplicate === true && p.json.entry.id === firstId && p.json.entry.score === 20 && p.json.entry.name === 'Sam Dam', JSON.stringify(p.json?.entry));

    p = await post(base, sub({ score: 50, secs: RUNS[20] }));
    check('a score flown too fast is rejected as implausible', p.status === 422 && p.json?.error === 'implausible', JSON.stringify(p.json));
    p = await post(base, sub({ flaps: 5000 }));
    check('impossible flap rate is rejected', p.status === 422);
    p = await post(base, sub({ bird: 9 }));
    check('unknown bird is rejected', p.status === 400 && p.json?.field === 'bird', JSON.stringify(p.json));
    p = await post(base, sub({ score: 1.5 }));
    check('malformed field is rejected and named', p.status === 400 && p.json?.error === 'invalid' && p.json.field === 'score', JSON.stringify(p.json));
    p = await post(base, sub({ name: ' \u200b ' }));
    check('empty name is rejected', p.status === 400 && p.json?.field === 'name');
    p = await post(base, '{nope', LOCAL, true);
    check('bad JSON is rejected', p.status === 400 && p.json?.error === 'bad-json');
    p = await post(base, JSON.stringify({ ...sub(), pad: 'x'.repeat(2000) }), LOCAL, true);
    check('oversized body is rejected', p.status === 413 && p.json?.error === 'too-large', String(p.status));

    r = await fetch(`${base}/scores`);
    b = await r.json();
    check('rejected submissions stored nothing', b.all.total === 1, String(b.all.total));

    p = await post(base, sub({ name: '小明', ...run(30), bird: 2 }));
    check('higher score takes rank 1', p.status === 200 && p.json.rank.all === 1 && p.json.boards.all.top[0].name === '小明' && p.json.boards.all.top[1].id === firstId, JSON.stringify(p.json?.rank));
    p = await post(base, sub({ name: 'Tie' }));
    check('equal score ranks after the earlier one', p.status === 200 && p.json.rank.all === 3 && p.json.boards.all.top[1].id === firstId, JSON.stringify(p.json?.rank));
    const tieId = p.json.entry.id;

    r = await fetch(`${base}/scores?limit=2`, { headers: { origin: LOCAL } });
    b = await r.json();
    check('limit trims the list but not the total', b.all.top.length === 2 && b.all.total === 3 && b.week.total === 3, JSON.stringify({ n: b.all.top.length, t: b.all.total }));

    // Admin removal.
    r = await fetch(`${base}/scores/${tieId}`, { method: 'DELETE' });
    check('delete without a token is refused', r.status === 403);
    r = await fetch(`${base}/scores/${tieId}`, { method: 'DELETE', headers: { authorization: 'Bearer wrong-token' } });
    check('delete with a wrong token is refused', r.status === 403);
    r = await fetch(`${base}/scores/${tieId}`, { method: 'DELETE', headers: { authorization: 'Bearer test-token' } });
    check('delete with the token removes the row', r.status === 200);
    r = await fetch(`${base}/scores/${tieId}`, { method: 'DELETE', headers: { authorization: 'Bearer test-token' } });
    check('deleting it again reports not found', r.status === 404);
    b = await (await fetch(`${base}/scores`)).json();
    check('removed row is gone from the board', b.all.total === 2 && !b.all.top.some((e) => e.id === tieId));

    // Adventure: clears are replayed, the best per level counts, players rank by total stars.
    let a = await (await fetch(`${base}/adventure`)).json();
    check('adventure board starts empty', a.total === 0 && a.top.length === 0, JSON.stringify(a));
    p = await postClear(base, clear('1-1-low'));
    check('a replayed clear is accepted', p.status === 200 && p.json?.ok === true && p.json.level.stars === CLEARS['1-1-low'].stars && p.json.level.coins === CLEARS['1-1-low'].coins, JSON.stringify(p.json));
    check('the player appears with those stars at rank 1', p.json?.player?.stars === CLEARS['1-1-low'].stars && p.json.player.rank === 1 && p.json.board.top[0]?.name === 'Ann');
    check('the device key is not exposed', !JSON.stringify(p.json).includes(KEY_A) && JSON.stringify(Object.keys(p.json.player).sort()) === '["at","bird","id","name","rank","stars"]');
    const annId = p.json.player.id;
    p = await postClear(base, clear('1-1'));
    check('a better clear of the same level replaces it', p.status === 200 && p.json.level.improved === true && p.json.player.stars === 3, JSON.stringify(p.json?.level));
    p = await postClear(base, clear('1-1-low'));
    check('a worse clear changes nothing', p.status === 200 && p.json.level.improved === false && p.json.player.stars === 3 && p.json.level.stars === 3);
    p = await postClear(base, clear('1-2'));
    check('stars add up across levels', p.json?.player?.stars === 6, JSON.stringify(p.json?.player));
    p = await postClear(base, clear('3-1-flag'));
    check('a clear with a restart at the halfway flag is replayed too', p.status === 200 && p.json.player.stars === 9, JSON.stringify(p.json));
    const forged = clear('1-2', { segs: [{ p: CLEARS['1-2'].segs[0].p.slice(0, -10), h: [] }] });
    p = await postClear(base, forged);
    check('inputs that do not clear the level are refused', p.status === 422 && p.json?.error === 'implausible', JSON.stringify(p.json));
    p = await postClear(base, clear('1-2', { level: '4-2' }));
    check('inputs from another level are refused', p.status === 422);
    p = await postClear(base, clear('1-1', { key: 'nope' }));
    check('a malformed key is rejected', p.status === 400 && p.json?.field === 'key');
    p = await postClear(base, clear('1-1', { segs: [{ p: [1, -4], h: [] }] }));
    check('malformed inputs are rejected', p.status === 400 && p.json?.field === 'segs');
    p = await post(base, JSON.stringify({ ...clear('1-1'), pad: 'x'.repeat(40000) }), LOCAL, true, '/adventure');
    check('oversized clear is rejected', p.status === 413);
    p = await postClear(base, clear('1-1'), null);
    check('clear without Origin is refused', p.status === 403);

    p = await postClear(base, clear('1-1', { key: KEY_B, name: 'Bo' }));
    check('a second player with fewer stars ranks below', p.json?.player?.rank === 2, JSON.stringify(p.json?.player));
    await postClear(base, clear('1-2', { key: KEY_B, name: 'Bo' }));
    p = await postClear(base, clear('3-1-flag', { key: KEY_B, name: 'Bo' }));
    check('equal stars: whoever got there first stays ahead', p.json?.player?.stars === 9 && p.json.player.rank === 2 && p.json.board.top[0].id === annId, JSON.stringify(p.json?.board?.top));
    p = await postClear(base, clear('1-1', { name: 'Ann B' }));
    check('a later submission renames the player', p.json?.player?.name === 'Ann B' && p.json.player.id === annId);
    a = await (await fetch(`${base}/adventure?limit=1`, { headers: { origin: LOCAL } })).json();
    check('adventure board trims to the limit but counts everyone', a.top.length === 1 && a.total === 2 && a.top[0].stars === 9);
    r = await fetch(`${base}/adventure`, { headers: { origin: FOREIGN } });
    check('adventure GET from a foreign origin is refused', r.status === 403);

    // Rate limit: 10 stored submissions per window. Three are stored so far.
    let last;
    for (let i = 0; i < 7; i++) last = await post(base, sub({ name: `P${i}`, ...run(10) }));
    check('tenth submission in the window is still accepted', last.status === 200, String(last.status));
    p = await post(base, sub({ name: 'Flood' }));
    check('eleventh is rate limited with retry-after', p.status === 429 && p.json?.error === 'rate' && p.json.retryAfter > 0 && Number(p.headers.get('retry-after')) > 0, JSON.stringify(p.json));
    p = await post(base, first);
    check('a repeat of a stored run still answers while rate limited', p.status === 200 && p.json.duplicate === true);

    r = await fetch(`${base}/nope`);
    check('unknown path', r.status === 404);
  } finally {
    w.stop();
  }

  console.log('worker with production settings (no localhost, no admin token)');
  const w2 = await startWorker(8793, {});
  try {
    const { base } = w2;
    let p = await post(base, sub(), LOCAL);
    check('localhost origin is refused in production settings', p.status === 403 && p.json?.error === 'origin', JSON.stringify(p.json));
    p = await post(base, sub(), 'https://arcade.hz.ax');
    check('the live site origin is accepted', p.status === 200 && p.json?.ok === true, JSON.stringify(p.json));
    p = await post(base, sub(), 'https://arcade.hz.ax.evil.example');
    check('a look-alike origin is refused', p.status === 403);
    p = await postClear(base, clear('1-1'), LOCAL);
    check('clears from localhost are refused in production settings', p.status === 403);
    p = await postClear(base, clear('1-1'), 'https://arcade.hz.ax');
    check('clears from the live site are accepted', p.status === 200 && p.json?.player?.stars === 3, JSON.stringify(p.json));
    const r = await fetch(`${base}/scores/1`, { method: 'DELETE', headers: { authorization: 'Bearer undefined' } });
    check('delete route does not exist without a configured token', r.status === 404, String(r.status));
    const b = await (await fetch(`${base}/scores`)).json();
    check('row survived the refused delete', b.all.total === 1);
  } finally {
    w2.stop();
  }

  console.log(`${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
