// מטא־נתונים של המשחקים לצד הלקוח
export const GAME_KEYS = ['lotto', 'chance', '777', '123'];

export const GAMES_UI = {
  lotto: {
    name: 'לוטו',
    emoji: '🎱',
    desc: '6 מספרים (1–37) + המספר החזק',
    schedule: 'הגרלות בימי שלישי ושבת ב־23:00',
    prizeHint: '3 מספרים = 10 ₪ · 6 + חזק = הקופה'
  },
  chance: {
    name: "צ'אנס",
    emoji: '🃏',
    desc: 'קלף אחד לכל צורה',
    schedule: 'עד שבע הגרלות ביום',
    prizeHint: 'קלף = ×0.5 · 2 = ×2 · 3 = ×20 · 4 = ×1000'
  },
  '777': {
    name: '777',
    emoji: '🎰',
    desc: '7 מספרים (1–70) מול 17 שמוגרלים',
    schedule: 'שתי הגרלות ביום',
    prizeHint: '0 או 3 פגיעות = 5 ₪ · 7 פגיעות = 70,000 ₪'
  },
  '123': {
    name: '123',
    emoji: '🔢',
    desc: '3 ספרות (0–9), הסדר קובע',
    schedule: 'הגרלה אחת ביום',
    prizeHint: 'פגיעה מדויקת = פי 600 מההשתתפות'
  }
};

// ההסבר הקבוע על המוח — מופיע בכל מקום שבו הוא מוזכר
export const AI_EXPLAIN =
  'המוח הוא שחקן מחשב: לכל הגרלה הוא ממלא כרטיס אקראי, בדיוק כמוך ובאותו מחיר. השאלה של הניסוי — מי מפסיד פחות: אתה או המזל שלו.';

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
  if (n === null || n === undefined) return null;
  if (Math.abs(n) >= 1000000) {
    const m = n / 1000000;
    return (Number.isInteger(m) ? m : m.toFixed(1)) + ' מיליון ₪';
  }
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('he-IL') + ' ₪';
}

// סכום עם סימן, לתצוגת רווח/הפסד
export function formatSigned(n) {
  if (n === null || n === undefined) return null;
  const s = formatMoney(Math.abs(n));
  return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
}

// לוח ההגרלות הרשמי של מפעל הפיס (שעון ישראל).
// א'–ה' = weekday, יום שישי/ערב חג = friday, מוצ"ש = saturday
export const DRAW_TIMES = {
  lotto:   { weekday: [], friday: [], saturday: ['23:15'], note: 'שלישי ושבת בסביבות 23:15' },
  chance:  {
    weekday: ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'],
    friday: ['10:00', '12:00', '14:00'],
    saturday: ['21:30', '23:30']
  },
  '777':   { weekday: ['13:30', '19:30'], friday: ['13:30'], saturday: ['21:30'] },
  '123':   { weekday: ['18:00'], friday: ['13:00'], saturday: ['21:30'] }
};

// שעות ההגרלה של היום לפי סוג היום
export function todayDrawTimes(game, date = new Date()) {
  const t = DRAW_TIMES[game];
  if (!t) return [];
  const day = date.getDay(); // 0=ראשון, 5=שישי, 6=שבת
  if (day === 5) return t.friday;
  if (day === 6) return t.saturday;
  return t.weekday;
}

// האם שעה מסוימת כבר עברה היום
export function timePassed(hhmm, date = new Date()) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  return date.getHours() * 60 + date.getMinutes() >= Number(m[1]) * 60 + Number(m[2]);
}
