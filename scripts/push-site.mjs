// לוטי לוט — עדכון והעלאה בלחיצה אחת (גרסה 3). רץ על המחשב, מופעל מ"הרץ אותי.cmd".
//
// מה חדש בגרסה 3:
//   · מחלץ לבד rebase שנתקע באמצע (כולל שחזור הקומיט שלא הוחל)
//   · מגן על עצמו: אם ביטול ה-rebase מחזיר גרסה ישנה של הקובץ הזה — הוא כותב
//     את עצמו מחדש מהזיכרון, כדי שהגרסה הנכונה תישמר בקומיט הבא
//   · האימות בסוף מזהה מצב תקוע ולא מדווח "הצלחה" בטעות
//   · pais-raw.json שייך לבוט בגוגל — תמיד נלקח מגיטהאב, אף פעם לא נוצר כאן

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const VERSION = 3;
const SELF = fileURLToPath(import.meta.url);
const SELF_SRC = readFileSync(SELF, 'utf8'); // התוכן שלי, לשחזור אחרי rebase --abort

const ROOT = join(dirname(SELF), '..');
const LOCK = join(ROOT, '.git', 'index.lock');
const BOT_FILE = 'pais-raw.json';

const he = (b) => (b ? 'כן' : 'לא');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

let paisOk = false;
let commitOk = false;
let pushOk = false;
let problem = null;
let remoteHead = null;
let dirty = '';

function unlock() {
  try { if (existsSync(LOCK)) rmSync(LOCK, { force: true }); } catch { /* לא נורא */ }
}

function git(args, live = false) {
  unlock();
  const r = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, GIT_EDITOR: 'true' },
    stdio: live ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe']
  });
  if (r.error && r.error.code === 'ENOENT') throw new Error('git-missing');
  return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim() };
}

function runScript(name) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', name)], { cwd: ROOT, stdio: 'inherit' });
  return r.status === 0;
}

// אחרי rebase --abort גיט מחזיר את כל הקבצים לגרסה השמורה — כולל אותי.
// אם זה קרה, כותבים את הגרסה הזו (שכבר רצה מהזיכרון) בחזרה לדיסק.
function restoreSelf() {
  try {
    if (readFileSync(SELF, 'utf8') !== SELF_SRC) {
      writeFileSync(SELF, SELF_SRC, 'utf8');
      console.log('        (הקובץ שלי הוחזר לגרסה ישנה — כתבתי את גרסה ' + VERSION + ' בחזרה)');
    }
  } catch { /* לא קריטי */ }
}

// rebase שנקטע באמצע חוסם הכל ומשאיר את גיט "תלוי באוויר" — מבטלים ומתחילים נקי
function clearStaleGitState() {
  const gitDir = join(ROOT, '.git');
  if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) {
    console.log('        נמצא rebase תקוע מריצה קודמת — מבטל ומתחיל נקי...');
    if (!git(['rebase', '--abort']).ok) {
      for (const d of ['rebase-merge', 'rebase-apply']) {
        try { rmSync(join(gitDir, d), { recursive: true, force: true }); } catch { /* לא נורא */ }
      }
      // אם הביטול לא עבד, מוודאים שאנחנו לפחות חזרה על הענף
      git(['checkout', 'main']);
    }
    restoreSelf();
  }
  try { rmSync(join(gitDir, 'MERGE_HEAD'), { force: true }); } catch { /* לא נורא */ }
  // אם משום מה נשארנו במצב "ראש מנותק" — חוזרים לענף בלי לאבד כלום
  if (!git(['symbolic-ref', '-q', 'HEAD']).ok) {
    console.log('        גיט היה במצב מנותק — חוזר לענף main...');
    git(['checkout', 'main']);
    restoreSelf();
  }
}

// משיכה עם rebase; התנגשות על הקובץ של הבוט נפתרת אוטומטית לטובת גיטהאב
function pullRebase() {
  let r = git(['pull', '--rebase', 'origin', 'main'], true);
  for (let i = 0; i < 6 && !r.ok; i++) {
    const conflicts = git(['diff', '--name-only', '--diff-filter=U']).out
      .split('\n').map((s) => s.trim()).filter(Boolean);
    if (conflicts.length > 0 && conflicts.every((f) => f === BOT_FILE)) {
      console.log('        התנגשות על ' + BOT_FILE + ' — לוקח את הגרסה של הבוט מגיטהאב');
      git(['checkout', '--ours', '--', BOT_FILE]); // ב-rebase, "ours" = מה שבגיטהאב
      git(['add', BOT_FILE]);
      r = git(['rebase', '--continue'], true);
    } else {
      break;
    }
  }
  if (!r.ok) { git(['rebase', '--abort']); restoreSelf(); }
  return r.ok;
}

console.log('');
console.log('  ============================================');
console.log('    לוטי לוט — עדכון והעלאה (גרסה ' + VERSION + ')');
console.log('  ============================================');
console.log('');

try {
  clearStaleGitState();

  console.log('  [1/4] מושך תוצאות עדכניות ממפעל הפיס...');
  paisOk = runScript('update-data.mjs');
  // pais-raw.json שייך לבוט — לוקחים את הגרסה שלו מגיטהאב, לא מייצרים מקומית
  if (git(['fetch', 'origin', 'main']).ok) {
    if (git(['ls-tree', 'origin/main', '--', BOT_FILE]).out) {
      git(['checkout', 'origin/main', '--', BOT_FILE]);
    }
  }

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
  // הבוט דוחף לגיטהאב סביב שעות ההגרלות, אז לרוב צריך למשוך קודם
  pullRebase();
  let p = git(['push', 'origin', 'main'], true);
  if (!p.ok) {
    console.log('        ההעלאה נכשלה — מושך שוב ומנסה שוב...');
    if (pullRebase()) p = git(['push', 'origin', 'main'], true);
  }

  console.log('  [4/4] בודק שההעלאה באמת הגיעה לגיטהאב...');
  const gitDir = join(ROOT, '.git');
  const midRebase = existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'));
  const onBranch = git(['symbolic-ref', '-q', 'HEAD']).ok;
  if (midRebase || !onBranch) {
    // בלי זה, באמצע rebase ההשוואה משווה את הקומיט של גיטהאב לעצמו ומשקרת "הצלחה"
    pushOk = false;
    problem = 'גיט נשאר תקוע באמצע מיזוג — תריץ את הקובץ הזה שוב והוא ישחרר את זה';
  } else {
    const localHead = git(['rev-parse', 'HEAD']).out.slice(0, 40);
    const ls = git(['ls-remote', 'origin', 'main']);
    remoteHead = ls.ok && ls.out ? ls.out.split(/\s+/)[0] : null;
    pushOk = Boolean(localHead) && localHead === remoteHead;
    if (!pushOk && !problem) {
      problem = remoteHead
        ? 'מה שאצלך במחשב שונה ממה שבגיטהאב'
        : 'לא הצלחתי לקרוא מגיטהאב — אולי אין אינטרנט או שגיטהאב מבקש התחברות';
    }
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
console.log('  דוח לוטי לוט (גרסה ' + VERSION + ')');
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
