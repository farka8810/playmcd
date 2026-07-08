import { PHASES, GAME } from './events.js';

// Authoritative, framework-agnostic game state for a single room.
//
// This class holds NO timers and performs NO I/O — it is a pure state machine
// so it can be unit-tested (see test/game.test.js). All scheduling, socket
// broadcasting and DB persistence live in server/rooms.js, which drives an
// instance of this class. The browser never runs this code; it only renders the
// snapshots produced by toJSON().
export class Room {
  constructor(id) {
    this.id = id;
    this.phase = PHASES.WAITING;
    /** @type {Map<string, {id: string, name: string, score: number}>} keyed by socket id */
    this.players = new Map();
    this.startsAt = null; // epoch ms when PLAYING begins (during COUNTDOWN)
    this.endsAt = null; // epoch ms when the round ends
  }

  get size() {
    return this.players.size;
  }

  addPlayer(socketId, name) {
    this.players.set(socketId, {
      id: socketId,
      name: (name || 'Anon').slice(0, GAME.MAX_NAME),
      score: 0,
    });
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
  }

  // Returns true when the tap was accepted (round is live and the player exists).
  tap(socketId) {
    if (this.phase !== PHASES.PLAYING) return false;
    const player = this.players.get(socketId);
    if (!player) return false;
    player.score += 1;
    return true;
  }

  startCountdown(now = Date.now()) {
    this.phase = PHASES.COUNTDOWN;
    this.startsAt = now + GAME.COUNTDOWN_MS;
    this.endsAt = this.startsAt + GAME.ROUND_MS;
    for (const player of this.players.values()) player.score = 0;
  }

  startPlaying() {
    this.phase = PHASES.PLAYING;
  }

  // Ends the round and returns the final scoreboard for persistence.
  finish() {
    this.phase = PHASES.FINISHED;
    return this.results();
  }

  reset() {
    this.phase = PHASES.WAITING;
    this.startsAt = null;
    this.endsAt = null;
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({ name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  // Snapshot sent to every client in the room via EVENTS.STATE.
  toJSON() {
    return {
      id: this.id,
      phase: this.phase,
      startsAt: this.startsAt,
      endsAt: this.endsAt,
      players: [...this.players.values()].sort((a, b) => b.score - a.score),
    };
  }
}
