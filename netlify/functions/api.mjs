// לוטי לוט — ה־API בענן: כל המשחקים (Netlify Functions + Supabase REST)
//   GET  /api/picks?game=   — הכרטיסים (של כולם)
//   POST /api/pick          — מילוי כרטיס {clientId, name?, game}
//   GET  /api/my-picks      — הכרטיסים שלי בכל המשחקים
//   GET  /api/draws?game=   — היסטוריית הגרלות אמיתית
//   GET  /api/next          — פרטי ההגרלות הבאות
// הפיס חוסם שרתי ענן, לכן ההיסטוריה מגיעה מה־seed הארוז; מנסים בכל זאת לרענן חי.

import { GAMES, GAME_KEYS, isValidGame, parseGameCsv } from '../../server/games.mjs';
import seedAll from '../../server/data/all-history.seed.mjs';

const NEXT_URL = 'https://www.pais.co.il/include/getNextLotteryDate.ashx?type=';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PICK_COLS = 'id,game,name,numbers,strong,created_at';

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

function mapPick(row) {
  return {
    id: row.id,
    game: row.game || 'lotto',
    name: row.name,
    numbers: row.numbers,
    strong: row.strong,
    ts: new Date(row.created_at).getTime()
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function seedFor(gameKey) {
  const g = seedAll && seedAll.games && seedAll.games[gameKey];
  return g && Array.isArray(g.draws) ? g : { game: gameKey, updatedAt: null, count: 0, draws: [] };
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/csv,application/text,application/json,*/*' }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handleDraws(gameKey) {
  const game = GAMES[gameKey];
  try {
    const res = await fetchWithTimeout(game.csvUrl, 3500);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('windows-1255').decode(buf);
    } catch {
      text = Buffer.from(buf).toString('latin1');
    }
    const draws = parseGameCsv(gameKey, text).slice(0, game.historyCap);
    if (draws.length === 0) throw new Error('empty csv');
    return json(
      { game: gameKey, updatedAt: new Date().toISOString(), count: draws.length, draws },
      200,
      {
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': 'public, s-maxage=18000, stale-while-revalidate=86400'
      }
    );
  } catch (err) {
    return json({ ...seedFor(gameKey), note: 'bundled history (' + err.message + ')' }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=18000, stale-while-revalidate=86400'
    });
  }
}

async function handleNext() {
  const bundled = (seedAll && seedAll.next) || {};
  const out = { ...bundled };
  // מנסים לרענן חי (אם הפיס לא חוסם) — כל משחק עם timeout קצרצר
  await Promise.all(
    GAME_KEYS.map(async (key) => {
      try {
        const res = await fetchWithTimeout(NEXT_URL + GAMES[key].nextType, 2500);
        if (!res.ok) return;
        const arr = await res.json();
        const it = Array.isArray(arr) ? arr[0] : null;
        if (it && it.displayDate) {
          out[key] = {
            date: it.displayDate,
            time: it.displayTime || null,
            drawNumber: it.LotteryNumber || null,
            firstPrize: it.firstPrize || null,
            secondPrize: it.secondPrize || null,
            fetchedAt: new Date().toISOString()
          };
        }
      } catch { /* נשארים עם הארוז */ }
    })
  );
  return json(out, 200, {
    'netlify-cdn-cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400'
  });
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '/api/draws' && req.method === 'GET') {
      const gameKey = isValidGame(url.searchParams.get('game')) ? url.searchParams.get('game') : 'lotto';
      return await handleDraws(gameKey);
    }

    if (path === '/api/next' && req.method === 'GET') {
      return await handleNext();
    }

    const cfg = supaConfig();
    if (!cfg) {
      return json(
        { error: 'Supabase עוד לא מחובר — צריך להגדיר SUPABASE_URL ו־SUPABASE_SERVICE_ROLE_KEY במשתני הסביבה של Netlify' },
        500
      );
    }

    if (path === '/api/picks' && req.method === 'GET') {
      const game = url.searchParams.get('game');
      let q = 'picks?select=' + PICK_COLS + '&order=id.desc&limit=2000';
      if (isValidGame(game)) q += '&game=eq.' + encodeURIComponent(game);
      const r = await rest(cfg, 'GET', q);
      if (!r.ok || !Array.isArray(r.data)) return json({ error: 'db error', detail: r.data }, 500);

      // ספירה כוללת לכל משחק (לתצוגת הטאבים)
      const rc = await rest(cfg, 'GET', 'picks?select=game');
      const counts = {};
      for (const key of GAME_KEYS) counts[key] = 0;
      let total = 0;
      if (rc.ok && Array.isArray(rc.data)) {
        total = rc.data.length;
        for (const row of rc.data) {
          const g = row.game || 'lotto';
          if (counts[g] !== undefined) counts[g]++;
        }
      }
      return json(
        { count: r.data.length, total, counts, picks: r.data.map(mapPick) },
        200,
        { 'netlify-cdn-cache-control': 'public, s-maxage=5, stale-while-revalidate=30' }
      );
    }

    if (path === '/api/my-picks' && req.method === 'GET') {
      const clientId = url.searchParams.get('clientId') || '';
      const mine = {};
      for (const key of GAME_KEYS) mine[key] = null;
      if (clientId) {
        const r = await rest(
          cfg, 'GET',
          'picks?select=' + PICK_COLS + '&client_id=eq.' + encodeURIComponent(clientId)
        );
        if (!r.ok || !Array.isArray(r.data)) return json({ error: 'db error', detail: r.data }, 500);
        for (const row of r.data) {
          const g = row.game || 'lotto';
          if (mine[g] === null) mine[g] = mapPick(row);
        }
      }
      return json({ picks: mine });
    }

    if (path === '/api/pick' && req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch { /* גוף ריק */ }
      const clientId = body.clientId;
      let { name, game } = body;
      if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
        return json({ error: 'bad clientId' }, 400);
      }
      if (!game) game = 'lotto';
      if (!isValidGame(game)) return json({ error: 'bad game' }, 400);
      if (typeof name !== 'string') name = '';
      name = name.replace(/[<>]/g, '').trim().slice(0, 20);

      const { numbers, strong } = GAMES[game].randomPick();
      const ins = await rest(
        cfg, 'POST', 'picks?select=' + PICK_COLS,
        { client_id: clientId, game, name, numbers, strong },
        { Prefer: 'return=representation' }
      );

      if (ins.status === 409 || (ins.data && ins.data.code === '23505')) {
        const ex = await rest(
          cfg, 'GET',
          'picks?select=' + PICK_COLS + '&client_id=eq.' + encodeURIComponent(clientId) + '&game=eq.' + encodeURIComponent(game) + '&limit=1'
        );
        const pick = ex.ok && Array.isArray(ex.data) && ex.data.length ? mapPick(ex.data[0]) : null;
        return json({ error: 'already picked', pick }, 409);
      }
      if (!ins.ok || !Array.isArray(ins.data) || !ins.data.length) {
        return json({ error: 'db error', detail: ins.data }, 500);
      }
      return json({ pick: mapPick(ins.data[0]) }, 201);
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    return json({ error: 'server error: ' + (err && err.message ? err.message : 'unknown') }, 500);
  }
};

export const config = {
  path: ['/api/picks', '/api/pick', '/api/my-picks', '/api/draws', '/api/next']
};
