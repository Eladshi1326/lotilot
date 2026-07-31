import React from 'react';
import { GAMES_UI } from '../games.js';
import { PickView } from './GamePieces.jsx';

function formatTime(ts) {
  return new Date(ts).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function Board({ game, picks, count, myPickId }) {
  const ui = GAMES_UI[game];
  return (
    <section className="board-section">
      <div className="board-head">
        <h2>הלוח המשותף — {ui.name}</h2>
        <span className="live-badge">
          <span className="live-dot"></span>
          {count === 1 ? 'כרטיס אחד מולא עד עכשיו' : count + ' כרטיסים מולאו עד עכשיו'}
        </span>
      </div>

      {picks.length === 0 ? (
        <p className="board-empty">עדיין אין כרטיסים ב{ui.name}... תהיה הראשון! 🚀</p>
      ) : (
        <div className="board-grid">
          {picks.map((p) => (
            <div className={'mini-card' + (p.id === myPickId ? ' mine' : '')} key={p.id}>
              <div className="mini-head">
                <span className="mini-name">{p.name ? p.name : 'משתתף #' + p.id}</span>
                {p.id === myPickId ? <span className="me-tag">אתה</span> : null}
              </div>
              <div className="mini-body">
                <PickView game={game} numbers={p.numbers} strong={p.strong} size="sm" />
              </div>
              <div className="mini-time">{formatTime(p.ts)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
