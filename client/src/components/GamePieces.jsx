import React from 'react';
import { SUITS_UI } from '../games.js';

// רכיבי תצוגה משותפים לכל המשחקים — כדורים, קלפים וספרות

export function LottoBalls({ numbers, strong, spinning, revealed, size }) {
  const cls = 'balls-row' + (spinning ? ' spinning' : '') + (revealed ? ' revealed' : '');
  const ballCls = 'ball' + (size === 'sm' ? ' sm' : '');
  return (
    <div className={cls}>
      {numbers.map((n, i) => (
        <span className={ballCls} style={{ animationDelay: i * 0.08 + 's' }} key={i}>
          {n === null ? '?' : n}
        </span>
      ))}
      <span className={ballCls + ' strong'} style={{ animationDelay: '0.48s' }}>
        {strong === null || strong === undefined ? '?' : strong}
      </span>
    </div>
  );
}

export function SevenBalls({ numbers, spinning, revealed, size }) {
  const cls = 'balls-row' + (spinning ? ' spinning' : '') + (revealed ? ' revealed' : '');
  const ballCls = 'ball seven' + (size === 'sm' ? ' sm' : '');
  return (
    <div className={cls}>
      {numbers.map((n, i) => (
        <span className={ballCls} style={{ animationDelay: i * 0.07 + 's' }} key={i}>
          {n === null ? '?' : n}
        </span>
      ))}
    </div>
  );
}

export function ChanceCards({ cards, spinning, revealed, size }) {
  const cls = 'cards-row' + (spinning ? ' spinning' : '') + (revealed ? ' revealed' : '');
  return (
    <div className={cls}>
      {SUITS_UI.map((suit, i) => (
        <div
          className={'pcard' + (suit.red ? ' red' : '') + (size === 'sm' ? ' sm' : '')}
          style={{ animationDelay: i * 0.1 + 's' }}
          key={suit.key}
        >
          <span className="pcard-value">{cards[i] === null || cards[i] === undefined ? '?' : cards[i]}</span>
          <span className="pcard-suit">{suit.symbol}</span>
        </div>
      ))}
    </div>
  );
}

export function Digits({ digits, spinning, revealed, size }) {
  const cls = 'digits-row' + (spinning ? ' spinning' : '') + (revealed ? ' revealed' : '');
  return (
    <div className={cls}>
      {digits.map((d, i) => (
        <span
          className={'digit-tile' + (size === 'sm' ? ' sm' : '')}
          style={{ animationDelay: i * 0.12 + 's' }}
          key={i}
        >
          {d === null || d === undefined ? '?' : d}
        </span>
      ))}
    </div>
  );
}

// בחירת רכיב לפי משחק
export function PickView({ game, numbers, strong, spinning, revealed, size }) {
  if (game === 'chance') return <ChanceCards cards={numbers} spinning={spinning} revealed={revealed} size={size} />;
  if (game === '777') return <SevenBalls numbers={numbers} spinning={spinning} revealed={revealed} size={size} />;
  if (game === '123') return <Digits digits={numbers} spinning={spinning} revealed={revealed} size={size} />;
  return <LottoBalls numbers={numbers} strong={strong} spinning={spinning} revealed={revealed} size={size} />;
}

export function emptyNumbers(game) {
  if (game === 'chance') return [null, null, null, null];
  if (game === '777') return [null, null, null, null, null, null, null];
  if (game === '123') return [null, null, null];
  return [null, null, null, null, null, null];
}

export function randomDisplay(game) {
  const CARD_VALUES = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  if (game === 'chance') {
    return { numbers: [0, 1, 2, 3].map(() => CARD_VALUES[Math.floor(Math.random() * 8)]), strong: null };
  }
  if (game === '777') {
    const pool = Array.from({ length: 70 }, (_, i) => i + 1);
    const nums = [];
    for (let i = 0; i < 7; i++) nums.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    nums.sort((a, b) => a - b);
    return { numbers: nums, strong: null };
  }
  if (game === '123') {
    return { numbers: [0, 1, 2].map(() => Math.floor(Math.random() * 10)), strong: null };
  }
  const pool = Array.from({ length: 37 }, (_, i) => i + 1);
  const nums = [];
  for (let i = 0; i < 6; i++) nums.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  nums.sort((a, b) => a - b);
  return { numbers: nums, strong: 1 + Math.floor(Math.random() * 7) };
}
