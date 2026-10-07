# Flap Flock · 扑翅鸟群

A flap-through-the-pipes game in 8-bit platformer clothes. Tap to flap, pick a bird, and fly
through eight short levels in four worlds to the castle at the end of each one. There is also
an endless mode. Both have a global leaderboard.

**Play:** https://arcade.hz.ax/flap-flock/

- **Six birds.** Each bird has its own gravity, flap strength, top falling speed and hitbox:

  | Bird | Character | How to get it |
  |---|---|---|
  | Duck (default) | Balanced and forgiving | From the start |
  | Chicken | Heavy, quick strong hops | From the start |
  | Pelican | Big and floaty; hold to glide | From the start |
  | Sparrow | Tiny and twitchy | Clear World 1 |
  | Penguin | Clumsy in air; underwater the currents can't push it | Clear World 2 |
  | Eagle | Strong, and the course scrolls 10% faster | Clear World 3 |

- **Eight levels.** Each world has a different look:

  | World | Levels | Scenery |
  |---|---|---|
  | 1 | 1-1, 1-2 | Grassland |
  | 2 | 2-1, 2-2 | Underground, then underwater with currents |
  | 3 | 3-1, 3-2 | Snowy night, then cloud tops with moving pipes |
  | 4 | 4-1, 4-2 | Desert dusk with cannons, then the castle with fire wheels and lava |

  Every level has the same layout on every try. The worlds 3 and 4 levels have a halfway flag
  to restart from. Coins sit in the gaps: collect half for two stars, all for three.
- **Controls.** Phone: tap. Desktop: click or `Space` / `↑` / `W`. `P` pauses, `M` mutes,
  `R` restarts.
- **Languages.** English, 简体中文, 繁體中文 and Español. The game detects the language,
  you can switch it in the corner, or use `?lang=zh-TW`.
- **Original art and sound.** All pixel art is drawn in code (`src/render/sprites`). The four
  chiptune loops and every sound effect are synthesised with Web Audio, with no image or audio
  files. Press Start 2P (SIL Open Font License) is used for the Latin pixel text.
- **Installable.** It is a PWA, so it runs offline once installed.
- **Testing aids.** `?debug` draws hitboxes. `?unlock=all` opens every level and bird for
  that visit only.

## Difficulty

The game logic in `src/game/` is DOM-free and fully deterministic: a fixed 1/120 s step,
with every moving thing a function of the run clock. That makes it possible to fly the
levels with bots in `npm test`.

- **Planner bot** (`src/game/autopilot.ts`). It must clear every level with every bird and
  collect every coin, so three stars are always possible. It must also survive 150 endless
  pipes with every bird.
- **Human-like bot** (`test/helpers/bots.ts`). It has 0.22 s of reaction time, timing jitter,
  aiming error and the odd late tap. Seeded trials give each level a pass rate, and
  `test/calibration.test.ts` keeps them on course:
  - a beginner with the duck clears 1-1 in at least 92% of runs (currently 95%);
  - each level is harder than the one before;
  - 4-2 stays possible but hard for a practised player;
  - the penguin is the best bird underwater.

`npm run calibrate` prints the full table with more trials.

## Develop

```sh
npm install
npm run dev        # http://localhost:5183/flap-flock/
npm test           # vitest: physics, levels, bots, calibration, score rules, i18n, songs
npm run build      # tsc + vite → dist/
npm run smoke      # headless Chromium: plays every level, checks audio, screenshots to /tmp
npm run assets     # regenerate icon.svg, icons, iOS launch screens and cover.png into public/
                   # (ONLY=cover npm run assets for just the link-preview image)

npm run scores:dev # the leaderboard Worker locally on :8791 (npm run dev talks to it)
npm run scores:e2e # API checks against a throwaway local Worker
npm run smoke:lb   # the leaderboard in a browser against a throwaway local Worker
```

The browser scripts expect Playwright's Chromium in `~/.cache/ms-playwright/chromium-1223`
(override with `CHROME_PATH`). They use their own ports (4183–4185, 8791–8794), so other
projects' preview servers can keep running.

