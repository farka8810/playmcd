-- Schema for playmcd. Applied by db/seed.js (npm run db:setup).
-- Idempotent so it can be re-run safely.

CREATE TABLE IF NOT EXISTS scores (
  id          BIGSERIAL PRIMARY KEY,
  player_name TEXT        NOT NULL,
  game        TEXT        NOT NULL DEFAULT 'tap-battle',
  score       INTEGER     NOT NULL DEFAULT 0,
  room        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leaderboard queries filter/sort by (game, score).
CREATE INDEX IF NOT EXISTS idx_scores_game_score ON scores (game, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player_name);
