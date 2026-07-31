// מטא־נתונים של המשחקים לצד הלקוח
export const GAME_KEYS = ['lotto', 'chance', '777', '123'];

export const GAMES_UI = {
  lotto: {
    name: 'לוטו',
    emoji: '🎱',
    desc: '6 מספרים (1–37) + המספר החזק',
    schedule: 'הגרלות בימי שלישי ושבת ב־23:00'
  },
  chance: {
    name: "צ'אנס",
    emoji: '🃏',
    desc: 'קלף אחד לכל צורה',
    schedule: 'עד שבע הגרלות ביום'
  },
  '777': {
    name: '777',
    emoji: '🎰',
    desc: '7 מספרים (1–70) מול 17 שמוגרלים',
    schedule: 'שתי הגרלות ביום'
  },
  '123': {
    name: '123',
    emoji: '🔢',
    desc: '3 ספרות (0–9), הסדר קובע',
    schedule: 'הגרלה אחת ביום'
  }
};

// צ'אנס: סדר הצורות כפי שנשמר — תלתן, יהלום, לב, עלה
export const SUITS_UI = [
  { key: 'clubs', symbol: '♣', name: 'תלתן', red: false },
  { key: 'diamonds', symbol: '♦', name: 'יהלום', red: true },
  { key: 'hearts', symbol: '♥', name: 'לב', red: true },
  { key: 'spades', symbol: '♠', name: 'עלה', red: false }
];

// לוטו: חישוב מועד ההגרלה הבאה גם בלי שרת (שלישי ושבת, סגירת מכירה 22:45)
export function computeNextLottoClose(from = new Date()) {
  const d = new Date(from);
  for (let i = 0; i < 8; i++) {
    const day = d.getDay(); // 0=א' ... 2=ג' ... 6=שבת
    if (day === 2 || day === 6) {
      const close = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22, 45, 0);
      if (close > from) return close;
    }
    d.setDate(d.getDate() + 1);
  }
  return null;
}

// "01/08/2026" + "22:45" -> Date
export function parseNextDate(dateStr, timeStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  let hh = 0, mm = 0;
  if (timeStr) {
    const t = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (t) { hh = Number(t[1]); mm = Number(t[2]); }
  }
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, mm, 0);
}

export function formatMoney(n) {
  if (!n && n !== 0) return null;
  if (n >= 1000000) {
    const m = n / 1000000;
    return (Number.isInteger(m) ? m : m.toFixed(1)) + ' מיליון ₪';
  }
  return n.toLocaleString('he-IL') + ' ₪';
}
