import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../lib/td/engine.js';
import {
  RECRUIT_COST,
  START_COINS,
  MAX_LEVEL,
  WALL,
  STREET,
  FIELD,
  ABILITIES,
  UPGRADES,
  ENEMY_TYPES,
  BOSSES,
  COMBO,
} from '../lib/td/config.js';

// Drive the engine to the "wave just cleared" state where the intermission shop
// is open (betweenWaves + awaitingNext, no zombies left).
function openShop(e) {
  e._startWave(); // start a wave
  e.spawnQueue = [];
  e.zombies = [];
  e.update(0.1); // the empty field clears the wave and opens the shop
  return e;
}

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

test('moveCritter relocates an archer to an empty slot', () => {
  const e = new Engine();
  e.recruit(); // slot 0
  assert.equal(e.moveCritter(0, 5), 'move');
  assert.equal(e.critterInSlot(0), undefined);
  assert.equal(e.critterInSlot(5).level, 1);
});

test('moveCritter onto a same-rank archer merges (promotes)', () => {
  const e = new Engine();
  e.recruit();
  e.recruit();
  assert.equal(e.moveCritter(0, 1), 'merge');
  assert.equal(e.critters.length, 1);
  assert.equal(e.critterInSlot(1).level, 2);
});

test('moveCritter onto a different-rank archer swaps them', () => {
  const e = new Engine();
  e.coins = 1000;
  e.recruit();
  e.recruit();
  e.merge(0, 1); // L2 in slot 1
  e.recruit(); // L1 in slot 0
  assert.equal(e.moveCritter(0, 1), 'swap');
  assert.equal(e.critterInSlot(0).level, 2);
  assert.equal(e.critterInSlot(1).level, 1);
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

test('a cleared wave opens the shop and pauses instead of auto-advancing', () => {
  const e = openShop(new Engine());
  assert.equal(e.awaitingNext, true);
  assert.equal(e.betweenWaves, true);
  const wave = e.wave;
  e.update(30); // lots of time passes — the next wave must NOT auto-start
  assert.equal(e.wave, wave);
  assert.equal(e.zombies.length, 0);
  assert.equal(e.spawnQueue.length, 0);
});

test('passive gold pauses while the shop is open', () => {
  const e = openShop(new Engine());
  const coins = e.coins;
  e.update(1);
  assert.equal(e.coins, coins);
});

test('buyAbility restocks a charge only while the shop is open', () => {
  const e = new Engine();
  e.coins = 1000;
  assert.equal(e.buyAbility('bomb'), false); // shop closed mid-combat
  openShop(e);
  const before = e.abilities.bomb;
  const coins = e.coins;
  assert.equal(e.buyAbility('bomb'), true);
  assert.equal(e.abilities.bomb, before + 1);
  assert.equal(e.coins, coins - ABILITIES.bomb.price);
});

test('buyAbility is capped at max and requires enough gold', () => {
  const e = openShop(new Engine());
  e.coins = 100000;
  e.abilities.freeze = ABILITIES.freeze.max;
  assert.equal(e.buyAbility('freeze'), false); // at the cap
  e.abilities.freeze = 0;
  e.coins = 0;
  assert.equal(e.buyAbility('freeze'), false); // can't afford
});

test('continueToNextWave closes the shop and sends the next wave', () => {
  const e = openShop(new Engine());
  const wave = e.wave;
  assert.equal(e.continueToNextWave(), true);
  assert.equal(e.awaitingNext, false);
  assert.equal(e.wave, wave + 1);
  assert.equal(e.phase, 'running');
});

test('buyUpgrade raises the level, spends escalating gold, only in the shop', () => {
  const e = new Engine();
  e.coins = 10000;
  assert.equal(e.buyUpgrade('damage'), false); // shop closed mid-combat
  openShop(e);
  e.coins = 10000;
  const first = e.upgradeCost('damage');
  assert.equal(e.buyUpgrade('damage'), true);
  assert.equal(e.upgrades.damage, 1);
  assert.equal(e.coins, 10000 - first);
  const second = e.upgradeCost('damage');
  assert.ok(second > first); // cost escalates with level
});

test('damage upgrade boosts archer damage', () => {
  const e = openShop(new Engine());
  e.coins = 10000;
  // L1 base dmg is 8 (< 10). Two damage levels -> 8 * (1 + 2*0.15) = 10.4 > 10.
  e.buyUpgrade('damage');
  e.buyUpgrade('damage');
  assert.ok(e.damageMult > 1);
  e.recruit(); // slot 0, in range of x=300
  zombie(e, { x: 300, hp: 10 });
  e.update(0.1);
  assert.equal(e.zombies.length, 0); // killed thanks to the damage upgrade
});

test('wall upgrade raises max HP and heals immediately', () => {
  const e = openShop(new Engine());
  e.coins = 10000;
  e.wallHp = 100;
  const maxBefore = e.wallMax;
  e.buyUpgrade('wall');
  assert.equal(e.wallMax, maxBefore + UPGRADES.wall.hp);
  assert.equal(e.wallHp, 100 + UPGRADES.wall.hp);
});

test('buyUpgrade is capped at max level', () => {
  const e = openShop(new Engine());
  e.coins = 1e9;
  e.upgrades.fireRate = UPGRADES.fireRate.max;
  assert.equal(e.buyUpgrade('fireRate'), false);
});

// ---------- enemy classes ----------

test('enemy classes apply their stat multipliers', () => {
  const e = new Engine();
  const pawn = e._makeZombie({ type: 'pawn' });
  const warrior = e._makeZombie({ type: 'warrior' });
  const lancer = e._makeZombie({ type: 'lancer' });
  assert.ok(warrior.maxHp > pawn.maxHp); // tank
  assert.ok(lancer.speed > pawn.speed); // charger
  assert.equal(warrior.sprite, 'red_warrior');
});

test('red archer halts at its standoff range and still damages the wall', () => {
  const e = new Engine();
  const stopX = WALL.x + 22 + ENEMY_TYPES.archer.standoff;
  const z = e._makeZombie({ type: 'archer' }, stopX - 1, 300);
  e.betweenWaves = false;
  const hp = e.wallHp;
  e.update(1);
  assert.equal(z.attacking, true);
  assert.ok(z.x <= stopX); // never advanced past the standoff line
  assert.ok(e.wallHp < hp); // ranged volleys drain the wall
});

// ---------- bosses ----------

test('bosses rotate every 5th wave: warlord, berserker, summoner, repeat', () => {
  const e = new Engine();
  assert.equal(e.bossForWave(5).key, 'warlord');
  assert.equal(e.bossForWave(10).key, 'berserker');
  assert.equal(e.bossForWave(15).key, 'summoner');
  assert.equal(e.bossForWave(20).key, 'warlord');
});

test('a boss wave queues the rotating boss with its name', () => {
  const e = new Engine();
  e.wave = 4;
  e._startWave(); // -> wave 5
  const last = e.spawnQueue[e.spawnQueue.length - 1];
  assert.equal(last.boss.key, 'warlord');
  const waveEvt = e.takeEvents().find((ev) => ev.t === 'wave');
  assert.equal(waveEvt.boss, 'Warlord Gruk');
});

test('the berserker enrages below half HP (faster, harder-hitting)', () => {
  const e = new Engine();
  const b = e._makeZombie({ boss: BOSSES[1] }, 600, 300);
  e.betweenWaves = false;
  const speed = b.speed;
  b.hp = b.maxHp * 0.4;
  e.update(0.016);
  assert.equal(b.enraged, true);
  assert.ok(b.speed > speed);
  assert.ok(e.takeEvents().some((ev) => ev.t === 'enrage'));
});

test('the summoner conjures pawn minions on a timer', () => {
  const e = new Engine();
  e._makeZombie({ boss: BOSSES[2] }, 600, 300);
  e.betweenWaves = false;
  e.update(BOSSES[2].summon.every + 0.1);
  assert.equal(e.zombies.length, 1 + BOSSES[2].summon.count);
  assert.ok(e.takeEvents().some((ev) => ev.t === 'summon'));
});

// ---------- crits & combo ----------

test('critical hits multiply damage (seeded rng)', () => {
  const alwaysCrit = new Engine({ rng: () => 0 }); // roll 0 < critChance
  alwaysCrit.recruit();
  zombie(alwaysCrit, { x: 300, hp: 12 }); // L1 dmg 8 < 12, crit dmg 16 > 12
  alwaysCrit.update(0.1);
  assert.equal(alwaysCrit.zombies.length, 0);

  const neverCrit = new Engine({ rng: () => 0.999 });
  neverCrit.recruit();
  zombie(neverCrit, { x: 300, hp: 12 });
  neverCrit.update(0.1);
  assert.equal(neverCrit.zombies.length, 1); // survived the non-crit
});

test('kill combo chains inside the window, lapses outside it, boosts score', () => {
  const e = new Engine();
  e.time = 10;
  const z1 = zombie(e, {});
  const z2 = zombie(e, {});
  e._killZombie(z1);
  const s1 = e.score;
  e._killZombie(z2);
  assert.equal(e.combo, 2);
  assert.ok(e.score - s1 > s1); // second kill scored more (combo bonus)
  e.time += COMBO.window + 1;
  assert.equal(e.comboNow, 0); // streak lapsed
  const z3 = zombie(e, {});
  e._killZombie(z3);
  assert.equal(e.combo, 1); // fresh streak
  assert.equal(e.maxCombo, 2);
});

test('takeEvents drains the queue', () => {
  const e = new Engine();
  e._killZombie(zombie(e, {}));
  assert.ok(e.takeEvents().some((ev) => ev.t === 'kill'));
  assert.equal(e.takeEvents().length, 0);
});
