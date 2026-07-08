# playmcd — Merge Critters Defender

A browser **tower-defense** game with a live global leaderboard, inspired by
playmcd.xyz. Zombie critters march down lanes toward your base; buy animals that
auto-shoot their lane, **merge** two same-level animals into a stronger one
(rabbit → penguin → … → elephant), and survive escalating waves (a boss every
5th wave). When the base falls, your score is submitted to a leaderboard that
updates live for everyone connected.

Character art is Kenney's *Animal Pack* (CC0). See
`public/assets/critters/CREDITS.md`.

The game itself runs entirely in the browser (HTML5 canvas + a pure simulation);
the server and database exist only for the leaderboard.

## Stack

- **Next.js (App Router) + React 19** — UI and pages; the game is a `<canvas>`.
- **Custom Node server** (`server.js`) — runs Next.js and **Socket.IO** on a
  single port for the live leaderboard.
- **PostgreSQL** via `pg` — persists scores / leaderboard.

## How to play

Buy a cat and click an empty cell to place it in a lane. Cats auto-shoot zombies
approaching from the right. Click one cat then another of the **same level** to
merge them into a stronger form. Cover all five lanes and don't let zombies reach
the base.

## Prerequisites

- Node.js 20.6+ (uses `--env-file-if-exists`; developed on Node 24)
- A PostgreSQL database

## Setup

```bash
npm install
cp .env.example .env        # then edit DATABASE_URL
npm run db:setup            # apply db/schema.sql   (add: npm run db:seed for sample rows)
npm run dev                 # http://localhost:3000
```

Enter a name, play a run, and your score appears on the leaderboard live — open
a second window to watch the leaderboard update when a run ends.

## Scripts

| Command            | What it does                                         |
| ------------------ | ---------------------------------------------------- |
| `npm run dev`      | Start Next.js + Socket.IO (custom server) in dev     |
| `npm run build`    | Production build (`next build`)                      |
| `npm start`        | Run the production server                            |
| `npm run lint`     | ESLint (`next lint`)                                 |
| `npm test`         | Run the Node test runner (`node --test`)             |
| `npm run db:setup` | Apply the schema                                     |
| `npm run db:seed`  | Apply schema + insert sample scores                  |

See `CLAUDE.md` for the architecture and conventions.
