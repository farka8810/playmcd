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
// <canvas> (a cartoon kingdom wall-defense scene using Tiny Swords sprites), and
// overlays an HTML HUD. Every defender is an Archer; merge rank is shown purely
// through size/tint/aura/crown. All game rules live in the Engine; this is
// presentation + input.
export default function GameCanvas({ onGameOver }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const assetsRef = useRef(null);
  const terrainRef = useRef(null); // grass tile + decoration images
  const dragRef = useRef(null); // { from, level, x, y, over } while dragging an archer
  const overFiredRef = useRef(false);
  const lastHudRef = useRef(0);

  const [hud, setHud] = useState(null);
  const [sel, setSel] = useState(null); // from-slot while dragging (for the hint)

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
    const names = ['tilemap', 'tree', 'bush1', 'bush2', 'rock1', 'rock2', 'cloud1', 'cloud2'];
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
      };
    };
    for (const nm of names) {
      const img = new Image();
      img.onload = () => {
        imgs[nm] = img;
        done();
      };
      img.onerror = done;
      img.src = `/assets/tiny/${nm}.png`;
    }
  }, []);

  const start = useCallback(() => {
    engineRef.current = new Engine();
    dragRef.current = null;
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
      draw(ctx, eng.snapshot(), { drag: dragRef.current, assets: assetsRef.current, terrain: terrainRef.current, now });
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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
            <span className="ra-icon">🏹</span>
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
            akey="bomb"
            charges={hud?.abilities?.bomb ?? 0}
            onClick={act(() => engineRef.current.useBomb())}
            disabled={hud?.phase === 'over'}
          />
          <AbilityCard
            akey="freeze"
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
            <h2>👑 The Kingdom Has Fallen!</h2>
            <p>
              You defended <strong>{hud.wave} waves</strong> ·{' '}
              <strong>{hud.kills} raiders slain</strong> · <strong>{hud.score}</strong> pts
            </p>
            <p className="muted small">Score submitted to the leaderboard.</p>
            <button onClick={start}>Defend again</button>
          </div>
        )}
      </div>

      <p className="muted small hint">
        {sel !== null
          ? `Dragging a Lv${hud?.slots?.find((s) => s.i === sel)?.level} archer — drop on an empty slot to move, or on a same-rank archer to promote.`
          : 'Recruit archers, then drag one onto another of the same rank to merge & promote — or onto an empty slot to reposition.'}
      </p>
    </div>
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
      <span className="card-count">{charges}/{ability.charges}</span>
    </button>
  );
}

function mmss(t) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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

// Draw one (square) frame of a decoration strip, anchored bottom-center.
function drawDeco(ctx, img, cx, baseY, dispH, frame) {
  const fh = img.height;
  const frames = Math.max(1, Math.round(img.width / fh));
  const f = ((Math.floor(frame) % frames) + frames) % frames;
  ctx.drawImage(img, f * fh, 0, fh, fh, cx - dispH / 2, baseY - dispH, dispH, dispH);
}

