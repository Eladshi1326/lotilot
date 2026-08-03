import React, { useEffect, useState } from 'react';
import { GAME_KEYS, GAMES_UI, AI_EXPLAIN, formatMoney, formatSigned } from '../games.js';
import { FormView } from './GamePieces.jsx';

// ההיסטוריה המלאה של המוח — כל כרטיס שהוא מילא, מה יצא בהגרלה, וכמה כסף זז
export default function BrainHistory({ game, setGame }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(15);

  useEffect(() => {
    let alive = true;
    setData(null);
    setFailed(false);
    setShown(15);
    (async () => {
      try {
        const res = await fetch('/api/brain?game=' + encodeURIComponent(game));
        const d = await res.json();
        if (!res.ok || !d || !Array.isArray(d.picks)) throw new Error('bad');
        if (alive) setData(d);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [game]);

  const ui = GAMES_UI[game];

  return (
    <div className="brain-page">
      <section className="card-block brain">
        <h3 className="block-title">🧠 המוח — כל ההיסטוריה</h3>
        <p className="ai-explain">{AI_EXPLAIN}</p>

        {failed ? <p className="board-empty">לא הצלחתי לטעון כרגע 😕</p> : null}
        {!data && !failed ? <p className="board-empty">טוען את ההיסטוריה של המוח...</p> : null}

        {data && data.overall ? (
          <>
            <div className="money-row">
              <div className="money-box"><span className="mb-label">כרטיסים</span><span className="mb-val">{data.overall.tickets}</span></div>
              <div className="money-box"><span className="mb-label">הוציא</span><span className="mb-val neg">{formatMoney(data.overall.spent)}</span></div>
              <div className="money-box"><span className="mb-label">זכה</span><span className="mb-val pos">{formatMoney(data.overall.won)}</span></div>
              <div className="money-box big">
                <span className="mb-label">מאזן כולל</span>
                <span className={'mb-val ' + (data.overall.net >= 0 ? 'pos' : 'neg')}>{formatSigned(data.overall.net)}</span>
              </div>
            </div>
            {data.overall.bestPrize > 0 ? (
              <p className="brain-best">
                🏆 הזכייה הכי גדולה שלו: <b>{formatMoney(data.overall.bestPrize)}</b>
                {data.overall.bestLabel ? ' — ' + data.overall.bestLabel : ''}
                {data.overall.bestGame && GAMES_UI[data.overall.bestGame]
                  ? ' ב' + GAMES_UI[data.overall.bestGame].name : ''}
              </p>
            ) : null}
          </>
        ) : null}

        {data ? (
          <div className="brain-bygame">
            {GAME_KEYS.map((k) => {
              const g = data.byGame[k];
              if (!g || g.tickets === 0) return null;
              return (
                <button
                  key={k}
                  className={'bg-chip' + (k === game ? ' active' : '')}
                  onClick={() => setGame(k)}
                  type="button"
                >
                  <span className="bg-name">{GAMES_UI[k].emoji} {GAMES_UI[k].name}</span>
                  <span className={'bg-net ' + (g.net >= 0 ? 'pos' : 'neg')}>{formatSigned(g.net)}</span>
                  <span className="bg-sub">{g.tickets} כרטיסים · {g.wins} זכיות</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      {data ? (
        <section className="card-block">
          <h3 className="block-title">🎫 הכרטיסים שלו ב{ui.name} — מהחדש לישן</h3>
          {data.picks.length === 0 ? (
            <p className="dim-note center">המוח עוד לא שיחק ב{ui.name}.</p>
          ) : (
            <div className="brain-history">
              {data.picks.slice(0, shown).map((p) => (
                <div className={'bh-row' + (p.prize > 0 ? ' won' : p.status === 'pending' ? ' pending' : '')} key={p.id}>
                  <div className="bh-head">
                    <span className="bh-draw">הגרלה {p.drawId}</span>
                    <span className="bh-date">{p.drawDate || 'טרם התקיימה'}</span>
                    <span className={'bh-money ' + (p.status === 'pending' ? '' : p.prize > 0 ? 'pos' : 'neg')}>
                      {p.status === 'pending' ? '⏳ ממתין' : formatSigned(p.net)}
                    </span>
                  </div>
                  <FormView game={game} pick={p} size="sm" />
                  <div className="bh-foot">
                    <span>שילם {formatMoney(p.cost)}</span>
                    <span>
                      {p.status === 'pending'
                        ? 'מחכה לתוצאות'
                        : p.prize > 0
                          ? '🎉 ' + (p.label || 'זכה') + ' · ' + formatMoney(p.prize)
                          : (p.matched ? p.matched.length : 0) + ' פגיעות · לא זכה'}
                    </span>
                  </div>
                </div>
              ))}
              {shown < data.picks.length ? (
                <button className="more-btn" onClick={() => setShown(shown + 15)} type="button">
                  עוד ({data.picks.length - shown} נוספים)
                </button>
              ) : null}
            </div>
          )}
          <p className="block-note">הכדורים הירוקים הם המספרים שפגעו בתוצאה האמיתית של אותה הגרלה.</p>
        </section>
      ) : null}
    </div>
  );
}
