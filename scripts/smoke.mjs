/**
 * Headless smoke test + screenshots. Uses the Playwright Chromium already cached on this
 * machine. Set BASE_URL to test a deployed site instead of a local preview build.
 *   npm run build && npm run smoke
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_PATH ?? path.join(homedir(), '.cache/ms-playwright/chromium-1223/chrome-linux/chrome');
const OUT = process.env.OUT_DIR ?? '/tmp';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');

let server = null;
let base = process.env.BASE_URL;
if (!base) {
  if (!existsSync('dist')) throw new Error('run npm run build first');
  // Own port, and proof that the page served is this game: other projects' previews run on this machine too.
  const port = process.env.PORT ?? '4183';
  server = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { stdio: 'ignore', detached: true });
  process.on('exit', () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  });
  base = `http://localhost:${port}/flap-flock/`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (server.exitCode !== null) throw new Error(`vite preview exited (is port ${port} in use?)`);
    try {
      const r = await fetch(base);
      up = r.ok && (await r.text()).includes('Flap Flock');
    } catch {
      /* not yet */
    }
  }
  if (!up) throw new Error(`preview server did not come up on port ${port}`);
}
if (!base.endsWith('/')) base += '/';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, locale: opts.locale ?? 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text());
  });
  await page.goto(base + (opts.query ?? ''), { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });
  return { ctx, page, errors };
}

const state = (page) => page.evaluate(() => window.__game.state());

/** Music must be running and actually producing signal on the master bus. */
async function sound(page) {
  return page.evaluate(async () => {
    const { audio, music } = window.__game;
    if (!audio.ctx || !audio.master) return { state: 'no-context', playing: music.playing, peak: 0 };
    const an = audio.ctx.createAnalyser();
    an.fftSize = 2048;
    audio.master.connect(an);
    let peak = 0;
    const buf = new Float32Array(an.fftSize);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      an.getFloatTimeDomainData(buf);
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
    }
    return { state: audio.ctx.state, playing: music.playing, song: music.current, peak };
  });
}

