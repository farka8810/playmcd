// Shared between the browser and the Node server. Keep free of Node/browser-only
// imports so both sides can import it (client via "@/lib/events", server via a
// relative path).
//
// The game itself (Merge Cats Defender) runs entirely in the browser; the socket
// is used only to submit a final score and to receive live leaderboard updates.

export const EVENTS = {
  SUBMIT: 'score:submit', // client -> server: { name, score, wave }
  LEADERBOARD: 'leaderboard:update', // server -> client: top scores
};

export const DEFAULT_GAME = 'merge-critters';
export const MAX_NAME = 20;
