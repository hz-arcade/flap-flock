import '@fontsource/press-start-2p/400.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { API_VERSION } from '../shared/scoreRules';
import { audio } from './audio/context';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { Autopilot } from './game/autopilot';
import { BIRDS, BIRD_ORDER, type BirdId } from './game/birds';
import { STEP } from './game/constants';
import { LEVELS, THEME_SONG, levelById, nextLevel, type LevelDef, type ThemeId } from './game/levels';
import { encodeLog } from './game/replay';
import { Progress } from './game/progress';
import { randomSeed } from './game/rng';
import { Run, starsFor, type ClearResult } from './game/Run';
import { detectLang, setLang, t, type Lang, type StringKey } from './i18n';
import { bindInput } from './input';
import { createClient, loadName, myEntries, newGameId, rememberEntry, saveName, scoresUrl } from './net/leaderboard';
import { StarsStore } from './net/stars';
import { Effects } from './render/effects';
import { birdPix } from './render/sprites/birds';
import { FEATHERS, Renderer } from './render/renderer';
import { el } from './ui/dom';
import { bindTranslations } from './ui/i18nDom';
import { bindLangSelect } from './ui/langSelect';
import { LeaderboardUi, type LeaderboardPort } from './ui/leaderboardUi';
import { Ui, type EndlessData } from './ui/screens';

setLang(detectLang(), false);
bindTranslations();
bindLangSelect();

const params = new URLSearchParams(location.search);
const canvas = el<HTMLCanvasElement>('game');
const renderer = new Renderer(canvas);
renderer.debug = params.has('debug');
const fx = new Effects();
const progress = new Progress();
if (params.get('unlock') === 'all') progress.allOpen = true;

type Mode = 'menu' | 'play';
let mode: Mode = 'menu';
/** Which menu the bird screen returns to. */
let menuScreen: 'title' | 'map' = 'title';
let lastTheme: ThemeId = 'grass';
let lastOver: EndlessData | null = null;
let run: Run = attractRun();
let paused = false;
/** Tooling only: stop the simulation without showing the pause screen (cover image). */
let frozen = false;
/** Tooling only: cover image without the HUD. */
let coverShot = false;
let time = 0;
let prevTheme: ThemeId | null = null;
let fadeStart = 0;
let fireworks: Array<{ at: number; x: number; y: number }> = [];

// ---- Runs ----

/** The demo flight behind the menus: the planner flying endless with the chosen bird. */
function attractRun(): Run {
  const r = new Run({ mode: 'endless', bird: BIRDS[progress.bird], seed: randomSeed() });
  r.controller = new Autopilot({ coins: false }).control;
  r.events.theme = (th) => themeChange(r, th);
  return r;
}

/** Endless scenery change: fade the old theme out over a second and switch the music. */
function themeChange(r: Run, th: ThemeId): void {
  prevTheme = lastTheme;
  lastTheme = th;
  fadeStart = time;
  if (mode === 'play' && r === run && r.mode === 'endless') music.play(THEME_SONG[th]);
}

function wire(r: Run): void {
  const bird = r.bird.id;
  r.events = {
    phase: (p) => {
      if (p === 'ready') showReady(r);
      if (p === 'playing') ui.hideBanner();
      if (p === 'dead') onDead(r);
      if (p === 'clearing') onClearing(r);
      ui.setPauseVisible(p === 'playing' || p === 'ready');
    },
    flap: () => {
      sfx.flap(bird);
      fx.flap(r.body.x, r.body.y);
    },
    coin: (c) => {
      sfx.coin();
      fx.coin(c.x, c.y);
    },
    pass: () => {
      if (r.mode === 'endless') sfx.pass();
    },
    hit: (cause) => {
      sfx.hit();
      fx.crash(r.body.x, r.body.y, FEATHERS[bird]);
      if (cause !== 'ground') sfx.fall();
      music.duck(1.6);
    },
    land: () => sfx.land(),
    checkpoint: () => sfx.checkpoint(),
    clear: (res) => onCleared(r, res),
    theme: (th) => themeChange(r, th),
  };
}

const app = el<HTMLDivElement>('app');

function begin(r: Run): void {
  run = r;
  mode = 'play';
  app.classList.add('playing');
  paused = false;
  fx.clear();
  fireworks = [];
  prevTheme = null;
  lastTheme = r.theme;
  wire(r);
  ui.hide();
  showReady(r);
  ui.setPauseVisible(true);
}

function startLevel(def: LevelDef): void {
  if (!progress.isLevelOpen(def.id)) return;
  audio.unlock();
  begin(new Run({ mode: 'level', def, bird: BIRDS[progress.bird] }));
  music.play(def.song, { underwater: def.medium === 'water' });
}

