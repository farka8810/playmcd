# playmcd

A real-time multiplayer arcade (à la playmcd.xyz). The bundled game is **Tap
Battle**: players join a room, and when a round starts everyone taps as fast as
they can for 15 seconds. Scores update live for everyone in the room, and final
scores are written to a global leaderboard that broadcasts to all connected
clients.

## Stack

- **Next.js (App Router) + React 19** — UI and server-rendered pages.
- **Custom Node server** (`server.js`) — runs Next.js and **Socket.IO** on a
  single port so the game uses real WebSockets.
- **PostgreSQL** via `pg` — persists scores / leaderboard.

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

Open the app in two browser windows, join the same room with different names,
and watch scores sync in real time.

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
