'use client';

// Synthesized retro sound effects via the Web Audio API — zero asset files.
// Each effect is a tiny recipe of oscillator sweeps and/or filtered noise.
// The AudioContext is created lazily on the first call (which always happens
// inside a user gesture — a click/keydown — so autoplay policy is satisfied).
// Mute preference persists in localStorage, separate from the music toggle.

const STORAGE_KEY = 'playmcd:sfx-muted';
const MASTER_VOL = 0.5;

let ctx = null;
let master = null;
let noiseBuf = null;
const lastPlay = {}; // per-effect rate limiting so 12 archers don't white-out

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_VOL;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function sfxMuted() {
  return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
}

export function setSfxMuted(muted) {
  localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
}

// Gate: muted check + per-key minimum interval (ms).
function gate(key, minGap) {
  if (sfxMuted() || !ac()) return false;
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < minGap) return false;
  lastPlay[key] = now;
  return true;
}

// One oscillator: frequency sweeps freq→end over dur with an exponential fade.
function tone({ freq = 440, end = freq, dur = 0.1, type = 'square', vol = 0.15, delay = 0 }) {
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, end), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Band-passed white noise burst (impacts, cracks, whooshes).
function noise({ dur = 0.12, vol = 0.15, freq = 1200, q = 1, delay = 0 }) {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  // archer loosing an arrow — soft twang
  shoot() {
    if (!gate('shoot', 70)) return;
    tone({ freq: 1500, end: 500, dur: 0.06, type: 'triangle', vol: 0.05 });
  },
  // arrow connecting — short thock
  hit(crit) {
    if (!gate('hit', 60)) return;
    noise({ dur: 0.05, vol: crit ? 0.16 : 0.08, freq: crit ? 3200 : 2200, q: 2 });
    if (crit) tone({ freq: 1800, end: 2600, dur: 0.08, type: 'square', vol: 0.09 });
  },
  // kill pop — pitch climbs with the combo streak (classic juice trick)
  kill(combo = 1) {
    if (!gate('kill', 50)) return;
    const base = 400 + Math.min(combo, 12) * 55;
    tone({ freq: base, end: base * 1.8, dur: 0.09, type: 'square', vol: 0.1 });
  },
  // gold pickup — two-note sparkle
  coin() {
    if (!gate('coin', 90)) return;
    tone({ freq: 1046, dur: 0.05, type: 'sine', vol: 0.08 });
    tone({ freq: 1568, dur: 0.08, type: 'sine', vol: 0.08, delay: 0.05 });
  },
  // merge/promote — rising 3-note chime
  merge() {
    tone({ freq: 523, dur: 0.09, type: 'triangle', vol: 0.14 });
    tone({ freq: 659, dur: 0.09, type: 'triangle', vol: 0.14, delay: 0.08 });
    tone({ freq: 1046, dur: 0.16, type: 'triangle', vol: 0.16, delay: 0.16 });
  },
  // wave horn
  wave() {
    tone({ freq: 220, end: 165, dur: 0.4, type: 'sawtooth', vol: 0.12 });
    tone({ freq: 330, end: 247, dur: 0.4, type: 'sawtooth', vol: 0.08, delay: 0.05 });
  },
  // boss arrival — deep rumble + roar sweep
  boss() {
    tone({ freq: 90, end: 45, dur: 0.7, type: 'sawtooth', vol: 0.22 });
    noise({ dur: 0.5, vol: 0.14, freq: 300, q: 0.7, delay: 0.1 });
  },
  // berserker enrage — angry upward snarl
  enrage() {
    tone({ freq: 140, end: 420, dur: 0.3, type: 'sawtooth', vol: 0.18 });
    noise({ dur: 0.25, vol: 0.1, freq: 900, q: 1.5 });
  },
  // summoner conjuring — eerie shimmer
  summon() {
    tone({ freq: 880, end: 1320, dur: 0.2, type: 'sine', vol: 0.09 });
    tone({ freq: 660, end: 990, dur: 0.2, type: 'sine', vol: 0.09, delay: 0.07 });
  },
  // catapult volley — boom
  boom() {
    tone({ freq: 120, end: 40, dur: 0.4, type: 'square', vol: 0.2 });
    noise({ dur: 0.35, vol: 0.2, freq: 500, q: 0.6 });
  },
  // frost cast — icy descending shimmer
  freeze() {
    tone({ freq: 2093, end: 1046, dur: 0.3, type: 'sine', vol: 0.1 });
    tone({ freq: 1568, end: 784, dur: 0.35, type: 'sine', vol: 0.09, delay: 0.06 });
  },
  // shop purchase / recruit
  buy() {
    tone({ freq: 784, dur: 0.06, type: 'square', vol: 0.1 });
    tone({ freq: 1175, dur: 0.1, type: 'square', vol: 0.1, delay: 0.06 });
  },
  // wall integrity crossing a threshold — stone crack
  wallCrack() {
    noise({ dur: 0.3, vol: 0.22, freq: 700, q: 0.8 });
    tone({ freq: 160, end: 60, dur: 0.25, type: 'square', vol: 0.12 });
  },
  // defeat sting — descending minor phrase
  over() {
    tone({ freq: 392, dur: 0.22, type: 'triangle', vol: 0.16 });
    tone({ freq: 311, dur: 0.22, type: 'triangle', vol: 0.16, delay: 0.2 });
    tone({ freq: 233, dur: 0.5, type: 'triangle', vol: 0.18, delay: 0.4 });
  },
};
