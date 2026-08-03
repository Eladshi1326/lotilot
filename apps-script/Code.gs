/**
 * לוטי לוט — הבוט, גרסת Google Apps Script
 *
 * למה כאן ולא בגיטהאב: מפעל הפיס חוסם שרתי ענן של אמזון (Netlify) ושל מיקרוסופט
 * (GitHub Actions) ומחזיר להם HTTP 403. שרתי גוגל כן עוברים — ו-Apps Script רץ
 * על התשתית של גוגל, בחינם, בלי כרטיס אשראי.
 *
 * מה הוא עושה כל הרצה:
 *   1. מושך מהפיס את קובץ התוצאות של כל משחק (קידוד windows-1255)
 *   2. שומר רק את השורות האחרונות — הקבצים המלאים הם עד 1.4MB
 *   3. מושך את מועד ההגרלה הבאה לכל משחק
 *   4. דוחף הכול לגיטהאב לקובץ pais-raw.json
 * האתר קורא את הקובץ הזה ישירות מגיטהאב ומפענח אותו בעצמו — בלי בנייה מחדש.
 *
 * ===== התקנה =====
 * 1. script.google.com  ->  New project  ->  מדביקים את הקובץ הזה
 * 2. Project Settings -> Script Properties -> Add script property:
 *       GITHUB_TOKEN = הטוקן מגיטהאב (ראה למטה)
 *    את הטוקן שומרים *רק* כאן. לא בקוד, לא בצ'אט, לא בגיט.
 * 3. מריצים פעם אחת את הפונקציה testPais  ->  View -> Logs
 *    אם כתוב "הפיס עונה" — מצוין, ממשיכים. אם 403 — הפיס חוסם גם את גוגל.
 * 4. מריצים פעם אחת את updateLottery (יבקש הרשאות — מאשרים)
 * 5. Triggers (השעון בצד) -> Add Trigger:
 *       Function: updateLottery | Event source: Time-driven | Minutes timer: כל 15 דקות
 *
 * ===== הטוקן =====
 * github.com -> Settings -> Developer settings -> Personal access tokens
 *   -> Fine-grained tokens -> Generate new token
 *   Repository access: Only select repositories -> lotilot
 *   Permissions -> Repository permissions -> Contents: Read and write
 */

var REPO = 'Eladshi1326/lotilot';
var BRANCH = 'main';
var OUT_PATH = 'pais-raw.json';

var KEEP_LINES = 200; // כמה שורות לשמור מכל קובץ תוצאות (הקובץ ממוין מהחדש לישן)
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
         '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

var GAMES = {
  lotto:   { csv: 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx',   nextType: 1 },
  chance:  { csv: 'https://www.pais.co.il/chance/chance_resultsDownload.aspx', nextType: 3 },
  '777':   { csv: 'https://www.pais.co.il/777/777_resultsDownload.aspx',       nextType: 5 },
  '123':   { csv: 'https://www.pais.co.il/123/123_resultsDownload.aspx',       nextType: 4 }
};
var GAME_KEYS = ['lotto', 'chance', '777', '123'];

// ---------------------------------------------------------------- כלי עזר

function fetchPais_(url, charset) {
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
    validateHttpsCertificates: true,
    headers: {
      'User-Agent': UA,
      'Accept': 'text/csv,text/html,application/json,*/*',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      'Referer': 'https://www.pais.co.il/'
    }
  });
  var code = res.getResponseCode();
  if (code !== 200) throw new Error('HTTP ' + code);
  return res.getBlob().getDataAsString(charset || 'windows-1255');
}

// הקובץ מהפיס ממוין מההגרלה החדשה לישנה, אז השורות הראשונות הן העדכניות
function headLines_(text, n) {
  var lines = text.replace(/^﻿/, '').split(/\r?\n/);
  return lines.slice(0, n).join('\n');
}

// ---------------------------------------------------------------- גיטהאב

function githubToken_() {
  var t = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!t) throw new Error('חסר GITHUB_TOKEN ב-Script Properties');
  return t;
}

function githubApi_(path, method, payload) {
  var opts = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + githubToken_(),
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lotilot-apps-script'
    }
  };
  if (payload) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(payload);
  }
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + path, opts);
  return { code: res.getResponseCode(), body: res.getContentText() };
}