// Trees, bushes and rocks scattered around the field edges (behind the units).
function drawDecorations(ctx, terrain, now) {
  const sway = now / 200;
  const trees = terrain.trees;
  if (trees.length) {
    drawDeco(ctx, trees[0], 470, STREET.top + 74, 150, sway);
    drawDeco(ctx, trees[0], 690, STREET.top + 58, 128, sway + 3);
    drawDeco(ctx, trees[0], 905, STREET.top + 96, 172, sway + 1.5);
  }
  const bushes = terrain.bushes;
  if (bushes.length) {
    drawDeco(ctx, bushes[0], 330, STREET.top + 40, 66, sway + 2);
    drawDeco(ctx, bushes[bushes.length - 1], 860, STREET.bottom - 6, 74, sway + 4);
    drawDeco(ctx, bushes[0], 560, STREET.bottom + 6, 60, sway + 1);
  }
  const rocks = terrain.rocks;
  if (rocks.length) {
    drawDeco(ctx, rocks[0], 420, STREET.bottom - 4, 40, 0);
    drawDeco(ctx, rocks[rocks.length - 1], 780, STREET.top + 150, 34, 0);
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

// A single stepped (chunky) mountain silhouette — used for the tower roof.
function stepMountain(ctx, cx, baseY, halfW, height, color, step) {
  ctx.fillStyle = color;
  for (let i = 0; i < height; i += step) {
    const w = (halfW * (height - i)) / height;
    ctx.fillRect((cx - w) | 0, (baseY - i - step) | 0, Math.ceil(w * 2), step);
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

  // gatehouse tower at the top of the column (blocky stone + blue roof)
  const tw = w + 18;
  const tx = WALL.x - w / 2 - tw / 2;
  const tTop = top - 13;
  const tBodyH = 32;
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
  // tower crenellations
  ctx.fillStyle = '#c39a68';
  for (let x = tx; x <= tx + tw - 9; x += 13) ctx.fillRect(x, tTop - tBodyH - 8, 9, 9);
  // terracotta stepped roof
  stepMountain(ctx, tx + tw / 2, tTop - tBodyH - 8, tw / 2 + 3, 34, '#b04a34', 5);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(tx + tw / 2, tTop - tBodyH - 40, tw / 2 + 3, 32);
  // flagpole + waving pennant
  const apexY = tTop - tBodyH - 42;
  const poleTop = apexY - 18;
  ctx.strokeStyle = '#5a4326';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tx + tw / 2, apexY);
  ctx.lineTo(tx + tw / 2, poleTop);
  ctx.stroke();
  const wave = Math.sin(now / 220) * 3;
  ctx.fillStyle = '#e5484d';
  ctx.beginPath();
  ctx.moveTo(tx + tw / 2, poleTop);
  ctx.lineTo(tx + tw / 2 + 18, poleTop + 4 + wave);
  ctx.lineTo(tx + tw / 2, poleTop + 10);
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
  // clouds
  if (terrain && terrain.clouds.length) drawCloudSprites(ctx, terrain.clouds, now);
  else drawSoftClouds(ctx, now, horizon);
  // layered rolling hills straddling the horizon (soft, gradient-filled)
  softHill(ctx, 210, horizon + 8, 360, 70, '#a9b6d8', '#8f9ec6');
  softHill(ctx, 760, horizon + 8, 400, 84, '#9fb0d2', '#8394bf');
  softHill(ctx, 470, horizon + 12, 340, 58, '#88b07e', '#6f9a68');
  // grass ground — tiled pixel-art (with a gradient fallback)
  if (terrain && terrain.grass && terrain.grass.width) {
    tileGrass(ctx, terrain.grass, horizon, H);
  } else {
    const grass = ctx.createLinearGradient(0, horizon, 0, H);
    grass.addColorStop(0, '#8fd066');
    grass.addColorStop(1, '#4e9a37');
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, W, H - horizon);
  }
  // gentle depth shading over the ground (lit near horizon, shaded foreground)
  const gd = ctx.createLinearGradient(0, horizon, 0, H);
  gd.addColorStop(0, 'rgba(255,255,240,0.10)');
  gd.addColorStop(0.5, 'rgba(0,0,0,0)');
  gd.addColorStop(1, 'rgba(20,52,20,0.22)');
  ctx.fillStyle = gd;
  ctx.fillRect(0, horizon, W, H - horizon);
  // sprinkle of wildflowers for extra life
  drawMeadow(ctx, horizon);
  // trees / bushes / rocks around the edges (behind the units)
  if (terrain) drawDecorations(ctx, terrain, now);

  // ---- deployment slots (drop targets) ----
  for (const slot of s.slots) {
    const isTarget = dragOver === slot.i && sel !== slot.i;
    if (isTarget) {
      ctx.fillStyle = 'rgba(120,224,90,0.22)';
      circle(ctx, slot.x, slot.y, SLOTS.radius + 4);
    }
    ctx.strokeStyle = slot.level ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 7]);
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
