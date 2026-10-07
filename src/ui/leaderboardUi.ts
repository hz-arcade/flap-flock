import { NAME_MAX, resetsIn, sanitizeName, type Boards, type Entry, type SubmitResponse } from '../../shared/scoreRules';
import { BIRD_ORDER } from '../game/birds';
import { t } from '../i18n';
import type { FailureKind, Result } from '../net/leaderboard';
import { button, make } from './dom';
import { birdCanvas, type EndlessData } from './screens';

/** The leaderboard as the UI sees it. Absent when no scores API was configured. */
export interface LeaderboardPort {
  submit(name: string, over: EndlessData): Promise<Result<SubmitResponse>>;
  boards(): Promise<Result<Boards>>;
  /** Name used last time on this device. */
  lastName(): string;
  /** Ids of rows submitted from this device. */
  mine(): Set<number>;
}

interface SubmitState {
  gameId: string;
  phase: 'idle' | 'submitting' | 'done' | 'error' | 'final';
  name: string;
  error?: FailureKind;
  result?: SubmitResponse;
}

type Tab = 'all' | 'week';

/** A board fetched this recently is shown as-is instead of being requested again. */
const BOARD_FRESH_MS = 30_000;
const COMPACT_ROWS = 5;

/**
 * Name entry on the endless game-over panel and the board screen, ported from Suika Jelly.
 * Names are always rendered with textContent. Each run can be submitted once (the server
 * also deduplicates by run id).
 */
export class LeaderboardUi {
  private submit: SubmitState = { gameId: '', phase: 'idle', name: '' };
  private submitInto: HTMLElement | null = null;
  private over: EndlessData | null = null;
  private tab: Tab = 'all';
  private boardPhase: 'loading' | 'ready' | 'error' = 'loading';
  private data: Boards | null = null;
  private fetchedAt = 0;
  private request = 0;
  private boardInto: HTMLElement | null = null;

  constructor(
    private port: LeaderboardPort,
    private click: () => void,
  ) {}

  // ---- Game over: name entry ----

  renderSubmit(into: HTMLElement, over: EndlessData): void {
    if (over.score < 1) return;
    if (this.submit.gameId !== over.gameId) this.submit = { gameId: over.gameId, phase: 'idle', name: this.port.lastName() };
    this.submitInto = into;
    this.over = over;
    into.replaceChildren(this.submitBlock());
  }

  private message(): string {
    const s = this.submit;
    if (s.phase === 'submitting') return t('submit.sending');
    if (s.phase !== 'error' && s.phase !== 'final') return '';
    switch (s.error) {
      case 'rate':
        return t('submit.errRate');
      case 'rejected':
        return t('submit.errRejected');
      case 'server':
        return t('submit.errServer');
      default:
        return t('submit.errNetwork');
    }
  }

  private submitBlock(): HTMLElement {
    const s = this.submit;
    const box = make('div', 'submit-box');
    box.id = 'submitBox';
    box.dataset.phase = s.phase;

    if (s.phase === 'done' && s.result) {
      const { rank, entry, boards } = s.result;
      const line = rank.week > 0 ? t('submit.done', { all: rank.all, week: rank.week }) : t('submit.doneAll', { all: rank.all });
      const status = make('p', 'submit-status ok', line);
      status.setAttribute('role', 'status');
      box.appendChild(status);
      box.appendChild(this.compactList(boards.all.top, entry, rank.all));
      return box;
    }

    const status = make('p', 'submit-status' + (s.phase === 'error' || s.phase === 'final' ? ' bad' : ''), this.message());
    status.id = 'submitStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    if (s.phase === 'final') {
      box.appendChild(status);
      return box;
    }

    const form = make('form', 'submit-form');
    form.noValidate = true;
    const label = make('label', 'submit-label', t('submit.label'));
    label.htmlFor = 'nameInput';
    const input = make('input', 'name-input');
    input.id = 'nameInput';
    input.name = 'name';
    input.type = 'text';
    input.value = s.name;
    input.placeholder = t('submit.placeholder');
    // Looser than NAME_MAX on purpose: input methods compose in Latin letters that can be
    // longer than the name they produce. The value is clipped to NAME_MAX once committed.
    input.maxLength = NAME_MAX * 3;
    input.setAttribute('autocomplete', 'nickname');
    input.autocapitalize = 'words';
    input.spellcheck = false;
    input.enterKeyHint = 'send';
    input.setAttribute('aria-describedby', 'nameHint');
    input.disabled = s.phase === 'submitting';
    const send = make('button', 'btn btn-go submit-btn', t(s.phase === 'error' ? 'lb.retry' : 'submit.send'));
    send.type = 'submit';
    send.id = 'submitBtn';
    send.disabled = s.phase === 'submitting' || !sanitizeName(s.name);
    const hint = make('p', 'hint', t('submit.hint'));
    hint.id = 'nameHint';

    let composing = false;
    let composedAt = -1e9;
    const commit = () => {
      const points = Array.from(input.value);
      if (points.length > NAME_MAX) input.value = points.slice(0, NAME_MAX).join('');
      this.submit.name = input.value;
      send.disabled = !sanitizeName(input.value);
    };
    input.addEventListener('compositionstart', () => {
      composing = true;
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      composedAt = performance.now();
      commit();
    });
    input.addEventListener('input', () => {
      if (composing) this.submit.name = input.value;
      else commit();
    });
    // The on-screen keyboard covers the lower half of a phone; bring the field back into view.
    input.addEventListener('focus', () => {
      window.setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      // Enter that confirms an input-method candidate is not a request to send.
      if (composing || performance.now() - composedAt < 80) return;
      commit();
      void this.send();
    });

