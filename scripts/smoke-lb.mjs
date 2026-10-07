/**
 * Leaderboard in a real browser against a real (local) Worker. Builds the game with the
 * scores URL baked in, starts `wrangler dev` with a throwaway database, and drives the
 * name entry, the board screen and the failure paths in headless Chromium.
 *   npm run smoke:lb
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), '.cache/ms-playwright/chromium-1223/chrome-linux/chrome');
const OUT = process.env.OUT_DIR ?? '/tmp';
const API = 'http://127.0.0.1:8794';
const SITE = 'http://localhost:4185/flap-flock/';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

let checks = 0;
let failures = 0;
function check(name, cond, detail = '') {
  checks++;
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function group(proc) {
  return () => {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  };
}

console.log('building with the scores URL baked in');
const build = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-lb', '--logLevel', 'warn'], { env: { ...process.env, VITE_SCORES_URL: API }, stdio: 'inherit' });
if (build.status !== 0) process.exit(1);

const db = mkdtempSync(path.join(tmpdir(), 'flap-flock-scores-'));
const worker = spawn('npx', ['wrangler', 'dev', '--local', '--port', '8794', '--config', 'worker/wrangler.toml', '--persist-to', db, '--var', 'ALLOW_LOCALHOST:true'], { stdio: 'ignore', detached: true });
const site = spawn('npx', ['vite', 'preview', '--outDir', 'dist-lb', '--port', '4185', '--strictPort'], { stdio: 'ignore', detached: true });
const stopAll = () => {
  group(worker)();
  group(site)();
  rmSync(db, { recursive: true, force: true });
};
process.on('exit', stopAll);

async function up(url, needle) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok && (!needle || (await r.text()).includes(needle))) return;
    } catch {
      /* not yet */
    }
    await wait(500);
  }
  throw new Error(`${url} did not come up`);
}
await up(`${API}/healthz`);
await up(SITE, 'Flap Flock');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });

async function open(viewport, opts = {}) {
  // Service workers are blocked so request interception sees every call to the API.
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, locale: opts.locale ?? 'en-US', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  const posts = [];
  const gets = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (!r.url().startsWith(API)) return;
    if (r.method() === 'POST') posts.push(r.postDataJSON());
    if (r.method() === 'GET') gets.push(r.url());
  });
  await page.goto(SITE + (opts.query ?? ''), { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game);
  return { ctx, page, errors, posts, gets };
}

const state = (page) => page.evaluate(() => window.__game.state());

/**
 * Fly an honest endless run: a real first flap, then the planner for `seconds` of game time,
 * then crash. Returns what the game knows about the run.
 */
async function finishRun(page, start = '#endlessBtn', seconds = 12, tap = false) {
  if (tap) await page.tap(start);
  else await page.click(start);
  await page.waitForFunction(() => window.__game.state().phase === 'ready' && window.__game.state().runMode === 'endless');
  await page.evaluate(() => window.__game.run.press());
  await page.evaluate((s) => {
    window.__game.autopilot(true);
    window.__game.step(s);
    window.__game.kill();
  }, seconds);
  await page.waitForFunction(() => window.__game.state().screen === 'endless', null, { timeout: 10000 });
  await page.waitForSelector('#againBtn');
  return page.evaluate(() => ({ score: window.__game.run.body.passed, flaps: window.__game.run.flaps, secs: Math.ceil(window.__game.run.body.t) }));
}

const phase = (page) => page.locator('#submitBox').getAttribute('data-phase');

