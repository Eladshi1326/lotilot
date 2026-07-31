// עדכון נתוני כל המשחקים מאתר מפעל הפיס: לוטו, צ'אנס, 777, 123 + פרטי ההגרלה הבאה
// רץ אוטומטית לפני כל הפעלה (npm run dev / npm start) וגם לפני כל דחיפה לגיט.
// בלי אינטרנט — נשארים עם הנתונים הקיימים.
//
// בדיקה מקומית עם קובץ: node scripts/update-data.mjs --from-file lotto=path.csv

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAMES, GAME_KEYS, parseGameCsv } from '../server/games.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'server', 'data');
const SEED_FILE = join(DATA_DIR, 'all-history.seed.mjs'); // נארז לתוך פונקציית הענן
const NEXT_URL = 'https://www.pais.co.il/include/getNextLotteryDate.ashx?type=';
const TIMEOUT_MS = 25000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const historyFile = (key) => join(DATA_DIR, 'history-' + key + '.json');

async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/csv,application/text,application/json,*/*' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function decodeWin1255(buf) {
  try {
    return new TextDecoder('windows-1255').decode(buf);
  } catch {
    return Buffer.from(buf).toString('latin1'); // רק הכותרת בעברית — הנתונים ספרות/אותיות
  }
}

function readExisting(key) {
  try {
    if (existsSync(historyFile(key))) return JSON.parse(readFileSync(historyFile(key), 'utf8'));
  } catch { /* קובץ פגום — נתחיל נקי */ }
  return { updatedAt: null, count: 0, draws: [] };
}

const OFFLINE = process.env.LOTILOT_OFFLINE === '1';

async function updateGame(key, fromFile) {
  const game = GAMES[key];
  let csvText = null;
  if (fromFile) {
    csvText = readFileSync(fromFile, 'utf8');
  } else if (OFFLINE) {
    return readExisting(key);
  } else {
    try {
      const res = await fetchWithTimeout(game.csvUrl);
      csvText = decodeWin1255(await res.arrayBuffer());
    } catch (err) {
      console.warn('[update-data] ' + game.name + ': לא הצלחתי להוריד (' + err.message + ') — נשארים עם הקיים');
      return readExisting(key);
    }
  }

  const draws = parseGameCsv(key, csvText).slice(0, game.historyCap);
  if (draws.length === 0) {
    console.warn('[update-data] ' + game.name + ': קובץ ריק/לא צפוי — נשארים עם הקיים');
    return readExisting(key);
  }

  const payload = {
    game: key,
    updatedAt: new Date().toISOString(),
    count: draws.length,
    draws
  };
  writeFileSync(historyFile(key), JSON.stringify(payload), 'utf8');
  console.log('[update-data] ' + game.name + ': ' + draws.length + ' הגרלות (עדכנית: ' + draws[0].id + ' מ־' + draws[0].date + ')');
  return payload;
}

async function fetchNextInfo() {
  const next = {};
  if (OFFLINE) {
    try {
      return JSON.parse(readFileSync(join(DATA_DIR, 'next-info.json'), 'utf8'));
    } catch { return {}; }
  }
  for (const key of GAME_KEYS) {
    try {
      const res = await fetchWithTimeout(NEXT_URL + GAMES[key].nextType, 8000);
      const arr = await res.json();
      const it = Array.isArray(arr) ? arr[0] : null;
      if (it && it.displayDate) {
        next[key] = {
          date: it.displayDate,
          time: it.displayTime || null,
          drawNumber: it.LotteryNumber || null,
          firstPrize: it.firstPrize || null,
          secondPrize: it.secondPrize || null,
          fetchedAt: new Date().toISOString()
        };
      }
    } catch {
      /* אין — הלקוח יחשב לבד ללוטו */
    }
  }
  return next;
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // תמיכה ב---from-file game=path לבדיקה מקומית
  const fromFiles = {};
  const ffIdx = process.argv.indexOf('--from-file');
  if (ffIdx > -1) {
    for (const arg of process.argv.slice(ffIdx + 1)) {
      const [g, p] = arg.split('=');
      if (g && p) fromFiles[g] = p;
    }
  }

  const all = {};
  for (const key of GAME_KEYS) {
    all[key] = await updateGame(key, fromFiles[key]);
  }
  const next = await fetchNextInfo();
  if (Object.keys(next).length) {
    console.log('[update-data] פרטי הגרלות באות עודכנו (' + Object.keys(next).join(', ') + ')');
  }

  // seed משולב שנארז לפונקציית הענן — הפיס חוסם שרתי ענן, אז זה מקור הנתונים שם
  const seed = { generatedAt: new Date().toISOString(), next, games: all };
  writeFileSync(SEED_FILE, 'export default ' + JSON.stringify(seed) + ';\n', 'utf8');
  writeFileSync(join(DATA_DIR, 'next-info.json'), JSON.stringify(next), 'utf8');
}

main().catch((err) => {
  console.warn('[update-data] שגיאה לא צפויה: ' + err.message);
  process.exitCode = 0; // לעולם לא מפיל את ההפעלה
});
