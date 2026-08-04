import React, { useCallback, useEffect, useRef, useState } from 'react';
import TopNav from './components/TopNav.jsx';
import GameView from './components/GameView.jsx';
import History from './components/History.jsx';
import BrainHistory from './components/BrainHistory.jsx';
import { GAME_KEYS } from './games.js';

const STATE_POLL_MS = 20000; // רענון מתון — חוסך בקשות למסד

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

function ago(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return 'ממש עכשיו';
  if (mins < 60) return 'לפני ' + mins + ' דקות';
  if (mins < 1440) return 'לפני ' + Math.round(mins / 60) + ' שעות';
  return 'לפני ' + Math.round(mins / 1440) + ' ימים';
}

// חיווי: מתי הנתונים עודכנו, ואם הבוט האוטומטי חי
function BotStatus({ updatedAt, botUpdatedAt, now }) {
  if (!updatedAt && !botUpdatedAt) return null;

  if (botUpdatedAt) {
    const mins = Math.round((now - new Date(botUpdatedAt).getTime()) / 60000);
    // הבוט רץ סביב שעות ההגרלות (ופעם ביום סנכרון מלא), אז גם פער של
    // כמה שעות תקין. רק מעל יממה — כנראה משהו תקוע.
    const stale = mins > 26 * 60;
    return (
      <div className={'bot-status' + (stale ? ' stale' : '')}>
        🤖 הבוט משך תוצאות מהפיס <b>{ago(now - new Date(botUpdatedAt).getTime())}</b> · רץ סביב שעות ההגרלות
        {stale ? ' — נראה שהוא תקוע, כדאי לבדוק ב-Apps Script' : ''}
      </div>
    );
  }

  return (
    <div className="bot-status stale">
      🤖 הבוט האוטומטי עוד לא מותקן — הנתונים מהעדכון הידני האחרון,{' '}
      <b>{ago(now - new Date(updatedAt).getTime())}</b>
    </div>
  );
}

export default function App() {
  const [game, setGame] = useState('lotto');
  const [view, setView] = useState('play'); // play | history
  const [state, setState] = useState(null);
  const [nextInfo, setNextInfo] = useState({});
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const clientIdRef = useRef(getClientId());
  const gameRef = useRef(game);
  gameRef.current = game;

  // שעון אחד משותף לכל הטיימרים
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async (forGame) => {
    const g = forGame || gameRef.current;
    try {
      const res = await fetch(
        '/api/state?game=' + encodeURIComponent(g) + '&clientId=' + encodeURIComponent(clientIdRef.current)
      );
      const data = await res.json();
      if (res.ok && data && data.game === gameRef.current) {
        setState(data);
        if (data.next) setNextInfo(data.next);
      }
    } catch { /* ננסה שוב בסבב הבא */ }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
    // מרעננים רק כשהלשונית פתוחה בפועל — לשונית ברקע לא מבזבזת בקשות
    const t = setInterval(() => {
      if (!document.hidden) refresh();
    }, STATE_POLL_MS);
    const onShow = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [refresh]);

  useEffect(() => {
    setState(null);
    setLoading(true);
    refresh(game).then(() => setLoading(false));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // סימון על הטאבים: באילו משחקים כבר יש לי כרטיס להגרלה הפתוחה
  const myTickets = {};
  for (const k of GAME_KEYS) myTickets[k] = false;
  if (state && state.myPick) myTickets[state.game] = true;

  return (
    <div className="app">
      <TopNav game={game} setGame={setGame} nextInfo={nextInfo} now={now} myTickets={myTickets} />

      <div className="page">
        <div className="view-switch">
          <button className={'sw-btn' + (view === 'play' ? ' active' : '')} onClick={() => setView('play')}>
            🎫 המשחק
          </button>
          <button className={'sw-btn' + (view === 'brain' ? ' active' : '')} onClick={() => setView('brain')}>
            🧠 המוח
          </button>
          <button className={'sw-btn' + (view === 'history' ? ' active' : '')} onClick={() => setView('history')}>
            📜 כל ההגרלות
          </button>
        </div>

        {view === 'play' ? (
          <GameView
            game={game}
            state={state}
            nextInfo={nextInfo}
            now={now}
            clientId={clientIdRef.current}
            loading={loading}
            onSubmitted={() => refresh(game)}
            onOpenBrain={() => setView('brain')}
          />
        ) : view === 'brain' ? (
          <BrainHistory game={game} setGame={setGame} />
        ) : (
          <History game={game} />
        )}

        <BotStatus
          updatedAt={state && state.dataUpdatedAt}
          botUpdatedAt={state && state.botUpdatedAt}
          now={now}
        />

        <footer className="footer">
          <p>
            לוטי לוט הוא ניסוי חברתי בלבד — אין כאן הימור, תשלום אמיתי או פרס. המחירים והפרסים לקוחים
            מהתקנון הרשמי של מפעל הפיס, והכסף כאן הוא וירטואלי לגמרי.
          </p>
        </footer>
      </div>
    </div>
  );
}