    const fields = make('div', 'submit-fields');
    fields.append(input, send);
    form.append(label, fields, hint, status);
    box.appendChild(form);
    return box;
  }

  private rerenderSubmit(): void {
    if (this.submitInto?.isConnected) this.submitInto.replaceChildren(this.submitBlock());
  }

  private async send(): Promise<void> {
    const name = sanitizeName(this.submit.name);
    const over = this.over;
    if (!name || !over) return;
    // Flipping the phase before the first await is what makes a double click send once.
    if (this.submit.phase === 'submitting' || this.submit.phase === 'done' || this.submit.phase === 'final') return;
    this.submit = { gameId: over.gameId, phase: 'submitting', name };
    this.click();
    this.rerenderSubmit();
    const r = await this.port.submit(name, over);
    // Another run finished while this one was in flight: its panel is not ours to touch.
    if (this.submit.gameId !== over.gameId) return;
    if (r.ok) {
      this.submit = { gameId: over.gameId, phase: 'done', name: r.data.entry.name, result: r.data };
      this.data = r.data.boards;
      this.fetchedAt = Date.now();
      this.boardPhase = 'ready';
    } else {
      this.submit = { gameId: over.gameId, phase: r.retryable ? 'error' : 'final', name, error: r.error };
    }
    this.rerenderSubmit();
  }

  // ---- Rows ----

  private row(rank: number | null, e: Entry, me: boolean): HTMLLIElement {
    const li = make('li', 'lb-row' + (me ? ' me' : ''));
    if (me) li.setAttribute('aria-current', 'true');
    li.dataset.id = String(e.id);
    li.appendChild(make('span', 'lb-rank', rank === null ? '' : String(rank)));
    const bird = BIRD_ORDER[e.bird];
    const icon = make('span', 'lb-bird');
    if (bird) icon.appendChild(birdCanvas(bird, 1));
    li.appendChild(icon);
    const name = make('span', 'lb-name');
    name.appendChild(make('span', 'lb-name-text', e.name));
    if (me) name.appendChild(make('span', 'lb-you', t('lb.you')));
    li.appendChild(name);
    li.appendChild(make('span', 'lb-score', String(e.score)));
    return li;
  }

  /** Top few rows, plus the player's own row below a gap when it is further down. */
  private compactList(top: readonly Entry[], own: Entry, ownRank: number): HTMLElement {
    const mine = this.port.mine();
    const list = make('ol', 'lb-list compact');
    const shown = top.slice(0, COMPACT_ROWS);
    shown.forEach((e, i) => list.appendChild(this.row(i + 1, e, e.id === own.id || mine.has(e.id))));
    if (!shown.some((e) => e.id === own.id)) {
      const gap = make('li', 'lb-gap', '⋯');
      gap.setAttribute('aria-hidden', 'true');
      list.appendChild(gap);
      list.appendChild(this.row(ownRank, own, true));
    }
    return list;
  }

  // ---- Board screen ----

  renderBoard(into: HTMLElement): void {
    this.boardInto = into;
    if (this.data && Date.now() - this.fetchedAt < BOARD_FRESH_MS) {
      this.boardPhase = 'ready';
      this.drawBoard();
    } else void this.load();
  }

  private async load(): Promise<void> {
    const request = ++this.request;
    this.boardPhase = 'loading';
    this.drawBoard();
    const r = await this.port.boards();
    if (request !== this.request) return;
    if (r.ok) {
      this.data = r.data;
      this.fetchedAt = Date.now();
      this.boardPhase = 'ready';
    } else this.boardPhase = 'error';
    this.drawBoard();
  }

  private drawBoard(): void {
    const into = this.boardInto;
    if (!into?.isConnected) return;
    const p = make('div', 'board-body');
    p.id = 'boardPanel';
    p.appendChild(make('p', 'small', t('lb.subtitle')));
    const tabs = make('div', 'menu row lb-tabs');
    tabs.setAttribute('role', 'tablist');
    for (const [tab, key] of [['all', 'lb.tabAll'], ['week', 'lb.tabWeek']] as const) {
      const b = button('btn btn-small' + (this.tab === tab ? ' active' : ''), t(key), () => {
        if (this.tab === tab) return;
        this.click();
        this.tab = tab;
        this.drawBoard();
      });
      b.id = tab === 'all' ? 'tabAll' : 'tabWeek';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(this.tab === tab));
      tabs.appendChild(b);
    }
    p.appendChild(tabs);
    const body = make('div', 'lb-body');
    body.setAttribute('role', 'tabpanel');
    body.setAttribute('aria-live', 'polite');
    if (this.boardPhase === 'loading') body.appendChild(make('p', 'small lb-note', t('lb.loading')));
    else if (this.boardPhase === 'error' || !this.data) {
      body.appendChild(make('p', 'lb-note bad', t('lb.error')));
      body.appendChild(button('btn', t('lb.retry'), () => void this.load(), 'lbRetry'));
    } else {
      const board = this.tab === 'all' ? this.data.all : this.data.week;
      if (board.top.length === 0) body.appendChild(make('p', 'small lb-note', t('lb.empty')));
      else {
        const mine = this.port.mine();
        const list = make('ol', 'lb-list');
        board.top.forEach((e, i) => list.appendChild(this.row(i + 1, e, mine.has(e.id))));
        body.appendChild(list);
      }
      if (this.tab === 'week') {
        const serverNow = this.data.now + (Date.now() - this.fetchedAt);
        body.appendChild(make('p', 'small lb-resets', t('lb.resets', resetsIn(serverNow, this.data.weekEnd))));
      }
    }
    p.appendChild(body);
    into.replaceChildren(p);
  }
}
