// Date helpers reused from coach-dashboard-redesign’s Schedule. Dates are local "YYYY-MM-DD" strings.
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const addMonths = (s, n) => { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return iso(d); };
// Football weeks run Monday to Sunday.
export const weekStart = (s) => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
export const weekDays = (s) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(s), i));
export const monthStart = (s) => `${s.slice(0, 7)}-01`;
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/** Six-row Monday-first grid for the month containing s. Each cell: {date, inMonth}. */
export function monthGrid(s) {
  const first = monthStart(s);
  const start = weekStart(first);
  const [y, m] = s.split('-').map(Number);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    cells.push({ date, inMonth: date.slice(0, 7) === `${y}-${pad(m)}` });
  }
  return cells;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthTitle = (s) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
export const shortDate = (s) => parse(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
