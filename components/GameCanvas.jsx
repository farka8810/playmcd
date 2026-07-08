'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GRID, CAT_COST, CAT_LEVELS, BASE_HP } from '@/lib/td/config';
import { Engine } from '@/lib/td/engine';

const W = GRID.cols * GRID.cell;
const H = GRID.rows * GRID.cell;

// Drives the Engine with a requestAnimationFrame loop, renders each snapshot to
// a <canvas>, and turns clicks into buy/merge actions. All game rules live in
// the Engine; this component is purely presentation + input.
export default function GameCanvas({ onGameOver }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const selRef = useRef(null); // {row,col} of the selected cat
  const buyRef = useRef(false); // "place a new cat" mode
  const hoverRef = useRef(null); // {row,col} under the cursor
  const overFiredRef = useRef(false);
  const lastHudRef = useRef(0);

  const [hud, setHud] = useState(null);
  const [buyMode, setBuyMode] = useState(false);
  const [sel, setSel] = useState(null);

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
      draw(ctx, eng.snapshot(), selRef.current, buyRef.current, hoverRef.current);

      // Throttle HUD React updates to ~15/s (the canvas already animates at 60).
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
    // two different cats selected -> try to merge, else select the new one
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
        <Stat label="Base" value={'❤'.repeat(Math.max(0, hud?.baseHp ?? BASE_HP))} />
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
          {buyMode ? 'Click a cell…' : `Buy cat (${CAT_COST}🪙)`}
        </button>
        <span className="muted small">
          {sel
            ? `Selected L${sel.level} — click another L${sel.level} cat to merge`
            : 'Select two same-level cats to merge them.'}
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

// ---- canvas rendering (pure, reads a snapshot) ----

function circle(ctx, x, y, r, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (stroke) ctx.stroke();
  else ctx.fill();
}

function draw(ctx, s, sel, buyMode, hover) {
  const cell = GRID.cell;
  ctx.clearRect(0, 0, W, H);

  // lanes
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#12213b' : '#0f1b30';
      ctx.fillRect(c * cell, r * cell, cell, cell);
    }
  }
  // base zone glow (left edge the zombies are heading for)
  ctx.fillStyle = 'rgba(108,140,255,0.12)';
  ctx.fillRect(0, 0, cell * 0.5, H);

  // hover / buy target
  if (hover) {
    ctx.strokeStyle = buyMode ? '#8ac926' : '#6c8cff';
    ctx.lineWidth = 3;
    ctx.strokeRect(hover.col * cell + 2, hover.row * cell + 2, cell - 4, cell - 4);
  }

  // shot tracers
  for (const t of s.tracers) {
    const y = t.row * cell + cell / 2;
    ctx.strokeStyle = 'rgba(255,229,102,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(t.fromCol * cell + cell / 2, y);
    ctx.lineTo(t.toX * cell, y);
    ctx.stroke();
  }

  // zombies
  for (const z of s.zombies) {
    const x = z.x * cell;
    const y = z.row * cell + cell / 2;
    const R = z.boss ? 30 : 18;
    ctx.fillStyle = z.boss ? '#c1121f' : '#5a8f3a';
    circle(ctx, x, y, R);
    ctx.fillStyle = '#0b0f1a';
    circle(ctx, x - 6, y - 4, 3);
    circle(ctx, x + 6, y - 4, 3);
    const w = R * 2;
    ctx.fillStyle = '#3a0b0b';
    ctx.fillRect(x - R, y - R - 8, w, 4);
    ctx.fillStyle = '#ff5c5c';
    ctx.fillRect(x - R, y - R - 8, w * Math.max(0, z.hp / z.maxHp), 4);
  }

  // cats
  for (const c of s.cats) {
    const x = c.col * cell + cell / 2;
    const y = c.row * cell + cell / 2;
    const spec = CAT_LEVELS[c.level];
    ctx.fillStyle = spec.color;
    circle(ctx, x, y, 26);
    // ears
    ctx.beginPath();
    ctx.moveTo(x - 18, y - 16);
    ctx.lineTo(x - 8, y - 32);
    ctx.lineTo(x - 2, y - 16);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 18, y - 16);
    ctx.lineTo(x + 8, y - 32);
    ctx.lineTo(x + 2, y - 16);
    ctx.closePath();
    ctx.fill();
    // eyes
    ctx.fillStyle = '#0b0f1a';
    circle(ctx, x - 8, y - 2, 3);
    circle(ctx, x + 8, y - 2, 3);
    // level label
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L' + c.level, x, y + 15);
    // selection ring
    if (sel && sel.row === c.row && sel.col === c.col) {
      ctx.strokeStyle = '#ffe566';
      ctx.lineWidth = 3;
      circle(ctx, x, y, 31, true);
    }
  }
}
