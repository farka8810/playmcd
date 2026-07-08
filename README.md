# playmcd — Merge Archers: Kingdom Defense

A browser **wall-defense** game with a live global leaderboard, themed as a
bright cartoon **kingdom**. A Red raider horde marches across the field to smash
your kingdom wall; recruit **royal archers** onto the ramparts, where they
auto-loose arrows, and **merge** two same-rank archers to **promote** a stronger
one (Recruit Archer → Archer → Sharpshooter → Ranger → Royal Marksman →
Legendary Archer). Every unit stays an archer — higher ranks are the same archer
grown bigger with a colour wash, aura and crown. Survive escalating waves (a
warlord boss every 5th). When the wall falls, your score is submitted to a
leaderboard that updates live for everyone connected.

Character art is **Tiny Swords** by Pixel Frog (fetched, not committed — see
Setup). The kingdom scene, HUD and effects are drawn on an HTML5 canvas.

The game itself runs entirely in the browser (HTML5 canvas + a pure simulation);
the server and database exist only for the leaderboard.

## Stack

- **Next.js (App Router) + React 19** — UI and pages; the game is a `<canvas>`.
- **Custom Node server** (`server.js`) — runs Next.js and **Socket.IO** on a
  single port for the live leaderboard.
- **PostgreSQL** via `pg` — persists scores / leaderboard.

## How to play

**Recruit** archers into the rampart slots behind your kingdom wall; they
auto-loose arrows at the Red raiders marching in from the right. Click one archer
then another of the **same rank** to merge and **promote** them. Use **Catapult**
and **Frost** when overwhelmed, **Repair Wall** when it's low — don't let the wall
fall.

## Prerequisites

- Node.js 20.6+ (uses `--env-file-if-exists`; developed on Node 24)
- A PostgreSQL database

## Setup

```bash
npm install
bash scripts/fetch-assets.sh  # download the Tiny Swords sprites (not committed)
cp .env.example .env          # then edit DATABASE_URL
npm run db:setup              # apply db/schema.sql  (add: npm run db:seed for sample rows)
npm run dev                   # http://localhost:3000
```

Character art is **Tiny Swords** by [Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords)
— free to use but not redistributable, so it isn't committed; `fetch-assets.sh`
pulls it into `public/assets/tiny/`.

Enter a name, play a run, and your score appears on the leaderboard live — open
a second window to watch the leaderboard update when a run ends.

## Deploy

This app runs a **custom Node server** (`server.js` = Next.js + Socket.IO on one
port), so it needs a host that runs a **persistent process** — Render, Railway,
or Fly.io — **not** a serverless platform like Vercel/Netlify (those don't run
`server.js`, so the live Socket.IO leaderboard won't work there).

**One-click on Render** (recommended): push this repo to GitHub, then in Render
choose **New + → Blueprint** and select the repo. The included `render.yaml`
provisions a free Postgres database and a web service, wires `DATABASE_URL`, runs
`npm run build` (which fetches the Tiny Swords art), and starts `npm start`. The
`scores` table is created automatically on first boot, so there is no manual DB
step.

Any other host: set `DATABASE_URL`, then **Build**: `npm install && npm run build`
· **Start**: `npm start`. The build step fetches the art; the server creates the
schema on start.

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
