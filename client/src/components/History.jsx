import React, { useEffect, useRef, useState } from 'react';
import { GAMES_UI, SUITS_UI } from '../games.js';
import { PickView } from './GamePieces.jsx';

const PAGE = 10; // נטענות 10 הגרלות בכל פעם — לא אלפים

export default function History({ game }) {
  const [draws, setDraws] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const reqRef = useRef(0);

  async function load(offset, term, append) {
    const id = ++reqRef.current;
    setLoading(true);
    try {
      const url = '/api/draws?game=' + encodeURIComponent(game) +
        '&limit=' + PAGE + '&offset=' + offset +
        (term ? '&q=' + encodeURIComponent(term) : '');
      const res = await fetch(url);
      const d = await res.json();
      if (id !== reqRef.current) return; // תשובה ישנה — מתעלמים
      if (!res.ok || !Array.isArray(d.draws)) throw new Error('bad');
      setDraws((prev) => (append ? prev.concat(d.draws) : d.draws));
      setTotal(d.total || 0);
      setTotalAll(d.totalAll || 0);
      setFailed(false);
    } catch {
      if (id === reqRef.current) setFailed(true);
    } finally {
      if (id === reqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    setDraws([]); setQuery(''); setTotal(0);
    load(0, '', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // חיפוש עם השהיה קטנה, כדי לא לשלוח בקשה על כל תו
  useEffect(() => {
    const t = setTimeout(() => load(0, query.trim(), false), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const ui = GAMES_UI[game];
  if (failed) return <p className="dim-note center">לא הצלחתי לטעון את ההיסטוריה כרגע 😕</p>;

  const latest = draws[0];

  return (
    <section className="history-section">
      {latest && !query ? (
        <div className="latest-draw">
          <h2>הגרלת {ui.name} האחרונה — מס' {latest.id}</h2>
          <p className="latest-date">{latest.date}</p>
          <PickView game={game} numbers={latest.numbers} strong={latest.strong} revealed={true} />
        </div>
      ) : null}

      <div className="history-controls">
        <input
          className="name-input" type="text"
          placeholder="חיפוש לפי מספר הגרלה או תאריך..."
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <span className="history-count">
          {query ? total.toLocaleString('he-IL') + ' תוצאות' : 'מציג ' + draws.length + ' מתוך ' + totalAll.toLocaleString('he-IL')}
        </span>
      </div>

      {draws.length === 0 && !loading ? (
        <p className="dim-note center">לא נמצאו הגרלות שמתאימות לחיפוש</p>
      ) : (
        <div className="table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>הגרלה</th>
                <th>תאריך</th>
                {game === 'chance'
                  ? SUITS_UI.map((s) => (<th key={s.key} className={s.red ? 'suit-red' : ''}>{s.symbol} {s.name}</th>))
                  : game === '123'
                    ? [<th key="n">המספר</th>, <th key="p">סך הפרסים</th>]
                    : game === '777'
                      ? [<th key="n">17 המספרים שהוגרלו</th>, <th key="w">זוכי פרס ראשון</th>]
                      : [<th key="n">המספרים</th>, <th key="s">חזק</th>, <th key="w">זוכים</th>]}
              </tr>
            </thead>
            <tbody>
              {draws.map((d) => (
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
      )}

      {draws.length < total ? (
        <button className="more-btn" onClick={() => load(draws.length, query.trim(), true)} disabled={loading}>
          {loading ? 'טוען...' : 'טען עוד 10 (נותרו ' + (total - draws.length).toLocaleString('he-IL') + ')'}
        </button>
      ) : null}

      <p className="block-note center">
        מקור הנתונים: מפעל הפיס · {ui.schedule} · נטענות 10 הגרלות בכל פעם, כדי לחסוך בנתונים
      </p>
    </section>
  );
}
