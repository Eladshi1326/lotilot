import React, { useCallback, useEffect, useRef, useState } from 'react';
import PickCard from './components/PickCard.jsx';
import Board from './components/Board.jsx';
import History from './components/History.jsx';

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
  const [picks, setPicks] = useState([]);
  const [count, setCount] = useState(0);
  const [myPick, setMyPick] = useState(null);
  const [loading, setLoading] = useState(true);
  const clientIdRef = useRef(getClientId());

  const refreshPicks = useCallback(async () => {
    try {
      const res = await fetch('/api/picks');
      const data = await res.json();
      setPicks(data.picks);
      setCount(data.count);
    } catch {
      /* השרת רגע לא זמין — ננסה שוב בסבב הבא */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/my-pick?clientId=' + encodeURIComponent(clientIdRef.current));
        const data = await res.json();
        if (data.pick) setMyPick(data.pick);
      } catch { /* לא נורא */ }
      await refreshPicks();
      setLoading(false);
    })();
    const timer = setInterval(refreshPicks, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshPicks]);

  const handlePicked = useCallback((pick) => {
    setMyPick(pick);
    refreshPicks();
  }, [refreshPicks]);

  return (
    <div className="app">
      <header className="header">
        <div className="logo-row">
          <span className="logo-ball">🎱</span>
          <h1 className="logo-text">לוטי לוט</h1>
        </div>
        <p className="tagline">הניסוי החברתי: כל אחד ממלא כרטיס רנדומלי אחד — ובודקים אם מישהו היה זוכה</p>
        <nav className="tabs">
          <button
            className={'tab-btn' + (tab === 'experiment' ? ' active' : '')}
            onClick={() => setTab('experiment')}
          >
            הניסוי
          </button>
          <button
            className={'tab-btn' + (tab === 'history' ? ' active' : '')}
            onClick={() => setTab('history')}
          >
            הגרלות אמיתיות
          </button>
        </nav>
      </header>

      {tab === 'experiment' ? (
        <main>
          <PickCard clientId={clientIdRef.current} myPick={myPick} loading={loading} onPicked={handlePicked} />
          <Board picks={picks} count={count} myPickId={myPick ? myPick.id : null} />
        </main>
      ) : (
        <main>
          <History />
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
