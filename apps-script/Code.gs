/**
 * לוטי לוט — הבוט, גרסה 2: רץ רק סביב שעות ההגרלות.
 *
 * הטריגר בגוגל עדיין מעיר את הסקריפט כל 15 דקות, אבל הקוד בודק קודם
 * אם אנחנו בתוך "חלון הגרלה" (משעת ההגרלה ועד 75 דקות אחריה). אם לא —
 * הוא יוצא מיד, בלי שום פנייה לרשת. ככה אין עדכונים מיותרים בלילה
 * ובשעות המתות, ובכל זאת שום תוצאה לא מתפספסת.
 *
 * פעם ביום (05:30–06:45) יש סנכרון מלא של כל המשחקים — רשת ביטחון
 * למקרה של חג, שינוי בלוח, או חלון שנכשל.
 *
 * לוח ההגרלות (שעון ישראל, מהאתר הרשמי):
 *   לוטו: שלישי ושבת 23:15 · צ'אנס: א'-ה' 9,11,13,15,17,19,21, שישי 10,12,14,
 *   מוצ"ש 21:30+23:30 · 777: א'-ה' 13:30+19:30, שישי 13:30, מוצ"ש 21:30 ·
 *   123: א'-ה' 18:00, שישי 13:00, מוצ"ש 21:30
 */

var REPO = 'Eladshi1326/lotilot';
var BRANCH = 'main';
var OUT_PATH = 'pais-raw.json';
var TZ = 'Asia/Jerusalem';

var KEEP_LINES = 200;     // כמה שורות תוצאות לשמור לכל משחק
var WINDOW_MIN = 75;      // כמה דקות אחרי שעת ההגרלה עוד מנסים למשוך
var DAILY_SYNC = '05:30'; // סנכרון מלא יומי (עד 06:45)

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
         '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

var GAMES = {
  lotto:   { csv: 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx',   nextType: 1 },
  chance:  { csv: 'https://www.pais.co.il/chance/chance_resultsDownload.aspx', nextType: 3 },
  '777':   { csv: 'https://www.pais.co.il/777/777_resultsDownload.aspx',       nextType: 5 },
  '123':   { csv: 'https://www.pais.co.il/123/123_resultsDownload.aspx',       nextType: 4 }
};
var GAME_KEYS = ['lotto', 'chance', '777', '123'];

// לוח שעות לפי יום בשבוע. מפתח היום בפורמט ISO: 1=שני ... 5=שישי, 6=שבת, 7=ראשון
var WEEKDAY_CHANCE = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];
var SCHEDULE = {
  lotto:  { 2: ['23:15'], 6: ['23:15'] }, // שלישי ושבת
  chance: {
    7: WEEKDAY_CHANCE, 1: WEEKDAY_CHANCE, 2: WEEKDAY_CHANCE, 3: WEEKDAY_CHANCE, 4: WEEKDAY_CHANCE,
    5: ['10:00', '12:00', '14:00'],
    6: ['21:30', '23:30']
  },
  '777': {
    7: ['13:30', '19:30'], 1: ['13:30', '19:30'], 2: ['13:30', '19:30'], 3: ['13:30', '19:30'], 4: ['13:30', '19:30'],
    5: ['13:30'],
    6: ['21:30']
  },
  '123': {
    7: ['18:00'], 1: ['18:00'], 2: ['18:00'], 3: ['18:00'], 4: ['18:00'],
    5: ['13:00'],
    6: ['21:30']
  }
};

// ---------------------------------------------------------------- חלונות זמן

function minutesOf_(hhmm) {
  var p = hhmm.split(':');
  return Number(p[0]) * 60 + Number(p[1]);
}

// אילו משחקים נמצאים עכשיו בתוך חלון הגרלה. בודק גם חלונות שנפתחו אתמול
// ונמשכים אחרי חצות (כמו לוטו 23:15 שחלונו נגמר ב-00:30).
function activeGames_(now) {
  var isoDay = Number(Utilities.formatDate(now, TZ, 'u')); // 1=שני ... 7=ראשון
  var yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  var isoYesterday = Number(Utilities.formatDate(yesterday, TZ, 'u'));
  var nowMin = minutesOf_(Utilities.formatDate(now, TZ, 'HH:mm'));

  // סנכרון יומי מלא — כל המשחקים
  var syncStart = minutesOf_(DAILY_SYNC);
  if (nowMin - syncStart >= 0 && nowMin - syncStart <= WINDOW_MIN) {
    return { games: GAME_KEYS.slice(), reason: 'סנכרון יומי מלא' };
  }

  var active = [];
  for (var i = 0; i < GAME_KEYS.length; i++) {
    var key = GAME_KEYS[i];
    var times = (SCHEDULE[key][isoDay] || []).map(minutesOf_)
      .concat((SCHEDULE[key][isoYesterday] || []).map(function (t) { return minutesOf_(t) - 1440; }));
    for (var j = 0; j < times.length; j++) {
      var since = nowMin - times[j];
      if (since >= 0 && since <= WINDOW_MIN) { active.push(key); break; }
    }
  }
  return { games: active, reason: active.join(', ') };
}

