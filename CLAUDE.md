# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

playmcd is a real-time multiplayer arcade. The bundled game is **Tap Battle**:
players join a room, a round auto-starts, everyone taps for 15s, live scores sync
to the room, and final scores persist to a global leaderboard that broadcasts to
every connected client. Adding new games means adding new authoritative state
machines alongside `lib/game.js` — see "Adding a game" below.

## Commands

```bash
npm run dev          # Next.js + Socket.IO via the custom server (server.js), http://localhost:3000
npm run build        # next build
npm start            # production custom server (run build first)
npm run lint         # next lint
npm test             # node --test (unit tests in test/)
npm run db:setup     # apply db/schema.sql
npm run db:seed      # apply schema + insert sample scores (--sample)
```

Run a single test file / single test:

```bash
node --test test/game.test.js
node --test --test-name-pattern="sorted by score"
```

`.env` is required for anything touching the DB. Copy `.env.example` → `.env`
and set `DATABASE_URL`. The npm scripts load it with Node's
`--env-file-if-exists=.env`; **`next build`/`next lint` do not** (Next loads its
own env for App Router code).

## Architecture

### One process, one port (the key structural decision)

`server.js` is a **custom Node HTTP server** that runs Next.js and Socket.IO
together. Next handles all normal HTTP/page requests; Socket.IO owns its
`/socket.io` path (including the WebSocket upgrade) and delegates everything else
back to Next's request handler. There is no separate WebSocket service — the
browser connects to the same origin it loaded the page from (see
`hooks/useSocket.js`, which calls `io()` with no URL). This is why the game must
be started via `node server.js` (the npm scripts), **not** `next dev`/`next start`
— those skip `server.js` and you get no WebSocket server.

### Authoritative server, dumb client

All game truth lives on the server. The browser never computes scores or phase
transitions — it renders snapshots and sends intent (`tap`). Three server layers:

- **`lib/game.js` — `Room`**: a pure, I/O-free, timer-free state machine (add/
  remove player, `tap`, phase transitions, `toJSON` snapshot). Pure on purpose so
  it is unit-testable (`test/game.test.js`) and shareable. Edits to game rules go
  here.
- **`server/rooms.js` — `RoomManager`**: drives `Room` instances. Owns the
  `setTimeout` schedule for phase transitions, broadcasts snapshots over
  Socket.IO, and persists results. This is where "a game runs."
- **`server/socket.js`**: thin wiring from raw socket events to `RoomManager`.

Round lifecycle (managed by `RoomManager`, constants in `lib/events.js`):
`WAITING → COUNTDOWN(3s) → PLAYING(15s) → FINISHED`, then after 5s it loops back
to `COUNTDOWN` if players remain, otherwise the room is destroyed. An empty room
is deleted and its timers cleared.

### The socket contract lives in `lib/events.js`

`EVENTS`, `PHASES`, and `GAME` timing constants are defined once and imported by
**both** the browser and the server, so event names and rules can't drift. Keep
this file free of Node- and browser-only imports.

### Persistence flow

When a round ends, `RoomManager.endRound` calls `server/leaderboard.js`:
`saveResults` inserts one `scores` row per player, then `topScores` recomputes the
global board and it's `io.emit`'d to all clients. `scores` is append-only; the
leaderboard is a `GROUP BY player_name` aggregation (`MAX`/`SUM`/`COUNT`), so
there are no user accounts — identity is just the typed-in name. `pg` returns
aggregate counts as strings; `leaderboard.js` normalises them to numbers before
they reach the client.

### Client

App Router under `app/`. `app/leaderboard/page.jsx` and
`app/api/leaderboard/route.js` are **server-side** reads straight from Postgres
(both `force-dynamic`) — the REST route is a fallback/debug path; the live board
comes over the socket. `app/play/[room]/page.jsx` is the only stateful client
screen and gets everything from the `useSocket` hook. Note `params` is a Promise
in Next 15 — it's unwrapped with React's `use()`.

## Conventions specific to this repo

- **ESM everywhere** (`"type": "module"`); use `.js`/`.jsx` extensions.
- **Import style is split by runtime, and this matters:**
  - Node-executed code (`server.js`, `server/`, `db/`) uses **relative** imports
    with explicit extensions (`../lib/events.js`). Node runs these directly and
    does **not** understand the `@/` alias.
  - Next-bundled code (`app/`, `components/`, `hooks/`) uses the **`@/` alias**
    (`@/lib/events`, `@/server/leaderboard`) from `jsconfig.json`.
  - `lib/` is imported from both sides — same file, two import styles. Keep it
    dependency-free so it stays safe for the browser bundle.
- Keep `server/` and `db/` out of client components — they pull in `pg`/`socket.io`.
  Server Components and route handlers may import `server/leaderboard.js` (DB only).

## Adding a game

1. Add an authoritative state machine next to `lib/game.js` (pure, testable).
2. Add its timing/phase constants and event names to `lib/events.js`.
3. Teach `RoomManager` (or a sibling manager) how to drive it and persist results.
4. Reuse the `scores` table via the `game` column (defaults to `tap-battle`);
   `topScores(limit, game)` already filters by it.