function startEndless(): void {
  audio.unlock();
  begin(new Run({ mode: 'endless', bird: BIRDS[progress.bird], seed: randomSeed() }));
  music.play(THEME_SONG[run.theme]);
}

function restart(): void {
  if (run.mode === 'level' && run.def) startLevel(run.def);
  else startEndless();
}

function toMenu(screen: 'title' | 'map' | 'birds' | 'board' = 'title'): void {
  mode = 'menu';
  app.classList.remove('playing');
  paused = false;
  ui.hideBanner();
  ui.setPauseVisible(false);
  fx.clear();
  if (run.controller === null || run.mode === 'level') {
    run = attractRun();
    prevTheme = null;
    lastTheme = run.theme;
  }
  if (audio.ready) music.play('grass');
  if (screen === 'title' || screen === 'map') menuScreen = screen;
  if (screen === 'title') ui.showTitle();
  else if (screen === 'map') ui.showMap();
  else if (screen === 'birds') ui.showBirds(() => toMenu(menuScreen));
  else ui.showBoard(() => toMenu('title'), 'adventure');
}

function showReady(r: Run): void {
  const hints: string[] = [];
  let big: string | undefined;
  const first = r.mode === 'endless' || r.def?.id === '1-1';
  if (first) big = t('ready.tap');
  hints.push(t('ready.keys'));
  if (r.phys.glideFall !== null) hints.push(t('ready.glide'));
  if (r.def?.medium === 'water') hints.push(t('ready.water'));
  if (r.checkpoint) hints.unshift(t('ready.checkpoint'));
  else if (r.def?.id === '1-1' && !progress.isCleared('1-1')) hints.push(t('ready.coins'));
  if (r.mode === 'endless') ui.showBanner({ title: t('ready.endless'), hints, big });
  else ui.showBanner({ title: t('ready.level', { id: r.def!.id }), sub: t(`theme.${r.def!.theme}` as StringKey), hints, big });
  if (mode === 'play' && ui.screen === 'dead') ui.hide();
}

function onDead(r: Run): void {
  if (r !== run) return;
  if (r.mode === 'level') {
    ui.showDead(r.progress);
    return;
  }
  const bird = r.bird.id;
  const score = r.body.passed;
  const newBest = score > 0 && score > progress.endlessBest;
  progress.recordEndless(bird, score);
  if (newBest) sfx.best();
  else sfx.gameOver();
  lastOver = { score, best: progress.endlessBest, newBest, bird, gameId: newGameId(), secs: Math.ceil(r.body.t), flaps: r.flaps };
  ui.showEndlessOver(lastOver);
}

function onClearing(r: Run): void {
  sfx.clear();
  const stars = starsFor(r.coins, r.course.coins.length);
  for (let i = 0; i < stars; i++) fireworks.push({ at: time + 0.9 + i * 0.45, x: r.course.castleX + (i - 1) * 26, y: 70 + (i % 2) * 22 });
}

function onCleared(r: Run, res: ClearResult): void {
  if (r !== run || !r.def) return;
  const outcome = progress.record(res);
  // Keep the flight behind the best clear of each level: the leaderboard replays it.
  const segs = r.replay()?.map(encodeLog);
  if (segs) stars.offer(r.def.id, { bird: BIRD_ORDER.indexOf(r.bird.id), stars: res.stars, coins: res.coins, segs });
  void syncStars();
  const next = nextLevel(r.def.id);
  ui.setPauseVisible(false);
  ui.showResults({ result: res, outcome, def: r.def, hasNext: !!next, allCleared: progress.allCleared }, (i) => sfx.star(i));
  if (outcome.newBirds.length) window.setTimeout(() => sfx.unlock(), 380 * res.stars + 300);
}

// ---- UI ----

const ui = new Ui(
  {
    adventure: () => {
      // A brand-new player goes straight into the first level.
      if (!progress.isCleared('1-1')) startLevel(LEVELS[0]!);
      else toMenu('map');
    },
    continueLevel: () => startLevel(progress.frontier),
    endless: () => startEndless(),
    birds: () => ui.showBirds(() => toMenu(menuScreen)),
    board: (from) =>
      ui.showBoard(
        () => {
          if (from === 'over' && lastOver && mode === 'play' && run.mode === 'endless' && run.phase === 'dead') ui.showEndlessOver(lastOver);
          else toMenu(from === 'map' ? 'map' : 'title');
        },
        from === 'over' ? 'endless' : 'adventure',
      ),
    map: () => toMenu('map'),
    title: () => toMenu('title'),
    play: (def) => startLevel(def),
    pickBird: (id: BirdId) => {
      progress.setBird(id);
      if (mode === 'menu') {
        run = attractRun();
        lastTheme = run.theme;
        prevTheme = null;
      }
    },
    resume: () => setPaused(false),
    restart: () => restart(),
    quit: () => toMenu(run.mode === 'level' ? 'map' : 'title'),
    next: () => {
      const n = run.def ? nextLevel(run.def.id) : undefined;
      if (n) startLevel(n);
      else toMenu('map');
    },
    click: () => {
      audio.unlock();
      sfx.click();
      if (mode === 'menu' && !music.playing) music.play('grass');
    },
  },
  progress,
);

