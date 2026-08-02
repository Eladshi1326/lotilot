import React, { useEffect, useRef, useState } from 'react';
import { GAMES_UI, formatMoney, formatSigned, todayDrawTimes, timePassed } from '../games.js';
import { PickView, emptyNumbers, randomDisplay } from './GamePieces.jsx';
import Countdown from './Countdown.jsx';
import Scoreboard, { Versus } from './Scoreboard.jsx';

const SPIN_MS = 1600;
const SPIN_TICK = 90;

function timeStr(ts) {
  return new Date(ts).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// תוויות המקומות בטבלת הזכיות הרשמית
const TIER_LABEL = {
  lotto: { '6+s': '6 + חזק', '6': '6 מספרים', '5+s': '5 + חזק', '5': '5 מספרים', '4+s': '4 + חזק', '4': '4 מספרים', '3+s': '3 + חזק', '3': '3 מספרים' },
  '777': { '7': '7 פגיעות', '6': '6 פגיעות', '5': '5 פגיעות', '4': '4 פגיעות', '3': '3 פגיעות', '0': '0 פגיעות' }
};

function PickTile({ pick, mine }) {
  const cls =
    'tile' + (mine ? ' mine' : '') + (pick.isAi ? ' ai' : '') +
    (pick.status === 'won' ? ' won' : pick.status === 'lost' ? ' lost' : '');
  return (
    <div className={cls}>
      <div className="tile-head">
        <span className="tile-name">{pick.isAi ? '🧠 ' : ''}{pick.name || 'משתתף #' + pick.id}</span>
        {mine ? <span className="tag me">אתה</span> : null}
      </div>
      <PickView game={pick.game} numbers={pick.numbers} strong={pick.strong} size="sm" />
      <div className="tile-foot">
        {pick.status === 'pending' ? (
          <span className="tile-pending">ממתין להגרלה</span>
        ) : pick.prize > 0 ? (
          <span className="tile-win">🎉 {pick.label} · {formatMoney(pick.prize)}</span>
        ) : (
          <span className="tile-lose">לא זכה</span>
        )}
        <span className="tile-time">{timeStr(pick.ts)}</span>
      </div>
    </div>
  );
}

// טבלת הזכיות הרשמית של ההגרלה — כמה זכו בכל מקום ובכמה
function PrizeTable({ game, prizes }) {
  if (!prizes || !prizes.length) return null;
  const labels = TIER_LABEL[game] || {};
  return (
    <div className="prize-table">
      <div className="pt-title">🏆 טבלת הזכיות הרשמית</div>
      <div className="pt-rows">
        {prizes.map((t) => (
          <div className={'pt-row' + (t.winners > 0 ? '' : ' empty')} key={t.key}>
            <span className="pt-tier">{labels[t.key] || t.key}</span>
            <span className="pt-winners">{(t.winners || 0).toLocaleString('he-IL')} זוכים</span>
            <span className="pt-amount">{t.prize > 0 ? formatMoney(t.prize) : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawRow({ row, game, myPickId }) {
  const [open, setOpen] = useState(false);
  const winners = row.picks.filter((p) => p.prize > 0);
  const hasDetail = row.picks.length > 0 || (row.prizes && row.prizes.length);
  return (
    <div className={'draw-row' + (row.finished ? '' : ' open-draw')}>
      <button className="draw-head" onClick={() => setOpen(!open)} disabled={!hasDetail}>
        <span className="draw-left">
          <span className="draw-id">{row.finished ? 'הגרלה' : 'הבאה'} <b>{row.drawId}</b></span>
          {row.date ? <span className="draw-date">{row.date}</span> : null}
        </span>

        <span className="draw-nums">
          {row.finished ? (
            <PickView game={game} numbers={row.numbers} strong={row.strong} size="sm" />
          ) : (
            <span className="draw-waiting">טרם התקיימה</span>
          )}
        </span>

        <span className="draw-right">
          {row.picks.length > 0 ? (
            <span className={'draw-count' + (winners.length ? ' has-win' : '')}>
              {row.picks.length} כרטיסים{winners.length ? ' · ' + winners.length + ' זכו 🎉' : ''}
            </span>
          ) : (
            <span className="draw-count dim">אף אחד לא שיחק</span>
          )}
          {hasDetail ? <span className="draw-arrow">{open ? '▲' : '▼'}</span> : null}
        </span>
      </button>

      {open ? (
        <div className="draw-detail">
          {row.picks.length > 0 ? (
            <div className="draw-picks">
              {row.picks.map((p) => <PickTile key={p.id} pick={p} mine={p.id === myPickId} />)}
            </div>
          ) : null}
          <PrizeTable game={game} prizes={row.prizes} />
        </div>
      ) : null}
    </div>
  );
}

// המאזן שלי — כמה זכיתי, בכמה זכיות, וכמה יצא בסך הכל
function MyMoney({ me, myWins, gameName }) {
  if (!me || me.tickets === 0) return null;
  const wins = (myWins || []).slice(0, 8);
  return (
    <section className="card-block">
      <h3 className="block-title">🧾 המאזן שלי</h3>
      <div className="money-row">
        <div className="money-box"><span className="mb-label">כרטיסים</span><span className="mb-val">{me.tickets}</span></div>
        <div className="money-box"><span className="mb-label">הוצאתי</span><span className="mb-val neg">{formatMoney(me.spent)}</span></div>
        <div className="money-box"><span className="mb-label">זכיתי</span><span className="mb-val pos">{formatMoney(me.won)}</span></div>
        <div className="money-box big">
          <span className="mb-label">מאזן</span>
          <span className={'mb-val ' + (me.net >= 0 ? 'pos' : 'neg')}>{formatSigned(me.net)}</span>
        </div>
      </div>
      {wins.length > 0 ? (
        <div className="wins-list">
          <div className="wins-title">הזכיות שלי ({me.wins}):</div>
          {wins.map((w, i) => (
            <div className="win-line" key={i}>
              <span className="wl-game">{GAMES_UI[w.game].emoji} {GAMES_UI[w.game].name}</span>
              <span className="wl-draw">הגרלה {w.drawId}</span>
              <span className="wl-label">{w.label}</span>
              <span className="wl-prize">+{formatMoney(w.prize)}</span>
            </div>
          ))}
          <div className="win-line total">
            <span className="wl-label">סך הכל זכיות</span>
            <span className="wl-prize">{formatMoney(me.won)}</span>
          </div>
        </div>
      ) : (
        <p className="dim-note">עדיין לא זכית — {gameName} עוד לפנינו 🤞</p>
      )}
    </section>
  );
}

export default function GameView({ game, state, nextInfo, now, clientId, onSubmitted, loading }) {
  const ui = GAMES_UI[game];
  const [spinning, setSpinning] = useState(false);
  const [display, setDisplay] = useState({ numbers: emptyNumbers(game), strong: null });
  const [name, setName] = useState(() => localStorage.getItem('lotilot_name') || '');
  const [error, setError] = useState('');
  const [justWon, setJustWon] = useState(false);
  const spinTimer = useRef(null);
  const busyRef = useRef(false); // מונע שליחה כפולה גם בלחיצות מהירות

  useEffect(() => () => clearInterval(spinTimer.current), []);
  useEffect(() => {
    clearInterval(spinTimer.current);
    busyRef.current = false;
    setSpinning(false);
    setError('');
    setJustWon(false);
    setDisplay({ numbers: emptyNumbers(game), strong: null });
  }, [game]);

  const myPick = state && state.myPick;

  async function submit() {
    if (busyRef.current || spinning || myPick || !state) return;
    busyRef.current = true;
    setError('');
    setSpinning(true);
    if (name) localStorage.setItem('lotilot_name', name);
    spinTimer.current = setInterval(() => setDisplay(randomDisplay(game)), SPIN_TICK);
    const started = Date.now();
    try {
      const res = await fetch('/api/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, name, game, drawId: state.drawId })
      });
      const data = await res.json();
      if (!data.pick) throw new Error(data.error || 'error');
      const wait = Math.max(0, SPIN_MS - (Date.now() - started));
      setTimeout(() => {
        clearInterval(spinTimer.current);
        setSpinning(false);
        setJustWon(true);
        busyRef.current = false;
        onSubmitted();
      }, wait);
    } catch {
      clearInterval(spinTimer.current);
      setSpinning(false);
      busyRef.current = false;
      setDisplay({ numbers: emptyNumbers(game), strong: null });
      setError('משהו השתבש, נסה שוב עוד רגע 🙈');
      onSubmitted();
    }
  }

  const price = state ? state.price : 0;
  const shown = myPick || display;
  const perDay = state ? state.drawsPerDay : 1;
  const times = todayDrawTimes(game);

  return (
    <div className={'game-view g-' + game}>
      <Countdown game={game} nextInfo={nextInfo[game]} now={now} />

      <section className={'play-card g-' + game + (myPick ? ' filled' : '') + (spinning ? ' spinning' : '')}>
        <div className="play-head">
          <div>
            <h2 className="play-title">{ui.emoji} {ui.name} — הגרלה {state ? state.drawId : '...'}</h2>
            <p className="play-sub">
              {ui.desc}
              {times.length > 0 ? (
                <span className="times-row">
                  <span className="times-label">
                    הגרלות היום{times.length > 1 ? ' (' + times.length + ')' : ''}:
                  </span>
                  {times.map((t) => (
                    <span className={'time-chip' + (timePassed(t) ? ' done' : '')} key={t}>{t}</span>
                  ))}
                  {perDay > 1 ? <span className="times-note">לכל הגרלה כרטיס נפרד</span> : null}
                </span>
              ) : null}
            </p>
          </div>
          <div className="price-tag">
            <span className="price-num">{formatMoney(price)}</span>
            <span className="price-note">{state ? state.priceNote : 'לכרטיס'}</span>
          </div>
        </div>

        <div className="play-body">
          {loading ? (
            <p className="dim-note">טוען...</p>
          ) : myPick ? (
            <>
              <p className="play-owner">
                {myPick.name || 'הכרטיס שלך'} — {justWon ? 'הכרטיס שלך להגרלה הזו! 🎉' : 'כבר יש לך כרטיס בהגרלה הזו ✓'}
              </p>
              <PickView game={game} numbers={shown.numbers} strong={shown.strong} revealed={justWon} />
              <p className="dim-note">
                שילמת {formatMoney(myPick.cost)} · {myPick.status === 'pending'
                  ? 'מחכים לתוצאות'
                  : myPick.prize > 0 ? '🎉 זכית ' + formatMoney(myPick.prize) : 'הפעם לא זכית'}
                {perDay > 1 ? ' · כרטיס נוסף ייפתח בהגרלה הבאה' : ''}
              </p>
            </>
          ) : (
            <>
              <PickView game={game} numbers={display.numbers} strong={display.strong} spinning={spinning} />
              <div className="play-controls">
                <input
                  className="name-input" type="text" maxLength={20} placeholder="כינוי (לא חובה)"
                  value={name} disabled={spinning} onChange={(e) => setName(e.target.value)}
                />
                <button className="fill-btn" onClick={submit} disabled={spinning || !state}>
                  {spinning ? 'ממלא...' : 'מלא לי כרטיס — ' + formatMoney(price)}
                </button>
              </div>
              {error ? <p className="error-note">{error}</p> : null}
            </>
          )}
          <p className="prize-hint">🏆 {ui.prizeHint}</p>
        </div>
      </section>

      {state ? <Versus me={state.me} ai={state.ai} /> : null}
      {state ? <MyMoney me={state.me} myWins={state.myWins} gameName={ui.name} /> : null}

      <section className="card-block">
        <h3 className="block-title">
          🎫 הכרטיסים להגרלה {state ? state.drawId : ''}
          <span className="live-dot" title="מתעדכן חי"></span>
        </h3>
        {state && state.currentPicks.length > 0 ? (
          <div className="tiles">
            {state.currentPicks.map((p) => (
              <PickTile key={p.id} pick={p} mine={myPick && p.id === myPick.id} />
            ))}
          </div>
        ) : (
          <p className="dim-note center">עדיין אין כרטיסים להגרלה הזו — תהיה הראשון! 🚀</p>
        )}
      </section>

      <section className="card-block">
        <h3 className="block-title">📜 הגרלות אחרונות ומי זכה</h3>
        {state && state.timeline.length > 0 ? (
          <div className="draws">
            {state.timeline.map((row) => (
              <DrawRow key={row.drawId} row={row} game={game} myPickId={myPick ? myPick.id : null} />
            ))}
          </div>
        ) : (
          <p className="dim-note center">טוען הגרלות...</p>
        )}
        <p className="block-note">לחיצה על הגרלה פותחת את הכרטיסים שלה ואת טבלת הזכיות הרשמית של מפעל הפיס.</p>
      </section>

      {state ? <Scoreboard rows={state.scoreboard} myName={state.me ? state.me.name : null} /> : null}

      {state && !state.prizesExact ? (
        <p className="disclaimer">
          * בלוטו סכומי הפרסים נקבעים לפי מחזור ההגרלה. כשטבלת הזכיות הרשמית של אותה הגרלה זמינה — הסכום מדויק;
          בהגרלות ישנות יותר מוצגת הערכה. בשאר המשחקים הפרסים קבועים בתקנון והחישוב תמיד מדויק.
        </p>
      ) : null}
    </div>
  );
}