// ---------------------------------------------------------------- הפיס

function fetchPais_(url, charset) {
  var res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    followRedirects: true,
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

function headLines_(text, n) {
  return text.replace(/^﻿/, '').split(/\r?\n/).slice(0, n).join('\n');
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

// הקובץ הנוכחי מגיטהאב — מעדכנים רק את המשחקים שנמשכו ושומרים את השאר
function currentFile_() {
  var r = githubApi_('/contents/' + OUT_PATH + '?ref=' + BRANCH, 'get');
  if (r.code === 404) return { sha: null, data: null };
  if (r.code !== 200) throw new Error('GitHub GET ' + r.code + ': ' + r.body.slice(0, 200));
  var body = JSON.parse(r.body);
  var data = null;
  try {
    data = JSON.parse(
      Utilities.newBlob(Utilities.base64Decode(body.content.replace(/\n/g, ''))).getDataAsString('UTF-8')
    );
  } catch (e) { /* קובץ פגום — נבנה חדש */ }
  return { sha: body.sha, data: data };
}

function commitFile_(sha, jsonString, message) {
  var body = {
    message: message,
    content: Utilities.base64Encode(jsonString, Utilities.Charset.UTF_8),
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  var r = githubApi_('/contents/' + OUT_PATH, 'put', body);
  if (r.code !== 200 && r.code !== 201) {
    throw new Error('GitHub PUT ' + r.code + ': ' + r.body.slice(0, 300));
  }
}

// ---------------------------------------------------------------- הבוט

function updateLottery() {
  var now = new Date();
  var win = activeGames_(now);

  if (win.games.length === 0) {
    Logger.log('🌙 מחוץ לחלונות ההגרלות (' + Utilities.formatDate(now, TZ, 'EEE HH:mm') +
               ' שעון ישראל) — אין מה למשוך, יוצא בשקט.');
    return; // בלי לזרוק שגיאה — שלא יגיעו מיילים על "כשל"
  }

  Logger.log('⏰ חלון פעיל: ' + win.reason);

  var current = currentFile_();
  var out = current.data || { csv: {}, next: {} };
  if (!out.csv) out.csv = {};
  if (!out.next) out.next = {};
  out.updatedAt = now.toISOString();
  out.source = 'apps-script';

  var ok = [];
  var bad = [];

  win.games.forEach(function (key) {
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
        'https://www.pais.co.il/include/getNextLotteryDate.ashx?type=' + GAMES[key].nextType, 'UTF-8'
      );
      var it = JSON.parse(raw)[0];
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
    throw new Error('הפיס לא ענה לאף בקשה בחלון פעיל — ' + bad.join(' | '));
  }

  commitFile_(
    current.sha,
    JSON.stringify(out, null, 2),
    'עדכון נתוני הפיס — ' + ok.join(', ') + ' [skip ci]'
  );
  Logger.log('✅ עודכן בגיטהאב: ' + ok.join(', ') +
             (bad.length ? '\n⚠️ בעיות: ' + bad.join('\n') : ''));
}

// ---------------------------------------------------------------- בדיקות

/** מצב החלונות עכשיו + מתי החלון הבא — בלי לפנות לרשת בכלל */
function testSchedule() {
  var now = new Date();
  var win = activeGames_(now);
  var lines = [
    'עכשיו (שעון ישראל): ' + Utilities.formatDate(now, TZ, 'EEEE HH:mm'),
    win.games.length
      ? '⏰ חלון פעיל — ימשוך: ' + win.games.join(', ')
      : '🌙 מחוץ לחלונות — הרצה עכשיו יוצאת בלי לעשות כלום'
  ];
  for (var m = 5; m <= 36 * 60; m += 5) {
    var t = new Date(now.getTime() + m * 60000);
    var w = activeGames_(t);
    if (w.games.length) {
      lines.push('החלון הבא: ' + Utilities.formatDate(t, TZ, 'EEEE HH:mm') + ' — ' + w.games.join(', '));
      break;
    }
  }
  Logger.log(lines.join('\n'));
  return lines.join('\n');
}

/** בודק שהפיס עונה לשרתי גוגל */
function testPais() {
  var lines = [];
  GAME_KEYS.forEach(function (key) {
    try {
      var t = fetchPais_(GAMES[key].csv);
      lines.push('✅ ' + key + ' — הפיס עונה: ' + (t.split(/\r?\n/)[1] || '').slice(0, 50));
    } catch (e) {
      lines.push('❌ ' + key + ' — ' + e.message);
    }
  });
  Logger.log(lines.join('\n'));
  return lines.join('\n');
}

/** בודק שהטוקן של גיטהאב תקין */
function testGithub() {
  var r = githubApi_('', 'get');
  if (r.code !== 200) {
    Logger.log('❌ גיטהאב החזיר ' + r.code + ': ' + r.body.slice(0, 200));
    return;
  }
  var repo = JSON.parse(r.body);
  var canWrite = repo.permissions && repo.permissions.push;
  Logger.log((canWrite ? '✅' : '⚠️') + ' מחובר ל-' + repo.full_name +
             ' | הרשאת כתיבה: ' + (canWrite ? 'יש' : 'אין'));
}
