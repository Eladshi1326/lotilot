// לוטי לוט — ה־API בענן (Netlify Functions + Supabase REST)
// עובד ישירות מול ה-REST של Supabase בלי שום ספרייה — יציב בכל גרסת Node.
//   GET  /api/picks    — כל הכרטיסים
//   POST /api/pick     — מילוי כרטיס (פעם אחת לכל משתמש)
//   GET  /api/my-pick  — הכרטיס שלי
//   GET  /api/draws    — היסטוריית הגרלות אמיתית (נמשכת מהפיס, נשמרת בקאש)

import { randomInt } from 'node:crypto';
import { parseLottoCsv } from '../../server/parse-lotto.mjs';
import seedHistory from '../../server/data/lotto-history.seed.mjs';

const CSV_URL = 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PICK_COLS = 'id,name,numbers,strong,created_at';

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

function drawNumbers() {
  const pool = Array.from({ length: 37 }, (_, i) => i + 1);
  const numbers = [];
  for (let i = 0; i < 6; i++) {
    numbers.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  numbers.sort((a, b) => a - b);
  return { numbers, strong: randomInt(1, 8) };
}

function mapPick(row) {
  return {
    id: row.id,
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

async function handleDraws() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(CSV_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'text/csv,application/text,*/*' }
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('windows-1255').decode(buf);
    } catch {
      // רק שורת הכותרת בעברית — שאר השורות ספרות בלבד, אז זה בטוח
      text = Buffer.from(buf).toString('latin1');
    }
    const draws = parseLottoCsv(text);
    if (draws.length === 0) throw new Error('empty csv');
    return json(
      { updatedAt: new Date().toISOString(), source: 'pais.co.il', count: draws.length, draws },
      200,
      {
        // הקאש מחזיק את התשובה 5 שעות — הנתונים מהפיס מתעדכנים כל 5 שעות לכל היותר
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': 'public, s-maxage=18000, stale-while-revalidate=86400'
      }
    );
  } catch (err) {
    // אין גישה לפיס מהענן (הפיס חוסם שרתים) — מגישים את ההיסטוריה הארוזה בתוך האתר
    const seed = seedHistory && Array.isArray(seedHistory.draws)
      ? seedHistory
      : { updatedAt: null, count: 0, draws: [] };
    return json({ ...seed, note: 'bundled history (' + err.message + ')' }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=18000, stale-while-revalidate=86400'
    });
  }
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '/api/draws' && req.method === 'GET') {
      return await handleDraws();
    }

    const cfg = supaConfig();
    if (!cfg) {
      return json(
        { error: 'Supabase עוד לא מחובר — צריך להגדיר SUPABASE_URL ו־SUPABASE_SERVICE_ROLE_KEY במשתני הסביבה של Netlify' },
        500
      );
    }

    if (path === '/api/picks' && req.method === 'GET') {
      const r = await rest(cfg, 'GET', 'picks?select=' + PICK_COLS + '&order=id.desc&limit=2000');
      if (!r.ok || !Array.isArray(r.data)) {
        return json({ error: 'db error', detail: r.data }, 500);
      }
      return json(
        { count: r.data.length, picks: r.data.map(mapPick) },
        200,
        // קאש קצרצר משותף — כל הגולשים חולקים בקשה אחת כל 5 שניות
        { 'netlify-cdn-cache-control': 'public, s-maxage=5, stale-while-revalidate=30' }
      );
    }

    if (path === '/api/my-pick' && req.method === 'GET') {
      const clientId = url.searchParams.get('clientId') || '';
      if (!clientId) return json({ pick: null });
      const r = await rest(
        cfg, 'GET',
        'picks?select=' + PICK_COLS + '&client_id=eq.' + encodeURIComponent(clientId) + '&limit=1'
      );
      if (!r.ok || !Array.isArray(r.data)) {
        return json({ error: 'db error', detail: r.data }, 500);
      }
      return json({ pick: r.data.length ? mapPick(r.data[0]) : null });
    }

    if (path === '/api/pick' && req.method === 'POST') {
      let body = {};
      try {
        body = await req.json();
      } catch {
        /* גוף ריק */
      }
      const clientId = body.clientId;
      let name = typeof body.name === 'string' ? body.name : '';
      if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
        return json({ error: 'bad clientId' }, 400);
      }
      name = name.replace(/[<>]/g, '').trim().slice(0, 20);

      const { numbers, strong } = drawNumbers();
      const ins = await rest(
        cfg, 'POST', 'picks?select=' + PICK_COLS,
        { client_id: clientId, name, numbers, strong },
        { Prefer: 'return=representation' }
      );

      if (ins.status === 409 || (ins.data && ins.data.code === '23505')) {
        // המשתמש כבר מילא כרטיס — מחזירים את הקיים
        const ex = await rest(
          cfg, 'GET',
          'picks?select=' + PICK_COLS + '&client_id=eq.' + encodeURIComponent(clientId) + '&limit=1'
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
    // לעולם לא מפילים את הפונקציה — תמיד JSON מסודר
    return json({ error: 'server error: ' + (err && err.message ? err.message : 'unknown') }, 500);
  }
};

export const config = {
  path: ['/api/picks', '/api/pick', '/api/my-pick', '/api/draws']
};
