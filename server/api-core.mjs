// לוטי לוט — הלוגיקה המשותפת של ה-API (שרת מקומי + פונקציה בענן).
// מקבלת "מחסן" (store) שיודע לקרוא ולכתוב כרטיסים, ולא מתעניינת איפה הם נשמרים.

import { GAMES, GAME_KEYS, isValidGame, drawTs, priceOf, matchedIndexes } from './games.mjs';
import { annotatePicks, buildScoreboard, buildDrawTimeline, missingAiDraws, AI_CLIENT_ID, AI_NAME } from './scoring.mjs';

const MAX_AI_BACKFILL = 12; // כמה כרטיסים המוח משלים בבת אחת, כדי לא להאט את הטעינה
const WINDOW_DRAWS = 12;    // כמה הגרלות אחורה נטענות מהמסד — שומר על שאילתות קטנות

export function cleanName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/[<>]/g, '').trim().slice(0, 20);
}

// מספר ההגרלה הפתוחה כרגע לכל משחק
export function currentDrawId(game, nextInfo, draws) {
  const latest = draws && draws[0];
  const n = nextInfo && nextInfo[game];
  let id = n && Number.isFinite(n.drawNumber) ? n.drawNumber : null;
  // אם להגרלה הזו כבר פורסמו תוצאות (המידע על ההגרלה הבאה התיישן) — עוברים לזו שאחריה
  if (latest && (id === null || id <= latest.id)) id = latest.id + 1;
  return id;
}

// מוודא שלמוח יש כרטיס להגרלה הפתוחה ולכמה הגרלות אחרונות — רק במשחק שנצפה כרגע
async function ensureAiPicks(store, drawsByGame, allPicks, openByGame, onlyGame) {
  const aiPicks = allPicks.filter((p) => p.clientId === AI_CLIENT_ID);
  const missing = missingAiDraws(drawsByGame, aiPicks, openByGame, 6)
    .filter((m) => !onlyGame || m.game === onlyGame)
    .slice(0, MAX_AI_BACKFILL);
  if (missing.length === 0) return allPicks;

  const rows = missing.map(({ game, drawId }) => {
    const d = GAMES[game].randomPick('regular');
    return { clientId: AI_CLIENT_ID, game, drawId, name: AI_NAME, numbers: d.numbers, strong: d.strong, tables: d.tables || null, variant: 'regular' };
  });
  const inserted = await store.insertMany(rows);
  return inserted && inserted.length ? allPicks.concat(inserted) : allPicks;
}

// המצב המלא של עמוד משחק — הכול בבקשה אחת
export async function buildState({ store, drawsByGame, nextInfo, game, clientId }) {
  // ההגרלה הפתוחה בכל משחק — מחושבת פעם אחת ומשמשת גם את המוח
  const openByGame = {};
  for (const key of GAME_KEYS) openByGame[key] = currentDrawId(key, nextInfo, drawsByGame[key] || []);

  // טוענים רק את חלון ההגרלות שמוצג בפועל — ולא את כל הטבלה.
  // ככה מספר השורות שנקראות נשאר קטן וקבוע, גם אחרי אלפי כרטיסים.
  const gameDraws = drawsByGame[game] || [];
  const windowIds = gameDraws.slice(0, WINDOW_DRAWS).map((d) => d.id);
  const minDrawId = windowIds.length ? Math.min(...windowIds, openByGame[game] || Infinity) : 0;

  const windowPicks = await store.picksInWindow(game, minDrawId);
  const withAi = await ensureAiPicks(store, drawsByGame, windowPicks, openByGame, game);
  const annotated = annotatePicks(withAi, drawsByGame);

  // הכרטיסים שלי בכל המשחקים — רשימה קטנה, לחישוב המאזן האישי
  const myAllRaw = clientId ? await store.picksByClient(clientId) : [];
  const myAll = annotatePicks(myAllRaw, drawsByGame);

  const drawId = openByGame[game];
  const forGame = annotated.filter((p) => p.game === game);
  const currentPicks = forGame
    .filter((p) => p.drawId === drawId)
    .sort((a, b) => b.ts - a.ts);

  const counts = { [game]: forGame.length };

  // כמה הגרלות של המשחק כבר התקיימו היום — רלוונטי במיוחד לצ'אנס (7 ביום)
  const today = new Date();
  const todayKey = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const drawsToday = (drawsByGame[game] || []).filter((d) => drawTs(d.date) === todayKey).length;

  // כל הכרטיסים שלי במשחק הזה, כולל הגרלות קודמות
  const mine = forGame.filter((p) => p.clientId === clientId).sort((a, b) => b.drawId - a.drawId);
  const myWins = myAll
    .filter((p) => p.prize > 0)
    .sort((a, b) => b.prize - a.prize)
    .map((p) => ({ game: p.game, drawId: p.drawId, label: p.label, prize: p.prize, exact: p.exact }));

  const scoreboard = buildScoreboard(annotated);
  const myBoard = buildScoreboard(myAll);
  const me = myBoard.find((s) => s.clientId === clientId) || null;
  const ai = scoreboard.find((s) => s.clientId === AI_CLIENT_ID) || null;

  return {
    game,
    price: GAMES[game].price,
    priceNote: GAMES[game].priceNote,
    prizesExact: GAMES[game].prizesExact,
    drawId,
    counts,
    windowDraws: WINDOW_DRAWS,
    totalTickets: annotated.length,
    drawsToday,
    drawsPerDay: GAMES[game].drawsPerDay || 1,
    variants: GAMES[game].variants
      ? Object.values(GAMES[game].variants).map((v) => ({ ...v }))
      : null,
    // הכרטיסים האחרונים של המוח במשחק הזה — כדי להראות מה הוא בחר ובמה הצליח
    aiPicks: forGame
      .filter((p) => p.clientId === AI_CLIENT_ID)
      .sort((a, b) => b.drawId - a.drawId)
      .slice(0, 8)
      .map(publicPick),
    myPick: currentPicks.find((p) => p.clientId === clientId) || null,
    myPicks: mine.slice(0, 12).map(publicPick),
    myWins,
    currentPicks: currentPicks.map(publicPick),
    timeline: buildDrawTimeline(game, drawsByGame[game] || [], forGame, 10).map((row) => ({
      ...row,
      picks: row.picks.map(publicPick)
    })),
    scoreboard: scoreboard.slice(0, 30).map(publicStats),
    me: me ? publicStats(me) : null,
    ai: ai ? publicStats(ai) : null,
    aiClientId: AI_CLIENT_ID
  };
}

