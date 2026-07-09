'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FIELD,
  WALL,
  STREET,
  SLOTS,
  CRITTER_LEVELS,
  RECRUIT_COST,
  ABILITIES,
  UPGRADES,
} from '@/lib/td/config';
import { Engine } from '@/lib/td/engine';
import { sfx } from '@/lib/audio/sfx';

const W = FIELD.width;
const H = FIELD.height;
const BEST_KEY = 'playmcd:best';

// Drives the Engine with a requestAnimationFrame loop, renders each snapshot to a
// <canvas> (a cartoon kingdom wall-defense scene using Tiny Swords sprites), and
// overlays an HTML HUD. Every defender is an Archer; merge rank is shown purely
// through size/tint/aura/crown. All game rules live in the Engine; this is
// presentation + input.
export default function GameCanvas({ onGameOver, leaderboard = [] }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const assetsRef = useRef(null);
  const terrainRef = useRef(null); // grass tile + decoration images
  const dragRef = useRef(null); // { from, level, x, y, over } while dragging an archer
  const overFiredRef = useRef(false);
  const lastHudRef = useRef(0);
  // Transient juice state, mutated at 60fps outside React:
  // floaters (damage numbers / popups), sparks (particles), shake magnitude.
  const fxRef = useRef({ floaters: [], sparks: [], shake: 0 });
  const leaderboardRef = useRef(leaderboard);
  leaderboardRef.current = leaderboard;
  const bannerTimer = useRef(null);

  const [hud, setHud] = useState(null);
  const [sel, setSel] = useState(null); // from-slot while dragging (for the hint)
  const [banner, setBanner] = useState(null); // wave / boss announcement
  const [overInfo, setOverInfo] = useState(null); // { best, isNew, rank }

  // Preload the animated Tiny Swords spritesheets. Each sheet is a horizontal
  // strip of square frames, so frameCount = width / height (computed on load).
  useEffect(() => {
    let alive = true;
    const keys = [
      'archer_idle',
      'archer_attack',
      'red_pawn_run',
      'red_warrior_run',
      'red_archer_run',
      'red_lancer_run',
    ];
    const sheets = {};
    let done = 0;
    const S = (k) => sheets[k];
    const finish = () => {
      if (!alive || done < keys.length) return;
      assetsRef.current = {
        // Every rank uses the same Archer sheets; rank cosmetics are applied at
        // draw time (scale/tint/aura/crown from CRITTER_LEVELS).
        defenders: {
          archer: { idle: S('archer_idle'), attack: S('archer_attack') },
        },
        enemies: {
          red_pawn: S('red_pawn_run'),
          red_warrior: S('red_warrior_run'),
          red_archer: S('red_archer_run'),
          red_lancer: S('red_lancer_run'),
        },
      };
    };
    for (const k of keys) {
      const img = new Image();
      img.onload = () => {
        sheets[k] = { img, size: img.height, frames: Math.max(1, Math.round(img.width / img.height)) };
        done += 1;
        finish();
      };
      img.onerror = () => {
        done += 1;
        finish();
      };
      img.src = `/assets/tiny/${k}.png`;
    }
    return () => {
      alive = false;
    };
  }, []);

  // Load the grass tile + decoration images (Tiny Swords terrain).
  useEffect(() => {
    const names = ['tilemap', 'tree', 'bush1', 'bush2', 'rock1', 'rock2', 'cloud1', 'cloud2', 'arrow', 'hills'];
    const imgs = {};
    let n = 0;
    const done = () => {
      if (++n < names.length) return;
      terrainRef.current = {
        grass: imgs.tilemap || null,
        trees: [imgs.tree].filter(Boolean),
        bushes: [imgs.bush1, imgs.bush2].filter(Boolean),
        rocks: [imgs.rock1, imgs.rock2].filter(Boolean),
        clouds: [imgs.cloud1, imgs.cloud2].filter(Boolean),
        arrow: imgs.arrow || null,
        backdrop: imgs.hills || null,
      };
    };
    for (const nm of names) {
      const img = new Image();
      img.onload = () => {
        imgs[nm] = img;
        done();
      };
      img.onerror = done;
      // the distant backdrop is a committed image under /assets/bg; the rest are
      // fetched Tiny Swords art under /assets/tiny.
      img.src = nm === 'hills' ? '/assets/bg/hills.png' : `/assets/tiny/${nm}.png`;
    }
  }, []);

  const start = useCallback(() => {
    engineRef.current = new Engine();
    dragRef.current = null;
    overFiredRef.current = false;
    fxRef.current = { floaters: [], sparks: [], shake: 0 };
    setSel(null);
    setBanner(null);
    setOverInfo(null);
    setHud(engineRef.current.snapshot());
    // Dev-only hook so the engine can be driven from the console / e2e checks.
    if (process.env.NODE_ENV !== 'production') window.__mcd = engineRef.current;
  }, []);

  // Flash a wave/boss announcement across the battlefield for a couple seconds.
  const pushBanner = useCallback((b) => {
    setBanner({ ...b, key: Date.now() });
    clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 2400);
  }, []);

  // Translate discrete engine events into juice: floaters, sparks, shake, SFX.
  const handleEvents = useCallback(
    (evs) => {
      const fx = fxRef.current;
      const jitter = () => (Math.random() - 0.5) * 18;
      for (const ev of evs) {
        switch (ev.t) {
          case 'hit':
            fx.floaters.push({
              x: ev.x + jitter(),
              y: ev.y - 46,
              vy: -46,
              ttl: ev.crit ? 0.9 : 0.6,
              text: ev.crit ? `CRIT ${ev.dmg}!` : `-${ev.dmg}`,
              color: ev.crit ? '#ffd45e' : '#ffffff',
              size: ev.crit ? 26 : 17,
            });
            sfx.shoot();
            if (ev.crit) sfx.hit(true);
            break;
          case 'kill':
            fx.floaters.push({ x: ev.x, y: ev.y - 14, vy: -34, ttl: 0.8, text: `+${ev.coin}🪙`, color: '#ffe08a', size: 16 });
            if (ev.combo >= 3)
              fx.floaters.push({
                x: ev.x,
                y: ev.y - 72,
                vy: -28,
                ttl: 0.9,
                text: `COMBO ×${ev.combo}`,
                color: '#ff9e3d',
                size: Math.min(34, 18 + ev.combo),
              });
            burst(fx, ev.x, ev.y, ev.boss ? 26 : 10, '#ffb35c');
            sfx.kill(ev.combo);
            if (ev.boss) fx.shake = Math.max(fx.shake, 16);
            break;
          case 'merge':
            burst(fx, ev.x, ev.y - 20, 18, '#ffe566');
            fx.floaters.push({ x: ev.x, y: ev.y - 70, vy: -30, ttl: 1.1, text: `★ ${CRITTER_LEVELS[ev.level].name}!`, color: '#8ce04a', size: 20 });
            sfx.merge();
            break;
          case 'wave':
            pushBanner(
              ev.boss
                ? { title: `☠ ${ev.boss.toUpperCase()} ☠`, sub: `Boss Wave ${ev.wave} — hold the line!`, boss: true }
                : { title: `WAVE ${ev.wave}`, sub: 'The horde approaches…' }
            );
            sfx.wave();
            break;
          case 'boss':
            fx.shake = Math.max(fx.shake, 13);
            sfx.boss();
            break;
          case 'enrage':
            fx.floaters.push({ x: ev.x, y: ev.y - 100, vy: -26, ttl: 1.2, text: 'ENRAGED!', color: '#ff5c5c', size: 30 });
            fx.shake = Math.max(fx.shake, 10);
            sfx.enrage();
            break;
          case 'summon':
            fx.floaters.push({ x: ev.x, y: ev.y - 80, vy: -24, ttl: 0.8, text: '✨ reinforcements', color: '#c78bff', size: 15 });
            sfx.summon();
            break;
          case 'bossDown':
            fx.floaters.push({ x: ev.x, y: ev.y - 60, vy: -30, ttl: 1.4, text: `${ev.name} DEFEATED!`, color: '#ffd45e', size: 26 });
            fx.shake = Math.max(fx.shake, 16);
            break;
          case 'wallCrack':
            fx.shake = Math.max(fx.shake, 11);
            sfx.wallCrack();
            break;
          case 'over':
            fx.shake = Math.max(fx.shake, 18);
            sfx.over();
            break;
        }
      }
    },
    [pushBanner]
  );

  useEffect(() => {
    start();
    const ctx = canvasRef.current.getContext('2d');
    let raf;
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const eng = engineRef.current;
      eng.update(dt);
      handleEvents(eng.takeEvents());

      const fx = fxRef.current;
      // decaying screen shake
      fx.shake = Math.max(0, fx.shake - 42 * dt);
      const sx = (Math.random() - 0.5) * fx.shake;
      const sy = (Math.random() - 0.5) * fx.shake;
      ctx.save();
      if (fx.shake > 0.5) {
        ctx.fillStyle = '#1a1408'; // hide edge gaps while shaking
        ctx.fillRect(0, 0, W, H);
        ctx.translate(sx, sy);
      }
      draw(ctx, eng.snapshot(), { drag: dragRef.current, assets: assetsRef.current, terrain: terrainRef.current, now });
      drawFx(ctx, fx, dt);
      ctx.restore();

      if (now - lastHudRef.current > 66) {
        lastHudRef.current = now;
        setHud(eng.snapshot());
      }
      if (eng.phase === 'over' && !overFiredRef.current) {
        overFiredRef.current = true;
        setHud(eng.snapshot());
        // personal best + live global rank for the game-over screen
        let best = 0;
        try {
          best = Number(localStorage.getItem(BEST_KEY) || 0);
        } catch {}
        const isNew = eng.score > best;
        if (isNew) {
          try {
            localStorage.setItem(BEST_KEY, String(eng.score));
          } catch {}
        }
        const board = leaderboardRef.current;
        const rank = board && board.length ? 1 + board.filter((e) => e.best > eng.score).length : null;
        setOverInfo({ best: Math.max(best, eng.score), isNew, rank });
        onGameOver?.({ score: eng.score, wave: eng.wave });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(bannerTimer.current);
    };
  }, [start, onGameOver, handleEvents]);

  const canvasPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const slotAt = (x, y) => {
    const slots = engineRef.current.slots;
    for (let i = 0; i < slots.length; i++) {
      const dx = x - slots[i].x;
      const dy = y - slots[i].y;
      if (dx * dx + dy * dy <= (SLOTS.radius + 10) ** 2) return i;
    }
    return -1;
  };

  // Drag an archer to move it to an empty slot, merge onto a same-rank archer, or
  // swap with a different-rank one (see Engine.moveCritter).
  const onPointerDown = (e) => {
    const eng = engineRef.current;
    if (eng.phase === 'over') return;
    const { x, y } = canvasPos(e);
    const i = slotAt(x, y);
    const c = i >= 0 ? eng.critterInSlot(i) : null;
    if (!c) return;
    dragRef.current = { from: i, level: c.level, x, y, over: i };
    setSel(i);
    canvasRef.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = canvasPos(e);
    d.x = x;
    d.y = y;
    d.over = slotAt(x, y);
  };

  const endDrag = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    setSel(null);
    if (!d) return;
    const { x, y } = canvasPos(e);
    const to = slotAt(x, y);
    if (to >= 0 && to !== d.from) {
      engineRef.current.moveCritter(d.from, to);
      setHud(engineRef.current.snapshot());
    }
  };

  // Run a player action; on success play its sound, then refresh the HUD.
  const act = (fn, sound) => () => {
    const ok = fn();
    if (ok && sound) sound();
    setHud(engineRef.current.snapshot());
  };

  const canRecruit = hud && hud.coins >= RECRUIT_COST && hud.phase !== 'over';
  const canRepair = hud && hud.coins >= WALL.upgradeCost && hud.wallHp < hud.wallMax && hud.phase !== 'over';

  const buyAbility = (key) => act(() => engineRef.current.buyAbility(key), sfx.buy)();
  const buyUpgrade = (key) => act(() => engineRef.current.buyUpgrade(key), sfx.buy)();
  const continueWave = act(() => engineRef.current.continueToNextWave());
  const useBomb = act(() => {
    const ok = engineRef.current.useBomb();
    if (ok) fxRef.current.shake = Math.max(fxRef.current.shake, 13);
    return ok;
  }, sfx.boom);
  const useFreeze = act(() => engineRef.current.useFreeze(), sfx.freeze);
  const over = hud?.phase === 'over';

  return (
    <div className="game">
      <div className="game-stage" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="board"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />

        {/* top HUD */}
        <div className="hud-top">
          <div className="hud-left">
            <div className="pill coins">🪙 {hud?.coins ?? 0}</div>
            <div className="pill score">⭐ {(hud?.score ?? 0).toLocaleString()}</div>
            {(hud?.combo ?? 0) >= 2 && <div className="pill combo">🔥 ×{hud.combo}</div>}
          </div>
          <div className="pill timer">⏱ {mmss(hud?.time ?? 0)}</div>
          <div className="hud-right">
            <div className="pill skull">💀 {hud?.waveKills ?? 0}/{hud?.waveTotal ?? 0}</div>
            <div className="pill gear" title="Wave">☰ W{hud?.wave ?? 0}</div>
          </div>
        </div>

        {/* boss health bar */}
        {hud?.boss && !over && (
          <div className={`boss-bar${hud.boss.enraged ? ' enraged' : ''}`}>
            <span className="boss-name">
              {hud.boss.enraged ? '😡' : '💀'} {hud.boss.name}
            </span>
            <div className="boss-hp">
              <div style={{ width: `${Math.max(0, (hud.boss.hp / hud.boss.maxHp) * 100)}%` }} />
            </div>
          </div>
        )}

        {/* wave / boss announcement banner */}
        {banner && (
          <div key={banner.key} className={`wave-banner${banner.boss ? ' boss' : ''}`}>
            <div className="wb-title">{banner.title}</div>
            {banner.sub && <div className="wb-sub">{banner.sub}</div>}
          </div>
        )}

        {hud?.betweenWaves && !hud.awaitingNext && !over && (
          <div className="stage-note">Wave {hud.wave + 1} in {Math.ceil(hud.nextWaveIn)}s</div>
        )}

        {hud?.awaitingNext && !over && (
          <div className="stage-note cleared">🎉 Wave {hud.wave} cleared — spend gold below ⬇</div>
        )}

        {over && (
          <div className="overlay">
            <h2>👑 The Kingdom Has Fallen!</h2>
            <div className="go-stats">
              <div className="go-row">
                <span>Waves survived</span>
                <strong>{hud.wave}</strong>
              </div>
              <div className="go-row">
                <span>Raiders slain</span>
                <strong>{hud.kills}</strong>
              </div>
              <div className="go-row">
                <span>Best combo</span>
                <strong>×{hud.maxCombo}</strong>
              </div>
              <div className="go-row total">
                <span>Score</span>
                <strong>{hud.score.toLocaleString()}</strong>
              </div>
            </div>
            {overInfo?.isNew ? (
              <div className="new-best">⭐ NEW PERSONAL BEST!</div>
            ) : (
              overInfo && <p className="muted small">Personal best: {overInfo.best.toLocaleString()}</p>
            )}
            {overInfo?.rank && (
              <p className="go-rank">
                Global rank <strong>#{overInfo.rank}</strong>
              </p>
            )}
            <p className="muted small">Score submitted to the live leaderboard.</p>
            <button onClick={start}>⚔️ Defend Again</button>
          </div>
        )}
      </div>

      {/* command bar: moment-to-moment controls, kept below the battlefield so
          the rampart slots (and the archers on them) are never obscured. */}
      <div className="cmd-bar">
        <button className="recruit" onClick={act(() => engineRef.current.recruit(), sfx.buy)} disabled={!canRecruit}>
          <span className="ra-icon">🏹</span>
          <span className="ra-text">
            Recruit
            <small>🪙 {RECRUIT_COST}</small>
          </span>
        </button>
        <button className="wall-btn" onClick={act(() => engineRef.current.repairWall(), sfx.buy)} disabled={!canRepair}>
          <span className="ra-icon">🛡️</span>
          <span className="ra-text">
            Repair Wall
            <small>🪙 {WALL.upgradeCost}</small>
          </span>
        </button>
        <div className="cmd-spacer" />
        <AbilityCard akey="bomb" charges={hud?.abilities?.bomb ?? 0} onClick={useBomb} disabled={over} />
        <AbilityCard
          akey="freeze"
          charges={hud?.abilities?.freeze ?? 0}
          active={hud?.frozen}
          onClick={useFreeze}
          disabled={over}
        />
      </div>

      {!over && <ShopPanel hud={hud} onBuyAbility={buyAbility} onBuyUpgrade={buyUpgrade} onContinue={continueWave} />}

      <p className="muted small hint">
        {sel !== null
          ? `Dragging a Lv${hud?.slots?.find((s) => s.i === sel)?.level} archer — drop on an empty slot to move, or on a same-rank archer to promote.`
          : 'Recruit archers, then drag one onto another of the same rank to merge & promote — or onto an empty slot to reposition.'}
      </p>
    </div>
  );
}

