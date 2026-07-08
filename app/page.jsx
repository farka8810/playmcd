'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('lobby');

  function play(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    const r = room.trim() || 'lobby';
    router.push(`/play/${encodeURIComponent(r)}?name=${encodeURIComponent(n)}`);
  }

  return (
    <>
      <h1>playmcd</h1>
      <p className="muted">A real-time multiplayer arcade. Pick a name, join a room, tap to win.</p>

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <h2>Join a game — Tap Battle</h2>
        <form className="row" onSubmit={play}>
          <input
            aria-label="Your name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
          />
          <input
            aria-label="Room"
            placeholder="Room"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          />
          <button type="submit" disabled={!name.trim()}>
            Play
          </button>
        </form>
      </section>

      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/leaderboard">View the global leaderboard →</Link>
      </p>
    </>
  );
}
