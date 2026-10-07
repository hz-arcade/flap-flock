import { describe, expect, it, vi } from 'vitest';
import { createClient, loadName, myEntries, newGameId, rememberEntry, saveName } from '../src/net/leaderboard';
import { validateSubmission, type Boards, type SubmitResponse } from '../shared/scoreRules';

class MemStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

const boards: Boards = {
  now: 1000,
  weekStart: 0,
  weekEnd: 7 * 86_400_000,
  all: { total: 1, top: [{ id: 1, name: 'Sam', score: 30, at: 900, bird: 0 }] },
  week: { total: 1, top: [{ id: 1, name: 'Sam', score: 30, at: 900, bird: 0 }] },
};
const saved: SubmitResponse = { ok: true, duplicate: false, entry: boards.all.top[0]!, rank: { all: 1, week: 1 }, boards };
const req = { v: 1, gid: newGameId(), name: 'Sam', score: 30, secs: 60, flaps: 120, bird: 2 };

function reply(status: number, body: unknown, headers: Record<string, string> = {}): typeof fetch {
  return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers })) as unknown as typeof fetch;
}

describe('leaderboard client', () => {
  it('is disabled without a URL and never touches the network', async () => {
    const f = vi.fn();
    const c = createClient({ baseUrl: '', fetch: f as unknown as typeof fetch });
    expect(c.enabled).toBe(false);
    expect(await c.fetchBoards()).toEqual({ ok: false, error: 'disabled', retryable: false });
    expect(await c.submitScore(req)).toEqual({ ok: false, error: 'disabled', retryable: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches boards', async () => {
    const f = reply(200, boards);
    const c = createClient({ baseUrl: 'https://api.test/', fetch: f });
    expect(c.enabled).toBe(true);
    expect(await c.fetchBoards(5)).toEqual({ ok: true, data: boards });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.test/scores?limit=5');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
  });

  it('submits a score as JSON', async () => {
    const f = reply(200, saved);
    const c = createClient({ baseUrl: 'https://api.test', fetch: f });
    expect(await c.submitScore(req)).toEqual({ ok: true, data: saved });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.test/scores');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(req);
  });

  it('maps rate limiting, with the wait from the body or the header', async () => {
    let c = createClient({ baseUrl: 'https://api.test', fetch: reply(429, { ok: false, error: 'rate', retryAfter: 120 }) });
    expect(await c.submitScore(req)).toEqual({ ok: false, error: 'rate', retryable: false, retryAfter: 120 });
    c = createClient({ baseUrl: 'https://api.test', fetch: reply(429, 'slow down', { 'retry-after': '30' }) });
    expect(await c.submitScore(req)).toEqual({ ok: false, error: 'rate', retryable: false, retryAfter: 30 });
  });

  it.each([400, 403, 413, 422])('treats %i as a final rejection', async (status) => {
    const c = createClient({ baseUrl: 'https://api.test', fetch: reply(status, { ok: false, error: 'x' }) });
    expect(await c.submitScore(req)).toEqual({ ok: false, error: 'rejected', retryable: false });
  });

  it.each([500, 502, 503])('treats %i as retryable', async (status) => {
    const c = createClient({ baseUrl: 'https://api.test', fetch: reply(status, '<html>oops</html>') });
    expect(await c.submitScore(req)).toEqual({ ok: false, error: 'server', retryable: true });
  });

  it('does not trust a 200 with the wrong shape', async () => {
    for (const body of [null, {}, { ok: true }, { ...saved, entry: { id: 'x' } }, { ...saved, boards: { ...boards, all: { total: 1, top: [{ id: 1 }] } } }, 'not json']) {
      const c = createClient({ baseUrl: 'https://api.test', fetch: reply(200, body) });
      expect(await c.submitScore(req)).toEqual({ ok: false, error: 'server', retryable: true });
    }
    const c = createClient({ baseUrl: 'https://api.test', fetch: reply(200, { ...boards, week: null }) });
    expect(await c.fetchBoards()).toEqual({ ok: false, error: 'server', retryable: true });
  });

  it('reports a network failure as offline', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const c = createClient({ baseUrl: 'https://api.test', fetch: f });
    expect(await c.fetchBoards()).toEqual({ ok: false, error: 'offline', retryable: true });
  });

  it('gives up after the timeout', async () => {
    const f = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    ) as unknown as typeof fetch;
    const c = createClient({ baseUrl: 'https://api.test', fetch: f, timeoutMs: 20 });
    expect(await c.submitScore(req)).toEqual({ ok: false, error: 'timeout', retryable: true });
  });
});

