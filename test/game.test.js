import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../lib/game.js';
import { PHASES } from '../lib/events.js';

test('taps are rejected until the round is PLAYING', () => {
  const room = new Room('t');
  room.addPlayer('a', 'Ann');

  assert.equal(room.tap('a'), false, 'WAITING should reject taps');

  room.startCountdown();
  assert.equal(room.tap('a'), false, 'COUNTDOWN should reject taps');

  room.startPlaying();
  assert.equal(room.tap('a'), true);
  assert.equal(room.players.get('a').score, 1);
});

test('startCountdown resets every score to zero', () => {
  const room = new Room('t');
  room.addPlayer('a', 'Ann');
  room.startPlaying();
  room.tap('a');
  room.startCountdown();
  assert.equal(room.players.get('a').score, 0);
  assert.equal(room.phase, PHASES.COUNTDOWN);
});

test('results are sorted by score descending', () => {
  const room = new Room('t');
  room.addPlayer('a', 'Ann');
  room.addPlayer('b', 'Bob');
  room.startCountdown();
  room.startPlaying();
  room.tap('b');
  room.tap('b');
  room.tap('a');

  const results = room.finish();
  assert.equal(results[0].name, 'Bob');
  assert.equal(results[0].score, 2);
  assert.equal(room.phase, PHASES.FINISHED);
});

test('player names are trimmed to the max length', () => {
  const room = new Room('t');
  room.addPlayer('a', 'x'.repeat(50));
  assert.equal(room.players.get('a').name.length, 20);
});
