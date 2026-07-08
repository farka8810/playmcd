// Live scoreboard for the current room. `players` is state.players from the
// EVENTS.STATE snapshot (already sorted by score desc on the server).
export default function ScoreBoard({ players = [], meId }) {
  return (
    <section className="panel">
      <h2>Room ({players.length})</h2>
      <ul className="scoreboard">
        {players.map((p) => (
          <li key={p.id} className={p.id === meId ? 'me' : ''}>
            <span className="name">{p.name}</span>
            <span className="score">{p.score}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
