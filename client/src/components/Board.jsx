import React from 'react';

function formatTime(ts) {
  return new Date(ts).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function Board({ picks, count, myPickId }) {
  return (
    <section className="board-section">
      <div className="board-head">
        <h2>הלוח המשותף</h2>
        <span className="live-badge">
          <span className="live-dot"></span>
          {count === 1 ? 'כרטיס אחד מולא עד עכשיו' : count + ' כרטיסים מולאו עד עכשיו'}
        </span>
      </div>

      {picks.length === 0 ? (
        <p className="board-empty">עדיין אין כרטיסים... תהיה הראשון! 🚀</p>
      ) : (
        <div className="board-grid">
          {picks.map((p) => (
            <div className={'mini-card' + (p.id === myPickId ? ' mine' : '')} key={p.id}>
              <div className="mini-head">
                <span className="mini-name">{p.name ? p.name : 'משתתף #' + p.id}</span>
                {p.id === myPickId ? <span className="me-tag">אתה</span> : null}
              </div>
              <div className="mini-balls">
                {p.numbers.map((n, i) => (
                  <span className="ball sm" key={i}>{n}</span>
                ))}
                <span className="ball sm strong">{p.strong}</span>
              </div>
              <div className="mini-time">{formatTime(p.ts)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
