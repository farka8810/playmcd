'use client';

import { Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import GameCanvas from '@/components/GameCanvas';
import Leaderboard from '@/components/Leaderboard';
import { useLeaderboard } from '@/hooks/useLeaderboard';

export default function PlayPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Play />
    </Suspense>
  );
}

function Play() {
  const name = useSearchParams().get('name') || '';
  const { leaderboard, connected, submitScore } = useLeaderboard();

  const onGameOver = useCallback(
    ({ score, wave }) => {
      if (name) submitScore(name, score, wave);
    },
    [name, submitScore]
  );

  if (!name) {
    return (
      <p>
        Missing name. <Link href="/">Go back</Link> and start with a name.
      </p>
    );
  }

  return (
    <>
      <h1>Merge Cats Defender</h1>
      <p className="muted">
        Playing as <strong>{name}</strong> · leaderboard {connected ? 'live' : 'connecting…'}
      </p>

      <div className="game-layout">
        <GameCanvas onGameOver={onGameOver} />
        <Leaderboard entries={leaderboard} title="Live leaderboard" />
      </div>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/">← Home</Link> · <Link href="/leaderboard">Full leaderboard</Link>
      </p>
    </>
  );
}
