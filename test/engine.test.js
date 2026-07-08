import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../lib/td/engine.js';
import { RECRUIT_COST, START_COINS, MAX_LEVEL, WALL, STREET, FIELD } from '../lib/td/config.js';

function zombie(engine, { x = 500, hp = 10, boss = false } = {}) {
  const z = {
    id: 9000 + engine.zombies.length,
    x,
    y: (STREET.top + STREET.bottom) / 2,
    hp,
    maxHp: hp,
    speed: 20,
    boss,
    variant: 0,
    attacking: false,
    flash: 0,
  };
  engine.zombies.push(z);
  return z;
}

test('recruit fills the first empty slot and costs coins', () => {
  const e = new Engine();
  assert.equal(e.recruit(), true);
  assert.equal(e.coins, START_COINS - RECRUIT_COST);
  assert.equal(e.critterInSlot(0).level, 1);
  assert.equal(e.recruit(), true);
  assert.equal(e.critterInSlot(1).level, 1); // next empty slot
});

test('cannot recruit without enough coins', () => {
  const e = new Engine();
  e.coins = 0;
  assert.equal(e.recruit(), false);
  assert.equal(e.critters.length, 0);
});

test('merging two same-level critters yields one higher level', () => {
  const e = new Engine();
  e.recruit();
  e.recruit();
  assert.equal(e.merge(0, 1), true);
  assert.equal(e.critters.length, 1);
  assert.equal(e.critterInSlot(1).level, 2);
  assert.equal(e.critterInSlot(0), undefined);
});

test('cannot merge different levels', () => {
  const e = new Engine();
  e.coins = 1000;
  e.recruit();
  e.recruit();
  e.merge(0, 1); // -> L2 in slot 1
  e.recruit(); // fresh L1 in slot 0
  assert.equal(e.merge(0, 1), false);
});

test('merge is capped at the max level', () => {
  const e = new Engine();
  e.recruit();
  e.recruit();
  e.critterInSlot(0).level = MAX_LEVEL;
  e.critterInSlot(1).level = MAX_LEVEL;
  assert.equal(e.merge(0, 1), false);
});

test('a critter shoots a zombie in range and a kill awards coins/score/kills', () => {
  const e = new Engine();
  e.recruit(); // slot 0 near the wall
  zombie(e, { x: 300, hp: 5 }); // within L1 range of slot 0; L1 dmg (8) > 5
  const coinsBefore = e.coins;
  e.update(0.1);
  assert.equal(e.zombies.length, 0);
  assert.equal(e.kills, 1);
  assert.ok(e.coins > coinsBefore);
  assert.ok(e.score > 0);
});

test('a zombie at the wall drains wall HP and ends the game at 0', () => {
  const e = new Engine();
  e.wallHp = 5;
  zombie(e, { x: WALL.x }); // already at the wall
  e.update(1); // wallDps ~9 for 1s
  assert.equal(e.wallHp, 0);
  assert.equal(e.phase, 'over');
});

test('update is a no-op once the game is over', () => {
  const e = new Engine();
  e.phase = 'over';
  const coins = e.coins;
  e.update(1);
  assert.equal(e.coins, coins);
});

test('bomb damages every zombie and consumes a charge', () => {
  const e = new Engine();
  zombie(e, { hp: 10 });
  zombie(e, { hp: 10 });
  zombie(e, { hp: 10 });
  const charges = e.abilities.bomb;
  assert.equal(e.useBomb(), true);
  assert.equal(e.zombies.length, 0);
  assert.equal(e.kills, 3);
  assert.equal(e.abilities.bomb, charges - 1);
});

test('freeze activates and consumes a charge', () => {
  const e = new Engine();
  const charges = e.abilities.freeze;
  assert.equal(e.useFreeze(), true);
  assert.equal(e.frozen, true);
  assert.equal(e.abilities.freeze, charges - 1);
});
