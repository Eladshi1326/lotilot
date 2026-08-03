// יוצר את pais-raw.json — בדיוק באותו פורמט שהבוט ב-Apps Script כותב.
// שימושי לשני דברים: לבדוק את הפורמט מקומית, ולעדכן את הקובץ מהמחשב
// כשהבוט עוד לא מותקן (או אם הוא נופל).
//   הרצה: npm run pais-raw

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAMES, GAME_KEYS } from '../server/games.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'pais-raw.json');
const KEEP_LINES = 200; // חייב להתאים ל-KEEP_LINES שב-apps-script/Code.gs
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function grab(url, charset) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/csv,text/html,application/json,*/*',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      Referer: 'https://www.pais.co.il/'
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = await res.arrayBuffer();
  return new TextDecoder(charset || 'windows-1255').decode(buf);
}

const out = { updatedAt: new Date().toISOString(), source: 'local', csv: {}, next: {} };
const ok = [];
const bad = [];

for (const key of GAME_KEYS) {
  try {
    const text = await grab(GAMES[key].csv || GAMES[key].csvUrl);
    // הקובץ מהפיס ממוין מהחדש לישן — השורות הראשונות הן העדכניות
    out.csv[key] = text.replace(/^﻿/, '').split(/\r?\n/).slice(0, KEEP_LINES).join('\n');
    ok.push(key);
  } catch (e) {
    bad.push(key + ' (תוצאות): ' + e.message);
  }
  try {
    const raw = await grab(
      'https://www.pais.co.il/include/getNextLotteryDate.ashx?type=' + GAMES[key].nextType,
      'utf-8'
    );
    const it = JSON.parse(raw)[0];
    if (it && it.displayDate) {
      out.next[key] = {
        date: it.displayDate,
        time: it.displayTime || null,
        drawNumber: it.LotteryNumber || null,
        firstPrize: it.firstPrize || null,
        secondPrize: it.secondPrize || null
      };
    }
  } catch (e) {
    bad.push(key + ' (הגרלה הבאה): ' + e.message);
  }
}

if (ok.length === 0) {
  console.error('❌ הפיס לא ענה לאף בקשה:\n' + bad.join('\n'));
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log('✅ נכתב pais-raw.json — ' + ok.join(', ') + (bad.length ? '\n⚠️  ' + bad.join('\n') : ''));
