import {
  GRID,
  BASE_HP,
  START_COINS,
  COIN_RATE,
  CAT_COST,
  CAT_LEVELS,
  MAX_CAT_LEVEL,
  ZOMBIE,
  WAVE,
} from './config.js';

// Authoritative, render-free simulation for Merge Cats Defender.
//
// The engine owns ALL game state and rules; the canvas component only calls
// update(dt) each animation frame, reads snapshot() to draw, and forwards the
// player's actions (buyCat / merge). No DOM, no timers, no randomness beyond an
// injectable rng — so the whole thing is deterministic and unit-testable
// (see test/engine.test.js).
//
// Coordinates: cats sit on integer grid cells (row, col). Zombies live at
// (row, x) where x is a float running from GRID.cols (spawn, right edge) down to
// 0 (the base, left edge).
let nextId = 1;
const uid = () => nextId++;

export class Engine {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.baseHp = BASE_HP;
    this.coins = START_COINS;
    this.score = 0;
    this.wave = 0;
    this.phase = 'ready'; // 'ready' | 'running' | 'over'
    this.cats = [];
    this.zombies = [];
    this.tracers = []; // short-lived shot visuals
    this.spawnQueue = []; // zombie specs queued for the current wave
    this.spawnTimer = 0;
    this.waveTimer = WAVE.firstDelay; // countdown to the next wave
    this.betweenWaves = true;
  }

  // ---------- player actions ----------

  cellOccupied(row, col) {
    return this.cats.some((c) => c.row === row && c.col === col);
  }

  catAt(row, col) {
    return this.cats.find((c) => c.row === row && c.col === col);
  }

  buyCat(row, col) {
    if (this.phase === 'over') return false;
    if (row < 0 || row >= GRID.rows || col < 0 || col >= GRID.cols) return false;
    if (this.coins < CAT_COST || this.cellOccupied(row, col)) return false;
    this.coins -= CAT_COST;
    this.cats.push({ id: uid(), row, col, level: 1, cooldown: 0 });
    return true;
  }

  // Combine the cat at (r1,c1) into the cat at (r2,c2) — same level, below max.
  merge(r1, c1, r2, c2) {
    const a = this.catAt(r1, c1);
    const b = this.catAt(r2, c2);
    if (!a || !b || a === b) return false;
    if (a.level !== b.level || a.level >= MAX_CAT_LEVEL) return false;
    b.level += 1;
    b.cooldown = 0;
    this.cats = this.cats.filter((c) => c !== a);
    return true;
  }

  // ---------- simulation ----------

  update(dt) {
    if (this.phase === 'over') return;
    this.coins += COIN_RATE * dt;
    this._waves(dt);
    this._spawn(dt);
    this._cats(dt);
    this._zombies(dt);
    for (const t of this.tracers) t.ttl -= dt;
    this.tracers = this.tracers.filter((t) => t.ttl > 0);
  }

  _waves(dt) {
    if (this.spawnQueue.length > 0 || this.zombies.length > 0) return; // wave live
    if (!this.betweenWaves) {
      // a wave was just fully cleared
      this.betweenWaves = true;
      if (this.wave > 0) this.score += WAVE.clearBonus * this.wave;
      this.waveTimer = WAVE.intermission;
      return;
    }
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) this._startWave();
  }

  _startWave() {
    this.wave += 1;
    this.phase = 'running';
    this.betweenWaves = false;
    const isBoss = this.wave % ZOMBIE.bossEvery === 0;
    const count = WAVE.baseCount + (this.wave - 1) * WAVE.countPerWave;
    const hp = ZOMBIE.baseHp + this.wave * ZOMBIE.hpPerWave;
    const speed = ZOMBIE.baseSpeed + this.wave * ZOMBIE.speedPerWave;
    const queue = [];
    for (let i = 0; i < count; i++) queue.push({ hp, speed, boss: false });
    if (isBoss) {
      queue.push({ hp: hp * ZOMBIE.bossHpMult, speed: speed * ZOMBIE.bossSpeedMult, boss: true });
    }
    this.spawnQueue = queue;
    this.spawnTimer = 0;
  }

  _spawn(dt) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = WAVE.spawnInterval;
    const z = this.spawnQueue.shift();
    this.zombies.push({
      id: uid(),
      row: Math.floor(this.rng() * GRID.rows),
      x: GRID.cols, // just past the right edge
      hp: z.hp,
      maxHp: z.hp,
      speed: z.speed,
      boss: z.boss,
    });
  }

  _cats(dt) {
    for (const cat of this.cats) {
      cat.cooldown -= dt;
      if (cat.cooldown > 0) continue;
      const target = this._frontTarget(cat);
      if (!target) continue;
      const spec = CAT_LEVELS[cat.level];
      target.hp -= spec.dmg;
      cat.cooldown = 1 / spec.fireRate;
      this.tracers.push({ id: uid(), row: cat.row, fromCol: cat.col, toX: target.x, ttl: 0.09 });
      if (target.hp <= 0) this._killZombie(target);
    }
  }

  // Nearest zombie in the cat's lane that hasn't passed the cat yet.
  _frontTarget(cat) {
    let best = null;
    for (const z of this.zombies) {
      if (z.row !== cat.row || z.x <= cat.col) continue;
      if (!best || z.x < best.x) best = z;
    }
    return best;
  }

  _killZombie(z) {
    this.zombies = this.zombies.filter((k) => k !== z);
    this.coins += ZOMBIE.coin + (z.boss ? ZOMBIE.coin * 8 : 0);
    this.score += ZOMBIE.killScore * (z.boss ? 20 : 1);
  }

  _zombies(dt) {
    const survivors = [];
    for (const z of this.zombies) {
      z.x -= z.speed * dt;
      if (z.x <= 0) {
        this.baseHp -= z.boss ? ZOMBIE.bossDamage : 1;
        if (this.baseHp <= 0) {
          this.baseHp = 0;
          this.phase = 'over';
        }
      } else {
        survivors.push(z);
      }
    }
    this.zombies = survivors;
  }

  // Plain object consumed by the renderer and HUD each frame.
  snapshot() {
    return {
      phase: this.phase,
      baseHp: this.baseHp,
      coins: Math.floor(this.coins),
      score: this.score,
      wave: this.wave,
      betweenWaves: this.betweenWaves,
      nextWaveIn: this.betweenWaves ? Math.max(0, this.waveTimer) : 0,
      cats: this.cats.map((c) => ({ id: c.id, row: c.row, col: c.col, level: c.level })),
      zombies: this.zombies.map((z) => ({
        id: z.id,
        row: z.row,
        x: z.x,
        hp: z.hp,
        maxHp: z.maxHp,
        boss: z.boss,
      })),
      tracers: this.tracers.map((t) => ({ id: t.id, row: t.row, fromCol: t.fromCol, toX: t.toX })),
    };
  }
}
