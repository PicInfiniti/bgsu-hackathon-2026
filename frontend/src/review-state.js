import categories from '../../data/categories.json' with { type: 'json' };

export const appliesTo = (item, playerId) => item.player_id === playerId || item.player_ids?.includes(playerId);
export const reviewPriority = (item) => !item.player_id && !item.player_ids?.length ? 0 : ({low:1, medium:2, high:3}[item.confidence] ?? 2);
export const escapeText = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export function highlightSource(note, quote) {
  const start = quote ? note.indexOf(quote) : -1;
  return start < 0 ? escapeText(note) : `${escapeText(note.slice(0,start))}<mark>${escapeText(quote)}</mark>${escapeText(note.slice(start+quote.length))}`;
}
export function reviewIssues(item, meeting) {
  const issues = [];
  const shared = item.scope === 'team' && item.kind !== 'action' && item.player_ids?.length;
  if (!shared && !meeting.attendees.includes(item.player_id)) issues.push('Choose an attendee.');
  if (!item.text?.trim()) issues.push('Add the coach’s record.');
  if (!item.quote?.trim() || !meeting.note.includes(item.quote)) issues.push('Use a verbatim source quote from the note.');
  if (!categories.skills.includes(item.skill)) issues.push('Choose a football skill category.');
  if (!categories.topics.includes(item.topic)) issues.push('Choose a meeting topic.');
  if (item.due_date && item.due_date < meeting.date) issues.push('Deadline precedes the meeting date.');
  return issues;
}
