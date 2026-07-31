// לוטי לוט — השרת המקומי: כל המשחקים (לוטו, צ'אנס, 777, 123)
import express from 'express';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAMES, GAME_KEYS, isValidGame } from './games.mjs';
import { loadLive, mergeDraws, buildNext } from './live-merge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const PICKS_FILE = join(DATA_DIR, 'picks.json');
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3001;

mkdirSync(DATA_DIR, { recursive: true });

// ---------- אחסון כרטיסים ----------
let store = { seq: 0, picks: [] };
if (existsSync(PICKS_FILE)) {
  try {
    store = JSON.parse(readFileSync(PICKS_FILE, 'utf8'));
    if (!Array.isArray(store.picks)) store = { seq: 0, picks: [] };
    // כרטיסים מגרסה קודמת (בלי משחק) הם כרטיסי לוטו
    for (const p of store.picks) if (!p.game) p.game = 'lotto';
  } catch {
    console.warn('picks.json פגום — מתחיל מאפס');
    store = { seq: 0, picks: [] };
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = PICKS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(store), 'utf8');
    renameSync(tmp, PICKS_FILE);
  }, 100);
}

function publicPick(p) {
  return { id: p.id, game: p.game, name: p.name, numbers: p.numbers, strong: p.strong, ts: p.ts };
}

const app = express();
app.use(express.json());

// כל הכרטיסים (אפשר לסנן לפי משחק)
app.get('/api/picks', (req, res) => {
  const { game } = req.query;
  let picks = store.picks;
  if (game && isValidGame(game)) picks = picks.filter((p) => p.game === game);
  const counts = {};
  for (const key of GAME_KEYS) counts[key] = store.picks.filter((p) => p.game === key).length;
  res.json({
    count: picks.length,
    total: store.picks.length,
    counts,
    picks: [...picks].reverse().map(publicPick)
  });
});

// כל הכרטיסים שלי, לפי משחק
app.get('/api/my-picks', (req, res) => {
  const { clientId } = req.query;
  const mine = {};
  for (const key of GAME_KEYS) {
    const p = store.picks.find((x) => x.clientId === clientId && x.game === key);
    mine[key] = p ? publicPick(p) : null;
  }
  res.json({ picks: mine });
});

// מילוי כרטיס — פעם אחת לכל משתמש בכל משחק
app.post('/api/pick', (req, res) => {
  const { clientId } = req.body || {};
  let { name, game } = req.body || {};
  if (!clientId || typeof clientId !== 'string' || clientId.length > 64) {
    return res.status(400).json({ error: 'bad clientId' });
  }
  if (!game) game = 'lotto';
  if (!isValidGame(game)) return res.status(400).json({ error: 'bad game' });

  const existing = store.picks.find((p) => p.clientId === clientId && p.game === game);
  if (existing) {
    return res.status(409).json({ error: 'already picked', pick: publicPick(existing) });
  }
  if (typeof name !== 'string') name = '';
  name = name.replace(/[<>]/g, '').trim().slice(0, 20);

  const { numbers, strong } = GAMES[game].randomPick();
  const pick = { id: ++store.seq, clientId, game, name, numbers, strong, ts: Date.now() };
  store.picks.push(pick);
  save();
  res.status(201).json({ pick: publicPick(pick) });
});

function readJson(file, fallback) {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  } catch { /* פגום */ }
  return fallback;
}

// היסטוריית הגרלות אמיתית לפי משחק (כולל מה שהסוכן הביא)
app.get('/api/draws', async (req, res) => {
  const game = isValidGame(req.query.game) ? req.query.game : 'lotto';
  const base = readJson(join(DATA_DIR, 'history-' + game + '.json'), { game, updatedAt: null, count: 0, draws: [] });
  const live = await loadLive();
  const liveDraws = live && live.latest && live.latest[game] ? live.latest[game].draws : null;
  const draws = mergeDraws(base.draws, liveDraws).slice(0, GAMES[game].historyCap);
  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    game,
    updatedAt: (live && live.updatedAt) || base.updatedAt,
    source: liveDraws ? 'bot' : 'local',
    count: draws.length,
    draws
  });
});

// פרטי ההגרלות הבאות
app.get('/api/next', async (req, res) => {
  const bundled = readJson(join(DATA_DIR, 'next-info.json'), {});
  const live = await loadLive();
  const latestIdByGame = {};
  for (const key of GAME_KEYS) {
    const base = readJson(join(DATA_DIR, 'history-' + key + '.json'), { draws: [] });
    const fromLive = live && live.latest && live.latest[key] && live.latest[key].draws && live.latest[key].draws[0];
    const id = (fromLive && fromLive.id) || (base.draws[0] && base.draws[0].id);
    if (Number.isFinite(id)) latestIdByGame[key] = id;
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.json(buildNext(bundled, live, latestIdByGame));
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
