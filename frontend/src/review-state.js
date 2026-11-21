
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
  if (item.due_date && item.due_date < meeting.date) issues.push('Deadline precedes the meeting date.');
  return issues;
}

/** F2: a shared group card ("Both receivers…") becomes one item per attendee. Each still needs approval. */
export function giveToEveryone(item, attendees, newId = () => globalThis.crypto.randomUUID()) {
  return attendees.map(playerId => ({
    ...item, id: newId(), player_id: playerId, scope: 'player', player_ids: undefined, group_record_id: undefined, display_group: undefined,
    match_method: 'team', mention: item.mention, confidence: item.confidence === 'low' ? 'medium' : item.confidence,
    warnings: ['Given to everyone in this meeting by the coach. Check it before approving.'],
  }));
}
/** Cards that can be given to everyone: not yet matched to one player, in a meeting with 2+ attendees. */
export const canGiveToEveryone = (item, meeting) => !item.player_id && !(item.scope === 'team' && item.player_ids?.length) && meeting.attendees.length > 1;

/** F5: "requires correction" notes disappear once every card is valid; other notes stay. */
const CORRECTION = /require[s]? correction|unmatched|invalid source|cannot be saved|^record \d+:/i;
export function visibleWarnings(warnings, draft, meeting) {
  const allValid = draft.length > 0 && draft.every(i => reviewIssues(i, meeting).length === 0);
  return allValid ? warnings.filter(w => !CORRECTION.test(w)) : warnings;
}

/** F1: the message shown instead of a second review of the same note. */
export function alreadySentText(meeting) {
  const day = (meeting.saved_at || meeting.date || '').slice(0, 10);
  return `Already sent to review on ${day}.`;
}