try {
  /* ------------------------------------------------------------------ */
  console.log('desktop: board screen, name entry, double click, language switch, Enter key');
  {
    const { ctx, page, errors, posts, gets } = await open({ width: 1280, height: 800 }, { query: '?lang=en' });
    check('feature is on in this build', await page.evaluate(() => window.__game.leaderboard.enabled));

    await page.click('#lbBtn');
    await page.waitForSelector('#boardPanel .lb-note');
    await page.waitForFunction(() => document.querySelector('#boardPanel .lb-note')?.textContent?.includes('No scores yet'));
    check('empty board says so', true);
    await page.click('#tabWeek');
    check('weekly tab shows the reset countdown', /Resets in \d+d \d+h/.test((await page.locator('.lb-resets').textContent()) ?? ''));
    check('weekly tab is marked selected', (await page.locator('#tabWeek').getAttribute('aria-selected')) === 'true');
    await page.screenshot({ path: `${OUT}/flock-lb-empty.png` });
    await page.click('#backBtn');
    await page.waitForSelector('#playBtn');
    check('Back returns to the title', (await page.locator('#boardPanel').count()) === 0);

    const g1 = await finishRun(page);
    check('honest run passed some pipes', g1.score >= 3, JSON.stringify(g1));
    check('name field starts empty and Submit is disabled', (await page.inputValue('#nameInput')) === '' && (await page.locator('#submitBtn').isDisabled()));
    check('the hint says the name is public', /shown publicly/.test((await page.locator('#nameHint').textContent()) ?? ''));

    const mutedBefore = await page.evaluate(() => window.__game.audio.muted);
    await page.click('#nameInput');
    await page.keyboard.type('Sam  Dam mprw', { delay: 15 });
    check('typed letters all arrive (space, m, p, r and w are game keys)', (await page.inputValue('#nameInput')) === 'Sam  Dam mprw', await page.inputValue('#nameInput'));
    check('typing did not toggle mute', (await page.evaluate(() => window.__game.audio.muted)) === mutedBefore);
    const st = await state(page);
    check('typing did not restart or pause', st.screen === 'endless' && st.phase === 'dead' && !st.paused, JSON.stringify(st));
    await page.fill('#nameInput', 'x'.repeat(40));
    check('name is clipped to 16 characters', (await page.inputValue('#nameInput')).length === 16);
    await page.fill('#nameInput', '   ');
    check('blank name keeps Submit disabled', await page.locator('#submitBtn').isDisabled());
    await page.fill('#nameInput', 'Sam Dam');
    await page.screenshot({ path: `${OUT}/flock-lb-entry.png` });

    await page.dblclick('#submitBtn');
    await page.waitForSelector('#submitBox[data-phase="done"]', { timeout: 10000 });
    await wait(300);
    check('double click sent exactly one submission', posts.length === 1, String(posts.length));
    check(
      'submission carries the run',
      posts[0]?.score === g1.score && posts[0]?.flaps === g1.flaps && posts[0]?.secs === g1.secs && posts[0]?.bird === 0 && posts[0]?.name === 'Sam Dam' && /^[0-9a-f-]{36}$/.test(posts[0]?.gid ?? ''),
      JSON.stringify({ post: posts[0], g1 }),
    );
    const status = (await page.locator('.submit-status').textContent()) ?? '';
    check('rank is announced', status.includes('All-time #1') && status.includes('This week #1'), status);
    const me = page.locator('#submitBox .lb-row.me');
    check(
      'own row is highlighted with name, bird, score and a You tag',
      (await me.count()) === 1 && ((await me.textContent()) ?? '').includes('Sam Dam') && (await me.locator('.lb-bird canvas').count()) === 1 && ((await me.locator('.lb-score').textContent()) ?? '') === String(g1.score) && ((await me.locator('.lb-you').textContent()) ?? '') === 'You',
    );
    check('name field is gone after saving', (await page.locator('#nameInput').count()) === 0);
    await page.screenshot({ path: `${OUT}/flock-lb-done.png` });

    await page.evaluate(() => window.__game.setLang('zh-TW'));
    await wait(200);
    const zh = (await page.locator('.submit-status').textContent()) ?? '';
    check('result survives a language switch', (await phase(page)) === 'done' && zh.includes('總榜第 1 名') && (await page.locator('#submitBox .lb-row.me').count()) === 1, zh);
    await page.evaluate(() => window.__game.setLang('en'));
    await wait(200);

    const getsBefore = gets.length;
    await page.click('#boardBtn');
    await page.waitForSelector('#boardPanel .lb-row.me');
    check('board opens from game over with the fresh data, without another request', gets.length === getsBefore);
    await page.click('#tabWeek');
    check('weekly board has the row too', (await page.locator('#boardPanel .lb-row.me').count()) === 1);
    await page.screenshot({ path: `${OUT}/flock-lb-board.png` });
    await page.click('#backBtn');
    await page.waitForSelector('#submitBox');
    check('Back returns to the saved game-over panel', (await phase(page)) === 'done');

    const g2 = await finishRun(page, '#againBtn', 8);
    check('last name is prefilled next time', (await page.inputValue('#nameInput')) === 'Sam Dam');

    // Input methods: Enter that confirms a candidate must not send.
    const sentDuring = await page.evaluate(async () => {
      const input = document.getElementById('nameInput');
      const form = input.closest('form');
      input.dispatchEvent(new CompositionEvent('compositionstart'));
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 50));
      const a = document.getElementById('submitBox').dataset.phase;
      input.dispatchEvent(new CompositionEvent('compositionend'));
      form.requestSubmit();
      await new Promise((r) => setTimeout(r, 30));
      return [a, document.getElementById('submitBox').dataset.phase];
    });
    check('Enter during or right after composition does not submit', sentDuring.join() === 'idle,idle' && posts.length === 1, sentDuring.join());
    await wait(150);
    await page.focus('#nameInput');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#submitBox[data-phase="done"]', { timeout: 10000 });
    check('Enter in the field submits', posts.length === 2 && posts[1]?.gid !== posts[0]?.gid && posts[1]?.score === g2.score, String(posts.length));
    check('both of this device’s rows are highlighted', (await page.locator('#submitBox .lb-row.me').count()) === 2);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('desktop: a tampered run is refused by the server');
  {
    const { ctx, page, errors, posts } = await open({ width: 1280, height: 800 }, { query: '?lang=en' });
    await page.click('#endlessBtn');
    await page.waitForFunction(() => window.__game.state().phase === 'ready');
    await page.evaluate(() => {
      window.__game.run.press();
      window.__game.autopilot(true);
      window.__game.step(2);
      // 50 pipes in two seconds: the debug hook edits the score directly.
      window.__game.cheat(50);
      window.__game.kill();
    });
    await page.waitForSelector('#nameInput', { timeout: 10000 });
    await page.fill('#nameInput', 'Cheater');
    await page.click('#submitBtn');
    await page.waitForSelector('#submitBox[data-phase="final"]', { timeout: 10000 });
    check('server refuses it and the panel says so', ((await page.locator('#submitStatus').textContent()) ?? '').includes('couldn’t be accepted'));
    check('no retry is offered for a refusal', (await page.locator('#submitBtn').count()) === 0 && posts.length === 1);
    const board = await (await fetch(`${API}/scores`)).json();
    check('nothing was stored for it', !board.all.top.some((e) => e.name === 'Cheater'));
    await page.click('#againBtn');
    await page.waitForFunction(() => window.__game.state().phase === 'ready' && window.__game.state().passed === 0);
    check('Fly again still works', true);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('desktop: server error, offline, then a successful retry');
  {
    const { ctx, page, errors, posts } = await open({ width: 1280, height: 800 }, { query: '?lang=en' });
    const corsHeaders = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
    let mode = '500';
    await page.route(`${API}/**`, (route) => {
      if (mode === 'pass') return route.continue();
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders });
      if (mode === 'offline') return route.abort('internetdisconnected');
      return route.fulfill({ status: 500, headers: corsHeaders, contentType: 'text/html', body: '<h1>oops</h1>' });
    });

    await page.click('#lbBtn');
    await page.waitForSelector('#lbRetry');
    check('board load failure offers Retry', ((await page.locator('#boardPanel .lb-note').textContent()) ?? '').includes('Couldn’t load'));
    mode = 'pass';
    await page.click('#lbRetry');
    await page.waitForSelector('#boardPanel .lb-row');
    check('Retry loads the board', (await page.locator('#boardPanel .lb-row').count()) >= 2);
    check('rows from another browser are not marked as mine', (await page.locator('#boardPanel .lb-row.me').count()) === 0);
    await page.click('#backBtn');

    mode = '500';
    const g = await finishRun(page);
    await page.fill('#nameInput', 'Retry Ann');
    await page.click('#submitBtn');
    await page.waitForSelector('#submitBox[data-phase="error"]', { timeout: 10000 });
    check('server error is explained', ((await page.locator('#submitStatus').textContent()) ?? '').includes('having trouble'));
    check('the button becomes Retry and the name stays editable', ((await page.locator('#submitBtn').textContent()) ?? '') === 'Retry' && (await page.inputValue('#nameInput')) === 'Retry Ann' && (await page.locator('#nameInput').isEnabled()));
    check('Fly again and Menu stay usable', (await page.locator('#againBtn').isEnabled()) && (await page.locator('#menuBtn').isEnabled()));
    await page.screenshot({ path: `${OUT}/flock-lb-error.png` });

    mode = 'offline';
    await page.click('#submitBtn');
    await page.waitForFunction(() => document.getElementById('submitStatus')?.textContent?.includes('Check your connection'), null, { timeout: 10000 });
    check('offline is explained', (await phase(page)) === 'error');

    mode = 'pass';
    await page.fill('#nameInput', 'Ann');
    await page.click('#submitBtn');
    await page.waitForSelector('#submitBox[data-phase="done"]', { timeout: 10000 });
    check('retry succeeds with the edited name', ((await page.locator('#submitBox .lb-row.me').textContent()) ?? '').includes('Ann'));
    check('all attempts were the same run', posts.length === 3 && new Set(posts.map((p) => p.gid)).size === 1 && posts[2].score === g.score, JSON.stringify(posts.map((p) => p.gid)));
    const board = await (await fetch(`${API}/scores`)).json();
    check('it was stored once', board.all.top.filter((e) => e.name === 'Ann').length === 1 && !board.all.top.some((e) => e.name === 'Retry Ann'));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('phone: touch, Chinese name, another bird');
  {
    const { ctx, page, errors, posts } = await open({ width: 390, height: 844 }, { dpr: 3, touch: true, locale: 'zh-CN', query: '?unlock=all' });
    await page.evaluate(() => window.__game.pickBird('penguin'));
    await page.evaluate(() => window.__game.menu('title'));
    const g = await finishRun(page, '#endlessBtn', 12, true);
    await page.tap('#nameInput');
    await page.keyboard.insertText('小明🐧');
    await wait(500);
    check('field font is large enough not to zoom on iOS', (await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('nameInput')).fontSize))) >= 16);
    check('text in the field can be selected', (await page.evaluate(() => getComputedStyle(document.getElementById('nameInput')).userSelect)) === 'text');
    await page.screenshot({ path: `${OUT}/flock-lb-phone-entry.png` });
    await page.tap('#submitBtn');
    await page.waitForSelector('#submitBox[data-phase="done"]', { timeout: 10000 });
    check('Chinese name with emoji is saved as typed', posts.length === 1 && ((await page.locator('#submitBox .lb-row.me .lb-name-text').textContent()) ?? '') === '小明🐧');
    check('the penguin is recorded', posts[0]?.bird === 4, JSON.stringify(posts[0]));
    check('status is in Chinese', ((await page.locator('.submit-status').textContent()) ?? '').includes('已提交'));
    const fits = await page.evaluate(() => {
      const p = document.querySelector('.panel').getBoundingClientRect();
      return p.left >= 0 && p.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
    });
    check('panel fits the phone width', fits);
    await page.screenshot({ path: `${OUT}/flock-lb-phone-done.png` });
    await page.tap('#boardBtn');
    await page.waitForSelector('#boardPanel .lb-row.me');
    await page.screenshot({ path: `${OUT}/flock-lb-phone-board.png` });
    check('score matches the run', posts[0].score === g.score);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('hostile names are shown as text');
  {
    const r = await fetch(`${API}/scores`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:4185' },
      body: JSON.stringify({ v: 1, gid: crypto.randomUUID(), name: '<img src=x onerror=alert(1)>', score: 50, secs: 101, flaps: 200, bird: 0 }),
    });
    check('server stored the name (first 16 characters)', r.status === 200);
    const { ctx, page, errors } = await open({ width: 1280, height: 800 }, { query: '?lang=en' });
    let dialog = false;
    page.on('dialog', (d) => {
      dialog = true;
      void d.dismiss();
    });
    await page.click('#lbBtn');
    await page.waitForSelector('#boardPanel .lb-row');
    await wait(300);
    const first = (await page.locator('#boardPanel .lb-row .lb-name-text').first().textContent()) ?? '';
    check('markup in a name is displayed literally', first === '<img src=x onerr', first);
    check('no element was created from it and nothing ran', (await page.locator('#boardPanel img').count()) === 0 && !dialog);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  failures++;
  console.error('ABORTED:', e);
} finally {
  await browser.close();
  stopAll();
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
