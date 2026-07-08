import {
  FIELD,
  WALL,
  SLOTS,
  STREET,
  START_COINS,
  COIN_RATE,
  RECRUIT_COST,
  CRITTER_LEVELS,
  MAX_LEVEL,
  ZOMBIE,
  WAVE,
  ABILITIES,
} from './config.js';

// Authoritative, render-free simulation for Merge Critters Defender (wall-defense
// model). Pure: no DOM, no timers, no rAF, randomness only via an injectable rng
// — so it's deterministic and unit-testable (test/engine.test.js). The canvas
// component calls update(dt), reads snapshot() to draw, and forwards player
// actions. Everything is in pixel space (see config FIELD/WALL/SLOTS).
let nextId = 1;
const uid = () => nextId++;

function buildSlots() {
  const out = [];
  for (let r = 0; r < SLOTS.rows; r++) {
    for (let c = 0; c < SLOTS.cols; c++) {
      out.push({ x: SLOTS.x0 + c * SLOTS.dx, y: SLOTS.y0 + r * SLOTS.dy });
    }
  }
  return out;
}

export class Engine {
  constructor(opts = {}) {
    this.rng = opts.rng || Math.random;
    this.slots = buildSlots();
    this.wallHp = WALL.hp;
    this.wallMax = WALL.hp;
    this.coins = START_COINS;
    this.score = 0;
    this.kills = 0;
    this.wave = 0;
    this.time = 0; // seconds elapsed
    this.phase = 'ready'; // 'ready' | 'running' | 'over'
    this.critters = []; // { id, slot, level, cooldown }
    this.zombies = [];
    this.projectiles = []; // visual only
    this.explosions = []; // visual only
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveTimer = WAVE.firstDelay;
    this.betweenWaves = true;
    this.waveKills = 0;
    this.waveTotal = 0;
    this.freezeUntil = -1;
    this.abilities = {
      bomb: ABILITIES.bomb.charges,
      freeze: ABILITIES.freeze.charges,
    };
  }

  // ---------- player actions ----------

  slotOccupied(i) {
    return this.critters.some((c) => c.slot === i);
  }

  critterInSlot(i) {
    return this.critters.find((c) => c.slot === i);
  }

  firstEmptySlot() {
    for (let i = 0; i < this.slots.length; i++) if (!this.slotOccupied(i)) return i;
    return -1;
  }

  recruit() {
    if (this.phase === 'over' || this.coins < RECRUIT_COST) return false;
    const slot = this.firstEmptySlot();
    if (slot < 0) return false;
    this.coins -= RECRUIT_COST;
    this.critters.push({ id: uid(), slot, level: 1, cooldown: 0 });
    return true;
  }

  merge(slotA, slotB) {
    const a = this.critterInSlot(slotA);
    const b = this.critterInSlot(slotB);
    if (!a || !b || a === b) return false;
    if (a.level !== b.level || a.level >= MAX_LEVEL) return false;
    b.level += 1;
    b.cooldown = 0;
    this.critters = this.critters.filter((c) => c !== a);
    return true;
  }

  repairWall() {
    if (this.phase === 'over' || this.coins < WALL.upgradeCost) return false;
    if (this.wallHp >= this.wallMax) return false; // nothing to repair
    this.coins -= WALL.upgradeCost;
    this.wallHp = Math.min(this.wallMax, this.wallHp + WALL.upgradeHp);
    return true;
  }

  useBomb() {
    if (this.phase === 'over' || this.abilities.bomb <= 0) return false;
    this.abilities.bomb -= 1;
    for (const z of [...this.zombies]) {
      z.hp -= ABILITIES.bomb.dmg;
      if (z.hp <= 0) this._killZombie(z);
    }
    this.explosions.push({ id: uid(), x: FIELD.width * 0.6, y: FIELD.height / 2, ttl: 0.5, big: true });
    return true;
  }

  useFreeze() {
    if (this.phase === 'over' || this.abilities.freeze <= 0) return false;
    this.abilities.freeze -= 1;
    this.freezeUntil = this.time + ABILITIES.freeze.durationMs / 1000;
    return true;
  }

  get frozen() {
    return this.time < this.freezeUntil;
  }

  // ---------- simulation ----------

  update(dt) {
    if (this.phase === 'over') return;
    this.time += dt;
    this.coins += COIN_RATE * dt;
    this._waves(dt);
    this._spawn(dt);
    this._critters(dt);
    this._zombies(dt);
    this._effects(dt);
  }

