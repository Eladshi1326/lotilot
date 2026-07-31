import React, { useEffect, useState } from 'react';

let cache = null; // נטען פעם אחת לכל ביקור באתר

const PAGE = 50;

export default function History() {
  const [data, setData] = useState(cache);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (cache) return;
    (async () => {
      try {
        const res = await fetch('/api/draws');
        cache = await res.json();
        setData(cache);
      } catch {
        setFailed(true);
      }
    })();
  }, []);

  if (failed) return <p className="board-empty">לא הצלחתי לטעון את ההיסטוריה כרגע 😕</p>;
  if (!data) return <p className="board-empty">טוען את היסטוריית ההגרלות...</p>;
  if (!data.draws || data.draws.length === 0) {
    return (
      <p className="board-empty">
        אין עדיין נתוני הגרלות — הם יורדים אוטומטית מהאתר של מפעל הפיס בהפעלה הבאה עם חיבור לאינטרנט.
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
        <h2>ההגרלה האחרונה — מס' {latest.id}</h2>
        <p className="latest-date">{latest.date}</p>
        <div className="balls-row revealed">
          {latest.numbers.map((n, i) => (
            <span className="ball" key={i} style={{ animationDelay: (i * 0.08) + 's' }}>{n}</span>
          ))}
          <span className="ball strong" style={{ animationDelay: '0.48s' }}>{latest.strong}</span>
        </div>
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
              <th>המספרים</th>
              <th>חזק</th>
              <th>זוכים</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, shown).map((d) => (
              <tr key={d.id + '-' + d.date}>
                <td className="td-id">{d.id}</td>
                <td>{d.date}</td>
                <td className="td-nums">{d.numbers.join(' · ')}</td>
                <td className="td-strong">{d.strong ?? '—'}</td>
                <td>{d.winners == null ? '—' : d.winners}</td>
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
        {' '}· הנתונים מתעדכנים אוטומטית בכל הפעלה של האתר
      </p>
    </section>
  );
}
