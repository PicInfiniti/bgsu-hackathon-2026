// Red / amber / green player status. Colors are always paired with a word.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function statusChip(status) {
  if (!status) return '';
  return `<span class="status-chip ${status.color}" title="Coach-only status"><i aria-hidden="true"></i>${esc(status.label)}</span>`;
}

/** Same rules as the backend, for client-side previews and tests.
 *  Red: late homework. Amber: due within 2 days or no 1-on-1 in 21+ days. Green: all homework done. */
export function statusFor(rows, lastOneOnOne, today) {
  const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const late = rows.filter(r => !r.completed && r.due_date && r.due_date < today);
  if (late.length) return { color: 'red', label: 'Late' };
  const soon = rows.filter(r => !r.completed && r.due_date && r.due_date >= today && r.due_date <= addDays(today, 2));
  if (soon.length) { const first = soon.map(r => r.due_date).sort()[0]; return { color: 'amber', label: `Due ${new Date(`${first}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}` }; }
  if (!lastOneOnOne) return { color: 'amber', label: 'No 1-on-1 yet' };
  if (lastOneOnOne < addDays(today, -21)) return { color: 'amber', label: 'No 1-on-1 in 21+ days' };
  if (rows.length && rows.every(r => r.completed)) return { color: 'green', label: 'Done' };
  return { color: 'green', label: 'On track' };
}

/** Roster players named in a note by full name or unique first/last name or #jersey. */
export function matchPlayersInText(text, players) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const p of players) {
    const parts = [p.name, ...p.name.split(' ')];
    const unique = parts.filter(part => players.filter(o => o.name.split(' ').includes(part) || o.name === part).length === 1);
    if (unique.some(part => new RegExp(`(^|[^\\w#])${part.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`).test(lower)) || new RegExp(`#${p.number}(?!\\d)`).test(text)) found.add(p.id);
  }
  return [...found];
}
