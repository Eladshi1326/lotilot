import React, { useEffect, useState } from 'react';
import { GAMES_UI, computeNextLottoClose, parseNextDate, formatMoney } from '../games.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function Countdown({ game, nextInfo }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const info = nextInfo || null;
  let target = info ? parseNextDate(info.date, info.time) : null;
  let usingComputed = false;

  // אם אין מידע או שהמועד עבר — ללוטו אפשר לחשב לבד (שלישי/שבת 22:45)
  if ((!target || target.getTime() <= now) && game === 'lotto') {
    const computed = computeNextLottoClose(new Date(now));
    if (computed) {
      if (!target || computed > target) usingComputed = !target || target.getTime() <= now;
      if (!target || target.getTime() <= now) target = computed;
    }
  }

  if (!target || target.getTime() <= now) {
    return (
      <div className="countdown">
        <span className="cd-label">{GAMES_UI[game].schedule}</span>
      </div>
    );
  }

  let diff = Math.floor((target.getTime() - now) / 1000);
  const days = Math.floor(diff / 86400); diff -= days * 86400;
  const hours = Math.floor(diff / 3600); diff -= hours * 3600;
  const mins = Math.floor(diff / 60);
  const secs = diff - mins * 60;

  const drawNumber = !usingComputed && info && info.drawNumber ? info.drawNumber : null;
  const prize = game === 'lotto' && !usingComputed && info ? formatMoney(info.firstPrize) : null;

  return (
    <div className="countdown">
      <span className="cd-label">
        סגירת המכירה {drawNumber ? 'להגרלה מס׳ ' + drawNumber : 'להגרלה הבאה'} בעוד:
      </span>
      <span className="cd-clock" dir="ltr">
        <span className="cd-unit"><b>{pad(days)}</b><small>ימים</small></span>
        <span className="cd-sep">:</span>
        <span className="cd-unit"><b>{pad(hours)}</b><small>שעות</small></span>
        <span className="cd-sep">:</span>
        <span className="cd-unit"><b>{pad(mins)}</b><small>דקות</small></span>
        <span className="cd-sep">:</span>
        <span className="cd-unit"><b>{pad(secs)}</b><small>שניות</small></span>
      </span>
      {prize ? <span className="cd-prize">🏆 פרס ראשון: {prize}</span> : null}
    </div>
  );
}
