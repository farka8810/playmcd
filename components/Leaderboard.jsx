// Global top-scores table. `entries` come from the leaderboard:update socket
// event or GET /api/leaderboard; both share the same shape.
export default function Leaderboard({ entries = [], title = 'Leaderboard' }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {entries.length === 0 ? (
        <p className="muted">No scores yet — play a round!</p>
      ) : (
        <ol className="leaderboard">
          {entries.map((e, i) => (
            <li key={e.name + i}>
              <span className="rank">#{i + 1}</span>
              <span className="name">{e.name}</span>
              <span className="best">{e.best}</span>
              <span className="muted small">{e.games} games</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
