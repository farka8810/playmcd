'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GRID, CAT_COST, CAT_LEVELS, ENEMY_SPRITES, BASE_HP } from '@/lib/td/config';
import { Engine } from '@/lib/td/engine';

const W = GRID.cols * GRID.cell;
const H = GRID.rows * GRID.cell;

// Drives the Engine with a requestAnimationFrame loop, renders each snapshot to
// a <canvas> using the Kenney critter sprites, and turns clicks into buy/merge
// actions. All game rules live in the Engine; this component is presentation +
// input only.
export default function GameCanvas({ onGameOver }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const assetsRef = useRef(null); // { defenders, enemies[], boss }
  const selRef = useRef(null);
  const buyRef = useRef(false);
  const hoverRef = useRef(null);
  const overFiredRef = useRef(false);
  const lastHudRef = useRef(0);

  const [hud, setHud] = useState(null);
  const [buyMode, setBuyMode] = useState(false);
  const [sel, setSel] = useState(null);

  // Preload + tint sprites once.
  useEffect(() => {
    let alive = true;
    const names = [
      ...CAT_LEVELS.slice(1).map((s) => s.sprite),
      ...ENEMY_SPRITES.pool,
      ENEMY_SPRITES.boss,
    ];
    const uniq = [...new Set(names)];
    const imgs = {};
    let done = 0;
    const finish = () => {
      if (!alive || done < uniq.length) return;
      const defenders = {};
      for (const s of CAT_LEVELS.slice(1)) defenders[s.sprite] = imgs[s.sprite];
      assetsRef.current = {
        defenders,
        enemies: ENEMY_SPRITES.pool.map((n) => tint(imgs[n], 'rgb(70,170,55)')),
        boss: tint(imgs[ENEMY_SPRITES.boss], 'rgb(200,45,45)'),
      };
    };
    for (const n of uniq) {
      const img = new Image();
      img.onload = img.onerror = () => {
        done += 1;
        finish();
      };
      img.src = `/assets/critters/${n}.png`;
      imgs[n] = img;
    }
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(() => {
    engineRef.current = new Engine();
    selRef.current = null;
    buyRef.current = false;
    hoverRef.current = null;
    overFiredRef.current = false;
    setSel(null);
    setBuyMode(false);
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
      draw(ctx, eng.snapshot(), {
        sel: selRef.current,
        buyMode: buyRef.current,
        hover: hoverRef.current,
        assets: assetsRef.current,
        now,
      });

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

  const cellFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const py = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const col = Math.floor(px / GRID.cell);
    const row = Math.floor(py / GRID.cell);
    if (row < 0 || row >= GRID.rows || col < 0 || col >= GRID.cols) return null;
    return { row, col };
  };

  const handleClick = (e) => {
    const eng = engineRef.current;
    const cell = cellFromEvent(e);
    if (!cell || eng.phase === 'over') return;
    const { row, col } = cell;

    if (buyRef.current) {
      eng.buyCat(row, col);
      buyRef.current = false;
      setBuyMode(false);
      return;
    }

    const clicked = eng.catAt(row, col);
    const s = selRef.current;
    if (!clicked) {
      selRef.current = null;
      setSel(null);
      return;
    }
    if (!s) {
      selRef.current = { row, col };
      setSel({ row, col, level: clicked.level });
      return;
    }
    if (s.row === row && s.col === col) {
      selRef.current = null;
      setSel(null);
      return;
    }
    const merged = eng.merge(s.row, s.col, row, col);
    if (merged) {
      selRef.current = null;
      setSel(null);
    } else {
      selRef.current = { row, col };
      setSel({ row, col, level: clicked.level });
    }
  };

  const toggleBuy = () => {
    const v = !buyRef.current;
    buyRef.current = v;
    setBuyMode(v);
    selRef.current = null;
    setSel(null);
  };

  const canBuy = hud && hud.coins >= CAT_COST && hud.phase !== 'over';

  return (
    <div className="game">
      <div className="hud">
        <Stat label="Score" value={hud?.score ?? 0} />
        <Stat label="Coins" value={hud?.coins ?? 0} />
        <Stat label="Wave" value={hud?.wave ?? 0} />
        <Stat label="Base" value={'❤️'.repeat(Math.max(0, hud?.baseHp ?? BASE_HP))} />
      </div>

      <div className="game-stage">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="board"
          onClick={handleClick}
          onMouseMove={(e) => {
            hoverRef.current = cellFromEvent(e);
          }}
          onMouseLeave={() => {
            hoverRef.current = null;
          }}
        />

        {hud?.betweenWaves && hud.phase !== 'over' && (
          <div className="stage-note">
            Wave {hud.wave + 1} in {Math.ceil(hud.nextWaveIn)}s
          </div>
        )}

        {hud?.phase === 'over' && (
          <div className="overlay">
            <h2>Game Over</h2>
            <p>
              You reached <strong>wave {hud.wave}</strong> with{' '}
              <strong>{hud.score}</strong> points.
            </p>
            <p className="muted small">Your score was submitted to the leaderboard.</p>
            <button onClick={start}>Play again</button>
          </div>
        )}
      </div>

      <div className="controls">
        <button onClick={toggleBuy} disabled={!canBuy} className={buyMode ? 'active' : ''}>
          {buyMode ? 'Click a cell…' : `Buy critter (${CAT_COST}🪙)`}
        </button>
        <span className="muted small">
          {sel
            ? `Selected ${CAT_LEVELS[sel.level].name} — click another same-level critter to merge`
            : 'Buy critters, then merge two of the same kind to evolve them.'}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

// ---------- canvas rendering ----------

// Bakes a colored tint onto a sprite via an offscreen canvas (done once at load).
function tint(img, color) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width || 1;
  c.height = img.naturalHeight || img.height || 1;
  const cx = c.getContext('2d');
  cx.drawImage(img, 0, 0);
  cx.globalCompositeOperation = 'source-atop';
  cx.globalAlpha = 0.5;
  cx.fillStyle = color;
  cx.fillRect(0, 0, c.width, c.height);
  return c;
}

function drawSprite(ctx, img, x, y, targetH) {
  if (!img || !img.width) return false;
  const scale = targetH / img.height;
  ctx.drawImage(img, x - (img.width * scale) / 2, y - targetH / 2, img.width * scale, targetH);
  return true;
}

function circle(ctx, x, y, r, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (stroke) ctx.stroke();
  else ctx.fill();
}

function draw(ctx, s, { sel, buyMode, hover, assets, now }) {
  const cell = GRID.cell;
  ctx.clearRect(0, 0, W, H);

  // grassy lanes with a walking track down each row
  for (let r = 0; r < GRID.rows; r++) {
    ctx.fillStyle = r % 2 ? '#22381f' : '#1d3019';
    ctx.fillRect(0, r * cell, W, cell);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, r * cell + cell * 0.28, W, cell * 0.44); // track band
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, r * cell);
    ctx.lineTo(W, r * cell);
    ctx.stroke();
  }
  // base wall on the left (what the critters are protecting)
  const wall = cell * 0.28;
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(0, 0, wall, H);
  ctx.fillStyle = 'rgba(108,140,255,0.18)';
  ctx.fillRect(wall, 0, 6, H);

  // hover / buy target
  if (hover) {
    ctx.strokeStyle = buyMode ? '#8ac926' : '#ffe566';
    ctx.lineWidth = 3;
    ctx.strokeRect(hover.col * cell + 2, hover.row * cell + 2, cell - 4, cell - 4);
  }

  // shot tracers: a soft beam plus a travelling pellet
  for (const t of s.tracers) {
    const y = t.row * cell + cell / 2;
    const x0 = t.fromCol * cell + cell / 2;
    const x1 = t.toX * cell;
    ctx.strokeStyle = 'rgba(255,229,102,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = '#fff3b0';
    circle(ctx, x1, y, 4);
  }

  // zombies
  for (const z of s.zombies) {
    const x = z.x * cell;
    const y = z.row * cell + cell / 2 + Math.sin(now / 260 + z.id) * 2;
    const size = z.boss ? cell * 0.92 : cell * 0.6;
    const img = assets ? (z.boss ? assets.boss : assets.enemies[z.variant % assets.enemies.length]) : null;
    if (!drawSprite(ctx, img, x, y, size)) {
      ctx.fillStyle = z.boss ? '#c1121f' : '#5a8f3a';
      circle(ctx, x, y, z.boss ? 30 : 18);
    }
    // hp bar
    const bw = size * 0.8;
    const top = y - size / 2 - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - bw / 2, top, bw, 5);
    ctx.fillStyle = z.boss ? '#ff9f45' : '#7CFC66';
    ctx.fillRect(x - bw / 2, top, bw * Math.max(0, z.hp / z.maxHp), 5);
  }

  // critters (defenders)
  for (const c of s.cats) {
    const x = c.col * cell + cell / 2;
    const y = c.row * cell + cell / 2 + Math.sin(now / 380 + c.id) * 1.5;
    const spec = CAT_LEVELS[c.level];
    const img = assets ? assets.defenders[spec.sprite] : null;
    if (!drawSprite(ctx, img, x, y, cell * 0.72)) {
      ctx.fillStyle = spec.color;
      circle(ctx, x, y, 26);
    }
    // level badge
    const bx = x + cell * 0.26;
    const by = y + cell * 0.24;
    ctx.fillStyle = spec.color;
    circle(ctx, bx, by, 12);
    ctx.strokeStyle = '#0b0f1a';
    ctx.lineWidth = 2;
    circle(ctx, bx, by, 12, true);
    ctx.fillStyle = '#0b0f1a';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.level), bx, by + 0.5);
    // selection ring
    if (sel && sel.row === c.row && sel.col === c.col) {
      ctx.strokeStyle = '#ffe566';
      ctx.lineWidth = 3;
      circle(ctx, x, y, cell * 0.42, true);
    }
  }
}
