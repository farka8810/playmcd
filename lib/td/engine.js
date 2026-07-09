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
  UPGRADES,
  ENEMY_TYPES,
  BOSSES,
  CRIT,
  COMBO,
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
    // After each cleared wave the sim pauses here until the player continues to
    // the next wave from the intermission shop (see continueToNextWave). The very
    // first wave still auto-starts after firstDelay.
    this.awaitingNext = false;
    this.waveKills = 0;
    this.waveTotal = 0;
    this.freezeUntil = -1;
    this.abilities = {
      bomb: ABILITIES.bomb.charges,
      freeze: ABILITIES.freeze.charges,
    };
    // Permanent shop upgrades (levels) and the global multipliers they drive.
    this.upgrades = { wall: 0, damage: 0, fireRate: 0, crit: 0, income: 0 };
    this.damageMult = 1;
    this.fireRateMult = 1;
    this.critChance = CRIT.base;
    // Kill-combo streak: chained kills inside COMBO.window multiply score.
    this.combo = 0;
    this.maxCombo = 0;
    this.lastKillAt = -Infinity;
    // Per-wave base stats, kept so mid-wave summons match the wave's power.
    this.waveStats = { hp: ZOMBIE.baseHp, speed: ZOMBIE.baseSpeed };
    // Wall-integrity fractions that still owe the renderer a "crack" event.
    this.wallCracks = [0.75, 0.5, 0.25];
    // One-shot gameplay events (hits, kills, merges, wave starts …) consumed by
    // the renderer for damage numbers / particles / shake / SFX. The engine
    // stays pure: it only records that things happened.
    this.events = [];
  }

  _emit(t, data) {
    this.events.push({ t, ...data });
  }

  // Drain the pending event queue (renderer calls this once per frame).
  takeEvents() {
    return this.events.splice(0);
  }

  // Current combo, accounting for the streak window having possibly lapsed.
  get comboNow() {
    return this.time - this.lastKillAt <= COMBO.window ? this.combo : 0;
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
    this.critters.push({ id: uid(), slot, level: 1, cooldown: 0, atk: 0 });
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
    const s = this.slots[b.slot];
    this._emit('merge', { x: s.x, y: s.y, level: b.level });
    return true;
  }

  // Drag-and-drop relocation of the archer in `from` onto slot `to`:
  //  - empty target  -> move it there
  //  - same rank      -> merge (promote)
  //  - other occupied -> swap the two archers' positions
  // Returns 'move' | 'merge' | 'swap' | false.
  moveCritter(from, to) {
    if (this.phase === 'over' || from === to) return false;
    const a = this.critterInSlot(from);
    if (!a) return false;
    const b = this.critterInSlot(to);
    if (!b) {
      a.slot = to;
      return 'move';
    }
    if (a.level === b.level && a.level < MAX_LEVEL) {
      return this.merge(from, to) ? 'merge' : false;
    }
    a.slot = to;
    b.slot = from;
    return 'swap';
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

  // ---------- intermission shop (only while a wave is cleared) ----------

  // Restock one charge of a consumable power. Allowed only between waves (when
  // the shop is open), capped at ABILITIES[key].max.
  buyAbility(key) {
    if (!this.awaitingNext || this.phase === 'over') return false;
    const spec = ABILITIES[key];
    if (!spec || !spec.price) return false;
    if (this.abilities[key] >= spec.max) return false;
    if (this.coins < spec.price) return false;
    this.coins -= spec.price;
    this.abilities[key] += 1;
    return true;
  }

  // Gold cost of the NEXT level of a permanent upgrade (escalates with level).
  upgradeCost(key) {
    const u = UPGRADES[key];
    if (!u) return Infinity;
    return Math.round(u.baseCost * Math.pow(u.costMul, this.upgrades[key]));
  }

  // Buy the next level of a permanent upgrade (wall / damage / fireRate /
  // income). Allowed only between waves, capped at UPGRADES[key].max.
  buyUpgrade(key) {
    if (!this.awaitingNext || this.phase === 'over') return false;
    const u = UPGRADES[key];
    if (!u) return false;
    if (this.upgrades[key] >= u.max) return false;
    const cost = this.upgradeCost(key);
    if (this.coins < cost) return false;
    this.coins -= cost;
    this.upgrades[key] += 1;
    if (key === 'wall') {
      this.wallMax += u.hp;
      this.wallHp = Math.min(this.wallMax, this.wallHp + u.hp); // reinforce = fresh HP now
    } else if (key === 'damage') {
      this.damageMult = 1 + this.upgrades.damage * u.pct;
    } else if (key === 'fireRate') {
      this.fireRateMult = 1 + this.upgrades.fireRate * u.pct;
    } else if (key === 'crit') {
      this.critChance = CRIT.base + this.upgrades.crit * u.pct;
    }
    return true;
  }

  // Close the shop and send in the next wave.
  continueToNextWave() {
    if (!this.awaitingNext || this.phase === 'over') return false;
    this.awaitingNext = false;
    this._startWave();
    return true;
  }

  get frozen() {
    return this.time < this.freezeUntil;
  }

  // ---------- simulation ----------

  update(dt) {
    if (this.phase === 'over') return;
    this.time += dt;
    // Passive gold (plus any Royal Coffers upgrade) pauses while the shop is open
    // so players can't idle-farm the intermission.
    if (!this.awaitingNext) {
      this.coins += (COIN_RATE + this.upgrades.income * UPGRADES.income.gold) * dt;
    }
    this._waves(dt);
    this._spawn(dt);
    this._critters(dt);
    this._zombies(dt);
    this._effects(dt);
  }

  _waves(dt) {
    if (this.spawnQueue.length > 0 || this.zombies.length > 0) return;
    if (this.awaitingNext) return; // paused: player is in the shop
    if (!this.betweenWaves) {
      // A wave just cleared: bank the bonus and open the intermission shop.
      this.betweenWaves = true;
      this.score += WAVE.clearBonus * this.wave;
      this.awaitingNext = true;
      return;
    }
    // Only the opening wave uses the auto-countdown; later waves wait on the shop.
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) this._startWave();
  }

  // Weighted-random raider class among those unlocked by this wave.
  _pickType() {
    const pool = Object.keys(ENEMY_TYPES).filter((k) => this.wave >= ENEMY_TYPES[k].fromWave);
    const total = pool.reduce((s, k) => s + ENEMY_TYPES[k].weight, 0);
    let roll = this.rng() * total;
    for (const k of pool) {
      roll -= ENEMY_TYPES[k].weight;
      if (roll <= 0) return k;
    }
    return 'pawn';
  }

  // Boss for a boss-wave: rotate through BOSSES (wave 5 → [0], 10 → [1], …).
  bossForWave(wave) {
    return BOSSES[(wave / ZOMBIE.bossEvery - 1) % BOSSES.length];
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
    this.waveStats = { hp, speed };
    const queue = [];
    for (let i = 0; i < count; i++) queue.push({ type: this._pickType() });
    let bossSpec = null;
    if (isBoss) {
      bossSpec = this.bossForWave(this.wave);
      queue.push({ boss: bossSpec });
    }
    this.spawnQueue = queue;
    this.waveTotal = queue.length;
    this.spawnTimer = 0;
    this._emit('wave', { wave: this.wave, boss: bossSpec ? bossSpec.name : null });
  }

  // Instantiate one raider (normal class or boss) at the spawn edge. Also used
  // by the Summoner boss to conjure minions mid-field at (atX, atY).
  _makeZombie(entry, atX, atY) {
    const { hp, speed } = this.waveStats;
    const b = entry.boss;
    const spec = b || ENEMY_TYPES[entry.type] || ENEMY_TYPES.pawn;
    const z = {
      id: uid(),
      x: atX ?? FIELD.width + 20,
      y: atY ?? STREET.top + this.rng() * (STREET.bottom - STREET.top),
      hp: hp * (b ? b.hpMult : spec.hpMult),
      speed: speed * (b ? b.speedMult : spec.speedMult),
      type: b ? null : entry.type || 'pawn',
      boss: !!b,
      bossKey: b ? b.key : null,
      name: b ? b.name : null,
      sprite: spec.sprite,
      dpsMult: spec.dpsMult ?? 1,
      coinMult: b ? 1 : spec.coinMult,
      standoff: spec.standoff || 0,
      enraged: false,
      summonT: b && b.summon ? b.summon.every : 0,
      shotT: 0,
      variant: Math.floor(this.rng() * 1000),
      attacking: false,
      flash: 0,
    };
    z.maxHp = z.hp;
    this.zombies.push(z);
    return z;
  }

  _spawn(dt) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = WAVE.spawnInterval;
    const entry = this.spawnQueue.shift();
    const z = this._makeZombie(entry);
    if (z.boss) this._emit('boss', { name: z.name, key: z.bossKey });
  }

  _critters(dt) {
    for (const c of this.critters) {
      if (c.atk > 0) c.atk -= dt;
      c.cooldown -= dt;
      if (c.cooldown > 0) continue;
      const spec = CRITTER_LEVELS[c.level];
      const slot = this.slots[c.slot];
      const target = this._targetFor(slot, spec.range);
      if (!target) continue;
      const crit = this.rng() < this.critChance;
      const dmg = spec.dmg * this.damageMult * (crit ? CRIT.mult : 1);
      target.hp -= dmg;
      target.flash = 0.12;
      c.atk = 0.28; // trigger the attack animation
      c.cooldown = 1 / (spec.fireRate * this.fireRateMult);
      this._emit('hit', { x: target.x, y: target.y, dmg: Math.round(dmg), crit });
      this.projectiles.push({
        id: uid(),
        x: slot.x + 14,
        y: slot.y,
        tx: target.x,
        ty: target.y,
        ttl: 0.18,
        dur: 0.18,
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
    // Chain the kill-combo if this kill lands inside the streak window.
    this.combo = this.time - this.lastKillAt <= COMBO.window ? this.combo + 1 : 1;
    this.lastKillAt = this.time;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const comboMult = 1 + Math.min(COMBO.maxBonus, COMBO.bonus * (this.combo - 1));
    const coin = Math.round((ZOMBIE.coin + (z.boss ? ZOMBIE.coin * 8 : 0)) * (z.coinMult ?? 1));
    this.coins += coin;
    this.score += Math.round(ZOMBIE.killScore * (z.boss ? 20 : 1) * comboMult);
    this.kills += 1;
    this.waveKills += 1;
    this.explosions.push({ id: uid(), x: z.x, y: z.y, ttl: 0.28, big: z.boss });
    this._emit('kill', { x: z.x, y: z.y, coin, combo: this.combo, boss: z.boss });
    if (z.boss) this._emit('bossDown', { x: z.x, y: z.y, name: z.name });
  }

  _zombies(dt) {
    const slow = this.frozen ? ABILITIES.freeze.slow : 1;
    for (const z of this.zombies) {
      if (z.flash > 0) z.flash -= dt;

      // Berserker boss: fly into a rage at low HP (faster, hits harder).
      const boss = z.bossKey ? BOSSES.find((b) => b.key === z.bossKey) : null;
      if (boss?.enrage && !z.enraged && z.hp <= z.maxHp * boss.enrage.at) {
        z.enraged = true;
        z.speed *= boss.enrage.speed;
        z.dpsMult *= boss.enrage.dps;
        this._emit('enrage', { x: z.x, y: z.y, name: z.name });
      }

      // Summoner boss: conjure pawn minions around itself on a timer.
      if (boss?.summon && !this.frozen && z.x < FIELD.width - 60) {
        z.summonT -= dt;
        if (z.summonT <= 0) {
          z.summonT = boss.summon.every;
          for (let i = 0; i < boss.summon.count; i++) {
            const my = Math.min(STREET.bottom, Math.max(STREET.top, z.y + (this.rng() - 0.5) * 160));
            this._makeZombie({ type: 'pawn' }, Math.min(FIELD.width - 10, z.x + 30 + i * 24), my);
            this.waveTotal += 1;
          }
          this._emit('summon', { x: z.x, y: z.y });
        }
      }

      // Red archers halt at their standoff range; everyone else walks to the wall.
      const stopX = WALL.x + 22 + (z.standoff || 0);
      if (z.x > stopX) {
        z.x -= z.speed * slow * dt;
        z.attacking = false;
      } else {
        z.attacking = true;
        if (z.standoff && !this.frozen) {
          // volley visual on a cadence (damage itself stays continuous below)
          z.shotT -= dt;
          if (z.shotT <= 0) {
            z.shotT = 0.9;
            this.projectiles.push({ id: uid(), x: z.x - 20, y: z.y - 14, tx: WALL.x + 4, ty: z.y, ttl: 0.3, dur: 0.3 });
          }
        }
        // Frozen raiders can't swing (matches the renderer: they hold a frame
        // encased in ice), so Frost fully stalls the siege.
        if (!this.frozen) {
          this.wallHp -= (z.boss ? ZOMBIE.bossWallDps : ZOMBIE.wallDps) * (z.dpsMult ?? 1) * dt;
        }
        // Notify the renderer as the wall's integrity crosses 75/50/25%.
        while (this.wallCracks.length && this.wallHp / this.wallMax < this.wallCracks[0]) {
          this.wallCracks.shift();
          this._emit('wallCrack', { frac: this.wallHp / this.wallMax });
        }
        if (this.wallHp <= 0) {
          this.wallHp = 0;
          this.phase = 'over';
          this._emit('over', {});
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
      awaitingNext: this.awaitingNext,
      nextWaveIn: this.betweenWaves && !this.awaitingNext ? Math.max(0, this.waveTimer) : 0,
      waveKills: this.waveKills,
      waveTotal: this.waveTotal,
      frozen: this.frozen,
      combo: this.comboNow,
      maxCombo: this.maxCombo,
      critChance: this.critChance,
      // The active boss (if any) for the big HUD health bar.
      boss: (() => {
        const b = this.zombies.find((z) => z.boss);
        return b ? { name: b.name, key: b.bossKey, hp: Math.max(0, b.hp), maxHp: b.maxHp, enraged: b.enraged } : null;
      })(),
      abilities: { ...this.abilities },
      upgrades: Object.fromEntries(
        Object.keys(UPGRADES).map((k) => [k, { level: this.upgrades[k], cost: this.upgradeCost(k) }])
      ),
      slots: this.slots.map((s, i) => {
        const c = this.critterInSlot(i);
        return {
          i,
          x: s.x,
          y: s.y,
          level: c ? c.level : 0,
          id: c ? c.id : null,
          atk: c && c.atk > 0 ? c.atk : 0,
        };
      }),
      zombies: this.zombies.map((z) => ({
        id: z.id,
        x: z.x,
        y: z.y,
        hp: z.hp,
        maxHp: z.maxHp,
        boss: z.boss,
        sprite: z.sprite,
        enraged: z.enraged,
        variant: z.variant,
        attacking: z.attacking,
        flash: z.flash > 0,
      })),
      projectiles: this.projectiles.map((p) => ({ id: p.id, x: p.x, y: p.y, tx: p.tx, ty: p.ty, ttl: p.ttl, dur: p.dur || 0.18 })),
      explosions: this.explosions.map((e) => ({ id: e.id, x: e.x, y: e.y, ttl: e.ttl, big: e.big })),
    };
  }
}
