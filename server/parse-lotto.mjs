// פענוח קובץ ה־CSV של תוצאות הלוטו ממפעל הפיס
// משותף לסקריפט העדכון המקומי ולפונקציית ה־API ב־Netlify

export function parseLottoCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const draws = [];
  for (const line of lines) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length < 9) continue;
    const id = Number(cells[0]);
    if (!Number.isFinite(id)) continue; // מדלג על שורת הכותרת
    const numbers = cells.slice(2, 8).map(Number);
    if (numbers.some((n) => !Number.isFinite(n))) continue;
    draws.push({
      id,
      date: cells[1],
      numbers,
      strong: Number(cells[8]) || null,
      winners: cells[9] === '' || cells[9] === undefined ? null : Number(cells[9]),
      doubleWinners: cells[10] === '' || cells[10] === undefined ? null : Number(cells[10])
    });
  }
  return draws;
}
