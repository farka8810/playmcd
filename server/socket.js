import { EVENTS } from '../lib/events.js';
import { RoomManager } from './rooms.js';
import { topScores } from './leaderboard.js';

// Wires raw Socket.IO connections to the RoomManager. Called once from
// server.js after the io server is attached to the HTTP server.
export function registerSocketHandlers(io) {
  const manager = new RoomManager(io);

  io.on('connection', (socket) => {
    socket.on(EVENTS.JOIN, async ({ room, name } = {}) => {
      manager.join(socket, String(room || 'lobby'), String(name || 'Anon'));
      try {
        socket.emit(EVENTS.LEADERBOARD, await topScores());
      } catch (err) {
        console.error('[socket] leaderboard fetch failed:', err.message);
      }
    });

    socket.on(EVENTS.TAP, () => manager.tap(socket));
    socket.on(EVENTS.LEAVE, () => manager.leave(socket));
    socket.on('disconnect', () => manager.leave(socket));
  });
}