// ---- Leaderboards: endless scores, and stars from replayed level clears ----

const scores = createClient({ baseUrl: scoresUrl() });
const stars = new StarsStore();
let lbUi: LeaderboardUi | null = null;
let syncing = false;

/** Cleared levels with no recorded flight on this device (cleared before recording existed). */
const missingFlights = () => {
  const have = stars.clears();
  return LEVELS.filter((l) => progress.isCleared(l.id) && !have[l.id]).length;
};

/**
 * Send every level whose best flight the server has not seen yet. Runs after each clear and at
 * start-up, only once the player has joined the Adventure board.
 */
async function syncStars(): Promise<void> {
  const player = stars.player();
  if (!scores.enabled || !lbUi || !player.joined || syncing) return;
  const queue = stars.pending();
  lbUi.setStars({ joined: true, missing: missingFlights(), stars: player.stars, rank: player.rank });
  if (!queue.length) return;
  syncing = true;
  lbUi.setStars({ phase: 'saving' });
  let rejected = false;
  for (const level of queue) {
    const c = stars.clears()[level];
    if (!c) continue;
    const r = await scores.submitClear({ v: API_VERSION, key: player.key, name: loadName() || 'Player', level, bird: c.bird, segs: c.segs });
    if (r.ok) {
      stars.markSent(level);
      const p = stars.updatePlayer({ id: r.data.player.id, stars: r.data.player.stars, rank: r.data.player.rank });
      lbUi.setAdventure(r.data.board);
      lbUi.setStars({ stars: p.stars, rank: p.rank });
    } else if (r.error === 'rejected') {
      // The replay did not hold up; it never will, so do not send it again.
      stars.markSent(level);
      rejected = true;
    } else {
      syncing = false;
      lbUi.setStars({ phase: 'error', error: r.error });
      return;
    }
  }
  syncing = false;
  lbUi.setStars({ phase: 'done', rejected });
}
/** Null when no scores API was configured at build time: the leaderboard UI then stays hidden. */
const leaderboard: LeaderboardPort | null = scores.enabled
  ? {
      submit: async (name, over) => {
        const r = await scores.submitScore({ v: API_VERSION, gid: over.gameId, name, score: over.score, secs: over.secs, flaps: over.flaps, bird: BIRD_ORDER.indexOf(over.bird) });
        if (r.ok) {
          saveName(r.data.entry.name);
          rememberEntry(r.data.entry.id);
        }
        return r;
      },
      boards: () => scores.fetchBoards(),
      lastName: () => loadName(),
      mine: () => myEntries(),
      adventure: () => scores.fetchAdventure(),
      myPlayerId: () => stars.player().id,
      join: (name) => {
        saveName(name);
        stars.updatePlayer({ joined: true });
        void syncStars();
      },
    }
  : null;
if (leaderboard) {
  const view = new LeaderboardUi(leaderboard, () => sfx.click());
  lbUi = view;
  const p = stars.player();
  view.setStars({ joined: p.joined, stars: p.stars, rank: p.rank, missing: missingFlights() });
  ui.lbEnabled = true;
  ui.endlessExtra = (into, d) => view.renderSubmit(into, d);
  ui.boardView = (into, tab) => view.renderBoard(into, tab);
  ui.resultsExtra = (into) => view.renderStars(into);
  // Anything earned while offline goes up now.
  void syncStars();
}

function setPaused(p: boolean): void {
  if (mode !== 'play') return;
  if (p && !(run.phase === 'playing' || run.phase === 'ready')) return;
  paused = p;
  if (p) {
    ui.showPause();
    if (audio.ctx) void audio.ctx.suspend();
  } else {
    ui.hide();
    if (audio.ctx && !audio.muted) void audio.ctx.resume();
  }
}

const muteBtn = el<HTMLButtonElement>('muteBtn');
function syncMute(): void {
  muteBtn.classList.toggle('muted', audio.muted);
  const label = t(audio.muted ? 'btn.soundOn' : 'btn.soundOff');
  muteBtn.setAttribute('aria-label', label);
  muteBtn.title = label;
}
muteBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  syncMute();
});
el<HTMLButtonElement>('pauseBtn').addEventListener('click', () => setPaused(!paused));
syncMute();