// Intermission shop shown below the battlefield. Restocking consumables, buying
// permanent upgrades, and the Continue button are only enabled between waves
// (hud.awaitingNext); during combat it sits locked as a dimmed preview.
function ShopPanel({ hud, onBuyAbility, onBuyUpgrade, onContinue }) {
  const open = !!hud?.awaitingNext;
  const coins = hud?.coins ?? 0;
  const wave = hud?.wave ?? 0;
  return (
    <div className={`shop${open ? ' open' : ''}`}>
      <div className="shop-head">
        <span className="shop-title">{open ? `⚔️ Wave ${wave} cleared!` : '🛡️ Merchant’s Rest'}</span>
        <div className="shop-head-right">
          {open ? (
            <span className="shop-treasury">🪙 {coins}</span>
          ) : (
            <span className="shop-locked">Spend gold between waves</span>
          )}
          {/* Continue lives up here, next to the treasury, so it's visible the
              moment the shop opens — no scrolling past the upgrade list. */}
          <button className="shop-continue" onClick={onContinue} disabled={!open}>
            ▶ Wave {wave + 1}
          </button>
        </div>
      </div>

      <p className="shop-label">Consumables · restock</p>
      <div className="shop-items">
        {['bomb', 'freeze'].map((key) => {
          const a = ABILITIES[key];
          const owned = hud?.abilities?.[key] ?? 0;
          const maxed = owned >= a.max;
          return (
            <div className="shop-item" key={key}>
              <span className="shop-ico">{a.icon}</span>
              <span className="shop-info">
                <span className="shop-name">{a.label}</span>
                <span className="shop-desc">{a.desc}</span>
                <span className="shop-owned">
                  Stock {owned}/{a.max}
                </span>
              </span>
              <button className="shop-buy" onClick={() => onBuyAbility(key)} disabled={!open || maxed || coins < a.price}>
                {maxed ? 'Max' : `🪙 ${a.price}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="shop-label">Permanent upgrades</p>
      <div className="shop-items shop-upgrades">
        {Object.keys(UPGRADES).map((key) => {
          const u = UPGRADES[key];
          const info = hud?.upgrades?.[key] ?? { level: 0, cost: u.baseCost };
          const maxed = info.level >= u.max;
          return (
            <div className="shop-item" key={key}>
              <span className="shop-ico upg">{u.icon}</span>
              <span className="shop-info">
                <span className="shop-name">{u.label}</span>
                <span className="shop-desc">{u.desc}</span>
                <LevelPips level={info.level} max={u.max} />
              </span>
              <button className="shop-buy" onClick={() => onBuyUpgrade(key)} disabled={!open || maxed || coins < info.cost}>
                {maxed ? 'Max' : `🪙 ${info.cost}`}
              </button>
            </div>
          );
        })}
      </div>

    </div>
  );
}

// Compact level indicator: `max` little pips, `level` of them lit.
function LevelPips({ level, max }) {
  return (
    <span className="lvl-pips" title={`Level ${level} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`pip${i < level ? ' on' : ''}`} />
      ))}
    </span>
  );
}

function AbilityCard({ akey, charges, onClick, disabled, active }) {
  const ability = ABILITIES[akey];
  return (
    <button
      className={`card${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled || charges <= 0}
      title={ability.label}
    >
      <span className="card-icon">{ability.icon}</span>
      <span className="card-count">×{charges}</span>
    </button>
  );
}

function mmss(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- transient FX (floaters + particle sparks + shake) ----------

// Spray `n` square sparks outward from (x, y).
function burst(fx, x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.7;
    const sp = 60 + Math.random() * 120;
    fx.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, ttl: 0.4 + Math.random() * 0.35, color });
  }
}

// Advance + render floaters (rising damage numbers/labels) and sparks.
function drawFx(ctx, fx, dt) {
  for (const p of fx.sparks) {
    p.ttl -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 190 * dt; // gravity
  }
  fx.sparks = fx.sparks.filter((p) => p.ttl > 0);
  for (const p of fx.sparks) {
    ctx.globalAlpha = Math.min(1, p.ttl * 2.4);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }

  for (const f of fx.floaters) {
    f.ttl -= dt;
    f.y += f.vy * dt;
  }
  fx.floaters = fx.floaters.filter((f) => f.ttl > 0);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.min(1, f.ttl / 0.35);
    ctx.font = `800 ${f.size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(20,10,0,0.75)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

// ---------- canvas rendering ----------

// Reusable offscreen buffer for tinting a single sprite frame. Tinting on the
// main canvas is impossible with source-atop (it would recolour the whole
// scene), so we composite the frame here first, then blit it out.
let tintBuf = null;
function getTintBuf(size) {
  if (typeof document === 'undefined') return null;
  if (!tintBuf) tintBuf = document.createElement('canvas');
  if (tintBuf.width < size) {
    tintBuf.width = size;
    tintBuf.height = size;
  }
  return tintBuf;
}

// Draws one frame of an animated sheet, centered at (cx, cy). Frames are square
// (size × size) laid out horizontally. `flip` mirrors horizontally (enemies face
// left). idx is wrapped/floored so callers can pass a running value. `tint`
// (optional) washes the sprite pixels with a colour to signal higher ranks.
function drawFrame(ctx, sheet, idx, cx, cy, displayH, flip, tint) {
  if (!sheet || !sheet.img.width) return false;
  const s = sheet.size;
  const scale = displayH / s;
  const dw = s * scale;
  const i = ((Math.floor(idx) % sheet.frames) + sheet.frames) % sheet.frames;

  if (tint) {
    const size = Math.ceil(dw);
    const buf = getTintBuf(size);
    if (buf) {
      const bx = buf.getContext('2d');
      bx.imageSmoothingEnabled = false;
      bx.clearRect(0, 0, size, size);
      bx.globalCompositeOperation = 'source-over';
      bx.globalAlpha = 1;
      bx.drawImage(sheet.img, i * s, 0, s, s, 0, 0, dw, dw);
      bx.globalCompositeOperation = 'source-atop'; // only paint over sprite pixels
      bx.globalAlpha = 0.4;
      bx.fillStyle = tint;
      bx.fillRect(0, 0, dw, dw);
      bx.globalAlpha = 1;
      bx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(cx, cy);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(buf, 0, 0, dw, dw, -dw / 2, -dw / 2, dw, dw);
      ctx.restore();
      return true;
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet.img, i * s, 0, s, s, -dw / 2, -dw / 2, dw, dw);
  ctx.restore();
  return true;
}

// A small pixel-ish crown drawn above the legendary rank.
function drawCrown(ctx, cx, cy, w) {
  const h = w * 0.62;
  ctx.save();
  ctx.fillStyle = '#ffd45e';
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy - h / 2);
  ctx.lineTo(cx - w / 4, cy);
  ctx.lineTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 4, cy);
  ctx.lineTo(cx + w / 2, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy + h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e5484d';
  circle(ctx, cx, cy + h / 6, w * 0.1);
  ctx.restore();
}

function shadow(ctx, x, y, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
}

// A proper blast: fireball core + shockwave ring + flying debris (+ smoke if big).
function drawExplosion(ctx, x, y, prog, big) {
  const maxR = big ? 92 : 40;
  const alpha = 1 - prog;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // shockwave ring
  ctx.strokeStyle = `rgba(255,222,150,${alpha * 0.8})`;
  ctx.lineWidth = big ? 6 : 3;
  circle(ctx, x, y, maxR * prog, true);
  // fireball core
  const coreR = Math.max(4, maxR * (0.18 + 0.5 * (1 - prog)));
  const g = ctx.createRadialGradient(x, y, 2, x, y, coreR);
  g.addColorStop(0, `rgba(255,255,220,${alpha})`);
  g.addColorStop(0.4, `rgba(255,168,60,${alpha * 0.9})`);
  g.addColorStop(1, 'rgba(200,60,20,0)');
  ctx.fillStyle = g;
  circle(ctx, x, y, coreR);
  // flying debris / sparks
  const n = big ? 12 : 7;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (big ? 0.3 : 1.1);
    const d = maxR * prog * (0.7 + 0.3 * (((i * 7) % 5) / 5));
    const px = x + Math.cos(ang) * d;
    const py = y + Math.sin(ang) * d;
    ctx.fillStyle = `rgba(255,${180 - i * 8},80,${alpha})`;
    const sz = big ? 4 : 2;
    ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  ctx.restore();
  if (big) {
    ctx.save();
    ctx.fillStyle = `rgba(90,80,70,${alpha * 0.32})`;
    circle(ctx, x, y - maxR * prog * 0.3, maxR * 0.5 * prog);
    ctx.restore();
  }
}

// Encase a frozen enemy in ice: a translucent glaze block + a few ice shards.
function drawFrost(ctx, x, y, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(170,224,255,0.28)';
  roundRect(ctx, x - h * 0.22, y - h * 0.5, h * 0.44, h * 0.66, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(224,244,255,0.9)';
  const shards = [
    [-0.16, -0.42, 6],
    [0.15, -0.3, 7],
    [-0.05, 0.18, 6],
    [0.18, 0.02, 5],
  ];
  for (const [dx, dy, s] of shards) {
    const sx = x + dx * h;
    const sy = y + dy * h;
    ctx.beginPath();
    ctx.moveTo(sx, sy - s);
    ctx.lineTo(sx + s * 0.5, sy + s);
    ctx.lineTo(sx - s * 0.5, sy + s);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Whole-screen frost while Freeze is active: cold wash + icy vignette + snow.
function drawFrostOverlay(ctx, now) {
  ctx.save();
  ctx.fillStyle = 'rgba(140,205,255,0.16)';
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(200,235,255,0)');
  g.addColorStop(1, 'rgba(200,235,255,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 42; i++) {
    const x = (i * 97 + now * 0.03 * (1 + (i % 3))) % W;
    const y = (i * 53 + now * 0.06 * (1 + (i % 2))) % H;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

// A small star-burst spark where a raider strikes the wall.
function drawHitSpark(ctx, x, y, now) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const r = 7;
  ctx.strokeStyle = 'rgba(255,214,120,0.95)';
  ctx.lineWidth = 2;
  for (let a = 0; a < 4; a++) {
    const ang = (a * Math.PI) / 4 + now / 90;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(ang) * r, y - Math.sin(ang) * r);
    ctx.lineTo(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(x, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function circle(ctx, x, y, r, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (stroke) ctx.stroke();
  else ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// Faded distant backdrop: a horizontal slice of the pixel castle-on-hills scene,
// cover-fit into the sky band and washed with atmosphere so it reads as far away.
function drawBackdrop(ctx, img, horizon) {
  const bandH = horizon + 26;
  const rr = W / bandH;
  const ir = img.width / img.height;
  let sw;
  let sh;
  let sx;
  let sy;
  if (ir > rr) {
    sh = img.height;
    sw = sh * rr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / rr;
    sx = 0;
    sy = (img.height - sh) * 0.24; // upper-middle, where the castle sits
  }
  ctx.save();
  ctx.globalAlpha = 0.62;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, bandH);
  ctx.restore();
  // atmospheric wash — recede into the distance, keep gameplay readable
  const fade = ctx.createLinearGradient(0, 0, 0, bandH);
  fade.addColorStop(0, 'rgba(201,225,240,0.30)');
  fade.addColorStop(1, 'rgba(206,228,238,0.64)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, bandH);
}

// Soft rounded hill filled with a vertical gradient (smooth, not blocky).
function softHill(ctx, cx, baseY, halfW, height, top, bottom) {
  const g = ctx.createLinearGradient(0, baseY - height, 0, baseY);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY);
  ctx.quadraticCurveTo(cx, baseY - height * 2, cx + halfW, baseY);
  ctx.closePath();
  ctx.fill();
}

function puff(ctx, x, y, u) {
  ctx.beginPath();
  ctx.arc(x, y, 13 * u, 0, Math.PI * 2);
  ctx.arc(x + 16 * u, y + 4 * u, 17 * u, 0, Math.PI * 2);
  ctx.arc(x + 36 * u, y + 2 * u, 13 * u, 0, Math.PI * 2);
  ctx.arc(x + 22 * u, y - 6 * u, 12 * u, 0, Math.PI * 2);
  ctx.fill();
}

// Soft puffy clouds with a warm underside, drifting across the sky band.
function drawSoftClouds(ctx, now, horizon) {
  const t = now / 1000;
  const clouds = [
    { x: 150, y: 30, s: 1 },
    { x: 500, y: 22, s: 1.35 },
    { x: 820, y: 46, s: 0.9 },
  ];
  for (const c of clouds) {
    if (c.y > horizon) continue;
    let x = (c.x - t * 7) % (W + 220);
    if (x < -220) x += W + 220;
    const u = c.s;
    ctx.fillStyle = 'rgba(255,246,230,0.5)'; // warm underside
    puff(ctx, x, c.y + 4 * u, u * 0.92);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    puff(ctx, x, c.y, u);
  }
}

// tiny seeded PRNG so the meadow decoration is stable frame-to-frame
function mulberry(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grass tufts + little wildflowers sprinkled across the field.
function drawMeadow(ctx, horizon) {
  const rnd = mulberry(1337);
  const cols = ['#ff6b8a', '#ffd447', '#ff9d3c', '#c78bff', '#ffffff'];
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = horizon + 14 + rnd() * (H - horizon - 20);
    const depth = (y - horizon) / (H - horizon);
    ctx.strokeStyle = `rgba(40,${(110 + depth * 40) | 0},44,0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 2, y - 4 - depth * 3);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2, y - 4 - depth * 3);
    ctx.stroke();
    if (rnd() < 0.25) {
      ctx.fillStyle = cols[(rnd() * cols.length) | 0];
      ctx.fillRect(x - 1, y - 6 - depth * 3, 3, 3);
    }
  }
}

// Tile the seamless interior grass tile (cell 1,1 of the Tiny Swords tilemap)
// across the play area for a real pixel-art ground.
function tileGrass(ctx, tilemap, y0, y1) {
  const T = 64;
  const sx = 64;
  const sy = 64; // interior grass cell
  for (let y = Math.floor(y0); y < y1; y += T) {
    const dh = Math.min(T, y1 - y);
    for (let x = 0; x < W; x += T) {
      const dw = Math.min(T, W - x);
      ctx.drawImage(tilemap, sx, sy, dw, dh, x, y, dw, dh);
    }
  }
}

// The castle rampart: a warm flagstone floor (matching the wall) that the
// archers stand on, so they read as being ON the castle rather than in a field.
function drawRampart(ctx, x0, x1, y0, y1) {
  const w = x1 - x0;
  ctx.fillStyle = '#6e4a2a'; // mortar base
  ctx.fillRect(x0, y0, w, y1 - y0);
  const TW = 46;
  const TH = 30;
  let row = 0;
  for (let y = y0; y < y1; y += TH) {
    const off = row % 2 ? TW / 2 : 0;
    for (let x = x0 - TW + off; x < x1; x += TW) {
      const bx = Math.max(x + 2, x0);
      const ex = Math.min(x + TW - 2, x1);
      const by = y + 2;
      const ey = Math.min(y + TH - 2, y1);
      if (ex - bx < 4 || ey - by < 3) continue;
      ctx.fillStyle = '#bd9260';
      ctx.fillRect(bx, by, ex - bx, ey - by);
      ctx.fillStyle = '#d3ac7a'; // top highlight
      ctx.fillRect(bx, by, ex - bx, 2);
      ctx.fillStyle = '#9c7444'; // bottom shadow
      ctx.fillRect(bx, ey - 2, ex - bx, 2);
    }
    row++;
  }
  // warm light falling across the rampart
  const lg = ctx.createLinearGradient(0, y0, 0, y1);
  lg.addColorStop(0, 'rgba(255,240,210,0.12)');
  lg.addColorStop(1, 'rgba(40,24,10,0.20)');
  ctx.fillStyle = lg;
  ctx.fillRect(x0, y0, w, y1 - y0);
}

// Draw one frame of a decoration strip, anchored bottom-center. `frames` is the
// number of (equal-width) frames in the strip — frames are NOT assumed square
// (e.g. the tree strip is 8 frames of 192×256), and the frame's aspect ratio is
// preserved so nothing gets clipped or squashed.
function drawDeco(ctx, img, frames, f, cx, baseY, dispH) {
  const fw = img.width / frames;
  const fh = img.height;
  const idx = ((f % frames) + frames) % frames;
  const dw = dispH * (fw / fh);
  ctx.drawImage(img, idx * fw, 0, fw, fh, cx - dw / 2, baseY - dispH, dw, dispH);
}

// Trees, bushes and rocks scattered around the field (behind the units).
function drawDecorations(ctx, terrain) {
  const trees = terrain.trees;
  if (trees.length) {
    const t = trees[0];
    drawDeco(ctx, t, 8, 0, 470, STREET.top + 78, 150);
    drawDeco(ctx, t, 8, 3, 690, STREET.top + 60, 126);
    drawDeco(ctx, t, 8, 5, 905, STREET.top + 100, 170);
    drawDeco(ctx, t, 8, 2, 610, STREET.bottom + 4, 150);
  }
  const bushes = terrain.bushes;
  if (bushes.length) {
    drawDeco(ctx, bushes[0], 8, 1, 330, STREET.top + 44, 58);
    drawDeco(ctx, bushes[bushes.length - 1], 8, 4, 860, STREET.bottom - 4, 64);
    drawDeco(ctx, bushes[0], 8, 6, 540, STREET.bottom + 8, 52);
  }
  const rocks = terrain.rocks;
  if (rocks.length) {
    drawDeco(ctx, rocks[0], 1, 0, 420, STREET.bottom - 2, 40);
    drawDeco(ctx, rocks[rocks.length - 1], 1, 0, 790, STREET.top + 150, 32);
  }
}

// Soft Tiny Swords cloud sprites drifting across the sky.
function drawCloudSprites(ctx, clouds, now) {
  const t = now / 1000;
  const items = [
    { i: 0, x: 120, y: 8, s: 0.42 },
    { i: 1, x: 520, y: 2, s: 0.5 },
    { i: 0, x: 820, y: 22, s: 0.36 },
  ];
  for (const it of items) {
    const img = clouds[it.i % clouds.length];
    if (!img) continue;
    const w = img.width * it.s;
    const h = img.height * it.s;
    let x = (it.x - t * 8) % (W + w + 60);
    if (x < -w - 60) x += W + w + 60;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, x, it.y, w, h);
    ctx.globalAlpha = 1;
  }
}

// The brown/tan stone kingdom wall, drawn as pixel stone blocks: a battlemented
// rampart with a hanging royal banner and a terracotta-roofed gatehouse tower
// flying a waving pennant at the top of the column.
function drawKingdomWall(ctx, now) {
  const w = WALL.width;
  const wx = WALL.x - w;
  const top = STREET.top - 22;
  const bot = STREET.bottom + 22;

  // mortar base
  ctx.fillStyle = '#5c4326';
  ctx.fillRect(wx, top, w, bot - top);

  // pixel stone blocks (staggered courses with highlight + shadow edges)
  const bh = 15;
  const bw = 23;
  let row = 0;
  for (let y = top; y < bot; y += bh) {
    const off = row % 2 ? bw / 2 : 0;
    for (let sx = wx - bw + off; sx < wx + w; sx += bw) {
      const bx = Math.max(sx + 1, wx + 1);
      const ex = Math.min(sx + bw - 1, wx + w - 1);
      const bwid = ex - bx;
      if (bwid < 3) continue;
      const bhh = Math.min(y + bh - 1, bot) - (y + 1);
      ctx.fillStyle = '#c39a68';
      ctx.fillRect(bx, y + 1, bwid, bhh);
      ctx.fillStyle = '#dcbb8a'; // top highlight
      ctx.fillRect(bx, y + 1, bwid, 2);
      ctx.fillStyle = '#9c7444'; // bottom shadow
      ctx.fillRect(bx, y + bh - 3, bwid, 2);
    }
    row++;
  }
  // field-facing edge in shadow (adds a bit of depth)
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.fillRect(wx + w - 6, top, 6, bot - top);

  // crenellations along the top
  for (let x = wx - 1; x <= wx + w - 10; x += 15) {
    ctx.fillStyle = '#c39a68';
    ctx.fillRect(x, top - 13, 10, 15);
    ctx.fillStyle = '#dcbb8a';
    ctx.fillRect(x, top - 13, 10, 2);
  }

  // hanging royal banner on the wall face
  const bnx = wx + w / 2 - 11;
  const bny = top + 44;
  ctx.fillStyle = '#3b6fd4';
  ctx.beginPath();
  ctx.moveTo(bnx, bny);
  ctx.lineTo(bnx + 22, bny);
  ctx.lineTo(bnx + 22, bny + 52);
  ctx.lineTo(bnx + 11, bny + 44);
  ctx.lineTo(bnx, bny + 52);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(bnx, bny, 4, 52);
  ctx.fillStyle = '#ffd45e';
  circle(ctx, bnx + 11, bny + 20, 6);

  // ---- gatehouse tower at the top of the column ----
  const tw = w + 16;
  const tx = WALL.x - w / 2 - tw / 2;
  const tTop = top - 13;
  const tBodyH = 28;
  // brick body
  ctx.fillStyle = '#5c4326';
  ctx.fillRect(tx, tTop - tBodyH, tw, tBodyH);
  for (let y = tTop - tBodyH; y < tTop; y += bh) {
    for (let sx = tx; sx < tx + tw; sx += bw) {
      const bx = Math.max(sx + 1, tx + 1);
      const ex = Math.min(sx + bw - 1, tx + tw - 1);
      if (ex - bx < 3) continue;
      ctx.fillStyle = '#c39a68';
      ctx.fillRect(bx, y + 1, ex - bx, Math.min(y + bh - 1, tTop) - (y + 1));
      ctx.fillStyle = '#dcbb8a';
      ctx.fillRect(bx, y + 1, ex - bx, 2);
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; // inner shadow
  ctx.fillRect(tx + tw - 5, tTop - tBodyH, 5, tBodyH);
  // arrow-slit window
  ctx.fillStyle = '#33281a';
  ctx.fillRect(tx + tw / 2 - 3, tTop - tBodyH + 10, 6, 13);
  ctx.fillStyle = '#8fd0ff';
  ctx.fillRect(tx + tw / 2 - 2, tTop - tBodyH + 11, 4, 5);
  // corbel cornice at the top of the body (clean stone lip, slight overhang)
  const corbY = tTop - tBodyH - 6;
  ctx.fillStyle = '#b58a5a';
  ctx.fillRect(tx - 3, corbY, tw + 6, 6);
  ctx.fillStyle = '#dcbb8a';
  ctx.fillRect(tx - 3, corbY, tw + 6, 2);
  ctx.fillStyle = '#8a6238';
  ctx.fillRect(tx - 3, corbY + 5, tw + 6, 1);
  // little support blocks (machicolations) under the cornice
  ctx.fillStyle = '#9c7444';
  for (let x = tx; x < tx + tw; x += 8) ctx.fillRect(x, corbY + 6, 4, 3);

  // ---- spire roof: shingled courses, two-tone shading ----
  const rBaseY = corbY - 1;
  const rx0 = tx - 6;
  const rx1 = tx + tw + 6;
  const cxr = (rx0 + rx1) / 2;
  const halfW = (rx1 - rx0) / 2;
  const roofH = 28;
  const apex = rBaseY - roofH;
  const bands = 8;
  for (let i = 0; i < bands; i++) {
    const yTop = apex + (roofH * i) / bands;
    const yBot = apex + (roofH * (i + 1)) / bands;
    const hTop = (halfW * i) / bands;
    const hBot = (halfW * (i + 1)) / bands;
    ctx.fillStyle = i % 2 ? '#b5503a' : '#a5462f';
    ctx.beginPath();
    ctx.moveTo(cxr - hTop, yTop);
    ctx.lineTo(cxr + hTop, yTop);
    ctx.lineTo(cxr + hBot, yBot);
    ctx.lineTo(cxr - hBot, yBot);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(84,28,18,0.45)'; // shingle edge shadow
    ctx.fillRect(cxr - hBot, yBot - 1.5, hBot * 2, 1.5);
  }
  // shade the right face
  ctx.fillStyle = 'rgba(60,20,14,0.20)';
  ctx.beginPath();
  ctx.moveTo(cxr, apex);
  ctx.lineTo(rx1, rBaseY);
  ctx.lineTo(cxr, rBaseY);
  ctx.closePath();
  ctx.fill();
  // ridge highlight on the left
  ctx.fillStyle = 'rgba(255,226,190,0.22)';
  ctx.beginPath();
  ctx.moveTo(cxr, apex);
  ctx.lineTo(cxr - 3, apex + 7);
  ctx.lineTo(rx0 + 9, rBaseY);
  ctx.lineTo(rx0 + 4, rBaseY);
  ctx.closePath();
  ctx.fill();
  // eave overhang lip
  ctx.fillStyle = '#7a3326';
  ctx.fillRect(rx0 - 2, rBaseY - 2, halfW * 2 + 4, 4);
  ctx.fillStyle = '#5f2620';
  ctx.fillRect(rx0 - 2, rBaseY + 2, halfW * 2 + 4, 2);

  // gold finial + waving pennant
  ctx.fillStyle = '#b8860b';
  circle(ctx, cxr, apex, 3.5);
  ctx.fillStyle = '#ffd45e';
  circle(ctx, cxr, apex - 0.5, 2.4);
  const poleTop = apex - 13;
  ctx.strokeStyle = '#5a4326';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cxr, apex);
  ctx.lineTo(cxr, poleTop);
  ctx.stroke();
  const wave = Math.sin(now / 220) * 3;
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  ctx.moveTo(cxr, poleTop);
  ctx.lineTo(cxr + 16, poleTop + 4 + wave);
  ctx.lineTo(cxr, poleTop + 9);
  ctx.closePath();
  ctx.fill();
}

function draw(ctx, s, { drag, assets, terrain, now }) {
  ctx.imageSmoothingEnabled = false; // crisp pixel-art scaling
  const sel = drag ? drag.from : -1; // slot being dragged (lifted)
  const dragOver = drag ? drag.over : -1; // slot under the cursor
  const horizon = STREET.top;
  // ---- background: sunny pixel field (real Tiny Swords grass + decorations) ----
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
  sky.addColorStop(0, '#8fc3ee');
  sky.addColorStop(0.55, '#c7e3ef');
  sky.addColorStop(1, '#eef6f0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 30);
  // soft sun glow near the horizon
  const sun = ctx.createRadialGradient(W * 0.72, horizon - 6, 6, W * 0.72, horizon - 6, 160);
  sun.addColorStop(0, 'rgba(255,247,220,0.85)');
  sun.addColorStop(1, 'rgba(255,247,220,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(W * 0.4, 0, W * 0.6, horizon + 20);
  // distant backdrop (faded pixel castle-on-hills), fallback to soft hills
  if (terrain && terrain.backdrop && terrain.backdrop.width) {
    drawBackdrop(ctx, terrain.backdrop, horizon);
  } else {
    softHill(ctx, 210, horizon + 8, 360, 70, '#a9b6d8', '#8f9ec6');
    softHill(ctx, 760, horizon + 8, 400, 84, '#9fb0d2', '#8394bf');
    softHill(ctx, 470, horizon + 12, 340, 58, '#88b07e', '#6f9a68');
  }
  // drifting clouds in front of the distance
  if (terrain && terrain.clouds.length) drawCloudSprites(ctx, terrain.clouds, now);
  else drawSoftClouds(ctx, now, horizon);
  // ---- battlefield GRASS on the RIGHT of the wall (enemies attack from here) ----
  const fieldX = WALL.x; // grass begins at the wall's outer face
  ctx.save();
  ctx.beginPath();
  ctx.rect(fieldX, horizon, W - fieldX, H - horizon);
  ctx.clip();
  if (terrain && terrain.grass && terrain.grass.width) {
    tileGrass(ctx, terrain.grass, horizon, H);
  } else {
    const grass = ctx.createLinearGradient(0, horizon, 0, H);
    grass.addColorStop(0, '#8fd066');
    grass.addColorStop(1, '#4e9a37');
    ctx.fillStyle = grass;
    ctx.fillRect(fieldX, horizon, W - fieldX, H - horizon);
  }
  const gd = ctx.createLinearGradient(0, horizon, 0, H);
  gd.addColorStop(0, 'rgba(255,255,240,0.10)');
  gd.addColorStop(0.5, 'rgba(0,0,0,0)');
  gd.addColorStop(1, 'rgba(20,52,20,0.22)');
  ctx.fillStyle = gd;
  ctx.fillRect(fieldX, horizon, W - fieldX, H - horizon);
  drawMeadow(ctx, horizon);
  ctx.restore();
  // decorations: clip only horizontally (to the field) so tall tree tops can
  // rise above the horizon into the sky without being cut off.
  ctx.save();
  ctx.beginPath();
  ctx.rect(fieldX, 0, W - fieldX, H);
  ctx.clip();
  if (terrain) drawDecorations(ctx, terrain);
  ctx.restore();

  // ---- CASTLE RAMPART (stone floor) on the LEFT where the archers stand ----
  drawRampart(ctx, 0, WALL.x, horizon, H);
  // shadow cast onto the lower field by the raised rampart/wall
  const wallShadow = ctx.createLinearGradient(WALL.x, 0, WALL.x + 30, 0);
  wallShadow.addColorStop(0, 'rgba(0,0,0,0.32)');
  wallShadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wallShadow;
  ctx.fillRect(WALL.x, horizon, 30, H - horizon);

  // ---- deployment spots on the rampart (drop targets) ----
  for (const slot of s.slots) {
    const isTarget = dragOver === slot.i && sel !== slot.i;
    if (isTarget) {
      ctx.fillStyle = 'rgba(120,224,90,0.25)';
      circle(ctx, slot.x, slot.y, SLOTS.radius + 4);
    }
    // recessed stone spot
    ctx.fillStyle = 'rgba(60,40,20,0.16)';
    circle(ctx, slot.x, slot.y, SLOTS.radius - 2);
    ctx.strokeStyle = slot.level ? 'rgba(50,32,16,0.35)' : 'rgba(50,32,16,0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    circle(ctx, slot.x, slot.y, SLOTS.radius, true);
    ctx.setLineDash([]);
    if (isTarget) {
      ctx.strokeStyle = '#8ce04a';
      ctx.lineWidth = 4;
      circle(ctx, slot.x, slot.y, SLOTS.radius + 3, true);
    }
  }

  // ---- kingdom wall (stone battlements + towers) + big HP bar ----
  drawKingdomWall(ctx, now);
  // vertical HP bar
  const barX = WALL.x + 6;
  const barY = STREET.top - 4;
  const barH = STREET.bottom - STREET.top + 8;
  const barW = 16;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, barX, barY, barW, barH, 8);
  ctx.fill();
  const frac = s.wallMax ? s.wallHp / s.wallMax : 0;
  const fillH = barH * frac;
  ctx.fillStyle = frac > 0.5 ? '#8ce04a' : frac > 0.2 ? '#f4c145' : '#ef4444';
  roundRect(ctx, barX, barY + (barH - fillH), barW, fillH, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(s.wallHp), barX + barW / 2, barY - 6);

  // ---- enemies (Red units marching in; they hack at the wall on arrival) ----
  const frozen = s.frozen;
  for (const z of s.zombies) {
    const y = z.y;
    const displayH = z.boss ? 190 : 104;
    const sheet = assets ? assets.enemies[z.sprite || 'red_pawn'] : null;
    // when attacking the wall: jab toward it (left) on a rhythm + strike sparks
    // (frozen raiders can't move or attack)
    let ax = z.x;
    if (z.attacking && !frozen) {
      const t = Math.sin(now / 110 + z.id * 1.7);
      ax = z.x - Math.max(0, t) * 13;
      if (t > 0.88) drawHitSpark(ctx, WALL.x + 5, y - displayH * 0.04, now);
    }
    shadow(ctx, ax, y + displayH * 0.24, displayH * 0.24);
    const animIdx = frozen ? z.id * 2 : now / 90 + z.id * 2; // hold a frame when frozen
    const tint = frozen ? '#8fd0ff' : z.enraged ? '#ff5555' : undefined;
    if (!drawFrame(ctx, sheet, animIdx, ax, y - displayH * 0.06, displayH, true, tint)) {
      ctx.fillStyle = z.boss ? '#c1121f' : '#b23a48';
      circle(ctx, ax, y, z.boss ? 34 : 20);
    }
    if (frozen) drawFrost(ctx, ax, y - displayH * 0.06, displayH);
    if (z.flash) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,90,90,0.5)';
      circle(ctx, ax, y - displayH * 0.06, displayH * 0.2);
      ctx.restore();
    }
    const bw = displayH * 0.34;
    const top = y - displayH * 0.4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ax - bw / 2, top, bw, 5);
    ctx.fillStyle = z.boss ? '#ff9f45' : '#ff5c5c';
    ctx.fillRect(ax - bw / 2, top, bw * Math.max(0, z.hp / z.maxHp), 5);
  }

  // ---- royal archers in slots (same Archer sprite, rank shown by scale/tint/aura/crown) ----
  for (const slot of s.slots) {
    if (!slot.level) continue;
    if (slot.i === sel) continue; // being dragged — drawn as a ghost on top
    const spec = CRITTER_LEVELS[slot.level];
    const anim = assets ? assets.defenders[spec.sprite] : null;
    const elite = spec.elite;
    const displayH = 108 * (spec.scale || 1);
    const y = slot.y;
    shadow(ctx, slot.x, y + displayH * 0.2, displayH * 0.22);
    // rank aura: a soft glow ring behind higher-rank archers
    if (spec.aura) {
      const rg = ctx.createRadialGradient(slot.x, y, 4, slot.x, y, SLOTS.radius + 8);
      rg.addColorStop(0, spec.aura);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      circle(ctx, slot.x, y, SLOTS.radius + 8);
    }
    let drawn = false;
    if (anim) {
      let sheet;
      let idx;
      if (slot.atk > 0 && anim.attack) {
        sheet = anim.attack;
        idx = ((0.28 - slot.atk) / 0.28) * sheet.frames;
      } else {
        sheet = anim.idle;
        idx = now / 120 + slot.i * 3;
      }
      drawn = drawFrame(ctx, sheet, idx, slot.x, y - displayH * 0.05, displayH, false, spec.tint);
    }
    if (!drawn) {
      ctx.fillStyle = spec.tint || '#5a7cff';
      circle(ctx, slot.x, y, 22);
    }
    // crown floating above the legendary rank
    if (spec.crown) drawCrown(ctx, slot.x, y - displayH * 0.52, 22);
    // level badge
    const bx = slot.x + 18;
    const by = y + 16;
    ctx.fillStyle = '#111';
    circle(ctx, bx, by, 11);
    ctx.strokeStyle = elite ? '#ffd45e' : '#ffe566';
    ctx.lineWidth = 2;
    circle(ctx, bx, by, 11, true);
    ctx.fillStyle = elite ? '#ffd45e' : '#ffe566';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(slot.level), bx, by + 0.5);
  }

  // ---- projectiles: flying arrows (sprite rotated toward the target) ----
  const arrowImg = terrain && terrain.arrow;
  for (const p of s.projectiles) {
    const prog = 1 - p.ttl / (p.dur || 0.18);
    const px = p.x + (p.tx - p.x) * prog;
    const py = p.y + (p.ty - p.y) * prog;
    const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
    if (arrowImg && arrowImg.width) {
      const sz = 36;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.drawImage(arrowImg, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = '#6b4a2a';
      ctx.fillRect(-10, -1, 16, 2); // shaft
      ctx.fillStyle = '#d9d9d9';
      ctx.beginPath();
      ctx.moveTo(6, -3);
      ctx.lineTo(11, 0);
      ctx.lineTo(6, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // ---- explosions (fireball + shockwave + debris) ----
  for (const e of s.explosions) {
    const base = e.big ? 0.5 : 0.28;
    const prog = Math.min(1, Math.max(0, 1 - e.ttl / base));
    drawExplosion(ctx, e.x, e.y, prog, e.big);
  }

  // ---- frost overlay while the Freeze ability is active ----
  if (s.frozen) drawFrostOverlay(ctx, now);

  // ---- dragged archer ghost following the cursor (topmost) ----
  if (drag) {
    const spec = CRITTER_LEVELS[drag.level];
    const anim = assets ? assets.defenders[spec.sprite] : null;
    const dh = 108 * (spec.scale || 1) * 1.14;
    shadow(ctx, drag.x, drag.y + dh * 0.2, dh * 0.24);
    if (spec.aura) {
      const rg = ctx.createRadialGradient(drag.x, drag.y, 4, drag.x, drag.y, SLOTS.radius + 10);
      rg.addColorStop(0, spec.aura);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      circle(ctx, drag.x, drag.y, SLOTS.radius + 10);
    }
    let drawn = false;
    if (anim) drawn = drawFrame(ctx, anim.idle, now / 120, drag.x, drag.y - dh * 0.05, dh, false, spec.tint);
    if (!drawn) {
      ctx.fillStyle = spec.tint || '#5a7cff';
      circle(ctx, drag.x, drag.y, 24);
    }
    if (spec.crown) drawCrown(ctx, drag.x, drag.y - dh * 0.52, 22);
  }
}
