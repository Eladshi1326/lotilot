// לוטי לוט — ה-API בענן (Netlify Functions + Supabase REST).
// הלוגיקה עצמה יושבת ב-server/api-core.mjs — כאן רק החיבור למסד ולנתוני ההגרלות.

import { GAMES, GAME_KEYS, isValidGame, parseGameCsv, sortDraws } from '../../server/games.mjs';
import { loadLive, mergeDraws, buildNext } from '../../server/live-merge.mjs';
import { buildState, submitPick } from '../../server/api-core.mjs';
import seedAll from '../../server/data/all-history.seed.mjs';

const NEXT_URL = 'https://www.pais.co.il/include/getNextLotteryDate.ashx?type=';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PICK_COLS = 'id,client_id,game,draw_id,variant,tables,name,numbers,strong,created_at';

// ---------- Supabase ----------
function supaConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return { url, key };
}

async function rest(cfg, method, path, body, extraHeaders = {}) {
  const res = await fetch(cfg.url + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + cfg.key,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, ok: res.ok, data };
}

const fromRow = (r) => ({
  id: r.id,
  clientId: r.client_id,
  game: r.game || 'lotto',
  variant: r.variant || 'regular',
  tables: r.tables || null,
  drawId: r.draw_id,
  name: r.name || '',
  numbers: r.numbers,
  strong: r.strong,
  ts: new Date(r.created_at).getTime()
});

const toRow = (p) => ({
  client_id: p.clientId,
  game: p.game,
  draw_id: p.drawId,
  variant: p.variant || 'regular',
  tables: p.tables || null,
  name: p.name || '',
  numbers: p.numbers,
  strong: p.strong ?? null
});

function makeStore(cfg) {
  return {
    // רק חלון ההגרלות שמוצג — כך מספר השורות הנקראות נשאר קטן וקבוע
    async picksInWindow(game, minDrawId) {
      const r = await rest(
        cfg, 'GET',
        'picks?select=' + PICK_COLS + '&game=eq.' + encodeURIComponent(game) +
          '&draw_id=gte.' + minDrawId + '&order=id.desc&limit=500'
      );
      if (!r.ok || !Array.isArray(r.data)) throw new Error('db read failed');
      return r.data.map(fromRow);
    },
    async picksByClient(clientId) {
      const r = await rest(
        cfg, 'GET',
        'picks?select=' + PICK_COLS + '&client_id=eq.' + encodeURIComponent(clientId) +
          '&order=id.desc&limit=200'
      );
      if (!r.ok || !Array.isArray(r.data)) return [];
      return r.data.map(fromRow);
    },
    async findPick(clientId, game, drawId) {
      const r = await rest(
        cfg, 'GET',
        'picks?select=' + PICK_COLS +
          '&client_id=eq.' + encodeURIComponent(clientId) +
          '&game=eq.' + encodeURIComponent(game) +
          '&draw_id=eq.' + drawId + '&limit=1'
      );
      const row = r.ok && Array.isArray(r.data) && r.data[0];
      return row ? fromRow(row) : null;
    },
    async insert(p) {
      const r = await rest(cfg, 'POST', 'picks?select=' + PICK_COLS, toRow(p), {
        Prefer: 'return=representation'
      });
      if (r.status === 409 || (r.data && r.data.code === '23505')) {
        const ex = await rest(
          cfg, 'GET',
          'picks?select=' + PICK_COLS +
            '&client_id=eq.' + encodeURIComponent(p.clientId) +
            '&game=eq.' + encodeURIComponent(p.game) +
            '&draw_id=eq.' + p.drawId + '&limit=1'
        );
        const row = ex.ok && Array.isArray(ex.data) && ex.data[0];
        return { conflict: true, pick: row ? fromRow(row) : null };
      }
      if (!r.ok || !Array.isArray(r.data) || !r.data.length) {
        return { pick: null, detail: r.data };
      }
      return { pick: fromRow(r.data[0]) };
    },
    async insertMany(rows) {
      if (!rows.length) return [];
      const r = await rest(cfg, 'POST', 'picks?select=' + PICK_COLS, rows.map(toRow), {
        Prefer: 'return=representation,resolution=ignore-duplicates'
      });
      if (!r.ok || !Array.isArray(r.data)) return [];
      return r.data.map(fromRow);
    }
  };
}

// ---------- נתוני הגרלות ----------
function decodeBuf(buf) {
  // דפי האתר UTF-8, קבצי התוצאות windows-1255 — מזהים לבד
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    try {
      return new TextDecoder('windows-1255').decode(buf);
    } catch {
      return Buffer.from(buf).toString('latin1');
    }
  }
}

async function fetchWithTimeout(url, ms) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { signal: c.signal, headers: { 'User-Agent': UA } });
  } finally {
    clearTimeout(timer);
  }
}

