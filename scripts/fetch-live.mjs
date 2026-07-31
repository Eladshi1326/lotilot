// לוטי לוט — הבוט: מושך מהפיס את מועדי ההגרלות הבאות ואת התוצאות האחרונות
// רץ אוטומטית ב-GitHub Actions כל 10 דקות (וגם ידנית: npm run fetch-live)
//
// שתי דרכים, לפי הצלחה:
//   1. ישירות מהפיס — מביא את קובץ התוצאות המלא (הכי טוב)
//   2. אם השרת חסום — דרך r.jina.ai שמושך את דף המשחק עבורנו, ומפענחים ממנו
//      את התוצאה האחרונה. ככה הבוט ממשיך לעבוד גם אם הפיס חוסם שרתי ענן.

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAMES, GAME_KEYS, parseGameCsv } from '../server/games.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '..', 'live-data.json');
const BASE = 'https://www.pais.co.il';
const PROXY = 'https://r.jina.ai/';
const KEEP_DRAWS = 100; // כמה הגרלות אחרונות לשמור לכל משחק בקובץ החי
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const CARD_VALUES = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const PAGES = { lotto: '/lotto/', chance: '/chance/', '777': '/777/', '123': '/123/' };

const log = (m) => console.log('[fetch-live] ' + m);

async function raw(url, ms) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,text/csv,application/json,*/*' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

// דפי האתר הם UTF-8 אבל קבצי התוצאות הם windows-1255 — מזהים לבד
function decode(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('windows-1255').decode(buf);
    } catch {
      return Buffer.from(buf).toString('latin1'); // רק הכותרת בעברית — המספרים תמיד תקינים
    }
  }
}

// ---------- מועדי ההגרלות הבאות ----------
async function fetchNext() {
  const next = {};
  await Promise.all(
    GAME_KEYS.map(async (key) => {
      const path = '/include/getNextLotteryDate.ashx?type=' + GAMES[key].nextType;
      for (const [via, url, ms] of [['direct', BASE + path, 8000], ['proxy', PROXY + BASE + path, 60000]]) {
        try {
          const text = decode(await raw(url, ms));
          const m = text.match(/\[\s*\{[\s\S]*?\}\s*\]/); // דרך השער ה-JSON עטוף בטקסט
          if (!m) throw new Error('no json');
          const it = JSON.parse(m[0])[0];
          if (!it || !it.displayDate) throw new Error('no date');
          next[key] = {
            date: it.displayDate,
            time: it.displayTime || null,
            drawNumber: it.LotteryNumber || null,
            firstPrize: it.firstPrize || null,
            secondPrize: it.secondPrize || null,
            via
          };
          log(GAMES[key].name + ' → הגרלה הבאה ' + it.displayDate + ' ' + (it.displayTime || '') + ' (' + via + ')');
          return;
        } catch (err) {
          if (via === 'proxy') log(GAMES[key].name + ' → מועד ההגרלה הבאה נכשל: ' + err.message);
        }
      }
    })
  );
  return next;
}

// ---------- פענוח דף משחק (גיבוי, כשאין גישה לקובץ המלא) ----------
function toLines(text) {
  // עובד גם על HTML גולמי וגם על ה-markdown שמגיע מהשער
  const clean = /<(div|span|td|p|br|li)\b/i.test(text)
    ? text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
           .replace(/<style[\s\S]*?<\/style>/gi, ' ')
           .replace(/<[^>]+>/g, '\n')
    : text.replace(/!\[[^\]]*\]\([^)]*\)/g, '\n');
  return clean.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function parsePage(gameKey, text) {
  // מנרמלים קודם לשורות נקיות — ככה אותו פענוח עובד גם על HTML וגם על markdown
  const norm = toLines(text).join('\n');
  const m = norm.match(/תוצאות הגרלת[\s\S]{0,40}?מס['׳]\s*(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  const after = norm.slice(m.index + m[0].length);

  const dm = after.slice(0, 400).match(/מיום\s+\S+\s+(\d{1,2})\s+ב(\S+)\s+(\d{4})/);
  let date = null;
  if (dm) {
    const mi = HE_MONTHS.indexOf(dm[2]);
    if (mi > -1) date = String(dm[1]).padStart(2, '0') + '/' + String(mi + 1).padStart(2, '0') + '/' + dm[3];
  }

  const stop = after.search(/סגירת המכירה|ארכיון תוצאות|EXTRA תוצאות|תוצאות הגרלת/);
  const tokens = (stop > 0 ? after.slice(0, stop) : after.slice(0, 2500))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (gameKey === 'lotto') {
    const nums = [];
    let strong = null;
    for (let i = 0; i < tokens.length; i++) {
      if (/^המספר החזק$/.test(tokens[i])) {
        for (let j = i + 1; j < Math.min(i + 4, tokens.length); j++) {
          const s = Number(tokens[j]);
          if (Number.isInteger(s) && s >= 1 && s <= 7) { strong = s; break; }
        }
        break;
      }
      const n = Number(tokens[i]);
      if (Number.isInteger(n) && n >= 1 && n <= 37 && nums.length < 6) nums.push(n);
    }
    if (nums.length !== 6 || strong === null) return null;
    nums.sort((a, b) => a - b);
    return { id, date, numbers: nums, strong };
  }

  if (gameKey === 'chance') {
    const cards = tokens.filter((t) => CARD_VALUES.includes(t.toUpperCase())).slice(0, 4);
    if (cards.length !== 4) return null;
    return { id, date, numbers: cards.map((c) => c.toUpperCase()), strong: null };
  }

  if (gameKey === '777') {
    const nums = [];
    for (const t of tokens) {
      const n = Number(t);
      if (Number.isInteger(n) && n >= 1 && n <= 70) nums.push(n);
      if (nums.length === 17) break;
    }
    if (nums.length !== 17) return null;
    return { id, date, numbers: nums, strong: null };
  }

  if (gameKey === '123') {
    const digits = [];
    for (const t of tokens) {
      if (/^\d$/.test(t)) digits.push(Number(t));
      if (digits.length === 3) break;
    }
    if (digits.length !== 3) return null;
    // בדף הספרות מופיעות בסדר RTL (ספרה 3, 2, 1) — הופכים לסדר של קובץ התוצאות
    return { id, date, numbers: digits.reverse(), strong: null };
  }
  return null;
}

// ---------- התוצאות האחרונות ----------
async function fetchLatest() {
  const latest = {};
  await Promise.all(
    GAME_KEYS.map(async (key) => {
      // 1. הדרך הטובה: קובץ התוצאות המלא ישירות מהפיס
      try {
        const text = decode(await raw(GAMES[key].csvUrl, 20000));
        const draws = parseGameCsv(key, text);
        if (draws.length === 0) throw new Error('קובץ ריק');
        latest[key] = { via: 'csv', count: draws.length, draws: draws.slice(0, KEEP_DRAWS) };
        log(GAMES[key].name + ' → ' + draws.length + ' הגרלות, אחרונה ' + draws[0].id + ' מ־' + draws[0].date + ' (csv)');
        return;
      } catch (err) {
        log(GAMES[key].name + ' → הקובץ המלא לא זמין (' + err.message + '), עובר לדף המשחק');
      }

      // 2. גיבוי: פענוח התוצאה האחרונה מדף המשחק, דרך השער
      for (const [via, url, ms] of [
        ['page', BASE + PAGES[key], 10000],
        ['proxy', PROXY + BASE + PAGES[key], 70000]
      ]) {
        try {
          const draw = parsePage(key, decode(await raw(url, ms)));
          if (!draw) throw new Error('לא הצלחתי לפענח');
          latest[key] = { via, count: 1, draws: [draw] };
          log(GAMES[key].name + ' → הגרלה ' + draw.id + ': ' + draw.numbers.join(',') + (draw.strong ? ' | חזק ' + draw.strong : '') + ' (' + via + ')');
          return;
        } catch (err) {
          if (via === 'proxy') log(GAMES[key].name + ' → גם דף המשחק נכשל: ' + err.message);
        }
      }
    })
  );
  return latest;
}

async function main() {
  const next = await fetchNext();
  const latest = await fetchLatest();

  if (Object.keys(next).length === 0 && Object.keys(latest).length === 0) {
    log('לא התקבל שום מידע — משאיר את הקובץ כמו שהוא');
    return;
  }

  let prev = { next: {}, latest: {} };
  if (existsSync(OUT_FILE)) {
    try { prev = JSON.parse(readFileSync(OUT_FILE, 'utf8')); } catch { /* פגום */ }
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    next: { ...(prev.next || {}), ...next },
    latest: { ...(prev.latest || {}), ...latest }
  };

  // כותבים רק אם באמת השתנה משהו — כדי לא ליצור קומיטים מיותרים
  const sig = (o) => JSON.stringify({ next: o.next, latest: o.latest });
  if (existsSync(OUT_FILE) && sig(prev) === sig(payload)) {
    log('אין שינוי — הקובץ נשאר כפי שהוא');
    return;
  }

  writeFileSync(OUT_FILE, JSON.stringify(payload), 'utf8');
  log('✓ live-data.json עודכן');
}

// רץ רק כשמפעילים את הקובץ ישירות (כדי שאפשר יהיה לייבא את הפענוח לבדיקות)
if (process.argv[1] && process.argv[1].endsWith('fetch-live.mjs')) {
  main().catch((err) => {
    log('שגיאה: ' + err.message);
    process.exitCode = 0; // לעולם לא מפיל את ה-Action
  });
}

export { parsePage, fetchNext, fetchLatest };