function currentSha_() {
  var r = githubApi_('/contents/' + OUT_PATH + '?ref=' + BRANCH, 'get');
  if (r.code === 404) return null;          // הקובץ עוד לא קיים — ניצור אותו
  if (r.code !== 200) throw new Error('GitHub GET ' + r.code + ': ' + r.body.slice(0, 200));
  return JSON.parse(r.body).sha;
}

function commitFile_(jsonString, message) {
  var body = {
    message: message,
    content: Utilities.base64Encode(jsonString, Utilities.Charset.UTF_8),
    branch: BRANCH
  };
  var sha = currentSha_();
  if (sha) body.sha = sha;
  var r = githubApi_('/contents/' + OUT_PATH, 'put', body);
  if (r.code !== 200 && r.code !== 201) {
    throw new Error('GitHub PUT ' + r.code + ': ' + r.body.slice(0, 300));
  }
}

// ---------------------------------------------------------------- הבוט

function updateLottery() {
  var out = { updatedAt: new Date().toISOString(), source: 'apps-script', csv: {}, next: {} };
  var ok = [];
  var bad = [];

  GAME_KEYS.forEach(function (key) {
    try {
      var text = fetchPais_(GAMES[key].csv);
      var trimmed = headLines_(text, KEEP_LINES);
      if (trimmed.split('\n').length < 3) throw new Error('קובץ ריק');
      out.csv[key] = trimmed;
      ok.push(key);
    } catch (e) {
      bad.push(key + ' (תוצאות): ' + e.message);
    }

    try {
      var raw = fetchPais_(
        'https://www.pais.co.il/include/getNextLotteryDate.ashx?type=' + GAMES[key].nextType,
        'UTF-8'
      );
      var arr = JSON.parse(raw);
      var it = arr && arr.length ? arr[0] : null;
      if (it && it.displayDate) {
        out.next[key] = {
          date: it.displayDate,
          time: it.displayTime || null,
          drawNumber: it.LotteryNumber || null,
          firstPrize: it.firstPrize || null,
          secondPrize: it.secondPrize || null
        };
      }
    } catch (e2) {
      bad.push(key + ' (הגרלה הבאה): ' + e2.message);
    }
  });

  if (ok.length === 0) {
    Logger.log('❌ לא התקבל שום מידע מהפיס. פירוט:\n' + bad.join('\n'));
    throw new Error('הפיס לא ענה לאף בקשה — ' + bad.join(' | '));
  }

  commitFile_(
    JSON.stringify(out, null, 2),
    'עדכון נתוני הפיס — ' + ok.join(', ') + ' [skip ci]'
  );

  Logger.log('✅ עודכן בגיטהאב. משחקים שנמשכו: ' + ok.join(', ') +
             (bad.length ? '\n⚠️ בעיות: ' + bad.join('\n') : ''));
}

// ---------------------------------------------------------------- בדיקות

/** מריצים פעם אחת כדי לבדוק אם הפיס בכלל עונה לשרתי גוגל */
function testPais() {
  var lines = [];
  GAME_KEYS.forEach(function (key) {
    try {
      var t = fetchPais_(GAMES[key].csv);
      var first = t.split(/\r?\n/)[1] || '';
      lines.push('✅ ' + key + ' — הפיס עונה. שורה אחרונה שהוגרלה: ' + first.slice(0, 60));
    } catch (e) {
      lines.push('❌ ' + key + ' — ' + e.message);
    }
  });
  Logger.log(lines.join('\n'));
  return lines.join('\n');
}

/** בודק שהטוקן של גיטהאב תקין ושיש לו הרשאת כתיבה */
function testGithub() {
  var r = githubApi_('', 'get');
  if (r.code !== 200) {
    Logger.log('❌ גיטהאב החזיר ' + r.code + ': ' + r.body.slice(0, 200));
    return;
  }
  var repo = JSON.parse(r.body);
  var canWrite = repo.permissions && repo.permissions.push;
  Logger.log((canWrite ? '✅' : '⚠️') + ' מחובר ל-' + repo.full_name +
             ' | הרשאת כתיבה: ' + (canWrite ? 'יש' : 'אין — צריך Contents: Read and write'));
}
