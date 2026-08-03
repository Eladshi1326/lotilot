// מיזוג הנתונים החיים (מה שהסוכן מביא) עם ההיסטוריה הארוזה באתר.
// משותף לשרת המקומי ולפונקציה בענן.
//
// שני מקורות חיים, שניהם נקראים ישירות מגיטהאב בזמן אמת (בלי בנייה מחדש):
//   live-data.json — נכתב מהמחשב (push-to-git.cmd) וכולל גם טבלאות זכיות
//   pais-raw.json  — נכתב מהבוט ב-Google Apps Script כל רבע שעה, שורות CSV גולמיות
// הבוט טרי יותר, ולכן גובר; אבל השדות שרק live-data.json מביא (פרסים) נשמרים.

import { GAMES, GAME_KEYS, sortDraws, parseGameCsv } from './games.mjs';

const RAW_BASE =
  process.env.LIVE_DATA_BASE ||
  'https://raw.githubusercontent.com/Eladshi1326/lotilot/main/';

const LIVE_URL = process.env.LIVE_DATA_URL || RAW_BASE + 'live-data.json';
const PAIS_RAW_URL = process.env.PAIS_RAW_URL || RAW_BASE + 'pais-raw.json';

let cache = { at: 0, data: null };
const CACHE_MS = 60000; // דקה — מספיק טרי, ולא מציף את גיטהאב בבקשות

async function getJson(url, timeoutMs, stamp) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // פרמטר הזמן שובר את הקאש של גיטהאב כדי לקבל את הגרסה העדכנית
    const res = await fetch(url + '?t=' + stamp, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// הופך את ה-CSV הגולמי שהבוט הביא למבנה שהאתר מכיר
function fromRaw(raw) {
  if (!raw || !raw.csv) return null;
  const latest = {};
  for (const key of GAME_KEYS) {
    const text = raw.csv[key];
    if (typeof text !== 'string' || text.length < 10) continue;
    const draws = parseGameCsv(key, text);
    if (draws.length) latest[key] = { draws };
  }
  if (Object.keys(latest).length === 0) return null;
  return { updatedAt: raw.updatedAt || null, latest, next: raw.next || {} };
}

export async function loadLive(timeoutMs = 4000) {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;

  const stamp = Math.floor(now / 60000);
  const [liveJson, rawJson] = await Promise.all([
    getJson(LIVE_URL, timeoutMs, stamp),
    getJson(PAIS_RAW_URL, timeoutMs, stamp)
  ]);

  const fromBot = fromRaw(rawJson);
  if (!liveJson && !fromBot) return cache.data; // מה שיש בזיכרון, ואם אין אז null

  const merged = { latest: {}, next: {}, updatedAt: null };
  for (const key of GAME_KEYS) {
    const a = liveJson && liveJson.latest && liveJson.latest[key] ? liveJson.latest[key].draws : null;
    const b = fromBot && fromBot.latest[key] ? fromBot.latest[key].draws : null;
    if (!a && !b) continue;
    // b (הבוט) גובר על a, אבל mergeDraws שומר שדות קיימים כמו טבלאות הזכיות
    merged.latest[key] = { draws: mergeDraws(a || [], b || []) };
  }
  merged.next = { ...((liveJson && liveJson.next) || {}), ...((fromBot && fromBot.next) || {}) };

  const stamps = [liveJson && liveJson.updatedAt, fromBot && fromBot.updatedAt].filter(Boolean);
  merged.updatedAt = stamps.length ? stamps.sort().pop() : null;
  merged.botUpdatedAt = (fromBot && fromBot.updatedAt) || null;

  cache = { at: now, data: merged };
  return merged;
}

// ממזג הגרלות חדשות לתוך רשימה קיימת, בלי כפילויות.
// חשוב: המיון לפי תאריך! מספרי הגרלות הלוטו התאפסו ב-1999
// (הגרלה 9934 היא מ-1999), אז מיון לפי מספר מקפיץ את שנות ה-90 לראש.
export function mergeDraws(baseDraws, liveDraws) {
  if (!Array.isArray(liveDraws) || liveDraws.length === 0) return sortDraws(baseDraws || []);
  const byId = new Map();
  for (const d of baseDraws || []) byId.set(d.id, d);
  for (const d of liveDraws) {
    if (!d || !Number.isFinite(d.id) || !Array.isArray(d.numbers)) continue;
    const existing = byId.get(d.id);
    // הנתון החי גובר, אבל לא מוחק שדות שכבר היו (כמו טבלת הזכיות)
    byId.set(d.id, existing ? { ...existing, ...d } : d);
  }
  return sortDraws([...byId.values()]);
}

// מרכיב את פרטי ההגרלה הבאה לכל משחק, כולל מספר הגרלה משוער כשהפיס לא מספק אותו
export function buildNext(bundledNext, live, latestIdByGame) {
  const out = {};
  const liveNext = (live && live.next) || {};
  for (const key of Object.keys(GAMES)) {
    const info = { ...(bundledNext[key] || {}), ...(liveNext[key] || {}) };
    if (!info.date) continue;
    if (!info.drawNumber) {
      const latest = latestIdByGame[key];
      if (Number.isFinite(latest)) {
        info.drawNumber = latest + 1;
        info.estimated = true; // מספר משוער: ההגרלה האחרונה + 1
      }
    }
    // סכום הפרס רלוונטי רק ללוטו
    if (key !== 'lotto') { info.firstPrize = null; info.secondPrize = null; }
    out[key] = info;
  }
  if (live && live.updatedAt) out.updatedAt = live.updatedAt;
  if (live && live.botUpdatedAt) out.botUpdatedAt = live.botUpdatedAt;
  return out;
}
