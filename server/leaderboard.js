import { query } from '../db/index.js';
import { DEFAULT_GAME } from '../lib/events.js';

// Persists one row per player for a finished round.
export async function saveResults(room, game, results) {
  if (!results || results.length === 0) return;

  const placeholders = [];
  const values = [];
  results.forEach((r, i) => {
    const b = i * 4;
    placeholders.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`);
    values.push(r.name, game, r.score, room);
  });

  await query(
    `INSERT INTO scores (player_name, game, score, room) VALUES ${placeholders.join(', ')}`,
    values
  );
}

// Global leaderboard: best (and total) score per player across all rounds.
export async function topScores(limit = 10, game = DEFAULT_GAME) {
  const { rows } = await query(
    `SELECT player_name AS name,
            MAX(score)   AS best,
            SUM(score)   AS total,
            COUNT(*)     AS games
       FROM scores
      WHERE game = $1
      GROUP BY player_name
      ORDER BY best DESC, total DESC
      LIMIT $2`,
    [game, limit]
  );

  // pg returns bigint/counts as strings — normalise to numbers for the client.
  return rows.map((r) => ({
    name: r.name,
    best: Number(r.best),
    total: Number(r.total),
    games: Number(r.games),
  }));
}
