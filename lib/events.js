// Shared between the browser (hooks/components) and the Node server.
// Keep this file free of any Node- or browser-only imports so both sides
// can import it (client via the "@/lib/events" alias, server via a relative path).

export const EVENTS = {
  // client -> server
  JOIN: 'room:join', // { room, name }
  LEAVE: 'room:leave',
  TAP: 'game:tap',
  // server -> client
  STATE: 'game:state', // full room snapshot (see Room.toJSON)
  LEADERBOARD: 'leaderboard:update', // global top scores
};

export const PHASES = {
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  FINISHED: 'finished',
};

export const GAME = {
  COUNTDOWN_MS: 3000, // "3.. 2.. 1.. go" before a round
  ROUND_MS: 15000, // length of one tap round
  RESTART_MS: 5000, // pause on the results screen before the next round
  MIN_PLAYERS: 1, // players required to auto-start a round
  MAX_NAME: 20,
};

export const DEFAULT_GAME = 'tap-battle';
