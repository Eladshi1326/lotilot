import React, { useEffect, useState } from 'react';
import { GAMES_UI, SUITS_UI } from '../games.js';
import { PickView } from './GamePieces.jsx';

const cache = {}; // לכל משחק — נטען פעם אחת לביקור

const PAGE = 50;

export default function History({ game }) {
  const [data, setData] = useState(cache[game] || null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [query, setQuery] = useState('');

  useEffect(() => {
    setShown(PAGE);
    setQuery('');
    setFailed(false);
    setData(cache[game] || null);
    if (cache[game]) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/draws?game=' + encodeURIComponent(game));
        const d = await res.json();
        if (!res.ok || !d || !Array.isArray(d.draws)) throw new Error('bad data');
        cache[game] = d;
        if (alive) setData(d);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [game]);

  const ui = GAMES_UI[game];

  if (failed) return <p className="board-empty">לא הצלחתי לטעון את ההיסטוריה כרגע 😕</p>;
  if (!data) return <p className="board-empty">טוען את היסטוריית ה{ui.name}...</p>;
  if (!data.draws || data.draws.length === 0) {
    return (
      <p className="board-empty">
        אין עדיין נתוני {ui.name} — הם יורדים אוטומטית מהאתר של מפעל הפיס בעדכון הבא.
      </p>
    );
  }

  const latest = data.draws[0];
  const q = query.trim();
  const list = q
    ? data.draws.filter((d) => String(d.id).includes(q) || d.date.includes(q))
    : data.draws;

  return (
    <section className="history-section">
      <div className="latest-draw">
        <h2>הגרלת {ui.name} האחרונה — מס' {latest.id}</h2>
        <p className="latest-date">{latest.date}</p>
        <PickView game={game} numbers={latest.numbers} strong={latest.strong} revealed={true} />
        {game === '777' ? <p className="ticket-note">אלה 17 המספרים שהוגרלו — שחקן מסמן 7 ובודק כמה מהם פגעו</p> : null}
      </div>

      <div className="history-controls">
        <input
          className="name-input"
          type="text"
          placeholder="חיפוש לפי מספר הגרלה או תאריך..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
        />
        <span className="history-count">{list.length} הגרלות</span>
      </div>

      <div className="table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>הגרלה</th>
              <th>תאריך</th>
              {game === 'chance'
                ? SUITS_UI.map((s) => (
                    <th key={s.key} className={s.red ? 'suit-red' : ''}>{s.symbol} {s.name}</th>
                  ))
                : game === '123'
                  ? [<th key="n">המספר</th>, <th key="p">סך הפרסים</th>]
                  : game === '777'
                    ? [<th key="n">17 המספרים שהוגרלו</th>, <th key="w">זוכי פרס ראשון</th>]
                    : [<th key="n">המספרים</th>, <th key="s">חזק</th>, <th key="w">זוכים</th>]}
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((d) => (
              <tr key={d.id + '-' + d.date}>
                <td className="td-id">{d.id}</td>
                <td>{d.date}</td>
                {game === 'chance' ? (
                  d.numbers.map((c, i) => (
                    <td key={i} className={'td-card' + (SUITS_UI[i].red ? ' suit-red' : '')}>{c}</td>
                  ))
                ) : game === '123' ? (
                  <>
                    <td className="td-nums big">{d.numbers.join(' ')}</td>
                    <td>{d.totalPrizes == null ? '—' : d.totalPrizes.toLocaleString('he-IL') + ' ₪'}</td>
                  </>
                ) : game === '777' ? (
                  <>
                    <td className="td-nums small">{d.numbers.join(' · ')}</td>
                    <td>{d.winners == null ? '—' : d.winners}</td>
                  </>
                ) : (
                  <>
                    <td className="td-nums">{d.numbers.join(' · ')}</td>
                    <td className="td-strong">{d.strong ?? '—'}</td>
                    <td>{d.winners == null ? '—' : d.winners}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shown < list.length ? (
        <button className="more-btn" onClick={() => setShown(shown + PAGE)}>
          טען עוד ({list.length - shown} נוספות)
        </button>
      ) : null}

      <p className="history-src">
        מקור הנתונים: מפעל הפיס
        {data.updatedAt ? ' · עודכן לאחרונה: ' + new Date(data.updatedAt).toLocaleString('he-IL') : ''}
        {' '}· {ui.schedule}
      </p>
    </section>
  );
}
