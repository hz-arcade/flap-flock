import { BIRDS, BIRD_ORDER, stats, type BirdId } from '../game/birds';
import { LEVELS, WORLD_COUNT, type LevelDef } from '../game/levels';
import type { ClearOutcome, Progress } from '../game/progress';
import type { ClearResult } from '../game/Run';
import { onLangChange, t, type StringKey } from '../i18n';
import { birdPix, WINGS } from '../render/sprites/birds';
import { button, el, make } from './dom';

export interface UiActions {
  adventure(): void;
  continueLevel(): void;
  endless(): void;
  birds(): void;
  board(): void;
  map(): void;
  title(): void;
  play(level: LevelDef): void;
  pickBird(id: BirdId): void;
  resume(): void;
  restart(): void;
  quit(): void;
  next(): void;
  click(): void;
}

export interface ResultsData {
  result: ClearResult;
  outcome: ClearOutcome;
  def: LevelDef;
  hasNext: boolean;
  allCleared: boolean;
}

export interface EndlessData {
  score: number;
  best: number;
  newBest: boolean;
  bird: BirdId;
  /** Identifies this run to the leaderboard so it can only be submitted once. */
  gameId: string;
  secs: number;
  flaps: number;
}

type ScreenName = 'none' | 'title' | 'birds' | 'map' | 'pause' | 'dead' | 'results' | 'endless' | 'board';

const birdName = (id: BirdId) => t(`bird.${id}` as StringKey);

/** Bird portrait as a crisp scaled canvas. */
export function birdCanvas(id: BirdId, scale: number, wing: (typeof WINGS)[number] = 'mid', className = 'bird-icon'): HTMLCanvasElement {
  const c = birdPix(id, wing).pix.toCanvas(scale);
  c.className = className;
  return c;
}

function stars(n: number, total = 3, className = 'stars'): HTMLElement {
  const s = make('span', className);
  for (let i = 0; i < total; i++) s.appendChild(make('span', i < n ? 'star on' : 'star', '★'));
  s.setAttribute('aria-label', `${n}/${total}`);
  return s;
}

/**
 * All DOM chrome over the canvas: menus, panels and the Get Ready banner. Every screen is a
 * function of the current state, rebuilt on demand (and when the language changes), so the
 * markup never drifts out of sync.
 */
export class Ui {
  private root = el<HTMLDivElement>('screen');
  private banner = el<HTMLDivElement>('banner');
  private pauseBtn = el<HTMLButtonElement>('pauseBtn');
  private current: ScreenName = 'none';
  private redraw: (() => void) | null = null;
  private animTimer: number | null = null;
  /** Slot where the endless game-over panel puts the leaderboard form (filled by main). */
  endlessExtra: ((into: HTMLElement, data: EndlessData) => void) | null = null;
  /** Fills the leaderboard screen (set by main when the leaderboard is enabled). */
  boardView: ((into: HTMLElement) => void) | null = null;
  lbEnabled = false;

  constructor(
    private actions: UiActions,
    private progress: Progress,
  ) {
    onLangChange(() => this.redraw?.());
  }

  get screen(): ScreenName {
    return this.current;
  }

  private open(name: ScreenName, build: (root: HTMLElement) => void, modal = true): void {
    this.current = name;
    this.stopAnim();
    const draw = () => {
      this.root.replaceChildren();
      this.root.className = `screen screen-${name}${modal ? '' : ' passive'}`;
      build(this.root);
    };
    this.redraw = draw;
    draw();
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.current = 'none';
    this.redraw = null;
    this.stopAnim();
    this.root.classList.add('hidden');
    this.root.replaceChildren();
  }

  private stopAnim(): void {
    if (this.animTimer !== null) clearInterval(this.animTimer);
    this.animTimer = null;
  }

  private btn(text: string, fn: () => void, cls = 'btn', id = ''): HTMLButtonElement {
    return button(cls, text, () => {
      this.actions.click();
      fn();
    }, id);
  }

  private header(title: string, back: () => void): HTMLElement {
    const h = make('div', 'panel-head');
    h.appendChild(this.btn('‹', back, 'btn-back', 'backBtn')).setAttribute('aria-label', t('btn.back'));
    h.appendChild(make('h2', '', title));
    return h;
  }

  setPauseVisible(v: boolean): void {
    this.pauseBtn.classList.toggle('hidden', !v);
  }

  // ---- Title ----