describe('device memory', () => {
  it('remembers the last name', () => {
    const s = new MemStore();
    expect(loadName(s)).toBe('');
    saveName('小明', s);
    expect(loadName(s)).toBe('小明');
  });

  it('remembers submitted entry ids, newest last, at most 50', () => {
    const s = new MemStore();
    expect(myEntries(s).size).toBe(0);
    for (let i = 1; i <= 60; i++) rememberEntry(i, s);
    rememberEntry(30, s);
    const ids = [...myEntries(s)];
    expect(ids).toHaveLength(50);
    expect(ids[ids.length - 1]).toBe(30);
    expect(ids).not.toContain(10);
    expect(ids).toContain(60);
  });

  it('survives corrupted or missing storage', () => {
    const s = new MemStore();
    s.setItem('flap-flock.entries', '{broken');
    expect(myEntries(s).size).toBe(0);
    s.setItem('flap-flock.entries', '["a", 3, 4.5, null]');
    expect([...myEntries(s)]).toEqual([3]);
    expect(loadName(null)).toBe('');
    expect(() => rememberEntry(1, null)).not.toThrow();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadName(broken)).toBe('');
    expect(() => saveName('x', broken)).not.toThrow();
    expect(myEntries(broken).size).toBe(0);
  });
});

describe('newGameId', () => {
  it('produces ids the server accepts, and distinct ones', () => {
    const a = newGameId();
    const b = newGameId();
    expect(a).not.toBe(b);
    expect(validateSubmission({ ...req, gid: a }).ok).toBe(true);
  });

  it('falls back when randomUUID is unavailable (plain-http pages)', () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const id = newGameId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(validateSubmission({ ...req, gid: id }).ok).toBe(true);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

describe('adventure board client', () => {
  const adv = { now: 1, total: 1, top: [{ id: 7, name: 'Ann', stars: 9, bird: 0, at: 5 }] };
  const resp = { ok: true, level: { id: '1-1', stars: 3, coins: 11, improved: true }, player: { ...adv.top[0], rank: 1 }, board: adv };
  const clearReq = { v: 1, key: newGameId(), name: 'Ann', level: '1-1', bird: 0, segs: [{ p: [1, 30], h: [] }] };

  it('fetches the board and submits clears', async () => {
    let f = reply(200, adv);
    let c = createClient({ baseUrl: 'https://api.test', fetch: f });
    expect(await c.fetchAdventure(3)).toEqual({ ok: true, data: adv });
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('https://api.test/adventure?limit=3');
    f = reply(200, resp);
    c = createClient({ baseUrl: 'https://api.test', fetch: f });
    expect(await c.submitClear(clearReq)).toEqual({ ok: true, data: resp });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('https://api.test/adventure');
    expect(JSON.parse(init.body)).toEqual(clearReq);
  });

  it('a refused replay is a final rejection; a wrong shape is a server problem', async () => {
    let c = createClient({ baseUrl: 'https://api.test', fetch: reply(422, { ok: false, error: 'implausible' }) });
    expect(await c.submitClear(clearReq)).toEqual({ ok: false, error: 'rejected', retryable: false });
    c = createClient({ baseUrl: 'https://api.test', fetch: reply(200, { ...resp, player: { id: 1 } }) });
    expect(await c.submitClear(clearReq)).toEqual({ ok: false, error: 'server', retryable: true });
  });
});

describe('stars store', async () => {
  const { StarsStore } = await import('../src/net/stars');
  const seg = [{ p: [1, 20], h: [] }];

  it('keeps a stable secret key and the player state', () => {
    const s = new MemStore();
    const a = new StarsStore(s);
    const p = a.player();
    expect(p.joined).toBe(false);
    expect(new StarsStore(s).player().key).toBe(p.key);
    a.updatePlayer({ joined: true, id: 4, stars: 9, rank: 2 });
    expect(new StarsStore(s).player()).toMatchObject({ key: p.key, joined: true, id: 4, stars: 9, rank: 2 });
  });

  it('keeps only the best flight per level and tracks what was sent', () => {
    const st = new StarsStore(new MemStore());
    expect(st.offer('1-2', { bird: 0, stars: 2, coins: 9, segs: seg })).toBe(true);
    expect(st.offer('1-1', { bird: 0, stars: 1, coins: 3, segs: seg })).toBe(true);
    expect(st.pending()).toEqual(['1-1', '1-2']);
    st.markSent('1-1');
    expect(st.pending()).toEqual(['1-2']);
    expect(st.offer('1-2', { bird: 1, stars: 2, coins: 9, segs: seg })).toBe(false);
    expect(st.offer('1-2', { bird: 1, stars: 2, coins: 10, segs: seg })).toBe(true);
    expect(st.offer('1-1', { bird: 0, stars: 3, coins: 11, segs: seg })).toBe(true);
    expect(st.pending()).toEqual(['1-1', '1-2']);
    expect(st.clears()['1-2']?.bird).toBe(1);
  });

  it('survives junk in storage', () => {
    const s = new MemStore();
    s.setItem('flap-flock.player', '{bad');
    s.setItem('flap-flock.replays', '{"1-1": {"bird": "x"}, "9-9": {}}');
    const st = new StarsStore(s);
    expect(st.player().key).toMatch(/^[0-9a-f-]{36}$/);
    expect(st.clears()).toEqual({});
  });
});
