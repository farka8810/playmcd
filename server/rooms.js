import { Room } from '../lib/game.js';
import { EVENTS, GAME, PHASES, DEFAULT_GAME } from '../lib/events.js';
import { saveResults, topScores } from './leaderboard.js';

// Owns all live rooms and drives their lifecycle: it turns the pure Room state
// machine (lib/game.js) into a running game by scheduling phase transitions with
// setTimeout, broadcasting snapshots over Socket.IO, and persisting results to
// PostgreSQL when a round ends.
//
// Round lifecycle for a room:
//   WAITING --(enough players)--> COUNTDOWN --3s--> PLAYING --15s--> FINISHED
//   FINISHED --5s--> (players remain ? COUNTDOWN : room deleted)
export class RoomManager {
  constructor(io) {
    this.io = io;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, Record<string, NodeJS.Timeout>>} roomId -> named timers */
    this.timers = new Map();
  }

  getOrCreate(id) {
    let room = this.rooms.get(id);
    if (!room) {
      room = new Room(id);
      this.rooms.set(id, room);
    }
    return room;
  }

  broadcast(room) {
    this.io.to(room.id).emit(EVENTS.STATE, room.toJSON());
  }

  join(socket, roomId, name) {
    const room = this.getOrCreate(roomId);
    room.addPlayer(socket.id, name);
    socket.join(roomId);
    socket.data.roomId = roomId;
    this.broadcast(room);

    if (room.phase === PHASES.WAITING && room.size >= GAME.MIN_PLAYERS) {
      this.beginCountdown(room);
    }
  }

  leave(socket) {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.removePlayer(socket.id);
    socket.leave(roomId);
    socket.data.roomId = null;

    if (room.size === 0) {
      this.destroy(roomId);
      return;
    }
    this.broadcast(room);
  }

  tap(socket) {
    const room = this.rooms.get(socket.data.roomId);
    if (room && room.tap(socket.id)) this.broadcast(room);
  }

  beginCountdown(room) {
    room.startCountdown();
    this.broadcast(room);
    this.setTimer(room.id, 'start', GAME.COUNTDOWN_MS, () => {
      room.startPlaying();
      this.broadcast(room);
      this.setTimer(room.id, 'end', GAME.ROUND_MS, () => this.endRound(room));
    });
  }

  async endRound(room) {
    const results = room.finish();
    this.broadcast(room);

    try {
      await saveResults(room.id, DEFAULT_GAME, results);
      this.io.emit(EVENTS.LEADERBOARD, await topScores());
    } catch (err) {
      console.error('[rooms] failed to persist results:', err.message);
    }

    this.setTimer(room.id, 'restart', GAME.RESTART_MS, () => {
      if (room.size > 0) {
        room.reset();
        this.beginCountdown(room);
      } else {
        this.destroy(room.id);
      }
    });
  }

  // --- timer bookkeeping (one named timer set per room) ---

  setTimer(roomId, key, ms, fn) {
    const timers = this.timers.get(roomId) || {};
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = setTimeout(fn, ms);
    this.timers.set(roomId, timers);
  }

  destroy(roomId) {
    const timers = this.timers.get(roomId);
    if (timers) Object.values(timers).forEach(clearTimeout);
    this.timers.delete(roomId);
    this.rooms.delete(roomId);
  }
}