  showTitle(): void {
    this.open('title', (root) => {
      const box = make('div', 'title-box');
      const logo = make('h1', 'logo');
      logo.appendChild(make('span', 'logo-a', 'FLAP'));
      logo.appendChild(make('span', 'logo-b', 'FLOCK'));
      box.appendChild(logo);
      const local = t('app.title');
      if (local !== 'Flap Flock') box.appendChild(make('div', 'logo-local', local));
      const flock = make('div', 'flock');
      BIRD_ORDER.forEach((id, i) => {
        const c = birdCanvas(id, 2, WINGS[i % 4]);
        if (!this.progress.isBirdOpen(id)) c.classList.add('locked');
        flock.appendChild(c);
      });
      box.appendChild(flock);
      box.appendChild(make('p', 'tagline', t('title.tagline')));
      const menu = make('div', 'menu');
      const started = this.progress.totalStars > 0;
      if (started && !this.progress.allCleared) menu.appendChild(this.btn(t('title.continue', { id: this.progress.frontier.id }), () => this.actions.continueLevel(), 'btn btn-go', 'playBtn'));
      menu.appendChild(this.btn(started ? t('map.title') : t('title.adventure'), () => this.actions.adventure(), started && !this.progress.allCleared ? 'btn' : 'btn btn-go', started ? 'mapMenuBtn' : 'playBtn'));
      menu.appendChild(this.btn(t('title.endless'), () => this.actions.endless(), 'btn', 'endlessBtn'));
      menu.appendChild(this.btn(t('title.birds'), () => this.actions.birds(), 'btn', 'birdsBtn'));
      if (this.lbEnabled) menu.appendChild(this.btn(t('title.board'), () => this.actions.board(), 'btn', 'lbBtn'));
      box.appendChild(menu);
      if (started) box.appendChild(make('p', 'small', `★ ${t('title.stars', { n: this.progress.totalStars, total: LEVELS.length * 3 })}`));
      box.appendChild(make('p', 'small keys', t('title.keys')));
      root.appendChild(box);
    });
  }

  // ---- Bird select ----

  showBirds(back: () => void): void {
    this.open('birds', (root) => {
      const panel = make('div', 'panel wide');
      panel.appendChild(this.header(t('birds.title'), back));
      const grid = make('div', 'bird-grid');
      const icons: Array<{ id: BirdId; holder: HTMLElement }> = [];
      for (const id of BIRD_ORDER) {
        const open = this.progress.isBirdOpen(id);
        const picked = this.progress.bird === id;
        const card = make('button', `bird-card${picked ? ' picked' : ''}${open ? '' : ' locked'}`);
        card.type = 'button';
        card.dataset.bird = id;
        card.disabled = !open;
        const holder = make('div', 'bird-art');
        holder.appendChild(birdCanvas(id, 3));
        icons.push({ id, holder });
        card.appendChild(holder);
        const info = make('div', 'bird-info');
        info.appendChild(make('h3', '', birdName(id)));
        info.appendChild(make('p', 'trait', open ? t(`bird.${id}.trait` as StringKey) : t('birds.locked', { n: BIRDS[id].unlockWorld })));
        const st = stats(BIRDS[id]);
        const bars = make('div', 'bars');
        for (const [k, v] of [['birds.lift', st.lift], ['birds.weight', st.weight], ['birds.agility', st.agility], ['birds.size', st.size]] as const) {
          const row = make('div', 'bar-row');
          row.appendChild(make('span', 'bar-label', t(k)));
          const bar = make('span', 'bar');
          const fill = make('span', 'bar-fill');
          fill.style.width = `${Math.round(v * 100)}%`;
          bar.appendChild(fill);
          row.appendChild(bar);
          bars.appendChild(row);
        }
        info.appendChild(bars);
        if (picked) info.appendChild(make('span', 'tag', t('birds.picked')));
        card.appendChild(info);
        card.addEventListener('click', () => {
          if (!open) return;
          this.actions.click();
          this.actions.pickBird(id);
          this.showBirds(back);
        });
        grid.appendChild(card);
      }
      panel.appendChild(grid);
      root.appendChild(panel);
      // Flap the selected bird's wings.
      let f = 0;
      this.animTimer = window.setInterval(() => {
        f = (f + 1) % 4;
        const sel = icons.find((i) => i.id === this.progress.bird);
        if (sel) sel.holder.replaceChildren(birdCanvas(sel.id, 3, WINGS[f]));
      }, 140);
    });
  }

  // ---- World map ----

