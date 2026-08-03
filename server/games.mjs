// לוטי לוט — הגדרות כל המשחקים: פענוח תוצאות, הגרלת כרטיס, מחיר וחישוב זכייה
// משותף לשרת המקומי, לפונקציה בענן ולסוכן.
//
// המחירים והפרסים לקוחים מהתקנון הרשמי של מפעל הפיס (pais.co.il).
// חלק מפרסי הלוטו נקבעים לפי מחזור ההגרלה ולכן מסומנים כהערכה.

import { randomInt } from 'node:crypto';

export const CARD_VALUES = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades']; // תלתן, יהלום, לב, עלה

// תאריך בפורמט DD/MM/YYYY -> חותמת זמן, לצורך מיון נכון
export function drawTs(date) {
  if (typeof date !== 'string') return 0;
  const m = date.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return 0;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

// חשוב: מספרי ההגרלה של הלוטו התאפסו ב-1999 (הגרלה 9934 היא מ-1999!),
// לכן תמיד ממיינים לפי תאריך ולא לפי מספר ההגרלה.
export function sortDraws(draws) {
  return [...draws].sort((a, b) => {
    const d = drawTs(b.date) - drawTs(a.date);
    return d !== 0 ? d : b.id - a.id;
  });
}

// טבלת הזכיות הרשמית של ההגרלה (כמה זכו בכל מקום ובכמה) — נשלפת מהפיס על ידי הסוכן.
// אם היא קיימת, הסכום מדויק; אחרת נופלים להערכה על בסיס הגרלות אחרונות.
function officialTier(draw, key, table = 'prizes') {
  const list = draw && draw[table];
  if (!Array.isArray(list)) return null;
  const t = list.find((x) => x.key === key);
  return t && Number.isFinite(t.prize) ? t : null;
}

// מחיר הכרטיס בפועל — בלוטו יש שני סוגי טופס
export function priceOf(gameKey, variant) {
  const g = GAMES[gameKey];
  if (!g) return 0;
  if (g.variants && variant && g.variants[variant]) return g.variants[variant].price;
  return g.price;
}

// כמה טבלאות יש בטופס, וכמה כל טבלה שווה
export function tablesOf(gameKey, variant) {
  const v = GAMES[gameKey] && GAMES[gameKey].variants && GAMES[gameKey].variants[variant];
  return v && v.tables ? v.tables : 1;
}
export const isDoubleVariant = (variant) => String(variant || '').startsWith('double');

// כל הטבלאות של כרטיס (כרטיס ישן עם טבלה אחת עדיין נתמך)
export function tablesOfPick(pick) {
  if (Array.isArray(pick.tables) && pick.tables.length) return pick.tables;
  return [{ numbers: pick.numbers, strong: pick.strong }];
}

export const GAMES = {
  lotto: {
    key: 'lotto',
    name: 'לוטו',
    csvUrl: 'https://www.pais.co.il/lotto/lotto_resultsDownload.aspx',
    nextType: 1,
    historyCap: 5000,
    idFirst: true, // בלוטו: הגרלה,תאריך ; בשאר: תאריך,הגרלה
    schedule: 'הגרלות בימי שלישי ושבת ב־23:00',
    drawsPerDay: 1,
    price: 3, // ₪ לטבלה אחת (בפועל טופס מינימלי הוא 2 טבלאות = 6 ₪)
    priceNote: 'טבלה אחת בטופס רגיל',
    // טפסים אמיתיים לפי מחירון מפעל הפיס:
    // רגיל 3 ₪ לטבלה (2–14 טבלאות = 6–42 ₪) · דאבל 6 ₪ לטבלה (2–10 = 12–60 ₪)
    variants: {
      regular: { key: 'regular', label: 'לוטו רגיל', price: 6, tables: 2, hint: '2 טבלאות · 3 ₪ לטבלה' },
      regular6: { key: 'regular6', label: 'רגיל מורחב', price: 18, tables: 6, hint: '6 טבלאות · יותר סיכויים' },
      double: { key: 'double', label: 'דאבל לוטו', price: 12, tables: 2, hint: '2 טבלאות · פי 2 פרס' },
      double10: { key: 'double10', label: 'דאבל מלא', price: 60, tables: 10, hint: '10 טבלאות · הפרס המרבי' }
    },
    prizesExact: false, // פרסי הלוטו נקבעים לפי מחזור ההגרלה
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
    randomPick(variant) {
      const oneTable = () => {
        const pool = Array.from({ length: 37 }, (_, i) => i + 1);
        const numbers = [];
        for (let i = 0; i < 6; i++) numbers.push(pool.splice(randomInt(pool.length), 1)[0]);
        numbers.sort((a, b) => a - b);
        return { numbers, strong: randomInt(1, 8) };
      };
      const count = tablesOf('lotto', variant);
      const tables = Array.from({ length: count }, oneTable);
      // הטבלה הראשונה נשמרת גם בשדות הרגילים, לתאימות אחורה
      return { numbers: tables[0].numbers, strong: tables[0].strong, tables };
    },
    // 6 מתוך 37 + מספר חזק. אם יש טבלת זכיות רשמית — משתמשים בסכום האמיתי.
    evaluate(pick, draw) {
      const isDouble = isDoubleVariant(pick.variant);
      const table = isDouble ? 'prizesDouble' : 'prizes';
      const mult = isDouble ? 2 : 1; // בדאבל לוטו כל פרס כפול
      const all = tablesOfPick(pick);
      // מעריכים כל טבלה בנפרד וסוכמים — בדיוק כמו טופס אמיתי
      const results = all.map((t) => this.evaluateTable(t, draw, table, mult));
      const best = results.reduce((a, b) => (b.prize > a.prize ? b : a), results[0]);
      const totalPrize = results.reduce((sum, r) => sum + r.prize, 0);
      const winning = results.filter((r) => r.prize > 0).length;
      return {
        hits: best.hits,
        strongHit: best.strongHit,
        prize: totalPrize,
        winnersInTier: best.winnersInTier,
        label: best.label ? best.label + (winning > 1 ? ' ×' + winning : '') : null,
        exact: best.exact,
        perTable: results
      };
    },
    evaluateTable(t, draw, table, mult) {
      const hits = (t.numbers || []).filter((n) => draw.numbers.includes(n)).length;
      const strongHit = t.strong != null && t.strong === draw.strong;
      const tiers = [
        { need: 6, strong: true,  key: '6+s', est: 5000000, label: '6 + חזק' },
        { need: 6, strong: false, key: '6',   est: 750000,  label: '6 מספרים' },
        { need: 5, strong: true,  key: '5+s', est: 6000,    label: '5 + חזק' },
        { need: 5, strong: false, key: '5',   est: 900,     label: '5 מספרים' },
        { need: 4, strong: true,  key: '4+s', est: 180,     label: '4 + חזק' },
        { need: 4, strong: false, key: '4',   est: 60,      label: '4 מספרים' },
        { need: 3, strong: true,  key: '3+s', est: 45,      label: '3 + חזק' },
        { need: 3, strong: false, key: '3',   est: 10,      label: '3 מספרים' }
      ];
      for (const tier of tiers) {
        if (hits >= tier.need && (!tier.strong || strongHit)) {
          const official = officialTier(draw, tier.key, table);
          return {
            hits,
            strongHit,
            prize: official ? official.prize : tier.est * mult,
            winnersInTier: official ? official.winners : null,
            label: tier.label,
            exact: Boolean(official)
          };
        }
      }
      return { hits, strongHit, prize: 0, label: null, exact: true };
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
    drawsPerDay: 7,
    price: 5, // דמי השתתפות מינימליים ברב צ'אנס
    priceNote: 'רב צ׳אנס, השתתפות מינימלית',
    prizesExact: true, // הפרסים כפולה קבועה של דמי ההשתתפות
    parseRow(cells) {
      const cards = cells.slice(2, 6).map((c) => String(c).trim().toUpperCase());
      if (cards.length < 4 || cards.some((c) => !CARD_VALUES.includes(c))) return null;
      return { numbers: cards, strong: null };
    },
    randomPick() {
      return { numbers: SUITS.map(() => CARD_VALUES[randomInt(CARD_VALUES.length)]), strong: null };
    },
    // רב צ'אנס: 4 קלפים ×1000, 3 ×20, 2 ×2, קלף אחד ×0.5 מדמי ההשתתפות
    evaluate(pick, draw) {
      let hits = 0;
      for (let i = 0; i < 4; i++) if (pick.numbers[i] === draw.numbers[i]) hits++;
      const mult = { 4: 1000, 3: 20, 2: 2, 1: 0.5 }[hits] || 0;
      const labels = { 4: 'כל 4 הקלפים!', 3: '3 קלפים', 2: '2 קלפים', 1: 'קלף אחד' };
      return { hits, prize: mult * this.price, label: labels[hits] || null, exact: true };
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
    drawsPerDay: 2,
    price: 7, // עלות לצירוף
    priceNote: 'צירוף אחד',
    prizesExact: true, // הפרסים קבועים ואינם מתחלקים
    parseRow(cells) {
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
    },
    // 7 מסומנים מול 17 שהוגרלו — פרסים קבועים לגמרי
    evaluate(pick, draw) {
      const hits = pick.numbers.filter((n) => draw.numbers.includes(n)).length;
      const table = { 7: 70000, 6: 500, 5: 50, 4: 20, 3: 5, 0: 5 };
      const labels = { 7: 'כל 7 המספרים!', 6: '6 פגיעות', 5: '5 פגיעות', 4: '4 פגיעות', 3: '3 פגיעות', 0: 'אפס פגיעות (גם זה זוכה!)' };
      const official = officialTier(draw, String(hits));
      return {
        hits,
        prize: official ? official.prize : table[hits] || 0,
        winnersInTier: official ? official.winners : null,
        label: labels[hits] || null,
        exact: true
      };
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
    drawsPerDay: 1,
    price: 5, // סכום ההשתתפות לטבלה (ניתן לבחור 1–500 ₪)
    priceNote: 'סכום השתתפות נבחר',
    prizesExact: true, // פי 600 מסכום ההשתתפות
    parseRow(cells) {
      // בקובץ העמודות בסדר 3,2,1 — הופכים לסדר טבעי
      const raw = [cells[2], cells[3], cells[4]].map(Number);
      if (raw.some((n) => !Number.isFinite(n) || n < 0 || n > 9)) return null;
      const totalPrizes = cells[5] === '' || cells[5] === undefined ? null : Number(cells[5]);
      return { numbers: [raw[2], raw[1], raw[0]], strong: null, totalPrizes };
    },
    randomPick() {
      return { numbers: [randomInt(10), randomInt(10), randomInt(10)], strong: null };
    },
    // רק פגיעה מדויקת בשלוש הספרות ובסדר הנכון — פי 600
    evaluate(pick, draw) {
      const exactHit = pick.numbers.every((d, i) => d === draw.numbers[i]);
      const hits = pick.numbers.filter((d, i) => d === draw.numbers[i]).length;
      return {
        hits,
        prize: exactHit ? this.price * 600 : 0,
        label: exactHit ? 'פגיעה מדויקת!' : null,
        exact: true
      };
    }
  }
};

// סדר מפורש — לא Object.keys, כי JavaScript דוחף מפתחות שנראים כמו מספרים ('777','123') לראש
export const GAME_KEYS = ['lotto', 'chance', '777', '123'];

export function isValidGame(key) {
  return Object.prototype.hasOwnProperty.call(GAMES, key);
}

// פענוח CSV מלא של משחק: מחזיר רשימת הגרלות ממוינת מהחדשה לישנה
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
  return sortDraws(draws);
}

// חישוב זכייה של כרטיס מול תוצאת הגרלה
export function evaluatePick(pick, draw) {
  const game = GAMES[pick.game];
  if (!game || !draw || !Array.isArray(draw.numbers)) return null;
  const cost = priceOf(pick.game, pick.variant);
  const res = game.evaluate(pick, draw);
  return { ...res, cost, net: res.prize - cost };
}

// אילו מספרים בכרטיס פגעו — לסימון ויזואלי
// אילו מספרים פגעו בכל טבלה בטופס
export function matchedByTable(pick, draw) {
  if (!draw || !Array.isArray(draw.numbers)) return [];
  return tablesOfPick(pick).map((t) =>
    (t.numbers || []).map((v, i) => (draw.numbers.includes(v) ? i : -1)).filter((i) => i > -1)
  );
}

export function matchedIndexes(pick, draw) {
  if (!draw || !Array.isArray(draw.numbers) || !Array.isArray(pick.numbers)) return [];
  if (pick.game === 'chance' || pick.game === '123') {
    return pick.numbers.map((v, i) => (v === draw.numbers[i] ? i : -1)).filter((i) => i > -1);
  }
  return pick.numbers.map((v, i) => (draw.numbers.includes(v) ? i : -1)).filter((i) => i > -1);
}
