import React, { useEffect, useRef, useState } from 'react';

const SPIN_MS = 1700;
const SPIN_TICK = 90;

function randomDisplay() {
  const pool = Array.from({ length: 37 }, (_, i) => i + 1);
  const nums = [];
  for (let i = 0; i < 6; i++) {
    nums.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  nums.sort((a, b) => a - b);
  return { numbers: nums, strong: 1 + Math.floor(Math.random() * 7) };
}

function Balls({ numbers, strong, spinning, revealed }) {
  return (
    <div className={'balls-row' + (spinning ? ' spinning' : '') + (revealed ? ' revealed' : '')}>
      {numbers.map((n, i) => (
        <span className="ball" style={{ animationDelay: (i * 0.08) + 's' }} key={i}>
          {n === null ? '?' : n}
        </span>
      ))}
      <span className="ball strong" style={{ animationDelay: '0.48s' }}>
        {strong === null ? '?' : strong}
      </span>
    </div>
  );
}

export default function PickCard({ clientId, myPick, loading, onPicked }) {
  const [name, setName] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState({ numbers: [null, null, null, null, null, null], strong: null });
  const [justRevealed, setJustRevealed] = useState(false);
  const [error, setError] = useState('');
  const spinTimer = useRef(null);

  useEffect(() => () => clearInterval(spinTimer.current), []);

  async function handleClick() {
    if (spinning || myPick) return;
    setError('');
    setSpinning(true);
    spinTimer.current = setInterval(() => setDisplay(randomDisplay()), SPIN_TICK);

    const started = Date.now();
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name })
      });
      const data = await res.json();
      const pick = data.pick;
      if (!pick) throw new Error(data.error || 'server error');

      const wait = Math.max(0, SPIN_MS - (Date.now() - started));
      setTimeout(() => {
        clearInterval(spinTimer.current);
        setSpinning(false);
        setJustRevealed(true);
        onPicked(pick);
      }, wait);
    } catch (err) {
      clearInterval(spinTimer.current);
      setSpinning(false);
      setDisplay({ numbers: [null, null, null, null, null, null], strong: null });
      setError('משהו השתבש, נסה שוב עוד רגע 🙈');
    }
  }

  const filled = Boolean(myPick);
  const shown = filled ? myPick : display;

  return (
    <section className="pick-section">
      <div className={'ticket' + (filled ? ' filled' : '') + (spinning ? ' is-spinning' : '')}>
        <div className="ticket-head">
          <span>לוטי לוט · כרטיס דיגיטלי</span>
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
              <Balls numbers={shown.numbers} strong={shown.strong} spinning={false} revealed={justRevealed} />
              <p className="ticket-note">
                המספרים נשמרו ומוצגים לכולם למטה. עכשיו נשאר רק לחכות ולראות אם היית זוכה 😉
              </p>
            </>
          ) : (
            <>
              <Balls numbers={shown.numbers} strong={shown.strong} spinning={spinning} revealed={false} />
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
              <p className="ticket-note">לחיצה אחת — המספרים נבחרים רנדומלית לגמרי, ואי אפשר לשנות אותם.</p>
              {error ? <p className="error-note">{error}</p> : null}
            </>
          )}
        </div>

        <div className="ticket-barcode" aria-hidden="true"></div>
      </div>
    </section>
  );
}