try {
  /* ------------------------------------------------------------------ */
  console.log('desktop 1280x720: first level, crash, retry, clear');
  {
    const { ctx, page, errors } = await open({ width: 1280, height: 720 }, { query: '?lang=en' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/flock-title.png` });
    const lb = await page.evaluate(() => window.__game.leaderboard.enabled);
    check('leaderboard button matches the build', (await page.locator('#lbBtn').count()) === (lb ? 1 : 0));
    check('title shows the attract flight', (await state(page)).mode === 'menu' && (await state(page)).phase === 'playing');

    // A new player goes straight into 1-1.
    await page.click('#playBtn');
    await page.waitForFunction(() => window.__game.state().phase === 'ready');
    let s = await state(page);
    check('Adventure starts 1-1 for a new player', s.mode === 'play' && s.level === '1-1', JSON.stringify(s));
    check('Get Ready banner with the tap hint', (await page.locator('#banner:not(.hidden) .banner-big').count()) === 1);
    await page.screenshot({ path: `${OUT}/flock-ready.png` });
    await page.waitForTimeout(1000);
    check('nothing moves before the first flap', (await page.evaluate(() => window.__game.run.body.x)) === 0);

    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    s = await state(page);
    check('Space starts the run with a flap', s.phase === 'playing' && (await page.evaluate(() => window.__game.run.flaps)) === 1, JSON.stringify(s));
    check('banner hides once flying', (await page.locator('#banner.hidden').count()) === 1);

    // Pause keeps the run exactly where it was.
    await page.click('#pauseBtn');
    await page.waitForSelector('#resumeBtn');
    const x0 = await page.evaluate(() => window.__game.run.body.x);
    await page.waitForTimeout(500);
    check('paused: the world stands still', (await page.evaluate(() => window.__game.run.body.x)) === x0);
    await page.click('#resumeBtn');
    await page.waitForSelector('#resumeBtn', { state: 'detached' });
    check('resumed', !(await state(page)).paused);

    const audio = await sound(page);
    check('music plays with signal', audio.playing && audio.peak > 0.01 && audio.song === 'grass', JSON.stringify(audio));

    // Let it fall and crash.
    await page.waitForFunction(() => window.__game.state().phase === 'dead', null, { timeout: 8000 });
    await page.waitForSelector('#retryBtn');
    await page.screenshot({ path: `${OUT}/flock-dead.png` });
    check('crash panel shows the progress', /% of the way/.test((await page.locator('.screen-dead').textContent()) ?? ''));
    await page.waitForTimeout(600);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__game.state().phase === 'ready');
    check('tap after a crash restarts the level', (await page.evaluate(() => window.__game.run.body.x)) === 0);

    // The planner flies it home.
    await page.evaluate(() => {
      window.__game.autopilot(true);
      window.__game.step(40);
    });
    await page.waitForFunction(() => window.__game.state().phase === 'cleared', null, { timeout: 15000 });
    await page.waitForSelector('#nextBtn');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/flock-results.png` });
    check('results show three stars for every coin', (await page.locator('.stars.big .star.on').count()) === 3);
    check('1-2 unlocked and saved', await page.evaluate(() => JSON.parse(localStorage.getItem('flap-flock.progress')).levels['1-1']?.stars === 3 && window.__game.progress.isLevelOpen('1-2')));
    await page.click('#nextBtn');
    await page.waitForFunction(() => window.__game.state().level === '1-2' && window.__game.state().phase === 'ready');
    check('Next goes to 1-2', true);

    await page.click('#pauseBtn');
    await page.click('#quitBtn');
    await page.waitForSelector('.screen-map');
    check('map: 1-1 cleared, 1-2 open, 2-1 locked', (await page.locator('[data-level="1-1"] .star.on').count()) === 3 && !(await page.locator('[data-level="1-2"]').isDisabled()) && (await page.locator('[data-level="2-1"]').isDisabled()));
    await page.screenshot({ path: `${OUT}/flock-map.png` });
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('every level renders and plays');
  {
    const { ctx, page, errors } = await open({ width: 1024, height: 640 }, { query: '?unlock=all&lang=en' });
    for (const id of ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2']) {
      await page.evaluate((id) => {
        window.__game.start(id);
        window.__game.autopilot(true);
        window.__game.step(14);
      }, id);
      await page.waitForTimeout(250);
      const s = await state(page);
      check(`${id} flies (${s.theme})`, s.level === id && s.phase === 'playing' && s.passed >= 2, JSON.stringify(s));
      await page.screenshot({ path: `${OUT}/flock-level-${id}.png` });
    }
    const audio = await sound(page);
    check('castle music in world 4', audio.song === 'castle', JSON.stringify(audio));
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('birds and endless');
  {
    const { ctx, page, errors } = await open({ width: 1280, height: 720 }, { query: '?unlock=all&lang=en' });
    await page.click('#birdsBtn');
    await page.waitForSelector('.bird-card');
    check('six birds on the bird screen', (await page.locator('.bird-card').count()) === 6);
    await page.click('[data-bird="pelican"]');
    check('choosing the pelican is saved', (await page.evaluate(() => localStorage.getItem('flap-flock.bird'))) === 'pelican');
    await page.screenshot({ path: `${OUT}/flock-birds.png` });
    await page.click('#backBtn');
    await page.click('#endlessBtn');
    await page.waitForFunction(() => window.__game.state().runMode === 'endless' && window.__game.state().phase === 'ready');
    check('endless uses the chosen bird', (await state(page)).bird === 'pelican');
    check('the glide hint is shown for the pelican', /glide/i.test((await page.locator('#banner').textContent()) ?? ''));
    await page.evaluate(() => {
      window.__game.run.press();
      window.__game.autopilot(true);
      window.__game.step(30);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/flock-endless.png` });
    const passed = (await state(page)).passed;
    check('endless: pipes passed', passed >= 5, String(passed));
    await page.evaluate(() => window.__game.kill());
    await page.waitForSelector('#againBtn');
    check('game over shows the score', ((await page.locator('.score-num').first().textContent()) ?? '') === String(passed));
    const lb = await page.evaluate(() => window.__game.leaderboard.enabled);
    if (!lb) check('no leaderboard UI without a scores API', (await page.locator('#nameInput, #submitBox, #boardBtn').count()) === 0);
    await page.screenshot({ path: `${OUT}/flock-over.png` });
    await page.click('#againBtn');
    await page.waitForFunction(() => window.__game.state().phase === 'ready' && window.__game.state().passed === 0);
    check('Fly again restarts', true);
    check('endless best saved', (await page.evaluate(() => JSON.parse(localStorage.getItem('flap-flock.endless')).best)) === passed);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('phone 390x844 (zh-CN), touch');
  {
    const { ctx, page, errors } = await open({ width: 390, height: 844 }, { dpr: 3, touch: true, locale: 'zh-CN' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/flock-phone-title.png` });
    check('Chinese title', ((await page.locator('.logo-local').textContent()) ?? '') === '扑翅鸟群');
    await page.tap('#playBtn');
    await page.waitForFunction(() => window.__game.state().phase === 'ready');
    const s = await state(page);
    check('phone view: 180..240 wide, taller than the band', s.viewW >= 180 && s.viewW <= 240 && s.viewH > 256, JSON.stringify(s));
    await page.touchscreen.tap(200, 500);
    await page.waitForTimeout(100);
    check('a tap flaps', (await state(page)).phase === 'playing');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/flock-phone-play.png` });
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    check('nothing overflows sideways', fits);
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------------------------ */
  console.log('landscape phone 844x390 and Spanish');
  {
    const { ctx, page, errors } = await open({ width: 844, height: 390 }, { dpr: 3, touch: true, query: '?lang=es' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/flock-landscape-title.png` });
    check('Spanish menu', ((await page.locator('#playBtn').textContent()) ?? '').toLowerCase().includes('aventura'));
    check('language pill says ES', ((await page.locator('#lang-label').textContent()) ?? '') === 'ES');
    await page.tap('#playBtn');
    await page.waitForFunction(() => window.__game.state().phase === 'ready');
    const s = await state(page);
    check('wide view capped at 480', s.viewW === 480 && s.viewH === 256, JSON.stringify(s));
    await page.screenshot({ path: `${OUT}/flock-landscape-ready.png` });
    check('no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  failures++;
  console.error('ABORTED:', e);
} finally {
  await browser.close();
}

console.log(`${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
