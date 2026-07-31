// לוטי לוט — הגדרות כל המשחקים: פענוח CSV, הגרלת כרטיס רנדומלי, ולידציה
// משותף לשרת המקומי, לפונקציית הענן ולסקריפט העדכון

import { randomInt } from 'node:crypto';

export const CARD_VALUES = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']; // תלתן, יהלום, לב, עלה

export const GAMES = {
  lotto: {
    key: 'lotto',
    name: 'לוטו',
    csvUrl: 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx',
    nextType: 1,
    historyCap: 5000,
    idFirst: true, // בלוטו: הגרלה,תאריך ; בשאר: תאריך,הגרלה
    schedule: 'הגרלות בימי שלישי ושבת ב־23:00',
    parseRow(cells) {
      const numbers = cells.slice(2, 8).map(Number);
      if (numbers.some((n) => !Number.isFinite(n))) return null;
      return {
        numbers,
        strong: Number(cells[8]) || null,
        winners: cells[9] === '' || cells[9] === undefined ? null : Number(cells[9]),
        doubleWinners: cells[10] === '' || cells[10] === undefined ? null : Number(cells[10])
      };
    },
    randomPick() {
      const pool = Array.from({ length: 37 }, (_, i) => i + 1);
      const numbers = [];
      for (let i = 0; i < 6; i++) numbers.push(pool.splice(randomInt(pool.length), 1)[0]);
      numbers.sort((a, b) => a - b);
      return { numbers, strong: randomInt(1, 8) };
    }
  },

  chance: {
    key: 'chance',
    name: "צ'אנס",
    csvUrl: 'https://www.pais.co.il/chance/chance_resultsDownload.aspx',
    nextType: 3,
    historyCap: 4000,
    idFirst: false,
    schedule: 'שבע הגרלות ביום ברוב ימות השבוע',
    parseRow(cells) {
      // תלתן, יהלום, לב, עלה
      const cards = cells.slice(2, 6).map((c) => String(c).trim().toUpperCase());
      if (cards.length < 4 || cards.some((c) => !CARD_VALUES.includes(c))) return null;
      return { numbers: cards, strong: null };
    },
    randomPick() {
      return { numbers: SUITS.map(() => CARD_VALUES[randomInt(CARD_VALUES.length)]), strong: null };
    }
  },

  '777': {
    key: '777',
    name: 'פיס 777',
    csvUrl: 'https://www.pais.co.il/777/777_resultsDownload.aspx',
    nextType: 5,
    historyCap: 3000,
    idFirst: false,
    schedule: 'שתי הגרלות ביום ברוב ימות השבוע',
    parseRow(cells) {
      // 17 מספרים מוגרלים מתוך 1-70; השחקן מסמן 7
      const numbers = cells.slice(2, 19).map(Number);
      if (numbers.length < 17 || numbers.some((n) => !Number.isFinite(n))) return null;
      const winners = cells[19] === '' || cells[19] === undefined ? null : Number(cells[19]);
      return { numbers, strong: null, winners };
    },
    randomPick() {
      const pool = Array.from({ length: 70 }, (_, i) => i + 1);
      const numbers = [];
      for (let i = 0; i < 7; i++) numbers.push(pool.splice(randomInt(pool.length), 1)[0]);
      numbers.sort((a, b) => a - b);
      return { numbers, strong: null };
    }
  },

  '123': {
    key: '123',
    name: '123',
    csvUrl: 'https://www.pais.co.il/123/123_resultsDownload.aspx',
    nextType: 4,
    historyCap: 3000,
    idFirst: false,
    schedule: 'הגרלה אחת ביום',
    parseRow(cells) {
      // בקובץ העמודות בסדר 3,2,1 — הופכים לסדר טבעי: ספרה 1, ספרה 2, ספרה 3
      const raw = [cells[2], cells[3], cells[4]].map(Number);
      if (raw.some((n) => !Number.isFinite(n) || n < 0 || n > 9)) return null;
      const totalPrizes = cells[5] === '' || cells[5] === undefined ? null : Number(cells[5]);
      return { numbers: [raw[2], raw[1], raw[0]], strong: null, totalPrizes };
    },
    randomPick() {
      return { numbers: [randomInt(10), randomInt(10), randomInt(10)], strong: null };
    }
  }
};

export const GAME_KEYS = Object.keys(GAMES);

export function isValidGame(key) {
  return Object.prototype.hasOwnProperty.call(GAMES, key);
}

// פענוח CSV מלא של משחק: מחזיר רשימת הגרלות (חדש -> ישן, כמו בקובץ)
export function parseGameCsv(gameKey, text) {
  const game = GAMES[gameKey];
  if (!game) return [];
  const lines = text.trim().split(/\r?\n/);
  const draws = [];
  for (const line of lines) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length < 5) continue;
    const idCell = game.idFirst ? cells[0] : cells[1];
    const dateCell = game.idFirst ? cells[1] : cells[0];
    const id = Number(idCell);
    if (!Number.isFinite(id)) continue; // שורת כותרת
    const parsed = game.parseRow(cells);
    if (!parsed) continue;
    draws.push({ id, date: dateCell, ...parsed });
  }
  return draws;
}
