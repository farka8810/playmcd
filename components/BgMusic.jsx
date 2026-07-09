'use client';

import { useEffect, useRef, useState } from 'react';
import { sfxMuted, setSfxMuted, sfx } from '@/lib/audio/sfx';

// Site-wide audio controls: the looping kingdom chiptune ("The Bard's Tale" by
// RandomMind, CC0) plus a separate toggle for the synthesized game SFX.
// Browsers block autoplay until the user interacts, so music starts on the
// first gesture (click / keypress); both mute choices persist in localStorage.
// Rendered from the root layout so the track keeps playing across routes.
const STORAGE_KEY = 'playmcd:music-muted';
const VOLUME = 0.35;

export default function BgMusic() {
  const audioRef = useRef(null);
  const mutedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [fx, setFx] = useState(false); // true = SFX muted
  const [ready, setReady] = useState(false); // avoids SSR/localStorage mismatch

  // Load the saved preferences after mount.
  useEffect(() => {
    setMuted(localStorage.getItem(STORAGE_KEY) === '1');
    setFx(sfxMuted());
    setReady(true);
  }, []);

  // Keep a ref in sync so the one-shot gesture handler sees the latest value.
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Try to start playback: immediately (usually blocked) and on the first
  // user gesture (allowed). Runs once, after the preference is loaded.
  useEffect(() => {
    if (!ready) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = VOLUME;

    const tryPlay = () => {
      if (!mutedRef.current) audio.play().catch(() => {});
    };
    const onGesture = () => {
      tryPlay();
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };

    tryPlay();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [ready]);

  // Apply and persist the mute toggle. The click itself is a user gesture, so
  // play() is allowed here.
  useEffect(() => {
    if (!ready) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) audio.pause();
    else audio.play().catch(() => {});
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
  }, [muted, ready]);

  const toggleFx = () => {
    setFx((m) => {
      setSfxMuted(!m);
      if (m) sfx.buy(); // audible confirmation when unmuting
      return !m;
    });
  };

  return (
    <div className="audio-controls">
      <audio ref={audioRef} src="/assets/audio/kingdom-theme.mp3" loop preload="auto" />
      <button
        type="button"
        className="music-toggle"
        aria-label={muted ? 'Unmute music' : 'Mute music'}
        aria-pressed={!muted}
        title={muted ? 'Unmute music' : 'Mute music'}
        onClick={() => setMuted((m) => !m)}
      >
        {muted ? '🔇' : '🎵'}
      </button>
      <button
        type="button"
        className="music-toggle sfx"
        aria-label={fx ? 'Unmute sound effects' : 'Mute sound effects'}
        aria-pressed={!fx}
        title={fx ? 'Unmute sound effects' : 'Mute sound effects'}
        onClick={toggleFx}
      >
        {fx ? '🔕' : '🔊'}
      </button>
    </div>
  );
}
