// עדכון היסטוריית הגרלות הלוטו מאתר מפעל הפיס
// רץ אוטומטית לפני כל הפעלה של האתר (npm run dev / npm start),
// ואפשר גם ידנית: npm run update-data
//
// שימוש מקומי לבדיקה: node scripts/update-data.mjs --from-file path/to/file.csv

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseLottoCsv } from '../server/parse-lotto.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'server', 'data');
const OUT_FILE = join(DATA_DIR, 'lotto-history.json');
const SEED_FILE = join(DATA_DIR, 'lotto-history.seed.mjs'); // עותק שנארז לתוך הפונקציה בענן
const CSV_URL = 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx';
const TIMEOUT_MS = 20000;

function decodeWin1255(buf) {
  try {
    return new TextDecoder('windows-1255').decode(buf);
  } catch {
    // רק שורת הכותרת בעברית — שאר הנתונים ספרות בלבד, אז latin1 מספיק
    return Buffer.from(buf).toString('latin1');
  }
}

async function fetchCsv() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(CSV_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'text/csv,application/text,*/*'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return decodeWin1255(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  const fromFileIdx = process.argv.indexOf('--from-file');
  let csvText = null;
  let source = CSV_URL;

  if (fromFileIdx > -1 && process.argv[fromFileIdx + 1]) {
    source = process.argv[fromFileIdx + 1];
    csvText = readFileSync(source, 'utf8');
  } else {
    try {
      console.log('[update-data] מוריד את היסטוריית ההגרלות ממפעל הפיס...');
      csvText = await fetchCsv();
    } catch (err) {
      console.warn('[update-data] לא הצלחתי להוריד נתונים (' + err.message + ')');
      if (existsSync(OUT_FILE)) {
        console.warn('[update-data] ממשיך עם הנתונים הקיימים.');
        return;
      }
      console.warn('[update-data] אין קובץ נתונים קיים — האתר יעבוד בלי היסטוריה בינתיים.');
      return;
    }
  }

  const draws = parseLottoCsv(csvText);
  if (draws.length === 0) {
    console.warn('[update-data] הקובץ שהתקבל ריק או בפורמט לא צפוי — לא נוגע בנתונים הקיימים.');
    return;
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source,
    count: draws.length,
    draws
  };
  writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8');
  // גרסת מודול — נארזת לתוך פונקציית הענן, כדי שההיסטוריה תמיד תהיה זמינה גם כשהפיס חוסם שרתים
  writeFileSync(SEED_FILE, 'export default ' + JSON.stringify(payload) + ';\n', 'utf8');
  console.log('[update-data] נשמרו ' + draws.length + ' הגרלות (עדכנית: ' + draws[0].id + ' מתאריך ' + draws[0].date + ')');
}

main().catch((err) => {
  console.warn('[update-data] שגיאה לא צפויה: ' + err.message);
  process.exitCode = 0; // לא מפיל את ההפעלה של האתר
});
