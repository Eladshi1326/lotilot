// לוטי לוט — חישוב תוצאות וכסף: מי זכה בכמה, ומי מוביל מול המוח
import { GAMES, GAME_KEYS, evaluatePick, drawTs } from './games.mjs';

export const AI_CLIENT_ID = 'ai-brain-v1';
export const AI_NAME = 'המוח';

// מוצא את ההגרלה שכרטיס מסוים התייחס אליה
export function findDraw(draws, drawId) {
  return draws.find((d) => d.id === drawId) || null;
}

// מוסיף לכל כרטיס את תוצאת הבדיקה מול ההגרלה (אם כבר התפרסמה)
export function annotatePicks(picks, drawsByGame) {
  return picks.map((p) => {
    const draws = drawsByGame[p.game] || [];
    const draw = findDraw(draws, p.drawId);
    if (!draw) {
      return { ...p, cost: GAMES[p.game].price, status: 'pending', prize: 0, net: -GAMES[p.game].price };
    }
    const r = evaluatePick(p, draw);
    return {
      ...p,
      cost: r.cost,
      prize: r.prize,
      net: r.net,
      hits: r.hits,
      label: r.label,
      exact: r.exact,
      status: r.prize > 0 ? 'won' : 'lost',
      drawNumbers: draw.numbers,
      drawStrong: draw.strong,
      drawDate: draw.date
    };
  });
}

function emptyStats(name, clientId) {
  return {
    clientId,
    name,
    tickets: 0,
    pending: 0,
    spent: 0,
    won: 0,
    net: 0,
    wins: 0,
    bestPrize: 0,
    byGame: {}
  };
}

// לוח תוצאות: כמה כל שחקן הוציא, כמה זכה, וכמה נשאר עם
export function buildScoreboard(annotated) {
  const players = new Map();
  for (const p of annotated) {
    const key = p.clientId || 'anon-' + p.id;
    if (!players.has(key)) {
      players.set(key, emptyStats(p.name || 'משתתף #' + p.id, key));
    }
    const s = players.get(key);
    if (p.name) s.name = p.name;
    s.tickets++;
    s.spent += p.cost;
    if (p.status === 'pending') {
      s.pending++;
    } else {
      s.won += p.prize;
      if (p.prize > 0) {
        s.wins++;
        if (p.prize > s.bestPrize) s.bestPrize = p.prize;
      }
    }
    s.net = s.won - s.spent;
    if (!s.byGame[p.game]) s.byGame[p.game] = { tickets: 0, spent: 0, won: 0 };
    s.byGame[p.game].tickets++;
    s.byGame[p.game].spent += p.cost;
    s.byGame[p.game].won += p.status === 'pending' ? 0 : p.prize;
  }
  return [...players.values()].sort((a, b) => b.net - a.net || b.won - a.won);
}

// כמה כרטיסים ה"מוח" צריך למלא כדי להשלים את ההגרלות שהוחמצו
export function missingAiDraws(drawsByGame, aiPicks, openByGame, limitPerGame = 12) {
  const playedBy = {};
  for (const game of GAME_KEYS) {
    playedBy[game] = new Set(aiPicks.filter((p) => p.game === game).map((p) => p.drawId));
  }

  // קודם ההגרלה הפתוחה של כל משחק — שלמוח תמיד יהיה כרטיס במשחק הנוכחי
  const missing = [];
  for (const game of GAME_KEYS) {
    const open = openByGame && openByGame[game];
    if (Number.isFinite(open) && !playedBy[game].has(open)) {
      missing.push({ game, drawId: open });
    }
  }

  // ואז הגרלות שהסתיימו, לסירוגין בין המשחקים כדי שאף אחד לא יישאר מאחור
  const pending = {};
  for (const game of GAME_KEYS) {
    pending[game] = (drawsByGame[game] || [])
      .slice(0, limitPerGame)
      .filter((d) => !playedBy[game].has(d.id))
      .map((d) => d.id);
  }
  for (let i = 0; i < limitPerGame; i++) {
    for (const game of GAME_KEYS) {
      if (pending[game][i] !== undefined) missing.push({ game, drawId: pending[game][i] });
    }
  }
  return missing;
}

// מסדר את ההיסטוריה עם התוצאות של השחקנים לכל הגרלה
export function buildDrawTimeline(game, draws, annotated, limit = 12) {
  const byDraw = new Map();
  for (const p of annotated) {
    if (p.game !== game) continue;
    if (!byDraw.has(p.drawId)) byDraw.set(p.drawId, []);
    byDraw.get(p.drawId).push(p);
  }
  const rows = [];
  const seen = new Set();
  for (const d of draws.slice(0, limit)) {
    seen.add(d.id);
    rows.push({
      drawId: d.id,
      date: d.date,
      ts: drawTs(d.date),
      numbers: d.numbers,
      strong: d.strong,
      prizes: d.prizes || null, // טבלת הזכיות הרשמית, אם נשלפה
      finished: true,
      picks: (byDraw.get(d.id) || []).sort((a, b) => b.prize - a.prize)
    });
  }
  // הגרלות שמישהו כבר שלח אליהן כרטיס אבל התוצאה עוד לא פורסמה
  for (const [drawId, picks] of byDraw) {
    if (seen.has(drawId)) continue;
    if (picks.some((p) => p.status === 'pending')) {
      rows.unshift({
        drawId,
        date: null,
        ts: Infinity,
        numbers: null,
        strong: null,
        finished: false,
        picks
      });
    }
  }
  return rows;
}
