// Tunable design constants for Merge Archers — Kingdom Defense.
// Kept separate from the engine so balancing never touches game logic.
//
// The battlefield is a grassy field before a KINGDOM WALL in pixel space (FIELD).
// Royal archers deploy into fixed SLOTS behind the stone wall on the left; the
// enemy horde streams in from the right, marches to the wall, and hammers it.
// When the wall's HP hits 0 the kingdom falls and the run ends.

export const FIELD = { width: 980, height: 560 };

// Left kingdom wall the archers defend. Raiders stop at WALL.x and chip its HP.
export const WALL = { x: 255, width: 46, hp: 400, upgradeCost: 80, upgradeHp: 120 };

// Deployment slots (dashed circles) behind the wall. cols*rows total.
// 3 columns so the rightmost slot clears the wall (WALL.x = 255) with a gap.
export const SLOTS = { cols: 3, rows: 4, x0: 62, y0: 150, dx: 58, dy: 106, radius: 30 };

// Vertical band the raiders spawn and march within.
export const STREET = { top: 116, bottom: 512 };

export const START_COINS = 150;
export const COIN_RATE = 9; // passive gold per second
export const RECRUIT_COST = 50; // cost of a fresh rank-1 archer

// Merge chain: two archers of level L combine into one of level L+1. Every unit
// is an ARCHER — merging promotes it in RANK (stronger, longer range, fancier
// look), it never morphs into a different class. index === level; index 0 unused.
// `range` is the pixel radius a shot reaches; higher ranks reach further, so
// merging boosts power and coverage. All ranks share the animated Tiny Swords
// Archer sheets (idle/shoot); the renderer differentiates rank cosmetically via
// `scale` (size), `tint` (armor colour wash), `aura` (glow ring) and `crown`.
export const CRITTER_LEVELS = [
  null,
  { level: 1, dmg: 8, fireRate: 1.2, range: 320, sprite: 'archer', name: 'Recruit Archer', scale: 0.9, tint: '#c3ccdd' },
  { level: 2, dmg: 16, fireRate: 1.4, range: 355, sprite: 'archer', name: 'Archer', scale: 1.0 },
  { level: 3, dmg: 30, fireRate: 1.6, range: 395, sprite: 'archer', name: 'Sharpshooter', scale: 1.07, tint: '#4fd6c1' },
  { level: 4, dmg: 54, fireRate: 1.8, range: 440, sprite: 'archer', name: 'Ranger', scale: 1.14, tint: '#a487ff', aura: 'rgba(164,135,255,0.55)' },
  { level: 5, dmg: 95, fireRate: 2.1, range: 490, sprite: 'archer', name: 'Royal Marksman', scale: 1.22, tint: '#ffd45e', aura: 'rgba(255,212,94,0.6)' },
  { level: 6, dmg: 165, fireRate: 2.5, range: 560, sprite: 'archer', name: 'Legendary Archer', scale: 1.34, tint: '#ff9e3d', aura: 'rgba(255,158,61,0.75)', crown: true, elite: true },
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

// Raider sprites: animated Tiny Swords "Red" units (run cycle) — the enemy horde
// besieging the wall. Normal ones pick from the pool; the boss (a Red Warrior
// warlord) uses the boss sprite, drawn larger. Purely cosmetic.
export const ENEMY_SPRITES = {
  pool: ['red_pawn', 'red_warrior', 'red_archer', 'red_lancer'],
  boss: 'red_warrior',
};

// Consumable royal powers shown as cards, bottom-right. `bomb` is a catapult
// boulder volley; `freeze` is a court mage's frost spell. Engine keys stay
// bomb/freeze; only the label/icon are themed.
export const ABILITIES = {
  bomb: { charges: 3, dmg: 140, label: 'Catapult', icon: '🪨' },
  freeze: { charges: 3, durationMs: 3500, slow: 0.3, label: 'Frost', icon: '❄️' },
};
