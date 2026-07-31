// מיזוג הנתונים החיים (מה שהסוכן מביא כל 10 דקות) עם ההיסטוריה הארוזה באתר.
// משותף לשרת המקומי ולפונקציה בענן.

import { GAMES } from './games.mjs';

// כתובת הקובץ שהסוכן מעדכן בגיטהאב — נקרא בזמן אמת, בלי צורך לבנות את האתר מחדש
const LIVE_URL =
  process.env.LIVE_DATA_URL ||
  'https://raw.githubusercontent.com/Eladshi1326/lotilot/main/live-data.json';

let cache = { at: 0, data: null };
const CACHE_MS = 60000; // דקה — מספיק טרי, ולא מציף את גיטהאב בבקשות

export async function loadLive(timeoutMs = 4000) {
  const now = Date.now();
  if (cache.data && now - cache.at < CACHE_MS) return cache.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // פרמטר הזמן שובר את הקאש של גיטהאב כדי לקבל את הגרסה העדכנית
    const res = await fetch(LIVE_URL + '?t=' + Math.floor(now / 60000), {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    cache = { at: now, data };
    return data;
  } catch {
    return cache.data; // אם נכשל — מה שיש בזיכרון, ואם אין אז null
  } finally {
    clearTimeout(timer);
  }
}

// ממזג הגרלות חדשות לתוך רשימה קיימת (חדש -> ישן, בלי כפילויות)
export function mergeDraws(baseDraws, liveDraws) {
  if (!Array.isArray(liveDraws) || liveDraws.length === 0) return baseDraws;
  const byId = new Map();
  for (const d of baseDraws) byId.set(d.id, d);
  for (const d of liveDraws) {
    if (!d || !Number.isFinite(d.id) || !Array.isArray(d.numbers)) continue;
    const existing = byId.get(d.id);
    // הנתון החי גובר, אבל לא מוחק שדות שכבר היו (כמו מספר הזוכים)
    byId.set(d.id, existing ? { ...existing, ...d } : d);
  }
  return [...byId.values()].sort((a, b) => b.id - a.id);
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
    out[key] = info;
  }
  if (live && live.updatedAt) out.updatedAt = live.updatedAt;
  return out;
}
