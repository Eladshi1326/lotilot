import React, { useEffect, useRef, useState } from 'react';
import { GAMES_UI } from '../games.js';
import { PickView, emptyNumbers, randomDisplay } from './GamePieces.jsx';

const SPIN_MS = 1700;
const SPIN_TICK = 90;

export default function PickCard({ clientId, game, myPick, loading, onPicked }) {
  const [name, setName] = useState(() => localStorage.getItem('lotilot_name') || '');
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState({ numbers: emptyNumbers(game), strong: null });
  const [justRevealed, setJustRevealed] = useState(false);
  const [error, setError] = useState('');
  const spinTimer = useRef(null);

  useEffect(() => () => clearInterval(spinTimer.current), []);

  // איפוס תצוגה במעבר משחק
  useEffect(() => {
    clearInterval(spinTimer.current);
    setSpinning(false);
    setJustRevealed(false);
    setError('');
    setDisplay({ numbers: emptyNumbers(game), strong: null });
  }, [game]);

  async function handleClick() {
    if (spinning || myPick) return;
    setError('');
    setSpinning(true);
    if (name) localStorage.setItem('lotilot_name', name);
    spinTimer.current = setInterval(() => setDisplay(randomDisplay(game)), SPIN_TICK);

    const started = Date.now();
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name, game })
      });
      const data = await res.json();
      const pick = data.pick;
      if (!pick || !Array.isArray(pick.numbers)) throw new Error(data.error || 'server error');

      const wait = Math.max(0, SPIN_MS - (Date.now() - started));
      setTimeout(() => {
        clearInterval(spinTimer.current);
        setSpinning(false);
        setJustRevealed(true);
        onPicked(game, pick);
      }, wait);
    } catch {
      clearInterval(spinTimer.current);
      setSpinning(false);
      setDisplay({ numbers: emptyNumbers(game), strong: null });
      setError('משהו השתבש, נסה שוב עוד רגע 🙈');
    }
  }

  const ui = GAMES_UI[game];
  const filled = Boolean(myPick);
  const shown = filled ? myPick : display;

  return (
    <section className="pick-section">
      <div className={'ticket g-' + game + (filled ? ' filled' : '') + (spinning ? ' is-spinning' : '')}>
        <div className="ticket-head">
          <span>{ui.emoji} לוטי לוט · {ui.name}</span>
          <span className="ticket-no">{filled ? 'כרטיס #' + myPick.id : 'טרם מולא'}</span>
        </div>

        <div className="ticket-body">
          {loading ? (
            <p className="ticket-note">רק רגע, בודק אם כבר יש לך כרטיס...</p>
          ) : filled ? (
            <>
              <p className="ticket-owner">
                {myPick.name ? myPick.name : 'משתתף #' + myPick.id}
                {justRevealed ? ' — זה הכרטיס שלך! 🎉' : ' — הכרטיס שלך'}
              </p>
              <PickView game={game} numbers={shown.numbers} strong={shown.strong} spinning={false} revealed={justRevealed} />
              <p className="ticket-note">
                הכרטיס נשמר ומוצג לכולם למטה. אפשר לעבור למשחק אחר ולמלא גם שם 😉
              </p>
            </>
          ) : (
            <>
              <PickView game={game} numbers={shown.numbers} strong={shown.strong} spinning={spinning} revealed={false} />
              <p className="ticket-desc">{ui.desc}</p>
              <div className="fill-controls">
                <input
                  className="name-input"
                  type="text"
                  maxLength={20}
                  placeholder="כינוי (לא חובה)"
                  value={name}
                  disabled={spinning}
                  onChange={(e) => setName(e.target.value)}
                />
                <button className="fill-btn" onClick={handleClick} disabled={spinning}>
                  {spinning ? 'ממלא...' : 'מלא לי כרטיס! 🎲'}
                </button>
              </div>
              <p className="ticket-note">לחיצה אחת לכל משחק — הבחירה רנדומלית לגמרי ואי אפשר לשנות אותה.</p>
              {error ? <p className="error-note">{error}</p> : null}
            </>
          )}
        </div>

        <div className="ticket-barcode" aria-hidden="true"></div>
      </div>
    </section>
  );
}
