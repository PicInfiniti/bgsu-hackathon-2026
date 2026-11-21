// Pure date helpers for the Schedule. Dates are local "YYYY-MM-DD" strings.
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

export function clockLabel(startAt) {
  const [h, m] = startAt.slice(11, 16).split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${suffix}`;
}

// Game week labels. Offsets are days relative to game day.
export const WEEK_LABELS = { '-5': 'Recovery', '-4': 'Install', '-3': 'Install', '-2': 'Polish', '-1': 'Walk-through', 0: 'Game day', 1: 'Review' };
export function dayLabel(s, gameDay = 'saturday', overrides = {}) {
  if (overrides[s]) return overrides[s];
  const game = gameDay === 'friday' ? 5 : 6;
  const day = parse(s).getDay();
  let offset = day - game;
  if (offset < -5) offset += 7;
  if (offset > 1) offset -= 7;
  return WEEK_LABELS[offset] ?? 'Off day';
}

export const HOURS = Array.from({ length: 15 }, (_, i) => 7 + i); // 7 AM to 9 PM

/** Vertical position (in hour units from 7 AM) and height for a timed event. */
export function slotFor(startAt, durationMin) {
  const [h, m] = startAt.slice(11, 16).split(':').map(Number);
  const top = Math.max(0, h + m / 60 - 7);
  const end = Math.min(15, h + m / 60 + durationMin / 60 - 7);
  return { top, height: Math.max(0.4, end - top) };
}

/** Next event of a type on or after now ("Next game"). Items must be sorted by start_at. */
export function nextOfType(items, type, nowIso) {
  return items.find(e => e.type === type && e.start_at && e.start_at >= nowIso) || null;
}

/** Case-insensitive search across event and note titles; returns matches sorted by date. */
export function searchItems(items, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter(i => { const hay = `${i.title} ${i.type} ${i.note || ''} ${i.audience || ''}`.toLowerCase(); return words.every(w => hay.includes(w)); })
    .sort((a, b) => a.date.localeCompare(b.date));
}