function seedFor(key) {
  const g = seedAll && seedAll.games && seedAll.games[key];
  return g && Array.isArray(g.draws) ? g : { updatedAt: null, draws: [] };
}

// היסטוריה מלאה לכל המשחקים: ארוז באתר + מה שהסוכן הביא
async function loadAllDraws() {
  const live = await loadLive();
  const drawsByGame = {};
  const latestIdByGame = {};
  for (const key of GAME_KEYS) {
    const liveDraws = live && live.latest && live.latest[key] ? live.latest[key].draws : null;
    const merged = mergeDraws(seedFor(key).draws, liveDraws).slice(0, GAMES[key].historyCap);
    drawsByGame[key] = merged;
    if (merged[0]) latestIdByGame[key] = merged[0].id;
  }
  const nextInfo = buildNext((seedAll && seedAll.next) || {}, live, latestIdByGame);
  return { drawsByGame, nextInfo, live };
}

// היסטוריה מלאה למשחק אחד — מנסה קודם ישירות מהפיס
async function fullHistory(gameKey, fallbackDraws) {
  try {
    const res = await fetchWithTimeout(GAMES[gameKey].csvUrl, 5000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const draws = parseGameCsv(gameKey, decodeBuf(await res.arrayBuffer())).slice(0, GAMES[gameKey].historyCap);
    if (draws.length === 0) throw new Error('empty');
    return { draws, source: 'live' };
  } catch {
    return { draws: sortDraws(fallbackDraws), source: 'bundled' };
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');
    const gameParam = url.searchParams.get('game');
    const game = isValidGame(gameParam) ? gameParam : 'lotto';

    if (path === '/api/draws' && req.method === 'GET') {
      const { drawsByGame } = await loadAllDraws();
      const { draws, source } = await fullHistory(game, drawsByGame[game] || []);
      // מוגש בעמודים קטנים — אף פעם לא שולחים אלפי הגרלות בבת אחת
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 100);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
      const term = (url.searchParams.get('q') || '').trim();
      const filtered = term
        ? draws.filter((d) => String(d.id).includes(term) || String(d.date).includes(term))
        : draws;
      return json(
        { game, source, total: filtered.length, totalAll: draws.length, offset, limit, draws: filtered.slice(offset, offset + limit) },
        200,
        { 'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=86400' }
      );
    }

    if (path === '/api/next' && req.method === 'GET') {
      const { nextInfo } = await loadAllDraws();
      // ניסיון רענון ישיר מהפיס — הכי טרי
      await Promise.all(
        GAME_KEYS.map(async (key) => {
          try {
            const res = await fetchWithTimeout(NEXT_URL + GAMES[key].nextType, 2500);
            if (!res.ok) return;
            const it = (await res.json())[0];
            if (it && it.displayDate) {
              nextInfo[key] = {
                ...(nextInfo[key] || {}),
                date: it.displayDate,
                time: it.displayTime || null,
                firstPrize: key === 'lotto' ? it.firstPrize || null : null
              };
              if (it.LotteryNumber) {
                nextInfo[key].drawNumber = it.LotteryNumber;
                nextInfo[key].estimated = false;
              }
            }
          } catch { /* נשארים עם מה שיש */ }
        })
      );
      return json(nextInfo, 200, {
        'netlify-cdn-cache-control': 'public, s-maxage=120, stale-while-revalidate=3600'
      });
    }

    // מכאן והלאה צריך מסד נתונים
    const cfg = supaConfig();
    if (!cfg) {
      return json(
        { error: 'Supabase לא מחובר — חסרים SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY במשתני הסביבה של Netlify' },
        500
      );
    }
    const store = makeStore(cfg);

    if (path === '/api/state' && req.method === 'GET') {
      const { drawsByGame, nextInfo, live } = await loadAllDraws();
      const state = await buildState({
        store,
        drawsByGame,
        nextInfo,
        game,
        clientId: url.searchParams.get('clientId') || ''
      });
      return json({ ...state, next: nextInfo, dataUpdatedAt: live && live.updatedAt ? live.updatedAt : null, botUpdatedAt: live && live.botUpdatedAt ? live.botUpdatedAt : null }, 200, { 'cache-control': 'no-store' });
    }

    if (path === '/api/pick' && req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch { /* גוף ריק */ }
      const { drawsByGame, nextInfo } = await loadAllDraws();
      const r = await submitPick({ store, drawsByGame, nextInfo, body });
      return json(r.data, r.status);
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    return json({ error: 'server error: ' + (err && err.message ? err.message : 'unknown') }, 500);
  }
};

export const config = {
  path: ['/api/state', '/api/pick', '/api/draws', '/api/next']
};
