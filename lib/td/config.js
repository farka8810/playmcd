// Tunable design constants for Merge Cats Defender.
// Kept separate from the engine so balancing never touches game logic.

export const GRID = {
  cols: 7, // columns; zombies spawn at the right (col = cols) and walk to base (col 0)
  rows: 5, // lanes
  cell: 84, // px, used by the canvas renderer
};

export const BASE_HP = 14; // zombies reaching the base cost HP; 0 = game over
export const START_COINS = 220;
export const COIN_RATE = 13; // passive coins per second
export const CAT_COST = 60; // cost of a fresh level-1 cat

// Merge chain: two critters of level L combine into one of level L+1.
// index === level; index 0 is unused. `sprite` maps to /public/assets/critters.
export const CAT_LEVELS = [
  null,
  { level: 1, dmg: 6, fireRate: 1.3, color: '#f4a259', name: 'Rabbit', sprite: 'rabbit' },
  { level: 2, dmg: 13, fireRate: 1.5, color: '#f4c95d', name: 'Penguin', sprite: 'penguin' },
  { level: 3, dmg: 26, fireRate: 1.7, color: '#8ac926', name: 'Parrot', sprite: 'parrot' },
  { level: 4, dmg: 48, fireRate: 1.9, color: '#4cc9f0', name: 'Monkey', sprite: 'monkey' },
  { level: 5, dmg: 85, fireRate: 2.2, color: '#4361ee', name: 'Panda', sprite: 'panda' },
  { level: 6, dmg: 150, fireRate: 2.6, color: '#b5179e', name: 'Elephant', sprite: 'elephant' },
];
export const MAX_CAT_LEVEL = CAT_LEVELS.length - 1;

// Enemy "zombie critters": normal ones pick a sprite from the pool (tinted green
// by the renderer); bosses use the boss sprite (tinted red). Purely cosmetic.
export const ENEMY_SPRITES = {
  pool: ['pig', 'hippo', 'giraffe', 'snake'],
  boss: 'monkey',
};

export const ZOMBIE = {
  baseHp: 22,
  hpPerWave: 9, // hp added per wave number
  baseSpeed: 0.55, // cells per second
  speedPerWave: 0.02,
  coin: 12, // coins awarded per kill
  killScore: 10,
  bossEvery: 5, // every Nth wave spawns a boss
  bossHpMult: 12,
  bossSpeedMult: 0.6,
  bossDamage: 4, // base HP lost if a boss reaches the base
};

export const WAVE = {
  firstDelay: 2, // seconds before wave 1
  intermission: 4, // seconds between waves
  spawnInterval: 1.1, // seconds between zombies within a wave
  baseCount: 5, // zombies in wave 1
  countPerWave: 2, // extra zombies per wave
  clearBonus: 120, // score per wave cleared
};
