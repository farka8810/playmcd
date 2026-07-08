'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');

  function play(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    router.push(`/play?name=${encodeURIComponent(n)}`);
  }

  return (
    <>
      <h1>🐱 Merge Cats Defender</h1>
      <p className="muted">
        Defend the base from endless zombie hordes. Place cats, merge them into
        stronger forms, survive the waves — and climb the live leaderboard.
      </p>

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <h2>Start a run</h2>
        <form className="row" onSubmit={play}>
          <input
            aria-label="Your name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
          />
          <button type="submit" disabled={!name.trim()}>
            Play
          </button>
        </form>
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2>How to play</h2>
        <ul className="how">
          <li>
            <strong>Buy a cat</strong> and click an empty cell to place it in a lane.
          </li>
          <li>Cats automatically shoot zombies approaching from the right.</li>
          <li>
            <strong>Merge</strong> two same-level cats (click one, then the other) to
            forge a stronger form.
          </li>
          <li>Every 5th wave sends a <strong>boss</strong>. Don’t let the base fall!</li>
        </ul>
      </section>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/leaderboard">View the global leaderboard →</Link>
      </p>
    </>
  );
}
