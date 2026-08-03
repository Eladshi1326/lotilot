// לוטי לוט — השרת המקומי. שומר כרטיסים בקובץ, ומשתמש באותה לוגיקה כמו הענן.
import express from 'express';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAMES, GAME_KEYS, isValidGame, sortDraws } from './games.mjs';
import { loadLive, mergeDraws, buildNext } from './live-merge.mjs';
import { buildState, submitPick } from './api-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const PICKS_FILE = join(DATA_DIR, 'picks.json');
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = process.env.PORT || 3001;

mkdirSync(DATA_DIR, { recursive: true });

// ---------- מחסן כרטיסים מבוסס קובץ ----------
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
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = PICKS_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(store), 'utf8');
    renameSync(tmp, PICKS_FILE);
  }, 100);
}

function makeRow(p) {
  return {
    id: ++store.seq,
    clientId: p.clientId,
    game: p.game,
    drawId: p.drawId,
    variant: p.variant || 'regular',
    tables: p.tables || null,
    name: p.name || '',
    numbers: p.numbers,
    strong: p.strong ?? null,
    ts: Date.now()
  };
}

const fileStore = {
  async picksInWindow(game, minDrawId) {
    return store.picks.filter((p) => p.game === game && p.drawId >= minDrawId);
  },
  async picksByClient(clientId) {
    return store.picks.filter((p) => p.clientId === clientId).slice(-200);
  },
  async findPick(clientId, game, drawId) {
    return store.picks.find((x) => x.clientId === clientId && x.game === game && x.drawId === drawId) || null;
  },
  async insert(p) {
    const existing = store.picks.find(
      (x) => x.clientId === p.clientId && x.game === p.game && x.drawId === p.drawId
    );
    if (existing) return { conflict: true, pick: existing };
    const row = makeRow(p);
    store.picks.push(row);
    save();
    return { pick: row };
  },
  async insertMany(rows) {
    const added = [];
    for (const p of rows) {
      const r = await this.insert(p);
      if (r.pick && !r.conflict) added.push(r.pick);
    }
    return added;
  }
};

// ---------- נתוני הגרלות ----------
function readJson(file, fallback) {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  } catch { /* פגום */ }
  return fallback;
}

async function loadDrawsAndNext() {
  const live = await loadLive();
  const drawsByGame = {};
  const latestIdByGame = {};
  for (const key of GAME_KEYS) {
    const base = readJson(join(DATA_DIR, 'history-' + key + '.json'), { draws: [] });
    const liveDraws = live && live.latest && live.latest[key] ? live.latest[key].draws : null;
    const merged = mergeDraws(base.draws, liveDraws).slice(0, GAMES[key].historyCap);
    drawsByGame[key] = merged;
    if (merged[0]) latestIdByGame[key] = merged[0].id;
  }
  const nextInfo = buildNext(readJson(join(DATA_DIR, 'next-info.json'), {}), live, latestIdByGame);
  return { drawsByGame, nextInfo, live };
}

// חיתוך לעמוד אחד + חיפוש לפי מספר הגרלה או תאריך
export function pageDraws(all, game, q) {
  const limit = Math.min(Math.max(Number(q.limit) || 10, 1), 100);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const term = (q.q || '').trim();
  const filtered = term
    ? all.filter((d) => String(d.id).includes(term) || String(d.date).includes(term))
    : all;
  return {
    game,
    total: filtered.length,
    totalAll: all.length,
    offset,
    limit,
    draws: filtered.slice(offset, offset + limit)
  };
}

const app = express();
app.use(express.json());

// המצב המלא של עמוד משחק
app.get('/api/state', async (req, res) => {
  try {
    const game = isValidGame(req.query.game) ? req.query.game : 'lotto';
    const { drawsByGame, nextInfo, live } = await loadDrawsAndNext();
    const state = await buildState({
      store: fileStore,
      drawsByGame,
      nextInfo,
      game,
      clientId: req.query.clientId || ''
    });
    res.setHeader('Cache-Control', 'no-cache');
    res.json({ ...state, next: nextInfo, dataUpdatedAt: live && live.updatedAt ? live.updatedAt : null, botUpdatedAt: live && live.botUpdatedAt ? live.botUpdatedAt : null });
  } catch (err) {
    res.status(500).json({ error: 'server error: ' + err.message });
  }
});

// מילוי כרטיס
app.post('/api/pick', async (req, res) => {
  try {
    const { drawsByGame, nextInfo } = await loadDrawsAndNext();
    const r = await submitPick({ store: fileStore, drawsByGame, nextInfo, body: req.body });
    res.status(r.status).json(r.data);
  } catch (err) {
    res.status(500).json({ error: 'server error: ' + err.message });
  }
});

// היסטוריית הגרלות — מוגשת בעמודים קטנים כדי לא לשלוח אלפי שורות בכל טעינה
app.get('/api/draws', async (req, res) => {
  const game = isValidGame(req.query.game) ? req.query.game : 'lotto';
  const { drawsByGame } = await loadDrawsAndNext();
  res.setHeader('Cache-Control', 'no-cache');
  res.json(pageDraws(sortDraws(drawsByGame[game] || []), game, req.query));
});

// מועדי ההגרלות הבאות
app.get('/api/next', async (req, res) => {
  const { nextInfo } = await loadDrawsAndNext();
  res.setHeader('Cache-Control', 'no-cache');
  res.json(nextInfo);
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