  showMap(): void {
    this.open('map', (root) => {
      const panel = make('div', 'panel wide');
      panel.appendChild(this.header(t('map.title'), () => this.actions.title()));
      const chip = make('div', 'bird-chip');
      chip.appendChild(birdCanvas(this.progress.bird, 2));
      const label = make('span', 'chip-label');
      label.appendChild(make('small', '', t('map.flyingAs')));
      label.appendChild(make('b', '', birdName(this.progress.bird)));
      chip.appendChild(label);
      chip.appendChild(this.btn(t('map.change'), () => this.actions.birds(), 'btn btn-small', 'changeBird'));
      panel.appendChild(chip);
      const worlds = make('div', 'worlds');
      for (let w = 1; w <= WORLD_COUNT; w++) {
        const row = make('div', 'world');
        row.appendChild(make('div', 'world-name', t('map.world', { n: w })));
        const tiles = make('div', 'tiles');
        for (const def of LEVELS.filter((l) => l.world === w)) {
          const open = this.progress.isLevelOpen(def.id);
          const rec = this.progress.level(def.id);
          const tile = make('button', `tile theme-${def.theme}${open ? '' : ' locked'}${def.id === this.progress.frontier.id && !rec ? ' frontier' : ''}`);
          tile.type = 'button';
          tile.dataset.level = def.id;
          tile.disabled = !open;
          if (!open) tile.title = t('map.locked');
          tile.appendChild(make('span', 'tile-id', def.id));
          tile.appendChild(make('span', 'tile-theme', t(`theme.${def.theme}` as StringKey)));
          if (open) tile.appendChild(stars(rec?.stars ?? 0));
          else tile.appendChild(make('span', 'ico ico-lock'));
          if (rec) tile.appendChild(make('span', 'tile-coins', `● ${rec.coins}/${def.coins}`));
          tile.addEventListener('click', () => {
            this.actions.click();
            this.actions.play(def);
          });
          tiles.appendChild(tile);
        }
        row.appendChild(tiles);
        worlds.appendChild(row);
      }
      panel.appendChild(worlds);
      const endless = make('button', 'tile endless-tile');
      endless.type = 'button';
      endless.id = 'mapEndless';
      endless.appendChild(make('span', 'tile-id', '∞'));
      const et = make('span', 'tile-text');
      et.appendChild(make('b', '', t('map.endless')));
      et.appendChild(make('small', '', t('map.endlessDesc')));
      endless.appendChild(et);
      endless.appendChild(make('span', 'tile-best', t('map.endlessBest', { n: this.progress.endlessBest })));
      endless.addEventListener('click', () => {
        this.actions.click();
        this.actions.endless();
      });
      panel.appendChild(endless);
      root.appendChild(panel);
    });
  }

  // ---- In play ----

  showBanner(lines: { title: string; sub?: string; hints: string[]; big?: string }): void {
    this.banner.replaceChildren();
    this.banner.appendChild(make('div', 'banner-title', lines.title));
    if (lines.sub) this.banner.appendChild(make('div', 'banner-sub', lines.sub));
    if (lines.big) this.banner.appendChild(make('div', 'banner-big', lines.big));
    for (const h of lines.hints) this.banner.appendChild(make('div', 'banner-hint', h));
    this.banner.classList.remove('hidden');
  }

  hideBanner(): void {
    this.banner.classList.add('hidden');
  }

  showPause(): void {
    this.open('pause', (root) => {
      const panel = make('div', 'panel');
      panel.appendChild(make('h2', '', t('pause.title')));
      const menu = make('div', 'menu');
      menu.appendChild(this.btn(t('pause.resume'), () => this.actions.resume(), 'btn btn-go', 'resumeBtn'));
      menu.appendChild(this.btn(t('pause.restart'), () => this.actions.restart(), 'btn', 'restartBtn'));
      menu.appendChild(this.btn(t('pause.quit'), () => this.actions.quit(), 'btn', 'quitBtn'));
      panel.appendChild(menu);
      root.appendChild(panel);
    });
  }

  /** Crash in a level: a small panel; tapping the play area also retries. */
  showDead(progress: number): void {
    this.open(
      'dead',
      (root) => {
        const panel = make('div', 'panel slim');
        panel.appendChild(make('h2', 'ouch', t('dead.title')));
        const bar = make('div', 'meter');
        const fill = make('span', 'meter-fill');
        fill.style.width = `${Math.round(progress * 100)}%`;
        bar.appendChild(fill);
        panel.appendChild(bar);
        panel.appendChild(make('p', 'small', t('dead.progress', { n: Math.round(progress * 100) })));
        panel.appendChild(make('p', 'blink', t('dead.tap')));
        const menu = make('div', 'menu row');
        menu.appendChild(this.btn(t('dead.retry'), () => this.actions.restart(), 'btn btn-go', 'retryBtn'));
        menu.appendChild(this.btn(t('dead.map'), () => this.actions.quit(), 'btn', 'mapBtn'));
        panel.appendChild(menu);
        root.appendChild(panel);
      },
      false,
    );
  }

