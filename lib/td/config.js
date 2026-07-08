// Tunable design constants for Merge Critters Defender.
// Kept separate from the engine so balancing never touches game logic.
//
// The battlefield is a single urban "street" in pixel space (FIELD). Critters
// deploy into fixed SLOTS behind a WALL on the left; zombies stream in from the
// right, walk to the wall, and attack it. When the wall's HP hits 0 the run ends.

export const FIELD = { width: 980, height: 560 };

// Left wall the critters defend. Zombies stop at WALL.x and chip its HP.
export const WALL = { x: 255, width: 46, hp: 400, upgradeCost: 80, upgradeHp: 120 };

// Deployment slots (dashed circles) behind the wall. cols*rows total.
export const SLOTS = { cols: 4, rows: 4, x0: 66, y0: 150, dx: 58, dy: 106, radius: 30 };

// Vertical band the zombies spawn and walk within.
export const STREET = { top: 116, bottom: 512 };

export const START_COINS = 150;
export const COIN_RATE = 9; // passive coins per second
export const RECRUIT_COST = 50; // cost of a fresh level-1 critter

// Merge chain: two critters of level L combine into one of level L+1.
// index === level; index 0 unused. `sprite` maps to /public/assets/critters.
// `range` is the pixel radius (from the slot) a critter can hit; higher levels
// reach further, so merging both boosts power and coverage.
export const CRITTER_LEVELS = [
  null,
  { level: 1, dmg: 8, fireRate: 1.2, range: 320, sprite: 'rabbit', name: 'Rabbit' },
  { level: 2, dmg: 16, fireRate: 1.4, range: 355, sprite: 'penguin', name: 'Penguin' },
  { level: 3, dmg: 30, fireRate: 1.6, range: 395, sprite: 'parrot', name: 'Parrot' },
  { level: 4, dmg: 54, fireRate: 1.8, range: 440, sprite: 'monkey', name: 'Monkey' },
  { level: 5, dmg: 95, fireRate: 2.1, range: 490, sprite: 'panda', name: 'Panda' },
  { level: 6, dmg: 165, fireRate: 2.5, range: 560, sprite: 'elephant', name: 'Elephant' },
];
export const MAX_LEVEL = CRITTER_LEVELS.length - 1;

export const ZOMBIE = {
  baseHp: 34,
  hpPerWave: 16,
  baseSpeed: 44, // px per second
  speedPerWave: 2.4,
  wallDps: 14, // wall HP drained per second while a normal zombie attacks
  bossWallDps: 46,
  coin: 11,
  killScore: 10,
  bossEvery: 5,
  bossHpMult: 14,
  bossSpeedMult: 0.65,
};

export const WAVE = {
  firstDelay: 2.5,
  intermission: 5,
  spawnInterval: 0.7,
  baseCount: 8,
  countPerWave: 3,
  clearBonus: 120,
};

// Enemy sprites: normal ones pick from the pool (renderer tints green); bosses
// use the boss sprite (tinted red). Purely cosmetic.
export const ENEMY_SPRITES = {
  pool: ['pig', 'hippo', 'giraffe', 'snake'],
  boss: 'monkey',
};

// Consumable powers shown as cards, bottom-right.
export const ABILITIES = {
  bomb: { charges: 3, dmg: 140, label: 'TNT', icon: '💥' },
  freeze: { charges: 3, durationMs: 3500, slow: 0.3, label: 'Freeze', icon: '❄️' },
};
