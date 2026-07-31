import React, { useCallback, useEffect, useRef, useState } from 'react';
import PickCard from './components/PickCard.jsx';
import Board from './components/Board.jsx';
import History from './components/History.jsx';
import Countdown from './components/Countdown.jsx';
import { GAME_KEYS, GAMES_UI } from './games.js';

const POLL_MS = 5000;

function getClientId() {
  let id = localStorage.getItem('lotilot_client_id');
  if (!id) {
    id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : 'c-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('lotilot_client_id', id);
  }
  return id;
}

export default function App() {
  const [tab, setTab] = useState('experiment');
  const [game, setGame] = useState('lotto');
  const [picks, setPicks] = useState([]);
  const [count, setCount] = useState(0);
  const [counts, setCounts] = useState({});
  const [myPicks, setMyPicks] = useState({});
  const [nextInfo, setNextInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const clientIdRef = useRef(getClientId());
  const gameRef = useRef(game);
  gameRef.current = game;

  const refreshPicks = useCallback(async (forGame) => {
    const g = forGame || gameRef.current;
    try {
      const res = await fetch('/api/picks?game=' + encodeURIComponent(g));
      const data = await res.json();
      if (res.ok && data && Array.isArray(data.picks) && gameRef.current === g) {
        setPicks(data.picks);
        setCount(typeof data.count === 'number' ? data.count : data.picks.length);
        if (data.counts) setCounts(data.counts);
      }
    } catch { /* ננסה שוב בסבב הבא */ }
  }, []);

  // טעינה ראשונית: הכרטיסים שלי + ההגרלות הבאות
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/my-picks?clientId=' + encodeURIComponent(clientIdRef.current));
        const data = await res.json();
        if (res.ok && data && data.picks && typeof data.picks === 'object') setMyPicks(data.picks);
      } catch { /* לא נורא */ }
      try {
        const res = await fetch('/api/next');
        const data = await res.json();
        if (res.ok && data && typeof data === 'object') setNextInfo(data);
      } catch { /* לא נורא */ }
      await refreshPicks();
      setLoading(false);
    })();
  }, [refreshPicks]);

  // ריענון חי של הלוח
  useEffect(() => {
    const timer = setInterval(() => refreshPicks(), POLL_MS);
    return () => clearInterval(timer);
  }, [refreshPicks]);

  // מעבר משחק — טעינה מיידית
  useEffect(() => {
    setPicks([]);
    setCount(counts[game] || 0);
    refreshPicks(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  const handlePicked = useCallback((g, pick) => {
    setMyPicks((prev) => ({ ...prev, [g]: pick }));
    refreshPicks(g);
  }, [refreshPicks]);

  const myFilled = GAME_KEYS.filter((k) => myPicks[k]).length;

  return (
    <div className="app">
      <header className="header">
        <div className="logo-row">
          <span className="logo-ball">🎱</span>
          <h1 className="logo-text">לוטי לוט</h1>
        </div>
        <p className="tagline">הניסוי החברתי: כרטיס רנדומלי אחד לכל משחק — ובודקים אם מישהו היה זוכה</p>
        <nav className="tabs">
          <button className={'tab-btn' + (tab === 'experiment' ? ' active' : '')} onClick={() => setTab('experiment')}>
            הניסוי
          </button>
          <button className={'tab-btn' + (tab === 'history' ? ' active' : '')} onClick={() => setTab('history')}>
            הגרלות אמיתיות
          </button>
        </nav>
      </header>

      <nav className="game-tabs">
        {GAME_KEYS.map((k) => (
          <button
            className={'game-btn g-' + k + (game === k ? ' active' : '')}
            onClick={() => setGame(k)}
            key={k}
          >
            <span className="game-emoji">{GAMES_UI[k].emoji}</span>
            <span className="game-name">{GAMES_UI[k].name}</span>
            <span className="game-count">
              {tab === 'experiment'
                ? (counts[k] || 0) + ' כרטיסים'
                : GAMES_UI[k].schedule.split(' ').slice(0, 3).join(' ')}
            </span>
            {myPicks[k] ? <span className="game-check">✓</span> : null}
          </button>
        ))}
      </nav>

      <Countdown game={game} nextInfo={nextInfo[game]} />

      {tab === 'experiment' ? (
        <main>
          {myFilled > 0 && myFilled < GAME_KEYS.length ? (
            <p className="fill-progress">מילאת {myFilled} מתוך {GAME_KEYS.length} כרטיסים — יש עוד! 🎯</p>
          ) : null}
          <PickCard
            clientId={clientIdRef.current}
            game={game}
            myPick={myPicks[game] || null}
            loading={loading}
            onPicked={handlePicked}
          />
          <Board game={game} picks={picks} count={count} myPickId={myPicks[game] ? myPicks[game].id : null} />
        </main>
      ) : (
        <main>
          <History game={game} />
        </main>
      )}

      <footer className="footer">
        <p>
          לוטי לוט הוא ניסוי חברתי בלבד — אין כאן הימור, תשלום או פרס. נתוני ההגרלות באדיבות האתר של מפעל הפיס.
        </p>
      </footer>
    </div>
  );
}
