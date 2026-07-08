'use client';

import { use, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/hooks/useSocket';
import { PHASES } from '@/lib/events';
import ScoreBoard from '@/components/ScoreBoard';
import Leaderboard from '@/components/Leaderboard';

export default function PlayRoom({ params }) {
  const { room } = use(params); // params is a Promise in Next 15
  const name = useSearchParams().get('name') || '';

  const { state, leaderboard, connected, meId, tap } = useSocket({ room, name });
  const now = useNow(state?.phase === PHASES.COUNTDOWN || state?.phase === PHASES.PLAYING);

  if (!name) {
    return (
      <p>
        Missing name. <Link href="/">Go back</Link> and join with a name.
      </p>
    );
  }

  const phase = state?.phase ?? PHASES.WAITING;
  const isPlaying = phase === PHASES.PLAYING;

  return (
    <>
      <h1>Room: {room}</h1>
      <p className="muted">
        Playing as <strong>{name}</strong> · {connected ? 'connected' : 'connecting…'}
      </p>

      <div className="phase-banner">{banner(phase, state, now)}</div>

      <button className="tap-btn" onClick={tap} disabled={!isPlaying}>
        {isPlaying ? 'TAP!' : 'Wait for the round…'}
      </button>

      <div className="grid" style={{ marginTop: '1rem' }}>
        <ScoreBoard players={state?.players ?? []} meId={meId} />
        <Leaderboard entries={leaderboard} title="Global top 10" />
      </div>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/">← Leave</Link>
      </p>
    </>
  );
}

function banner(phase, state, now) {
  if (phase === PHASES.COUNTDOWN) {
    const s = Math.max(0, Math.ceil((state.startsAt - now) / 1000));
    return `Get ready… ${s}`;
  }
  if (phase === PHASES.PLAYING) {
    const s = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
    return `GO! ${s}s left`;
  }
  if (phase === PHASES.FINISHED) return 'Round over — next round starts soon';
  return 'Waiting for players…';
}

// Ticking clock, only runs while `active` so we don't spin timers on idle screens.
function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
