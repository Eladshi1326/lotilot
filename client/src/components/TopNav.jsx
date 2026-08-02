import React from 'react';
import { GAME_KEYS, GAMES_UI } from '../games.js';
import { MiniTimer } from './Countdown.jsx';

// תפריט עליון דביק — נשאר למעלה בזמן גלילה
export default function TopNav({ game, setGame, nextInfo, now, myTickets }) {
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <div className="brand">
          <span className="brand-ball">🎱</span>
          <span className="brand-name">לוטי לוט</span>
        </div>

        <nav className="nav-games">
          {GAME_KEYS.map((k) => (
            <button
              key={k}
              className={'nav-game g-' + k + (game === k ? ' active' : '')}
              onClick={() => setGame(k)}
              title={GAMES_UI[k].schedule}
            >
              <span className="nav-emoji">{GAMES_UI[k].emoji}</span>
              <span className="nav-text">
                <span className="nav-name">{GAMES_UI[k].name}</span>
                <MiniTimer game={k} info={nextInfo[k]} now={now} />
              </span>
              {myTickets && myTickets[k] ? <span className="nav-dot" title="יש לך כרטיס בהגרלה הזו">●</span> : null}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
