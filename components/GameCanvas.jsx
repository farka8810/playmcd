'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FIELD,
  WALL,
  STREET,
  SLOTS,
  CRITTER_LEVELS,
  ENEMY_SPRITES,
  RECRUIT_COST,
  ABILITIES,
} from '@/lib/td/config';
import { Engine } from '@/lib/td/engine';

const W = FIELD.width;
const H = FIELD.height;

// Drives the Engine with a requestAnimationFrame loop, renders each snapshot to a
// <canvas> (urban wall-defense scene using Kenney critter sprites), and overlays
// an HTML HUD. All game rules live in the Engine; this is presentation + input.
export default function GameCanvas({ onGameOver }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const assetsRef = useRef(null);
  const selRef = useRef(null); // selected slot index
  const overFiredRef = useRef(false);
  const lastHudRef = useRef(0);

  const [hud, setHud] = useState(null);
  const [sel, setSel] = useState(null);

  // Preload the animated Tiny Swords spritesheets. Each sheet is a horizontal
  // strip of square frames, so frameCount = width / height (computed on load).
  useEffect(() => {
    let alive = true;
    const keys = [
      'pawn_idle',
      'archer_idle',
      'archer_attack',
      'monk_idle',
      'lancer_idle',
      'warrior_idle',
      'warrior_attack',
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
        defenders: {
          pawn: { idle: S('pawn_idle') },
          archer: { idle: S('archer_idle'), attack: S('archer_attack') },
          monk: { idle: S('monk_idle') },
          lancer: { idle: S('lancer_idle') },
          warrior: { idle: S('warrior_idle'), attack: S('warrior_attack') },
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

  const start = useCallback(() => {
    engineRef.current = new Engine();
    selRef.current = null;
    overFiredRef.current = false;
    setSel(null);
    setHud(engineRef.current.snapshot());
  }, []);

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
      draw(ctx, eng.snapshot(), { sel: selRef.current, assets: assetsRef.current, now });
      if (now - lastHudRef.current > 66) {
        lastHudRef.current = now;
        setHud(eng.snapshot());
      }
      if (eng.phase === 'over' && !overFiredRef.current) {
        overFiredRef.current = true;
        setHud(eng.snapshot());
        onGameOver?.({ score: eng.score, wave: eng.wave });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [start, onGameOver]);

  const slotFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const py = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const slots = engineRef.current.slots;
    for (let i = 0; i < slots.length; i++) {
      const dx = px - slots[i].x;
      const dy = py - slots[i].y;
      if (dx * dx + dy * dy <= (SLOTS.radius + 8) ** 2) return i;
    }
    return -1;
  };

  const handleClick = (e) => {
    const eng = engineRef.current;
    if (eng.phase === 'over') return;
    const i = slotFromEvent(e);
    if (i < 0 || !eng.critterInSlot(i)) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const s = selRef.current;
    if (s === null) {
      selRef.current = i;
      setSel(i);
      return;
    }
    if (s === i) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const merged = eng.merge(s, i);
    if (merged) {
      selRef.current = null;
      setSel(null);
    } else {
      selRef.current = i;
      setSel(i);
    }
  };

  const act = (fn) => () => {
    fn();
    setHud(engineRef.current.snapshot());
  };

  const canRecruit = hud && hud.coins >= RECRUIT_COST && hud.phase !== 'over';
  const canRepair = hud && hud.coins >= WALL.upgradeCost && hud.wallHp < hud.wallMax && hud.phase !== 'over';

  return (
    <div className="game">
      <div className="game-stage" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="board"
          onClick={handleClick}
        />

        {/* top HUD */}
        <div className="hud-top">
          <div className="pill coins">🪙 {hud?.coins ?? 0}</div>
          <div className="pill timer">⏱ {mmss(hud?.time ?? 0)}</div>
          <div className="hud-right">
            <div className="pill skull">💀 {hud?.waveKills ?? 0}/{hud?.waveTotal ?? 0}</div>
            <div className="pill gear" title="Wave">☰ W{hud?.wave ?? 0}</div>
          </div>
        </div>

        {/* bottom-left actions */}
        <div className="hud-actions">
          <button className="recruit" onClick={act(() => engineRef.current.recruit())} disabled={!canRecruit}>
            <span className="ra-icon">🐾</span>
            <span className="ra-text">
              Recruit
              <small>🪙 {RECRUIT_COST}</small>
            </span>
          </button>
          <button className="wall-btn" onClick={act(() => engineRef.current.repairWall())} disabled={!canRepair}>
            Repair Wall
            <small>🪙 {WALL.upgradeCost}</small>
          </button>
        </div>

        {/* bottom-right abilities */}
        <div className="hud-cards">
          <AbilityCard
            icon={ABILITIES.bomb.icon}
            label={ABILITIES.bomb.label}
            charges={hud?.abilities?.bomb ?? 0}
            onClick={act(() => engineRef.current.useBomb())}
            disabled={hud?.phase === 'over'}
          />
          <AbilityCard
            icon={ABILITIES.freeze.icon}
            label={ABILITIES.freeze.label}
            charges={hud?.abilities?.freeze ?? 0}
            active={hud?.frozen}
            onClick={act(() => engineRef.current.useFreeze())}
            disabled={hud?.phase === 'over'}
          />
        </div>

        {hud?.betweenWaves && hud.phase !== 'over' && (
          <div className="stage-note">Wave {hud.wave + 1} in {Math.ceil(hud.nextWaveIn)}s</div>
        )}

        {hud?.phase === 'over' && (
          <div className="overlay">
            <h2>Wall Breached!</h2>
            <p>
              You survived <strong>{hud.wave} waves</strong> ·{' '}
              <strong>{hud.kills} kills</strong> · <strong>{hud.score}</strong> pts
            </p>
            <p className="muted small">Score submitted to the leaderboard.</p>
            <button onClick={start}>Play again</button>
          </div>
        )}
      </div>

      <p className="muted small hint">
        {sel !== null
          ? `Selected a Lv${hud?.slots?.find((s) => s.i === sel)?.level} critter — click another of the same level to merge.`
          : 'Recruit critters into the slots, then click two of the same level to merge them.'}
      </p>
    </div>
  );
}

function AbilityCard({ icon, label, charges, onClick, disabled, active }) {
  return (
    <button
      className={`card${active ? ' active' : ''}`}
      onClick={onClick}
      disabled={disabled || charges <= 0}
      title={label}
    >
      <span className="card-icon">{icon}</span>
      <span className="card-count">{charges}/{ABILITIES[label === 'TNT' ? 'bomb' : 'freeze'].charges}</span>
    </button>
  );
}

function mmss(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ---------- canvas rendering ----------

// Draws one frame of an animated sheet, centered at (cx, cy). Frames are square
// (size × size) laid out horizontally. `flip` mirrors horizontally (enemies face
// left). idx is wrapped/floored so callers can pass a running value.
function drawFrame(ctx, sheet, idx, cx, cy, displayH, flip) {
  if (!sheet || !sheet.img.width) return false;
  const s = sheet.size;
  const scale = displayH / s;
  const dw = s * scale;
  const i = ((Math.floor(idx) % sheet.frames) + sheet.frames) % sheet.frames;
  ctx.save();
  ctx.translate(cx, cy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet.img, i * s, 0, s, s, -dw / 2, -dw / 2, dw, dw);
  ctx.restore();
  return true;
}

function shadow(ctx, x, y, rx) {
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
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

function draw(ctx, s, { sel, assets, now }) {
  ctx.imageSmoothingEnabled = false; // crisp pixel-art scaling
  // ---- background: urban street ----
  ctx.fillStyle = '#23262d';
  ctx.fillRect(0, 0, W, H);
  // sidewalks
  ctx.fillStyle = '#31353d';
  ctx.fillRect(0, 0, W, STREET.top);
  ctx.fillRect(0, STREET.bottom, W, H - STREET.bottom);
  // curbs
  ctx.fillStyle = '#3f4550';
  ctx.fillRect(0, STREET.top - 6, W, 6);
  ctx.fillRect(0, STREET.bottom, W, 6);
  // manhole + drain decorations on the sidewalks
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 360; x < W; x += 240) {
    circle(ctx, x, STREET.top / 2, 22);
    circle(ctx, x + 90, H - (H - STREET.bottom) / 2, 20);
  }
  // dashed center line
  ctx.strokeStyle = 'rgba(214,188,110,0.5)';
  ctx.lineWidth = 5;
  ctx.setLineDash([34, 26]);
  ctx.beginPath();
  ctx.moveTo(WALL.x + 40, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // ---- deployment slots (dashed circles) ----
  for (const slot of s.slots) {
    const isSel = sel === slot.i;
    ctx.strokeStyle = slot.level ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
    circle(ctx, slot.x, slot.y, SLOTS.radius, true);
    ctx.setLineDash([]);
    if (isSel) {
      ctx.strokeStyle = '#ffe566';
      ctx.lineWidth = 4;
      circle(ctx, slot.x, slot.y, SLOTS.radius + 3, true);
    }
  }

  // ---- wall (stacked boxes) + big HP bar ----
  const wx = WALL.x - WALL.width;
  ctx.fillStyle = '#8a5a34';
  roundRect(ctx, wx, STREET.top - 10, WALL.width, STREET.bottom - STREET.top + 20, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  for (let y = STREET.top; y < STREET.bottom; y += 46) {
    ctx.beginPath();
    ctx.moveTo(wx, y);
    ctx.lineTo(wx + WALL.width, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; // tape
  ctx.fillRect(WALL.x - WALL.width / 2 - 4, STREET.top - 10, 8, STREET.bottom - STREET.top + 20);
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

  // ---- enemies (animated Red units, facing left) ----
  for (const z of s.zombies) {
    const y = z.y;
    const displayH = z.boss ? 190 : 104;
    const name = z.boss ? ENEMY_SPRITES.boss : ENEMY_SPRITES.pool[z.variant % ENEMY_SPRITES.pool.length];
    const sheet = assets ? assets.enemies[name] : null;
    shadow(ctx, z.x, y + displayH * 0.24, displayH * 0.24);
    if (!drawFrame(ctx, sheet, now / 90 + z.id * 2, z.x, y - displayH * 0.06, displayH, true)) {
      ctx.fillStyle = z.boss ? '#c1121f' : '#b23a48';
      circle(ctx, z.x, y, z.boss ? 34 : 20);
    }
    if (z.flash) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,90,90,0.5)';
      circle(ctx, z.x, y - displayH * 0.06, displayH * 0.2);
      ctx.restore();
    }
    const bw = displayH * 0.34;
    const top = y - displayH * 0.4;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(z.x - bw / 2, top, bw, 5);
    ctx.fillStyle = z.boss ? '#ff9f45' : '#ff5c5c';
    ctx.fillRect(z.x - bw / 2, top, bw * Math.max(0, z.hp / z.maxHp), 5);
  }

  // ---- defenders in slots (animated Blue units, facing right) ----
  for (const slot of s.slots) {
    if (!slot.level) continue;
    const spec = CRITTER_LEVELS[slot.level];
    const anim = assets ? assets.defenders[spec.sprite] : null;
    const elite = spec.elite;
    const displayH = elite ? 130 : 108;
    const y = slot.y;
    shadow(ctx, slot.x, y + displayH * 0.2, displayH * 0.22);
    if (elite) {
      ctx.strokeStyle = 'rgba(255,215,90,0.7)';
      ctx.lineWidth = 3;
      circle(ctx, slot.x, y, SLOTS.radius + 2, true);
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
      drawn = drawFrame(ctx, sheet, idx, slot.x, y - displayH * 0.05, displayH, false);
    }
    if (!drawn) {
      ctx.fillStyle = '#5a7cff';
      circle(ctx, slot.x, y, 22);
    }
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
    // selection ring (on top of the sprite)
    if (sel === slot.i) {
      ctx.strokeStyle = '#ffe566';
      ctx.lineWidth = 3;
      circle(ctx, slot.x, y, SLOTS.radius + 5, true);
    }
  }

  // ---- projectiles ----
  for (const p of s.projectiles) {
    const prog = 1 - p.ttl / 0.18;
    const px = p.x + (p.tx - p.x) * prog;
    const py = p.y + (p.ty - p.y) * prog;
    ctx.fillStyle = '#fff3b0';
    circle(ctx, px, py, 5);
    ctx.strokeStyle = 'rgba(255,229,102,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  // ---- explosions ----
  for (const e of s.explosions) {
    const base = e.big ? 0.5 : 0.28;
    const prog = 1 - e.ttl / base;
    const r = (e.big ? 80 : 34) * prog;
    ctx.strokeStyle = `rgba(255,180,60,${1 - prog})`;
    ctx.lineWidth = 5;
    circle(ctx, e.x, e.y, r, true);
  }
}
