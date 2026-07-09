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

// Raider classes — each Red unit is a real class with distinct behaviour, not
// just a random skin. Multipliers apply on top of the per-wave hp/speed scaling.
// `weight` drives the spawn mix (weighted random) once the class is unlocked at
// `fromWave`. `standoff` (red archer only): the unit halts that many px before
// the wall and pelts it with arrows from range.
export const ENEMY_TYPES = {
  pawn:    { sprite: 'red_pawn',    name: 'Pawn',        hpMult: 1,    speedMult: 1,    dpsMult: 1,   coinMult: 1,   weight: 5, fromWave: 1 },
  lancer:  { sprite: 'red_lancer',  name: 'Lancer',      hpMult: 0.55, speedMult: 1.9,  dpsMult: 0.8, coinMult: 1.2, weight: 2, fromWave: 2 },
  warrior: { sprite: 'red_warrior', name: 'Warrior',     hpMult: 2.2,  speedMult: 0.62, dpsMult: 1.8, coinMult: 1.8, weight: 2, fromWave: 3 },
  archer:  { sprite: 'red_archer',  name: 'Red Archer',  hpMult: 0.8,  speedMult: 1.05, dpsMult: 0.7, coinMult: 1.5, weight: 2, fromWave: 4, standoff: 170 },
};

// Bosses arrive every ZOMBIE.bossEvery-th wave and rotate through this list
// (wave 5 → [0], wave 10 → [1], wave 15 → [2], wave 20 → [0] again, scaled up).
//  - warlord:   a plain colossus — huge HP, heavy wall damage.
//  - berserker: ENRAGES at 50% HP (speed & wall damage spike) — burn it fast.
//  - summoner:  periodically conjures pawn minions around itself.
export const BOSSES = [
  { key: 'warlord',   name: 'Warlord Gruk',  sprite: 'red_warrior', hpMult: 14, speedMult: 0.65, dpsMult: 1 },
  { key: 'berserker', name: 'Berserker Morg', sprite: 'red_lancer', hpMult: 11, speedMult: 0.7,  dpsMult: 0.9, enrage: { at: 0.5, speed: 1.9, dps: 1.9 } },
  { key: 'summoner',  name: 'Summoner Vex',  sprite: 'red_archer', hpMult: 12, speedMult: 0.55, dpsMult: 0.8, summon: { every: 4, count: 2 } },
];

// Critical hits: every archer shot rolls rng < chance for CRIT.mult × damage.
// Base chance is raised by the Eagle Eye shop upgrade.
export const CRIT = { base: 0.05, mult: 2 };

// Kill-combo streak: kills within `window` seconds of each other chain a combo;
// each combo step adds `bonus` to the score multiplier, capped at `maxBonus`
// (+200% = 3× score at full streak).
export const COMBO = { window: 2.5, bonus: 0.1, maxBonus: 2 };

// Consumable royal powers shown as cards, bottom-right. `bomb` is a catapult
// boulder volley (the "stone"/batu); `freeze` is a court mage's frost spell (the
// "ice"/es). Engine keys stay bomb/freeze; only the label/icon are themed.
// `charges` is the starting stock; between waves the player can restock more at
// `price` gold each, up to `max`, from the intermission shop (Engine.buyAbility).
export const ABILITIES = {
  bomb: { charges: 3, dmg: 140, label: 'Catapult', icon: '🪨', desc: 'Boulder volley — hits every raider', price: 200, max: 9 },
  freeze: { charges: 3, durationMs: 3500, slow: 0.3, label: 'Frost', icon: '❄️', desc: 'Freezes the horde in place', price: 150, max: 9 },
};

// Permanent, stackable upgrades bought between waves from the shop
// (Engine.buyUpgrade). Each purchase raises that upgrade's level; the gold cost
// escalates as `baseCost * costMul^level`, capped at `max` levels. Effects are
// applied globally in the engine:
//   wall     — +`hp` to the wall's max HP (and heals that much immediately)
//   damage   — +`pct` archer damage per level (multiplier)
//   fireRate — +`pct` archer attack speed per level (multiplier)
//   income   — +`gold` passive gold per second per level
export const UPGRADES = {
  wall: { label: 'Reinforce Wall', icon: '🧱', desc: '+120 max wall HP & repair', baseCost: 140, costMul: 1.55, max: 8, hp: 120 },
  damage: { label: 'Sharpen Arrows', icon: '🗡️', desc: '+15% archer damage', baseCost: 170, costMul: 1.6, max: 8, pct: 0.15 },
  fireRate: { label: 'Quick Draw', icon: '⚡', desc: '+12% archer fire rate', baseCost: 170, costMul: 1.6, max: 8, pct: 0.12 },
  crit: { label: 'Eagle Eye', icon: '🎯', desc: '+4% critical-hit chance', baseCost: 190, costMul: 1.6, max: 8, pct: 0.04 },
  income: { label: 'Royal Coffers', icon: '🪙', desc: '+3 gold per second', baseCost: 130, costMul: 1.5, max: 8, gold: 3 },
};