  _waves(dt) {
    if (this.spawnQueue.length > 0 || this.zombies.length > 0) return;
    if (!this.betweenWaves) {
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
    this.waveKills = 0;
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
    this.waveTotal = queue.length;
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
      x: FIELD.width + 20,
      y: STREET.top + this.rng() * (STREET.bottom - STREET.top),
      hp: z.hp,
      maxHp: z.hp,
      speed: z.speed,
      boss: z.boss,
      variant: Math.floor(this.rng() * 1000),
      attacking: false,
      flash: 0,
    });
  }

  _critters(dt) {
    for (const c of this.critters) {
      c.cooldown -= dt;
      if (c.cooldown > 0) continue;
      const spec = CRITTER_LEVELS[c.level];
      const slot = this.slots[c.slot];
      const target = this._targetFor(slot, spec.range);
      if (!target) continue;
      target.hp -= spec.dmg;
      target.flash = 0.12;
      c.cooldown = 1 / spec.fireRate;
      this.projectiles.push({
        id: uid(),
        x: slot.x + 14,
        y: slot.y,
        tx: target.x,
        ty: target.y,
        ttl: 0.18,
      });
      if (target.hp <= 0) this._killZombie(target);
    }
  }

  // Among zombies within `range` of this slot, prioritise the one closest to the
  // wall (smallest x). Limited range means critters must cover the field — a
  // flood can slip past to the wall.
  _targetFor(slot, range) {
    const r2 = range * range;
    let best = null;
    for (const z of this.zombies) {
      const dx = z.x - slot.x;
      const dy = z.y - slot.y;
      if (dx * dx + dy * dy > r2) continue;
      if (!best || z.x < best.x) best = z;
    }
    return best;
  }

  _killZombie(z) {
    this.zombies = this.zombies.filter((k) => k !== z);
    this.coins += ZOMBIE.coin + (z.boss ? ZOMBIE.coin * 8 : 0);
    this.score += ZOMBIE.killScore * (z.boss ? 20 : 1);
    this.kills += 1;
    this.waveKills += 1;
    this.explosions.push({ id: uid(), x: z.x, y: z.y, ttl: 0.28, big: z.boss });
  }

  _zombies(dt) {
    const slow = this.frozen ? ABILITIES.freeze.slow : 1;
    const stopX = WALL.x + 22;
    for (const z of this.zombies) {
      if (z.flash > 0) z.flash -= dt;
      if (z.x > stopX) {
        z.x -= z.speed * slow * dt;
        z.attacking = false;
      } else {
        z.attacking = true;
        this.wallHp -= (z.boss ? ZOMBIE.bossWallDps : ZOMBIE.wallDps) * dt;
        if (this.wallHp <= 0) {
          this.wallHp = 0;
          this.phase = 'over';
          return;
        }
      }
    }
  }

  _effects(dt) {
    for (const p of this.projectiles) p.ttl -= dt;
    this.projectiles = this.projectiles.filter((p) => p.ttl > 0);
    for (const e of this.explosions) e.ttl -= dt;
    this.explosions = this.explosions.filter((e) => e.ttl > 0);
  }

  // Snapshot consumed by the renderer + HUD each frame.
  snapshot() {
    return {
      phase: this.phase,
      wallHp: Math.max(0, Math.round(this.wallHp)),
      wallMax: this.wallMax,
      coins: Math.floor(this.coins),
      score: this.score,
      kills: this.kills,
      wave: this.wave,
      time: this.time,
      betweenWaves: this.betweenWaves,
      nextWaveIn: this.betweenWaves ? Math.max(0, this.waveTimer) : 0,
      waveKills: this.waveKills,
      waveTotal: this.waveTotal,
      frozen: this.frozen,
      abilities: { ...this.abilities },
      slots: this.slots.map((s, i) => {
        const c = this.critterInSlot(i);
        return { i, x: s.x, y: s.y, level: c ? c.level : 0, id: c ? c.id : null };
      }),
      zombies: this.zombies.map((z) => ({
        id: z.id,
        x: z.x,
        y: z.y,
        hp: z.hp,
        maxHp: z.maxHp,
        boss: z.boss,
        variant: z.variant,
        attacking: z.attacking,
        flash: z.flash > 0,
      })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, tx: p.tx, ty: p.ty, ttl: p.ttl })),
      explosions: this.explosions.map((e) => ({ id: e.id, x: e.x, y: e.y, ttl: e.ttl, big: e.big })),
    };
  }
}
