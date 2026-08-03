// לוטי לוט — עדכון והעלאה בלחיצה אחת. רץ על המחשב, מופעל מ"הרץ אותי.cmd".
//
// למה הקוד כאן ולא בתוך קובץ ה-cmd עצמו: חלונות שובר קבצי batch שיש בהם
// עברית (בעיית קידוד ידועה — שורות נחתכות באמצע ומקוטעי טקסט הופכים
// ל"פקודות"). Node מדפיס עברית בלי שום בעיה, אז קובץ ה-cmd נשאר באנגלית
// בלבד וכל ההיגיון יושב כאן.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(ROOT, '.git', 'index.lock');
const he = (b) => (b ? 'כן' : 'לא');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let paisOk = false;
let commitOk = false;
let pushOk = false;
let problem = null;
let remoteHead = null;
let dirty = '';

// הנעילה של git נשארת תקועה אם תהליך קודם נקטע — מוחקים אותה לפני כל פקודה
function unlock() {
  try { if (existsSync(LOCK)) rmSync(LOCK, { force: true }); } catch { /* לא נורא */ }
}

function git(args, live = false) {
  unlock();
  const r = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: live ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe']
  });
  if (r.error && r.error.code === 'ENOENT') throw new Error('git-missing');
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function runScript(name) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', name)], { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0;
}

console.log('');
console.log('  ============================================');
console.log('    לוטי לוט — עדכון והעלאה');
console.log('  ============================================');
console.log('');

try {
  console.log('  [1/4] מושך תוצאות עדכניות ממפעל הפיס...');
  runScript('update-data.mjs');
  paisOk = runScript('make-pais-raw.mjs') && existsSync(join(ROOT, 'pais-raw.json'));

  console.log('  [2/4] שומר את השינויים...');
  let added = false;
  for (let i = 0; i < 4 && !added; i++) {
    added = git(['add', '-A']).ok;
    if (!added) { console.log('        הנעילה של git חסמה — מנסה שוב...'); sleep(2000); }
  }
  if (!added) {
    problem = 'git add נכשל גם אחרי 4 ניסיונות (index.lock חוזר)';
  } else {
    if (git(['status', '--porcelain']).out) {
      const c = git(['commit', '-m', 'עדכון מהמחשב — ' + new Date().toLocaleString('he-IL')]);
      if (!c.ok) problem = 'git commit נכשל: ' + c.out.slice(0, 200);
    }
    dirty = git(['status', '--porcelain']).out;
    commitOk = dirty === '';
    if (!commitOk && !problem) problem = 'נשארו קבצים שלא נשמרו';
  }

  console.log('  [3/4] מעלה לגיטהאב...');
  let p = git(['push', 'origin', 'main'], true);
  if (!p.ok) {
    console.log('        ההעלאה נכשלה — מושך קודם ואז מנסה שוב...');
    git(['pull', '--rebase', 'origin', 'main'], true);
    p = git(['push', 'origin', 'main'], true);
  }

  console.log('  [4/4] בודק שההעלאה באמת הגיעה לגיטהאב...');
  const localHead = git(['rev-parse', 'HEAD']).out.slice(0, 40);
  const ls = git(['ls-remote', 'origin', 'main']);
  remoteHead = ls.ok && ls.out ? ls.out.split(/\s+/)[0] : null;
  pushOk = Boolean(localHead) && localHead === remoteHead;
  if (!pushOk && !problem) {
    problem = remoteHead
      ? 'מה שאצלך במחשב שונה ממה שבגיטהאב'
      : 'לא הצלחתי לקרוא מגיטהאב — אולי אין אינטרנט או שגיטהאב מבקש התחברות';
  }
} catch (e) {
  problem = e.message === 'git-missing'
    ? 'git לא מותקן — להוריד מ: https://git-scm.com/download/win'
    : 'שגיאה לא צפויה: ' + e.message;
}

let lastLocal = '';
try { lastLocal = git(['log', '--oneline', '-1']).out; } catch { /* git חסר */ }

console.log('');
console.log('  ------------------------------------------------------------');
console.log('  דוח לוטי לוט');
console.log('  ------------------------------------------------------------');
console.log('  נתונים מהפיס ירדו:  ' + he(paisOk));
console.log('  השינויים נשמרו:     ' + he(commitOk));
console.log('  ההעלאה לגיטהאב:     ' + he(pushOk));
if (problem) console.log('  בעיה:               ' + problem);
console.log('  הקומיט אצלך:        ' + (lastLocal || '—'));
console.log('  הקומיט בגיטהאב:     ' + (remoteHead ? remoteHead.slice(0, 7) : '—'));
console.log('  קבצים שלא נשמרו:    ' + (dirty ? '\n' + dirty : 'אין — הכל נשמר'));
console.log('  ------------------------------------------------------------');
console.log('');
console.log(pushOk
  ? '  הכל עלה! האתר: https://lotilot.netlify.app'
  : '  משהו לא הושלם — תעתיק לקלוד את הדוח שלמעלה (סימון עם העכבר ואז Enter).');
console.log('');
process.exit(pushOk ? 0 : 1);
