# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

playmcd is **Merge Cats Defender**, a browser tower-defense game (Plants-vs-
Zombies-style) with a live global leaderboard, modeled on playmcd.xyz. Zombies
walk left along lanes toward the base; the player buys cats that auto-shoot down
their lane, and merges two same-level cats into a stronger one. Waves escalate,
every 5th wave sends a boss, and when the base HP hits 0 the run ends and the
score is submitted to a leaderboard that updates live for everyone.

The entire game simulation runs **in the browser**. The server/DB exist only for
the leaderboard.

## Commands

```bash
npm run dev          # Next.js + Socket.IO via the custom server (server.js), http://localhost:3000
npm run build        # next build
npm start            # production custom server (run build first)
npm run lint         # next lint
npm test             # node --test (engine unit tests in test/)
npm run db:setup     # apply db/schema.sql
npm run db:seed      # apply schema + insert sample scores (--sample)
```

Run a single test file / single test:

```bash
node --test test/engine.test.js
node --test --test-name-pattern="merge"
```

`.env` is required for anything touching the DB. Copy `.env.example` → `.env`
and set `DATABASE_URL`. The npm scripts load it with Node's
`--env-file-if-exists=.env`; **`next build`/`next lint` do not** (Next loads its
own env for App Router code).

Local PostgreSQL for dev is Homebrew's `postgresql@17`
(`brew services start postgresql@17`); its binaries (`psql`, `createdb`) live in
`/opt/homebrew/opt/postgresql@17/bin`, which is not on the default PATH.

## Architecture

### One process, one port

`server.js` is a **custom Node HTTP server** that runs Next.js and Socket.IO
together. Next handles all normal HTTP/page requests; Socket.IO owns its
`/socket.io` path (including the WebSocket upgrade) and delegates everything else
back to Next. The browser connects to the same origin it loaded from (see
`hooks/useLeaderboard.js`, which calls `io()` with no URL). This is why the app
must run via `node server.js` (the npm scripts), **not** `next dev`/`next start`
— those skip `server.js` and there is no WebSocket server.

### The game is client-side; the engine is pure

All gameplay lives in the browser, split into a pure simulation and a renderer:

- **`lib/td/engine.js` — `Engine`**: the authoritative game state machine. No
  DOM, no timers, no `requestAnimationFrame`, and randomness only through an
  injectable `rng`. It exposes player actions (`buyCat`, `merge`), a single
  `update(dt)` tick, and `snapshot()` for rendering. Being pure makes it
  deterministic and unit-testable — `test/engine.test.js` drives it directly with
  no browser. **Game rules change here.**
- **`lib/td/config.js`**: all tunable balance (grid size, economy, cat levels,
  zombie/wave scaling). Balancing never touches engine logic. `CAT_LEVELS` is
  indexed by level; index 0 is unused.
- **`components/GameCanvas.jsx`**: owns the `requestAnimationFrame` loop, calls
  `engine.update(dt)`, draws each `snapshot()` to a `<canvas>`, and translates
  clicks into `buyCat`/`merge`. Presentation + input only — it holds no game
  rules. HUD React state is throttled (~15/s) while the canvas animates at 60fps.

Coordinates: cats sit on integer grid cells `(row, col)`; zombies live at
`(row, x)` where `x` is a float from `GRID.cols` (spawn, right) down to `0`
(base, left). A cat only targets zombies in its lane with `x > col` (not yet
passed it), so lane coverage matters.

### The server only handles the leaderboard

When a run ends, `GameCanvas` calls `onGameOver`, and `app/play/page.jsx` emits
`score:submit` over the socket. `server/socket.js` persists one row via
`server/leaderboard.js` (`saveResults`) and `io.emit`s the recomputed board to
**all** clients. `scores` is append-only; the leaderboard is a
`GROUP BY player_name` aggregation (`MAX`/`SUM`/`COUNT`), so there are no
accounts — identity is just the typed-in name. `pg` returns aggregate counts as
strings; `leaderboard.js` normalises them to numbers before the client sees them.

**Gotcha (already bitten once):** the client emits `score:submit` the instant it
connects, so `server/socket.js` registers socket listeners **synchronously**
before any `await`. If you reorder an `await` ahead of `socket.on(...)`, early
events are dropped.

### The socket contract lives in `lib/events.js`

`EVENTS` (`SUBMIT`, `LEADERBOARD`), `DEFAULT_GAME`, and `MAX_NAME` are defined
once and imported by both browser and server so they can't drift. Keep this file
free of Node- and browser-only imports.

### Client pages

App Router under `app/`. `/` (home, name entry) and `/play` are client screens.
`/play` reads `?name=` via `useSearchParams`, so its body **must** sit inside a
`<Suspense>` boundary or the production build fails prerendering. `app/
leaderboard/page.jsx` and `app/api/leaderboard/route.js` read Postgres directly
(`force-dynamic`) — the REST route is a fallback/debug path; the live board comes
over the socket.

## Conventions specific to this repo

- **ESM everywhere** (`"type": "module"`); use `.js`/`.jsx` extensions.
- **Import style is split by runtime, and this matters:**
  - Node-executed code (`server.js`, `server/`, `db/`) uses **relative** imports
    with explicit extensions (`../lib/events.js`). Node runs these directly and
    does **not** understand the `@/` alias.
  - Next-bundled code (`app/`, `components/`, `hooks/`, `lib/td/*` when imported
    by them) uses the **`@/` alias** from `jsconfig.json`.
  - `lib/events.js` is imported from both sides — same file, two import styles.
    Keep `lib/` dependency-free so it stays safe for the browser bundle.
- Keep `server/` and `db/` out of client components — they pull in `pg`. Server
  Components and route handlers may import `server/leaderboard.js` (DB only).

## Extending the game

- **Balance**: edit `lib/td/config.js` only.
- **New mechanics** (new cat behaviors, zombie types, abilities): add to
  `Engine` in `lib/td/engine.js` and cover them in `test/engine.test.js`; then
  render them in `GameCanvas.jsx`.
- **A second game**: reuse the `scores` table via the `game` column
  (`DEFAULT_GAME` in `lib/events.js`); `topScores(limit, game)` already filters
  by it.