// מה שנחשף החוצה — בלי לזלוג מזהים של משתמשים אחרים
function publicPick(p) {
  return {
    id: p.id,
    game: p.game,
    variant: p.variant || 'regular',
    tables: p.tables || null,
    matched: p.matched || [],
    matchedTables: p.matchedTables || null,
    perTable: p.perTable || null,
    drawId: p.drawId,
    name: p.name,
    numbers: p.numbers,
    strong: p.strong,
    ts: p.ts,
    cost: p.cost,
    prize: p.prize,
    net: p.net,
    hits: p.hits,
    label: p.label,
    exact: p.exact,
    status: p.status,
    isAi: p.clientId === AI_CLIENT_ID,
    mine: false // מסומן בצד הלקוח לפי הכרטיס שלי
  };
}

function publicStats(s) {
  return {
    name: s.name,
    tickets: s.tickets,
    pending: s.pending,
    spent: Math.round(s.spent * 100) / 100,
    won: Math.round(s.won * 100) / 100,
    net: Math.round(s.net * 100) / 100,
    wins: s.wins,
    bestPrize: s.bestPrize,
    bestLabel: s.bestLabel || null,
    bestGame: s.bestGame || null,
    isAi: s.clientId === AI_CLIENT_ID,
    clientId: s.clientId === AI_CLIENT_ID ? AI_CLIENT_ID : undefined
  };
}

// מילוי כרטיס להגרלה מסוימת
export async function submitPick({ store, drawsByGame, nextInfo, body }) {
  const clientId = body && body.clientId;
  let { name, game, drawId, variant } = body || {};
  if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
    return { status: 400, data: { error: 'bad clientId' } };
  }
  if (!game) game = 'lotto';
  if (!isValidGame(game)) return { status: 400, data: { error: 'bad game' } };
  const variants = GAMES[game].variants;
  if (!variants || !variant || !variants[variant]) variant = 'regular';

  const openDraw = currentDrawId(game, nextInfo, drawsByGame[game] || []);
  // אפשר למלא רק להגרלה הפתוחה — לא לאחורה
  if (!Number.isFinite(drawId)) drawId = openDraw;
  if (drawId !== openDraw) {
    return { status: 409, data: { error: 'draw closed', openDraw } };
  }

  // בדיקה מפורשת — כך גם אם מגבלת הייחודיות במסד חסרה, לא ייווצר כרטיס כפול
  if (store.findPick) {
    const existing = await store.findPick(clientId, game, drawId);
    if (existing) return { status: 409, data: { error: 'already picked', pick: existing } };
  }

  const drawn = GAMES[game].randomPick(variant);
  const { numbers, strong, tables } = drawn;
  const res = await store.insert({
    clientId,
    game,
    drawId,
    variant,
    tables: tables || null,
    name: cleanName(name),
    numbers,
    strong
  });
  if (res.conflict) {
    return { status: 409, data: { error: 'already picked', pick: res.pick } };
  }
  if (!res.pick) return { status: 500, data: { error: 'db error', detail: res.detail } };
  return { status: 201, data: { pick: res.pick } };
}
