'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Leaderboard from '@/components/Leaderboard';
import { useLeaderboard } from '@/hooks/useLeaderboard';

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const { leaderboard } = useLeaderboard();

  function play(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    router.push(`/play?name=${encodeURIComponent(n)}`);
  }

  return (
    <>
      <section className="hero">
        <div className="hero-overlay" />
        <div className="hero-inner">
          <p className="hero-kicker">⚔️ A pixel kingdom wall-defense</p>
          <h1 className="hero-title">
            MERGE<br />ARCHERS
          </h1>
          <p className="hero-sub">👑 Kingdom Defense</p>

          <form className="hero-form" onSubmit={play}>
            <div className="archer-avatar" aria-hidden="true" />
            <input
              aria-label="Your name"
              placeholder="Enter your name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
            />
            <button type="submit" disabled={!name.trim()}>
              Play ▶
            </button>
          </form>
          <p className="hero-note">Free to play · live global leaderboard</p>
        </div>
      </section>

      <p className="hero-desc">
        The horde is marching on the kingdom wall. Deploy royal archers, merge them
        to promote higher ranks, and hold the line wave after wave — then climb the
        live leaderboard.
      </p>

      <div className="grid feature-grid">
        <section className="panel feature">
          <span className="feature-ico">🏹</span>
          <h3>Recruit</h3>
          <p className="muted">Place royal archers on the rampart slots behind the wall.</p>
        </section>
        <section className="panel feature">
          <span className="feature-ico">✨</span>
          <h3>Merge &amp; Promote</h3>
          <p className="muted">Combine two same-rank archers into a stronger, longer-ranged one.</p>
        </section>
        <section className="panel feature">
          <span className="feature-ico">🛡️</span>
          <h3>Defend</h3>
          <p className="muted">Four raider classes and three rotating bosses — Warlord, Berserker, Summoner.</p>
        </section>
        <section className="panel feature">
          <span className="feature-ico">🏆</span>
          <h3>Compete</h3>
          <p className="muted">Your score hits the live global leaderboard the moment you fall.</p>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1.25rem' }}>
        <h2>How to play</h2>
        <ol className="how how-steps">
          <li>
            <strong>Recruit an archer</strong> onto an empty rampart slot behind the wall.
          </li>
          <li>Archers automatically loose arrows at raiders marching in from the right.</li>
          <li>
            <strong>Drag</strong> an archer onto another of the same rank to
            <strong> merge &amp; promote</strong> it (Recruit → Legendary), or onto an empty
            slot to reposition.
          </li>
          <li>
            Between waves, spend gold in the <strong>shop</strong>: restock Catapult &amp; Frost,
            or buy permanent upgrades (wall, damage, fire rate, crit chance, income).
          </li>
          <li>
            Chain kills fast for a <strong>combo</strong> score multiplier — and watch for
            criticals!
          </li>
          <li>
            Every 5th wave sends a <strong>boss</strong>: the Warlord, the enraging Berserker, or
            the minion-conjuring Summoner. Don’t let the wall fall!
          </li>
        </ol>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <Leaderboard entries={leaderboard.slice(0, 10)} title="🏆 Live Leaderboard — Top 10" />
      </section>

      <p className="home-foot">
        <Link href="/leaderboard">🏆 View the full global leaderboard →</Link>
      </p>
    </>
  );
}
