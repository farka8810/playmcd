import { topScores } from '@/server/leaderboard';

// REST fallback for the leaderboard (the live version arrives over Socket.IO).
// Useful for polling clients, external widgets, or debugging.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const limit = Number(new URL(request.url).searchParams.get('limit')) || 20;
  try {
    const entries = await topScores(Math.min(limit, 100));
    return Response.json(entries);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
