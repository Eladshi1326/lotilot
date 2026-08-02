import React from 'react';
import { formatMoney, formatSigned } from '../games.js';

function StatBox({ label, value, tone }) {
  return (
    <div className={'stat-box' + (tone ? ' ' + tone : '')}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

// אני מול המוח — ההשוואה המרכזית של האתר
export function Versus({ me, ai }) {
  const meNet = me ? me.net : 0;
  const aiNet = ai ? ai.net : 0;
  const leader = !me || me.tickets === 0 ? null : meNet > aiNet ? 'me' : aiNet > meNet ? 'ai' : 'tie';

  return (
    <section className="versus">
      <div className={'vs-side' + (leader === 'me' ? ' winning' : '')}>
        <span className="vs-who">🙋 אתה</span>
        {me && me.tickets > 0 ? (
          <>
            <span className={'vs-net ' + (meNet >= 0 ? 'pos' : 'neg')}>{formatSigned(meNet)}</span>
            <span className="vs-detail">
              {me.tickets} כרטיסים · הוצאת {formatMoney(me.spent)} · זכית {formatMoney(me.won)}
            </span>
          </>
        ) : (
          <span className="vs-detail">עדיין לא מילאת כרטיס</span>
        )}
      </div>

      <div className="vs-mid">
        <span className="vs-vs">VS</span>
        {leader === 'me' ? <span className="vs-badge win">אתה מוביל!</span> : null}
        {leader === 'ai' ? <span className="vs-badge lose">המוח מוביל</span> : null}
        {leader === 'tie' ? <span className="vs-badge tie">תיקו</span> : null}
      </div>

      <div className={'vs-side ai' + (leader === 'ai' ? ' winning' : '')}>
        <span className="vs-who">🧠 המוח</span>
        {ai && ai.tickets > 0 ? (
          <>
            <span className={'vs-net ' + (aiNet >= 0 ? 'pos' : 'neg')}>{formatSigned(aiNet)}</span>
            <span className="vs-detail">
              {ai.tickets} כרטיסים · הוציא {formatMoney(ai.spent)} · זכה {formatMoney(ai.won)}
            </span>
          </>
        ) : (
          <span className="vs-detail">המוח מתכונן...</span>
        )}
      </div>
    </section>
  );
}

// טבלת כל המשתתפים
export default function Scoreboard({ rows, myName }) {
  if (!rows || rows.length === 0) return null;
  return (
    <section className="card-block">
      <h3 className="block-title">💰 טבלת הכסף — כולם</h3>
      <div className="table-wrap">
        <table className="score-table">
          <thead>
            <tr>
              <th>#</th>
              <th>שחקן</th>
              <th>כרטיסים</th>
              <th>הוציא</th>
              <th>זכה</th>
              <th>מאזן</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name + i} className={r.isAi ? 'row-ai' : r.name === myName ? 'row-me' : ''}>
                <td className="td-rank">{i + 1}</td>
                <td className="td-name">
                  {r.isAi ? '🧠 ' : ''}
                  {r.name}
                  {r.wins > 0 ? <span className="wins-chip">{r.wins} זכיות</span> : null}
                </td>
                <td>{r.tickets}</td>
                <td className="td-money">{formatMoney(r.spent)}</td>
                <td className="td-money win">{formatMoney(r.won)}</td>
                <td className={'td-money ' + (r.net >= 0 ? 'pos' : 'neg')}>{formatSigned(r.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="block-note">
        המוח בוחר מספרים אקראיים בדיוק כמו כולם — אין לו שום יתרון. זה בדיוק מה שהניסוי בודק 😉
      </p>
    </section>
  );
}

export { StatBox };