Pushes to `main` deploy through GitHub Actions to GitHub Pages.

## Leaderboard

There are two boards:

- **Adventure.** It ranks players by total stars over the 8 levels (24 at most). On equal
  stars, whoever reached that total first ranks higher. After a clear you can join with a
  name, once. From then on, every new best clear is added automatically. Each level counts
  its best clear.
- **Endless.** It ranks by pipes passed, all-time and this week, with an optional name at
  game over.

Both live in a small Cloudflare Worker (`worker/`) backed by one SQLite Durable Object,
which runs comfortably on the free tier. The game itself stays a static site.

**Setup.** Add two repository secrets, then re-run the workflow. Until they exist the Worker
job is skipped and the game is published without any leaderboard UI.

```sh
gh secret set CLOUDFLARE_API_TOKEN   # a token from the "Edit Cloudflare Workers" template
gh secret set CLOUDFLARE_ACCOUNT_ID
gh workflow run deploy.yml
```

The workflow deploys the Worker and bakes its address into the site build as
`VITE_SCORES_URL`. To serve the API from another address (a custom domain, say), set the
repository variable `SCORES_URL`; it is used when the Worker job reports no address.

**What is stored.**
- The name as entered, cleaned of invisible characters and cut to at most 16 characters.
- **Endless:** the score, the bird, the time of submission, seconds flown and number of flaps.
- **Adventure:** for each level, the best stars and coins with the bird used, and the star
  total. Each joined device keeps a random secret key; the server stores only a SHA-256 hash
  of it, which lets later clears update the same row. The button presses of a clear are
  checked and then discarded, not stored.

There is no account and no cookie. For rate limiting, the
Worker keeps a salted, truncated hash of the sender's network address for at most a day. The
salt changes daily, and the address itself is never stored. The browser remembers the last
name used and which rows it submitted, to prefill the field and highlight your rows.

**Fair play, Adventure.** A clear is sent as its button presses, not as a result. The Worker
flies those presses with the game's own simulation (`src/game/replay.ts`) and stores only
what the replay achieves. Forged or edited flights don't reach the flag and are refused.

The simulation is deterministic, so the replay matches the player's browser bit for bit:
- a fixed time step;
- seeded levels;
- its own sine (`src/game/dmath.ts`), because `Math.sin` differs slightly between browsers.

A replay of the longest level takes about 4 ms of CPU.

What it cannot rule out is a bot that really flies: the game's own planner can earn every
star.

**Fair play, Endless.** The endless course scrolls at a known speed, so the server knows
exactly how long a given number of pipes takes for each bird. It rejects:
- a score flown in the wrong time;
- more flaps than the cooldown allows;
- duplicate submissions of the same run;
- floods;
- requests from other websites.

It cannot tell whether a *possible* score was really flown. The game runs in the player's
browser, so a determined person can submit an invented but believable result.

**Removing an entry.** Set a third secret and re-run the workflow to switch on the admin
route, then delete by id (ids are in the `GET /scores` output):

```sh
gh secret set SCORES_ADMIN_TOKEN     # any long random string, e.g. from `openssl rand -hex 32`
curl -X DELETE -H "Authorization: Bearer $TOKEN" https://<worker-address>/scores/<id>
```

Without that secret the route does not exist.

**Retention.** Endless keeps the all-time top 1000, plus the top 5000 of the current week and
of the previous week; Adventure keeps the top 3000 players. Everything else is pruned daily.
Weeks start on Monday 00:00 UTC.

**Changing the rules.** The endless ramp (speed, gap, spacing) lives in
`shared/scoreRules.ts` and both the game and the Worker use it. Changing it changes which
scores are plausible; `npm test` checks that honest runs still pass.

Changing the physics or the levels has a bigger effect. Clears recorded before the change
no longer replay, so stored Adventure stars stay but older flights can't be re-sent.
`scripts/fixtures/clears.json` holds sample flights for the end-to-end tests. Regenerate it
with `UPDATE_FIXTURES=1 npx vitest run test/fixtures.test.ts`.
