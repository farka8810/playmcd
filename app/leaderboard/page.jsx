import Link from 'next/link';
import Leaderboard from '@/components/Leaderboard';
import { topScores } from '@/server/leaderboard';

// Server Component: reads straight from PostgreSQL on each request.
export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  let entries = [];
  let error = null;
  try {
    entries = await topScores(20);
  } catch (e) {
    error = e.message;
  }

  return (
    <>
      <h1>Leaderboard</h1>
      {error ? (
        <p className="muted">Database unavailable: {error}</p>
      ) : (
        <Leaderboard entries={entries} title="Top 20 — Merge Critters Defender" />
      )}
      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/">← Home</Link>
      </p>
    </>
  );
}
