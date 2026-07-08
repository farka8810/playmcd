import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../lib/td/engine.js';
import { CAT_COST, START_COINS, MAX_CAT_LEVEL } from '../lib/td/config.js';

test('buying a cat costs coins and occupies a cell', () => {
  const e = new Engine();
  assert.equal(e.buyCat(0, 2), true);
  assert.equal(e.coins, START_COINS - CAT_COST);
  assert.equal(e.buyCat(0, 2), false, 'cell already occupied');
  assert.equal(e.cats.length, 1);
});

test('cannot buy without enough coins', () => {
  const e = new Engine();
  e.coins = 0;
  assert.equal(e.buyCat(1, 1), false);
  assert.equal(e.cats.length, 0);
});

test('merging two same-level cats yields one higher-level cat', () => {
  const e = new Engine();
  e.buyCat(0, 1);
  e.buyCat(0, 2);
  assert.equal(e.merge(0, 1, 0, 2), true);
  assert.equal(e.cats.length, 1);
  assert.equal(e.catAt(0, 2).level, 2);
  assert.equal(e.catAt(0, 1), undefined);
});

test('cannot merge different levels', () => {
  const e = new Engine();
  e.coins = 1000; // enough for three buys
  e.buyCat(0, 1);
  e.buyCat(0, 2);
  e.merge(0, 1, 0, 2); // -> L2 at (0,2)
  e.buyCat(0, 1); // fresh L1
  assert.equal(e.merge(0, 1, 0, 2), false, 'L1 into L2 should fail');
  assert.equal(e.cats.length, 2);
});

test('a cat kills a low-hp zombie in its lane and earns coins/score', () => {
  const e = new Engine({ rng: () => 0 }); // all zombies spawn in row 0
  e.buyCat(0, 1);
  e.zombies.push({ id: 999, row: 0, x: 5, hp: 3, maxHp: 3, speed: 0, boss: false });
  const coinsBefore = e.coins;
  e.update(0.5); // L1 dmg (6) > 3 hp -> dead on first shot
  assert.equal(e.zombies.length, 0);
  assert.ok(e.coins > coinsBefore, 'kill should award coins');
  assert.ok(e.score > 0, 'kill should award score');
});

test('a cat ignores zombies that have already passed it', () => {
  const e = new Engine();
  e.buyCat(0, 4); // cat at column 4
  e.zombies.push({ id: 1, row: 0, x: 2, hp: 3, maxHp: 3, speed: 0, boss: false }); // left of the cat
  e.update(0.5);
  assert.equal(e.zombies.length, 1, 'zombie past the cat survives');
});

test('base takes damage when a zombie reaches it, and the game ends at 0', () => {
  const e = new Engine();
  e.baseHp = 1;
  e.zombies.push({ id: 1, row: 0, x: 0.01, hp: 10, maxHp: 10, speed: 5, boss: false });
  e.update(0.5); // moves x below 0 -> reaches base
  assert.equal(e.baseHp, 0);
  assert.equal(e.phase, 'over');
});

test('update is a no-op once the game is over', () => {
  const e = new Engine();
  e.phase = 'over';
  const before = e.coins;
  e.update(1);
  assert.equal(e.coins, before);
});

test('merge is capped at the max cat level', () => {
  const e = new Engine();
  e.buyCat(0, 0);
  e.buyCat(0, 1);
  e.catAt(0, 0).level = MAX_CAT_LEVEL;
  e.catAt(0, 1).level = MAX_CAT_LEVEL;
  assert.equal(e.merge(0, 0, 0, 1), false);
});
