// לוטי לוט — שרת: שומר את הכרטיסים של כולם ומגיש את האתר
import express from 'express';
import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const PICKS_FILE = join(DATA_DIR, 'picks.json');
const HISTORY_FILE = join(DATA_DIR, 'lotto-history.json');
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3001;

mkdirSync(DATA_DIR, { recursive: true });

// ---------- אחסון כרטיסים ----------
let store = { seq: 0, picks: [] };
if (existsSync(PICKS_FILE)) {
  try {
    store = JSON.parse(readFileSync(PICKS_FILE, 'utf8'));
    if (!Array.isArray(store.picks)) store = { seq: 0, picks: [] };
  } catch {
    console.warn('picks.json פגום — מתחיל מאפס');
    store = { seq: 0, picks: [] };
  }
}

let saveTimer = null;
function save() {
  // כתיבה אטומית קטנה כדי לא לאבד נתונים באמצע כתיבה
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = PICKS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(store), 'utf8');
    renameSync(tmp, PICKS_FILE);
  }, 100);
}

// ---------- הגרלת מספרים (כמו לוטו: 6 מתוך 37 + מספר חזק 1-7) ----------
function drawNumbers() {
  const pool = Array.from({ length: 37 }, (_, i) => i + 1);
  const numbers = [];
  for (let i = 0; i < 6; i++) {
    numbers.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  numbers.sort((a, b) => a - b);
  return { numbers, strong: randomInt(1, 8) };
}

function publicPick(p) {
  // בלי לחשוף את clientId של אנשים אחרים
  return { id: p.id, name: p.name, numbers: p.numbers, strong: p.strong, ts: p.ts };
}

const app = express();
app.use(express.json());

// כל הכרטיסים (חדש -> ישן)
app.get('/api/picks', (req, res) => {
  res.json({
    count: store.picks.length,
    picks: [...store.picks].reverse().map(publicPick)
  });
});

// הכרטיס שלי (אם כבר מילאתי)
app.get('/api/my-pick', (req, res) => {
  const { clientId } = req.query;
  const mine = store.picks.find((p) => p.clientId === clientId);
  res.json({ pick: mine ? publicPick(mine) : null });
});

// לחיצה על הכרטיס — פעם אחת לכל משתמש
app.post('/api/pick', (req, res) => {
  const { clientId } = req.body || {};
  let { name } = req.body || {};
  if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
    return res.status(400).json({ error: 'bad clientId' });
  }
  const existing = store.picks.find((p) => p.clientId === clientId);
  if (existing) {
    return res.status(409).json({ error: 'already picked', pick: publicPick(existing) });
  }
  if (typeof name !== 'string') name = '';
  name = name.replace(/[<>]/g, '').trim().slice(0, 20);

  const { numbers, strong } = drawNumbers();
  const pick = {
    id: ++store.seq,
    clientId,
    name,
    numbers,
    strong,
    ts: Date.now()
  };
  store.picks.push(pick);
  save();
  res.status(201).json({ pick: publicPick(pick) });
});

// היסטוריית הגרלות אמיתית של מפעל הפיס
app.get('/api/draws', (req, res) => {
  if (!existsSync(HISTORY_FILE)) {
    return res.json({ updatedAt: null, count: 0, draws: [] });
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(HISTORY_FILE);
});

// הגשת האתר הבנוי (production) אם קיים
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log('לוטי לוט: השרת רץ על http://localhost:' + PORT);
});
