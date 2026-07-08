import { EVENTS, DEFAULT_GAME, MAX_NAME } from '../lib/events.js';
import { saveResults, topScores } from './leaderboard.js';

// The game is client-side, so the server only does two things over the socket:
// send the current leaderboard on connect, and persist + rebroadcast a score
// when a player's run ends.
export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Register listeners synchronously — the client may emit score:submit the
    // instant it connects, so attach the handler before any await.
    socket.on(EVENTS.SUBMIT, async (payload = {}) => {
      const name = String(payload.name || 'Anon').slice(0, MAX_NAME);
      const score = Math.max(0, Math.floor(Number(payload.score) || 0));
      if (!score) return; // ignore empty runs

      try {
        await saveResults('solo', DEFAULT_GAME, [{ name, score }]);
        io.emit(EVENTS.LEADERBOARD, await topScores()); // broadcast to everyone
      } catch (err) {
        console.error('[socket] score submit failed:', err.message);
      }
    });

    // Send the current leaderboard for this client.
    topScores()
      .then((board) => socket.emit(EVENTS.LEADERBOARD, board))
      .catch((err) => console.error('[socket] leaderboard fetch failed:', err.message));
  });
}
