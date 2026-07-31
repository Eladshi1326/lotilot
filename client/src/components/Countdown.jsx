import React from 'react';
import { GAMES_UI, computeNextLottoClose, parseNextDate, formatMoney } from '../games.js';

const pad = (n) => String(n).padStart(2, '0');

// מחשב את מועד היעד: קודם מה שהתקבל מהפיס, ואם עבר/חסר — חישוב עצמאי (לוטו)
export function resolveTarget(game, info, now) {
  let target = info ? parseNextDate(info.date, info.time) : null;
  let estimated = false;
  if ((!target || target.getTime() <= now) && game === 'lotto') {
    const computed = computeNextLottoClose(new Date(now));
    if (computed) {
      target = computed;
      estimated = true;
    }
  }
  if (!target || target.getTime() <= now) return { target: null, estimated };
  return { target, estimated };
}

export function splitDiff(ms) {
  let d = Math.floor(ms / 1000);
  const days = Math.floor(d / 86400); d -= days * 86400;
  const hours = Math.floor(d / 3600); d -= hours * 3600;
  const mins = Math.floor(d / 60);
  return { days, hours, mins, secs: d - mins * 60 };
}

// שעון קטן לטאב של כל משחק
export function MiniTimer({ game, info, now }) {
  const { target } = resolveTarget(game, info, now);
  if (!target) return <span className="mini-timer soon">בקרוב</span>;
  const { days, hours, mins, secs } = splitDiff(target.getTime() - now);
  return (
    <span className="mini-timer" dir="ltr">
      {/* bdi מבודד את סימון הימים בעברית כדי שהשעון לא יתהפך */}
      {days > 0 ? <bdi className="mt-days">{days} {days === 1 ? 'יום' : 'ימים'}</bdi> : null}
      <span className="mt-clock">{pad(hours)}:{pad(mins)}:{pad(secs)}</span>
    </span>
  );
}

export default function Countdown({ game, nextInfo, now }) {
  const info = nextInfo || null;
  const { target, estimated } = resolveTarget(game, info, now);

  if (!target) {
    return (
      <div className="countdown">
        <span className="cd-label">{GAMES_UI[game].schedule}</span>
      </div>
    );
  }

  const { days, hours, mins, secs } = splitDiff(target.getTime() - now);
  const drawNumber = !estimated && info && info.drawNumber ? info.drawNumber : null;
  const approx = info && info.estimated;
  const prize = !estimated && info ? formatMoney(info.firstPrize) : null;

  return (
    <div className={'countdown g-' + game}>
      <span className="cd-label">
        {GAMES_UI[game].emoji} סגירת המכירה{' '}
        {drawNumber ? (
          <>
            להגרלה מס׳ <b className="cd-draw">{approx ? '~' : ''}{drawNumber}</b>
          </>
        ) : (
          'להגרלה הבאה'
        )}{' '}
        בעוד:
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
