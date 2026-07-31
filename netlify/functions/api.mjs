// לוטי לוט — ה־API בענן (Netlify Functions + Supabase)
// אותם נתיבים בדיוק כמו השרת המקומי, כך שהאתר לא מרגיש הבדל:
//   GET  /api/picks    — כל הכרטיסים
//   POST /api/pick     — מילוי כרטיס (פעם אחת לכל משתמש)
//   GET  /api/my-pick  — הכרטיס שלי
//   GET  /api/draws    — היסטוריית הגרלות אמיתית (נמשכת מהפיס, נשמרת בקאש)

import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';
import { parseLottoCsv } from '../../server/parse-lotto.mjs';

const require = createRequire(import.meta.url);

const CSV_URL = 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function supa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
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

const PICK_COLS = 'id,name,numbers,strong,created_at';

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
    const timer = setTimeout(() => controller.abort(), 8000);
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
        // הקאש של Netlify מחזיק את התשובה 5 שעות — הנתונים מהפיס מתעדכנים כל 5 שעות לכל היותר
        'cache-control': 'public, max-age=0, must-revalidate',
        'netlify-cdn-cache-control': 'public, s-maxage=18000, stale-while-revalidate=86400'
      }
    );
  } catch (err) {
    // אין גישה לפיס כרגע — מחזירים את הנתונים הארוזים באתר
    const seed = require('../../server/data/lotto-history.json');
    return json({ ...seed, note: 'fallback: ' + err.message }, 200, {
      'netlify-cdn-cache-control': 'public, s-maxage=1800'
    });
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path === '/api/draws' && req.method === 'GET') {
    return handleDraws();
  }

  const db = supa();
  if (!db) {
    return json(
      { error: 'Supabase עוד לא מחובר — צריך להגדיר SUPABASE_URL ו־SUPABASE_SERVICE_ROLE_KEY במשתני הסביבה של Netlify' },
      500
    );
  }

  if (path === '/api/picks' && req.method === 'GET') {
    const { data, error } = await db
      .from('picks')
      .select(PICK_COLS)
      .order('id', { ascending: false })
      .limit(2000);
    if (error) return json({ error: error.message }, 500);
    return json(
      { count: data.length, picks: data.map(mapPick) },
      200,
      // קאש קצרצר משותף — כל הגולשים חולקים בקשה אחת כל 5 שניות
      { 'netlify-cdn-cache-control': 'public, s-maxage=5, stale-while-revalidate=30' }
    );
  }

  if (path === '/api/my-pick' && req.method === 'GET') {
    const clientId = url.searchParams.get('clientId') || '';
    const { data, error } = await db.from('picks').select(PICK_COLS).eq('client_id', clientId).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ pick: data ? mapPick(data) : null });
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
    const { data, error } = await db
      .from('picks')
      .insert({ client_id: clientId, name, numbers, strong })
      .select(PICK_COLS)
      .single();

    if (error) {
      if (error.code === '23505') {
        // המשתמש כבר מילא כרטיס — מחזירים את הקיים
        const { data: existing } = await db.from('picks').select(PICK_COLS).eq('client_id', clientId).maybeSingle();
        return json({ error: 'already picked', pick: existing ? mapPick(existing) : null }, 409);
      }
      return json({ error: error.message }, 500);
    }
    return json({ pick: mapPick(data) }, 201);
  }

  return json({ error: 'not found' }, 404);
};

export const config = {
  path: ['/api/picks', '/api/pick', '/api/my-pick', '/api/draws']
};