  showResults(d: ResultsData, onStar: (i: number) => void): void {
    this.open('results', (root) => {
      const panel = make('div', 'panel');
      panel.appendChild(make('div', 'small', t('ready.level', { id: d.def.id })));
      panel.appendChild(make('h2', 'clear', t('clear.title')));
      const st = stars(0, 3, 'stars big');
      panel.appendChild(st);
      const stats = make('div', 'result-stats');
      stats.appendChild(make('span', '', t('clear.coins', { n: d.result.coins, total: d.result.total })));
      stats.appendChild(make('span', '', t('clear.time', { t: d.result.time.toFixed(1) })));
      panel.appendChild(stats);
      if (d.outcome.improved && !d.outcome.first) panel.appendChild(make('p', 'best', t('clear.best')));
      for (const b of d.outcome.newBirds) {
        const card = make('div', 'unlock');
        card.appendChild(birdCanvas(b, 3));
        const txt = make('div', '');
        txt.appendChild(make('b', '', t('clear.newBird', { bird: birdName(b) })));
        txt.appendChild(make('small', '', t('clear.newBirdHint')));
        card.appendChild(txt);
        panel.appendChild(card);
      }
      if (d.allCleared && !d.hasNext) panel.appendChild(make('p', 'small', t('clear.allDone')));
      const menu = make('div', 'menu');
      if (d.hasNext) menu.appendChild(this.btn(t('clear.next'), () => this.actions.next(), 'btn btn-go', 'nextBtn'));
      const row = make('div', 'menu row');
      row.appendChild(this.btn(t('clear.retry'), () => this.actions.restart(), 'btn', 'againBtn'));
      row.appendChild(this.btn(t('clear.map'), () => this.actions.quit(), d.hasNext ? 'btn' : 'btn btn-go', 'mapBtn'));
      menu.appendChild(row);
      panel.appendChild(menu);
      root.appendChild(panel);
      // Stars light up one by one.
      const els = st.querySelectorAll('.star');
      let i = 0;
      this.animTimer = window.setInterval(() => {
        if (i >= d.result.stars) {
          this.stopAnim();
          return;
        }
        els[i]?.classList.add('on', 'pop');
        onStar(i);
        i++;
      }, 380);
    });
  }

  showEndlessOver(d: EndlessData): void {
    this.open('endless', (root) => {
      const panel = make('div', 'panel');
      panel.appendChild(make('h2', '', t('endless.title')));
      const scores = make('div', 'scores');
      const s1 = make('div', 'score-box');
      s1.appendChild(make('small', '', t('endless.score')));
      s1.appendChild(make('b', 'score-num', String(d.score)));
      const s2 = make('div', 'score-box');
      s2.appendChild(make('small', '', t('endless.best')));
      s2.appendChild(make('b', 'score-num', String(d.best)));
      scores.appendChild(s1);
      scores.appendChild(s2);
      panel.appendChild(scores);
      if (d.newBest) panel.appendChild(make('p', 'best', t('endless.newBest')));
      const extra = make('div', 'extra');
      panel.appendChild(extra);
      this.endlessExtra?.(extra, d);
      const menu = make('div', 'menu');
      menu.appendChild(this.btn(t('endless.retry'), () => this.actions.restart(), 'btn btn-go', 'againBtn'));
      const row = make('div', 'menu row');
      row.appendChild(this.btn(t('endless.menu'), () => this.actions.quit(), 'btn', 'menuBtn'));
      if (this.lbEnabled) row.appendChild(this.btn(t('title.board'), () => this.actions.board(), 'btn', 'boardBtn'));
      menu.appendChild(row);
      panel.appendChild(menu);
      root.appendChild(panel);
    });
  }

  showBoard(back: () => void): void {
    this.open('board', (root) => {
      const panel = make('div', 'panel wide');
      panel.appendChild(this.header(t('lb.title'), back));
      const body = make('div', 'board');
      panel.appendChild(body);
      root.appendChild(panel);
      this.boardView?.(body);
    });
  }
}