bindInput(canvas, {
  press: () => {
    audio.unlock();
    if (mode !== 'play' || paused) return;
    if (run.phase === 'ready' || run.phase === 'playing') run.press();
    else if (run.mode === 'level' && run.phase === 'dead' && run.canRetry) {
      run.press();
    }
  },
  hold: (h) => run.setHeld(mode === 'play' && h),
  pause: () => {
    if (mode === 'play') setPaused(!paused);
  },
  mute: () => {
    audio.setMuted(!audio.muted);
    syncMute();
  },
  retry: () => {
    if (mode === 'play' && !paused) restart();
  },
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play' && run.phase === 'playing') setPaused(true);
});

// ---- Layout and loop ----

const probe = el<HTMLDivElement>('safe-probe');
const layout = () => {
  renderer.safeTopCss = probe.getBoundingClientRect().height;
  renderer.resize();
};
new ResizeObserver(layout).observe(canvas);
window.addEventListener('orientationchange', () => setTimeout(layout, 150));
layout();

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  time += dt;
  if (!paused && !frozen) run.frame(dt);
  fx.update(dt);
  while (fireworks.length && fireworks[0]!.at <= time) {
    const f = fireworks.shift()!;
    fx.fireworks(f.x, f.y);
    sfx.pass();
  }
  if (mode === 'menu' && run.phase === 'dead') {
    run = attractRun();
    prevTheme = null;
    lastTheme = run.theme;
  }
  const fade = prevTheme ? Math.min(1, (time - fadeStart) / 1.0) : 1;
  if (fade >= 1) prevTheme = null;
  renderer.draw(run, fx, { time, hud: mode === 'play' && !coverShot, hint: mode === 'play' && run.phase === 'ready' && (run.mode === 'endless' || run.def?.id === '1-1'), prevTheme, fade });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

ui.showTitle();

if (import.meta.env.PROD) registerSW({ immediate: true });

// ---- Test and tooling hooks ----

/** App icon: the duck on sky blue, as crisp SVG rects. */
function iconSvg(): string {
  const p = birdPix('duck', 'mid').pix;
  const b = p.bounds();
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const scale = 18;
  const ox = Math.round((512 - w * scale) / 2) - b.x0 * scale;
  const oy = Math.round((512 - h * scale) / 2) - b.y0 * scale - 10;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" shape-rendering="crispEdges">` +
    `<rect width="512" height="512" fill="#5c94fc"/>` +
    `<rect y="420" width="512" height="92" fill="#c84c0c"/><rect y="420" width="512" height="10" fill="#000"/><rect y="430" width="512" height="20" fill="#58d854"/><rect y="450" width="512" height="18" fill="#00a800"/>` +
    p.toSvgRects(scale, ox, oy) +
    `</svg>`
  );
}

declare global {
  interface Window {
    __game: Record<string, unknown>;
  }
}

window.__game = {
  get run() {
    return run;
  },
  renderer,
  progress,
  fx,
  audio,
  music,
  state: () => ({
    mode,
    screen: ui.screen,
    phase: run.phase,
    runMode: run.mode,
    level: run.def?.id ?? null,
    passed: run.body.passed,
    coins: run.coins,
    paused,
    theme: run.theme,
    bird: run.bird.id,
    viewW: renderer.viewW,
    viewH: renderer.viewH,
  }),
  start: (id: string) => {
    const def = levelById(id);
    if (def) startLevel(def);
  },
  endless: () => startEndless(),
  menu: (s: 'title' | 'map' | 'birds' | 'board') => toMenu(s),
  step: (seconds: number) => run.step(seconds),
  autopilot: (on: boolean) => {
    run.controller = on ? new Autopilot().control : null;
  },
  unlockAll: () => {
    progress.allOpen = true;
  },
  pickBird: (id: BirdId) => progress.setBird(id),
  birds: BIRD_ORDER,
  kill: () => run.kill(),
  cheat: (n: number) => {
    run.body.passed = n;
  },
  setLang: (l: Lang) => setLang(l),
  iconSvg,
  freeze: (on: boolean) => {
    frozen = on;
  },
  coverMode: (on: boolean) => {
    coverShot = on;
    renderer.forceScale = on ? 2 : null;
    renderer.maxViewW = on ? 600 : 480;
    renderer.resize();
  },
  ticks: () => Math.round(run.body.t / STEP),
  leaderboard: { enabled: scores.enabled, url: scoresUrl() },
  stars,
};
